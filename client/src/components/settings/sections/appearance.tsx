import { createGroupComponents } from "@/components/settings/components";

const { Group, Select, Switch } = createGroupComponents("appearance");

export function AppearanceSection() {
	return (
		<>
			<Group title="Theme">
				<Select
					description="Follow the system or pick one"
					field="dark_mode"
					label="Mode"
					options={[
						{ label: "System", value: "System" },
						{ label: "Light", value: "Light" },
						{ label: "Dark", value: "Dark" },
					]}
				/>
				<Select
					description="Accent colour scheme"
					field="theme"
					label="Colour"
					options={[
						{ label: "Default", value: "Default" },
						{ label: "Havoc", value: "Havoc" },
						{ label: "Void", value: "Void" },
					]}
				/>
			</Group>

			<Group title="Covers & grids">
				<Switch
					description="Display manga titles under their covers"
					field="show_titles"
					label="Show titles"
				/>
				<Switch
					description="Smaller covers and tighter spacing across the library, browse and search"
					field="compact_mode"
					label="Compact mode"
				/>
				<Select
					description="How covers are framed"
					field="cover_style"
					label="Cover style"
					options={[
						{ label: "Default", value: "Default" },
						{ label: "Rounded", value: "Rounded" },
						{ label: "Border", value: "Border" },
						{ label: "Shadow", value: "Shadow" },
					]}
				/>
			</Group>
		</>
	);
}
