import {
	CheckCircleIcon,
	CircleNotchIcon,
	DownloadSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	useDeleteDownload,
	useDownloadItem,
	useQueueDownloads,
} from "@/hooks/services/use-downloads";
import type { Chapter } from "@/types/bindings";

export function DownloadCell({
	sourceId,
	mangaId,
	mangaTitle,
	chapter,
	downloaded,
}: {
	sourceId: string;
	mangaId: string;
	mangaTitle: string;
	chapter: Chapter;
	downloaded: boolean;
}) {
	const item = useDownloadItem(sourceId, mangaId, chapter.id);
	const queue = useQueueDownloads();
	const remove = useDeleteDownload();

	if (item && (item.state === "Queued" || item.state === "Downloading")) {
		const label =
			item.state === "Queued"
				? "Queued"
				: `Downloading ${item.done}/${item.total}`;
		return (
			<div className="flex justify-center" title={label}>
				<CircleNotchIcon
					className="animate-spin text-muted-foreground"
					size={16}
				/>
			</div>
		);
	}

	if (downloaded) {
		return (
			<Button
				aria-label="Delete download"
				className="group"
				onClick={() =>
					remove.mutate({ sourceId, mangaId, chapterId: chapter.id })
				}
				size="icon"
				variant="ghost"
			>
				<CheckCircleIcon
					className="text-primary group-hover:hidden"
					weight="fill"
				/>
				<TrashIcon className="hidden text-destructive group-hover:block" />
			</Button>
		);
	}

	const failed = item?.state === "Failed";

	return (
		<Button
			aria-label="Download chapter"
			onClick={() =>
				queue.mutate(
					{
						sourceId,
						mangaId,
						mangaTitle,
						targets: [{ chapter_id: chapter.id, title: chapter.title }],
					},
					{ onError: (e) => toast.error(e.message) },
				)
			}
			size="icon"
			title={failed ? (item?.error ?? "Download failed — retry") : "Download"}
			variant="ghost"
		>
			<DownloadSimpleIcon
				className={failed ? "text-destructive" : "text-muted-foreground"}
			/>
		</Button>
	);
}
