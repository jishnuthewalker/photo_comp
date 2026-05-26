use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMeta {
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub photos: Vec<PhotoMeta>,
    pub heic_paths: Vec<String>,
}

#[tauri::command]
pub async fn import_images(_paths: Vec<String>, _thumb_size: u32) -> Result<ImportResult, String> {
    Ok(ImportResult { photos: vec![], heic_paths: vec![] })
}
