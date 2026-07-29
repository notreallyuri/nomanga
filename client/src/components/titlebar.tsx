import {
	CopySimpleIcon,
	MinusIcon,
	SquareIcon,
	XIcon,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

export function Titlebar() {
	const [maximized, setMaximized] = useState(false);

	useEffect(() => {
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
			className="flex h-(--titlebar-h) shrink-0 select-none items-center border-border border-b bg-background pl-3 text-muted-foreground"
			data-tauri-drag-region
		>
			<span
				className="pointer-events-none font-heading font-medium text-xs tracking-wide"
				data-tauri-drag-region
			>
				nomanga
			</span>

			<div className="ml-auto flex h-full">
				<ControlButton label="Minimize" onClick={() => appWindow.minimize()}>
					<MinusIcon size={14} />
				</ControlButton>
				<ControlButton
					label={maximized ? "Restore" : "Maximize"}
					onClick={() => appWindow.toggleMaximize()}
				>
					{maximized ? <CopySimpleIcon size={12} /> : <SquareIcon size={12} />}
				</ControlButton>
				<ControlButton
					className="hover:bg-destructive hover:text-white"
					label="Close"
					onClick={() => appWindow.close()}
				>
					<XIcon size={14} />
				</ControlButton>
			</div>
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
				"flex h-full w-11 items-center justify-center transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none",
				className,
			)}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
