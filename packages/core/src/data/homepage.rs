use crate::data::manga::MangaSimple;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum SectionLayout {
    SingleRow,
    DoubleRow,
    TripleRow,
    FeaturedRow,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HomepageSection {
    pub id: String,
    pub title: String,
    pub layout: SectionLayout,
    pub items: Vec<MangaSimple>,
    pub paginable: bool,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Homepage {
    pub sections: Vec<HomepageSection>,
}
