import {
	CheckCircleIcon,
	FolderSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToggleLibrary } from "@/hooks/services/use-library";
import type { LibraryItem } from "@/types/bindings";

/**
 * The right-click actions shared by every library entry, whatever layout it's
 * drawn in (cover grid or compact list). `children` is the entry's clickable
 * surface, which becomes the menu trigger.
 */
export function LibraryEntryMenu({
	item,
	onEditCategories,
	onStartSelect,
	children,
}: {
	item: LibraryItem;
	onEditCategories: (item: LibraryItem) => void;
	onStartSelect: (item: LibraryItem) => void;
	children: ReactNode;
}) {
	const { remove } = useToggleLibrary(item.source_id, item.manga_id);

	return (
		<ContextMenu>
			<ContextMenuTrigger>{children}</ContextMenuTrigger>

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
