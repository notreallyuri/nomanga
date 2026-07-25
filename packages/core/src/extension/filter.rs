//! Search filters: what a source *offers* ([`Filter`]) and what the user
//! *picked* ([`FilterValue`]).
//!
//! A source declares its filters in `Source::filters`; the app renders them and
//! hands the selected [`FilterValue`]s back on the next `SearchQuery`. Author
//! the declarations with the [`Filter`] constructors and read the selections
//! back with the [`FilterValues`] trait — both keep a large filter set readable.

use crate::extension::common::SelectOption;
use serde::{Deserialize, Serialize};

/// A filter a source exposes on its search screen. Every variant is keyed by an
/// `id` that ties it to the [`FilterValue`] the user sends back.
///
/// Prefer the constructors ([`Filter::select`], [`Filter::sort`], …) over the
/// struct literal form; they fill in the optional fields and read more clearly
/// when a source declares many filters at once.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum Filter {
    /// A free-text field.
    Text {
        id: String,
        label: String,
        placeholder: Option<String>,
    },
    /// An on/off switch.
    Toggle {
        id: String,
        label: String,
        default: bool,
    },
    /// Pick exactly one option.
    Select {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        default: Option<String>,
    },
    /// Pick any number of options; may also allow excluding them when
    /// `supports_exclusion` is set (e.g. include/exclude tags).
    MultiSelect {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        supports_exclusion: bool,
    },
    /// A sort key, optionally reversible when `can_reverse` is set.
    Sort {
        id: String,
        label: String,
        options: Vec<SelectOption>,
        default: Option<String>,
        can_reverse: bool,
    },
}

/// A user's selection for one [`Filter`], carrying the same `id`. Read these off
/// a search with the [`FilterValues`] trait rather than matching by hand.
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

impl Filter {
    pub fn text(id: &str, label: &str) -> Self {
        Self::Text {
            id: id.into(),
            label: label.into(),
            placeholder: None,
        }
    }

    pub fn toggle(id: &str, label: &str, default: bool) -> Self {
        Self::Toggle {
            id: id.into(),
            label: label.into(),
            default,
        }
    }

    pub fn select(id: &str, label: &str, options: Vec<SelectOption>) -> Self {
        Self::Select {
            id: id.into(),
            label: label.into(),
            options,
            default: None,
        }
    }

    pub fn multi_select(id: &str, label: &str, options: Vec<SelectOption>) -> Self {
        Self::MultiSelect {
            id: id.into(),
            label: label.into(),
            options,
            supports_exclusion: false,
        }
    }

    pub fn sort(id: &str, label: &str, options: Vec<SelectOption>) -> Self {
        Self::Sort {
            id: id.into(),
            label: label.into(),
            options,
            default: None,
            can_reverse: false,
        }
    }

    /// Placeholder text for a `Text` filter; a no-op on other kinds.
    pub fn with_placeholder(mut self, placeholder: &str) -> Self {
        if let Self::Text {
            placeholder: slot, ..
        } = &mut self
        {
            *slot = Some(placeholder.into());
        }
        self
    }

    /// Pre-selected option for a `Select` or `Sort` filter; a no-op elsewhere.
    pub fn with_default(mut self, default: &str) -> Self {
        match &mut self {
            Self::Select { default: slot, .. } | Self::Sort { default: slot, .. } => {
                *slot = Some(default.into());
            }
            _ => {}
        }
        self
    }

    /// Let a `MultiSelect` exclude options as well as include them.
    pub fn with_exclusion(mut self) -> Self {
        if let Self::MultiSelect {
            supports_exclusion, ..
        } = &mut self
        {
            *supports_exclusion = true;
        }
        self
    }

    /// Let a `Sort` filter flip its direction.
    pub fn reversible(mut self) -> Self {
        if let Self::Sort { can_reverse, .. } = &mut self {
            *can_reverse = true;
        }
        self
    }
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

/// Typed lookups over the `FilterValue`s a search carries, so a source can read
/// the value it wants by id instead of hand-rolling a `match` over every
/// variant. Implemented for `[FilterValue]`, so it works directly on
/// `query.filters`.
pub trait FilterValues {
    /// The raw value for `id`, whatever its kind.
    fn find(&self, id: &str) -> Option<&FilterValue>;

    fn text(&self, id: &str) -> Option<&str> {
        match self.find(id)? {
            FilterValue::Text { value, .. } => Some(value),
            _ => None,
        }
    }

    fn toggle(&self, id: &str) -> Option<bool> {
        match self.find(id)? {
            FilterValue::Toggle { value, .. } => Some(*value),
            _ => None,
        }
    }

    fn select(&self, id: &str) -> Option<&str> {
        match self.find(id)? {
            FilterValue::Select { value, .. } => Some(value),
            _ => None,
        }
    }

    /// The chosen option and whether the user reversed it.
    fn sort(&self, id: &str) -> Option<(&str, bool)> {
        match self.find(id)? {
            FilterValue::Sort {
                value, reversed, ..
            } => Some((value, *reversed)),
            _ => None,
        }
    }

    /// The included and excluded id lists of a `MultiSelect`.
    fn multi_select(&self, id: &str) -> Option<(&[String], &[String])> {
        match self.find(id)? {
            FilterValue::MultiSelect {
                included, excluded, ..
            } => Some((included, excluded)),
            _ => None,
        }
    }

    /// Just the included ids of a `MultiSelect`, empty when unset — handy for
    /// the common "append each selected value" loop.
    fn included(&self, id: &str) -> &[String] {
        self.multi_select(id).map_or(&[], |(included, _)| included)
    }

    /// Just the excluded ids of a `MultiSelect`, empty when unset.
    fn excluded(&self, id: &str) -> &[String] {
        self.multi_select(id).map_or(&[], |(_, excluded)| excluded)
    }
}

impl FilterValues for [FilterValue] {
    fn find(&self, id: &str) -> Option<&FilterValue> {
        self.iter().find(|value| value.id() == id)
    }
}
