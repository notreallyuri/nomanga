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
	openSettings: (route?: SettingsRoute) => void;
	/** Source whose detail page the Sources section should show, if any. */
	sourceTarget: string | null;
	setSourceTarget: (sourceId: string | null) => void;
	openSourceSettings: (sourceId: string) => void;
}

const SettingsUIContext = createContext<SettingsUI | null>(null);

const ALL_ITEMS = SETTINGS_SECTIONS.flatMap((section) => section.items);

const SOURCES_ROUTE = ALL_ITEMS.find((i) => i.name === "Sources");

export function SettingsUIProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState<SettingsItem>(DEFAULT_SETTINGS_ROUTE);
	const [sourceTarget, setSourceTarget] = useState<string | null>(null);

	const value = useMemo<SettingsUI>(
		() => ({
			open,
			// A targeted source only holds for as long as the dialog stays open;
			// leaving and coming back lands on the source list, not on whichever
			// source was last inspected.
			setOpen: (next) => {
				if (!next) setSourceTarget(null);
				setOpen(next);
			},
			active,
			setActive: (item) => {
				setSourceTarget(null);
				setActive(item);
			},
			sourceTarget,
			setSourceTarget,
			openSettings: (route) => {
				if (route) {
					const item = ALL_ITEMS.find((i) => i.name === route);
					if (item) setActive(item);
				}
				setSourceTarget(null);
				setOpen(true);
			},
			openSourceSettings: (sourceId) => {
				if (SOURCES_ROUTE) setActive(SOURCES_ROUTE);
				setSourceTarget(sourceId);
				setOpen(true);
			},
		}),
		[open, active, sourceTarget],
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
