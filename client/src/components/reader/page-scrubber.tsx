import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
	current: number;
	total: number;
	onSeek: (index: number) => void;
	pinned?: boolean;
}

const TICK_LIMIT = 40;
const IDLE_MS = 1600;

export function PageScrubber({ current, total, onSeek, pinned }: Props) {
	const trackRef = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState(false);
	const [visible, setVisible] = useState(false);
	const idleTimer = useRef<ReturnType<typeof setTimeout>>(null);

	const wake = useCallback(() => {
		setVisible(true);
		if (idleTimer.current) clearTimeout(idleTimer.current);
		idleTimer.current = setTimeout(() => setVisible(false), IDLE_MS);
	}, []);

	useEffect(() => {
		wake();
		return () => {
			if (idleTimer.current) clearTimeout(idleTimer.current);
		};
	}, [current, wake]);

	const indexAt = useCallback(
		(clientY: number) => {
			const track = trackRef.current;
			if (!track || total === 0) return 0;

			const rect = track.getBoundingClientRect();
			const ratio = (clientY - rect.top) / rect.height;
			const clamped = Math.min(Math.max(ratio, 0), 1);

			return Math.round(clamped * (total - 1));
		},
		[total],
	);

	useEffect(() => {
		if (!dragging) return;

		const onMove = (e: PointerEvent) => {
			wake();
			onSeek(indexAt(e.clientY));
		};
		const onUp = () => setDragging(false);

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);

		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	}, [dragging, indexAt, onSeek, wake]);

	if (total <= 1) return null;

	const progress = total > 1 ? current / (total - 1) : 0;
	const showTicks = total <= TICK_LIMIT;

	return (
		<div
			className={cn(
				"absolute inset-y-20 right-0 z-10 flex w-16 items-center justify-end pr-2",
			)}
			onPointerEnter={wake}
			onPointerMove={wake}
		>
			<div
				className={cn(
					"flex h-[70%] flex-col items-center gap-2 transition-opacity duration-200",
					visible || dragging || pinned ? "opacity-100" : "opacity-0",
				)}
			>
				<div className="rounded bg-black/70 px-1.5 py-0.5 font-medium text-white text-xs tabular-nums">
					{current + 1}
				</div>

				<div
					aria-label="Page"
					aria-valuemax={total}
					aria-valuemin={1}
					aria-valuenow={current + 1}
					className="relative w-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
					onKeyDown={(e) => {
						if (e.key === "ArrowUp") onSeek(Math.max(0, current - 1));
						if (e.key === "ArrowDown") onSeek(Math.min(total - 1, current + 1));
					}}
					onPointerDown={(e) => {
						setDragging(true);
						onSeek(indexAt(e.clientY));
					}}
					ref={trackRef}
					role="slider"
					tabIndex={0}
				>
					<div
						className="absolute inset-x-0 top-0 rounded-full bg-white/70"
						style={{ height: `${progress * 100}%` }}
					/>

					{showTicks &&
						Array.from({ length: total }, (_, i) => (
							<div
								className="absolute left-1/2 h-px w-3 -translate-x-1/2 bg-black/40"
								key={i}
								style={{ top: `${(i / (total - 1)) * 100}%` }}
							/>
						))}

					<div
						className={cn(
							"absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform",
							dragging ? "size-4" : "size-3",
						)}
						style={{ top: `${progress * 100}%` }}
					/>
				</div>

				<div className="rounded bg-black/70 px-1.5 py-0.5 text-white/70 text-xs tabular-nums">
					{total}
				</div>
			</div>
		</div>
	);
}
