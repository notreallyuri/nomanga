import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	DEFAULT_SETTINGS_ROUTE,
	SETTINGS_SECTIONS,
	type SettingsItem,
	type SettingsRoute,
} from "./nav";

interface SettingsUI {
	open: boolean;
	setOpen: (open: boolean) => void;
	active: SettingsItem;
	setActive: (item: SettingsItem) => void;
	/** Open the settings dialog, optionally jumping straight to a tab. */
	openSettings: (route?: SettingsRoute) => void;
}

const SettingsUIContext = createContext<SettingsUI | null>(null);

const ALL_ITEMS = SETTINGS_SECTIONS.flatMap((section) => section.items);

export function SettingsUIProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState<SettingsItem>(DEFAULT_SETTINGS_ROUTE);

	const value = useMemo<SettingsUI>(
		() => ({
			open,
			setOpen,
			active,
			setActive,
			openSettings: (route) => {
				if (route) {
					const item = ALL_ITEMS.find((i) => i.name === route);
					if (item) setActive(item);
				}
				setOpen(true);
			},
		}),
		[open, active],
	);

	return (
		<SettingsUIContext.Provider value={value}>
			{children}
		</SettingsUIContext.Provider>
	);
}

export function useSettingsUI() {
	const ctx = useContext(SettingsUIContext);
	if (!ctx) {
		throw new Error("useSettingsUI must be used within a SettingsUIProvider");
	}
	return ctx;
}
