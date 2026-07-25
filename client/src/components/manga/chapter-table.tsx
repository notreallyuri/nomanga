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
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
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
	useMarkChapterRead,
	useMarkChaptersRead,
	useMarkChaptersUnread,
} from "@/hooks/services/use-history";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/types/bindings";
import { ChapterTableToolbar } from "./chapter-table-toolbar";

interface Props {
	chapters: Chapter[];
	sourceId: string;
	mangaId: string;
	readChapters: Set<string>;
	resumeChapterId?: string;
	resumePage?: number;
}

export function ChapterTable({
	chapters,
	sourceId,
	mangaId,
	readChapters,
	resumeChapterId,
	resumePage,
}: Props) {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "number", desc: true },
	]);
	const [selection, setSelection] = useState<RowSelectionState>({});
	const [filter, setFilter] = useState("");

	const markOne = useMarkChapterRead(sourceId, mangaId);
	const markMany = useMarkChaptersRead(sourceId, mangaId);

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
						onCheckedChange={(v) => row.toggleSelected(!!v)}
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

	const selectedIds = Object.keys(selection).filter((id) => selection[id]);

	const markManyRead = useMarkChaptersRead(sourceId, mangaId);
	const markManyUnread = useMarkChaptersUnread(sourceId, mangaId);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<ChapterTableToolbar
				descending={sorting[0]?.desc ?? true}
				filter={filter}
				onClearSelection={() => setSelection({})}
				onFilterChange={setFilter}
				onMarkRead={(ids) => {
					markManyRead.mutate(ids);
					setSelection({});
				}}
				onMarkUnread={(ids) => {
					markManyUnread.mutate(ids);
					setSelection({});
				}}
				onToggleSort={() =>
					setSorting([{ id: "number", desc: !sorting[0]?.desc }])
				}
				selectedIds={selectedIds}
				table={table}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto rounded-none border border-border">
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
