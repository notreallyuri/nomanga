import type { ReactNode } from "react";
import { useAppearance } from "@/hooks/services/use-settings";
import { cn } from "@/lib/utils";
import type { CardSize } from "@/types/bindings";
import { Skeleton } from "../ui/skeleton";

// Two orthogonal axes: `card_size` sets the cover width, `compact_mode` sets the
// spacing between cards. `size` is library-scoped; without it the column width
// falls back to the compact-mode density.
const SIZE_WIDTHS: Record<CardSize, string> = {
	Small: "grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]",
	Medium: "grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
	Large: "grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]",
};

function gridClass(size: CardSize | undefined, dense: boolean): string {
	const width = size
		? SIZE_WIDTHS[size]
		: dense
			? SIZE_WIDTHS.Small
			: SIZE_WIDTHS.Medium;
	const gap = dense ? "gap-2.5" : "gap-4";
	return `${width} ${gap}`;
}

export function MangaGrid({
	children,
	compact,
	size,
}: {
	children: ReactNode;
	/** Forces density; defaults to the compact-mode setting. */
	compact?: boolean;
	/** Explicit card size; wins over `compact` when set (library grid). */
	size?: CardSize;
}) {
	const appearance = useAppearance();
	const dense = compact ?? appearance.compact_mode;

	return <div className={cn("grid", gridClass(size, dense))}>{children}</div>;
}

export function MangaGridSkeleton({
	count = 12,
	compact,
	size,
}: {
	count?: number;
	compact?: boolean;
	size?: CardSize;
}) {
	const appearance = useAppearance();
	const dense = compact ?? appearance.compact_mode;
	// A large grid still reads as compact for the title placeholder spacing.
	const tight = size ? size === "Small" : dense;

	return (
		<MangaGrid compact={dense} size={size}>
			{Array.from({ length: count }, (_, i) => (
				<div key={i}>
					<Skeleton className="aspect-2/3" />
					{/* Placeholder for the title line so the grid doesn't jump by a
					    row of text once the real cards arrive. */}
					{appearance.show_titles && (
						<Skeleton
							className={cn("h-3", tight ? "mt-1.5 w-2/3" : "mt-2 w-4/5")}
						/>
					)}
				</div>
			))}
		</MangaGrid>
	);
}

export function MangaRow({ children }: { children: ReactNode }) {
	return (
		<div className="min-w-0">
			<div className="flex gap-4 overflow-x-auto pb-2">{children}</div>
		</div>
	);
}
