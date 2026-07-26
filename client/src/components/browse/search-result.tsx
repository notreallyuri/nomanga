import { useEffect } from "react";
import {
	useInfiniteSourceSearch,
	useInView,
} from "@/hooks/services/use-infinite-search";
import type { FilterValue } from "@/types/bindings";
import { MangaGrid, MangaGridSkeleton } from "../manga/manga-grid";
import { BrowseCard } from "./browse-card";

export function SearchResults({
	sourceId,
	query,
	filters,
}: {
	sourceId: string;
	query: string;
	filters: FilterValue[];
}) {
	const {
		data,
		isPending,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInfiniteSourceSearch(sourceId, query, filters);

	const { ref: sentinelRef, inView } = useInView<HTMLDivElement>();

	useEffect(() => {
		if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

	if (isPending) return <MangaGridSkeleton />;
	if (error) return <p className="text-destructive">{error.message}</p>;

	const items = data.pages.flatMap((page) => page.items);

	if (items.length === 0) {
		return (
			<p className="py-16 text-center text-muted-foreground">
				No results for “{query}”.
			</p>
		);
	}

	return (
		<>
			<MangaGrid>
				{items.map((item) => (
					<BrowseCard item={item} key={item.id} sourceId={sourceId} />
				))}
			</MangaGrid>

			<div className="h-px" ref={sentinelRef} />

			{isFetchingNextPage && <MangaGridSkeleton count={6} />}

			{!hasNextPage && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					End of results
				</p>
			)}
		</>
	);
}
