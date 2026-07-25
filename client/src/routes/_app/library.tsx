import {
	ArrowClockwiseIcon,
	ArrowsDownUpIcon,
	BooksIcon,
	CheckSquareIcon,
	FolderSimpleIcon,
	type Icon,
	RowsIcon,
	SlidersHorizontalIcon,
	SquaresFourIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkCategoriesDialog } from "@/components/library/bulk-categories-dialog";
import { EditCategoriesDialog } from "@/components/library/edit-categories-dialog";
import { LibraryCard } from "@/components/library/library-card";
import { LibraryList } from "@/components/library/library-list";
import { ManageCategoriesDialog } from "@/components/library/manage-categories-dialog";
import { MangaGrid, MangaGridSkeleton } from "@/components/manga/manga-grid";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	ALL_CATEGORIES,
	useBulkRemove,
	useCategories,
	useLibrary,
	useLibraryRefresh,
} from "@/hooks/services/use-library";
import {
	useAppearance,
	useUpdateSettings,
} from "@/hooks/services/use-settings";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { categoryIcon } from "@/lib/category-visuals";
import { cn } from "@/lib/utils";
import type {
	CategoryFilter,
	CategorySort,
	EntryRef,
	LibraryItem,
	LibraryLayout,
	RefreshScope,
} from "@/types/bindings";

const keyOf = (item: { source_id: string; manga_id: string }) =>
	`${item.source_id}/${item.manga_id}`;

export const Route = createFileRoute("/_app/library")({
	component: LibraryPage,
});

const ALL = "all";
const UNCATEGORIZED = "none";

const UNCATEGORIZED_FILTER: CategoryFilter = { type: "Uncategorized" };

const LAST_TAB_KEY = "library.last-tab";
const SORT_KEY = "library.sort";
const QUICK_FILTER_KEY = "library.quick-filter";

const SORT_LABELS: Record<CategorySort, string> = {
	added: "Recently added",
	title: "Title (A–Z)",
	unread: "Most unread",
};

const isCategorySort = (value: unknown): value is CategorySort =>
	value === "added" || value === "title" || value === "unread";

// Purely client-side shelves over the entries already loaded for the active
// tab; derived from cached chapter counts, so they're free to compute.
type QuickFilter = "all" | "unread" | "started" | "completed";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "unread", label: "Unread" },
	{ value: "started", label: "Started" },
	{ value: "completed", label: "Completed" },
];

const isQuickFilter = (value: unknown): value is QuickFilter =>
	value === "all" ||
	value === "unread" ||
	value === "started" ||
	value === "completed";

function matchesQuickFilter(item: LibraryItem, quick: QuickFilter): boolean {
	const total = item.cached_total_chapters;
	const read = item.read_chapters;
	switch (quick) {
		case "unread":
			return total - read > 0;
		case "started":
			return read > 0;
		case "completed":
			return total > 0 && read >= total;
		default:
			return true;
	}
}

// The tab persistence stores the raw tab value; only "all"/"none" and existing
// category ids are meaningful, but any string round-trips safely through here.
const isTabValue = (value: unknown): value is string =>
	typeof value === "string";

function sortItems(items: LibraryItem[], sort: CategorySort): LibraryItem[] {
	const next = [...items];
	switch (sort) {
		case "title":
			next.sort((a, b) => a.title.localeCompare(b.title));
			break;
		case "unread":
			next.sort(
				(a, b) =>
					b.cached_total_chapters -
					b.read_chapters -
					(a.cached_total_chapters - a.read_chapters),
			);
			break;
		default:
			// "added" — the backend already returns newest-first.
			break;
	}
	return next;
}

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
	// The active tab is remembered across sessions; a Category value is validated
	// against the current categories once they load (see below).
	const [lastTab, setLastTab] = usePersistentState<string>(
		LAST_TAB_KEY,
		ALL,
		isTabValue,
	);
	const [filter, setFilterState] = useState<CategoryFilter>(() =>
		toFilter(lastTab),
	);
	const [sort, setSort] = usePersistentState<CategorySort>(
		SORT_KEY,
		"added",
		isCategorySort,
	);
	const [quickFilter, setQuickFilter] = usePersistentState<QuickFilter>(
		QUICK_FILTER_KEY,
		"all",
		isQuickFilter,
	);
	const [editing, setEditing] = useState<LibraryItem | null>(null);

	const [selectionMode, setSelectionMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkOpen, setBulkOpen] = useState(false);

	const { card_size, library_layout, show_unread_badge } = useAppearance();
	const updateSettings = useUpdateSettings();
	const setLayout = (layout: LibraryLayout) =>
		updateSettings("appearance", { library_layout: layout });
	const categories = useCategories();
	const library = useLibrary(filter);
	const bulkRemove = useBulkRemove();
	const refresh = useLibraryRefresh();

	// A remembered category can disappear (deleted elsewhere); fall back to All so
	// the user isn't stranded on an empty, unselectable tab.
	useEffect(() => {
		if (filter.type !== "Category" || !categories.data) return;
		if (!categories.data.some((c) => c.id === filter.id)) {
			setFilterState(ALL_CATEGORIES);
			setLastTab(ALL);
		}
	}, [categories.data, filter, setLastTab]);

	// The header refresh follows the active tab; the bulk bar refreshes exactly
	// the selection.
	const tabScope = (): RefreshScope =>
		filter.type === "Category"
			? { type: "Category", id: filter.id }
			: { type: "All" };

	const uncategorized = useLibrary(UNCATEGORIZED_FILTER);
	const showUncategorized =
		(uncategorized.data?.length ?? 0) > 0 || filter.type === "Uncategorized";

	// Category tabs are ordered server-side by their own sort_mode; the All and
	// Uncategorized tabs have no category sort, so the global default applies here.
	const items = useMemo(() => {
		const base = library.data ?? [];
		const sorted = filter.type === "Category" ? base : sortItems(base, sort);
		return quickFilter === "all"
			? sorted
			: sorted.filter((item) => matchesQuickFilter(item, quickFilter));
	}, [library.data, filter.type, sort, quickFilter]);

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
		setLastTab(toTabValue(next));
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
					<Popover>
						<PopoverTrigger
							render={
								<Button aria-label="View options" size="sm" variant="ghost">
									{library_layout === "List" ? (
										<RowsIcon />
									) : (
										<SquaresFourIcon />
									)}
									View
								</Button>
							}
						/>
						<PopoverContent align="end" className="w-56 gap-3">
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs">
									Layout
								</span>
								<div className="flex gap-1">
									<LayoutButton
										active={library_layout !== "List"}
										icon={SquaresFourIcon}
										label="Grid"
										onClick={() => setLayout("Grid")}
									/>
									<LayoutButton
										active={library_layout === "List"}
										icon={RowsIcon}
										label="List"
										onClick={() => setLayout("List")}
									/>
								</div>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm">Unread badges</span>
								<Switch
									checked={show_unread_badge}
									onCheckedChange={(checked) =>
										updateSettings("appearance", {
											show_unread_badge: checked,
										})
									}
								/>
							</div>
						</PopoverContent>
					</Popover>
					{/* Category tabs carry their own sort (Manage categories); the All
					    and Uncategorized tabs use this global default instead. */}
					{filter.type !== "Category" && (
						<Select
							onValueChange={(value) => setSort(value as CategorySort)}
							value={sort}
						>
							<SelectTrigger
								aria-label="Sort library"
								className="h-9 w-auto gap-1.5 border-0 bg-transparent px-2 text-sm shadow-none hover:bg-muted"
							>
								<ArrowsDownUpIcon />
								<SelectValue>{SORT_LABELS[sort]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(SORT_LABELS) as CategorySort[]).map((value) => (
									<SelectItem key={value} value={value}>
										{SORT_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					<Button
						disabled={refresh.isRefreshing}
						onClick={() => refresh.refresh(tabScope())}
						size="sm"
						variant="ghost"
					>
						<ArrowClockwiseIcon
							className={refresh.isRefreshing ? "animate-spin" : undefined}
						/>
						{filter.type === "Category" ? "Update category" : "Check updates"}
					</Button>
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
					{/* h-auto + pb reserves room for the line-variant active underline
					    (sits at bottom-[-5px]); without it the fixed h-8 clips the
					    underline, and overflow-x-auto promotes overflow-y to auto,
					    surfacing it as a stray scrollbar. no-scrollbar then keeps the
					    genuine horizontal overflow (many categories) clean. */}
					<TabsList
						className="no-scrollbar h-auto max-w-full items-center overflow-x-auto pb-2"
						variant="line"
					>
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

			<div className="no-scrollbar flex gap-1.5 overflow-x-auto px-6 pt-3">
				{QUICK_FILTERS.map(({ value, label }) => (
					<button
						className={cn(
							"shrink-0 rounded-full border px-3 py-1 font-medium text-xs transition-colors",
							quickFilter === value
								? "border-primary bg-primary text-primary-foreground"
								: "border-border text-muted-foreground hover:bg-muted",
						)}
						key={value}
						onClick={() => setQuickFilter(value)}
						type="button"
					>
						{label}
					</button>
				))}
			</div>

			{refresh.progress && (
				<div className="space-y-1 px-6 pt-3">
					<Progress value={refresh.percent} />
					<p className="text-muted-foreground text-xs">
						{refresh.percent}% ·{" "}
						{refresh.progress.current_title || "Finishing…"} (
						{refresh.progress.done}/{refresh.progress.total})
					</p>
				</div>
			)}

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
							disabled={selected.size === 0 || refresh.isRefreshing}
							onClick={() =>
								refresh.refresh({
									type: "Entries",
									entries: selectedItems.map((i) => ({
										source_id: i.source_id,
										manga_id: i.manga_id,
									})),
								})
							}
							size="sm"
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={refresh.isRefreshing ? "animate-spin" : undefined}
							/>
							Update
						</Button>
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
					<MangaGridSkeleton size={card_size} />
				) : library.error ? (
					<p className="text-destructive text-sm">{library.error.message}</p>
				) : items.length === 0 ? (
					<EmptyState
						hasFilter={filter.type !== "All" || quickFilter !== "all"}
					/>
				) : library_layout === "List" ? (
					<LibraryList
						items={items}
						onEditCategories={setEditing}
						onStartSelect={startSelect}
						onToggleSelect={toggleSelect}
						selected={selected}
						selectionMode={selectionMode}
					/>
				) : (
					<MangaGrid size={card_size}>
						{items.map((item) => (
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

function LayoutButton({
	active,
	icon: Icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: Icon;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-medium text-xs transition-colors",
				active
					? "border-primary bg-primary/10 text-foreground"
					: "border-border text-muted-foreground hover:bg-muted",
			)}
			onClick={onClick}
			type="button"
		>
			<Icon />
			{label}
		</button>
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
