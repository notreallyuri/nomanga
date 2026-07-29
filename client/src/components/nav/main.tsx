import {
	BooksIcon,
	ClockIcon,
	CompassIcon,
	HouseIcon,
	type Icon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
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

/**
 * The current page takes the app accent rather than the sidebar's own
 * `data-active` tint, which is too subtle against this palette.
 */
const ACTIVE_ITEM =
	"data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

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

export function NavMain() {
	const { isActive, navSections } = useNavData();

	return (
		<>
			{navSections.map((section) => (
				<SidebarGroup key={section.title}>
					<SidebarGroupLabel>{section.title}</SidebarGroupLabel>
					<SidebarMenu>
						{section.items.map((item) => (
							<SidebarMenuItem key={item.name}>
								<SidebarMenuButton
									className={ACTIVE_ITEM}
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
		</>
	);
}

export function NavSettings({
	onSettingsOpenChange,
	settingsOpen,
}: {
	onSettingsOpenChange: (value: boolean) => void;
	settingsOpen: boolean;
}) {
	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						className={cn("cursor-pointer", ACTIVE_ITEM)}
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
	);
}
