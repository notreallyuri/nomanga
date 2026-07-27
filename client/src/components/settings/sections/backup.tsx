import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { SettingAction } from "@/components/settings/components/parts";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	restartApp,
	useExportBackup,
	useImportBackup,
} from "@/hooks/services/use-backup";
import type { ImportMode, ImportReport } from "@/types/bindings";

const FILTERS = [{ name: "nomanga backup", extensions: ["backup"] }];

function defaultName() {
	const stamp = new Date().toISOString().slice(0, 10);
	return `nomanga-${stamp}.backup`;
}

export function BackupGroup() {
	const exportBackup = useExportBackup();
	const importBackup = useImportBackup();

	const [pending, setPending] = useState<string | null>(null);
	const [report, setReport] = useState<ImportReport | null>(null);

	const runExport = async () => {
		const path = await save({ defaultPath: defaultName(), filters: FILTERS });
		if (!path) return;

		exportBackup.mutate(path, {
			onSuccess: () => toast.success("Backup saved"),
			onError: (e) => toast.error(e.message),
		});
	};

	const pickFile = async () => {
		const path = await open({ multiple: false, filters: FILTERS });
		if (typeof path !== "string") return;
		setPending(path);
	};

	const runImport = (mode: ImportMode) => {
		if (!pending) return;
		const path = pending;
		setPending(null);

		importBackup.mutate(
			{ path, mode },
			{
				onSuccess: setReport,
				onError: (e) => toast.error(e.message),
			},
		);
	};

	return (
		<>
			<SettingAction
				actionLabel={exportBackup.isPending ? "Saving…" : "Export"}
				description="Library, categories, reading history, and settings. Downloads and cached covers are not included."
				disabled={exportBackup.isPending}
				label="Export backup"
				onAction={runExport}
			/>
			<SettingAction
				actionLabel={importBackup.isPending ? "Restoring…" : "Restore"}
				description="Read a backup file back into this device."
				disabled={importBackup.isPending}
				label="Restore backup"
				onAction={pickFile}
			/>

			<AlertDialog
				onOpenChange={(o) => !o && setPending(null)}
				open={pending !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							How should this backup be applied?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Merge adds what is missing and keeps whichever reading progress is
							further along. Replace deletes your current library, categories
							and history first, leaving exactly what the backup contains.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<Button onClick={() => runImport("Replace")} variant="destructive">
							Replace everything
						</Button>
						<AlertDialogAction onClick={() => runImport("Merge")}>
							Merge
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog onOpenChange={(o) => !o && setReport(null)} open={!!report}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Backup restored</AlertDialogTitle>
						<AlertDialogDescription>
							{report?.entries} series, {report?.categories} new categories,{" "}
							{report?.read_chapters} read chapters and {report?.progress}{" "}
							progress records were applied. Restart to finish applying the
							restored settings.
						</AlertDialogDescription>
						{!!report?.missing_extensions.length && (
							<p className="text-destructive text-sm">
								Not installed here:{" "}
								{report.missing_extensions.map((e) => e.id).join(", ")}. Those
								series will not load until you install them.
							</p>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Later</AlertDialogCancel>
						<AlertDialogAction onClick={() => restartApp()}>
							Restart now
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
