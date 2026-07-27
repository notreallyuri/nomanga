import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands } from "@/types/bindings";

export const imageCacheKeys = {
	stats: ["image-cache", "stats"] as const,
};

export function useImageCacheStats() {
	return useQuery({
		queryKey: imageCacheKeys.stats,
		queryFn: () => unwrap(commands.imageCacheStats()),
		// Browsing changes this constantly; the global 5-minute staleTime would
		// show a figure from several screens ago.
		staleTime: 0,
	});
}

export function useClearImageCache() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.clearImageCache()),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: imageCacheKeys.stats }),
	});
}
