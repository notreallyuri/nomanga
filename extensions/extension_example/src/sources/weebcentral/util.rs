use nomanga_sdk::{
    data::manga::Status,
    prelude::{SourceError, SourceResult},
};

pub fn status(status: &str) -> Status {
    match status {
        "Ongoing" => Status::Ongoing,
        "Complete" => Status::Completed,
        "Hiatus" => Status::Hiatus,
        "Canceled" => Status::Cancelled,
        _ => Status::Unknown,
    }
}

fn segment_after<'a>(url: &'a str, marker: &str) -> Option<&'a str> {
    let mut segments = url.split('/');
    segments.by_ref().find(|s| *s == marker)?;
    segments.next().filter(|s| !s.is_empty())
}

pub fn id_from_series_url(url: &str) -> SourceResult<String> {
    segment_after(url, "series")
        .map(str::to_owned)
        .ok_or_else(|| SourceError::Parse {
            message: format!("no series in url: {url}"),
        })
}

pub fn id_from_chapter_url(url: &str) -> SourceResult<String> {
    segment_after(url, "chapters")
        .map(str::to_owned)
        .ok_or_else(|| SourceError::Parse {
            message: format!("no chapter id in url: {url}"),
        })
}

pub fn parse_leading_number(title: &str) -> f32 {
    let bytes = title.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            return title[start..i].parse().unwrap_or(0.0);
        }
        i += 1;
    }
    0.0
}
