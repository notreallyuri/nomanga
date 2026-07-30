import { createGroupComponents } from "@/components/settings/components";
import { SettingAction } from "@/components/settings/components/parts";
import { BackupGroup } from "@/components/settings/sections/backup";
import { LibraryLockGroup } from "@/components/settings/sections/library-lock";
import { SyncGroup } from "@/components/settings/sections/sync";
import {
	useClearImageCache,
	useImageCacheStats,
} from "@/hooks/services/use-image-cache";
import { formatBytes } from "@/lib/utils";

const { Group, Select, Switch } = createGroupComponents("system");

export function SystemSection() {
	return (
		<>
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
					description="Check the library for new chapters once when the app opens"
					field="check_library_on_start"
					label="Check library on start"
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

			<Group title="Library lock">
				<LibraryLockGroup />
			</Group>

			<Group title="Advanced">
				<Switch
					description="Show the Developer section for inspecting app state and database tables"
					field="developer_mode"
					label="Developer mode"
				/>
			</Group>

			<Group title="Backup">
				<BackupGroup />
			</Group>

			<Group title="Sync">
				<SyncGroup />
			</Group>

			<Group title="Cover cache">
				<Select
					description="Keep covers on disk so they survive a restart. Oldest covers are dropped first once the limit is reached."
					field="image_cache_limit"
					label="Maximum size"
					options={[
						{ label: "Off", value: "Off" },
						{ label: "256 MB", value: "Mb256" },
						{ label: "512 MB", value: "Mb512" },
						{ label: "1 GB", value: "Gb1" },
						{ label: "2 GB", value: "Gb2" },
					]}
				/>
				<ClearCache />
			</Group>
		</>
	);
}

function ClearCache() {
	const stats = useImageCacheStats();
	const clear = useClearImageCache();

	const cached = stats.data?.file_count ?? 0;
	const bytes = stats.data?.total_bytes ?? 0;

	const description =
		cached === 0
			? "Nothing cached yet."
			: `${cached} cover${cached === 1 ? "" : "s"} · ${formatBytes(bytes)}`;

	return (
		<SettingAction
			actionLabel={clear.isPending ? "Clearing…" : "Clear cache"}
			description={description}
			disabled={clear.isPending || cached === 0}
			label="Cached covers"
			onAction={() => clear.mutate()}
		/>
	);
}
