use nomanga_core::extension::error::SourceError;
#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("extism error: {0}")]
    Extism(#[from] extism::Error),
    #[error("extension targets abi {found}, which this version dropped (oldest supported is {min}) — update the extension")]
    AbiTooOld { found: u32, min: u32 },
    #[error("extension targets abi {found}, newer than this version supports ({max}) — update nomanga")]
    AbiTooNew { found: u32, max: u32 },
    #[error("unknown source id: {0}")]
    UnknownSource(String),
    #[error("source {0} is turned off")]
    SourceDisabled(String),
    #[error("host lock poisoned")]
    Poisoned,
    #[error("source error: {0}")]
    Source(#[from] SourceError),
    #[error("could not read wasm at {path}: {source}")]
    WasmRead {
        path: String,
        source: std::io::Error,
    },
    #[error("could not write extension metadata to {path}: {source}")]
    SnapshotWrite {
        path: String,
        source: std::io::Error,
    },
    #[error("could not encode extension metadata: {0}")]
    SnapshotEncode(#[from] serde_json::Error),
}

pub type HostResult<T> = Result<T, HostError>;
