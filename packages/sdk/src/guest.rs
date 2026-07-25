use extism_pdk::{HttpRequest, http};
use nomanga_core::extension::error::{SourceError, SourceResult};
use serde::{Serialize, de::DeserializeOwned};
use std::collections::BTreeMap;

pub const USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

pub struct Request {
    url: String,
    method: &'static str,
    headers: BTreeMap<String, String>,
    body: Option<Vec<u8>>,
}

impl Request {
    pub fn get(url: impl Into<String>) -> Self {
        Self::new("GET", url)
    }

    pub fn post(url: impl Into<String>) -> Self {
        Self::new("POST", url)
    }

    fn new(method: &'static str, url: impl Into<String>) -> Self {
        let mut headers = BTreeMap::new();
        headers.insert("User-Agent".into(), USER_AGENT.into());

        Self {
            url: url.into(),
            method,
            headers,
            body: None,
        }
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    pub fn bearer(self, token: &str) -> Self {
        self.header("Authorization", format!("Bearer {token}"))
    }

    pub fn referer(self, url: &str) -> Self {
        self.header("Referer", url)
    }

    pub fn json_body<T: Serialize>(mut self, body: &T) -> SourceResult<Self> {
        let encoded = serde_json::to_vec(body).map_err(|e| SourceError::Parse {
            message: format!("could not encode request body: {e}"),
        })?;

        self.body = Some(encoded);
        Ok(self.header("Content-Type", "application/json"))
    }

    pub fn text(self) -> SourceResult<String> {
        let mut req = HttpRequest::new(&self.url).with_method(self.method);
        for (key, value) in &self.headers {
            req = req.with_header(key, value);
        }

        let host = host_of(&self.url).to_owned();

        let res = http::request(&req, self.body).map_err(|e| SourceError::Network {
            message: format!("request to {host} failed: {e}"),
        })?;

        match res.status_code() {
            200..=299 => String::from_utf8(res.body()).map_err(|e| SourceError::Parse {
                message: format!("response was not utf-8: {e}"),
            }),
            404 => Err(SourceError::NotFound {
                message: format!("{host} has no such entry"),
            }),
            401 | 403 => Err(SourceError::AuthRequired),
            429 => Err(SourceError::RateLimited {
                message: format!("{host} is rate-limiting requests"),
                retry_after_secs: retry_after(&res),
            }),
            status => Err(SourceError::Http { status }),
        }
    }

    pub fn json<T: DeserializeOwned>(self) -> SourceResult<T> {
        let host = host_of(&self.url).to_owned();
        let body = self.text()?;

        serde_json::from_str(&body).map_err(|e| SourceError::Parse {
            message: format!("unexpected response shape from {host}: {e}"),
        })
    }
}

fn host_of(url: &str) -> &str {
    url.split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .unwrap_or(url)
}

fn retry_after(res: &extism_pdk::HttpResponse) -> Option<u32> {
    res.headers()
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("retry-after"))
        .and_then(|(_, v)| v.trim().parse().ok())
}

pub fn get_text(url: &str) -> SourceResult<String> {
    Request::get(url).text()
}

pub fn get_json<T: DeserializeOwned>(url: &str) -> SourceResult<T> {
    Request::get(url).json()
}

pub fn setting(id: &str) -> Option<String> {
    extism_pdk::config::get(id).ok().flatten()
}

pub fn setting_or(id: &str, fallback: &str) -> String {
    setting(id).unwrap_or_else(|| fallback.to_owned())
}

pub fn setting_bool(id: &str, fallback: bool) -> bool {
    setting(id).and_then(|v| v.parse().ok()).unwrap_or(fallback)
}

pub fn setting_i32(id: &str, fallback: i32) -> i32 {
    setting(id).and_then(|v| v.parse().ok()).unwrap_or(fallback)
}

pub fn setting_list(id: &str) -> Vec<String> {
    setting(id)
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

pub fn setting_list_contains(id: &str, value: &str) -> bool {
    setting_list(id).iter().any(|v| v == value)
}
