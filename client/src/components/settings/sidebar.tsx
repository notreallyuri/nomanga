import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SETTINGS_SECTIONS, type SettingsItem } from "./nav";

interface Props {
	current: SettingsItem;
	onChange: (item: SettingsItem) => void;
}

export function SettingsSidebar({ current, onChange }: Props) {
	return (
		<Sidebar className="border-r" collapsible="none">
			<SidebarContent>
				{SETTINGS_SECTIONS.map((section) => (
					<SidebarGroup key={section.title}>
						<SidebarGroupLabel className="font-semibold text-muted-foreground text-xs uppercase">
							{section.title}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{section.items.map((item) => (
									<SidebarMenuItem key={item.name}>
										<SidebarMenuButton
											className="cursor-pointer data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
											isActive={item.name === current.name}
											onClick={() => onChange(item)}
										>
											<item.icon />
											{item.name}
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
		</Sidebar>
	);
}
