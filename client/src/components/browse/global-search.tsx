import { ArrowRightIcon, ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SourceIcon } from "@/components/source-icon";
import { useAppearance } from "@/hooks/services/use-settings";
import { useSourceSearch } from "@/hooks/services/use-sources";
import { cn } from "@/lib/utils";
import type { SourceInfo } from "@/types/bindings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { BrowseCard } from "./browse-card";
import { ScrollRow } from "./scroll-row";

/**
 * Runs one search per source and gives each its own row.
 *
 * A merged grid was the other option and is worse: relevance is not comparable
 * across sources, and the same series carries a different id in each, so the
 * duplicates cannot be collapsed either.
 */
export function GlobalSearch({
	term,
	sources,
}: {
	term: string;
	sources: SourceInfo[];
}) {
	const compact = useAppearance().compact_mode;

	if (sources.length === 0) {
		return (
			<p className="py-16 text-center text-muted-foreground text-sm">
				Every enabled source is hidden from search. Turn one back on in Settings
				→ Sources.
			</p>
		);
	}

	return (
		<div className={compact ? "space-y-6" : "space-y-8"}>
			{sources.map((info) => (
				<SourceResults info={info} key={info.id} term={term} />
			))}
		</div>
	);
}

/**
 * One source's answer. Each row owns its query, so a slow or broken source
 * delays and fails only its own row — the rest paint as they arrive.
 */
function SourceResults({ info, term }: { info: SourceInfo; term: string }) {
	const compact = useAppearance().compact_mode;

	// No filters by design: they are declared per source and have no shared
	// vocabulary, so there is nothing meaningful to fan out. The per-source page
	// behind "View all" is where filters apply.
	const { data, isPending, error, refetch, isFetching } = useSourceSearch(
		info.id,
		{ term, page: 1 },
	);

	const items = data?.items ?? [];

	return (
		<section className="min-w-0">
			<div className="mb-2 flex items-center gap-2">
				<SourceIcon
					className="size-6 shrink-0"
					name={info.name}
					url={info.icon_url}
				/>

				<h3 className="truncate font-heading font-semibold">{info.name}</h3>

				{info.nsfw && (
					<Badge className="shrink-0" variant="destructive">
						18+
					</Badge>
				)}

				<div className="ml-auto shrink-0">
					{items.length > 0 && (
						<Button
							render={
								<Link
									params={{ sourceId: info.id }}
									search={{ q: term }}
									to="/browse/$sourceId"
								/>
							}
							size="sm"
							variant="ghost"
						>
							View all
							<ArrowRightIcon />
						</Button>
					)}
				</div>
			</div>

			{isPending ? (
				<RowSkeleton compact={compact} />
			) : error ? (
				<div className="flex items-center gap-3 rounded-md border border-border border-dashed px-3 py-2.5">
					<p className="min-w-0 flex-1 truncate text-destructive text-sm">
						{error.message}
					</p>
					<Button
						disabled={isFetching}
						onClick={() => refetch()}
						size="sm"
						variant="outline"
					>
						<ArrowsClockwiseIcon className={cn(isFetching && "animate-spin")} />
						Retry
					</Button>
				</div>
			) : items.length === 0 ? (
				<p className="px-1 text-muted-foreground text-sm">No results</p>
			) : (
				<ScrollRow
					contentClassName={cn("grid-rows-1", compact ? "gap-x-3" : "gap-x-4")}
				>
					{items.map((item) => (
						<div
							className={cn("shrink-0 snap-start", compact ? "w-28" : "w-36")}
							key={item.id}
						>
							<BrowseCard
								compactTitle={compact}
								item={item}
								sourceId={info.id}
							/>
						</div>
					))}
				</ScrollRow>
			)}
		</section>
	);
}

function RowSkeleton({ compact }: { compact: boolean }) {
	const width = compact ? "w-28" : "w-36";

	return (
		<div
			className={cn(
				"grid grid-flow-col grid-rows-1 overflow-hidden pb-2",
				compact ? "gap-x-3" : "gap-x-4",
			)}
		>
			{Array.from({ length: 10 }, (_, i) => (
				<div className={cn("shrink-0", width)} key={i}>
					<Skeleton className="aspect-2/3 w-full" />
				</div>
			))}
		</div>
	);
}
