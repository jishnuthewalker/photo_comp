use std::path::Path;

#[tauri::command]
pub fn check_disk_space(path: String, required_bytes: u64) -> Result<bool, String> {
    let p = Path::new(&path);
    let root = p.ancestors().last().unwrap_or(p);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = root.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut free: u64 = 0;
        let mut total: u64 = 0;
        let mut total_free: u64 = 0;
        let result = unsafe {
            windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free as *mut u64 as *mut _,
                &mut total as *mut u64 as *mut _,
                &mut total_free as *mut u64 as *mut _,
            )
        };
        // Fix 3: if the Win32 call fails, fail open so a false-negative doesn't
        // block rendering when we simply can't determine the available space.
        if result == 0 {
            return Ok(true);
        }
        return Ok(free >= required_bytes);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(true)
}
