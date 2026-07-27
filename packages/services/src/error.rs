use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("manga not cached: {source_id}/{manga_id}")]
    MangaNotCached { source_id: String, manga_id: String },
    #[error("a category named \"{name}\" already exists")]
    CategoryExists { name: String },
    #[error("no category with id {id}")]
    CategoryNotFound { id: String },
    #[error("backup was written by a newer version (found {found}, supports up to {supported})")]
    BackupVersion { found: u32, supported: u32 },
    #[error("no sync folder has been chosen")]
    SyncNotConfigured,
    #[error("the sync folder has no snapshot yet")]
    SyncNoSnapshot,
    #[error("{kind} command failed: {detail}")]
    SyncHookFailed { kind: String, detail: String },
    #[error("{kind} command did not finish within {seconds}s")]
    SyncHookTimeout { kind: String, seconds: u64 },
}

impl ServiceError {
    pub(crate) fn category_name(name: &str, err: sqlx::Error) -> Self {
        match &err {
            sqlx::Error::Database(db) if db.is_unique_violation() => Self::CategoryExists {
                name: name.to_owned(),
            },
            _ => err.into(),
        }
    }
}

pub type ServiceResult<T> = Result<T, ServiceError>;
