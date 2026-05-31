pub mod startup_check;
pub mod render_pipeline;

use std::path::PathBuf;
use tauri::Manager;

pub fn ffmpeg_binary(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    // Bundled binary is always the GNU build regardless of compile toolchain
    #[cfg(target_os = "windows")]
    let name = "binaries/ffmpeg-x86_64-pc-windows-gnu";
    #[cfg(not(target_os = "windows"))]
    let name = format!("binaries/ffmpeg-{}", env!("TARGET"));
    let path = app
        .path()
        .resolve(name, tauri::path::BaseDirectory::Resource)?;
    Ok(dunce::simplified(&path).to_path_buf())
}
