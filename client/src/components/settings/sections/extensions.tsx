import {
	CloudArrowDownIcon,
	PlugsIcon,
	TrashIcon,
	UploadSimpleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { SettingGroup } from "@/components/settings/components/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useExtensions,
	useInstallExtension,
	useUninstallExtension,
} from "@/hooks/services/use-extensions";
import {
	type RepositoryOffer,
	useInstallFromRepository,
	useRepositoryOffers,
} from "@/hooks/services/use-repositories";
import type { SourceInfo } from "@/types/bindings";
import { RepositoryGroup } from "./repositories";

export function ExtensionSection() {
	const { data: installed, isPending, error } = useExtensions();
	const { offers } = useRepositoryOffers();
	const installFile = useInstallExtension();
	const installRemote = useInstallFromRepository();
	const uninstall = useUninstallExtension();

	const [confirming, setConfirming] = useState<RepositoryOffer | null>(null);

	const installedIds = new Set(installed?.map((e) => e.info.id));
	const available = [...offers.values()].filter(
		(offer) => !installedIds.has(offer.extension.info.id),
	);

	async function handleFileInstall() {
		const path = await open({
			multiple: false,
			filters: [{ name: "Extension", extensions: ["wasm"] }],
		});

		if (typeof path !== "string") return;

		installFile.mutate(path, {
			onSuccess: (id) => toast.success(`Installed ${id}`),
			onError: (e) => toast.error(e.message),
		});
	}

	function confirmInstall(offer: RepositoryOffer) {
		setConfirming(null);
		installRemote.mutate(
			{
				url: offer.repositoryUrl,
				extensionId: offer.extension.info.id,
			},
			{
				onSuccess: (id) => toast.success(`Installed ${id}`),
				onError: (e) => toast.error(e.message),
			},
		);
	}

	return (
		<>
			<SettingGroup title="Sources of extensions">
				<RepositoryGroup />
			</SettingGroup>

			<SettingGroup
				title={`Installed${installed?.length ? ` (${installed.length})` : ""}`}
			>
				{isPending && <Skeleton className="h-20" />}
				{error && <p className="text-destructive text-sm">{error.message}</p>}

				{installed?.length === 0 && (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<PlugsIcon className="text-muted-foreground" size={32} />
						<p className="text-muted-foreground text-sm">
							No extensions installed. Add a repository above, or install a
							file.
						</p>
					</div>
				)}

				<div className="flex flex-col gap-3 py-2">
					{installed?.map((extension) => {
						const offer = offers.get(extension.info.id);
						const update =
							offer && offer.extension.info.version !== extension.info.version
								? offer
								: null;

						return (
							<ExtensionCard
								author={extension.info.author}
								key={extension.info.id}
								name={extension.info.name}
								sources={extension.sources}
								version={extension.info.version}
							>
								{update && (
									<Button
										disabled={installRemote.isPending || update.unsupported}
										onClick={() => setConfirming(update)}
										size="sm"
									>
										<CloudArrowDownIcon />
										Update to {update.extension.info.version}
									</Button>
								)}
								<Button
									disabled={uninstall.isPending}
									onClick={() =>
										uninstall.mutate(extension.info.id, {
											onSuccess: () =>
												toast.success(`Removed ${extension.info.name}`),
											onError: (e) => toast.error(e.message),
										})
									}
									size="icon"
									variant="ghost"
								>
									<TrashIcon />
								</Button>
							</ExtensionCard>
						);
					})}
				</div>
			</SettingGroup>

			{available.length > 0 && (
				<SettingGroup title={`Available (${available.length})`}>
					<div className="flex flex-col gap-3 py-2">
						{available.map((offer) => (
							<ExtensionCard
								author={offer.extension.info.author}
								key={offer.extension.info.id}
								name={offer.extension.info.name}
								sources={offer.extension.sources}
								unsupportedAbi={
									offer.unsupported ? offer.extension.info.abi_version : null
								}
								version={offer.extension.info.version}
							>
								<Button
									disabled={offer.unsupported || installRemote.isPending}
									onClick={() => setConfirming(offer)}
									size="sm"
								>
									<CloudArrowDownIcon />
									Install
								</Button>
							</ExtensionCard>
						))}
					</div>
				</SettingGroup>
			)}

			<SettingGroup title="Add manually">
				<div className="py-4">
					<Button
						disabled={installFile.isPending}
						onClick={handleFileInstall}
						variant="outline"
					>
						<UploadSimpleIcon />
						Install from file…
					</Button>
					<p className="mt-2 text-muted-foreground text-xs">
						For a `.wasm` you built yourself. Extensions are sandboxed and can
						only reach the domains they declare.
					</p>
				</div>
			</SettingGroup>

			<InstallDialog
				offer={confirming}
				onCancel={() => setConfirming(null)}
				onConfirm={confirmInstall}
			/>
		</>
	);
}

function ExtensionCard({
	name,
	version,
	author,
	sources,
	unsupportedAbi = null,
	children,
}: {
	name: string;
	version: string;
	author: string;
	sources: SourceInfo[];
	unsupportedAbi?: number | null;
	children: React.ReactNode;
}) {
	const nsfw = sources.some((s) => s.nsfw);

	return (
		<Card className="flex flex-row items-start gap-4 p-4">
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<p className="truncate font-medium">{name}</p>
					<span className="text-muted-foreground text-xs">v{version}</span>
					{nsfw && <Badge variant="destructive">18+</Badge>}
				</div>
				<p className="text-muted-foreground text-xs">by {author}</p>
				<p className="mt-2 text-xs">
					{sources.length} {sources.length === 1 ? "source" : "sources"}:{" "}
					<span className="text-muted-foreground">
						{sources.map((s) => s.name).join(", ")}
					</span>
				</p>
				{unsupportedAbi !== null && (
					<p className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
						<WarningIcon size={14} />
						Built for extension ABI {unsupportedAbi}, which this version of
						nomanga cannot load.
					</p>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-2">{children}</div>
		</Card>
	);
}

function InstallDialog({
	offer,
	onCancel,
	onConfirm,
}: {
	offer: RepositoryOffer | null;
	onCancel: () => void;
	onConfirm: (offer: RepositoryOffer) => void;
}) {
	const hosts = offer
		? [...new Set(offer.extension.sources.flatMap((s) => s.hosts))].sort()
		: [];

	return (
		<Dialog onOpenChange={(open) => !open && onCancel()} open={offer !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Install {offer?.extension.info.name}?</DialogTitle>
					<DialogDescription>
						It runs in a sandbox and may only reach these domains:
					</DialogDescription>
				</DialogHeader>

				<ul className="max-h-52 overflow-y-auto rounded-md border p-3 font-mono text-xs">
					{hosts.map((host) => (
						<li className="py-0.5" key={host}>
							{host}
						</li>
					))}
				</ul>

				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button onClick={() => offer && onConfirm(offer)}>Install</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
