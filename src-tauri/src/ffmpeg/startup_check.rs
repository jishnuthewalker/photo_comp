use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn check_ffmpeg(app: tauri::AppHandle) -> Result<(), String> {
    let ffmpeg = crate::ffmpeg::ffmpeg_binary(&app).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    let mut encoders_cmd = {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(&ffmpeg);
        cmd.args(["-encoders", "-v", "quiet"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    };
    #[cfg(not(windows))]
    let mut encoders_cmd = {
        let mut cmd = Command::new(&ffmpeg);
        cmd.args(["-encoders", "-v", "quiet"]);
        cmd
    };

    let encoders = encoders_cmd
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;
    let encoder_output = String::from_utf8_lossy(&encoders.stdout);
    if !encoder_output.contains("libx264") {
        return Err("FFmpeg missing libx264 encoder. Ensure you downloaded the GPL build from BtbN.".into());
    }

    #[cfg(windows)]
    let mut filters_cmd = {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(&ffmpeg);
        cmd.args(["-filters", "-v", "quiet"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    };
    #[cfg(not(windows))]
    let mut filters_cmd = {
        let mut cmd = Command::new(&ffmpeg);
        cmd.args(["-filters", "-v", "quiet"]);
        cmd
    };

    let filters = filters_cmd
        .output()
        .map_err(|e| format!("Failed to run ffmpeg filters check: {e}"))?;
    let filter_output = String::from_utf8_lossy(&filters.stdout);
    for required in &["xfade", "concat", "scale", "crop"] {
        if !filter_output.contains(required) {
            return Err(format!("FFmpeg missing required filter: {required}"));
        }
    }

    Ok(())
}
