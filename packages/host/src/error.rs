use nomanga_core::extension::error::SourceError;
#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("extism error: {0}")]
    Extism(#[from] extism::Error),
    #[error("abi mismatch: extension is abi {found}, host supports {supported}")]
    AbiMismatch { found: u32, supported: u32 },
    #[error("unknown source id: {0}")]
    UnknownSource(String),
    #[error("source error: {0}")]
    Source(#[from] SourceError),
    #[error("could not read wasm at {path}: {source}")]
    WasmRead {
        path: String,
        source: std::io::Error,
    },
}

pub type HostResult<T> = Result<T, HostError>;
