import {
	ArrowClockwiseIcon,
	CaretRightIcon,
	CheckCircleIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { CoverImage } from "@/components/manga/cover-image";
import { historyBucket } from "@/lib/utils";
import type { LibraryRefreshProgress, LibraryUpdate } from "@/types/bindings";
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
import {
	DialogBody,
	EmptyState,
	HeadlineProgress,
} from "./progress-dialog-parts";

export type RefreshLogEntry = { done: number; total: number; title: string };

export function UpdatesDialog({
	open,
	onOpenChange,
	running,
	percent,
	progress,
	log,
	updates,
	onCheck,
	onClear,
	clearing,
}: {
	open: boolean;
	onOpenChange: (value: boolean) => void;
	running: boolean;
	percent: number;
	progress: LibraryRefreshProgress | null;
	log: RefreshLogEntry[];
	updates: LibraryUpdate[];
	onCheck: () => void;
	onClear: () => void;
	clearing: boolean;
}) {
	const newChapters = updates.reduce((sum, u) => sum + u.new_count, 0);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Library updates</DialogTitle>
					<DialogDescription>
						{running
							? "Checking your library for new chapters."
							: updates.length > 0
								? `${updates.length} series · ${newChapters} new chapter${
										newChapters === 1 ? "" : "s"
									}`
								: "Everything is up to date."}
					</DialogDescription>
				</DialogHeader>

				{running && (
					<HeadlineProgress
						detail={progress ? `${progress.done}/${progress.total}` : undefined}
						label={progress?.current_title || "Finishing…"}
						percent={percent}
					/>
				)}

				<DialogBody className="no-scrollbar">
					{running ? (
						<RefreshLog log={log} />
					) : updates.length > 0 ? (
						<UpdateList
							onNavigate={() => onOpenChange(false)}
							updates={updates}
						/>
					) : (
						<EmptyState
							body="Nothing new since the last check. Run another check whenever you like — it only asks the sources your library uses."
							icon={<SparkleIcon size={28} />}
							title="No new chapters"
						/>
					)}
				</DialogBody>

				<DialogFooter>
					<Button
						disabled={clearing || running || updates.length === 0}
						onClick={onClear}
						size="sm"
						variant="ghost"
					>
						<CheckCircleIcon />
						Mark all seen
					</Button>
					<Button disabled={running} onClick={onCheck} size="sm">
						<ArrowClockwiseIcon
							className={running ? "animate-spin" : undefined}
						/>
						{running
							? "Checking…"
							: updates.length > 0
								? "Check again"
								: "Check for updates"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Series already checked, newest first. Only the head is live, so everything
 * behind it recedes rather than competing with the bar above.
 */
function RefreshLog({ log }: { log: RefreshLogEntry[] }) {
	if (log.length === 0) return null;

	return (
		<ul className="min-w-0 space-y-1">
			{[...log].reverse().map((entry, i) => {
				const inProgress = i === 0;
				return (
					<li
						className="flex items-center gap-2 text-xs"
						key={`${entry.done}-${entry.title}`}
					>
						{inProgress ? (
							<ArrowClockwiseIcon
								className="shrink-0 animate-spin text-muted-foreground"
								size={14}
							/>
						) : (
							<CheckCircleIcon
								className="shrink-0 text-primary"
								size={14}
								weight="fill"
							/>
						)}
						<span
							className={
								inProgress
									? "min-w-0 flex-1 truncate"
									: "min-w-0 flex-1 truncate text-muted-foreground"
							}
						>
							{entry.title}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * Grouped by the day the chapters were found, with the same headings the
 * history page uses — a backlog from last week reads differently from what
 * tonight's check turned up.
 */
function UpdateList({
	updates,
	onNavigate,
}: {
	updates: LibraryUpdate[];
	onNavigate: () => void;
}) {
	const groups = new Map<string, { heading: string; items: LibraryUpdate[] }>();
	for (const update of updates) {
		const { key, heading } = historyBucket(update.found_at);
		const group = groups.get(key);
		if (group) group.items.push(update);
		else groups.set(key, { heading, items: [update] });
	}

	return (
		<div className="space-y-4">
			{[...groups.entries()].map(([key, group]) => (
				<section key={key}>
					<h3 className="mb-1 font-medium text-muted-foreground text-xs">
						{group.heading}
					</h3>
					<ul className="min-w-0 space-y-1">
						{group.items.map((update) => (
							<li key={`${update.source_id}/${update.manga_id}`}>
								<Link
									className="group flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-muted"
									onClick={onNavigate}
									params={{
										sourceId: update.source_id,
										mangaId: update.manga_id,
									}}
									to="/manga/$sourceId/$mangaId"
								>
									<CoverImage
										className="h-14 w-10 shrink-0 rounded-sm object-cover"
										iconSize={14}
										sourceId={update.source_id}
										url={update.cover_url}
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">
											{update.title}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{update.latest_chapter_title ||
												`Chapter ${update.latest_number}`}
										</p>
									</div>
									<Badge className="shrink-0">
										<span className="tabular-nums">{update.new_count}</span>
										new
									</Badge>
									<CaretRightIcon
										className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
										size={14}
									/>
								</Link>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
