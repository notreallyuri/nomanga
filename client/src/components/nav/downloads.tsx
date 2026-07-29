import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useDownloadsQueue } from "@/hooks/services/use-downloads";
import { Progress } from "../ui/progress";
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "../ui/sidebar";
import { DownloadsDialog } from "./downloads-dialog";

/**
 * Persistent download-queue status pinned to the sidebar. Download events are
 * global, so the current progress shows from any screen; clicking opens the
 * detailed queue dialog.
 */
export function NavDownloads() {
	const { items, active, clearFinished } = useDownloadsQueue();
	const { state } = useSidebar();

	const [open, setOpen] = useState(false);

	const current = items.find((i) => i.state === "Downloading");
	// The count lives in the badge, so the button keeps a stable label; the
	// tooltip is the collapsed rail's only text, so it carries the state.
	const label = active > 0 ? `Downloading ${active}` : "Downloads";

	const percent =
		current && current.total > 0
			? Math.round((current.done / current.total) * 100)
			: 0;

	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						aria-label={label}
						onClick={() => setOpen(true)}
						tooltip={label}
					>
						<DownloadSimpleIcon
							className={active > 0 ? "animate-pulse" : undefined}
						/>
						<span>Downloads</span>
					</SidebarMenuButton>
					{active > 0 && (
						<>
							<SidebarMenuBadge>{active}</SidebarMenuBadge>
							{/* The badge is hidden in the collapsed rail, where a pulsing
							    icon alone reads as decoration rather than activity. */}
							<span
								aria-hidden
								className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-primary ring-2 ring-sidebar group-data-[collapsible=icon]:block"
							/>
						</>
					)}
				</SidebarMenuItem>
			</SidebarMenu>

			{active > 0 && state === "expanded" && current && (
				<button
					className="block w-full min-w-0 space-y-1 overflow-hidden px-2 pt-1 text-left"
					onClick={() => setOpen(true)}
					type="button"
				>
					<Progress value={percent} />
					<p className="truncate text-[10px] text-sidebar-foreground/60 tabular-nums">
						{current.manga_title} · {current.title} ({current.done}/
						{current.total})
					</p>
				</button>
			)}

			<DownloadsDialog
				active={active}
				items={items}
				onClearFinished={clearFinished}
				onOpenChange={setOpen}
				open={open}
			/>
		</SidebarGroup>
	);
}
