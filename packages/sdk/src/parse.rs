use nomanga_core::extension::error::SourceError;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use scraper::{ElementRef, Html, Selector};

pub fn selector(sel: &str) -> Result<Selector, SourceError> {
    Selector::parse(sel).map_err(|e| SourceError::Parse {
        message: format!("bad selector `{sel}`: {e:?}"),
    })
}

pub fn select_one<'a>(root: ElementRef<'a>, sel: &str) -> Result<ElementRef<'a>, SourceError> {
    let s = selector(sel)?;
    root.select(&s).next().ok_or_else(|| SourceError::Parse {
        message: format!("no element matched `{sel}`"),
    })
}

pub fn text(root: ElementRef<'_>, sel: &str) -> Result<String, SourceError> {
    Ok(select_one(root, sel)?
        .text()
        .collect::<String>()
        .trim()
        .to_owned())
}

pub fn text_opt(root: ElementRef<'_>, sel: &str) -> Option<String> {
    let s = selector(sel).ok()?;
    root.select(&s)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_owned())
}

pub fn attr(root: ElementRef<'_>, sel: &str, name: &str) -> Result<String, SourceError> {
    select_one(root, sel)?
        .value()
        .attr(name)
        .map(|v| v.to_owned())
        .ok_or_else(|| SourceError::Parse {
            message: format!("`{sel}` has no `{name}` attribute"),
        })
}

pub fn select_containing<'a>(
    root: ElementRef<'a>,
    container: &str,
    needle: &str,
    child: &str,
) -> Result<Vec<String>, SourceError> {
    let cont = selector(container)?;
    let ch = selector(child)?;
    Ok(root
        .select(&cont)
        .filter(|el| el.text().collect::<String>().contains(needle))
        .flat_map(|el| {
            el.select(&ch)
                .map(|c| c.text().collect::<String>().trim().to_owned())
                .collect::<Vec<_>>()
        })
        .collect())
}

pub fn document(html: &str) -> Html {
    Html::parse_document(html)
}

pub fn encode_path(s: &str) -> String {
    utf8_percent_encode(s, NON_ALPHANUMERIC).to_string()
}

pub fn encode_query(s: &str) -> String {
    encode_path(s).replace("%20", "+")
}

pub fn last_path_segment(url: &str) -> Option<&str> {
    url.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
}
