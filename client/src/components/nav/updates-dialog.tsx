import {
	ArrowClockwiseIcon,
	CheckCircleIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { LibraryRefreshProgress, LibraryUpdate } from "@/types/bindings";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Progress } from "../ui/progress";

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
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Library updates</DialogTitle>
					<DialogDescription>
						{running
							? "Checking your library for new chapters."
							: updates.length > 0
								? `${updates.length} series with new chapters.`
								: "Everything is up to date."}
					</DialogDescription>
				</DialogHeader>

				{running ? (
					<div className="min-w-0 space-y-3">
						<div className="space-y-1.5">
							<div className="flex items-center justify-between text-xs">
								<span className="min-w-0 flex-1 truncate text-muted-foreground">
									{progress?.current_title || "Finishing…"}
								</span>
								<span className="shrink-0 tabular-nums">
									{progress ? `${progress.done}/${progress.total}` : ""} ·{" "}
									{percent}%
								</span>
							</div>
							<Progress value={percent} />
						</div>

						{log.length > 0 && (
							<ul className="no-scrollbar max-h-56 min-w-0 space-y-1 overflow-y-auto">
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
											<span className="min-w-0 flex-1 truncate">
												{entry.title}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				) : updates.length > 0 ? (
					<ul className="no-scrollbar max-h-80 min-w-0 space-y-1 overflow-y-auto">
						{updates.map((update) => (
							<li key={`${update.source_id}/${update.manga_id}`}>
								<Link
									className="flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-muted"
									onClick={() => onOpenChange(false)}
									params={{
										sourceId: update.source_id,
										mangaId: update.manga_id,
									}}
									to="/manga/$sourceId/$mangaId"
								>
									<img
										alt=""
										className="h-14 w-10 shrink-0 rounded-sm object-cover"
										loading="lazy"
										src={update.cover_url}
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
									<span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground text-xs tabular-nums">
										{update.new_count} new
									</span>
								</Link>
							</li>
						))}
					</ul>
				) : (
					<div className="flex flex-col items-center gap-2 py-6 text-center">
						<SparkleIcon className="text-muted-foreground" size={28} />
						<p className="text-muted-foreground text-sm">
							No new chapters found. Check again to look for updates.
						</p>
					</div>
				)}

				<div className="flex justify-end gap-2">
					{!running && updates.length > 0 && (
						<Button
							disabled={clearing}
							onClick={onClear}
							size="sm"
							variant="ghost"
						>
							<CheckCircleIcon />
							Clear
						</Button>
					)}
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
				</div>
			</DialogContent>
		</Dialog>
	);
}
