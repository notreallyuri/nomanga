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
import { useSettings } from "@/hooks/services/use-settings";
import { DEVELOPER_ONLY, SETTINGS_SECTIONS, type SettingsItem } from "./nav";

interface Props {
	current: SettingsItem;
	onChange: (item: SettingsItem) => void;
}

export function SettingsSidebar({ current, onChange }: Props) {
	const { data: settings } = useSettings();
	const showDeveloper = settings?.system?.developer_mode ?? false;

	const sections = SETTINGS_SECTIONS.map((section) => ({
		...section,
		items: section.items.filter(
			(item) => showDeveloper || !DEVELOPER_ONLY.includes(item.name),
		),
	})).filter((section) => section.items.length > 0);

	return (
		<Sidebar className="border-r" collapsible="none">
			<SidebarContent>
				{sections.map((section) => (
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
