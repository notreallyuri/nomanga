import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands } from "@/types/bindings";

export const debugKeys = {
	state: ["debug", "state"] as const,
	table: (name: string, page: number) =>
		["debug", "table", name, page] as const,
};

export function useDebugState() {
	return useQuery({
		queryKey: debugKeys.state,
		queryFn: () => unwrap(commands.debugState()),
		staleTime: 0,
	});
}

export function useDebugTable(name: string, page: number) {
	return useQuery({
		queryKey: debugKeys.table(name, page),
		queryFn: () => unwrap(commands.debugTable(name, page)),
		staleTime: 0,
	});
}

export function useCallLog() {
	return useQuery({
		queryKey: ["debug", "call-log"] as const,
		queryFn: () => unwrap(commands.callLog()),
		staleTime: 0,
		// Poll only while the backend is actually recording — the log grows as
		// the user browses, and the flag outlives this dialog.
		refetchInterval: (query) => (query.state.data?.recording ? 1500 : false),
	});
}

export function useSetCallRecording() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (on: boolean) => unwrap(commands.setCallRecording(on)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["debug", "call-log"] }),
	});
}

export function useClearCallLog() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => unwrap(commands.clearCallLog()),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["debug", "call-log"] }),
	});
}

export function useExportCallLog() {
	return useMutation({
		mutationFn: (path: string) => unwrap(commands.exportCallLog(path)),
	});
}

export function useExportTableRows() {
	return useMutation({
		mutationFn: ({
			path,
			table,
			columns,
			rows,
		}: {
			path: string;
			table: string;
			columns: string[];
			rows: (string | null)[][];
		}) => unwrap(commands.exportTableRows(path, table, columns, rows)),
	});
}
