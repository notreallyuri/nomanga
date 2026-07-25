import type { ReactNode } from "react";
import { useAppearance } from "@/hooks/services/use-settings";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";

export function MangaGrid({
	children,
	compact,
}: {
	children: ReactNode;
	/** Forces density; defaults to the compact-mode setting. */
	compact?: boolean;
}) {
	const appearance = useAppearance();
	const dense = compact ?? appearance.compact_mode;

	return (
		<div
			className={cn(
				"grid",
				dense
					? "grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3"
					: "grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4",
			)}
		>
			{children}
		</div>
	);
}

export function MangaGridSkeleton({
	count = 12,
	compact,
}: {
	count?: number;
	compact?: boolean;
}) {
	const appearance = useAppearance();
	const dense = compact ?? appearance.compact_mode;

	return (
		<MangaGrid compact={dense}>
			{Array.from({ length: count }, (_, i) => (
				<div key={i}>
					<Skeleton className="aspect-2/3" />
					{/* Placeholder for the title line so the grid doesn't jump by a
					    row of text once the real cards arrive. */}
					{appearance.show_titles && (
						<Skeleton
							className={cn("h-3", dense ? "mt-1.5 w-2/3" : "mt-2 w-4/5")}
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
