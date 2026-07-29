use base64::Engine;

const SIZE: u32 = 64;

/// Turns a favicon into a `data:` URI an extension can bake in with
/// `include_str!`, so the app never fetches it from the source's own server.
/// Everything is normalised to a small PNG: favicons are frequently `.ico`,
/// occasionally a 180px touch icon, and the app only ever draws them at 32px.
///
/// `source` is a URL or a local path — several sources hotlink-protect or
/// Cloudflare their favicon, and those have to be supplied as a file.
pub fn build(source: &str, out: &str) -> Result<(), Box<dyn std::error::Error>> {
    let bytes = if source.starts_with("http://") || source.starts_with("https://") {
        fetch(source)?
    } else {
        std::fs::read(source)?
    };

    if bytes.is_empty() {
        return Err(format!("{source} returned no data").into());
    }

    let image = image::load_from_memory(&bytes)
        .map_err(|e| format!("{source} is not an image this can read: {e}"))?;

    let resized = image.resize(SIZE, SIZE, image::imageops::FilterType::Lanczos3);

    let mut png = std::io::Cursor::new(Vec::new());
    resized.write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();

    let encoded = base64::engine::general_purpose::STANDARD.encode(&png);
    // No trailing newline: include_str! would carry it into the URI.
    std::fs::write(out, format!("data:image/png;base64,{encoded}"))?;

    println!(
        "{out}: {} bytes in -> {} bytes png -> {} bytes base64",
        bytes.len(),
        png.len(),
        encoded.len()
    );

    Ok(())
}

fn fetch(url: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut response = ureq::get(url)
        .header("User-Agent", nomanga_core::extension::common::USER_AGENT)
        .call()
        .map_err(|e| format!("could not fetch {url}: {e}"))?;

    if response.status() != 200 {
        return Err(format!("{url} returned {}", response.status()).into());
    }

    Ok(response.body_mut().read_to_vec()?)
}
