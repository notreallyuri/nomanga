import { CaretDownIcon, ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useDeleteDownload,
	useDownloads,
} from "@/hooks/services/use-downloads";
import { cn } from "@/lib/utils";
import type { DownloadedManga } from "@/types/bindings";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${Math.round(bytes)} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function DownloadsSection() {
	const downloads = useDownloads();

	if (downloads.isPending) {
		return (
			<div className="space-y-3">
				{["a", "b", "c"].map((k) => (
					<Skeleton className="h-14" key={k} />
				))}
			</div>
		);
	}

	if (downloads.error) {
		return (
			<p className="text-destructive text-sm">{downloads.error.message}</p>
		);
	}

	if (downloads.data.length === 0) {
		return (
			<p className="py-10 text-center text-muted-foreground text-sm">
				No downloads yet. Download a chapter from a series to read it offline.
			</p>
		);
	}

	const totalBytes = downloads.data.reduce(
		(sum, m) => sum + (m.total_bytes ?? 0),
		0,
	);
	const totalChapters = downloads.data.reduce(
		(sum, m) => sum + m.chapters.length,
		0,
	);

	return (
		<div>
			<p className="mb-2 text-muted-foreground text-sm">
				{totalChapters} chapter{totalChapters === 1 ? "" : "s"} across{" "}
				{downloads.data.length} series · {formatBytes(totalBytes)}
			</p>

			<div className="divide-y divide-border">
				{downloads.data.map((manga) => (
					<MangaDownloads
						key={`${manga.source_id} ${manga.manga_id}`}
						manga={manga}
					/>
				))}
			</div>
		</div>
	);
}

function MangaDownloads({ manga }: { manga: DownloadedManga }) {
	const [expanded, setExpanded] = useState(false);
	const remove = useDeleteDownload();

	const removeAll = () => {
		for (const chapter of manga.chapters) {
			remove.mutate({
				sourceId: manga.source_id,
				mangaId: manga.manga_id,
				chapterId: chapter.chapter_id,
			});
		}
	};

	return (
		<div className="py-3">
			<div className="flex items-center gap-3">
				<button
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
					onClick={() => setExpanded((v) => !v)}
					type="button"
				>
					<CaretDownIcon
						className={cn(
							"shrink-0 text-muted-foreground transition-transform",
							!expanded && "-rotate-90",
						)}
						size={14}
					/>

					<Cover title={manga.title} url={manga.cover_url} />

					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{manga.title}</p>
						<p className="text-muted-foreground text-xs">
							{manga.chapters.length} chapter
							{manga.chapters.length === 1 ? "" : "s"} ·{" "}
							{formatBytes(manga.total_bytes ?? 0)}
						</p>
					</div>
				</button>

				<Button
					aria-label="Delete all downloads for this series"
					onClick={removeAll}
					size="icon"
					variant="ghost"
				>
					<TrashIcon className="text-destructive" />
				</Button>
			</div>

			{expanded && (
				<div className="mt-2 ml-6 space-y-0.5 border-border border-l pl-4">
					{manga.chapters.map((chapter) => (
						<div
							className="flex items-center gap-2 py-1 text-sm"
							key={chapter.chapter_id}
						>
							<span className="min-w-0 flex-1 truncate">{chapter.title}</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{chapter.page_count}p · {formatBytes(chapter.total_bytes ?? 0)}
							</span>
							<Button
								aria-label="Delete download"
								className="size-7"
								onClick={() =>
									remove.mutate({
										sourceId: manga.source_id,
										mangaId: manga.manga_id,
										chapterId: chapter.chapter_id,
									})
								}
								size="icon"
								variant="ghost"
							>
								<TrashIcon className="text-muted-foreground" size={14} />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function Cover({ url, title }: { url: string; title: string }) {
	const [failed, setFailed] = useState(false);

	if (!url || failed) {
		return (
			<div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-muted">
				<ImageIcon className="text-muted-foreground" size={16} />
			</div>
		);
	}

	return (
		<img
			alt={title}
			className="h-12 w-9 shrink-0 rounded object-cover"
			onError={() => setFailed(true)}
			src={url}
		/>
	);
}
