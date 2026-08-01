import {
	CopySimpleIcon,
	MinusIcon,
	SquareIcon,
	XIcon,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useState } from "react";
import { isMac } from "@/lib/platform";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

export function Titlebar() {
	const [maximized, setMaximized] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);

	useEffect(() => {
		let unlisten: (() => void) | undefined;

		const sync = () => {
			appWindow.isFullscreen().then(setFullscreen);
			if (!isMac) appWindow.isMaximized().then(setMaximized);
		};

		sync();
		appWindow.onResized(sync).then((fn) => {
			unlisten = fn;
		});
		return () => unlisten?.();
	}, []);

	useLayoutEffect(() => {
		const root = document.documentElement;
		root.toggleAttribute("data-titlebar-hidden", fullscreen);
		return () => root.removeAttribute("data-titlebar-hidden");
	}, [fullscreen]);

	if (fullscreen) return null;

	return (
		<div
			className={cn(
				"flex h-(--titlebar-h) shrink-0 select-none items-center border-border border-b bg-background text-muted-foreground",
				isMac ? "px-20" : "pl-3",
			)}
			data-tauri-drag-region
		>
			<span
				className={cn(
					"pointer-events-none font-black font-heading text-xs tracking-wide",
					isMac && "flex-1 text-center",
				)}
				data-tauri-drag-region
			>
				nomanga
			</span>

			{!isMac && (
				<div className="ml-auto flex h-full">
					<ControlButton label="Minimize" onClick={() => appWindow.minimize()}>
						<MinusIcon size={14} />
					</ControlButton>
					<ControlButton
						label={maximized ? "Restore" : "Maximize"}
						onClick={() => appWindow.toggleMaximize()}
					>
						{maximized ? (
							<CopySimpleIcon size={12} />
						) : (
							<SquareIcon size={12} />
						)}
					</ControlButton>
					<ControlButton
						className="hover:bg-destructive hover:text-white"
						label="Close"
						onClick={() => appWindow.close()}
					>
						<XIcon size={14} />
					</ControlButton>
				</div>
			)}
		</div>
	);
}

function ControlButton({
	children,
	label,
	onClick,
	className,
}: {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
	className?: string;
}) {
	return (
		<button
			aria-label={label}
			className={cn(
				"flex h-full w-11 items-center justify-center outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
				className,
			)}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
