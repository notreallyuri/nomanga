import { ArrowClockwiseIcon, ImageBrokenIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Page, ZoomBehavior } from "@/types/bindings";
import { PageScrubber } from "./page-scrubber";

interface Props {
	pages: Page[];
	zoom: ZoomBehavior;
	zoomLevel?: number;
	initialIndex?: number;
	onIndexChange: (index: number) => void;
	onToggleChrome: () => void;
}

export function StripReader({
	pages,
	zoom,
	zoomLevel,
	initialIndex = 0,
	onIndexChange,
	onToggleChrome,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const pageRefs = useRef<(HTMLElement | null)[]>([]);

	const [current, setCurrent] = useState(initialIndex);

	const seek = useCallback((i: number) => {
		pageRefs.current[i]?.scrollIntoView({ block: "start" });
	}, []);

	// Jump to the resume page once, after its element has mounted.
	const restored = useRef(false);
	useEffect(() => {
		if (restored.current) return;
		if (initialIndex <= 0) {
			restored.current = true;
			return;
		}
		const el = pageRefs.current[initialIndex];
		if (el) {
			el.scrollIntoView({ block: "start" });
			restored.current = true;
		}
	}, [initialIndex]);

	const handleIndexChange = useCallback(
		(i: number) => {
			setCurrent(i);
			onIndexChange(i);
		},
		[onIndexChange],
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const active = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

				if (!active) return;

				const index = Number(
					(active.target as HTMLElement).dataset.pageIndex ?? "0",
				);
				handleIndexChange(index);
			},
			{
				root: container,
				rootMargin: "-33% 0px -33% 0px",
				threshold: [0, 0.5, 1],
			},
		);

		for (const el of pageRefs.current) {
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	}, [onIndexChange]);

	// The observer only marks a page "current" while it's in the middle third of
	// the viewport, but a short final page can never get there — at max scroll it
	// sits in the bottom third, so the last index is never reported and the
	// chapter never registers as finished. Reaching the bottom forces it.
	useEffect(() => {
		const container = containerRef.current;
		if (!container || pages.length === 0) return;

		const onScroll = () => {
			const atBottom =
				container.scrollTop + container.clientHeight >=
				container.scrollHeight - 48;
			if (atBottom) handleIndexChange(pages.length - 1);
		};

		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, [handleIndexChange, pages.length]);

	useEffect(() => {
		pageRefs.current = pageRefs.current.slice(0, pages.length);
	}, [pages]);

	return (
		<div className="relative h-full w-full">
			<div
				className="scrollbar-none h-full w-full overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
				ref={containerRef}
			>
				<div
					className={cn(
						"mx-auto flex flex-col",
						zoom === "ActualSize" ? "w-max" : "w-full max-w-3xl",
					)}
					style={
						zoom === "Manual" && zoomLevel
							? { width: `${zoomLevel * 100}%`, maxWidth: "none" }
							: undefined
					}
				>
					{pages.map((page, i) => (
						<StripPage
							eager={i < 3}
							index={i}
							key={page.image_url}
							onToggleChrome={onToggleChrome}
							ref={(el) => {
								pageRefs.current[i] = el;
							}}
							url={page.image_url}
						/>
					))}
				</div>
			</div>
			<PageScrubber current={current} onSeek={seek} total={pages.length} />
		</div>
	);
}

type LoadState = "loading" | "loaded" | "error";

const StripPage = ({
	ref,
	url,
	index,
	eager,
	onToggleChrome,
}: {
	ref: (el: HTMLDivElement | null) => void;
	url: string;
	index: number;
	eager: boolean;
	onToggleChrome: () => void;
}) => {
	const [state, setState] = useState<LoadState>("loading");
	const [attempt, setAttempt] = useState(0);
	const autoRetried = useRef(false);

	const src =
		attempt === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}_r=${attempt}`;

	const retry = () => {
		setState("loading");
		setAttempt((n) => n + 1);
	};

	useEffect(() => {
		if (state !== "error" || autoRetried.current) return;

		autoRetried.current = true;
		const timer = setTimeout(retry, 1200);
		return () => clearTimeout(timer);
	}, [state]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: an overlay button would block scrolling
		// biome-ignore lint/a11y/useKeyWithClickEvents: an overlay button would block scrolling
		<div
			data-page-index={index}
			onClick={onToggleChrome}
			ref={ref}
			className={cn(state !== "loaded" && "min-h-[60vh]")}
		>
			{state !== "error" && (
				<img
					alt=""
					className={cn(
						"block w-full select-none transition-opacity",
						state === "loading" ? "opacity-0" : "opacity-100",
					)}
					draggable={false}
					key={src}
					loading={eager ? "eager" : "lazy"}
					onError={() => setState("error")}
					onLoad={() => setState("loaded")}
					src={src}
				/>
			)}

			{state === "loading" && (
				<div className="flex h-[60vh] items-center justify-center">
					<div className="text-sm text-white/40 tabular-nums">{index + 1}</div>
				</div>
			)}

			{state === "error" && (
				<div className="flex h-[60vh] flex-col items-center justify-center gap-3 border border-white/10 border-dashed">
					<ImageBrokenIcon className="text-white/40" size={32} />
					<p className="text-sm text-white/60">
						Page {index + 1} failed to load
					</p>
					<Button
						onClick={(e) => {
							e.stopPropagation();
							retry();
						}}
						size="sm"
						variant="secondary"
					>
						<ArrowClockwiseIcon />
						Retry
					</Button>
				</div>
			)}
		</div>
	);
};
