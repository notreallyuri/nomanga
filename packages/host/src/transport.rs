use extism::{Function, PTR, UserData, convert::Json, host_fn};
use nomanga_core::extension::common::{HostCookie, HostRequest, HostResponse};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub const EXPORT: &str = "nomanga_fetch";
pub const EXPORT_SET_COOKIE: &str = "nomanga_set_cookie";
pub const EXPORT_RANDOM_HEX: &str = "nomanga_random_hex";

pub type Fetcher = Arc<dyn Fn(HostRequest) -> HostResponse + Send + Sync>;
pub type CookieWriter = Arc<dyn Fn(&str, &str) + Send + Sync>;
pub type RandomHex = Arc<dyn Fn(usize) -> String + Send + Sync>;

#[derive(Debug, Clone)]
pub struct CallRecord {
    pub source_id: String,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub request_headers: Vec<(String, String)>,
    pub response_headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub body_bytes: usize,
    pub at: chrono::DateTime<chrono::Utc>,
}

pub struct CallLog {
    entries: Mutex<std::collections::VecDeque<CallRecord>>,
    capacity: usize,
    body_limit: usize,
}

impl CallLog {
    pub fn new(capacity: usize, body_limit: usize) -> Self {
        Self {
            entries: Mutex::new(std::collections::VecDeque::with_capacity(capacity)),
            capacity,
            body_limit,
        }
    }

    pub fn push(&self, mut record: CallRecord) {
        record.body.truncate(self.body_limit);

        let Ok(mut entries) = self.entries.lock() else {
            return;
        };
        if entries.len() == self.capacity {
            entries.pop_front();
        }
        entries.push_back(record);
    }

    pub fn snapshot(&self) -> Vec<CallRecord> {
        self.entries
            .lock()
            .map(|e| e.iter().rev().cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.clear();
        }
    }
}

impl Default for CallLog {
    fn default() -> Self {
        Self::new(200, 256 * 1024)
    }
}

pub fn denied() -> TransportShared {
    TransportShared {
        fetch: Arc::new(|_| HostResponse {
            status: 0,
            headers: Vec::new(),
            body: Vec::new(),
            transport_error: Some("network is not available while inspecting".to_owned()),
        }),
        set_cookie: Arc::new(|_, _| {}),
        random_hex: Arc::new(|bytes| "0".repeat(bytes * 2)),
        log: Arc::new(CallLog::default()),
        recording: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    }
}

#[derive(Clone)]
pub struct TransportShared {
    pub fetch: Fetcher,
    pub set_cookie: CookieWriter,
    pub random_hex: RandomHex,
    pub log: Arc<CallLog>,
    pub recording: Arc<std::sync::atomic::AtomicBool>,
}

impl TransportShared {
    pub fn context(&self, allowed_hosts: Vec<String>) -> TransportContext {
        TransportContext {
            fetch: self.fetch.clone(),
            set_cookie: self.set_cookie.clone(),
            random_hex: self.random_hex.clone(),
            log: self.log.clone(),
            recording: self.recording.clone(),
            allowed_hosts,
            source_id: String::new(),
        }
    }
}

pub struct TransportContext {
    pub fetch: Fetcher,
    pub set_cookie: CookieWriter,
    pub random_hex: RandomHex,
    pub log: Arc<CallLog>,
    pub allowed_hosts: Vec<String>,
    pub source_id: String,
    pub recording: Arc<std::sync::atomic::AtomicBool>,
}

impl TransportContext {
    fn is_allowed(&self, url: &str) -> bool {
        let Some(host) = host_of(url) else {
            return false;
        };
        self.allowed_hosts
            .iter()
            .any(|pattern| matches_host(pattern, host))
    }
}

fn host_of(url: &str) -> Option<&str> {
    let rest = url.split_once("://")?.1;
    let host = rest.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?;
    Some(host.split(':').next().unwrap_or(host))
}

fn matches_host(pattern: &str, host: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    match pattern.strip_prefix("*.") {
        Some(suffix) => host == suffix || host.ends_with(&format!(".{suffix}")),
        None => match pattern.strip_prefix('*') {
            Some(suffix) => host.ends_with(suffix),
            None => pattern.eq_ignore_ascii_case(host),
        },
    }
}

host_fn!(fetch_impl(user_data: TransportContext; req: Json<HostRequest>) -> Json<HostResponse> {
    let ctx = user_data.get()?;
    let ctx = ctx.lock().unwrap();

    let Json(request) = req;

    if !ctx.is_allowed(&request.url) {
        return Ok(Json(HostResponse {
            status: 0,
            headers: Vec::new(),
            body: Vec::new(),
            transport_error: Some(format!(
                "{} is not in this source's declared hosts",
                host_of(&request.url).unwrap_or("host")
            )),
        }));
    }

    let started = Instant::now();
    let request_headers = request.headers.clone();
    let url = request.url.clone();
    let method = request.method.clone();

    let response = (ctx.fetch)(request);

    if ctx.recording.load(std::sync::atomic::Ordering::Relaxed) {
        ctx.log.push(CallRecord {
            source_id: ctx.source_id.clone(),
            method,
            url,
            status: (response.transport_error.is_none()).then_some(response.status),
            error: response.transport_error.clone(),
            duration_ms: started.elapsed().as_millis() as u64,
            request_headers,
            response_headers: response.headers.clone(),
            body_bytes: response.body.len(),
            body: response.body.clone(),
            at: chrono::Utc::now(),
        });
    }

    Ok(Json(response))
});

host_fn!(set_cookie_impl(user_data: TransportContext; req: Json<HostCookie>) -> Json<bool> {
    let ctx = user_data.get()?;
    let ctx = ctx.lock().unwrap();

    let Json(cookie) = req;

    if !ctx.is_allowed(&cookie.url) {
        return Ok(Json(false));
    }

    (ctx.set_cookie)(&cookie.url, &cookie.cookie);
    Ok(Json(true))
});

host_fn!(random_hex_impl(user_data: TransportContext; bytes: u64) -> String {
    let ctx = user_data.get()?;
    let ctx = ctx.lock().unwrap();

    Ok((ctx.random_hex)(bytes.clamp(1, 64) as usize))
});

pub fn functions(ctx: TransportContext) -> (Vec<Function>, UserData<TransportContext>) {
    let data = UserData::new(ctx);
    let functions = vec![
        Function::new(EXPORT, [PTR], [PTR], data.clone(), fetch_impl),
        Function::new(
            EXPORT_SET_COOKIE,
            [PTR],
            [PTR],
            data.clone(),
            set_cookie_impl,
        ),
        Function::new(
            EXPORT_RANDOM_HEX,
            [extism::ValType::I64],
            [PTR],
            data.clone(),
            random_hex_impl,
        ),
    ];
    (functions, data)
}

pub fn set_source(data: &UserData<TransportContext>, source_id: &str) {
    if let Ok(ctx) = data.get()
        && let Ok(mut ctx) = ctx.lock()
    {
        ctx.source_id = source_id.to_owned();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_the_host_from_a_url() {
        assert_eq!(
            host_of("https://a.example.com/x?y=1"),
            Some("a.example.com")
        );
        assert_eq!(host_of("http://example.com:8080/x"), Some("example.com"));
        assert_eq!(host_of("not a url"), None);
    }

    #[test]
    fn honours_wildcards_the_way_extism_did() {
        assert!(matches_host("*", "anything.com"));
        assert!(matches_host("example.com", "example.com"));
        assert!(matches_host("*.example.com", "cdn.example.com"));
        assert!(matches_host("*.example.com", "example.com"));

        assert!(!matches_host("example.com", "evil.com"));
        assert!(!matches_host("*.example.com", "example.com.evil.com"));
        assert!(!matches_host("example.com", "notexample.com"));
    }

    #[test]
    fn drops_the_oldest_record_at_capacity() {
        let log = CallLog::new(2, 1024);
        for i in 0..3 {
            log.push(record(&format!("u{i}")));
        }

        let snap = log.snapshot();
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].url, "u2");
        assert_eq!(snap[1].url, "u1");
    }

    #[test]
    fn truncates_oversized_bodies() {
        let log = CallLog::new(4, 8);
        let mut r = record("u");
        r.body = vec![b'x'; 100];
        r.body_bytes = 100;
        log.push(r);

        let stored = &log.snapshot()[0];
        assert_eq!(stored.body.len(), 8);
        assert_eq!(stored.body_bytes, 100, "the real size is still reported");
    }

    fn record(url: &str) -> CallRecord {
        CallRecord {
            source_id: "src".into(),
            method: "GET".into(),
            url: url.into(),
            status: Some(200),
            error: None,
            duration_ms: 1,
            request_headers: Vec::new(),
            response_headers: Vec::new(),
            body: Vec::new(),
            body_bytes: 0,
            at: chrono::Utc::now(),
        }
    }
}
