use std::io::BufReader;
use std::fs::File;
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use ::image::{DynamicImage, GenericImageView, RgbImage, GrayImage};
use jpeg_decoder::PixelFormat;
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

fn is_jpeg(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("jpg") | Some("jpeg")
    )
}

/// Decode a JPEG at the smallest scale factor >= thumb_size.
/// Returns (image, original_width, original_height) where w/h are the UNSCALED dims.
fn decode_jpeg_scaled(path: &Path, thumb_size: u32) -> anyhow::Result<(DynamicImage, u32, u32)> {
    // First read to get original dimensions (cheap: just reads the SOF header)
    let orig_w;
    let orig_h;
    {
        let f = File::open(path)?;
        let mut dec = jpeg_decoder::Decoder::new(BufReader::new(f));
        dec.read_info()?;
        let info = dec.info().ok_or_else(|| anyhow::anyhow!("no JPEG info"))?;
        orig_w = info.width as u32;
        orig_h = info.height as u32;
    }

    // Second read with scaling
    let f = File::open(path)?;
    let mut dec = jpeg_decoder::Decoder::new(BufReader::new(f));
    dec.read_info()?;
    dec.scale(thumb_size as u16, thumb_size as u16)
        .map_err(|e| anyhow::anyhow!("jpeg scale: {e}"))?;
    let data = dec.decode().map_err(|e| anyhow::anyhow!("jpeg decode: {e}"))?;
    let info = dec.info().ok_or_else(|| anyhow::anyhow!("no JPEG info after decode"))?;
    let sw = info.width as u32;
    let sh = info.height as u32;

    let dyn_img = match info.pixel_format {
        PixelFormat::RGB24 => {
            let img = RgbImage::from_raw(sw, sh, data)
                .ok_or_else(|| anyhow::anyhow!("RGB24 buffer mismatch"))?;
            DynamicImage::ImageRgb8(img)
        }
        PixelFormat::L8 => {
            let img = GrayImage::from_raw(sw, sh, data)
                .ok_or_else(|| anyhow::anyhow!("L8 buffer mismatch"))?;
            DynamicImage::ImageLuma8(img)
        }
        _ => {
            // CMYK32 or other exotic formats — fall back to image::open
            anyhow::bail!("unsupported pixel format {:?}", info.pixel_format);
        }
    };

    Ok((dyn_img, orig_w, orig_h))
}

fn generate_one(path: &Path, thumb_size: u32, thumb_dir: &Path) -> anyhow::Result<ThumbResult> {
    let canonical = dunce::canonicalize(path)?;

    // Compute deterministic thumb path first — skip decode if already on disk
    let stem = canonical
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    let hash = hash_of_path(&canonical);
    let thumb_filename = format!("{stem}_{hash:x}.jpg");
    let thumb_path = thumb_dir.join(&thumb_filename);

    // A: Cache hit — header-only reads only
    if thumb_path.exists() {
        let (mut w, mut h) = ::image::image_dimensions(&canonical)?;
        let orientation = read_orientation(&canonical);
        if matches!(orientation, 5 | 6 | 7 | 8) {
            std::mem::swap(&mut w, &mut h);
        }
        return Ok(ThumbResult {
            original_path: canonical.to_string_lossy().into_owned(),
            thumb_path: thumb_path.to_string_lossy().into_owned(),
            width: w,
            height: h,
        });
    }

    // Cache miss — read orientation then decode
    let orientation = read_orientation(&canonical);

    // B: JPEG fast path — shrink-on-load so we decode at 1/8..1 scale
    let (img, mut orig_w, mut orig_h) = if is_jpeg(&canonical) {
        match decode_jpeg_scaled(&canonical, thumb_size) {
            Ok(result) => result,
            Err(_) => {
                // Fallback to full decode
                let img = ::image::open(&canonical)?;
                let (w, h) = img.dimensions();
                (img, w, h)
            }
        }
    } else {
        let img = ::image::open(&canonical)?;
        let (w, h) = img.dimensions();
        (img, w, h)
    };

    // C: Apply orientation on the small decoded buffer (not full-res)
    let img = apply_orientation(img, orientation);
    if matches!(orientation, 5 | 6 | 7 | 8) {
        std::mem::swap(&mut orig_w, &mut orig_h);
    }

    let thumb = img.thumbnail(thumb_size, thumb_size);
    thumb.save_with_format(&thumb_path, ::image::ImageFormat::Jpeg)?;

    Ok(ThumbResult {
        original_path: canonical.to_string_lossy().into_owned(),
        thumb_path: thumb_path.to_string_lossy().into_owned(),
        width: orig_w,
        height: orig_h,
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
