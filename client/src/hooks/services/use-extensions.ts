import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import type { SourcePreference } from "@/types/bindings";
import { commands } from "@/types/bindings";
import { sourceKeys } from "./use-sources";

export const extensionKeys = {
	all: ["extensions"] as const,
	list: () => [...extensionKeys.all, "list"] as const,
	withPreferences: () => ["sources", "with-preferences"] as const,
};

export function useExtensions() {
	return useQuery({
		queryKey: extensionKeys.list(),
		queryFn: () => unwrap(commands.listExtensions()),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSourcesWithPreferences() {
	return useQuery({
		queryKey: extensionKeys.withPreferences(),
		queryFn: () => unwrap(commands.listSourcesWithPreferences()),
	});
}

const DEFAULT_PREFERENCE: Omit<SourcePreference, "source_id"> = {
	enabled: true,
	private: false,
	blur_covers: false,
	skip_updates: false,
	hide_from_search: false,
	default_category_id: null,
};

/**
 * Preferences for one source, off the same cached list the settings screen
 * uses. Returns defaults while the query is in flight or for a source that
 * has no stored row, so callers never have to branch on loading.
 */
export function useSourcePreference(sourceId: string): SourcePreference {
	const { data } = useSourcesWithPreferences();
	const stored = data?.find((row) => row.info.id === sourceId)?.preference;

	return stored ?? { source_id: sourceId, ...DEFAULT_PREFERENCE };
}

export function useInstallExtension() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (wasmPath: string) =>
			unwrap(commands.installExtension(wasmPath)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: extensionKeys.all });
			queryClient.invalidateQueries({ queryKey: sourceKeys.all });
			queryClient.invalidateQueries({
				queryKey: extensionKeys.withPreferences(),
			});
		},
	});
}

export function useUninstallExtension() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (extensionId: string) =>
			unwrap(commands.uninstallExtension(extensionId)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: extensionKeys.all });
			queryClient.invalidateQueries({ queryKey: sourceKeys.all });
			queryClient.invalidateQueries({
				queryKey: extensionKeys.withPreferences(),
			});
		},
	});
}

export function useSetSourcePreference() {
	const queryClient = useQueryClient();
	const key = extensionKeys.withPreferences();

	return useMutation({
		mutationFn: (preference: SourcePreference) =>
			unwrap(commands.setSourcePreference(preference)),
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous =
				queryClient.getQueryData<
					{ info: { id: string }; preference: SourcePreference }[]
				>(key);

			queryClient.setQueryData(key, (old: typeof previous) =>
				old?.map((row) =>
					row.info.id === next.source_id ? { ...row, preference: next } : row,
				),
			);

			return { previous };
		},
		onError: (_err, _next, context) => {
			if (context?.previous) {
				queryClient.setQueryData(key, context.previous);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["history"] });
		},
	});
}
