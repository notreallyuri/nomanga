import {
	BooksIcon,
	ClockIcon,
	CompassIcon,
	HouseIcon,
	type Icon,
	PushPinSlashIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Fragment } from "react";
import { useSourcesWithPreferences } from "@/hooks/services/use-extensions";
import { usePinnedSources } from "@/hooks/services/use-settings";
import { cn } from "@/lib/utils";
import type { FileRouteTypes } from "@/routeTree.gen";
import type { SourceInfo } from "@/types/bindings";
import { SourceIcon } from "../source-icon";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../ui/context-menu";
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
	const { pinned } = usePinnedSources();

	const isActive = (linkPath: string): boolean => {
		if (linkPath === "/") return pathname === "/";

		// A pinned source owns its own row, so Browse steps aside rather than
		// lighting up alongside it.
		if (linkPath === "/browse") {
			return (
				pathname.startsWith("/browse") &&
				!pinned.some((id) => pathname === `/browse/${id}`)
			);
		}

		return pathname.startsWith(linkPath);
	};

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
							<Fragment key={item.name}>
								<SidebarMenuItem>
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
								{item.path === "/browse" && <NavPinnedSources />}
							</Fragment>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	);
}

function NavPinnedSources() {
	const { pathname } = useLocation();
	const { pinned, toggle } = usePinnedSources();
	const { data: rows } = useSourcesWithPreferences();

	if (!rows) return null;

	// A pin outlives the source it points at: the extension can be uninstalled
	// or switched off long after being pinned, and neither one clears settings.
	const sources = pinned
		.map((id) =>
			rows.find((row) => row.info.id === id && row.preference.enabled),
		)
		.filter((row): row is NonNullable<typeof row> => row !== undefined)
		.map((row) => row.info);

	return sources.map((info) => (
		<PinnedSource
			active={pathname === `/browse/${info.id}`}
			info={info}
			key={info.id}
			onUnpin={() => toggle(info.id)}
		/>
	));
}

function PinnedSource({
	info,
	active,
	onUnpin,
}: {
	info: SourceInfo;
	active: boolean;
	onUnpin: () => void;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<SidebarMenuItem>
						<SidebarMenuButton
							className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
							isActive={active}
							tooltip={info.name}
							render={
								<Link params={{ sourceId: info.id }} to="/browse/$sourceId">
									<SourceIcon
										className="size-4 rounded-sm"
										iconSize={14}
										name={info.name}
										url={info.icon_url}
									/>
									<span className="truncate">{info.name}</span>
								</Link>
							}
						/>
					</SidebarMenuItem>
				}
			/>
			<ContextMenuContent>
				<ContextMenuItem onClick={onUnpin}>
					<PushPinSlashIcon />
					Unpin
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
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
						className={cn(
							"cursor-pointer",
							"data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
						)}
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
