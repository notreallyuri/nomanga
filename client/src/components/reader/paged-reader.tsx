import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Page, ZoomBehavior } from "@/types/bindings";
import { PageScrubber } from "./page-scrubber";

interface Props {
	pages: Page[];
	index: number;
	double: boolean;
	rtl: boolean;
	zoom: ZoomBehavior;
	zoomLevel?: number;
	onAdvance: () => void;
	onRetreat: () => void;
	onToggleChrome: () => void;
	onSeek: (index: number) => void;
}

const PRELOAD = 3;

export function PagedReader({
	pages,
	index,
	double,
	rtl,
	zoom,
	zoomLevel,
	onAdvance,
	onRetreat,
	onToggleChrome,
	onSeek,
}: Props) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const spread = useMemo(() => {
		if (!double || index === 0) return [pages[index]].filter(Boolean);
		const start = index % 2 === 1 ? index : index - 1;
		return [pages[start], pages[start + 1]].filter(Boolean);
	}, [pages, index, double]);

	useEffect(() => {
		for (let i = index + 1; i <= index + PRELOAD && i < pages.length; i++) {
			const page = pages[i];
			if (!page) continue;
			const img = new Image();
			img.src = page.image_url;
		}
	}, [pages, index]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: 0, left: 0 });
	}, [index]);

	const ordered = rtl ? [...spread].reverse() : spread;

	return (
		<div className="relative h-full w-full">
			<div className="h-full w-full overflow-auto" ref={scrollRef}>
				<div className="relative flex min-h-full w-full">
					<div
						className={cn(
							"m-auto flex items-start justify-center gap-0.5",
							zoom === "FitWidth" && "w-full",
						)}
					>
						{ordered.map((page) => (
							<img
								alt=""
								className={cn("select-none", zoomClass(zoom))}
								draggable={false}
								key={page.image_url}
								src={page.image_url}
								style={
									zoom === "Manual" && zoomLevel
										? { width: `${zoomLevel * 100}%`, maxWidth: "none" }
										: undefined
								}
							/>
						))}
					</div>

					<div className="pointer-events-none absolute inset-0">
						<div className="sticky top-0 flex h-svh">
							<button
								aria-label={rtl ? "Next page" : "Previous page"}
								className="pointer-events-auto h-full w-1/3 cursor-w-resize outline-none focus-visible:outline-none"
								onClick={rtl ? onAdvance : onRetreat}
								tabIndex={-1}
								type="button"
							/>
							<button
								aria-label="Toggle controls"
								className="pointer-events-auto h-full w-1/3 outline-none focus-visible:outline-none"
								onClick={onToggleChrome}
								tabIndex={-1}
								type="button"
							/>
							<button
								aria-label={rtl ? "Previous page" : "Next page"}
								className="pointer-events-auto h-full w-1/3 cursor-e-resize outline-none focus-visible:outline-none"
								onClick={rtl ? onRetreat : onAdvance}
								tabIndex={-1}
								type="button"
							/>
						</div>
					</div>
				</div>
			</div>

			<PageScrubber current={index} onSeek={onSeek} total={pages.length} />
		</div>
	);
}

function zoomClass(zoom: ZoomBehavior): string {
	switch (zoom) {
		case "FitWidth":
			return "w-full h-auto";
		case "FitHeight":
			return "h-svh w-auto max-w-none object-contain";
		case "ActualSize":
			return "max-w-none";
		case "Manual":
			return "h-auto";
	}
}
