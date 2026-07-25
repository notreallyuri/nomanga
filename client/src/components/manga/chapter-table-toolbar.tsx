import {
	ArrowDownIcon,
	ArrowUpIcon,
	CaretDoubleLeftIcon,
	CaretDoubleRightIcon,
	CaretLeftIcon,
	CaretRightIcon,
	MagnifyingGlassIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Chapter } from "@/types/bindings";

const PAGE_SIZES = [25, 50, 100, 200] as const;

interface Props {
	table: Table<Chapter>;
	filter: string;
	onFilterChange: (value: string) => void;
	descending: boolean;
	onToggleSort: () => void;
	selectedIds: string[];
	onMarkRead: (ids: string[]) => void;
	onMarkUnread: (ids: string[]) => void;
	onClearSelection: () => void;
}

export function ChapterTableToolbar({
	table,
	filter,
	onFilterChange,
	descending,
	onToggleSort,
	selectedIds,
	onMarkRead,
	onMarkUnread,
	onClearSelection,
}: Props) {
	const { pageIndex, pageSize } = table.getState().pagination;
	const pageCount = table.getPageCount();

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-48 flex-1">
					<MagnifyingGlassIcon
						className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
						size={14}
					/>
					<Input
						className="h-9 pl-9"
						onChange={(e) => onFilterChange(e.target.value)}
						placeholder="Filter chapters…"
						value={filter}
					/>
				</div>

				<Button onClick={onToggleSort} size="sm" variant="outline">
					{descending ? <ArrowDownIcon /> : <ArrowUpIcon />}
					{descending ? "Newest first" : "Oldest first"}
				</Button>

				<Select
					onValueChange={(v) => table.setPageSize(Number(v))}
					value={String(pageSize)}
				>
					<SelectTrigger className="h-9 w-28" size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PAGE_SIZES.map((size) => (
							<SelectItem key={size} value={String(size)}>
								{size} rows
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{pageCount > 1 && (
					<div className="flex items-center gap-1">
						<span className="mr-1 whitespace-nowrap text-muted-foreground text-sm">
							{pageIndex + 1} / {pageCount}
						</span>
						<Button
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.setPageIndex(0)}
							size="icon"
							variant="outline"
						>
							<CaretDoubleLeftIcon />
						</Button>
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
						<Button
							disabled={!table.getCanNextPage()}
							onClick={() => table.setPageIndex(pageCount - 1)}
							size="icon"
							variant="outline"
						>
							<CaretDoubleRightIcon />
						</Button>
					</div>
				)}
			</div>

			{selectedIds.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
					<span className="text-sm">{selectedIds.length} selected</span>
					<Button onClick={() => onMarkRead(selectedIds)} size="sm">
						Mark read
					</Button>
					<Button
						onClick={() => onMarkUnread(selectedIds)}
						size="sm"
						variant="outline"
					>
						Mark unread
					</Button>
					<Button
						className="ml-auto"
						onClick={onClearSelection}
						size="sm"
						variant="ghost"
					>
						<XIcon />
						Clear
					</Button>
				</div>
			)}
		</div>
	);
}
