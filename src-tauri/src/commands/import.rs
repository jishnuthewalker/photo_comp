use std::path::PathBuf;
use serde::Serialize;
use tauri::Manager;
use crate::image::thumbnail::generate_thumbnails;
use crate::image::heic::detect_heic;

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
pub async fn import_images(
    app: tauri::AppHandle,
    paths: Vec<String>,
    thumb_size: u32,
) -> Result<ImportResult, String> {
    if thumb_size == 0 {
        return Err("thumb_size must be > 0".into());
    }

    let thumb_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let path_bufs: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();

    // D: single-pass partition into heic / processable
    let (heic_vec, processable): (Vec<PathBuf>, Vec<PathBuf>) =
        path_bufs.into_iter().partition(|p| detect_heic(p));

    let heic_paths: Vec<String> = heic_vec
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    // D: offload CPU/IO onto blocking thread pool (mirrors render.rs)
    let results = tauri::async_runtime::spawn_blocking(move || {
        generate_thumbnails(&processable, thumb_size, &thumb_dir)
    })
    .await
    .map_err(|e| e.to_string())?;

    let photos = results.into_iter().map(|r| PhotoMeta {
        original_path: r.original_path,
        thumb_path: r.thumb_path,
        width: r.width,
        height: r.height,
    }).collect();

    Ok(ImportResult { photos, heic_paths })
}

#[tauri::command]
pub async fn convert_heic(
    app: tauri::AppHandle,
    heic_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let thumb_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let ffmpeg = crate::ffmpeg::ffmpeg_binary(&app).map_err(|e| e.to_string())?;

    let paths: Vec<PathBuf> = heic_paths.iter().map(PathBuf::from).collect();
    let converted = crate::image::heic::convert_heic_files(&paths, &thumb_dir, &ffmpeg);
    Ok(converted.into_iter().map(|(_, new)| new).collect())
}
