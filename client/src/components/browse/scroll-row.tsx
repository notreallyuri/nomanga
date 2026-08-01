import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

export function ScrollRow({
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
		<div className="group/row relative isolate min-w-0">
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
