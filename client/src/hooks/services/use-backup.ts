import { useMutation } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands, type ImportMode } from "@/types/bindings";

export function useExportBackup() {
	return useMutation({
		mutationFn: (path: string) => unwrap(commands.exportBackup(path)),
	});
}

export function useImportBackup() {
	return useMutation({
		mutationFn: ({ path, mode }: { path: string; mode: ImportMode }) =>
			unwrap(commands.importBackup(path, mode)),
	});
}

export function restartApp() {
	return commands.restartApp();
}
