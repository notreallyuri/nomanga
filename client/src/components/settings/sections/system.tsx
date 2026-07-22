import { createGroupComponents } from "@/components/settings/components";

const { Group, Switch } = createGroupComponents("system");

export function SystemSection() {
	return (
		<Group title="General">
			<Switch
				description="Check for app updates automatically when launched"
				field="update_on_startup"
				label="Update on startup"
			/>
			<Switch
				description="Prompt before deleting items from your library"
				field="confirm_removal"
				label="Confirm removal"
			/>
			<Switch
				description="Allow push notifications for library updates"
				field="enable_notifications"
				label="Enable notifications"
			/>
		</Group>
	);
}
