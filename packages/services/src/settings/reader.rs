use serde::{Deserialize, Serialize};

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
