import {
	ArrowLeftIcon,
	BookOpenIcon,
	CaretDownIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { LibraryAction } from "@/components/library/library-action";
import { ChapterTable } from "@/components/manga/chapter-table";
import { ReaderOverrideDialog } from "@/components/reader/reader-override-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgress, useReadChapters } from "@/hooks/services/use-history";
import { useIsInLibrary } from "@/hooks/services/use-library";
import {
	useSourceChapters,
	useSourceManga,
} from "@/hooks/services/use-sources";
import { sourceImageUrl } from "@/lib/source-image";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/manga/$sourceId/$mangaId")({
	component: MangaDetails,
});

function useIsClamped<T extends HTMLElement>(dependency: unknown) {
	const ref = useRef<T>(null);
	const [clamped, setClamped] = useState(false);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		setClamped(el.scrollHeight > el.clientHeight);
	}, [dependency]);

	return { ref, clamped };
}

function MangaDetails() {
	const { sourceId, mangaId } = Route.useParams();
	const navigate = useNavigate();

	const manga = useSourceManga(sourceId, mangaId);
	const chapters = useSourceChapters(sourceId, mangaId);
	const readChapters = useReadChapters(sourceId, mangaId);
	const progress = useProgress(sourceId, mangaId);
	const inLibrary = useIsInLibrary(sourceId, mangaId);

	const [expanded, setExpanded] = useState(false);
	const [readerOpen, setReaderOpen] = useState(false);
	const { ref: descRef, clamped } = useIsClamped<HTMLParagraphElement>(
		manga.data?.description,
	);

	// Deterministic parent navigation rather than history.back(): a library entry
	// returns to the library, otherwise back to the source it was browsed from.
	// This stays correct however the page was reached (list, search, or reader).
	const goBack = () =>
		inLibrary.data
			? navigate({ to: "/library" })
			: navigate({ to: "/browse/$sourceId", params: { sourceId } });

	if (manga.isPending) return <DetailsSkeleton onBack={goBack} />;
	if (manga.error)
		return <p className="p-6 text-destructive">{manga.error.message}</p>;

	const list = chapters.data ?? [];
	const resumeId = progress.data?.last_chapter_id;
	const startChapter = resumeId
		? list.find((c) => c.id === resumeId)
		: list[list.length - 1];

	const readCount = readChapters.data?.size ?? 0;

	return (
		<div className="flex h-full flex-col overflow-hidden lg:flex-row">
			<aside className="min-h-0 shrink-0 overflow-y-auto border-border p-6 lg:w-96 lg:border-r xl:w-104">
				<Button
					className="mb-3 -ml-2"
					onClick={goBack}
					size="sm"
					variant="ghost"
				>
					<ArrowLeftIcon />
					{inLibrary.data ? "Library" : "Back"}
				</Button>

				<img
					alt={manga.data.title}
					className="mx-auto aspect-2/3 w-48 rounded-lg border border-border object-cover shadow-xl lg:w-full lg:max-w-none"
					src={sourceImageUrl(sourceId, manga.data.cover_url, { cache: true })}
				/>

				<h1 className="mt-4 text-balance font-bold font-heading text-2xl leading-tight">
					{manga.data.title}
				</h1>

				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
					<Badge variant="secondary">{manga.data.status}</Badge>
					{list.length > 0 && (
						<span>
							{readCount} / {list.length} read
						</span>
					)}
				</div>

				<div className="mt-4 flex flex-col gap-2">
					<Button
						className="w-full"
						disabled={!startChapter}
						onClick={() =>
							startChapter &&
							navigate({
								to: "/read/$sourceId/$mangaId/$chapterId",
								params: { sourceId, mangaId, chapterId: startChapter.id },
							})
						}
					>
						<BookOpenIcon />
						{resumeId ? "Continue reading" : "Start reading"}
					</Button>

					<LibraryAction
						chapterCount={list.length}
						manga={manga.data}
						mangaId={mangaId}
						sourceId={sourceId}
					/>

					<Button
						className="w-full"
						onClick={() => setReaderOpen(true)}
						variant="ghost"
					>
						<SlidersHorizontalIcon />
						Reader settings
					</Button>
				</div>

				<ReaderOverrideDialog
					mangaId={mangaId}
					onOpenChange={setReaderOpen}
					open={readerOpen}
					sourceId={sourceId}
				/>

				<div className="mt-5 space-y-2 text-sm">
					{manga.data.author.length > 0 && (
						<DetailField label="Author" value={manga.data.author.join(", ")} />
					)}
					{manga.data.artist.length > 0 && (
						<DetailField label="Artist" value={manga.data.artist.join(", ")} />
					)}
				</div>

				{manga.data.tags.length > 0 && (
					<div className="mt-4 flex flex-wrap gap-2">
						{manga.data.tags.map((tag) => (
							<Badge variant="secondary" key={tag.id}>
								{tag.label}
							</Badge>
						))}
					</div>
				)}

				{manga.data.description && (
					<div className="mt-5">
						<p
							className={cn(
								"whitespace-pre-line text-muted-foreground text-sm leading-relaxed",
								!expanded && "line-clamp-6",
							)}
							ref={descRef}
						>
							{manga.data.description}
						</p>

						{clamped && (
							<Button
								className="mt-1 h-auto p-0"
								onClick={() => setExpanded((v) => !v)}
								size="sm"
								variant="link"
							>
								{expanded ? "Show less" : "Show more"}
								<CaretDownIcon
									className={cn(
										"transition-transform",
										expanded && "rotate-180",
									)}
								/>
							</Button>
						)}
					</div>
				)}
			</aside>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col p-6">
				{chapters.isPending && <Skeleton className="h-full" />}
				{chapters.error && (
					<p className="text-destructive text-sm">{chapters.error.message}</p>
				)}

				{chapters.data && (
					<ChapterTable
						chapters={chapters.data}
						mangaId={mangaId}
						mangaTitle={manga.data?.title ?? ""}
						readChapters={readChapters.data ?? new Set()}
						resumeChapterId={resumeId}
						resumePage={
							progress.data?.last_chapter_done
								? undefined
								: progress.data?.last_page
						}
						sourceId={sourceId}
					/>
				)}
			</div>
		</div>
	);
}

function DetailField({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex gap-2">
			<span className="shrink-0 font-medium text-muted-foreground">
				{label}
			</span>
			<span className="min-w-0">{value}</span>
		</div>
	);
}

function DetailsSkeleton({ onBack }: { onBack: () => void }) {
	return (
		<div className="flex h-full flex-col gap-6 p-6">
			<Button
				className="-ml-2 self-start"
				onClick={onBack}
				size="sm"
				variant="ghost"
			>
				<ArrowLeftIcon />
				Back
			</Button>
			<div className="flex min-h-0 flex-1 gap-6">
				<div className="w-96 shrink-0 space-y-3">
					<Skeleton className="aspect-2/3 w-full" />
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-20 w-full" />
				</div>
				<Skeleton className="min-w-0 flex-1" />
			</div>
		</div>
	);
}
