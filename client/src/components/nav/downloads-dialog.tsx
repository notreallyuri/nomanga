import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	CaretRightIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	ClockIcon,
	PauseIcon,
	PlayIcon,
	ProhibitIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
	useCancelAllDownloads,
	useCancelDownload,
	useDownloadsPaused,
	useQueueDownloads,
	useSetDownloadsPaused,
} from "@/hooks/services/use-downloads";
import { cn } from "@/lib/utils";
import type { DownloadProgress, DownloadState } from "@/types/bindings";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Progress } from "../ui/progress";

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

	const groups = groupByManga(items);
	const selected = selectedId
		? (groups.find((g) => g.mangaId === selectedId) ?? null)
		: null;

	const hasFinished = items.some((i) => !isActive(i));

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
							<div className="min-w-0 flex-1">
								<DialogTitle className="truncate">
									{selected.mangaTitle}
								</DialogTitle>
								<DialogDescription>
									{summarize(selected.items)}
								</DialogDescription>
							</div>
						</div>
					) : (
						<>
							<DialogTitle>Downloads</DialogTitle>
							<DialogDescription>
								{active > 0
									? `${active} chapter${active === 1 ? "" : "s"} in progress.`
									: summarize(items)}
							</DialogDescription>
						</>
					)}
				</DialogHeader>

				{items.length === 0 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						Download a chapter from a series to see it here.
					</p>
				) : selected ? (
					// Roughly ten chapter rows, then scroll — long series stay compact.
					<div className="-mx-1 max-h-[min(20rem,60vh)] overflow-y-auto px-1">
						{selected.items.map((item) => (
							<ChapterRow item={item} key={item.chapter_id} />
						))}
					</div>
				) : (
					<div className="-mx-1 max-h-[60vh] space-y-1 overflow-y-auto px-1">
						{groups.map((group) => (
							<MangaRow
								group={group}
								key={group.mangaId}
								onOpen={() => setSelectedId(group.mangaId)}
							/>
						))}
					</div>
				)}

				{(hasFinished || active > 0) && (
					<div className="flex items-center gap-2 border-border border-t pt-3">
						<QueueControls active={active} />
						<div className="flex-1" />
						{hasFinished && (
							<Button onClick={onClearFinished} size="sm" variant="ghost">
								Clear finished
							</Button>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function QueueControls({ active }: { active: number }) {
	const { data: paused } = useDownloadsPaused();
	const setPaused = useSetDownloadsPaused();
	const cancelAll = useCancelAllDownloads();

	if (active === 0) return null;

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

			<Button
				className="text-destructive"
				onClick={() => cancelAll.mutate()}
				size="sm"
				variant="ghost"
			>
				Cancel all
			</Button>

			{paused && (
				<span className="text-muted-foreground text-xs">
					Paused after this chapter
				</span>
			)}
		</>
	);
}

interface Group {
	mangaId: string;
	mangaTitle: string;
	items: DownloadProgress[];
}

const isActive = (i: DownloadProgress) =>
	i.state === "Queued" || i.state === "Downloading";

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

function groupPercent(items: DownloadProgress[]): number {
	const sum = items.reduce((acc, i) => {
		if (i.state === "Done") return acc + 1;
		if (i.state === "Downloading" && i.total > 0) return acc + i.done / i.total;
		return acc;
	}, 0);
	return items.length > 0 ? Math.round((sum / items.length) * 100) : 0;
}

function summarize(items: DownloadProgress[]): string {
	const active = items.filter(isActive).length;
	const done = items.filter((i) => i.state === "Done").length;
	const failed = items.filter((i) => i.state === "Failed").length;
	const cancelled = items.filter((i) => i.state === "Cancelled").length;

	const parts: string[] = [];
	if (active > 0) parts.push(`${active} in progress`);
	if (done > 0) parts.push(`${done} done`);
	if (failed > 0) parts.push(`${failed} failed`);
	if (cancelled > 0) parts.push(`${cancelled} cancelled`);

	return parts.length > 0 ? parts.join(" · ") : "Nothing in progress.";
}

function MangaRow({ group, onOpen }: { group: Group; onOpen: () => void }) {
	const done = group.items.filter((i) => i.state === "Done").length;

	return (
		<button
			className="flex w-full flex-col gap-1.5 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
			onClick={onOpen}
			type="button"
		>
			<div className="flex items-center gap-2">
				<StateIcon state={groupState(group.items)} />
				<span className="min-w-0 flex-1 truncate font-medium text-sm">
					{group.mangaTitle}
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{done}/{group.items.length}
				</span>
				<CaretRightIcon className="shrink-0 text-muted-foreground" size={14} />
			</div>
			<Progress className="h-1" value={groupPercent(group.items)} />
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

	return (
		<div className="flex items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-muted/50">
			<StateIcon state={item.state} />

			<span
				className={cn(
					"min-w-0 flex-1 truncate",
					item.state === "Done" && "text-muted-foreground",
				)}
			>
				{item.title}
			</span>

			{item.state === "Downloading" && (
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{item.done}/{item.total}
				</span>
			)}

			{(item.state === "Failed" || item.state === "Cancelled") && (
				<Button
					className="h-6 shrink-0 gap-1 px-1.5 text-xs"
					onClick={retry}
					size="sm"
					title={item.error ?? undefined}
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
