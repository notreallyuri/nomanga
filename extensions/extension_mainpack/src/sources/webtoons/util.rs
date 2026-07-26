use nomanga_sdk::{
    data::manga::Status,
    prelude::{SourceError, SourceResult},
};

/// Webtoons needs the genre and slug in the path *and* `title_no` in the query
/// to serve a series, and a numeric id alone only works for Originals — Canvas
/// titles 404 unless the path says `canvas`. So the id carries all three:
/// `fantasy/tower-of-god/95`, `canvas/the-lore-origins/686405`.
pub struct SeriesId {
    pub genre: String,
    pub slug: String,
    pub title_no: String,
}

impl SeriesId {
    pub fn parse(id: &str) -> SourceResult<Self> {
        let mut parts = id.split('/');

        match (parts.next(), parts.next(), parts.next(), parts.next()) {
            (Some(genre), Some(slug), Some(title_no), None)
                if !genre.is_empty() && !slug.is_empty() && !title_no.is_empty() =>
            {
                Ok(Self {
                    genre: genre.to_owned(),
                    slug: slug.to_owned(),
                    title_no: title_no.to_owned(),
                })
            }
            _ => Err(SourceError::Parse {
                message: format!("expected `<genre>/<slug>/<title_no>`, got `{id}`"),
            }),
        }
    }

    pub fn list_url(&self, domain: &str, page: u32) -> String {
        format!(
            "{domain}/en/{}/{}/list?title_no={}&page={page}",
            self.genre, self.slug, self.title_no
        )
    }

    /// The episode slug segment is decorative — the viewer resolves off
    /// `title_no` + `episode_no` — so a placeholder keeps chapter ids to just
    /// the episode number instead of dragging a per-episode slug around.
    pub fn viewer_url(&self, domain: &str, episode_no: &str) -> String {
        format!(
            "{domain}/en/{}/{}/x/viewer?title_no={}&episode_no={episode_no}",
            self.genre, self.slug, self.title_no
        )
    }
}

/// Card and detail links are absolute:
/// `https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95`.
pub fn series_id_from_url(url: &str) -> Option<String> {
    let title_no = url
        .split(['?', '&'])
        .find_map(|q| q.strip_prefix("title_no="))?
        .trim();

    if title_no.is_empty() || !title_no.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }

    // `/en/<genre>/<slug>/list` — take the two segments before the trailing verb.
    let path = url.split('?').next()?;
    let mut segments = path.split('/').skip_while(|s| *s != "en").skip(1);
    let genre = segments.next().filter(|s| !s.is_empty())?;
    let slug = segments.next().filter(|s| !s.is_empty())?;

    Some(format!("{genre}/{slug}/{title_no}"))
}

/// View and subscriber counts render abbreviated: `1.3B`, `4.2M`, `288,979`.
pub fn parse_abbreviated_count(value: &str) -> Option<u64> {
    let value = value.trim();
    let (digits, scale) = match value.chars().last()? {
        'B' | 'b' => (&value[..value.len() - 1], 1_000_000_000.0),
        'M' | 'm' => (&value[..value.len() - 1], 1_000_000.0),
        'K' | 'k' => (&value[..value.len() - 1], 1_000.0),
        _ => (value, 1.0),
    };

    let cleaned: String = digits.chars().filter(|c| *c != ',').collect();
    cleaned.parse::<f64>().ok().map(|n| (n * scale) as u64)
}

/// The schedule line doubles as the status: `UP EVERY MONDAY`, `COMPLETED`,
/// `HIATUS`.
pub fn status(day_info: &str) -> Status {
    let upper = day_info.to_ascii_uppercase();

    if upper.contains("COMPLETED") {
        Status::Completed
    } else if upper.contains("HIATUS") {
        Status::Hiatus
    } else if upper.contains("UP") || upper.contains("EVERY") {
        Status::Ongoing
    } else {
        Status::Unknown
    }
}

/// Episode labels are free-form (`[Season 3] Ep. 235 (Season 3 Finale)`), so the
/// episode number from `data-episode-no` is authoritative and this only exists
/// as a last resort.
pub fn parse_number(value: &str) -> f32 {
    value.trim().parse().unwrap_or(0.0)
}
