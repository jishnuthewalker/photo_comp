use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use crate::ffmpeg::render_pipeline::{render_chunk, build_concat_list, PhotoItem, CHUNK_SIZE, estimate_bytes};

// ── Cancel flags ─────────────────────────────────────────────────────────────

static CANCEL_FLAGS: std::sync::OnceLock<Arc<Mutex<HashMap<String, bool>>>> =
    std::sync::OnceLock::new();

fn cancel_flags() -> Arc<Mutex<HashMap<String, bool>>> {
    CANCEL_FLAGS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

fn is_cancelled(render_id: &str) -> bool {
    cancel_flags().lock().unwrap().get(render_id).copied().unwrap_or(false)
}

// ── Active child registry (for killable cancel on Windows) ───────────────────

static ACTIVE_CHILDREN: std::sync::OnceLock<Arc<Mutex<HashMap<String, std::process::Child>>>> =
    std::sync::OnceLock::new();

fn active_children() -> Arc<Mutex<HashMap<String, std::process::Child>>> {
    ACTIVE_CHILDREN.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

// ── Serde types ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRenderItem {
    pub path: String,
    pub frame_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderConfig {
    pub render_id: String,
    pub output_path: String,
    pub photos: Vec<PhotoRenderItem>,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub crop_ratio: String,
    pub transition: String,
    pub song_path: Option<String>,
    pub first_beat_offset_ms: f64,
    pub total_duration_s: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderProgress {
    pub chunk_index: usize,
    pub total_chunks: usize,
    pub frames_encoded: u32,
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Async Tauri command — offloads all blocking work to a dedicated OS thread
/// so the Tokio worker pool is never starved.
#[tauri::command]
pub async fn render_video(
    app: tauri::AppHandle,
    config: RenderConfig,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || render_video_sync(app, config))
        .await
        .map_err(|e| e.to_string())?
}

fn render_video_sync(app: tauri::AppHandle, config: RenderConfig) -> Result<String, String> {
    // Fix 4: guard against empty photo list
    if config.photos.is_empty() {
        return Err("No photos to render".to_string());
    }

    let required = estimate_bytes(config.total_duration_s, config.width, config.height, config.fps);
    let output_dir = Path::new(&config.output_path).parent().unwrap_or(Path::new("."));
    let has_space = crate::commands::disk::check_disk_space(
        output_dir.to_string_lossy().into_owned(),
        required,
    )?;
    if !has_space {
        return Err(format!("Not enough disk space. Estimated: {}MB required.", required / 1_000_000));
    }

    let ffmpeg = crate::ffmpeg::ffmpeg_binary(&app).map_err(|e| e.to_string())?;
    let work_dir = std::env::temp_dir().join(format!("photocomp-{}", config.render_id));
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    cancel_flags().lock().unwrap().insert(config.render_id.clone(), false);

    // Helper: clean up workdir and cancel flag on any exit path
    let cleanup = |render_id: &str, work_dir: &std::path::Path| {
        cancel_flags().lock().unwrap().remove(render_id);
        std::fs::remove_dir_all(work_dir).ok();
    };

    let photos: Vec<PhotoItem> = config.photos.iter().map(|p| PhotoItem {
        path: PathBuf::from(&p.path),
        frame_count: p.frame_count,
    }).collect();

    let chunks: Vec<&[PhotoItem]> = photos.chunks(CHUNK_SIZE).collect();
    let total_chunks = chunks.len();
    let mut chunk_paths: Vec<PathBuf> = Vec::new();
    let mut frames_encoded: u32 = 0;
    let children = active_children();

    let (crop_w, crop_h) = crate::ffmpeg::render_pipeline::crop_dimensions(
        config.width, config.height, &config.crop_ratio,
    );

    for (i, chunk) in chunks.iter().enumerate() {
        if is_cancelled(&config.render_id) {
            cleanup(&config.render_id, &work_dir);
            return Err("cancelled".to_string());
        }
        let chunk_path = work_dir.join(format!("chunk_{i:04}.mp4"));
        render_chunk(
            &ffmpeg, chunk, config.fps, crop_w, crop_h,
            &chunk_path, &config.render_id, &children,
        )
        .map_err(|e| {
            // Fix 5: cleanup on chunk error / cancellation
            cleanup(&config.render_id, &work_dir);
            e.to_string()
        })?;
        chunk_paths.push(chunk_path);
        frames_encoded += chunk.iter().map(|p| p.frame_count).sum::<u32>();
        app.emit("render_progress", RenderProgress {
            chunk_index: i,
            total_chunks,
            frames_encoded,
        }).ok();
    }

    let concat_file = work_dir.join("concat.txt");
    std::fs::write(&concat_file, build_concat_list(&chunk_paths)).map_err(|e| {
        cleanup(&config.render_id, &work_dir);
        e.to_string()
    })?;

    // Final mux (concat + optional audio) — also register child for killability
    let mut cmd = std::process::Command::new(&ffmpeg);
    cmd.args(["-y", "-f", "concat", "-safe", "0", "-i"]);
    cmd.arg(&concat_file);

    if let Some(song) = &config.song_path {
        let offset_s = config.first_beat_offset_ms / 1000.0;
        cmd.args(["-ss", &offset_s.to_string(), "-i", song]);
        cmd.args(["-c:v", "copy", "-c:a", "aac", "-t", &config.total_duration_s.to_string()]);
    } else {
        cmd.args(["-c:v", "copy"]);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped());
    cmd.arg(&config.output_path);

    let mux_id = format!("{}-mux", config.render_id);
    let mux_child = cmd.spawn().map_err(|e| {
        cleanup(&config.render_id, &work_dir);
        e.to_string()
    })?;
    children.lock().unwrap().insert(mux_id.clone(), mux_child);

    // Poll mux child outside the lock
    let mux_status = loop {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let mut reg = children.lock().unwrap();
        match reg.get_mut(&mux_id) {
            None => {
                // Killed by cancel_render
                cleanup(&config.render_id, &work_dir);
                return Err("cancelled".to_string());
            }
            Some(c) => match c.try_wait() {
                Err(e) => {
                    reg.remove(&mux_id);
                    cleanup(&config.render_id, &work_dir);
                    return Err(e.to_string());
                }
                Ok(Some(status)) => {
                    reg.remove(&mux_id);
                    break status;
                }
                Ok(None) => {} // still running
            },
        }
    };

    if !mux_status.success() {
        cleanup(&config.render_id, &work_dir);
        return Err(format!("FFmpeg mux failed (exit {:?})", mux_status.code()));
    }

    // Fix 6: cleanup on success path too (workdir + cancel flag)
    cleanup(&config.render_id, &work_dir);
    Ok(config.output_path.clone())
}

#[tauri::command]
pub async fn cancel_render(render_id: String) -> Result<(), String> {
    cancel_flags().lock().unwrap().insert(render_id.clone(), true);

    // Fix 2: kill any active FFmpeg child (chunk or mux) on Windows
    {
        let children = active_children();
        let mut reg = children.lock().unwrap();
        // Kill main chunk child
        if let Some(mut child) = reg.remove(&render_id) {
            child.kill().ok();
        }
        // Kill mux child if present
        let mux_id = format!("{render_id}-mux");
        if let Some(mut child) = reg.remove(&mux_id) {
            child.kill().ok();
        }
    }

    // Best-effort workdir removal (may now succeed since process is killed)
    let work_dir = std::env::temp_dir().join(format!("photocomp-{render_id}"));
    std::fs::remove_dir_all(&work_dir).ok();
    Ok(())
}
