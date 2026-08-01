use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BrowseSettings {
    pub source_order: Vec<String>,
}

impl BrowseSettings {
    // A hand-edited file, or a backup taken while a different set of extensions
    // was installed, can carry duplicates. Ordering by a list with repeats would
    // render the same source twice, so it is deduped on the way out rather than
    // trusted -- the same treatment `pinned_sources` gets, and for the same
    // reason.
    pub fn order(&self) -> Vec<String> {
        let mut seen = std::collections::HashSet::new();

        self.source_order
            .iter()
            .filter(|id| seen.insert(id.as_str()))
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_dedupes_and_keeps_first_position() {
        let settings = BrowseSettings {
            source_order: vec!["a".into(), "b".into(), "a".into(), "c".into()],
        };

        assert_eq!(settings.order(), ["a", "b", "c"]);
    }
}
