use nomanga_core::extension::common::{HostRequest, HostResponse};
use nomanga_host::transport::{CallLog, TransportShared};
use reqwest::cookie::CookieStore;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};

pub fn shared(client: reqwest::Client, jar: Arc<reqwest::cookie::Jar>) -> TransportShared {
    let (tx, rx) = mpsc::channel::<(HostRequest, mpsc::Sender<HostResponse>)>();

    // One long-lived receiver task; the channel is the only synchronisation
    // point between the wasm thread and the runtime.
    tauri::async_runtime::spawn(async move {
        while let Ok((request, reply)) = rx.recv() {
            let response = perform(&client, request).await;
            let _ = reply.send(response);
        }
    });

    let sender = Arc::new(std::sync::Mutex::new(tx));

    TransportShared {
        fetch: Arc::new(move |request| {
            let (reply_tx, reply_rx) = mpsc::channel();

            let queued = sender
                .lock()
                .map_err(|_| "transport is poisoned".to_owned())
                .and_then(|tx| {
                    tx.send((request, reply_tx))
                        .map_err(|_| "transport has shut down".to_owned())
                });

            match queued {
                Ok(()) => reply_rx.recv().unwrap_or_else(|_| failed("no reply")),
                Err(message) => failed(&message),
            }
        }),
        set_cookie: Arc::new(move |url, cookie| {
            if let Ok(url) = url.parse::<reqwest::Url>() {
                jar.set_cookies(&mut std::iter::once(&header_value(cookie)), &url);
            }
        }),
        random_hex: Arc::new(|bytes| {
            let mut buf = vec![0u8; bytes];
            getrandom::fill(&mut buf).expect("no system entropy");
            buf.iter().map(|b| format!("{b:02x}")).collect()
        }),
        log: Arc::new(CallLog::default()),
        recording: Arc::new(AtomicBool::new(false)),
    }
}

fn header_value(cookie: &str) -> reqwest::header::HeaderValue {
    reqwest::header::HeaderValue::from_str(cookie)
        .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static(""))
}

async fn perform(client: &reqwest::Client, request: HostRequest) -> HostResponse {
    let mut builder = match request.method.as_str() {
        "POST" => client.post(&request.url),
        "PUT" => client.put(&request.url),
        "DELETE" => client.delete(&request.url),
        _ => client.get(&request.url),
    };

    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = match builder.send().await {
        Ok(response) => response,
        Err(e) => return failed(&e.to_string()),
    };

    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_owned()))
        .collect();

    match response.bytes().await {
        Ok(body) => HostResponse {
            status,
            headers,
            body: body.to_vec(),
            transport_error: None,
        },
        Err(e) => failed(&e.to_string()),
    }
}

fn failed(message: &str) -> HostResponse {
    HostResponse {
        status: 0,
        headers: Vec::new(),
        body: Vec::new(),
        transport_error: Some(message.to_owned()),
    }
}

pub fn set_recording(shared: &TransportShared, on: bool) {
    shared.recording.store(on, Ordering::Relaxed);

    // A full log is two hundred records each holding up to 256 KB of response
    // body, and nothing else ever drops them -- so leaving recording on for a
    // browse and turning it off again would otherwise cost tens of megabytes for
    // the rest of the session. Switching it off is the user saying they are done
    // with what was captured.
    if !on {
        shared.log.clear();
    }
}
