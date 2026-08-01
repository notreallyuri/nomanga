import {
	CopySimpleIcon,
	MinusIcon,
	SquareIcon,
	XIcon,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { isMac } from "@/lib/platform";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

export function Titlebar() {
	const [maximized, setMaximized] = useState(false);

	useEffect(() => {
		// macOS draws its own traffic lights, so nothing here reads `maximized`.
		if (isMac) return;

		let unlisten: (() => void) | undefined;
		appWindow.isMaximized().then(setMaximized);
		appWindow
			.onResized(() => {
				appWindow.isMaximized().then(setMaximized);
			})
			.then((fn) => {
				unlisten = fn;
			});
		return () => unlisten?.();
	}, []);

	return (
		<div
			className={cn(
				"flex h-(--titlebar-h) shrink-0 select-none items-center border-border border-b bg-background text-muted-foreground",
				// The traffic lights float over the left edge of the webview under
				// titleBarStyle: Overlay, so the title has to start clear of them --
				// and gets the same gutter on the right to stay centred.
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
