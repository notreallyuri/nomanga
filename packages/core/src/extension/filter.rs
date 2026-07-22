use crate::extension::common::SelectOption;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum Filter {
    Text {
        id: String,
        label: String,
    },
    Toggle {
        id: String,
        label: String,
        default: bool,
    },
    Select {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        default: Option<String>,
    },
    MultiSelect {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        supports_exclusion: bool,
    },
    Sort {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        default: Option<String>,
        can_reverse: bool,
    },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum FilterValue {
    Text {
        id: String,
        value: String,
    },
    Toggle {
        id: String,
        value: bool,
    },
    Select {
        id: String,
        value: String,
    },
    MultiSelect {
        id: String,
        included: Vec<String>,
        excluded: Vec<String>,
    },
    Sort {
        id: String,
        value: String,
        reversed: bool,
    },
}

impl FilterValue {
    pub fn id(&self) -> &str {
        match self {
            Self::Text { id, .. }
            | Self::Toggle { id, .. }
            | Self::Select { id, .. }
            | Self::MultiSelect { id, .. }
            | Self::Sort { id, .. } => id,
        }
    }
}
