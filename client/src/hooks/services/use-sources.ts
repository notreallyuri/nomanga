import {
	useIsFetching,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import type { SearchQuery, SectionRef } from "@/types/bindings";
import { commands } from "@/types/bindings";

export const sourceKeys = {
	all: ["sources"] as const,
	list: () => [...sourceKeys.all, "list"] as const,
	homepage: (sourceId: string) =>
		[...sourceKeys.all, sourceId, "homepage"] as const,
	filters: (sourceId: string) =>
		[...sourceKeys.all, sourceId, "filters"] as const,
	search: (sourceId: string, query: SearchQuery) =>
		[...sourceKeys.all, sourceId, "search", query] as const,
	manga: (sourceId: string, mangaId: string) =>
		[...sourceKeys.all, sourceId, "manga", mangaId] as const,
	chapters: (sourceId: string, mangaId: string) =>
		[...sourceKeys.all, sourceId, "chapters", mangaId] as const,
	pages: (sourceId: string, mangaId: string, chapterId: string) =>
		[...sourceKeys.all, sourceId, "pages", mangaId, chapterId] as const,
};

/**
 * Drops everything cached for one source and refetches whatever is on screen.
 * Queries default to a five-minute `staleTime` with no refetch on focus, so
 * without this a source's homepage cannot be reloaded short of restarting.
 *
 * The key is the source's whole prefix — homepage, search, sections, and any
 * titles opened from it. Only the mounted queries refetch; the rest are just
 * marked stale for their next visit.
 *
 * Filters are the exception. They sit behind a day-long sqlite cache that this
 * does not touch, so a refetch here answers from the stored list — see
 * `useRefreshSourceFilters` for the way past it.
 */
export function useSourceRefresh(sourceId: string) {
	const queryClient = useQueryClient();
	const key = [...sourceKeys.all, sourceId];

	return {
		isRefreshing: useIsFetching({ queryKey: key }) > 0,
		refresh: () => queryClient.invalidateQueries({ queryKey: key }),
	};
}

/**
 * Drops the stored filter list so the next read goes back to the source.
 *
 * Deliberately not part of `useSourceRefresh`: a source's filters change far
 * more rarely than its homepage, and a source that builds them from the network
 * — nhentai fetches its tag list — would spend a request against its rate limit
 * on every refresh click to be told the same thing. The day-long cache and a
 * version bump cover the normal case; this covers the rest.
 */
export function useRefreshSourceFilters(sourceId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.invalidateSourceFilters(sourceId)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: sourceKeys.filters(sourceId) }),
	});
}

export function useSources() {
	return useQuery({
		queryKey: sourceKeys.list(),
		queryFn: () => unwrap(commands.listSources()),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSourceHomepage(sourceId: string | undefined) {
	return useQuery({
		queryKey: sourceKeys.homepage(sourceId ?? ""),
		queryFn: () => unwrap(commands.sourceHomepage(sourceId as string)),
		enabled: Boolean(sourceId),
	});
}

export function useSourceFilters(sourceId: string | undefined) {
	return useQuery({
		queryKey: sourceKeys.filters(sourceId ?? ""),
		queryFn: () => unwrap(commands.sourceFilters(sourceId as string)),
		enabled: Boolean(sourceId),
		staleTime: 60 * 60 * 1000,
	});
}

export function useSourceSearch(
	sourceId: string | undefined,
	query: SearchQuery,
	enabled = true,
) {
	return useQuery({
		queryKey: sourceKeys.search(sourceId ?? "", query),
		queryFn: () => unwrap(commands.sourceSearch(sourceId as string, query)),
		enabled: Boolean(sourceId) && enabled,
	});
}

export function useSourceSection(
	sourceId: string | undefined,
	section: SectionRef,
) {
	return useQuery({
		queryKey: [...sourceKeys.all, sourceId, "section", section],
		queryFn: () => unwrap(commands.sourceSection(sourceId as string, section)),
		enabled: Boolean(sourceId),
	});
}

export function useSourceManga(
	sourceId: string | undefined,
	mangaId: string | undefined,
) {
	return useQuery({
		queryKey: sourceKeys.manga(sourceId ?? "", mangaId ?? ""),
		queryFn: () =>
			unwrap(commands.sourceManga(sourceId as string, mangaId as string)),
		enabled: Boolean(sourceId && mangaId),
	});
}

export function useSourceChapters(
	sourceId: string | undefined,
	mangaId: string | undefined,
) {
	return useQuery({
		queryKey: sourceKeys.chapters(sourceId ?? "", mangaId ?? ""),
		queryFn: () =>
			unwrap(commands.sourceChapters(sourceId as string, mangaId as string)),
		enabled: Boolean(sourceId && mangaId),
		// Always re-check the source on entry so adds/rewrites show up; the cached
		// list stays visible while it revalidates (stale-while-revalidate).
		staleTime: 0,
		refetchOnMount: "always",
	});
}

export function useSourcePages(
	sourceId: string | undefined,
	mangaId: string | undefined,
	chapterId: string | undefined,
) {
	return useQuery({
		queryKey: sourceKeys.pages(sourceId ?? "", mangaId ?? "", chapterId ?? ""),
		queryFn: () =>
			unwrap(
				commands.sourcePages(
					sourceId as string,
					mangaId as string,
					chapterId as string,
				),
			),
		enabled: Boolean(sourceId && mangaId && chapterId),
	});
}

export function useInstallExtension() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (wasmPath: string) =>
			unwrap(commands.installExtension(wasmPath)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sourceKeys.all });
		},
	});
}
