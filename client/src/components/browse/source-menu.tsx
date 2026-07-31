import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	EyeSlashIcon,
	GearSixIcon,
	PushPinIcon,
	PushPinSlashIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSettingsUI } from "@/components/settings/context";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
	useSetSourcePreference,
	useSourcePreference,
} from "@/hooks/services/use-extensions";
import { useSourceRefresh } from "@/hooks/services/use-sources";
import { usePinSource } from "@/hooks/use-pin-source";
import type { SourceInfo } from "@/types/bindings";

/**
 * The right-click menu for a source, wherever one is listed. Only the content —
 * each surface brings its own `ContextMenu`/`ContextMenuTrigger` so the trigger
 * can stay whatever that surface already renders.
 */
export function SourceMenuContent({
	info,
	showOpen = true,
}: {
	info: SourceInfo;
	showOpen?: boolean;
}) {
	const navigate = useNavigate();
	const { openSourceSettings } = useSettingsUI();
	// Not disabled when the pin list is full: the hook's toast says why, which is
	// more use than a greyed-out row.
	const { pinned, toggle } = usePinSource(info.id);
	const { isRefreshing, refresh } = useSourceRefresh(info.id);
	const preference = useSourcePreference(info.id);
	const { mutate: setPreference } = useSetSourcePreference();

	// Disabling drops the source out of Browse and out of this very menu, so the
	// toast carries the way back rather than sending the user hunting for it.
	const disable = () => {
		setPreference({ ...preference, enabled: false });
		toast.success(`${info.name} disabled`, {
			action: {
				label: "Undo",
				onClick: () => setPreference({ ...preference, enabled: true }),
			},
		});
	};

	return (
		<ContextMenuContent>
			{showOpen && (
				<ContextMenuItem
					onClick={() =>
						navigate({ params: { sourceId: info.id }, to: "/browse/$sourceId" })
					}
				>
					<ArrowSquareOutIcon />
					Open
				</ContextMenuItem>
			)}

			<ContextMenuItem disabled={isRefreshing} onClick={() => refresh()}>
				<ArrowClockwiseIcon />
				{isRefreshing ? "Refreshing…" : "Refresh"}
			</ContextMenuItem>

			<ContextMenuItem onClick={toggle}>
				{pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
				{pinned ? "Unpin from sidebar" : "Pin to sidebar"}
			</ContextMenuItem>

			<ContextMenuSeparator />

			<ContextMenuItem onClick={() => openSourceSettings(info.id)}>
				<GearSixIcon />
				Source settings
			</ContextMenuItem>

			<ContextMenuItem onClick={disable}>
				<EyeSlashIcon />
				Disable source
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
