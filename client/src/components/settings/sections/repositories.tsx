import {
	ArrowClockwiseIcon,
	CloudArrowDownIcon,
	GlobeIcon,
	TrashIcon,
	WarningIcon,
} from "@phosphor-icons/react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExtensions } from "@/hooks/services/use-extensions";
import {
	useAddRepository,
	useInstallFromRepository,
	useRemoveRepository,
	useRepositoryCatalog,
} from "@/hooks/services/use-repositories";
import { useDeepLink } from "@/hooks/use-deep-link";
import type { RepositoryExtension } from "@/types/bindings";

type Pending = { url: string; extension: RepositoryExtension };

export function RepositorySection() {
	const {
		data: catalogs,
		isPending,
		refetch,
		isFetching,
	} = useRepositoryCatalog();
	const { data: installed } = useExtensions();
	const add = useAddRepository();
	const remove = useRemoveRepository();
	const install = useInstallFromRepository();
	const { pendingRepository, clearPendingRepository } = useDeepLink();

	const [url, setUrl] = useState("");
	const [pending, setPending] = useState<Pending | null>(null);

	function addUrl(target: string, onDone?: () => void) {
		add.mutate(target, {
			onSuccess: (index) => {
				onDone?.();
				toast.success(`Added ${index.name}`);
			},
			onError: (e) => toast.error(e.message),
		});
	}

	function handleAdd() {
		const trimmed = url.trim();
		if (!trimmed) return;

		addUrl(trimmed, () => setUrl(""));
	}

	function handleInstall(target: Pending) {
		setPending(null);
		install.mutate(
			{ url: target.url, extensionId: target.extension.info.id },
			{
				onSuccess: (id) => toast.success(`Installed ${id}`),
				onError: (e) => toast.error(e.message),
			},
		);
	}

	return (
		<>
			<SettingGroup title="Repositories">
				<div className="py-4">
					<div className="flex gap-2">
						<Input
							onChange={(e) => setUrl(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAdd()}
							placeholder="https://example.github.io/pack/index.min.json"
							value={url}
						/>
						<Button disabled={add.isPending || !url.trim()} onClick={handleAdd}>
							Add
						</Button>
					</div>
					<p className="mt-2 text-muted-foreground text-xs">
						A repository is a link someone publishes. Anything you install from
						one runs sandboxed and can only reach the domains it declares —
						shown before you install.
					</p>
				</div>

				{isPending && <Skeleton className="h-16" />}

				{catalogs?.map((catalog) => (
					<div
						className="flex items-center gap-3 py-3"
						key={catalog.repository.url}
					>
						<GlobeIcon className="shrink-0 text-muted-foreground" size={20} />
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">
								{catalog.index?.name ?? catalog.repository.name}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{catalog.repository.url}
							</p>
							{catalog.error && (
								<p className="mt-1 text-destructive text-xs">{catalog.error}</p>
							)}
						</div>
						<Button
							disabled={remove.isPending}
							onClick={() =>
								remove.mutate(catalog.repository.url, {
									onSuccess: () => toast.success("Repository removed"),
									onError: (e) => toast.error(e.message),
								})
							}
							size="icon"
							variant="ghost"
						>
							<TrashIcon />
						</Button>
					</div>
				))}
			</SettingGroup>

			<SettingGroup title="Available">
				{catalogs && catalogs.length > 0 && (
					<div className="flex justify-end py-2">
						<Button
							disabled={isFetching}
							onClick={() => refetch()}
							size="sm"
							variant="ghost"
						>
							<ArrowClockwiseIcon />
							Refresh
						</Button>
					</div>
				)}

				{catalogs?.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Add a repository to see what it offers.
					</p>
				)}

				<div className="flex flex-col gap-3 py-2">
					{catalogs?.flatMap((catalog) =>
						(catalog.index?.extensions ?? []).map((extension) => {
							const current = installed?.find(
								(e) => e.info.id === extension.info.id,
							);
							const unsupported = catalog.unsupported.includes(
								extension.info.id,
							);

							return (
								<AvailableCard
									extension={extension}
									installedVersion={current?.info.version ?? null}
									key={`${catalog.repository.url}:${extension.info.id}`}
									onInstall={() =>
										setPending({ url: catalog.repository.url, extension })
									}
									pending={install.isPending}
									unsupported={unsupported}
								/>
							);
						}),
					)}
				</div>
			</SettingGroup>

			<InstallDialog
				onCancel={() => setPending(null)}
				onConfirm={handleInstall}
				pending={pending}
			/>

			<AddFromLinkDialog
				busy={add.isPending}
				onCancel={clearPendingRepository}
				onConfirm={() =>
					addUrl(pendingRepository ?? "", clearPendingRepository)
				}
				url={pendingRepository}
			/>
		</>
	);
}

/**
 * Confirms a repository that arrived over a `nomanga://add-repo` link. Adding
 * one installs nothing, but the link can come from any page on the internet, so
 * the URL is shown in full and the user decides.
 */
function AddFromLinkDialog({
	url,
	busy,
	onCancel,
	onConfirm,
}: {
	url: string | null;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog onOpenChange={(open) => !open && onCancel()} open={url !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add this repository?</DialogTitle>
					<DialogDescription>
						A link asked nomanga to add the repository below. Nothing is
						installed — you pick what to install afterwards.
					</DialogDescription>
				</DialogHeader>

				<p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
					{url}
				</p>

				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button disabled={busy} onClick={onConfirm}>
						Add repository
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AvailableCard({
	extension,
	installedVersion,
	unsupported,
	pending,
	onInstall,
}: {
	extension: RepositoryExtension;
	installedVersion: string | null;
	unsupported: boolean;
	pending: boolean;
	onInstall: () => void;
}) {
	const upToDate = installedVersion === extension.info.version;
	const label =
		installedVersion === null ? "Install" : upToDate ? "Reinstall" : "Update";

	return (
		<Card className="flex flex-row items-start gap-4 p-4">
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<p className="truncate font-medium">{extension.info.name}</p>
					<span className="text-muted-foreground text-xs">
						v{extension.info.version}
					</span>
					{installedVersion !== null && !upToDate && (
						<Badge variant="secondary">v{installedVersion} installed</Badge>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					by {extension.info.author}
				</p>
				<p className="mt-2 text-xs">
					{extension.sources.length}{" "}
					{extension.sources.length === 1 ? "source" : "sources"}:{" "}
					<span className="text-muted-foreground">
						{extension.sources.map((s) => s.name).join(", ")}
					</span>
				</p>
				{unsupported && (
					<p className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
						<WarningIcon size={14} />
						Built for extension ABI {extension.info.abi_version}, which this
						version of nomanga cannot load.
					</p>
				)}
			</div>

			<Button
				disabled={unsupported || pending}
				onClick={onInstall}
				size="sm"
				variant={upToDate ? "outline" : "default"}
			>
				<CloudArrowDownIcon />
				{label}
			</Button>
		</Card>
	);
}

/**
 * Confirms an install by listing the domains the extension declares. The
 * sandbox is what actually contains it, but the allow-list is the one part of
 * that a user can judge, so it is shown before the download rather than buried
 * in the source settings afterwards.
 */
function InstallDialog({
	pending,
	onCancel,
	onConfirm,
}: {
	pending: Pending | null;
	onCancel: () => void;
	onConfirm: (target: Pending) => void;
}) {
	const hosts = pending
		? [...new Set(pending.extension.sources.flatMap((s) => s.hosts))].sort()
		: [];

	return (
		<Dialog
			onOpenChange={(open) => !open && onCancel()}
			open={pending !== null}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Install {pending?.extension.info.name}?</DialogTitle>
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
					<Button onClick={() => pending && onConfirm(pending)}>Install</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
