//! Building blocks shared across the extension surface.

use serde::{Deserialize, Serialize};

/// One choice in a `Select`, `MultiSelect`, or `Sort` filter (and in the
/// equivalent [`crate::extension::config::Setting`] kinds).
///
/// `id` is the stable value sent back on selection; `label` is what the user
/// sees. Build several at once with [`SelectOption::list`].
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SelectOption {
    pub id: String,
    pub label: String,
}

impl SelectOption {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
        }
    }

    /// Build a list of options in one call. Each item may be a bare label
    /// (id == label, the common case) or an explicit `(id, label)` pair:
    ///
    /// ```ignore
    /// SelectOption::list(["Ongoing", "Complete"]);
    /// SelectOption::list([("asc", "Ascending"), ("desc", "Descending")]);
    /// ```
    pub fn list<I, T>(items: I) -> Vec<Self>
    where
        I: IntoIterator<Item = T>,
        T: Into<Self>,
    {
        items.into_iter().map(Into::into).collect()
    }
}

/// A bare string is an option whose id and label are the same.
impl From<&str> for SelectOption {
    fn from(value: &str) -> Self {
        Self::new(value, value)
    }
}

impl From<String> for SelectOption {
    fn from(value: String) -> Self {
        Self::new(value.clone(), value)
    }
}

/// An explicit `(id, label)` pair, for when the wire value differs from what
/// the user sees.
impl From<(&str, &str)> for SelectOption {
    fn from((id, label): (&str, &str)) -> Self {
        Self::new(id, label)
    }
}
