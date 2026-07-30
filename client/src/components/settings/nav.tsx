import {
	BookOpenIcon,
	BooksIcon,
	DownloadSimpleIcon,
	GearSixIcon,
	type Icon,
	PaletteIcon,
	PlugsIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";

export type SettingsRoute =
	| "Appearance"
	| "Reader"
	| "Library"
	| "Sources"
	| "Extensions"
	| "Downloads"
	| "System"
	| "Developer";

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
				name: "System",
				icon: GearSixIcon,
				description: "App updates, backup, sync, and cached covers",
			},
		],
	},
	{
		title: "Content",
		items: [
			{
				name: "Library",
				icon: BooksIcon,
				description: "Update checks, removal prompts, and locked categories",
			},
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
			{
				name: "Downloads",
				icon: DownloadSimpleIcon,
				description: "Manage chapters saved for offline reading",
			},
		],
	},
	{
		title: "Advanced",
		items: [
			{
				name: "Developer",
				icon: TerminalWindowIcon,
				description: "Inspect app state, paths, and database tables",
			},
		],
	},
];

export const DEVELOPER_ONLY: SettingsRoute[] = ["Developer"];

export const DEFAULT_SETTINGS_ROUTE = SETTINGS_SECTIONS[0].items[0];
