use std::path::{Path, PathBuf};
use rayon::prelude::*;
use ::image::GenericImageView;
use crate::image::exif::{read_orientation, apply_orientation};

pub struct ThumbResult {
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

pub fn generate_thumbnails(paths: &[PathBuf], thumb_size: u32, thumb_dir: &Path) -> Vec<ThumbResult> {
    paths.par_iter().filter_map(|path| {
        generate_one(path, thumb_size, thumb_dir).ok()
    }).collect()
}

fn generate_one(path: &Path, thumb_size: u32, thumb_dir: &Path) -> anyhow::Result<ThumbResult> {
    let canonical = dunce::canonicalize(path)?;

    let orientation = read_orientation(&canonical);
    let img = ::image::open(&canonical)?;
    let img = apply_orientation(img, orientation);

    let (w, h) = img.dimensions();
    let thumb = img.thumbnail(thumb_size, thumb_size);

    let stem = canonical
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    let hash = hash_of_path(&canonical);
    let thumb_filename = format!("{stem}_{hash:x}.jpg");
    let thumb_path = thumb_dir.join(&thumb_filename);

    thumb.save_with_format(&thumb_path, ::image::ImageFormat::Jpeg)?;

    Ok(ThumbResult {
        original_path: canonical.to_string_lossy().into_owned(),
        thumb_path: thumb_path.to_string_lossy().into_owned(),
        width: w,
        height: h,
    })
}

fn hash_of_path(path: &Path) -> u64 {
    // FNV-1a: deterministic, stable across restarts and Rust versions
    let bytes = path.to_string_lossy();
    let mut hash: u64 = 14695981039346656037;
    for byte in bytes.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}
