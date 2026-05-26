use std::path::{Path, PathBuf};

pub fn detect_heic(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("heic") | Some("heif")
    )
}

pub fn convert_heic_files(
    heic_paths: &[PathBuf],
    output_dir: &Path,
    ffmpeg_path: &Path,
) -> Vec<(String, String)> {
    heic_paths.iter().filter_map(|p| {
        let stem = p.file_stem()?.to_string_lossy().into_owned();
        let out = output_dir.join(format!("{stem}.jpg"));

        #[cfg(windows)]
        let status = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new(ffmpeg_path)
                .args(["-y", "-i"])
                .arg(p)
                .arg(&out)
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .status()
                .ok()?
        };
        #[cfg(not(windows))]
        let status = std::process::Command::new(ffmpeg_path)
            .args(["-y", "-i"])
            .arg(p)
            .arg(&out)
            .status()
            .ok()?;

        if status.success() {
            Some((p.to_string_lossy().into_owned(), out.to_string_lossy().into_owned()))
        } else {
            None
        }
    }).collect()
}
