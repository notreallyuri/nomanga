import { convertFileSrc } from "@tauri-apps/api/core";

const SCHEME = "srcimg";

/**
 * Routes a remote source image through the backend so the request carries the
 * source's `Referer` header.
 *
 * Several sources hotlink-protect their CDNs and 403 anything without it —
 * NatoManga covers and pages, WEBTOON pages. An `<img src>` in the webview
 * sends the app's own origin instead, and `referrerPolicy` can only reduce a
 * referer, never forge a cross-origin one, so the fetch has to happen in Rust.
 *
 * Safe to apply to every source image: for CDNs that do not care, the proxy is
 * a pass-through.
 */
export function sourceImageUrl(
	sourceId: string | undefined,
	url: string | undefined | null,
	options?: { cache?: boolean },
): string {
	if (!url) return "";

	// Local files (offline reading) already come back as asset-protocol URLs,
	// and anything non-http has nothing to proxy.
	if (!url.startsWith("http://") && !url.startsWith("https://")) return url;
	if (!sourceId) return url;

	// Only covers opt into the disk cache; reader pages would swamp it.
	const cache = options?.cache ? "&cache=1" : "";

	return `${convertFileSrc(sourceId, SCHEME)}?url=${encodeURIComponent(url)}${cache}`;
}
