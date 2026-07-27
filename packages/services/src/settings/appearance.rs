use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum Theme {
    #[default]
    Default,
    Void,
    Havoc,
    Amber,
    Rose,
    Cyberpunk,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum ThemeDarkMode {
    #[default]
    System,
    Light,
    Dark,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum CoverStyle {
    #[default]
    Default,
    Rounded,
    Border,
    Shadow,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum CardSize {
    Small,
    #[default]
    Medium,
    Large,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
pub enum LibraryLayout {
    #[default]
    Grid,
    List,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceSettings {
    pub theme: Theme,
    pub dark_mode: ThemeDarkMode,
    pub show_titles: bool,
    pub compact_mode: bool,
    pub cover_style: CoverStyle,
    pub card_size: CardSize,
    pub library_layout: LibraryLayout,
    pub show_unread_badge: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: Theme::Default,
            dark_mode: ThemeDarkMode::System,
            show_titles: true,
            compact_mode: false,
            cover_style: CoverStyle::Default,
            card_size: CardSize::Medium,
            library_layout: LibraryLayout::Grid,
            show_unread_badge: true,
        }
    }
}
