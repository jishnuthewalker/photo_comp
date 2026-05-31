use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

pub const CHUNK_SIZE: usize = 50;

pub fn estimate_bytes(duration_s: f64, _width: u32, height: u32, _fps: u32) -> u64 {
    let bitrate_bps: u64 = if height >= 2160 { 20_000_000 }
        else if height >= 1080 { 8_000_000 }
        else { 4_000_000 };
    ((bitrate_bps as f64 / 8.0) * duration_s * 2.5) as u64
}

pub struct PhotoItem {
    pub path: PathBuf,
    pub frame_count: u32,
}

pub fn crop_dimensions(width: u32, height: u32, crop_ratio: &str) -> (u32, u32) {
    let even = |n: u32| (n / 2) * 2;
    match crop_ratio {
        "16:9" => {
            let h = even(height);
            let w = even((h * 16 / 9).min(width));
            (w, h)
        }
        "9:16" => {
            let h = even(height);
            let w = even((h * 9 / 16).min(width));
            (w, h)
        }
        "1:1" => {
            let s = even(width.min(height));
            (s, s)
        }
        "4:3" => {
            let h = even(height);
            let w = even((h * 4 / 3).min(width));
            (w, h)
        }
        _ => (even(width), even(height)),
    }
}

pub fn build_filter_complex(n: usize, width: u32, height: u32) -> String {
    let scales: String = (0..n)
        .map(|i| format!(
            "[{i}:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,format=yuv420p[v{i}]"
        ))
        .collect::<Vec<_>>()
        .join(";");
    let inputs: String = (0..n).map(|i| format!("[v{i}]")).collect::<Vec<_>>().join("");
    format!("{scales};{inputs}concat=n={n}:v=1:a=0[out]")
}

pub fn render_chunk(
    ffmpeg: &Path,
    photos: &[PhotoItem],
    fps: u32,
    width: u32,
    height: u32,
    output: &Path,
    render_id: &str,
    child_registry: &Arc<Mutex<HashMap<String, std::process::Child>>>,
) -> anyhow::Result<()> {
    let mut cmd = Command::new(ffmpeg);
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    for item in photos {
        let duration_s = item.frame_count as f64 / fps as f64;
        cmd.args(["-loop", "1", "-framerate", &fps.to_string(),
                  "-t", &format!("{duration_s:.6}"), "-i"]);
        cmd.arg(&item.path);
    }

    let filter = build_filter_complex(photos.len(), width, height);
    cmd.args(["-filter_complex", &filter,
              "-map", "[out]", "-r", &fps.to_string(),
              "-c:v", "libx264", "-pix_fmt", "yuv420p",
              "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-y"]);
    cmd.arg(output);

    // Spawn without blocking — register child so cancel_render can kill it
    let child = cmd.spawn()?;
    child_registry.lock().unwrap().insert(render_id.to_string(), child);

    // Poll outside the lock so cancel_render can acquire it to kill the process
    loop {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let mut reg = child_registry.lock().unwrap();
        match reg.get_mut(render_id) {
            None => {
                // Removed by cancel_render after killing — treat as cancelled
                return Err(anyhow::anyhow!("cancelled"));
            }
            Some(c) => match c.try_wait()? {
                Some(status) => {
                    let ok = status.success();
                    reg.remove(render_id);
                    if ok {
                        return Ok(());
                    } else {
                        return Err(anyhow::anyhow!("FFmpeg chunk failed (exit {:?})", status.code()));
                    }
                }
                None => {} // still running — continue polling
            },
        }
    }
}

pub fn render_chunk_crossfade(
    ffmpeg: &Path,
    photos: &[PhotoItem],
    fps: u32,
    width: u32,
    height: u32,
    output: &Path,
    render_id: &str,
    child_registry: &Arc<Mutex<HashMap<String, std::process::Child>>>,
) -> anyhow::Result<()> {
    if photos.len() < 2 {
        return render_chunk(ffmpeg, photos, fps, width, height, output, render_id, child_registry);
    }
    let mut cmd = Command::new(ffmpeg);
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    for item in photos {
        cmd.args(["-loop", "1", "-vframes", &item.frame_count.to_string(), "-r", &fps.to_string(), "-i"]);
        cmd.arg(&item.path);
    }

    let n = photos.len();
    let fade_frames = (fps / 4).max(1); // 25% of one beat, min 1 frame
    let fade_dur = fade_frames as f64 / fps as f64;

    // Build scale filters
    let scales: String = (0..n)
        .map(|i| format!("[{i}:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,format=yuv420p[s{i}]"))
        .collect::<Vec<_>>().join(";");

    // Chain xfade filters
    // xfade offset = time in merged output where the fade starts
    // After each merge, output duration shrinks by fade_dur
    let mut xfade_parts: Vec<String> = Vec::new();
    let mut merged_duration = 0f64;
    let mut last_label = "[s0]".to_string();

    for i in 0..(n - 1) {
        let dur_i = photos[i].frame_count as f64 / fps as f64;
        merged_duration += dur_i;
        let fade_start = merged_duration - fade_dur;
        let out_label = if i == n - 2 { "[out]".to_string() } else { format!("[x{i}]") };
        let next_label = format!("[s{}]", i + 1);
        xfade_parts.push(format!(
            "{last_label}{next_label}xfade=transition=dissolve:duration={fade_dur:.4}:offset={fade_start:.4}{out_label}"
        ));
        last_label = if i == n - 2 { "[out]".to_string() } else { format!("[x{i}]") };
        merged_duration -= fade_dur;
    }

    let filter = format!("{scales};{}", xfade_parts.join(";"));

    cmd.args(["-filter_complex", &filter,
              "-map", "[out]", "-r", &fps.to_string(),
              "-c:v", "libx264", "-pix_fmt", "yuv420p",
              "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-y"]);
    cmd.arg(output);

    // Same spawn+poll pattern as render_chunk for cancellation support
    let child = cmd.spawn()?;
    child_registry.lock().unwrap().insert(render_id.to_string(), child);

    loop {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let mut reg = child_registry.lock().unwrap();
        match reg.get_mut(render_id) {
            None => return Err(anyhow::anyhow!("cancelled")),
            Some(c) => match c.try_wait()? {
                Some(status) => {
                    let ok = status.success();
                    reg.remove(render_id);
                    if ok {
                        return Ok(());
                    } else {
                        return Err(anyhow::anyhow!("FFmpeg crossfade chunk failed (exit {:?})", status.code()));
                    }
                }
                None => {}
            },
        }
    }
}

/// Run a blocking FFmpeg command and surface stderr on failure.
fn run_ffmpeg_blocking(mut cmd: Command) -> anyhow::Result<()> {
    let out = cmd.output()?;
    if out.status.success() { return Ok(()); }
    let msg = String::from_utf8_lossy(&out.stderr);
    let tail = if msg.len() > 600 { &msg[msg.len()-600..] } else { &msg };
    Err(anyhow::anyhow!("{}", tail))
}

/// Stack transition: sequential composition — each photo is overlaid on an accumulated PNG,
/// then that PNG is rendered as a video segment. Segments are concatenated at the end.
pub fn render_stack(
    ffmpeg: &Path,
    photos: &[PhotoItem],
    fps: u32,
    width: u32,
    height: u32,
    output: &Path,
    render_id: &str,
    child_registry: &Arc<Mutex<HashMap<String, std::process::Child>>>,
) -> anyhow::Result<()> {
    if photos.is_empty() {
        return Err(anyhow::anyhow!("No photos"));
    }
    if photos.len() == 1 {
        return render_chunk(ffmpeg, photos, fps, width, height, output, render_id, child_registry);
    }

    let scale_bg = format!("scale={width}:{height},setsar=1,format=yuv420p");
    let scale_fg = format!(
        "scale={width}:{height}:force_original_aspect_ratio=decrease,\
         pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
    );

    // Work dir alongside the output file
    let work_dir = output.parent().unwrap_or(Path::new("."))
        .join(format!("stack_{render_id}"));
    std::fs::create_dir_all(&work_dir)?;

    let mk_cmd = |ffmpeg: &Path| -> Command {
        let mut c = Command::new(ffmpeg);
        c.stdout(Stdio::null());
        #[cfg(target_os = "windows")]
        { use std::os::windows::process::CommandExt; c.creation_flags(0x08000000); }
        c
    };

    // Build initial composed PNG: black background + photo 0
    let mut composed = work_dir.join("c0000.png");
    {
        let mut cmd = mk_cmd(ffmpeg);
        cmd.args(["-i"]).arg(&photos[0].path);
        let f = format!("color=black:size={width}x{height}:rate=1[bg];\
            [0:v]{scale_fg}[fg];[bg][fg]overlay=0:0[out]");
        cmd.args(["-filter_complex", &f, "-map", "[out]", "-pix_fmt", "rgb24", "-vframes", "1", "-y"])
           .arg(&composed);
        run_ffmpeg_blocking(cmd)
            .map_err(|e| { std::fs::remove_dir_all(&work_dir).ok(); e })?;
    }

    let mut seg_paths: Vec<PathBuf> = Vec::new();

    for (i, item) in photos.iter().enumerate() {
        // Render segment: loop composed PNG for this photo's duration
        let seg = work_dir.join(format!("s{i:04}.mp4"));
        let dur = item.frame_count as f64 / fps as f64;
        {
            let mut cmd = mk_cmd(ffmpeg);
            cmd.args(["-framerate", &fps.to_string(), "-loop", "1",
                      "-t", &format!("{dur:.6}"), "-i"]).arg(&composed);
            cmd.args(["-vf", &scale_bg, "-r", &fps.to_string(),
                      "-c:v", "libx264", "-pix_fmt", "yuv420p",
                      "-colorspace", "bt709", "-color_primaries", "bt709",
                      "-color_trc", "bt709", "-y"]).arg(&seg);
            run_ffmpeg_blocking(cmd)
                .map_err(|e| { std::fs::remove_dir_all(&work_dir).ok(); e })?;
        }
        seg_paths.push(seg);

        // Compose next photo on top of current composed image (skip after last)
        if i + 1 < photos.len() {
            let next = work_dir.join(format!("c{:04}.png", i + 1));
            let mut cmd = mk_cmd(ffmpeg);
            cmd.args(["-i"]).arg(&composed)
               .args(["-i"]).arg(&photos[i + 1].path);
            let f = format!("[0:v]{scale_bg}[bg];[1:v]{scale_fg}[fg];[bg][fg]overlay=0:0[out]");
            cmd.args(["-filter_complex", &f, "-map", "[out]", "-pix_fmt", "rgb24", "-vframes", "1", "-y"])
               .arg(&next);
            run_ffmpeg_blocking(cmd)
                .map_err(|e| { std::fs::remove_dir_all(&work_dir).ok(); e })?;
            composed = next;
        }
    }

    // Concat all segments → output
    let concat_txt = work_dir.join("concat.txt");
    std::fs::write(&concat_txt, build_concat_list(&seg_paths))?;

    let mut cmd = mk_cmd(ffmpeg);
    cmd.stderr(Stdio::piped());
    cmd.args(["-y", "-f", "concat", "-safe", "0", "-i"]).arg(&concat_txt)
       .args(["-c:v", "copy"]).arg(output);

    let child = cmd.spawn()?;
    child_registry.lock().unwrap().insert(render_id.to_string(), child);
    loop {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let mut reg = child_registry.lock().unwrap();
        match reg.get_mut(render_id) {
            None => { std::fs::remove_dir_all(&work_dir).ok(); return Err(anyhow::anyhow!("cancelled")); }
            Some(c) => match c.try_wait()? {
                Some(status) => {
                    let ok = status.success();
                    reg.remove(render_id);
                    std::fs::remove_dir_all(&work_dir).ok();
                    return if ok { Ok(()) } else {
                        Err(anyhow::anyhow!("FFmpeg stack concat failed (exit {:?})", status.code()))
                    };
                }
                None => {}
            },
        }
    }
}

pub fn build_concat_list(chunk_paths: &[PathBuf]) -> String {
    chunk_paths.iter()
        .map(|p| format!("file '{}'\n", p.to_string_lossy().replace('\\', "/")))
        .collect()
}
