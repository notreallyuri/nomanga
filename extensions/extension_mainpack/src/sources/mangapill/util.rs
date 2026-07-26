use nomanga_sdk::{
    data::manga::Status,
    prelude::{SourceError, SourceResult},
};

pub fn status(status: &str) -> Status {
    match status.trim() {
        "publishing" => Status::Ongoing,
        "finished" => Status::Completed,
        "on hiatus" => Status::Hiatus,
        "discontinued" => Status::Cancelled,
        _ => Status::Unknown,
    }
}

/// MangaPill URLs carry both a numeric id and a slug (`/manga/3069/naruto`),
/// and the numeric id alone 404s — so the id we hand back is `3069/naruto`.
pub fn id_from_series_url(url: &str) -> SourceResult<String> {
    id_after(url, "manga").ok_or_else(|| SourceError::Parse {
        message: format!("no series id in url: {url}"),
    })
}

/// Same shape as series ids: `/chapters/3069-10700500/naruto-chapter-700.5`
/// yields `3069-10700500/naruto-chapter-700.5`.
pub fn id_from_chapter_url(url: &str) -> SourceResult<String> {
    id_after(url, "chapters").ok_or_else(|| SourceError::Parse {
        message: format!("no chapter id in url: {url}"),
    })
}

fn id_after(url: &str, marker: &str) -> Option<String> {
    let mut segments = url.split('/').skip_while(|s| *s != marker).skip(1);

    let id = segments.next().filter(|s| !s.is_empty())?;
    let slug = segments.next().filter(|s| !s.is_empty())?;

    Some(format!("{id}/{slug}"))
}

/// Chapter labels read `Chapter 700.5`; anything without digits sorts as 0.
pub fn parse_leading_number(title: &str) -> f32 {
    let bytes = title.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            return title[start..i].trim_end_matches('.').parse().unwrap_or(0.0);
        }
        i += 1;
    }

    0.0
}
