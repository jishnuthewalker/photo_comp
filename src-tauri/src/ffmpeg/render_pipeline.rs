use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

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

    let out = cmd.output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(anyhow::anyhow!("FFmpeg chunk failed: {stderr}"));
    }
    Ok(())
}

pub fn build_concat_list(chunk_paths: &[PathBuf]) -> String {
    chunk_paths.iter()
        .map(|p| format!("file '{}'\n", p.to_string_lossy().replace('\\', "/")))
        .collect()
}
