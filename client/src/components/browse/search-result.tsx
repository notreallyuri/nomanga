import { BookmarkSimpleIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { toast } from "sonner";
import {
	useInfiniteSourceSearch,
	useInView,
} from "@/hooks/services/use-infinite-search";
import { useIsInLibrary, useToggleLibrary } from "@/hooks/services/use-library";
import { cn } from "@/lib/utils";
import type { FilterValue, MangaSimple } from "@/types/bindings";
import { MangaCard } from "../manga/manga-card";
import { MangaGrid, MangaGridSkeleton } from "../manga/manga-grid";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../ui/context-menu";

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
					<SearchCard
						key={item.id}
						sourceId={sourceId}
						item={item}
						compactTitle={true}
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

function SearchCard({
	sourceId,
	item,
	compactTitle,
}: {
	sourceId: string;
	item: MangaSimple;
	compactTitle: boolean;
}) {
	const inLibrary = useIsInLibrary(sourceId, item.id);
	const { add, remove } = useToggleLibrary(sourceId, item.id, item);

	const saved = inLibrary.data ?? false;

	const toggle = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (saved) remove.mutate(undefined);
		else add.mutate(undefined, { onError: (err) => toast.error(err.message) });
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<div className="group/card relative">
					<MangaCard
						compactTitle={compactTitle}
						coverUrl={item.cover_url}
						mangaId={item.id}
						sourceId={sourceId}
						title={item.title}
					/>

					<button
						aria-label={saved ? "Remove from library" : "Add to library"}
						className={cn(
							"absolute top-1.5 right-1.5 z-10 flex size-7 items-center justify-center rounded-full shadow-sm backdrop-blur transition-all focus-visible:opacity-100 focus-visible:outline-none",
							saved
								? "bg-primary text-primary-foreground opacity-100"
								: "bg-background/80 text-foreground opacity-0 hover:bg-background group-hover/card:opacity-100",
						)}
						onClick={toggle}
						type="button"
					>
						{saved ? (
							<CheckIcon size={14} weight="bold" />
						) : (
							<PlusIcon size={14} weight="bold" />
						)}
					</button>
				</div>
			</ContextMenuTrigger>

			<ContextMenuContent>
				{saved ? (
					<ContextMenuItem onClick={() => remove.mutate(undefined)}>
						<CheckIcon />
						In library
					</ContextMenuItem>
				) : (
					<ContextMenuItem
						onClick={() =>
							add.mutate(undefined, { onError: (e) => toast.error(e.message) })
						}
					>
						<BookmarkSimpleIcon />
						Add to library
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
