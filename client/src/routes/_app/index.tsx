import {
	ArrowClockwiseIcon,
	BooksIcon,
	CompassIcon,
	PlayIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CoverImage } from "@/components/manga/cover-image";
import { coverVariants, MangaCard } from "@/components/manga/manga-card";
import { MangaRow } from "@/components/manga/manga-grid";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useContinueReading } from "@/hooks/services/use-history";
import {
	ALL_CATEGORIES,
	useLibrary,
	useLibraryRefresh,
	useLibraryUpdates,
} from "@/hooks/services/use-library";
import { useAppearance } from "@/hooks/services/use-settings";
import type { ContinueReadingItem, LibraryUpdate } from "@/types/bindings";

export const Route = createFileRoute("/_app/")({
	component: HomePage,
});

const RECENT_LIMIT = 18;

function HomePage() {
	const continueReading = useContinueReading(15);
	const updates = useLibraryUpdates();
	const library = useLibrary(ALL_CATEGORIES);
	const refresh = useLibraryRefresh();

	const recent = (library.data ?? []).slice(0, RECENT_LIMIT);

	const nothingYet =
		library.isSuccess &&
		library.data.length === 0 &&
		(continueReading.data?.length ?? 0) === 0;

	if (nothingYet) return <EmptyHome />;

	const loading =
		continueReading.isPending && updates.isPending && library.isPending;

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-6xl space-y-8 px-6 py-6">
				<div className="flex items-center justify-between gap-4">
					<h1 className="font-heading font-semibold text-2xl">Home</h1>
					<Button
						disabled={refresh.isRefreshing}
						onClick={() => refresh.refresh({ type: "All" })}
						size="sm"
						variant="ghost"
					>
						<ArrowClockwiseIcon
							className={refresh.isRefreshing ? "animate-spin" : undefined}
						/>
						{refresh.isRefreshing ? "Checking…" : "Check for updates"}
					</Button>
				</div>

				{refresh.progress && (
					<div className="space-y-1.5">
						<Progress value={refresh.percent} />
						<p className="text-muted-foreground text-xs">
							{refresh.percent}% ·{" "}
							{refresh.progress.current_title || "Finishing…"} (
							{refresh.progress.done}/{refresh.progress.total})
						</p>
					</div>
				)}

				{loading && <RowSkeleton />}

				{(continueReading.data?.length ?? 0) > 0 && (
					<Section title="Continue reading">
						<MangaRow>
							{continueReading.data?.map((item) => (
								<ResumeCard
									item={item}
									key={`${item.source_id}/${item.manga_id}`}
								/>
							))}
						</MangaRow>
					</Section>
				)}

				<Section
					title="Updates"
					action={
						updates.data && updates.data.length === 0 ? undefined : (
							<Link
								className="text-muted-foreground text-sm hover:text-foreground"
								to="/library"
							>
								Library →
							</Link>
						)
					}
				>
					{updates.data && updates.data.length > 0 ? (
						<MangaRow>
							{updates.data.map((update) => (
								<UpdateCard
									key={`${update.source_id}/${update.manga_id}`}
									update={update}
								/>
							))}
						</MangaRow>
					) : (
						<p className="text-muted-foreground text-sm">
							No new chapters. Check for updates to look again.
						</p>
					)}
				</Section>

				{recent.length > 0 && (
					<Section title="Recently added">
						<MangaRow>
							{recent.map((item) => (
								<div
									className="w-32 shrink-0"
									key={`${item.source_id}/${item.manga_id}`}
								>
									<MangaCard
										coverUrl={item.cover_url}
										mangaId={item.manga_id}
										sourceId={item.source_id}
										title={item.title}
									/>
								</div>
							))}
						</MangaRow>
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between gap-4">
				<h2 className="font-heading text-lg">{title}</h2>
				{action}
			</div>
			{children}
		</section>
	);
}

function ResumeCard({ item }: { item: ContinueReadingItem }) {
	const appearance = useAppearance();

	return (
		<Link
			className="group block w-32 shrink-0"
			params={{
				sourceId: item.source_id,
				mangaId: item.manga_id,
				chapterId: item.last_chapter_id,
			}}
			to="/read/$sourceId/$mangaId/$chapterId"
		>
			<div className={coverVariants({ coverStyle: appearance.cover_style })}>
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
			<p className="mt-1.5 line-clamp-2 text-sm leading-tight">{item.title}</p>
		</Link>
	);
}

function UpdateCard({ update }: { update: LibraryUpdate }) {
	return (
		<div className="w-32 shrink-0">
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

function RowSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-5 w-40" />
			<div className="flex gap-4">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton className="aspect-2/3 w-32 shrink-0" key={i} />
				))}
			</div>
		</div>
	);
}

function EmptyHome() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
			<BooksIcon className="text-muted-foreground" size={44} />
			<div>
				<p className="font-medium text-lg">Welcome to nomanga</p>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">
					Add series from Browse to build your library — your reading, updates,
					and recent additions show up here.
				</p>
			</div>
			<Button render={<Link to="/browse" />}>
				<CompassIcon />
				Browse sources
			</Button>
		</div>
	);
}
