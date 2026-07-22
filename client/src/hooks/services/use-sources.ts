import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
