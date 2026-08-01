import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useAppearance } from "@/hooks/services/use-settings";
import { useSourceHomepage } from "@/hooks/services/use-sources";
import { cn } from "@/lib/utils";
import type { HomepageSection, SectionLayout } from "@/types/bindings";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { BrowseCard } from "./browse-card";
import { ScrollRow } from "./scroll-row";

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
						<BrowseCard
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
