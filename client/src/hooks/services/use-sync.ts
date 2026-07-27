import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands } from "@/types/bindings";

export const syncKeys = {
	status: ["sync", "status"] as const,
};

export function useSyncStatus() {
	return useQuery({
		queryKey: syncKeys.status,
		queryFn: () => unwrap(commands.syncStatus()),
		staleTime: 0,
	});
}

export function useSetSyncFolder() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (path: string | null) => unwrap(commands.setSyncFolder(path)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: syncKeys.status }),
	});
}

export function useSetSyncHooks() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			postPush,
			prePull,
		}: {
			postPush: string | null;
			prePull: string | null;
		}) => unwrap(commands.setSyncHooks(postPush, prePull)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: syncKeys.status }),
	});
}

export function useSyncPush() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.syncPush()),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: syncKeys.status }),
	});
}

export function useSyncPull() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.syncPull()),
		onSuccess: () => queryClient.invalidateQueries(),
	});
}
