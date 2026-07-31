use serde::{Deserialize, Serialize};

pub const MAX_PINNED_SOURCES: usize = 5;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SidebarSettings {
    pub pinned_sources: Vec<String>,
}

impl SidebarSettings {
    // A hand-edited settings file, or a backup from a build with a different
    // cap, can carry duplicates or an over-long list; the sidebar renders
    // whatever it is handed, so clamp on the way out instead.
    pub fn pinned(&self) -> Vec<String> {
        let mut seen = std::collections::HashSet::new();

        self.pinned_sources
            .iter()
            .filter(|id| seen.insert(id.as_str()))
            .take(MAX_PINNED_SOURCES)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_dedupes_and_clamps() {
        let settings = SidebarSettings {
            pinned_sources: vec![
                "a".into(),
                "a".into(),
                "b".into(),
                "c".into(),
                "d".into(),
                "e".into(),
                "f".into(),
            ],
        };

        assert_eq!(settings.pinned(), ["a", "b", "c", "d", "e"]);
    }
}
