import {
	ArrowRightIcon,
	BookIcon,
	BookOpenIcon,
	BooksIcon,
	CompassIcon,
	PlayIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { ScrollRow } from "@/components/browse/scroll-row";
import { CoverImage } from "@/components/manga/cover-image";
import { coverVariants, MangaCard } from "@/components/manga/manga-card";
import { SourceIcon } from "@/components/source-icon";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourcesWithPreferences } from "@/hooks/services/use-extensions";
import { useContinueReading } from "@/hooks/services/use-history";
import {
	ALL_CATEGORIES,
	useLibrary,
	useLibraryUpdates,
} from "@/hooks/services/use-library";
import { useAppearance } from "@/hooks/services/use-settings";
import { sourceImageUrl } from "@/lib/source-image";
import { cn } from "@/lib/utils";
import type { ContinueReadingItem, LibraryUpdate } from "@/types/bindings";

export const Route = createFileRoute("/_app/")({
	component: HomePage,
});

const RECENT_LIMIT = 18;

function useCardWidth() {
	return useAppearance().compact_mode ? "w-28" : "w-36";
}

function HomePage() {
	const continueReading = useContinueReading(15);
	const updates = useLibraryUpdates();
	const library = useLibrary(ALL_CATEGORIES);
	const compact = useAppearance().compact_mode;

	const recent = (library.data ?? []).slice(0, RECENT_LIMIT);
	const resuming = continueReading.data ?? [];

	const nothingYet =
		library.isSuccess &&
		library.data.length === 0 &&
		(continueReading.data?.length ?? 0) === 0;

	if (nothingYet) return <EmptyHome />;

	const loading =
		continueReading.isPending && updates.isPending && library.isPending;

	const [lead, ...rest] = resuming;

	return (
		<div className="h-full overflow-y-auto">
			<div className={cn("px-6 py-6", compact ? "space-y-6" : "space-y-8")}>
				<h1 className="font-heading font-semibold text-2xl">Home</h1>

				{loading && <HomeSkeleton compact={compact} />}

				{lead && <ResumeHero item={lead} />}

				{rest.length > 0 && (
					<Section title="Continue reading">
						<Row compact={compact}>
							{rest.map((item) => (
								<ResumeCard
									item={item}
									key={`${item.source_id}/${item.manga_id}`}
								/>
							))}
						</Row>
					</Section>
				)}

				{!loading && (
					<Section
						action={
							updates.data && updates.data.length > 0 ? (
								<Button
									render={<Link to="/library" />}
									size="sm"
									variant="ghost"
								>
									Library
									<ArrowRightIcon />
								</Button>
							) : undefined
						}
						title="Updates"
					>
						{updates.data && updates.data.length > 0 ? (
							<Row compact={compact}>
								{updates.data.map((update) => (
									<UpdateCard
										key={`${update.source_id}/${update.manga_id}`}
										update={update}
									/>
								))}
							</Row>
						) : (
							<p className="text-muted-foreground text-sm">
								No new chapters. Updates you have not read yet show up here.
							</p>
						)}
					</Section>
				)}

				{recent.length > 0 && (
					<Section title="Recently added">
						<Row compact={compact}>
							{recent.map((item) => (
								<Card key={`${item.source_id}/${item.manga_id}`}>
									<MangaCard
										coverUrl={item.cover_url}
										mangaId={item.manga_id}
										sourceId={item.source_id}
										title={item.title}
									/>
								</Card>
							))}
						</Row>
					</Section>
				)}
			</div>
		</div>
	);
}

function Row({ children, compact }: { children: ReactNode; compact: boolean }) {
	return (
		<ScrollRow
			contentClassName={cn(
				"grid-rows-1 justify-start",
				compact ? "gap-x-3" : "gap-x-4",
			)}
		>
			{children}
		</ScrollRow>
	);
}

function Card({ children }: { children: ReactNode }) {
	const width = useCardWidth();

	return <div className={cn("shrink-0 snap-start", width)}>{children}</div>;
}

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	const compact = useAppearance().compact_mode;

	return (
		<section className="min-w-0">
			<div
				className={cn(
					"flex items-baseline justify-between gap-4",
					compact ? "mb-2" : "mb-3",
				)}
			>
				<h2
					className={cn(
						"font-bold font-heading",
						compact ? "text-lg" : "text-xl",
					)}
				>
					{title}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
}

function ResumeMenu({
	item,
	trigger,
}: {
	item: ContinueReadingItem;
	trigger: ReactElement;
}) {
	const navigate = useNavigate();

	return (
		<ContextMenu>
			<ContextMenuTrigger render={trigger} />
			<ContextMenuContent>
				<ContextMenuItem
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
				</ContextMenuItem>
				<ContextMenuItem
					onClick={() =>
						navigate({
							params: { sourceId: item.source_id, mangaId: item.manga_id },
							to: "/manga/$sourceId/$mangaId",
						})
					}
				>
					<BookIcon />
					Go to Manga
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function resumeLabel(item: ContinueReadingItem) {
	const chapter = item.last_chapter_title || "this chapter";

	return item.last_chapter_done
		? `Finished ${chapter}`
		: `${chapter} · page ${item.last_page + 1}`;
}

function ResumeHero({ item }: { item: ContinueReadingItem }) {
	const appearance = useAppearance();
	const backdrop = sourceImageUrl(item.source_id, item.cover_url, {
		cache: true,
	});

	return (
		<section className="group relative isolate flex min-w-0 items-center gap-5 overflow-hidden rounded-xl border border-border bg-card p-4">
			{backdrop && (
				<>
					<img
						alt=""
						aria-hidden
						className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
						src={backdrop}
					/>
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-card via-card/80 to-card/40"
					/>
				</>
			)}
			<Link
				className={cn(
					"w-24 shrink-0 sm:w-28",
					coverVariants({ coverStyle: appearance.cover_style }),
				)}
				params={{ sourceId: item.source_id, mangaId: item.manga_id }}
				to="/manga/$sourceId/$mangaId"
			>
				<CoverImage
					className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
					sourceId={item.source_id}
					url={item.cover_url}
				/>
			</Link>

			<div className="min-w-0 flex-1">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{item.last_chapter_done ? "Up next" : "Continue reading"}
				</p>
				<p className="mt-1 truncate font-heading font-semibold text-xl">
					{item.title}
				</p>
				<p className="mt-1 truncate text-muted-foreground text-sm">
					{resumeLabel(item)}
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<Button
						render={
							<Link
								params={{
									sourceId: item.source_id,
									mangaId: item.manga_id,
									chapterId: item.last_chapter_id,
								}}
								to="/read/$sourceId/$mangaId/$chapterId"
							/>
						}
						size="sm"
					>
						<PlayIcon weight="fill" />
						Resume
					</Button>

					<Button
						render={
							<Link
								params={{
									sourceId: item.source_id,
									mangaId: item.manga_id,
								}}
								to="/manga/$sourceId/$mangaId"
							/>
						}
						size="sm"
						variant="outline"
					>
						<BookIcon />
						Go to Manga
					</Button>
				</div>
			</div>
		</section>
	);
}

function ResumeCard({ item }: { item: ContinueReadingItem }) {
	const appearance = useAppearance();
	const width = useCardWidth();

	return (
		<ResumeMenu
			item={item}
			trigger={
				<Link
					className={cn("group block shrink-0 snap-start", width)}
					params={{
						sourceId: item.source_id,
						mangaId: item.manga_id,
						chapterId: item.last_chapter_id,
					}}
					to="/read/$sourceId/$mangaId/$chapterId"
				>
					<div
						className={coverVariants({ coverStyle: appearance.cover_style })}
					>
						<CoverImage
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							sourceId={item.source_id}
							url={item.cover_url}
						/>
						<div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/85 to-transparent p-1.5 pt-4">
							<PlayIcon className="text-white" size={12} weight="fill" />
							<span className="text-white text-xs">Resume</span>
						</div>
					</div>
					{appearance.show_titles && (
						<p className="mt-1.5 line-clamp-2 text-sm leading-tight">
							{item.title}
						</p>
					)}
					<p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
						{resumeLabel(item)}
					</p>
				</Link>
			}
		/>
	);
}

function UpdateCard({ update }: { update: LibraryUpdate }) {
	const width = useCardWidth();

	return (
		<div className={cn("shrink-0 snap-start", width)}>
			<MangaCard
				badge={
					<span className="rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground text-xs tabular-nums shadow">
						{update.new_count} new
					</span>
				}
				coverUrl={update.cover_url}
				mangaId={update.manga_id}
				sourceId={update.source_id}
				title={update.title}
			/>
			<p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
				{update.latest_chapter_title || `Chapter ${update.latest_number}`}
			</p>
		</div>
	);
}

function HomeSkeleton({ compact }: { compact: boolean }) {
	const width = compact ? "w-28" : "w-36";

	return (
		<div className={compact ? "space-y-6" : "space-y-8"}>
			<Skeleton className="h-[8.5rem] w-full rounded-xl" />
			{["a", "b"].map((key) => (
				<div key={key}>
					<Skeleton className={cn("h-6 w-40", compact ? "mb-2" : "mb-3")} />
					<div
						className={cn(
							"grid grid-flow-col grid-rows-1 overflow-hidden pb-2",
							compact ? "gap-x-3" : "gap-x-4",
						)}
					>
						{Array.from({ length: 12 }, (_, i) => (
							<div className={cn("shrink-0", width)} key={i}>
								<Skeleton className="aspect-2/3 w-full" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function EmptyHome() {
	const { data: rows } = useSourcesWithPreferences();
	const sources = (rows ?? []).filter((row) => row.preference.enabled);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
			<BooksIcon className="text-muted-foreground" size={44} />

			<div>
				<p className="font-heading font-semibold text-lg">Welcome to nomanga</p>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">
					Add series from Browse to build your library — your reading, updates,
					and recent additions show up here.
				</p>
			</div>

			{sources.length > 0 ? (
				<div className="flex max-w-lg flex-wrap items-center justify-center gap-2">
					{sources.slice(0, 6).map(({ info }) => (
						<Link
							className="flex items-center gap-2 rounded-lg border border-border bg-card py-1.5 pr-3 pl-2 text-sm transition-colors hover:border-foreground/20 hover:bg-muted"
							key={info.id}
							params={{ sourceId: info.id }}
							to="/browse/$sourceId"
						>
							<SourceIcon
								className="size-5"
								iconSize={12}
								name={info.name}
								url={info.icon_url}
							/>
							{info.name}
						</Link>
					))}
				</div>
			) : (
				<Button render={<Link to="/browse" />}>
					<CompassIcon />
					Browse sources
				</Button>
			)}
		</div>
	);
}
