use serde::{Deserialize, Serialize};

pub type SourceResult<T> = Result<T, SourceError>;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", content = "detail")]
pub enum SourceError {
    Http { status: u16 },
    Network { message: String },
    Parse { message: String },
    NotFound,
    RateLimited { retry_after_secs: Option<u32> },
    AuthRequired,
    Other { message: String },
}

impl core::fmt::Display for SourceError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Http { status } => write!(f, "http status {status}"),
            Self::Network { message } => write!(f, "network error: {message}"),
            Self::Parse { message } => write!(f, "parse error: {message}"),
            Self::NotFound => write!(f, "not found"),
            Self::RateLimited { .. } => write!(f, "rate limited"),
            Self::AuthRequired => write!(f, "authentication required"),
            Self::Other { message } => write!(f, "{message}"),
        }
    }
}

impl core::error::Error for SourceError {}
