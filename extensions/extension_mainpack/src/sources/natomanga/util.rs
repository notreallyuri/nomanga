use nomanga_sdk::data::manga::Status;

pub fn status(value: &str) -> Status {
    match value.trim().to_ascii_lowercase().as_str() {
        "ongoing" => Status::Ongoing,
        "completed" => Status::Completed,
        _ => Status::Unknown,
    }
}

/// Series URLs are `https://www.natomanga.com/manga/<slug>`, so the slug alone
/// is a usable id. Listings also carry sponsored cards pointing at bit.ly and
/// friends; those have no `/manga/` segment, so returning `None` here is what
/// filters them out of every listing parser.
pub fn slug_from_url(url: &str) -> Option<String> {
    let slug = url
        .split('/')
        .skip_while(|s| *s != "manga")
        .nth(1)
        .filter(|s| !s.is_empty())?;

    // Chapter links live under the same prefix (`/manga/<slug>/chapter-1`), but
    // callers only ever hand us card links, so the slug is the last segment.
    Some(slug.split(['?', '#']).next().unwrap_or(slug).to_owned())
}

/// Chapter URLs are `/manga/<slug>/<chapter>`; the trailing segment is enough to
/// rebuild the URL later, since `ChapterRef` carries the manga id alongside it.
pub fn chapter_id_from_url(url: &str) -> Option<String> {
    let mut segments = url.split('/').skip_while(|s| *s != "manga").skip(1);
    let _slug = segments.next()?;
    let chapter = segments.next().filter(|s| !s.is_empty())?;

    Some(chapter.split(['?', '#']).next().unwrap_or(chapter).to_owned())
}

/// Natomanga's text search is a path segment, not a query parameter:
/// `/search/story/one_piece`. Anything non-alphanumeric collapses to a single
/// underscore, which is why "a b" and "a  b" hit the same page.
pub fn search_slug(term: &str) -> String {
    let mut slug = String::with_capacity(term.len());
    let mut pending_sep = false;

    for ch in term.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_sep && !slug.is_empty() {
                slug.push('_');
            }
            pending_sep = false;
            slug.extend(ch.to_lowercase());
        } else {
            pending_sep = true;
        }
    }

    slug
}

/// Chapter labels read `Chapter 12.2`; anything without digits sorts as 0.
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

/// View counts render as `674,286` on the detail page and `962` in listings.
pub fn parse_count(value: &str) -> Option<u64> {
    let digits: String = value.chars().filter(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// Pager anchors read `Last(851)` / `First(1)`.
pub fn parse_parenthesised_number(value: &str) -> Option<u32> {
    let start = value.find('(')? + 1;
    let end = value[start..].find(')')? + start;
    value[start..end].trim().parse().ok()
}
