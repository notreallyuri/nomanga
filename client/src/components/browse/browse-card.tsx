import {
	BookmarkSimpleIcon,
	CheckIcon,
	FolderSimpleIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
	useCategories,
	useEntryCategories,
	useIsInLibrary,
	useSetEntryCategories,
	useToggleLibrary,
} from "@/hooks/services/use-library";
import { categoryIcon } from "@/lib/category-visuals";
import { cn } from "@/lib/utils";
import type { MangaSimple } from "@/types/bindings";
import { MangaCard } from "../manga/manga-card";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "../ui/context-menu";

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
				<div className="group/card relative isolate">
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

				<CategorySubmenu item={item} saved={saved} sourceId={sourceId} />
			</ContextMenuContent>
		</ContextMenu>
	);
}

function CategorySubmenu({
	sourceId,
	item,
	saved,
}: {
	sourceId: string;
	item: MangaSimple;
	saved: boolean;
}) {
	const categories = useCategories();
	const assigned = useEntryCategories(sourceId, item.id, saved);
	const { add } = useToggleLibrary(sourceId, item.id, item);
	const save = useSetEntryCategories(sourceId, item.id);

	if (!categories.data?.length) return null;

	const current = saved ? (assigned.data ?? []) : [];
	const busy =
		add.isPending || save.isPending || (saved && !assigned.isSuccess);

	const toggle = async (categoryId: string, name: string, on: boolean) => {
		const next = new Set(current);
		if (on) next.add(categoryId);
		else next.delete(categoryId);

		try {
			if (!saved) await add.mutateAsync(undefined);
			await save.mutateAsync([...next]);
			toast.success(on ? `Added to ${name}` : `Removed from ${name}`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong");
		}
	};

	return (
		<>
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<FolderSimpleIcon />
					Add to category
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					{categories.data.map((category) => {
						const Icon = categoryIcon(category.icon);
						return (
							<ContextMenuCheckboxItem
								checked={current.includes(category.id)}
								closeOnClick={false}
								disabled={busy}
								key={category.id}
								onCheckedChange={(on) => toggle(category.id, category.name, on)}
							>
								{Icon && (
									<Icon
										style={{ color: category.color ?? undefined }}
										weight="fill"
									/>
								)}
								<span className="truncate">{category.name}</span>
							</ContextMenuCheckboxItem>
						);
					})}
				</ContextMenuSubContent>
			</ContextMenuSub>
		</>
	);
}
