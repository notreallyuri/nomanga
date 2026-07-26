import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import {
	useInfiniteSourceSection,
	useInView,
} from "@/hooks/services/use-infinite-search";
import { useSourceHomepage } from "@/hooks/services/use-sources";
import { MangaGrid, MangaGridSkeleton } from "../manga/manga-grid";
import { Button } from "../ui/button";
import { BrowseCard } from "./browse-card";

/**
 * The full, paginated listing behind a homepage section's "View more". The
 * title is resolved from the (already cached) homepage rather than carried in
 * the URL, so links stay `?section=<id>` and never drift out of sync.
 */
export function SectionView({
	sourceId,
	sectionId,
	onBack,
}: {
	sourceId: string;
	sectionId: string;
	onBack: () => void;
}) {
	const { data: homepage } = useSourceHomepage(sourceId);
	const title =
		homepage?.sections.find((s) => s.id === sectionId)?.title ?? "Section";

	const {
		data,
		isPending,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInfiniteSourceSection(sourceId, sectionId);

	const { ref: sentinelRef, inView } = useInView<HTMLDivElement>();

	useEffect(() => {
		if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div>
			<div className="mb-4 flex items-center gap-2">
				<Button
					aria-label="Back to source"
					onClick={onBack}
					size="icon"
					variant="ghost"
				>
					<ArrowLeftIcon />
				</Button>
				<h1 className="min-w-0 truncate font-bold font-heading text-xl">
					{title}
				</h1>
			</div>

			{isPending && <MangaGridSkeleton />}
			{error && <p className="text-destructive">{error.message}</p>}

			{data && (
				<>
					<MangaGrid>
						{data.pages
							.flatMap((page) => page.items)
							.map((item) => (
								<BrowseCard item={item} key={item.id} sourceId={sourceId} />
							))}
					</MangaGrid>

					<div className="h-px" ref={sentinelRef} />

					{isFetchingNextPage && <MangaGridSkeleton count={6} />}

					{!hasNextPage && (
						<p className="py-8 text-center text-muted-foreground text-sm">
							End of section
						</p>
					)}
				</>
			)}
		</div>
	);
}
