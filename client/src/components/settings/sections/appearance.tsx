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

			<Group title="Library grid">
				<Switch
					description="Display manga titles under their covers"
					field="show_titles"
					label="Show titles"
				/>
				<Switch
					description="Fit more entries on screen"
					field="compact_mode"
					label="Compact mode"
				/>
				<Select
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
