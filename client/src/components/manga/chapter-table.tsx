import {
	CaretLeftIcon,
	CaretRightIcon,
	CheckCircleIcon,
	DotsThreeVerticalIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	type Table as TableInstance,
	useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	useDownloadedChapters,
	useQueueDownloads,
} from "@/hooks/services/use-downloads";
import {
	useMarkChapterRead,
	useMarkChaptersRead,
	useMarkChaptersUnread,
} from "@/hooks/services/use-history";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/types/bindings";
import { ChapterTableToolbar } from "./chapter-table-toolbar";
import { DownloadCell } from "./download-cell";

interface Props {
	chapters: Chapter[];
	sourceId: string;
	mangaId: string;
	mangaTitle: string;
	readChapters: Set<string>;
	resumeChapterId?: string;
	resumePage?: number;
}

export function ChapterTable({
	chapters,
	sourceId,
	mangaId,
	mangaTitle,
	readChapters,
	resumeChapterId,
	resumePage,
}: Props) {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "number", desc: true },
	]);
	const [selection, setSelection] = useState<RowSelectionState>({});
	const [filter, setFilter] = useState("");
	const [anchorId, setAnchorId] = useState<string | null>(null);

	const tableRef = useRef<TableInstance<Chapter> | null>(null);

	const orderedIds = useCallback(
		() => tableRef.current?.getSortedRowModel().rows.map((row) => row.id) ?? [],
		[],
	);

	const select = useCallback((ids: string[]) => {
		if (ids.length === 0) return;
		setSelection((prev) => {
			const next = { ...prev };
			for (const id of ids) next[id] = true;
			return next;
		});
	}, []);

	const selectAbove = useCallback(
		(id: string) => {
			const ids = orderedIds();
			const at = ids.indexOf(id);
			if (at >= 0) select(ids.slice(0, at + 1));
		},
		[orderedIds, select],
	);

	const selectBelow = useCallback(
		(id: string) => {
			const ids = orderedIds();
			const at = ids.indexOf(id);
			if (at >= 0) select(ids.slice(at));
		},
		[orderedIds, select],
	);

	const selectRangeTo = useCallback(
		(id: string) => {
			const ids = orderedIds();
			const to = ids.indexOf(id);
			const from = anchorId ? ids.indexOf(anchorId) : -1;

			if (to < 0 || from < 0) {
				select([id]);
				setAnchorId(id);
				return;
			}

			const [start, end] = from <= to ? [from, to] : [to, from];
			select(ids.slice(start, end + 1));
		},
		[anchorId, orderedIds, select],
	);

	const clearSelection = useCallback(() => {
		setSelection({});
		setAnchorId(null);
	}, []);

	const markOne = useMarkChapterRead(sourceId, mangaId);
	const markMany = useMarkChaptersRead(sourceId, mangaId);

	const downloaded = useDownloadedChapters(sourceId, mangaId);
	const downloadedSet = useMemo(
		() => new Set(downloaded.data ?? []),
		[downloaded.data],
	);
	const queueDownloads = useQueueDownloads();

	const columns = useMemo<ColumnDef<Chapter>[]>(
		() => [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						aria-label="Select all"
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() && undefined)
						}
						onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						aria-label="Select chapter"
						checked={row.getIsSelected()}
						onCheckedChange={(v) => {
							row.toggleSelected(!!v);
							setAnchorId(row.id);
						}}
						onClick={(e) => {
							if (!e.shiftKey) return;
							e.preventDefault();
							selectRangeTo(row.id);
						}}
					/>
				),
				enableSorting: false,
				size: 40,
			},
			{
				accessorKey: "number",
				header: "Chapter",
				cell: ({ row }) => {
					const chapter = row.original;
					const isRead = readChapters.has(chapter.id);
					const isResume = chapter.id === resumeChapterId;

					return (
						<Link
							className="block min-w-0"
							params={{ sourceId, mangaId, chapterId: chapter.id }}
							to="/read/$sourceId/$mangaId/$chapterId"
						>
							<p
								className={cn(
									"truncate font-medium text-sm",
									isRead && "text-muted-foreground",
									isResume && "text-primary",
								)}
							>
								{chapter.title}
							</p>
							{chapter.scanlator && (
								<p className="truncate text-muted-foreground text-xs">
									{chapter.scanlator}
								</p>
							)}
						</Link>
					);
				},
			},
			{
				id: "status",
				header: "",
				cell: ({ row }) => {
					const chapter = row.original;

					if (chapter.id === resumeChapterId && resumePage) {
						return <Badge variant="default">Page {resumePage}</Badge>;
					}

					if (readChapters.has(chapter.id)) {
						return (
							<CheckCircleIcon
								className="text-muted-foreground"
								size={18}
								weight="fill"
							/>
						);
					}

					return null;
				},
				enableSorting: false,
				size: 80,
			},
			{
				accessorKey: "upload_date",
				header: "Uploaded",
				cell: ({ row }) => {
					const date = row.original.upload_date;
					if (!date) return null;

					const parsed = new Date(date);
					return (
						<span className="text-muted-foreground text-xs">
							{Number.isNaN(parsed.getTime())
								? date
								: parsed.toLocaleDateString()}
						</span>
					);
				},
				size: 110,
			},
			{
				id: "download",
				header: "",
				cell: ({ row }) => (
					<DownloadCell
						chapter={row.original}
						downloaded={downloadedSet.has(row.original.id)}
						mangaId={mangaId}
						mangaTitle={mangaTitle}
						sourceId={sourceId}
					/>
				),
				enableSorting: false,
				size: 44,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const chapter = row.original;
					const isRead = readChapters.has(chapter.id);

					return (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button size="icon" variant="ghost">
										<DotsThreeVerticalIcon />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() =>
										markOne.mutate({ chapterId: chapter.id, read: !isRead })
									}
								>
									Mark as {isRead ? "unread" : "read"}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => selectAbove(chapter.id)}>
									Select all above
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => selectBelow(chapter.id)}>
									Select all below
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={!anchorId || anchorId === chapter.id}
									onClick={() => selectRangeTo(chapter.id)}
								>
									Select up to here
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => {
										const current = chapter.number;
										if (current === null) return;

										const ids = chapters
											.filter((c) => c.number !== null && c.number < current)
											.map((c) => c.id);

										markMany.mutate(ids);
									}}
								>
									Mark previous as read
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
				enableSorting: false,
				size: 40,
			},
		],
		[
			chapters,
			readChapters,
			resumeChapterId,
			resumePage,
			sourceId,
			mangaId,
			markOne,
			markMany,
			downloadedSet,
			mangaTitle,
			anchorId,
			selectAbove,
			selectBelow,
			selectRangeTo,
		],
	);

	const table = useReactTable({
		data: chapters,
		columns,
		state: { sorting, rowSelection: selection, globalFilter: filter },
		onSortingChange: setSorting,
		onRowSelectionChange: setSelection,
		onGlobalFilterChange: setFilter,
		getRowId: (row) => row.id,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 50 } },
	});

	tableRef.current = table;

	// Ordered by what the user sees, not by object key order, so "the first
	// selected chapter" means the topmost one on screen.
	const selectedIds = useMemo(
		() =>
			table
				.getSortedRowModel()
				.rows.map((row) => row.id)
				.filter((id) => selection[id]),
		[table, selection],
	);

	// The bulk action follows the first selected chapter: if it is already read
	// the button offers to unread the selection, and vice versa. Saves guessing
	// which of two buttons applies to a mixed selection.
	const firstSelectedRead =
		selectedIds.length > 0 && readChapters.has(selectedIds[0]);

	const markManyRead = useMarkChaptersRead(sourceId, mangaId);
	const markManyUnread = useMarkChaptersUnread(sourceId, mangaId);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<ChapterTableToolbar
				descending={sorting[0]?.desc ?? true}
				filter={filter}
				firstSelectedRead={firstSelectedRead}
				onClearSelection={clearSelection}
				onFilterChange={setFilter}
				onMarkRead={(ids) => {
					markManyRead.mutate(ids);
					clearSelection();
				}}
				onMarkUnread={(ids) => {
					markManyUnread.mutate(ids);
					clearSelection();
				}}
				onDownload={(ids) => {
					// Queued oldest chapter first, whichever way the table is sorted.
					// `ids` follows the visible order, which defaults to newest first,
					// and the queue is strictly first-in-first-out — so without this a
					// "download everything" run works backwards from the latest chapter.
					const targets = ids
						.filter((id) => !downloadedSet.has(id))
						.map((id) => chapters.find((c) => c.id === id))
						.filter((chapter) => chapter !== undefined)
						.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
						.map((chapter) => ({
							chapter_id: chapter.id,
							title: chapter.title,
						}));
					if (targets.length > 0) {
						queueDownloads.mutate({ sourceId, mangaId, mangaTitle, targets });
					}
					clearSelection();
				}}
				onToggleSort={() =>
					setSorting([{ id: "number", desc: !sorting[0]?.desc }])
				}
				selectedIds={selectedIds}
				table={table}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((group) => (
							<TableRow key={group.id}>
								{group.headers.map((header) => (
									<TableHead
										key={header.id}
										style={{ width: header.getSize() }}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.map((row) => (
							<TableRow
								data-state={row.getIsSelected() && "selected"}
								key={row.id}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{table.getPageCount() > 1 && (
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-sm">
						Page {table.getState().pagination.pageIndex + 1} of{" "}
						{table.getPageCount()}
					</p>
					<div className="flex gap-1">
						<Button
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
							size="icon"
							variant="outline"
						>
							<CaretLeftIcon />
						</Button>
						<Button
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
							size="icon"
							variant="outline"
						>
							<CaretRightIcon />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
