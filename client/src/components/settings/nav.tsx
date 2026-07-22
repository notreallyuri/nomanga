import {
	BookOpenIcon,
	BooksIcon,
	GearSixIcon,
	type Icon,
	PaletteIcon,
	PlugsIcon,
} from "@phosphor-icons/react";

export type SettingsRoute =
	| "Appearance"
	| "Reader"
	| "Library"
	| "Sources"
	| "Extensions"
	| "System";

export interface SettingsItem {
	name: SettingsRoute;
	icon: Icon;
	description: string;
}

export interface SettingsSection {
	title: string;
	items: SettingsItem[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
	{
		title: "Application",
		items: [
			{
				name: "Appearance",
				icon: PaletteIcon,
				description: "Theme, covers, and layout density",
			},
			{
				name: "Reader",
				icon: BookOpenIcon,
				description: "How pages are displayed while reading",
			},
			{
				name: "Library",
				icon: BooksIcon,
				description: "Defaults for your saved series",
			},
			{
				name: "System",
				icon: GearSixIcon,
				description: "Confirmations, notifications, and updates",
			},
		],
	},
	{
		title: "Content",
		items: [
			{
				name: "Sources",
				icon: PlugsIcon,
				description: "Per-source behaviour and visibility",
			},
			{
				name: "Extensions",
				icon: PlugsIcon,
				description: "Installed extensions and updates",
			},
		],
	},
];

export const DEFAULT_SETTINGS_ROUTE = SETTINGS_SECTIONS[0].items[0];
