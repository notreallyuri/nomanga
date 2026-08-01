import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	CaretRightIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	ClockIcon,
	DownloadSimpleIcon,
	PauseIcon,
	PlayIcon,
	ProhibitIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { CoverImage } from "@/components/manga/cover-image";
import { useSettingsUI } from "@/components/settings/context";
import {
	useCancelAllDownloads,
	useCancelDownload,
	useDownloadsPaused,
	useQueueDownloads,
	useSetDownloadsPaused,
} from "@/hooks/services/use-downloads";
import { useMangaCovers } from "@/hooks/use-manga-covers";
import { cn } from "@/lib/utils";
import type { DownloadProgress, DownloadState } from "@/types/bindings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Progress } from "../ui/progress";
import {
	DialogBody,
	EmptyState,
	HeadlineProgress,
	type Stat,
	StatChips,
} from "./progress-dialog-parts";

export function DownloadsDialog({
	open,
	onOpenChange,
	items,
	active,
	onClearFinished,
}: {
	open: boolean;
	onOpenChange: (value: boolean) => void;
	items: DownloadProgress[];
	active: number;
	onClearFinished: () => void;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const coverFor = useMangaCovers(open);
	const { data: paused } = useDownloadsPaused();

	const groups = groupByManga(items);
	const selected = selectedId
		? (groups.find((g) => g.mangaId === selectedId) ?? null)
		: null;

	// Every summary and action follows the drill-in: inside a series they speak
	// for that series, at the top level for the whole queue.
	const scope = selected ? selected.items : items;

	const handleOpenChange = (next: boolean) => {
		if (!next) setSelectedId(null);
		onOpenChange(next);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					{selected ? (
						<div className="flex items-center gap-2">
							<Button
								aria-label="Back to all downloads"
								className="-ml-2 shrink-0"
								onClick={() => setSelectedId(null)}
								size="icon"
								variant="ghost"
							>
								<ArrowLeftIcon />
							</Button>
							<CoverImage
								className="h-10 w-7 shrink-0 rounded-sm object-cover"
								iconSize={12}
								sourceId={selected.sourceId}
								url={coverFor(selected.sourceId, selected.mangaId)}
							/>
							<div className="min-w-0 flex-1">
								<DialogTitle className="truncate">
									{selected.mangaTitle}
								</DialogTitle>
								<DialogDescription>
									{count(selected.items, "Done")} of {selected.items.length}{" "}
									chapters saved
								</DialogDescription>
							</div>
						</div>
					) : (
						<>
							<DialogTitle>Downloads</DialogTitle>
							<DialogDescription>
								{active > 0
									? `${active} chapter${active === 1 ? "" : "s"} left in the queue.`
									: "Chapters saved for offline reading."}
							</DialogDescription>
						</>
					)}
				</DialogHeader>

				{items.length > 0 && <Summary items={scope} />}

				<DialogBody>
					{items.length === 0 ? (
						<DownloadsEmpty onClose={() => onOpenChange(false)} />
					) : selected ? (
						selected.items.map((item) => (
							<ChapterRow item={item} key={item.chapter_id} />
						))
					) : (
						<div className="space-y-1">
							{groups.map((group) => (
								<MangaRow
									coverUrl={coverFor(group.sourceId, group.mangaId)}
									group={group}
									key={group.mangaId}
									onOpen={() => setSelectedId(group.mangaId)}
								/>
							))}
						</div>
					)}
				</DialogBody>

				{(items.length > 0 || paused) && (
					<DialogFooter className="border-border border-t pt-3 sm:items-center sm:justify-start">
						<QueueControls active={active} />
						<div className="hidden flex-1 sm:block" />
						<RetryFailed items={scope} />
						{items.some((i) => !isActive(i)) && (
							<Button onClick={onClearFinished} size="sm" variant="ghost">
								Clear finished
							</Button>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Summary({ items }: { items: DownloadProgress[] }) {
	const { data: paused } = useDownloadsPaused();

	const current = items.find((i) => i.state === "Downloading");
	const label = paused
		? "Paused — finishing the current chapter"
		: (current?.title ?? "Nothing in progress");

	return (
		<div className="space-y-2">
			<HeadlineProgress label={label} percent={percent(items)} />
			<StatChips stats={stats(items)} />
		</div>
	);
}

function DownloadsEmpty({ onClose }: { onClose: () => void }) {
	const { openSettings } = useSettingsUI();

	return (
		<EmptyState
			action={
				<Button
					onClick={() => {
						onClose();
						openSettings("Downloads");
					}}
					size="sm"
					variant="outline"
				>
					Manage saved chapters
				</Button>
			}
			body="Download a chapter from a series and its progress shows up here. Chapters already saved live in Settings."
			icon={<DownloadSimpleIcon size={28} />}
			title="Nothing in the queue"
		/>
	);
}

function QueueControls({ active }: { active: number }) {
	const { data: paused } = useDownloadsPaused();
	const setPaused = useSetDownloadsPaused();
	const cancelAll = useCancelAllDownloads();

	if (active === 0 && !paused) return null;

	return (
		<>
			<Button
				onClick={() => setPaused.mutate(!paused)}
				size="sm"
				variant="ghost"
			>
				{paused ? <PlayIcon /> : <PauseIcon />}
				{paused ? "Resume" : "Pause"}
			</Button>

			{active > 0 && (
				<Button
					className="text-destructive"
					onClick={() => cancelAll.mutate()}
					size="sm"
					variant="ghost"
				>
					Cancel all
				</Button>
			)}
		</>
	);
}

function RetryFailed({ items }: { items: DownloadProgress[] }) {
	const queue = useQueueDownloads();

	const retryable = items.filter((i) => i.state === "Failed");

	if (retryable.length === 0) return null;

	const retryAll = () => {
		for (const group of groupByManga(retryable)) {
			queue.mutate({
				sourceId: group.sourceId,
				mangaId: group.mangaId,
				mangaTitle: group.mangaTitle,
				targets: group.items.map((i) => ({
					chapter_id: i.chapter_id,
					title: i.title,
				})),
			});
		}
	};

	return (
		<Button
			disabled={queue.isPending}
			onClick={retryAll}
			size="sm"
			variant="ghost"
		>
			<ArrowClockwiseIcon />
			Retry {retryable.length} failed
		</Button>
	);
}

interface Group {
	sourceId: string;
	mangaId: string;
	mangaTitle: string;
	items: DownloadProgress[];
}

const isActive = (i: DownloadProgress) =>
	i.state === "Queued" || i.state === "Downloading";

const count = (items: DownloadProgress[], state: DownloadState) =>
	items.filter((i) => i.state === state).length;

const RANK: Record<DownloadState, number> = {
	Downloading: 0,
	Queued: 1,
	Failed: 2,
	Cancelled: 3,
	Done: 4,
};

function groupByManga(items: DownloadProgress[]): Group[] {
	const groups = new Map<string, Group>();
	for (const item of items) {
		const existing = groups.get(item.manga_id);
		if (existing) {
			existing.items.push(item);
		} else {
			groups.set(item.manga_id, {
				sourceId: item.source_id,
				mangaId: item.manga_id,
				mangaTitle: item.manga_title || "Unknown series",
				items: [item],
			});
		}
	}

	const list = [...groups.values()];
	for (const group of list) {
		group.items.sort((a, b) => RANK[a.state] - RANK[b.state]);
	}

	return list.sort(
		(a, b) => Number(b.items.some(isActive)) - Number(a.items.some(isActive)),
	);
}

function percent(items: DownloadProgress[]): number {
	const sum = items.reduce((acc, i) => {
		if (i.state === "Done") return acc + 1;
		if (i.state === "Downloading" && i.total > 0) return acc + i.done / i.total;
		return acc;
	}, 0);
	return items.length > 0 ? Math.round((sum / items.length) * 100) : 0;
}

function stats(items: DownloadProgress[]): Stat[] {
	return [
		{ label: "in progress", count: items.filter(isActive).length },
		{ label: "done", count: count(items, "Done") },
		{
			label: "failed",
			count: count(items, "Failed"),
			variant: "destructive",
		},
		{ label: "cancelled", count: count(items, "Cancelled") },
	];
}

function MangaRow({
	group,
	coverUrl,
	onOpen,
}: {
	group: Group;
	coverUrl: string | null;
	onOpen: () => void;
}) {
	const done = count(group.items, "Done");
	const failed = count(group.items, "Failed");

	return (
		<button
			className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted/50"
			onClick={onOpen}
			type="button"
		>
			<CoverImage
				className="h-12 w-8 shrink-0 rounded-sm object-cover"
				iconSize={12}
				sourceId={group.sourceId}
				url={coverUrl}
			/>

			<div className="min-w-0 flex-1 space-y-1.5">
				<div className="flex items-center gap-2">
					<StateIcon state={groupState(group.items)} />
					<span className="min-w-0 flex-1 truncate font-medium text-sm">
						{group.mangaTitle}
					</span>
					{failed > 0 && (
						<Badge variant="destructive">
							<span className="tabular-nums">{failed}</span>
							failed
						</Badge>
					)}
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{done}/{group.items.length}
					</span>
				</div>
				<Progress className="h-1" value={percent(group.items)} />
			</div>

			<CaretRightIcon className="shrink-0 text-muted-foreground" size={14} />
		</button>
	);
}

function groupState(items: DownloadProgress[]): DownloadState {
	if (items.some((i) => i.state === "Downloading")) return "Downloading";
	if (items.some((i) => i.state === "Queued")) return "Queued";
	if (items.some((i) => i.state === "Failed")) return "Failed";
	if (items.every((i) => i.state === "Cancelled")) return "Cancelled";
	return "Done";
}

function ChapterRow({ item }: { item: DownloadProgress }) {
	const queue = useQueueDownloads();
	const cancel = useCancelDownload();

	const retry = () =>
		queue.mutate({
			sourceId: item.source_id,
			mangaId: item.manga_id,
			mangaTitle: item.manga_title,
			targets: [{ chapter_id: item.chapter_id, title: item.title }],
		});

	const downloading = item.state === "Downloading";

	return (
		<div className="flex items-start gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-muted/50">
			<span className="mt-0.5">
				<StateIcon state={item.state} />
			</span>

			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"min-w-0 flex-1 truncate",
							item.state === "Done" && "text-muted-foreground",
						)}
					>
						{item.title}
					</span>
					{downloading && (
						<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
							{item.done}/{item.total}
						</span>
					)}
				</div>

				{downloading && item.total > 0 && (
					<Progress
						className="h-1"
						value={Math.round((item.done / item.total) * 100)}
					/>
				)}

				{/* The reason lived in a hover title before, where nobody found it. */}
				{item.state === "Failed" && item.error && (
					<p className="truncate text-destructive text-xs" title={item.error}>
						{item.error}
					</p>
				)}
			</div>

			{(item.state === "Failed" || item.state === "Cancelled") && (
				<Button
					className="h-6 shrink-0 gap-1 px-1.5 text-xs"
					onClick={retry}
					size="sm"
					variant="ghost"
				>
					<ArrowClockwiseIcon size={12} />
					Retry
				</Button>
			)}

			{isActive(item) && (
				<Button
					aria-label={`Cancel ${item.title}`}
					className="h-6 w-6 shrink-0"
					disabled={cancel.isPending}
					onClick={() =>
						cancel.mutate({
							sourceId: item.source_id,
							mangaId: item.manga_id,
							chapterId: item.chapter_id,
						})
					}
					size="icon"
					variant="ghost"
				>
					<XIcon size={12} />
				</Button>
			)}
		</div>
	);
}

function StateIcon({ state }: { state: DownloadState }) {
	switch (state) {
		case "Queued":
			return <ClockIcon className="shrink-0 text-muted-foreground" size={16} />;
		case "Downloading":
			return (
				<CircleNotchIcon
					className="shrink-0 animate-spin text-muted-foreground"
					size={16}
				/>
			);
		case "Done":
			return (
				<CheckCircleIcon
					className="shrink-0 text-muted-foreground"
					size={16}
					weight="fill"
				/>
			);
		case "Failed":
			return (
				<WarningCircleIcon className="shrink-0 text-destructive" size={16} />
			);
		case "Cancelled":
			return (
				<ProhibitIcon className="shrink-0 text-muted-foreground" size={16} />
			);
	}
}
