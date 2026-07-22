import {
	BooksIcon,
	ClockIcon,
	CompassIcon,
	HouseIcon,
	type Icon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import type { FileRouteTypes } from "@/routeTree.gen";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "../ui/sidebar";

type AppPath = FileRouteTypes["to"];
type StaticPath = Exclude<AppPath, `${string}$${string}`>;

export interface NavItem {
	name: string;
	path: StaticPath;
	icon: Icon;
}

interface NavSection {
	title: string;
	items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
	{
		title: "Library",
		items: [
			{
				name: "Home",
				icon: HouseIcon,
				path: "/",
			},
			{
				name: "Library",
				icon: BooksIcon,
				path: "/library",
			},
			{
				name: "History",
				icon: ClockIcon,
				path: "/history",
			},
		],
	},
	{
		title: "Discover",
		items: [{ name: "Browse", path: "/browse", icon: CompassIcon }],
	},
];

function useNavData() {
	const { pathname } = useLocation();

	const isActive = (linkPath: string): boolean =>
		linkPath === "/" ? pathname === "/" : pathname.startsWith(linkPath);

	return { navSections: NAV_SECTIONS, isActive };
}

interface NavMainProps {
	onSettingsOpenChange: (value: boolean) => void;
	settingsOpen: boolean;
}

export function NavMain({ onSettingsOpenChange, settingsOpen }: NavMainProps) {
	const { isActive, navSections } = useNavData();

	return (
		<>
			{navSections.map((section) => (
				<SidebarGroup>
					<SidebarGroupLabel>{section.title}</SidebarGroupLabel>
					<SidebarMenu>
						{section.items.map((item) => (
							<SidebarMenuItem key={item.name}>
								<SidebarMenuButton
									className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
									isActive={isActive(item.path)}
									tooltip={item.name}
									render={
										<Link to={item.path}>
											<item.icon /> {item.name}
										</Link>
									}
								/>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
			<SidebarGroup>
				<SidebarGroupLabel>Settings</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							className="cursor-pointer"
							isActive={settingsOpen}
							onClick={() => onSettingsOpenChange(true)}
							tooltip="Settings"
						>
							<SlidersHorizontalIcon />
							Settings
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
		</>
	);
}
