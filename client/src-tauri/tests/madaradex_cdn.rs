//! The MadaraDex image CDN rejects anything missing the shield cookie pair, and
//! only the extension can mint them — so the contract under test spans the wasm
//! guest, the host jar and the app's own image fetch.

use nomanga_core::extension::query::ChapterRef;
use reqwest::cookie::CookieStore;

const WASM: &str = "../../target/wasm32-unknown-unknown/release/extension_nsfw.wasm";
const SOURCE: &str = "org.madaradex";
const BASE_URL: &str = "https://madaradex.org";

/// `Domain=.madaradex.org` has to reach the CDN subdomain; a cookie stored
/// against the apex only would leave the token unusable where it is needed.
#[test]
fn a_seeded_cookie_is_offered_to_the_cdn_subdomain() {
    let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
    let origin: reqwest::Url = BASE_URL.parse().unwrap();

    jar.set_cookies(
        &mut std::iter::once(
            &reqwest::header::HeaderValue::from_static(
                "mdx_fp=abc123; Domain=.madaradex.org; Path=/",
            ),
        ),
        &origin,
    );

    let cdn: reqwest::Url = "https://cdn.madaradex.org/x/0.webp".parse().unwrap();
    let sent = jar.cookies(&cdn).expect("cookie was not offered to the cdn");

    assert!(sent.to_str().unwrap().contains("mdx_fp=abc123"));
}

#[test]
#[ignore = "hits madaradex.org; run with --ignored"]
fn pages_authorize_the_session_so_images_load() {
    let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
    let http = reqwest::Client::builder()
        .user_agent(nomanga_core::extension::common::USER_AGENT)
        .cookie_provider(jar.clone())
        .build()
        .unwrap();

    let transport = nomanga_client_lib::transport::shared(http.clone(), jar.clone());

    let metadata = nomanga_host::ExtensionMetadata::inspect(WASM).expect("extension did not load");
    let mut extension = metadata
        .activate(
            metadata.all_hosts(),
            Default::default(),
            transport.context(metadata.all_hosts()),
        )
        .expect("extension did not activate");

    let pages = extension
        .pages(
            SOURCE,
            ChapterRef {
                manga_id: "circles".into(),
                chapter_id: "chapter-3".into(),
            },
        )
        .expect("pages failed");

    assert!(!pages.is_empty(), "no pages parsed");
    assert!(pages[0].image_url.starts_with("https://cdn.madaradex.org/"));

    // Exactly what image_proxy.rs does: same client, same jar, source base_url
    // as the referer.
    let runtime = tokio::runtime::Runtime::new().unwrap();
    for page in pages.iter().take(3) {
        let status = runtime
            .block_on(async {
                http.get(&page.image_url)
                    .header(reqwest::header::REFERER, BASE_URL)
                    .send()
                    .await
                    .map(|r| r.status())
            })
            .unwrap_or_else(|e| panic!("page {} never reached the cdn: {e}", page.number));

        assert_eq!(status, 200, "page {} was rejected by the cdn", page.number);
    }
}
