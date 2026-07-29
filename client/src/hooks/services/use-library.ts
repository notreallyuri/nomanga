import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type NomangaError, unwrap } from "@/lib/unwrap";
import {
	type CategoryFilter,
	type CategoryOptions,
	commands,
	type EntryRef,
	events,
	type LibraryRefreshProgress,
	type LibrarySearch,
	type Manga,
	type MangaSimple,
	type RefreshScope,
} from "@/types/bindings";

export const ALL_CATEGORIES: CategoryFilter = { type: "All" };

export const libraryKeys = {
	all: ["library"] as const,
	list: (filter: CategoryFilter, search?: LibrarySearch | null) =>
		[...libraryKeys.all, "list", filter, search ?? null] as const,
	membership: (sourceId: string, mangaId: string) =>
		[...libraryKeys.all, "member", sourceId, mangaId] as const,
	categories: () => [...libraryKeys.all, "categories"] as const,
	entryCategories: (sourceId: string, mangaId: string) =>
		[...libraryKeys.all, "entry-categories", sourceId, mangaId] as const,
	updates: () => [...libraryKeys.all, "updates"] as const,
	lock: () => [...libraryKeys.all, "lock"] as const,
};

export function useLibrary(
	filter: CategoryFilter = ALL_CATEGORIES,
	enabled = true,
	search: LibrarySearch | null = null,
) {
	return useQuery({
		queryKey: libraryKeys.list(filter, search),
		queryFn: () => unwrap(commands.listLibrary(filter, search)),
		enabled,
	});
}

export function useCategories() {
	return useQuery({
		queryKey: libraryKeys.categories(),
		queryFn: () => unwrap(commands.listCategories()),
	});
}

export function useEntryCategories(
	sourceId: string,
	mangaId: string,
	enabled = true,
) {
	return useQuery({
		queryKey: libraryKeys.entryCategories(sourceId, mangaId),
		queryFn: () => unwrap(commands.categoriesForEntry(sourceId, mangaId)),
		enabled,
	});
}

export function useIsInLibrary(
	sourceId: string | undefined,
	mangaId: string | undefined,
) {
	return useQuery({
		queryKey: libraryKeys.membership(sourceId ?? "", mangaId ?? ""),
		queryFn: () =>
			unwrap(commands.isInLibrary(sourceId as string, mangaId as string)),
		enabled: Boolean(sourceId && mangaId),
	});
}

/**
 * `entry` is the metadata the caller already holds. Passing it lets the add
 * cache and save in one transaction, which is what makes the button work on a
 * browse or search card whose details page was never opened.
 *
 * `chapterCount` is seeded straight into the entry so its unread badge is
 * right away; callers without one fall back to a background fetch, since an
 * entry with no chapter count shows no badge at all.
 */
export function useToggleLibrary(
	sourceId: string,
	mangaId: string,
	entry?: Manga | MangaSimple,
	chapterCount?: number,
) {
	const queryClient = useQueryClient();
	const membershipKey = libraryKeys.membership(sourceId, mangaId);

	const settle = () => {
		queryClient.invalidateQueries({
			queryKey: [...libraryKeys.all, "list"],
		});
		queryClient.invalidateQueries({ queryKey: membershipKey });
	};

	const optimistic = (next: boolean) => async () => {
		await queryClient.cancelQueries({ queryKey: membershipKey });
		const previous = queryClient.getQueryData<boolean>(membershipKey);
		queryClient.setQueryData(membershipKey, next);
		return { previous };
	};

	const rollback = (
		_err: NomangaError,
		_vars: unknown,
		context: { previous?: boolean } | undefined,
	) => {
		if (context?.previous !== undefined) {
			queryClient.setQueryData(membershipKey, context.previous);
		}
	};

	const add = useMutation({
		mutationFn: async () => {
			if (!entry) {
				return unwrap(
					commands.addToLibrary(sourceId, mangaId, chapterCount ?? null),
				);
			}

			if ("tags" in entry) {
				return unwrap(
					commands.addMangaToLibrary(sourceId, entry, chapterCount ?? null),
				);
			}

			return unwrap(commands.addListingToLibrary(sourceId, entry));
		},
		onMutate: optimistic(true),
		onError: rollback,
		onSuccess: async () => {
			if (chapterCount !== undefined) return;

			// Best effort: a source that is down or rate limited just leaves the
			// count to the next refresh run.
			try {
				await unwrap(commands.cacheEntryChapters(sourceId, mangaId));
				queryClient.invalidateQueries({
					queryKey: [...libraryKeys.all, "list"],
				});
			} catch {
				// ignored
			}
		},
		onSettled: settle,
	});

	const remove = useMutation({
		mutationFn: () => unwrap(commands.removeFromLibrary(sourceId, mangaId)),
		onMutate: optimistic(false),
		onError: rollback,
		onSettled: settle,
	});

	return { add, remove };
}

function useCategoryMutation<TVariables>(
	mutationFn: (variables: TVariables) => Promise<unknown>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: libraryKeys.all });
		},
	});
}

export function useCreateCategory() {
	return useCategoryMutation((name: string) =>
		unwrap(commands.createCategory(name)),
	);
}

export function useRenameCategory() {
	return useCategoryMutation(
		({ categoryId, name }: { categoryId: string; name: string }) =>
			unwrap(commands.renameCategory(categoryId, name)),
	);
}

export function useUpdateCategoryOptions() {
	return useCategoryMutation(
		({
			categoryId,
			options,
		}: {
			categoryId: string;
			options: CategoryOptions;
		}) => unwrap(commands.updateCategoryOptions(categoryId, options)),
	);
}

export function useDeleteCategory() {
	return useCategoryMutation((categoryId: string) =>
		unwrap(commands.deleteCategory(categoryId)),
	);
}

export function useReorderCategories() {
	return useCategoryMutation((categoryIds: string[]) =>
		unwrap(commands.reorderCategories(categoryIds)),
	);
}

export function useSetEntryCategories(sourceId: string, mangaId: string) {
	return useCategoryMutation((categoryIds: string[]) =>
		unwrap(commands.setEntryCategories(sourceId, mangaId, categoryIds)),
	);
}

/** Whether a library password exists at all — categories can only gate behind one. */
export function useLibraryLockIsSet() {
	return useQuery({
		queryKey: libraryKeys.lock(),
		queryFn: () => unwrap(commands.libraryLockIsSet()),
	});
}

export function useVerifyLibraryPassword() {
	return useMutation({
		mutationFn: (password: string) =>
			unwrap(commands.verifyLibraryPassword(password)),
	});
}

export function useSetLibraryPassword() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			current,
			password,
		}: {
			current: string | null;
			password: string;
		}) => unwrap(commands.setLibraryPassword(current, password)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: libraryKeys.lock() }),
	});
}

/** The reset path: drops the password and unlocks every category with it. */
export function useClearLibraryLock() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.clearLibraryLock()),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
	});
}

export function useLibraryUpdates(limit = 30) {
	return useQuery({
		queryKey: libraryKeys.updates(),
		queryFn: () => unwrap(commands.libraryUpdates(limit)),
	});
}

export function useClearLibraryUpdates() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.clearLibraryUpdates()),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: libraryKeys.updates() });
		},
	});
}

/**
 * Drives a scoped library refresh and exposes live progress from the backend's
 * `library-refresh-progress` events, so callers can render a determinate bar.
 */
export function useLibraryRefresh() {
	const queryClient = useQueryClient();
	const [progress, setProgress] = useState<LibraryRefreshProgress | null>(null);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		events.libraryRefreshProgress
			.listen((event) => {
				const p = event.payload;
				const running = p.total > 0 && p.done < p.total;
				setProgress(running ? p : null);
				// A completed run (including a background check) may have added chapters.
				if (p.total > 0 && p.done >= p.total) {
					queryClient.invalidateQueries({ queryKey: libraryKeys.all });
				}
			})
			.then((fn) => {
				unlisten = fn;
			});
		return () => unlisten?.();
	}, [queryClient]);

	const mutation = useMutation({
		mutationFn: ({
			scope,
			force,
		}: {
			scope: RefreshScope;
			force: boolean;
			silent: boolean;
		}) => unwrap(commands.refreshLibrary(scope, force)),
		// A silent run (the throttled auto-check on launch) shouldn't announce
		// itself; explicit refreshes report their result.
		onSuccess: (summary, { silent }) => {
			if (silent) return;
			toast.success(
				summary.new_chapters > 0
					? `${summary.new_chapters} new chapter${summary.new_chapters === 1 ? "" : "s"} across ${summary.checked} series`
					: "No new chapters",
			);
		},
		onError: (e, { silent }) => {
			if (!silent) toast.error(e.message);
		},
		onSettled: () => {
			setProgress(null);
			queryClient.invalidateQueries({ queryKey: libraryKeys.all });
		},
	});

	const percent =
		progress && progress.total > 0
			? Math.round((progress.done / progress.total) * 100)
			: 0;

	return {
		refresh: (scope: RefreshScope, force = true, silent = false) =>
			mutation.mutate({ scope, force, silent }),
		summary: mutation.data,
		isRefreshing: mutation.isPending,
		progress,
		percent,
	};
}

export function useBulkCategoryCounts(entries: EntryRef[], enabled = true) {
	return useQuery({
		queryKey: [...libraryKeys.all, "bulk-counts", entries],
		queryFn: () => unwrap(commands.bulkCategoryCounts(entries)),
		enabled: enabled && entries.length > 0,
	});
}

export function useBulkRemove() {
	return useCategoryMutation(async (entries: EntryRef[]) => {
		for (const entry of entries) {
			await unwrap(commands.removeFromLibrary(entry.source_id, entry.manga_id));
		}
	});
}

export function useBulkUpdateCategories() {
	return useCategoryMutation(
		({
			entries,
			add,
			remove,
		}: {
			entries: EntryRef[];
			add: string[];
			remove: string[];
		}) => unwrap(commands.bulkUpdateCategories(entries, add, remove)),
	);
}
