import {
	CaretRightIcon,
	MagnifyingGlassIcon,
	PlugsIcon,
	PlusIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PinToggle } from "@/components/browse/pin-toggle";
import { SourceMenuContent } from "@/components/browse/source-menu";
import { useSettingsUI } from "@/components/settings/context";
import { SourceIcon } from "@/components/source-icon";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourcesWithPreferences } from "@/hooks/services/use-extensions";
import type { SourceInfo } from "@/types/bindings";

export const Route = createFileRoute("/_app/browse/")({
	component: BrowseIndex,
});

function BrowseIndex() {
	const { data: rows, isPending, error } = useSourcesWithPreferences();

	if (isPending) {
		return (
			<Page>
				<SearchAllBar disabled />
				<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
					{["a", "b", "c", "d", "e", "f"].map((k) => (
						<Skeleton className="h-[4.5rem]" key={k} />
					))}
				</div>
			</Page>
		);
	}

	if (error) {
		return (
			<Page>
				<p className="text-destructive">{error.message}</p>
			</Page>
		);
	}

	if (rows.length === 0) {
		return <EmptyState kind="no-extensions" />;
	}

	const enabled = rows.filter((row) => row.preference.enabled);

	if (enabled.length === 0) {
		return <EmptyState kind="all-disabled" />;
	}

	const hiddenCount = rows.length - enabled.length;

	return (
		<Page>
			<SearchAllBar />

			<div className="mb-3 flex items-baseline justify-between">
				<h2 className="font-heading font-semibold text-muted-foreground text-sm uppercase tracking-wide">
					Sources
				</h2>
				{hiddenCount > 0 && (
					<p className="text-muted-foreground text-xs">{hiddenCount} hidden</p>
				)}
			</div>

			<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
				{enabled.map(({ info }) => (
					<SourceCard info={info} key={info.id} />
				))}
				<AddMoreCard />
			</div>
		</Page>
	);
}

/**
 * Sends the user to the Extensions tab of the settings dialog, where sources
 * are installed — so the grid always offers a way to add to it.
 */
function AddMoreCard() {
	const { openSettings } = useSettingsUI();

	return (
		<button
			className="group flex items-center gap-3 rounded-lg border border-border border-dashed p-3 text-left text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
			onClick={() => openSettings("Extensions")}
			type="button"
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted transition-colors group-hover:bg-background">
				<PlusIcon size={20} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">Add more</p>
				<p className="text-xs">Install extensions</p>
			</div>
		</button>
	);
}

function Page({ children }: { children: React.ReactNode }) {
	return (
		<div className="h-full overflow-y-auto p-6">
			<h1 className="mb-4 font-heading font-semibold text-2xl">Browse</h1>
			{children}
		</div>
	);
}

/**
 * Placeholder for cross-source search. The control is intentionally inert for
 * now — it reserves the layout and signals the coming capability rather than
 * pretending to work. Wire it to a search-all command when one exists.
 */
function SearchAllBar({ disabled }: { disabled?: boolean }) {
	const [value, setValue] = useState("");

	return (
		<div className="relative mb-6">
			<MagnifyingGlassIcon
				className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
				size={18}
			/>
			<Input
				aria-label="Search all sources"
				className="h-11 pr-28 pl-10"
				disabled={disabled}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Search across all sources…"
				value={value}
			/>
			<Badge
				className="absolute top-1/2 right-3 -translate-y-1/2"
				variant="secondary"
			>
				Coming soon
			</Badge>
		</div>
	);
}

function SourceCard({ info }: { info: SourceInfo }) {
	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<Link
						className="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted"
						params={{ sourceId: info.id }}
						to="/browse/$sourceId"
					>
						<SourceIcon
							className="size-10"
							name={info.name}
							url={info.icon_url}
						/>

						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<p className="truncate font-medium">{info.name}</p>
								{info.nsfw && (
									<Badge className="shrink-0" variant="destructive">
										18+
									</Badge>
								)}
							</div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								{info.language}
							</p>
						</div>

						<PinToggle sourceId={info.id} />

						<CaretRightIcon
							className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
							size={16}
						/>
					</Link>
				}
			/>

			<SourceMenuContent info={info} />
		</ContextMenu>
	);
}

function EmptyState({ kind }: { kind: "no-extensions" | "all-disabled" }) {
	const content =
		kind === "no-extensions"
			? {
					icon: PlugsIcon,
					title: "No sources yet",
					body: "Install an extension from Settings → Extensions to start browsing.",
				}
			: {
					icon: WarningIcon,
					title: "All sources are disabled",
					body: "Enable at least one in Settings → Sources.",
				};

	const Icon = content.icon;

	return (
		<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
			<Icon className="text-muted-foreground" size={40} />
			<div>
				<p className="font-medium">{content.title}</p>
				<p className="mt-1 text-muted-foreground text-sm">{content.body}</p>
			</div>
		</div>
	);
}
