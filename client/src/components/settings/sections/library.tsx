import { createGroupComponents } from "@/components/settings/components";
import { LibraryLockGroup } from "@/components/settings/sections/library-lock";

const { Group, Select, Switch } = createGroupComponents("system");

export function LibrarySection() {
	return (
		<>
			<Group title="General">
				<Switch
					description="Prompt before deleting items from your library"
					field="confirm_removal"
					label="Confirm removal"
				/>
			</Group>

			<Group title="Updates">
				<Switch
					description="Check the library for new chapters once when the app opens"
					field="check_library_on_start"
					label="Check library on start"
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
					description="Notify me when background checks find new chapters"
					field="enable_notifications"
					label="Enable notifications"
				/>
			</Group>

			<Group title="Library lock">
				<LibraryLockGroup />
			</Group>
		</>
	);
}
