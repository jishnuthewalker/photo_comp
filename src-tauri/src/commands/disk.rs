#[tauri::command]
pub fn check_disk_space(_path: String, _required_bytes: u64) -> Result<bool, String> {
    Ok(true)
}
