import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands } from "@/types/bindings";
import { sourceKeys } from "./use-sources";

export const sourceSettingsKeys = {
	all: ["source-settings"] as const,
	forSource: (sourceId: string) =>
		[...sourceSettingsKeys.all, sourceId] as const,
};

export function useSourceSettings(sourceId: string | undefined) {
	return useQuery({
		queryKey: sourceSettingsKeys.forSource(sourceId ?? ""),
		queryFn: () => unwrap(commands.getSourceSettings(sourceId as string)),
		enabled: Boolean(sourceId),
		staleTime: 60 * 60 * 1000,
	});
}

export function useSaveSourceSettings(sourceId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (values: Record<string, string>) =>
			unwrap(commands.saveSourceSettings(sourceId, values)),

		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: sourceSettingsKeys.forSource(sourceId),
			});

			// Everything a source produced under the old settings, filters
			// included — saving drops their sqlite row too, so the refetch that
			// this triggers goes back to the source rather than to that cache.
			queryClient.invalidateQueries({ queryKey: sourceKeys.all });
		},
	});
}
