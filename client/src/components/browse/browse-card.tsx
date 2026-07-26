import { BookmarkSimpleIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useIsInLibrary, useToggleLibrary } from "@/hooks/services/use-library";
import { cn } from "@/lib/utils";
import type { MangaSimple } from "@/types/bindings";
import { MangaCard } from "../manga/manga-card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../ui/context-menu";

/**
 * A browse-result cover with an overlaid library toggle and a matching context
 * menu. Shared by the homepage rows, section view, and search results so the
 * save affordance behaves identically everywhere.
 */
export function BrowseCard({
	sourceId,
	item,
	compactTitle = true,
}: {
	sourceId: string;
	item: MangaSimple;
	compactTitle?: boolean;
}) {
	const inLibrary = useIsInLibrary(sourceId, item.id);
	const { add, remove } = useToggleLibrary(sourceId, item.id, item);

	const saved = inLibrary.data ?? false;

	const addToLibrary = () =>
		add.mutate(undefined, { onError: (err) => toast.error(err.message) });

	const toggle = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (saved) remove.mutate(undefined);
		else addToLibrary();
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
					<ContextMenuItem onClick={addToLibrary}>
						<BookmarkSimpleIcon />
						Add to library
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
