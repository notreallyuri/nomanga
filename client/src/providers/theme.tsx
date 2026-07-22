import { createContext, type ReactNode, useContext, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/services/use-settings";
import type { Theme, ThemeDarkMode } from "@/types/bindings";

interface ThemeProviderProps {
	children: ReactNode;
	defaultColor?: Theme;
	defaultTheme?: ThemeDarkMode;
	storageKey?: string;
}

interface ThemeProviderState {
	color: Theme;
	setColor: (color: Theme) => void;
	setTheme: (theme: ThemeDarkMode) => void;
	theme: ThemeDarkMode;
}

const initialState: ThemeProviderState = {
	theme: "System",
	color: "Default",
	setTheme: () => null,
	setColor: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
	children,
	defaultTheme = "System",
	defaultColor = "Default",
	storageKey = "novoice-ui-theme",
	...props
}: ThemeProviderProps) {
	const { data: settings, isLoading } = useSettings();
	const updateSettings = useUpdateSettings();

	const theme = settings?.appearance?.dark_mode ?? defaultTheme;
	const color = settings?.appearance?.theme ?? defaultColor;

	useEffect(() => {
		if (isLoading) return;

		const root = window.document.documentElement;
		root.classList.remove("light", "dark", "havoc", "void");

		if (theme === "System") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";
			root.classList.add(systemTheme);
		} else {
			root.classList.add(theme.toLowerCase());
		}

		if (color !== "Default") {
			root.classList.add(color.toLowerCase());
		}
	}, [theme, color, isLoading]);

	useEffect(() => {
		if (theme !== "System") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const handleChange = (e: MediaQueryListEvent) => {
			const root = window.document.documentElement;
			root.classList.remove("light", "dark");
			root.classList.add(e.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme]);

	const value = {
		theme,
		color,
		setTheme: (newTheme: ThemeDarkMode) => {
			updateSettings("appearance", { dark_mode: newTheme });
		},
		setColor: (newColor: Theme) => {
			updateSettings("appearance", { theme: newColor });
		},
	};

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const useTheme = () => {
	const context = useContext(ThemeProviderContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
};
