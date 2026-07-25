use crate::error::ServiceResult;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

pub const SOURCE_SCOPE: &str = "";

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum PageLayout {
    #[default]
    SinglePage,
    DoublePage,
    VerticalScroll,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum ZoomBehavior {
    #[default]
    FitWidth,
    FitHeight,
    ActualSize,
    Manual,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum ReadingDirection {
    #[default]
    LeftToRight,
    RightToLeft,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ReaderSettings {
    pub page_layout: PageLayout,
    pub zoom_behavior: ZoomBehavior,
    pub reading_direction: ReadingDirection,
    pub zoom_level: Option<f32>,
    pub remember_zoom: bool,
}

impl Default for ReaderSettings {
    fn default() -> Self {
        Self {
            page_layout: PageLayout::SinglePage,
            zoom_behavior: ZoomBehavior::FitWidth,
            reading_direction: ReadingDirection::LeftToRight,
            zoom_level: None,
            remember_zoom: true,
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ReaderOverride {
    pub page_layout: Option<PageLayout>,
    pub zoom_behavior: Option<ZoomBehavior>,
    pub reading_direction: Option<ReadingDirection>,
}

impl ReaderOverride {
    pub fn is_empty(&self) -> bool {
        self.page_layout.is_none()
            && self.zoom_behavior.is_none()
            && self.reading_direction.is_none()
    }
}

impl ReaderSettings {
    pub fn apply(&self, over: &ReaderOverride) -> ReaderSettings {
        ReaderSettings {
            page_layout: over
                .page_layout
                .clone()
                .unwrap_or_else(|| self.page_layout.clone()),
            zoom_behavior: over
                .zoom_behavior
                .clone()
                .unwrap_or_else(|| self.zoom_behavior.clone()),
            reading_direction: over
                .reading_direction
                .clone()
                .unwrap_or_else(|| self.reading_direction.clone()),
            zoom_level: self.zoom_level,
            remember_zoom: self.remember_zoom,
        }
    }
}

pub async fn get_override(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<ReaderOverride> {
    let row = sqlx::query_scalar!(
        "SELECT data FROM reader_override WHERE source_id = ? AND manga_id = ?",
        source_id,
        manga_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(row
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default())
}

pub async fn set_override(
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
    over: &ReaderOverride,
) -> ServiceResult<()> {
    if over.is_empty() {
        sqlx::query!(
            "DELETE FROM reader_override WHERE source_id = ? AND manga_id = ?",
            source_id,
            manga_id
        )
        .execute(pool)
        .await?;
    } else {
        let data = serde_json::to_string(over)?;
        sqlx::query!(
            "INSERT INTO reader_override (source_id, manga_id, data) VALUES (?, ?, ?)
             ON CONFLICT (source_id, manga_id) DO UPDATE SET data = excluded.data",
            source_id,
            manga_id,
            data
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn effective(
    global: &ReaderSettings,
    pool: &SqlitePool,
    source_id: &str,
    manga_id: &str,
) -> ServiceResult<ReaderSettings> {
    let source_over = get_override(pool, source_id, SOURCE_SCOPE).await?;
    let manga_over = get_override(pool, source_id, manga_id).await?;

    Ok(global.apply(&source_over).apply(&manga_over))
}
