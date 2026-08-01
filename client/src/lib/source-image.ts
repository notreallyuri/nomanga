import { convertFileSrc } from "@tauri-apps/api/core";

const SCHEME = "srcimg";

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
