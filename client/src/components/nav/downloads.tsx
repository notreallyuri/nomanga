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

export function NavDownloads() {
	const { items, active, clearFinished } = useDownloadsQueue();
	const { state } = useSidebar();

	const [open, setOpen] = useState(false);

	const current = items.find((i) => i.state === "Downloading");
	// A chapter's page list is fetched before its first Downloading event, and
	// that fetch is rate limited — so between chapters nothing is downloading.
	// Falling back to the next queued one keeps the block on screen instead of
	// letting it blink out for seconds at a time.
	const showing = current ?? items.find((i) => i.state === "Queued");
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
							<span
								aria-hidden
								className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-primary ring-2 ring-sidebar group-data-[collapsible=icon]:block"
							/>
						</>
					)}
				</SidebarMenuItem>
			</SidebarMenu>

			{active > 0 && state === "expanded" && showing && (
				<button
					className="block w-full min-w-0 space-y-1 overflow-hidden px-2 pt-1 text-left"
					onClick={() => setOpen(true)}
					type="button"
				>
					<Progress value={percent} />
					<p className="truncate text-[10px] text-sidebar-foreground/60 tabular-nums">
						{current
							? `${current.manga_title} · ${current.title} (${current.done}/${current.total})`
							: `Preparing ${showing.title}…`}
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
