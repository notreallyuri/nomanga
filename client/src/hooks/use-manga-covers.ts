import { useMemo } from "react";
import { useDownloads } from "./services/use-downloads";
import { ALL_CATEGORIES, useLibrary } from "./services/use-library";

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
