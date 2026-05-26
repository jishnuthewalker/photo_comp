pub mod startup_check;
pub mod render_pipeline;

use std::path::PathBuf;
use tauri::Manager;

pub fn ffmpeg_binary(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    let target = env!("TARGET");
    let name = format!("binaries/ffmpeg-{target}");
    let path = app
        .path()
        .resolve(&name, tauri::path::BaseDirectory::Resource)?;
    Ok(path)
}
