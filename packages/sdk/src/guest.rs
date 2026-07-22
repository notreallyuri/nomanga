use extism_pdk::{HttpRequest, http};
use nomanga_core::extension::error::{SourceError, SourceResult};

pub const USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

pub fn get(url: &str) -> SourceResult<Vec<u8>> {
    fetch(HttpRequest::new(url).with_header("User-Agent", USER_AGENT))
}

pub fn get_text(url: &str) -> SourceResult<String> {
    String::from_utf8(get(url)?).map_err(|e| SourceError::Parse {
        message: format!("response was not utf-8: {e}"),
    })
}

pub fn fetch(req: HttpRequest) -> SourceResult<Vec<u8>> {
    let res = http::request::<()>(&req, None).map_err(|e| SourceError::Network {
        message: e.to_string(),
    })?;

    match res.status_code() {
        200..=299 => Ok(res.body()),
        404 => Err(SourceError::NotFound),
        401 | 403 => Err(SourceError::AuthRequired),
        429 => Err(SourceError::RateLimited {
            retry_after_secs: None,
        }),
        status => Err(SourceError::Http { status }),
    }
}

pub fn setting(id: &str) -> Option<String> {
    extism_pdk::config::get(id).ok().flatten()
}

pub fn setting_bool(id: &str) -> Option<bool> {
    setting(id).map(|v| v == "true")
}
