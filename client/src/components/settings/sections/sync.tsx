import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import {
	SettingAction,
	SettingRow,
} from "@/components/settings/components/parts";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restartApp } from "@/hooks/services/use-backup";
import {
	useSetSyncFolder,
	useSetSyncHooks,
	useSyncPull,
	useSyncPush,
	useSyncStatus,
} from "@/hooks/services/use-sync";
import { formatRelativeTime } from "@/lib/utils";

export function SyncGroup() {
	const status = useSyncStatus();
	const setFolder = useSetSyncFolder();
	const push = useSyncPush();
	const pull = useSyncPull();

	const [confirmPull, setConfirmPull] = useState(false);
	const [pulled, setPulled] = useState(false);

	const data = status.data;

	const pickFolder = async () => {
		const path = await open({ directory: true, multiple: false });
		if (typeof path !== "string") return;
		setFolder.mutate(path, { onError: (e) => toast.error(e.message) });
	};

	if (!data) return null;

	const configured = Boolean(data.folder);
	const hooked = Boolean(data.post_push_command || data.pre_pull_command);

	const remote = data.remote_created_at
		? `${data.remote_device_name} · ${formatRelativeTime(data.remote_created_at)}`
		: "No snapshot yet";

	return (
		<>
			<SettingRow
				description={
					hooked
						? `Staging only — your commands carry snapshots to and from the remote. ${data.folder ?? ""}`
						: (data.folder ??
							"Point this at a shared or cloud-synced folder your other device can read.")
				}
				label="Sync folder"
			>
				<Button onClick={pickFolder} size="sm" variant="outline">
					{configured ? "Change" : "Choose folder"}
				</Button>
			</SettingRow>

			<SettingRow
				description={
					configured
						? data.remote_is_this_device
							? `${remote} (this device)`
							: remote
						: `Push writes a snapshot to the folder, Pull reads it back. This device is "${data.device_name}".`
				}
				label="Latest snapshot"
			>
				<div className="flex gap-2">
					<Button
						disabled={!configured || push.isPending}
						onClick={() =>
							push.mutate(undefined, {
								onSuccess: () => toast.success("Snapshot pushed"),
								onError: (e) => toast.error(e.message),
							})
						}
						size="sm"
						variant="outline"
					>
						{push.isPending ? "Pushing…" : "Push"}
					</Button>
					<Button
						disabled={!configured || pull.isPending || !data.remote_created_at}
						onClick={() => setConfirmPull(true)}
						size="sm"
						variant="outline"
					>
						{pull.isPending ? "Pulling…" : "Pull"}
					</Button>
				</div>
			</SettingRow>

			<HookFields
				postPush={data.post_push_command}
				prePull={data.pre_pull_command}
			/>

			{data.local_changes_since_remote && (
				<p className="pb-4 text-destructive text-xs">
					This device has activity newer than that snapshot. Pulling replaces
					your library with the snapshot and discards it — push first if you
					want to keep it.
				</p>
			)}

			<AlertDialog onOpenChange={setConfirmPull} open={confirmPull}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Replace this device's library?</AlertDialogTitle>
						<AlertDialogDescription>
							Pulling makes this device match the snapshot exactly. Your current
							library, categories and reading history are deleted first.
							{data.local_changes_since_remote &&
								" This device has changes newer than the snapshot, and they will be lost."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmPull(false);
								pull.mutate(undefined, {
									onSuccess: () => setPulled(true),
									onError: (e) => toast.error(e.message),
								});
							}}
						>
							Pull and replace
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog onOpenChange={setPulled} open={pulled}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Snapshot applied</AlertDialogTitle>
						<AlertDialogDescription>
							Restart to finish applying the restored settings.
						</AlertDialogDescription>
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

type Preset = {
	name: string;
	hint: string;
	push: string;
	pull: string;
};

const PRESETS: Preset[] = [
	{
		name: "Proton Drive",
		hint: "Run `proton-drive auth login` on each device first — the command runs non-interactively and cannot answer a prompt.",
		push: "proton-drive filesystem upload -c replace -t {folder} /my-files",
		pull: "proton-drive filesystem download -c replace /my-files/{folder_name} {folder_parent}",
	},
	{
		name: "rclone",
		hint: "Replace `remote:` with the remote you configured in `rclone config`. Works with Drive, Dropbox, OneDrive, S3 and Proton Drive.",
		push: "rclone sync {folder} remote:nomanga-sync",
		pull: "rclone sync remote:nomanga-sync {folder}",
	},
	{
		name: "rsync over SSH",
		hint: "Replace `user@host`, and set up key-based login so it never prompts. The trailing slashes matter: they mean “the contents of”.",
		push: "rsync -az --delete {folder}/ user@host:nomanga-sync/",
		pull: "rsync -az --delete user@host:nomanga-sync/ {folder}/",
	},
	{
		name: "Desktop sync client",
		hint: "Dropbox, OneDrive, Syncthing or the Proton Drive desktop app need no commands at all — point the sync folder above at the synced directory instead.",
		push: "",
		pull: "",
	},
];

function HookFields({
	postPush,
	prePull,
}: {
	postPush: string | null;
	prePull: string | null;
}) {
	const setHooks = useSetSyncHooks();
	const [open, setOpen] = useState(Boolean(postPush || prePull));
	const [push, setPush] = useState(postPush ?? "");
	const [pull, setPull] = useState(prePull ?? "");
	const [hint, setHint] = useState<string | null>(null);

	const applyPreset = (preset: Preset) => {
		setPush(preset.push);
		setPull(preset.pull);
		setHint(preset.hint);
	};

	const save = () =>
		setHooks.mutate(
			{ postPush: push || null, prePull: pull || null },
			{
				onSuccess: () => toast.success("Sync commands saved"),
				onError: (e) => toast.error(e.message),
			},
		);

	if (!open) {
		return (
			<SettingAction
				actionLabel="Set up"
				description="Run a command after Push and before Pull, to carry the folder to a remote the filesystem cannot reach — Proton Drive, rclone, rsync."
				label="Upload / download commands"
				onAction={() => setOpen(true)}
			/>
		);
	}

	return (
		<div className="space-y-3 py-4">
			<div>
				<Label className="font-medium text-sm">
					Upload / download commands
				</Label>
				<p className="mt-0.5 text-muted-foreground text-xs">
					<code>{"{folder}"}</code> becomes the sync folder path, and{" "}
					<code>{"{folder_name}"}</code> / <code>{"{folder_parent}"}</code> its
					name and containing directory. Push fails if the upload fails, and
					Pull stops before touching your library if the download fails.
				</p>
			</div>

			<div className="space-y-1">
				<Label className="text-xs" htmlFor="sync-post-push">
					After Push (upload)
				</Label>
				<Input
					id="sync-post-push"
					onChange={(e) => setPush(e.target.value)}
					placeholder={PRESETS[0].push}
					value={push}
				/>
			</div>

			<div className="space-y-1">
				<Label className="text-xs" htmlFor="sync-pre-pull">
					Before Pull (download)
				</Label>
				<Input
					id="sync-pre-pull"
					onChange={(e) => setPull(e.target.value)}
					placeholder={PRESETS[0].pull}
					value={pull}
				/>
			</div>

			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}

			<div className="flex gap-2">
				<Button disabled={setHooks.isPending} onClick={save} size="sm">
					Save
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button size="sm" variant="outline">
								Insert example
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						{PRESETS.map((preset) => (
							<DropdownMenuItem
								key={preset.name}
								onClick={() => applyPreset(preset)}
							>
								{preset.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
