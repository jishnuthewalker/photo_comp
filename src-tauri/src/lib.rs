mod commands;
mod ffmpeg;
mod image;

pub use commands::import::import_images;
pub use commands::import::convert_heic;
pub use commands::render::{render_video, cancel_render};
pub use commands::disk::check_disk_space;
pub use ffmpeg::startup_check::check_ffmpeg;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            import_images,
            render_video,
            cancel_render,
            check_disk_space,
            check_ffmpeg,
            convert_heic,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
