import {
	BooksIcon,
	CheckSquareIcon,
	FolderSimpleIcon,
	SlidersHorizontalIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkCategoriesDialog } from "@/components/library/bulk-categories-dialog";
import { EditCategoriesDialog } from "@/components/library/edit-categories-dialog";
import { LibraryCard } from "@/components/library/library-card";
import { ManageCategoriesDialog } from "@/components/library/manage-categories-dialog";
import { MangaGrid, MangaGridSkeleton } from "@/components/manga/manga-grid";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	ALL_CATEGORIES,
	useBulkRemove,
	useCategories,
	useLibrary,
} from "@/hooks/services/use-library";
import { categoryIcon } from "@/lib/category-visuals";
import type { CategoryFilter, EntryRef, LibraryItem } from "@/types/bindings";

const keyOf = (item: { source_id: string; manga_id: string }) =>
	`${item.source_id}/${item.manga_id}`;

export const Route = createFileRoute("/_app/library")({
	component: LibraryPage,
});

const ALL = "all";
const UNCATEGORIZED = "none";

const UNCATEGORIZED_FILTER: CategoryFilter = { type: "Uncategorized" };

function toTabValue(filter: CategoryFilter): string {
	if (filter.type === "All") return ALL;
	if (filter.type === "Uncategorized") return UNCATEGORIZED;
	return filter.id;
}

function toFilter(value: string): CategoryFilter {
	if (value === ALL) return { type: "All" };
	if (value === UNCATEGORIZED) return { type: "Uncategorized" };
	return { type: "Category", id: value };
}

function LibraryPage() {
	const [filter, setFilterState] = useState<CategoryFilter>(ALL_CATEGORIES);
	const [editing, setEditing] = useState<LibraryItem | null>(null);

	const [selectionMode, setSelectionMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkOpen, setBulkOpen] = useState(false);

	const categories = useCategories();
	const library = useLibrary(filter);
	const bulkRemove = useBulkRemove();

	const uncategorized = useLibrary(UNCATEGORIZED_FILTER);
	const showUncategorized =
		(uncategorized.data?.length ?? 0) > 0 || filter.type === "Uncategorized";

	const items = library.data ?? [];
	const selectedItems = useMemo(
		() => items.filter((item) => selected.has(keyOf(item))),
		[items, selected],
	);

	const exitSelection = () => {
		setSelectionMode(false);
		setSelected(new Set());
	};

	// Switching tabs would leave selected keys pointing at now-hidden entries,
	// so the selection is cleared alongside the filter.
	const setFilter = (next: CategoryFilter) => {
		setFilterState(next);
		exitSelection();
	};

	const toggleSelect = (item: LibraryItem) =>
		setSelected((prev) => {
			const next = new Set(prev);
			const k = keyOf(item);
			if (next.has(k)) next.delete(k);
			else next.add(k);
			return next;
		});

	const startSelect = (item: LibraryItem) => {
		setSelectionMode(true);
		setSelected(new Set([keyOf(item)]));
	};

	const allSelected = items.length > 0 && selected.size === items.length;
	const toggleAll = () =>
		setSelected(allSelected ? new Set() : new Set(items.map(keyOf)));

	const removeSelected = () => {
		const entries: EntryRef[] = selectedItems.map((i) => ({
			source_id: i.source_id,
			manga_id: i.manga_id,
		}));
		bulkRemove.mutate(entries, {
			onSuccess: () => {
				toast.success(`Removed ${entries.length} series`);
				exitSelection();
			},
			onError: (e) => toast.error(e.message),
		});
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex items-center justify-between gap-4 px-6 pt-6">
				<h1 className="font-heading font-semibold text-2xl">Library</h1>

				<div className="flex items-center gap-1">
					<Button
						onClick={() =>
							selectionMode ? exitSelection() : setSelectionMode(true)
						}
						size="sm"
						variant="ghost"
					>
						<CheckSquareIcon />
						{selectionMode ? "Done" : "Select"}
					</Button>
					<ManageCategoriesDialog
						trigger={
							<Button size="sm" variant="ghost">
								<SlidersHorizontalIcon />
								Manage categories
							</Button>
						}
					/>
				</div>
			</div>

			<div className="px-6 pt-4">
				<Tabs
					onValueChange={(value) => setFilter(toFilter(value as string))}
					value={toTabValue(filter)}
				>
					<TabsList className="max-w-full overflow-x-auto" variant="line">
						<TabsTrigger value={ALL}>All</TabsTrigger>
						{categories.data?.map((category) => {
							const Icon = categoryIcon(category.icon);
							return (
								<TabsTrigger key={category.id} value={category.id}>
									{Icon && (
										<Icon
											size={15}
											style={{ color: category.color ?? undefined }}
											weight="fill"
										/>
									)}
									{category.name}
								</TabsTrigger>
							);
						})}
						{showUncategorized && (
							<TabsTrigger value={UNCATEGORIZED}>Uncategorized</TabsTrigger>
						)}
					</TabsList>
				</Tabs>
			</div>

			{selectionMode && (
				<div className="flex items-center gap-2 border-border border-b px-6 py-2">
					<span className="text-sm tabular-nums">{selected.size} selected</span>
					<Button
						className="ml-2"
						disabled={items.length === 0}
						onClick={toggleAll}
						size="sm"
						variant="ghost"
					>
						{allSelected ? "Clear all" : "Select all"}
					</Button>

					<div className="ml-auto flex items-center gap-1">
						<Button
							disabled={selected.size === 0}
							onClick={() => setBulkOpen(true)}
							size="sm"
							variant="outline"
						>
							<FolderSimpleIcon />
							Manage categories
						</Button>
						<Button
							className="text-destructive"
							disabled={selected.size === 0 || bulkRemove.isPending}
							onClick={removeSelected}
							size="sm"
							variant="ghost"
						>
							<TrashIcon />
							Remove
						</Button>
						<Button onClick={exitSelection} size="icon-sm" variant="ghost">
							<XIcon />
						</Button>
					</div>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
				{library.isPending ? (
					<MangaGridSkeleton />
				) : library.error ? (
					<p className="text-destructive text-sm">{library.error.message}</p>
				) : library.data.length === 0 ? (
					<EmptyState hasFilter={filter.type !== "All"} />
				) : (
					<MangaGrid>
						{library.data.map((item) => (
							<LibraryCard
								item={item}
								key={keyOf(item)}
								onEditCategories={setEditing}
								onStartSelect={startSelect}
								onToggleSelect={toggleSelect}
								selected={selected.has(keyOf(item))}
								selectionMode={selectionMode}
							/>
						))}
					</MangaGrid>
				)}
			</div>

			<BulkCategoriesDialog
				items={selectedItems}
				onApplied={() => {
					setBulkOpen(false);
					exitSelection();
				}}
				onOpenChange={setBulkOpen}
				open={bulkOpen}
			/>

			<EditCategoriesDialog item={editing} onClose={() => setEditing(null)} />
		</div>
	);
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
			<BooksIcon className="text-muted-foreground" size={40} />
			<div>
				<p className="font-medium">
					{hasFilter ? "Nothing here" : "Your library is empty"}
				</p>
				<p className="mt-1 text-muted-foreground text-sm">
					{hasFilter
						? "No series in this category yet."
						: "Add series from Browse to see them here."}
				</p>
			</div>
		</div>
	);
}
