use super::{Backup, VERSION};
use crate::error::{ServiceError, ServiceResult};
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use std::io::{Read, Write};
use std::path::Path;

pub fn write_file(path: &Path, backup: &Backup) -> ServiceResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_vec(backup)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&json)?;
    let compressed = encoder.finish()?;

    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, compressed)?;
    std::fs::rename(&tmp, path)?;

    Ok(())
}

pub fn read_file(path: &Path) -> ServiceResult<Backup> {
    let bytes = std::fs::read(path)?;

    let mut json = String::new();
    GzDecoder::new(bytes.as_slice()).read_to_string(&mut json)?;

    let backup: Backup = serde_json::from_str(&json)?;

    if backup.version > VERSION {
        return Err(ServiceError::BackupVersion {
            found: backup.version,
            supported: VERSION,
        });
    }

    Ok(backup)
}
