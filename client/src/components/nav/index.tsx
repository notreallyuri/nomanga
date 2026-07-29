import {
	Sidebar as ShadSidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { NavDownloads } from "./downloads";
import { NavMain, NavSettings } from "./main";
import { NavUpdates } from "./updates";

interface SidebarProps {
	onSettingsOpenChange: (value: boolean) => void;
	settingsOpen: boolean;
}

export function Sidebar({
	onSettingsOpenChange,
	settingsOpen,
	...props
}: React.ComponentProps<typeof ShadSidebar> & SidebarProps) {
	return (
		<ShadSidebar collapsible="icon" {...props}>
			<SidebarHeader className="flex flex-row items-center justify-between group-data-[collapsible=icon]:justify-center">
				<h1 className="font-black group-data-[collapsible=icon]:hidden">
					<span className="mr-1 rounded bg-accent p-0.5 px-1.5">no</span>manga
				</h1>

				<BrandToggle />

				<Tooltip>
					<TooltipTrigger
						render={
							<SidebarTrigger
								aria-label="Collapse sidebar"
								className="group-data-[collapsible=icon]:hidden"
							/>
						}
					/>
					<TooltipContent align="center" side="right">
						Collapse sidebar ({MODIFIER}B)
					</TooltipContent>
				</Tooltip>
			</SidebarHeader>
			<SidebarContent>
				<NavMain />
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<NavSettings
					onSettingsOpenChange={onSettingsOpenChange}
					settingsOpen={settingsOpen}
				/>
				<NavDownloads />
				<NavUpdates />
			</SidebarFooter>
			<SidebarRail />
		</ShadSidebar>
	);
}

const MODIFIER = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl+";

function BrandToggle() {
	const { toggleSidebar } = useSidebar();

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						aria-label="Expand sidebar"
						className="hidden size-8 items-center justify-center rounded bg-accent font-black text-sm transition-colors hover:bg-accent/80 group-data-[collapsible=icon]:flex"
						onClick={toggleSidebar}
						type="button"
					>
						no
					</button>
				}
			/>
			<TooltipContent align="center" side="right">
				Expand sidebar ({MODIFIER}B)
			</TooltipContent>
		</Tooltip>
	);
}
