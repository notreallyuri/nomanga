import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands, type HistoryEntryRef } from "@/types/bindings";
import { libraryKeys } from "./use-library";

// Read-state changes shift a series' unread count, which the library grid/list
// shows; without this the count stays stale behind the global 5-min staleTime.
const LIBRARY_LIST_KEY = [...libraryKeys.all, "list"] as const;

export const historyKeys = {
	all: ["history"] as const,
	continueReading: (limit: number) =>
		[...historyKeys.all, "continue", limit] as const,
	readChapters: (sourceId: string, mangaId: string) =>
		[...historyKeys.all, "read", sourceId, mangaId] as const,
	progress: (sourceId: string, mangaId: string) =>
		[...historyKeys.all, "progress", sourceId, mangaId] as const,
};

export function useContinueReading(limit = 20) {
	return useQuery({
		queryKey: historyKeys.continueReading(limit),
		queryFn: () => unwrap(commands.continueReading(limit)),
	});
}

export function useRemoveHistoryEntries() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (entries: HistoryEntryRef[]) =>
			unwrap(commands.removeHistoryEntries(entries)),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: historyKeys.all });
		},
	});
}

export function useReadChapters(
	sourceId: string | undefined,
	mangaId: string | undefined,
) {
	return useQuery({
		queryKey: historyKeys.readChapters(sourceId ?? "", mangaId ?? ""),
		queryFn: async () => {
			const ids = await unwrap(
				commands.readChaptersForManga(sourceId as string, mangaId as string),
			);
			return new Set(ids);
		},
		enabled: Boolean(sourceId && mangaId),
	});
}

export function useProgress(
	sourceId: string | undefined,
	mangaId: string | undefined,
) {
	return useQuery({
		queryKey: historyKeys.progress(sourceId ?? "", mangaId ?? ""),
		queryFn: () =>
			unwrap(commands.getProgress(sourceId as string, mangaId as string)),
		enabled: Boolean(sourceId && mangaId),
	});
}

export function useMarkChapterRead(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ chapterId, read }: { chapterId: string; read: boolean }) =>
			read
				? unwrap(commands.markChapterRead(sourceId, mangaId, chapterId))
				: unwrap(commands.markChapterUnread(sourceId, mangaId, chapterId)),
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: historyKeys.readChapters(sourceId, mangaId),
			});
			queryClient.invalidateQueries({ queryKey: LIBRARY_LIST_KEY });
		},
	});
}

export function useMarkChaptersRead(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (chapterIds: string[]) =>
			unwrap(commands.markChaptersRead(sourceId, mangaId, chapterIds)),
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: historyKeys.readChapters(sourceId, mangaId),
			});
			queryClient.invalidateQueries({ queryKey: LIBRARY_LIST_KEY });
		},
	});
}

export function useMarkChaptersUnread(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (chapterIds: string[]) =>
			unwrap(commands.markChaptersUnread(sourceId, mangaId, chapterIds)),
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: historyKeys.readChapters(sourceId, mangaId),
			});
			queryClient.invalidateQueries({ queryKey: LIBRARY_LIST_KEY });
		},
	});
}

export function useFinishChapter(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			chapterId,
			lastPage,
		}: {
			chapterId: string;
			lastPage: number;
		}) =>
			unwrap(commands.finishChapter(sourceId, mangaId, chapterId, lastPage)),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: historyKeys.all });
			queryClient.invalidateQueries({ queryKey: LIBRARY_LIST_KEY });
		},
	});
}

export function useUpdateProgress(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			chapterId,
			page,
			chapterDone,
		}: {
			chapterId: string;
			page: number;
			chapterDone: boolean;
		}) =>
			unwrap(
				commands.updateProgress(
					sourceId,
					mangaId,
					chapterId,
					page,
					chapterDone,
				),
			),
		// The reader writes progress on every page turn but never remounts the
		// manga page, so an invalidate wouldn't refetch until a reload. Patch the
		// cache directly instead — both the reader and the manga page read it live.
		onSuccess: (_data, { chapterId, page, chapterDone }) => {
			queryClient.setQueryData(
				historyKeys.progress(sourceId, mangaId),
				(prev) => ({
					...(prev ?? {}),
					source_id: sourceId,
					manga_id: mangaId,
					last_chapter_id: chapterId,
					last_page: page,
					last_chapter_done: chapterDone,
					updated_at: new Date().toISOString(),
				}),
			);
		},
	});
}
