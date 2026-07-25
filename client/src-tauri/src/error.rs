use nomanga_host::error::HostError;
use nomanga_services::error::ServiceError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(tag = "kind", content = "detail")]
pub enum CommandError {
    Source {
        source_id: Option<String>,
        message: String,
    },
    Extension {
        message: String,
    },
    Database {
        message: String,
    },
    MangaNotCached {
        source_id: String,
        manga_id: String,
    },
    Io {
        message: String,
    },
    Internal {
        message: String,
    },
}

impl CommandError {
    pub fn with_source_id(mut self, id: &str) -> Self {
        if let Self::Source { source_id, .. } = &mut self {
            source_id.get_or_insert_with(|| id.to_string());
        }
        self
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Source { message, .. }
            | Self::Extension { message }
            | Self::Database { message }
            | Self::Io { message }
            | Self::Internal { message } => write!(f, "{message}"),
            Self::MangaNotCached {
                source_id,
                manga_id,
            } => write!(f, "manga not cached: {source_id}/{manga_id}"),
        }
    }
}

impl From<ServiceError> for CommandError {
    fn from(e: ServiceError) -> Self {
        match e {
            ServiceError::MangaNotCached {
                source_id,
                manga_id,
            } => Self::MangaNotCached {
                source_id,
                manga_id,
            },
            ServiceError::Io(err) => Self::Io {
                message: err.to_string(),
            },
            ServiceError::Json(err) => Self::Internal {
                message: err.to_string(),
            },
            other => Self::Database {
                message: other.to_string(),
            },
        }
    }
}

impl From<HostError> for CommandError {
    fn from(e: HostError) -> Self {
        match e {
            HostError::Source(err) => Self::Source {
                source_id: None,
                message: err.to_string(),
            },
            HostError::UnknownSource(source_id) => Self::Source {
                message: format!("unknown source id: {source_id}"),
                source_id: Some(source_id),
            },
            other => Self::Extension {
                message: other.to_string(),
            },
        }
    }
}

impl<T> From<std::sync::PoisonError<T>> for CommandError {
    fn from(_: std::sync::PoisonError<T>) -> Self {
        Self::Internal {
            message: "lock poisoned".into(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
