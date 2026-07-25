import {
	CheckCircleIcon,
	FolderSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { MangaCard, UnreadBadge } from "@/components/manga/manga-card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToggleLibrary } from "@/hooks/services/use-library";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/types/bindings";

export function LibraryCard({
	item,
	onEditCategories,
	selectionMode,
	selected,
	onToggleSelect,
	onStartSelect,
}: {
	item: LibraryItem;
	onEditCategories: (item: LibraryItem) => void;
	selectionMode: boolean;
	selected: boolean;
	onToggleSelect: (item: LibraryItem) => void;
	onStartSelect: (item: LibraryItem) => void;
}) {
	const { remove } = useToggleLibrary(item.source_id, item.manga_id);

	// Goes non-zero only once chapter counts are cached; until then the badge
	// stays hidden rather than showing a wrong number.
	const unread = Math.max(0, item.cached_total_chapters - item.read_chapters);

	const card = (
		<div className="relative">
			<MangaCard
				badge={<UnreadBadge count={unread} />}
				coverUrl={item.cover_url}
				mangaId={item.manga_id}
				sourceId={item.source_id}
				title={item.title}
			/>

			{selectionMode && (
				// Sits above the card's Link so a tap selects instead of navigating.
				<button
					aria-pressed={selected}
					className={cn(
						"absolute inset-0 z-10 flex items-start justify-start rounded-none ring-inset",
						selected && "bg-primary/15 ring-2 ring-primary",
					)}
					onClick={() => onToggleSelect(item)}
					type="button"
				>
					<span
						className={cn(
							"m-1.5 flex size-6 items-center justify-center rounded-full border-2 bg-background/80 backdrop-blur",
							selected
								? "border-primary text-primary"
								: "border-muted-foreground/50 text-transparent",
						)}
					>
						<CheckCircleIcon size={18} weight="fill" />
					</span>
				</button>
			)}
		</div>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger>{card}</ContextMenuTrigger>

			<ContextMenuContent>
				<ContextMenuItem onClick={() => onStartSelect(item)}>
					<CheckCircleIcon />
					Select
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onEditCategories(item)}>
					<FolderSimpleIcon />
					Edit categories
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					className="text-destructive"
					onClick={() => remove.mutate(undefined)}
				>
					<TrashIcon />
					Remove from library
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
