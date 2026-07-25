import { useEffect } from "react";
import {
	useInfiniteSourceSearch,
	useInView,
} from "@/hooks/services/use-infinite-search";
import type { FilterValue } from "@/types/bindings";
import { MangaCard } from "../manga/manga-card";
import { MangaGrid, MangaGridSkeleton } from "../manga/manga-grid";

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
		console.log({
			inView,
			hasNextPage,
			isFetchingNextPage,
			pages: data?.pages.length,
		});
		if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, data]);

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
					<MangaCard
						coverUrl={item.cover_url}
						key={item.id}
						mangaId={item.id}
						sourceId={sourceId}
						title={item.title}
					/>
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
