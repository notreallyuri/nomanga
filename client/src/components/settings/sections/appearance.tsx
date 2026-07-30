import { CheckIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { createGroupComponents } from "@/components/settings/components";
import {
	useAppearance,
	useUpdateSettings,
} from "@/hooks/services/use-settings";
import { cn } from "@/lib/utils";
import type { CoverStyle, Theme, ThemeDarkMode } from "@/types/bindings";

const { Group, Select, Switch } = createGroupComponents("appearance");

const LIGHT = {
	bg: "#ffffff",
	panel: "#f1f1f1",
	bar: "#d4d4d4",
	accent: "#171717",
};
const DARK = {
	bg: "#161616",
	panel: "#1f1f1f",
	bar: "#3d3d3d",
	accent: "#e6e6e6",
};

const THEME_ORDER: Theme[] = [
	"Default",
	"Havoc",
	"Void",
	"Amber",
	"Rose",
	"Cyberpunk",
];

const themeClass = (theme: Theme): string => theme.toLowerCase();

export function AppearanceSection() {
	const { dark_mode, theme, cover_style } = useAppearance();
	const update = useUpdateSettings();

	const prefersDark = usePrefersDark();
	const isDark =
		dark_mode === "Dark" || (dark_mode === "System" && prefersDark);

	return (
		<>
			<Group title="Theme">
				<VisualOptions<ThemeDarkMode>
					description="Follow the system or pick one"
					label="Mode"
					onChange={(value) => update("appearance", { dark_mode: value })}
					options={[
						{ value: "System", label: "System", preview: <SystemPreview /> },
						{ value: "Light", label: "Light", preview: <MiniApp p={LIGHT} /> },
						{ value: "Dark", label: "Dark", preview: <MiniApp p={DARK} /> },
					]}
					value={dark_mode}
				/>
				<VisualOptions<Theme>
					description="Accent colour scheme"
					label="Colour"
					onChange={(value) => update("appearance", { theme: value })}
					options={THEME_ORDER.map((t) => ({
						value: t,
						label: t,
						preview: <ThemePreview colorClass={themeClass(t)} dark={isDark} />,
					}))}
					value={theme}
				/>
			</Group>

			<Group title="Covers & grids">
				<Switch
					description="Display manga titles under their covers"
					field="show_titles"
					label="Show titles"
				/>
				<Switch
					description="Tighter spacing between covers and smaller titles"
					field="compact_mode"
					label="Compact mode"
				/>
				<VisualOptions<CoverStyle>
					description="How covers are framed"
					label="Cover style"
					onChange={(value) => update("appearance", { cover_style: value })}
					options={(
						["Default", "Rounded", "Border", "Shadow"] as CoverStyle[]
					).map((style) => ({
						value: style,
						label: style,
						preview: <CoverPreview style={style} />,
					}))}
					value={cover_style}
				/>
				<Select
					description="Cover size in the library grid — smaller fits more per row"
					field="card_size"
					label="Card size"
					options={[
						{ label: "Small", value: "Small" },
						{ label: "Medium", value: "Medium" },
						{ label: "Large", value: "Large" },
					]}
				/>
			</Group>

			<Group title="Library appearance">
				<Select
					description="Cover grid or a compact list"
					field="library_layout"
					label="Layout"
					options={[
						{ label: "Grid", value: "Grid" },
						{ label: "List", value: "List" },
					]}
				/>
				<Switch
					description="Show the unread-count badge on library covers"
					field="show_unread_badge"
					label="Unread badges"
				/>
			</Group>
		</>
	);
}

function VisualOptions<T extends string>({
	label,
	description,
	value,
	onChange,
	options,
}: {
	label: string;
	description?: string;
	value: T;
	onChange: (value: T) => void;
	options: { value: T; label: string; preview: ReactNode }[];
}) {
	return (
		<div className="py-4">
			<div className="mb-3">
				<p className="font-medium text-sm">{label}</p>
				{description && (
					<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			<div className="flex flex-wrap gap-2.5">
				{options.map((option) => {
					const active = option.value === value;
					return (
						<button
							aria-label={option.label}
							aria-pressed={active}
							className={cn(
								"group relative flex w-32 shrink-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
								active
									? "border-primary ring-2 ring-primary/30"
									: "border-border hover:border-foreground/30",
							)}
							key={option.value}
							onClick={() => onChange(option.value)}
							type="button"
						>
							<div className="overflow-hidden rounded-md ring-1 ring-border/60">
								{option.preview}
							</div>
							<span className="font-medium text-xs">{option.label}</span>
							{active && (
								<span className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<CheckIcon size={11} weight="bold" />
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

type Palette = { bg: string; panel: string; bar: string; accent: string };

function MiniApp({ p }: { p: Palette }) {
	return (
		<div className="flex aspect-4/3 w-full" style={{ background: p.bg }}>
			<div
				className="flex w-1/3 flex-col gap-1 p-1.5"
				style={{ background: p.panel }}
			>
				<div
					className="h-1 w-3/4 rounded-full"
					style={{ background: p.accent }}
				/>
				<div className="h-1 w-1/2 rounded-full" style={{ background: p.bar }} />
				<div className="h-1 w-2/3 rounded-full" style={{ background: p.bar }} />
			</div>
			<div className="grid flex-1 grid-cols-2 content-start gap-1 p-1.5">
				{[0, 1, 2, 3].map((i) => (
					<div
						className="aspect-2/3 rounded-xs"
						key={i}
						style={{ background: p.bar }}
					/>
				))}
			</div>
		</div>
	);
}

function SystemPreview() {
	return (
		<div className="relative aspect-4/3 w-full">
			<div className="absolute inset-0">
				<MiniApp p={LIGHT} />
			</div>
			<div
				className="absolute inset-0"
				style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
			>
				<MiniApp p={DARK} />
			</div>
		</div>
	);
}

function ThemePreview({
	colorClass,
	dark,
}: {
	colorClass: string;
	dark: boolean;
}) {
	return (
		<div className={cn(dark && "dark", colorClass)}>
			<div className="flex aspect-4/3 w-full bg-background">
				<div className="flex w-2/5 flex-col gap-1 bg-sidebar p-1.5">
					<div className="h-1.5 w-full rounded-sm bg-primary" />
					<div className="h-1 w-3/4 rounded-full bg-sidebar-accent-foreground/60" />
					<div className="h-1 w-2/3 rounded-full bg-muted-foreground/40" />
				</div>
				<div className="flex flex-1 flex-col gap-1 p-1.5">
					<div className="flex gap-1">
						<div className="h-2 w-7 rounded-sm bg-primary" />
						<div className="h-2 flex-1 rounded-sm bg-accent" />
					</div>
					<div className="grid grid-cols-3 gap-1">
						{[0, 1, 2].map((i) => (
							<div
								className="aspect-2/3 rounded-xs border border-border bg-muted"
								key={i}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function usePrefersDark(): boolean {
	const [dark, setDark] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches,
	);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	return dark;
}

const COVER_STYLE_CLASS: Record<CoverStyle, string> = {
	Default: "rounded-none",
	Rounded: "rounded-md",
	Border: "rounded-none border-2 border-foreground/40",
	Shadow: "rounded-none shadow-black/40 shadow-lg",
};

function CoverPreview({ style }: { style: CoverStyle }) {
	return (
		<div className="flex aspect-4/3 w-full items-center justify-center bg-muted p-3">
			<div
				className={cn(
					"aspect-2/3 h-full bg-linear-to-br from-primary/70 to-primary/25",
					COVER_STYLE_CLASS[style],
				)}
			/>
		</div>
	);
}
