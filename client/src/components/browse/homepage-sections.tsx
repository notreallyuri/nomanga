import {
	ArrowRightIcon,
	BookmarkSimpleIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CheckIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useIsInLibrary, useToggleLibrary } from "@/hooks/services/use-library";
import { useAppearance } from "@/hooks/services/use-settings";
import { useSourceHomepage } from "@/hooks/services/use-sources";
import { cn } from "@/lib/utils";
import type {
	HomepageSection,
	MangaSimple,
	SectionLayout,
} from "@/types/bindings";
import { MangaCard } from "../manga/manga-card";
import { Button } from "../ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../ui/context-menu";
import { Skeleton } from "../ui/skeleton";

export function HomepageSections({ sourceId }: { sourceId: string }) {
	const { data, isPending, error } = useSourceHomepage(sourceId);
	const appearance = useAppearance();

	const spacing = appearance.compact_mode ? "space-y-6" : "space-y-10";

	if (isPending) return <HomepageSkeleton compact={appearance.compact_mode} />;
	if (error) return <p className="text-destructive">{error.message}</p>;

	const sections = data.sections.filter((s) => s.items.length > 0);

	if (sections.length === 0) {
		return (
			<p className="py-16 text-center text-muted-foreground text-sm">
				This source has nothing to show right now.
			</p>
		);
	}

	return (
		<div className={spacing}>
			{sections.map((section) => (
				<Section key={section.id} section={section} sourceId={sourceId} />
			))}
		</div>
	);
}

interface LayoutConfig {
	width: string;
	compactWidth: string;
	rows: number;
	rowsClass: string;
	denseTitle: boolean;
}

const LAYOUT_CONFIG: Record<SectionLayout, LayoutConfig> = {
	FeaturedRow: {
		width: "w-56",
		compactWidth: "w-44",
		rows: 1,
		rowsClass: "grid-rows-1",
		denseTitle: false,
	},
	SingleRow: {
		width: "w-36",
		compactWidth: "w-28",
		rows: 1,
		rowsClass: "grid-rows-1",
		denseTitle: false,
	},
	DoubleRow: {
		width: "w-28",
		compactWidth: "w-24",
		rows: 2,
		rowsClass: "grid-rows-2",
		denseTitle: true,
	},
	TripleRow: {
		width: "w-24",
		compactWidth: "w-20",
		rows: 3,
		rowsClass: "grid-rows-3",
		denseTitle: true,
	},
};

function Section({
	section,
	sourceId,
}: {
	section: HomepageSection;
	sourceId: string;
}) {
	const config = LAYOUT_CONFIG[section.layout];
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
					{section.title}
				</h2>

				{section.paginable && (
					<Button
						render={
							<Link
								params={{ sourceId }}
								search={{ section: section.id }}
								to="/browse/$sourceId"
							/>
						}
						size="sm"
						variant="ghost"
					>
						View more
						<ArrowRightIcon />
					</Button>
				)}
			</div>

			<ScrollRow
				contentClassName={cn(
					compact ? "gap-x-3 gap-y-2" : "gap-x-4 gap-y-3",
					config.rowsClass,
				)}
			>
				{section.items.map((item) => (
					<div
						className={cn(
							"shrink-0 snap-start",
							compact ? config.compactWidth : config.width,
						)}
						key={item.id}
					>
						<SectionCard
							compactTitle={config.denseTitle || compact}
							item={item}
							sourceId={sourceId}
						/>
					</div>
				))}
			</ScrollRow>
		</section>
	);
}

function ScrollRow({
	children,
	contentClassName,
}: {
	children: ReactNode;
	contentClassName?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ left: false, right: false });

	const update = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		const { scrollLeft, scrollWidth, clientWidth } = el;
		setEdges({
			left: scrollLeft > 4,
			right: scrollLeft + clientWidth < scrollWidth - 4,
		});
	}, []);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, [update]);

	const page = (dir: 1 | -1) => {
		const el = ref.current;
		if (el)
			el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
	};

	return (
		<div className="group/row relative min-w-0">
			<EdgeFade shown={edges.left} side="left" />
			<EdgeFade shown={edges.right} side="right" />
			<ScrollArrow onClick={() => page(-1)} shown={edges.left} side="left" />
			<ScrollArrow onClick={() => page(1)} shown={edges.right} side="right" />

			<div
				className={cn(
					"scrollbar-none grid snap-x snap-proximity grid-flow-col overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden",
					contentClassName,
				)}
				onScroll={update}
				ref={ref}
			>
				{children}
			</div>
		</div>
	);
}

function EdgeFade({ side, shown }: { side: "left" | "right"; shown: boolean }) {
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute inset-y-0 z-10 w-10 pb-2 transition-opacity duration-200",
				side === "left"
					? "left-0 bg-linear-to-r from-background to-transparent"
					: "right-0 bg-linear-to-l from-background to-transparent",
				shown ? "opacity-100" : "opacity-0",
			)}
		/>
	);
}

function ScrollArrow({
	side,
	shown,
	onClick,
}: {
	side: "left" | "right";
	shown: boolean;
	onClick: () => void;
}) {
	return (
		<button
			aria-hidden
			className={cn(
				"absolute top-1/2 z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur transition-opacity duration-200 hover:bg-background md:flex",
				side === "left" ? "left-1" : "right-1",
				shown
					? "opacity-0 group-hover/row:opacity-100"
					: "pointer-events-none opacity-0",
			)}
			onClick={onClick}
			tabIndex={-1}
			type="button"
		>
			{side === "left" ? <CaretLeftIcon /> : <CaretRightIcon />}
		</button>
	);
}

function SectionCard({
	sourceId,
	item,
	compactTitle,
}: {
	sourceId: string;
	item: MangaSimple;
	compactTitle: boolean;
}) {
	const inLibrary = useIsInLibrary(sourceId, item.id);
	const { add, remove } = useToggleLibrary(sourceId, item.id, item);

	const saved = inLibrary.data ?? false;

	const toggle = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (saved) remove.mutate(undefined);
		else add.mutate(undefined, { onError: (err) => toast.error(err.message) });
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<div className="group/card relative">
					<MangaCard
						compactTitle={compactTitle}
						coverUrl={item.cover_url}
						mangaId={item.id}
						sourceId={sourceId}
						title={item.title}
					/>

					<button
						aria-label={saved ? "Remove from library" : "Add to library"}
						className={cn(
							"absolute top-1.5 right-1.5 z-10 flex size-7 items-center justify-center rounded-full shadow-sm backdrop-blur transition-all focus-visible:opacity-100 focus-visible:outline-none",
							saved
								? "bg-primary text-primary-foreground opacity-100"
								: "bg-background/80 text-foreground opacity-0 hover:bg-background group-hover/card:opacity-100",
						)}
						onClick={toggle}
						type="button"
					>
						{saved ? (
							<CheckIcon size={14} weight="bold" />
						) : (
							<PlusIcon size={14} weight="bold" />
						)}
					</button>
				</div>
			</ContextMenuTrigger>

			<ContextMenuContent>
				{saved ? (
					<ContextMenuItem onClick={() => remove.mutate(undefined)}>
						<CheckIcon />
						In library
					</ContextMenuItem>
				) : (
					<ContextMenuItem
						onClick={() =>
							add.mutate(undefined, { onError: (e) => toast.error(e.message) })
						}
					>
						<BookmarkSimpleIcon />
						Add to library
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}

function HomepageSkeleton({ compact }: { compact: boolean }) {
	// A representative mix of layouts so the placeholder reads like the real
	// homepage before the sections (and their true layouts) arrive.
	const layouts: SectionLayout[] = ["FeaturedRow", "SingleRow", "DoubleRow"];

	return (
		<div className={compact ? "space-y-6" : "space-y-10"}>
			{layouts.map((layout) => (
				<SectionSkeleton compact={compact} key={layout} layout={layout} />
			))}
		</div>
	);
}

function SectionSkeleton({
	layout,
	compact,
}: {
	layout: SectionLayout;
	compact: boolean;
}) {
	const config = LAYOUT_CONFIG[layout];
	const width = compact ? config.compactWidth : config.width;
	// Enough cards to overflow a typical viewport for every layout width.
	const count = config.rows * 10;

	return (
		<section className="min-w-0">
			<Skeleton className={cn("h-6 w-40", compact ? "mb-2" : "mb-3")} />
			<div
				className={cn(
					"grid grid-flow-col overflow-hidden pb-2",
					compact ? "gap-x-3 gap-y-2" : "gap-x-4 gap-y-3",
					config.rowsClass,
				)}
			>
				{Array.from({ length: count }, (_, i) => (
					<div className={cn("shrink-0", width)} key={i}>
						<Skeleton className="aspect-2/3 w-full" />
					</div>
				))}
			</div>
		</section>
	);
}
