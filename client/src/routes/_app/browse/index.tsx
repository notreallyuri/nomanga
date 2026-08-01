import {
	CaretRightIcon,
	MagnifyingGlassIcon,
	PlugsIcon,
	PlusIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GlobalSearch } from "@/components/browse/global-search";
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

interface BrowseIndexSearch {
	q?: string;
}

export const Route = createFileRoute("/_app/browse/")({
	validateSearch: (search: Record<string, unknown>): BrowseIndexSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
	}),
	component: BrowseIndex,
});

function BrowseIndex() {
	const { q = "" } = Route.useSearch();
	const navigate = Route.useNavigate();

	const { data: rows, isPending, error } = useSourcesWithPreferences();

	// Replace rather than push: the term is already in the URL, so a back press
	// should leave Browse the way it does from any other page here, not walk
	// backwards through the searches made along the way.
	const search = (term: string) =>
		navigate({ search: term ? { q: term } : {}, replace: true });

	if (isPending) {
		return (
			<Page>
				<SearchAllBar disabled onSearch={search} term={q} />
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

	if (q) {
		// `hide_from_search` is the opt-out for a source the user wants to keep
		// browsable without it answering every cross-source query — the adult
		// sources it was added for.
		const searchable = enabled
			.filter((row) => !row.preference.hide_from_search)
			.map((row) => row.info);

		return (
			<Page>
				<SearchAllBar onSearch={search} term={q} />
				<GlobalSearch sources={searchable} term={q} />
			</Page>
		);
	}

	return (
		<Page>
			<SearchAllBar onSearch={search} term={q} />

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
 * Submits on Enter rather than debouncing the way the per-source search does.
 * One source can afford a request per typing pause; fanning the same keystrokes
 * out to every installed source is a burst against a different site each, and
 * the per-source rate limiter would serialise them into results arriving for a
 * term the user has already typed past.
 */
function SearchAllBar({
	term,
	onSearch,
	disabled,
}: {
	term: string;
	onSearch: (term: string) => void;
	disabled?: boolean;
}) {
	const [draft, setDraft] = useState(term);

	useEffect(() => setDraft(term), [term]);

	return (
		<form
			className="relative mb-6"
			onSubmit={(e) => {
				e.preventDefault();
				onSearch(draft.trim());
			}}
		>
			<MagnifyingGlassIcon
				className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
				size={18}
			/>
			<Input
				aria-label="Search all sources"
				className="h-11 pr-10 pl-10"
				disabled={disabled}
				onChange={(e) => setDraft(e.target.value)}
				placeholder="Search across all sources…"
				value={draft}
			/>
			{(draft || term) && (
				<button
					aria-label="Clear search"
					className="absolute top-1/2 right-3 -translate-y-1/2 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => {
						setDraft("");
						onSearch("");
					}}
					type="button"
				>
					<XIcon size={16} />
				</button>
			)}
		</form>
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
							className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
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
