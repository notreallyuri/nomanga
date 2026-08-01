import {
	BookIcon,
	BookOpenIcon,
	ClockCounterClockwiseIcon,
	DotsThreeVerticalIcon,
	ImageBrokenIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	useContinueReading,
	useRemoveHistoryEntries,
} from "@/hooks/services/use-history";
import { sourceImageUrl } from "@/lib/source-image";
import { formatRelativeTime, historyBucket } from "@/lib/utils";
import type { ContinueReadingItem, HistoryEntryRef } from "@/types/bindings";

export const Route = createFileRoute("/_app/history")({
	component: HistoryPage,
});

const keyOf = (item: HistoryEntryRef) => `${item.source_id}/${item.manga_id}`;

function HistoryPage() {
	const { data, isPending, error } = useContinueReading(100);
	const remove = useRemoveHistoryEntries();

	const [selected, setSelected] = useState<Set<string>>(new Set());

	const items = data ?? [];

	const liveSelected = useMemo(() => {
		const present = new Set(items.map(keyOf));
		return new Set([...selected].filter((k) => present.has(k)));
	}, [items, selected]);

	const groups = useMemo(() => {
		const buckets = new Map<
			string,
			{ heading: string; entries: ContinueReadingItem[] }
		>();
		for (const item of items) {
			const { key, heading } = historyBucket(item.updated_at);
			const bucket = buckets.get(key);
			if (bucket) bucket.entries.push(item);
			else buckets.set(key, { heading, entries: [item] });
		}
		return [...buckets.entries()].map(([key, { heading, entries }]) => ({
			key,
			heading,
			entries,
		}));
	}, [items]);

	const toggle = (key: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});

	const toggleMany = (keys: string[], on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			for (const key of keys) {
				if (on) next.add(key);
				else next.delete(key);
			}
			return next;
		});

	const removeMany = (entries: ContinueReadingItem[]) => {
		const refs = entries.map((e) => ({
			source_id: e.source_id,
			manga_id: e.manga_id,
		}));
		remove.mutate(refs, {
			onSettled: () => setSelected(new Set()),
		});
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex min-h-14 items-center justify-between gap-4 px-6 pt-6">
				<h1 className="font-heading font-semibold text-2xl">History</h1>

				{liveSelected.size > 0 && (
					<div className="flex items-center gap-3">
						<span className="text-muted-foreground text-sm tabular-nums">
							{liveSelected.size} selected
						</span>
						<Button
							disabled={remove.isPending}
							onClick={() =>
								removeMany(items.filter((i) => liveSelected.has(keyOf(i))))
							}
							size="sm"
							variant="destructive"
						>
							<TrashIcon />
							Remove
						</Button>
					</div>
				)}
			</div>

			<div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 pt-4 pb-6">
				{isPending ? (
					<HistorySkeleton />
				) : error ? (
					<p className="text-destructive text-sm">{error.message}</p>
				) : items.length === 0 ? (
					<EmptyState />
				) : (
					groups.map((group) => (
						<HistoryGroup
							entries={group.entries}
							heading={group.heading}
							key={group.key}
							onToggle={toggle}
							onToggleGroup={toggleMany}
							selected={liveSelected}
						/>
					))
				)}
			</div>
		</div>
	);
}

function HistoryGroup({
	heading,
	entries,
	selected,
	onToggle,
	onToggleGroup,
}: {
	heading: string;
	entries: ContinueReadingItem[];
	selected: Set<string>;
	onToggle: (key: string, on: boolean) => void;
	onToggleGroup: (keys: string[], on: boolean) => void;
}) {
	const keys = entries.map(keyOf);
	const selectedCount = keys.filter((k) => selected.has(k)).length;
	const allSelected = selectedCount === entries.length;

	return (
		<section>
			<h2 className="mb-2 font-medium text-muted-foreground text-sm">
				{heading}
			</h2>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow>
						<TableHead className="w-10">
							<Checkbox
								aria-label={`Select all in ${heading}`}
								checked={allSelected}
								indeterminate={selectedCount > 0 && !allSelected}
								onCheckedChange={(on) => onToggleGroup(keys, on === true)}
							/>
						</TableHead>
						<TableHead>Title</TableHead>
						<TableHead className="hidden w-44 md:table-cell">Chapter</TableHead>
						<TableHead className="hidden w-40 sm:table-cell">
							Progress
						</TableHead>
						<TableHead className="w-28 text-right">Last read</TableHead>
						<TableHead className="w-14" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((item) => (
						<HistoryRow
							item={item}
							key={keyOf(item)}
							onToggle={(on) => onToggle(keyOf(item), on)}
							selected={selected.has(keyOf(item))}
						/>
					))}
				</TableBody>
			</Table>
		</section>
	);
}

function HistoryRow({
	item,
	selected,
	onToggle,
}: {
	item: ContinueReadingItem;
	selected: boolean;
	onToggle: (on: boolean) => void;
}) {
	const navigate = useNavigate();

	const resume = item.last_chapter_done
		? "Finished"
		: `Page ${item.last_page + 1}`;

	return (
		<TableRow className="group" data-state={selected ? "selected" : undefined}>
			<TableCell>
				<Checkbox
					aria-label={`Select ${item.title}`}
					checked={selected}
					onCheckedChange={(on) => onToggle(on === true)}
				/>
			</TableCell>

			<TableCell className="max-w-0 overflow-hidden">
				<Link
					className="flex w-full min-w-0 items-center gap-3"
					params={{
						sourceId: item.source_id,
						mangaId: item.manga_id,
						chapterId: item.last_chapter_id,
					}}
					to="/read/$sourceId/$mangaId/$chapterId"
				>
					<Thumbnail
						title={item.title}
						url={sourceImageUrl(item.source_id, item.cover_url, {
							cache: true,
						})}
					/>
					<span className="min-w-0 flex-1 truncate font-medium">
						{item.title}
					</span>
				</Link>
			</TableCell>

			<TableCell className="hidden max-w-0 truncate text-muted-foreground text-sm md:table-cell">
				{item.last_chapter_title || item.last_chapter_id}
			</TableCell>

			<TableCell className="hidden text-muted-foreground text-sm sm:table-cell">
				{resume}
			</TableCell>

			<TableCell className="text-right text-muted-foreground text-xs tabular-nums">
				{formatRelativeTime(item.updated_at)}
			</TableCell>

			<TableCell>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								aria-label="Open menu"
								className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
								size="icon-sm"
								variant="ghost"
							>
								<DotsThreeVerticalIcon />
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() =>
								navigate({
									params: {
										sourceId: item.source_id,
										mangaId: item.manga_id,
										chapterId: item.last_chapter_id,
									},
									to: "/read/$sourceId/$mangaId/$chapterId",
								})
							}
						>
							<BookOpenIcon />
							Read
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() =>
								navigate({
									params: {
										sourceId: item.source_id,
										mangaId: item.manga_id,
									},
									to: "/manga/$sourceId/$mangaId",
								})
							}
						>
							<BookIcon />
							Go to Manga
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	);
}

function Thumbnail({ url, title }: { url: string; title: string }) {
	const [failed, setFailed] = useState(!url);

	return (
		<div className="relative h-12 w-8 shrink-0 overflow-hidden bg-muted">
			{failed ? (
				<div className="flex h-full items-center justify-center">
					<ImageBrokenIcon className="text-muted-foreground" size={12} />
				</div>
			) : (
				<img
					alt=""
					className="h-full w-full object-cover"
					decoding="async"
					loading="lazy"
					onError={() => setFailed(true)}
					src={url}
				/>
			)}
			<span className="sr-only">{title}</span>
		</div>
	);
}

function HistorySkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 8 }, (_, i) => (
				<div className="flex items-center gap-3 py-1.5" key={i}>
					<Skeleton className="size-4.5 shrink-0" />
					<Skeleton className="aspect-2/3 w-8 shrink-0" />
					<Skeleton className="h-4 w-1/3" />
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
			<ClockCounterClockwiseIcon className="text-muted-foreground" size={40} />
			<div>
				<p className="font-medium">No reading history</p>
				<p className="mt-1 text-muted-foreground text-sm">
					Chapters you read show up here so you can pick up where you left off.
				</p>
			</div>
		</div>
	);
}
