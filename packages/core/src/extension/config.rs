use crate::extension::common::SelectOption;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Setting {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub kind: SettingKind,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FieldOption {
    pub id: String,
    pub label: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum SettingKind {
    Text {
        secret: bool,
        placeholder: Option<String>,
        default: Option<String>,
    },
    Toggle {
        default: bool,
    },
    Select {
        options: Vec<SelectOption>,
        default: Option<String>,
    },
}

impl Setting {
    pub fn text(id: &str, label: &str) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            description: None,
            kind: SettingKind::Text {
                secret: false,
                placeholder: None,
                default: None,
            },
        }
    }

    pub fn secret(id: &str, label: &str) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            description: None,
            kind: SettingKind::Text {
                secret: true,
                placeholder: None,
                default: None,
            },
        }
    }

    pub fn toggle(id: &str, label: &str, default: bool) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            description: None,
            kind: SettingKind::Toggle { default },
        }
    }

    pub fn select(id: &str, label: &str, options: Vec<SelectOption>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            description: None,
            kind: SettingKind::Select {
                options,
                default: None,
            },
        }
    }

    pub fn with_description(mut self, description: &str) -> Self {
        self.description = Some(description.into());
        self
    }
}
