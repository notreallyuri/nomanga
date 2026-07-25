import { PlugsIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { SettingGroup } from "@/components/settings/components/parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useExtensions,
	useInstallExtension,
	useUninstallExtension,
} from "@/hooks/services/use-extensions";

export function ExtensionSection() {
	const { data: extensions, isPending, error } = useExtensions();
	const install = useInstallExtension();
	const uninstall = useUninstallExtension();

	async function handleInstall() {
		const path = await open({
			multiple: false,
			filters: [{ name: "Extension", extensions: ["wasm"] }],
		});

		if (typeof path !== "string") return;

		install.mutate(path, {
			onSuccess: (id) => toast.success(`Installed ${id}`),
			onError: (e) => toast.error(e.message),
		});
	}

	return (
		<>
			<SettingGroup title="Installed">
				{isPending && <Skeleton className="h-20" />}

				{error && <p className="text-destructive text-sm">{error.message}</p>}

				{extensions?.length === 0 && (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<PlugsIcon className="text-muted-foreground" size={32} />
						<p className="text-muted-foreground text-sm">
							No extensions installed. Install one to add sources.
						</p>
					</div>
				)}

				{extensions?.map((ext) => (
					<Card
						className="flex flex-row items-start gap-4 p-4"
						key={ext.info.id}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2">
								<p className="truncate font-medium">{ext.info.name}</p>
								<span className="text-muted-foreground text-xs">
									v{ext.info.version}
								</span>
							</div>
							<p className="text-muted-foreground text-xs">
								by {ext.info.author}
							</p>
							<p className="mt-2 text-xs">
								{ext.sources.length}{" "}
								{ext.sources.length === 1 ? "source" : "sources"}:{" "}
								<span className="text-muted-foreground">
									{ext.sources.map((s) => s.name).join(", ")}
								</span>
							</p>
						</div>

						<Button
							disabled={uninstall.isPending}
							onClick={() =>
								uninstall.mutate(ext.info.id, {
									onSuccess: () => toast.success(`Removed ${ext.info.name}`),
									onError: (e) => toast.error(e.message),
								})
							}
							size="icon"
							variant="destructive"
						>
							<TrashIcon />
						</Button>
					</Card>
				))}
			</SettingGroup>

			<SettingGroup title="Add">
				<div className="py-4">
					<Button
						disabled={install.isPending}
						onClick={handleInstall}
						variant="outline"
					>
						<UploadSimpleIcon />
						Install from file…
					</Button>
					<p className="mt-2 text-muted-foreground text-xs">
						Extensions are sandboxed and can only reach the domains they
						declare.
					</p>
				</div>
			</SettingGroup>
		</>
	);
}
