import { CheckCircleIcon } from "@phosphor-icons/react";
import { MangaCard, UnreadBadge } from "@/components/manga/manga-card";
import { useAppearance } from "@/hooks/services/use-settings";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/types/bindings";
import { LibraryEntryMenu } from "./library-entry-menu";

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
	const { show_unread_badge } = useAppearance();

	// Goes non-zero only once chapter counts are cached; until then the badge
	// stays hidden rather than showing a wrong number.
	const unread = Math.max(0, item.cached_total_chapters - item.read_chapters);

	return (
		<LibraryEntryMenu
			item={item}
			onEditCategories={onEditCategories}
			onStartSelect={onStartSelect}
		>
			<div className="relative">
				<MangaCard
					badge={show_unread_badge ? <UnreadBadge count={unread} /> : undefined}
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
		</LibraryEntryMenu>
	);
}
