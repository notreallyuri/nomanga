import { useMemo } from "react";
import { useDownloads } from "./services/use-downloads";
import { ALL_CATEGORIES, useLibrary } from "./services/use-library";

/**
 * Cover art for arbitrary (source, manga) pairs, assembled from lists the app
 * already loads.
 *
 * The download queue reports no cover of its own, and covers are only stored for
 * series that reached the `manga` table — library entries and backup imports —
 * so a series that was never added has none to find. Callers pair this with
 * `CoverImage`, whose placeholder covers the miss.
 *
 * `enabled` exists because the dialogs using this stay mounted while closed;
 * without it both queries would run at app start for a panel nobody opened.
 */
export function useMangaCovers(enabled: boolean) {
	const library = useLibrary(ALL_CATEGORIES, enabled);
	const downloads = useDownloads(enabled);

	return useMemo(() => {
		const covers = new Map<string, string>();

		// Downloads first, so a series still in the library wins on the fresher
		// list — a removed-but-still-downloaded series keeps its cover either way.
		for (const item of downloads.data ?? []) {
			if (item.cover_url)
				covers.set(key(item.source_id, item.manga_id), item.cover_url);
		}
		for (const item of library.data ?? []) {
			if (item.cover_url)
				covers.set(key(item.source_id, item.manga_id), item.cover_url);
		}

		return (sourceId: string, mangaId: string) =>
			covers.get(key(sourceId, mangaId)) ?? null;
	}, [library.data, downloads.data]);
}

const key = (sourceId: string, mangaId: string) => `${sourceId}/${mangaId}`;
