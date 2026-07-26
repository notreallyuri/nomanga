import {
	Sidebar as ShadSidebar,
	SidebarContent,
	SidebarFooter,
	SidebarRail,
} from "../ui/sidebar";
import { NavDownloads } from "./downloads";
import { NavMain } from "./main";
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
		<ShadSidebar className="" collapsible="icon" {...props}>
			<SidebarContent>
				<NavMain
					onSettingsOpenChange={onSettingsOpenChange}
					settingsOpen={settingsOpen}
				/>
			</SidebarContent>
			<SidebarFooter>
				<NavDownloads />
				<NavUpdates />
			</SidebarFooter>
			<SidebarRail />
		</ShadSidebar>
	);
}
