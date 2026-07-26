import {
	ArrowLeftIcon,
	CaretLeftIcon,
	CaretRightIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PagedReader } from "@/components/reader/paged-reader";
import { ReaderOverrideDialog } from "@/components/reader/reader-override-dialog";
import { StripReader } from "@/components/reader/strip-reader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChapterPages } from "@/hooks/services/use-downloads";
import {
	useFinishChapter,
	useProgress,
	useUpdateProgress,
} from "@/hooks/services/use-history";
import { useEffectiveReader } from "@/hooks/services/use-settings";
import {
	useSourceChapters,
	useSourceManga,
} from "@/hooks/services/use-sources";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/read/$sourceId/$mangaId/$chapterId")({
	component: Reader,
});

function Reader() {
	const { sourceId, mangaId, chapterId } = Route.useParams();
	const navigate = useNavigate();

	const pages = useChapterPages(sourceId, mangaId, chapterId);
	const chapters = useSourceChapters(sourceId, mangaId);
	const manga = useSourceManga(sourceId, mangaId);
	const progress = useProgress(sourceId, mangaId);
	const effective = useEffectiveReader(sourceId, mangaId);

	const [index, setIndex] = useState(0);
	const [chromeVisible, setChromeVisible] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);

	const reader = effective.data;
	const layout = reader?.page_layout ?? "SinglePage";
	const rtl = reader?.reading_direction === "RightToLeft";

	const list = chapters.data ?? [];
	const position = list.findIndex((c) => c.id === chapterId);
	const nextChapter = position > 0 ? list[position - 1] : undefined;
	const prevChapter =
		position >= 0 && position < list.length - 1
			? list[position + 1]
			: undefined;

	const total = pages.data?.length ?? 0;

	// The page to resume at when entering this chapter: the saved page if this is
	// the chapter we left off on and it wasn't finished, otherwise the top.
	const resumeIndex = useMemo(() => {
		const saved = progress.data;
		if (
			saved &&
			saved.last_chapter_id === chapterId &&
			!saved.last_chapter_done &&
			total > 0
		) {
			return Math.min(saved.last_page, total - 1);
		}
		return 0;
	}, [progress.data, chapterId, total]);

	// Apply the resume position once per chapter entry (paged reader). Runs after
	// pages + progress load so it doesn't fight live progress updates.
	const restoredFor = useRef<string | null>(null);

	useEffect(() => {
		restoredFor.current = null;
		setIndex(0);
	}, [chapterId]);

	useEffect(() => {
		if (
			restoredFor.current === chapterId ||
			total === 0 ||
			progress.isPending
		) {
			return;
		}
		restoredFor.current = chapterId;
		if (resumeIndex > 0) setIndex(resumeIndex);
	}, [chapterId, total, progress.isPending, resumeIndex]);

	const markChapterFinished = useReportProgress({
		sourceId,
		mangaId,
		chapterId,
		index,
		total,
	});

	const goToChapter = useCallback(
		(id: string) => {
			// Replace so paging through chapters keeps a single reader entry in
			// history — exiting returns to the manga page, not the previous chapter.
			navigate({
				to: "/read/$sourceId/$mangaId/$chapterId",
				params: { sourceId, mangaId, chapterId: id },
				replace: true,
			});
		},
		[navigate, sourceId, mangaId],
	);

	// Moving on to the next chapter counts the current one as read, even if its
	// exact last page was never the active index (common in vertical scroll).
	const goToNextChapter = useCallback(() => {
		if (!nextChapter) return;
		markChapterFinished(chapterId, Math.max(index, total - 1));
		goToChapter(nextChapter.id);
	}, [nextChapter, chapterId, index, total, markChapterFinished, goToChapter]);

	const exit = useCallback(() => {
		// Hierarchical return to the manga page (not history.back), replacing the
		// reader entry so the browser back button doesn't land back in the reader.
		navigate({
			to: "/manga/$sourceId/$mangaId",
			params: { sourceId, mangaId },
			replace: true,
		});
	}, [navigate, sourceId, mangaId]);

	const advance = useCallback(() => {
		if (index < total - 1) {
			setIndex((i) => i + 1);
		} else if (nextChapter) {
			goToNextChapter();
		}
	}, [index, total, nextChapter, goToNextChapter]);

	const retreat = useCallback(() => {
		if (index > 0) {
			setIndex((i) => i - 1);
		} else if (prevChapter) {
			goToChapter(prevChapter.id);
		}
	}, [index, prevChapter, goToChapter]);

	useReaderKeys({
		advance,
		retreat,
		exit,
		rtl,
		enabled: layout !== "VerticalScroll",
	});

	if (pages.isPending || effective.isPending) {
		return (
			<div className="flex h-full items-center justify-center bg-black">
				<Skeleton className="h-[80vh] w-[min(60rem,90vw)]" />
			</div>
		);
	}

	if (pages.error) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-white">
				<p className="max-w-md text-center text-sm">{pages.error.message}</p>
				<Button onClick={exit} variant="secondary">
					<ArrowLeftIcon />
					Back to chapters
				</Button>
			</div>
		);
	}

	const chapter = list[position];

	return (
		<div className="relative h-full overflow-hidden bg-black">
			{layout === "VerticalScroll" ? (
				// Wait for progress so the initial scroll position is the resume page.
				progress.isPending ? null : (
					<StripReader
						initialIndex={resumeIndex}
						onIndexChange={setIndex}
						onToggleChrome={() => setChromeVisible((v) => !v)}
						pages={pages.data}
						zoom={reader?.zoom_behavior ?? "FitWidth"}
						zoomLevel={reader?.zoom_level ?? undefined}
					/>
				)
			) : (
				<PagedReader
					double={layout === "DoublePage"}
					index={index}
					onAdvance={advance}
					onRetreat={retreat}
					onSeek={setIndex}
					onToggleChrome={() => setChromeVisible((v) => !v)}
					pages={pages.data}
					rtl={rtl}
					zoom={reader?.zoom_behavior ?? "FitWidth"}
					zoomLevel={reader?.zoom_level ?? undefined}
				/>
			)}

			<Chrome
				chapterTitle={chapter?.title ?? ""}
				index={index}
				mangaTitle={manga.data?.title ?? ""}
				nextChapter={nextChapter?.id}
				onExit={exit}
				onGoToChapter={goToChapter}
				onGoToNextChapter={goToNextChapter}
				onOpenSettings={() => setSettingsOpen(true)}
				prevChapter={prevChapter?.id}
				total={total}
				visible={chromeVisible}
			/>

			<ReaderOverrideDialog
				mangaId={mangaId}
				onOpenChange={setSettingsOpen}
				open={settingsOpen}
				sourceId={sourceId}
			/>
		</div>
	);
}

function Chrome({
	visible,
	mangaTitle,
	chapterTitle,
	index,
	total,
	onExit,
	onGoToChapter,
	onGoToNextChapter,
	onOpenSettings,
	nextChapter,
	prevChapter,
}: {
	visible: boolean;
	mangaTitle: string;
	chapterTitle: string;
	index: number;
	total: number;
	onExit: () => void;
	onGoToChapter: (id: string) => void;
	onGoToNextChapter: () => void;
	onOpenSettings: () => void;
	nextChapter?: string;
	prevChapter?: string;
}) {
	return (
		<>
			<header
				className={cn(
					"absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-linear-to-b from-black/90 to-transparent p-4 transition-transform duration-200",
					!visible && "-translate-y-full",
				)}
			>
				<Button onClick={onExit} size="icon" variant="ghost">
					<ArrowLeftIcon className="text-white" />
				</Button>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm text-white">
						{mangaTitle}
					</p>
					<p className="truncate text-white/70 text-xs">{chapterTitle}</p>
				</div>
				<Button onClick={onOpenSettings} size="icon" variant="ghost">
					<SlidersHorizontalIcon className="text-white" />
				</Button>
			</header>

			<footer
				className={cn(
					"absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-linear-to-t from-black/90 to-transparent p-4 transition-transform duration-200",
					!visible && "translate-y-full",
				)}
			>
				<Button
					disabled={!prevChapter}
					onClick={() => prevChapter && onGoToChapter(prevChapter)}
					size="icon"
					variant="ghost"
				>
					<CaretLeftIcon className="text-white" />
				</Button>

				<div className="flex-1 text-center text-sm text-white tabular-nums">
					{total > 0 ? `${index + 1} / ${total}` : "—"}
				</div>

				<Button
					disabled={!nextChapter}
					onClick={onGoToNextChapter}
					size="icon"
					variant="ghost"
				>
					<CaretRightIcon className="text-white" />
				</Button>
			</footer>
		</>
	);
}

function useReportProgress({
	sourceId,
	mangaId,
	chapterId,
	index,
	total,
}: {
	sourceId: string;
	mangaId: string;
	chapterId: string;
	index: number;
	total: number;
}) {
	const { mutate: updateProgress } = useUpdateProgress(sourceId, mangaId);
	const { mutate: finishChapter } = useFinishChapter(sourceId, mangaId);

	const finished = useRef<string | null>(null);

	useEffect(() => {
		if (total === 0) return;

		const isLast = index >= total - 1;

		if (isLast && finished.current !== chapterId) {
			finished.current = chapterId;
			finishChapter({ chapterId, lastPage: index });
			return;
		}

		const timer = setTimeout(() => {
			updateProgress({ chapterId, page: index, chapterDone: false });
		}, 800);

		return () => clearTimeout(timer);
	}, [sourceId, mangaId, chapterId, index, total]);

	// Marks a chapter finished explicitly — used when the reader jumps forward to
	// the next chapter, which may happen (footer button, strip mode) before the
	// last page is ever the current index. Idempotent with the auto-finish above.
	return useCallback(
		(id: string, lastPage: number) => {
			finished.current = id;
			finishChapter({ chapterId: id, lastPage });
		},
		[finishChapter],
	);
}

function useReaderKeys({
	advance,
	retreat,
	exit,
	rtl,
	enabled,
}: {
	advance: () => void;
	retreat: () => void;
	exit: () => void;
	rtl: boolean;
	enabled: boolean;
}) {
	useEffect(() => {
		if (!enabled) return;

		const onKey = (e: KeyboardEvent) => {
			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					rtl ? retreat() : advance();
					break;
				case "ArrowLeft":
					e.preventDefault();
					rtl ? advance() : retreat();
					break;
				case " ":
				case "PageDown":
					e.preventDefault();
					advance();
					break;
				case "PageUp":
					e.preventDefault();
					retreat();
					break;
				case "Escape":
					exit();
					break;
			}
		};

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [advance, retreat, exit, rtl, enabled]);
}
