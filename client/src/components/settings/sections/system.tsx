import { createGroupComponents } from "@/components/settings/components";

const { Group, Select, Switch } = createGroupComponents("system");

export function SystemSection() {
	return (
		<Group title="General">
			<Switch
				description="Check for app updates automatically when launched"
				field="update_on_startup"
				label="Update on startup"
			/>
			<Select
				description="Automatically check the library for new chapters on a schedule"
				field="background_updates"
				label="Background updates"
				options={[
					{ label: "Off", value: "Off" },
					{ label: "Every 6 hours", value: "Every6Hours" },
					{ label: "Every 12 hours", value: "Every12Hours" },
					{ label: "Every 24 hours", value: "Every24Hours" },
				]}
			/>
			<Switch
				description="Prompt before deleting items from your library"
				field="confirm_removal"
				label="Confirm removal"
			/>
			<Switch
				description="Notify me when background checks find new chapters"
				field="enable_notifications"
				label="Enable notifications"
			/>
		</Group>
	);
}
