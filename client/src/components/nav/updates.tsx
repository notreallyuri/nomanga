import { ArrowClockwiseIcon, SparkleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import {
	useClearLibraryUpdates,
	useLibraryRefresh,
	useLibraryUpdates,
} from "@/hooks/services/use-library";
import { Progress } from "../ui/progress";
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "../ui/sidebar";
import { type RefreshLogEntry, UpdatesDialog } from "./updates-dialog";

export function NavUpdates() {
	const refresh = useLibraryRefresh();
	const updates = useLibraryUpdates();
	const clearUpdates = useClearLibraryUpdates();
	const { state } = useSidebar();

	const [open, setOpen] = useState(false);
	const [log, setLog] = useState<RefreshLogEntry[]>([]);

	const wasNull = useRef(true);
	useEffect(() => {
		const p = refresh.progress;
		if (!p) {
			wasNull.current = true;
			return;
		}
		const fresh = wasNull.current;
		wasNull.current = false;
		setLog((prev) => {
			const base = fresh ? [] : prev;
			const last = base.at(-1);
			if (last && last.done === p.done && last.title === p.current_title) {
				return base;
			}
			return [
				...base,
				{ done: p.done, total: p.total, title: p.current_title },
			];
		});
	}, [refresh.progress]);

	const running = refresh.isRefreshing || refresh.progress !== null;
	const count = updates.data?.length ?? 0;

	const label = running
		? "Checking…"
		: count > 0
			? `${count} update${count === 1 ? "" : "s"}`
			: "Check for updates";

	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						aria-label={running ? "Checking for updates" : label}
						onClick={() => setOpen(true)}
						tooltip={label}
					>
						{running ? (
							<ArrowClockwiseIcon className="animate-spin" />
						) : count > 0 ? (
							<SparkleIcon weight="fill" />
						) : (
							<ArrowClockwiseIcon />
						)}
						<span>{label}</span>
					</SidebarMenuButton>
					{count > 0 && !running && (
						<SidebarMenuBadge>{count}</SidebarMenuBadge>
					)}
				</SidebarMenuItem>
			</SidebarMenu>

			{running && state === "expanded" && refresh.progress && (
				<button
					className="block w-full min-w-0 space-y-1 overflow-hidden px-2 pt-1 text-left"
					onClick={() => setOpen(true)}
					type="button"
				>
					<Progress value={refresh.percent} />
					<p className="truncate text-[10px] text-sidebar-foreground/60 tabular-nums">
						{refresh.progress.current_title || "Finishing…"} (
						{refresh.progress.done}/{refresh.progress.total})
					</p>
				</button>
			)}

			<UpdatesDialog
				clearing={clearUpdates.isPending}
				log={log}
				onCheck={() => refresh.refresh({ type: "All" })}
				onClear={() => clearUpdates.mutate()}
				onOpenChange={setOpen}
				open={open}
				percent={refresh.percent}
				progress={refresh.progress}
				running={running}
				updates={updates.data ?? []}
			/>
		</SidebarGroup>
	);
}
