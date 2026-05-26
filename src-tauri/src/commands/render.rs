use serde::Deserialize;

#[derive(Deserialize)]
pub struct RenderConfig {
    pub output_path: String,
    pub photos: Vec<PhotoRenderItem>,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub transition: String,
    pub song_path: Option<String>,
    pub first_beat_offset_ms: f64,
    pub total_duration_s: f64,
}

#[derive(Deserialize)]
pub struct PhotoRenderItem {
    pub path: String,
    pub frame_count: u32,
}

#[tauri::command]
pub async fn render_video(_config: RenderConfig, _window: tauri::WebviewWindow) -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
pub async fn cancel_render(_render_id: String) -> Result<(), String> {
    Ok(())
}
