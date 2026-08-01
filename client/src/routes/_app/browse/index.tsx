import {
	MagnifyingGlassIcon,
	PlugsIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GlobalSearch } from "@/components/browse/global-search";
import { SourceGrid } from "@/components/browse/source-grid";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourcesWithPreferences } from "@/hooks/services/use-extensions";
import { useSourceOrder } from "@/hooks/services/use-settings";
import { applySourceOrder } from "@/lib/source-order";

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
	const { order } = useSourceOrder();

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

	if (q) {
		// `hide_from_search` is the opt-out for a source the user wants to keep
		// browsable without it answering every cross-source query — the adult
		// sources it was added for.
		//
		// Ordered the same way the grid is, so the rows arrive in the arrangement
		// the user set rather than in a second, unrelated order.
		const searchable = applySourceOrder(
			enabled.filter((row) => !row.preference.hide_from_search),
			order,
			(row) => row.info.id,
			(row) => row.info.name,
		).map((row) => row.info);

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

			<SourceGrid rows={rows} />
		</Page>
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
