import {
	Sidebar as ShadSidebar,
	SidebarContent,
	SidebarRail,
} from "../ui/sidebar";
import { NavMain } from "./main";

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
			<SidebarRail />
		</ShadSidebar>
	);
}
