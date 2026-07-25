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
					description="Tighter spacing between covers and smaller titles"
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

			<Group title="Library">
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
