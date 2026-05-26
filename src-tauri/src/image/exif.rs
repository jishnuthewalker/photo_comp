use std::fs::File;
use std::path::Path;

pub fn read_orientation(path: &Path) -> u32 {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    if let Some(field) = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY) {
        if let exif::Value::Short(ref v) = field.value {
            if let Some(&o) = v.first() {
                return o as u32;
            }
        }
    }
    1
}

pub fn apply_orientation(img: ::image::DynamicImage, orientation: u32) -> ::image::DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}
