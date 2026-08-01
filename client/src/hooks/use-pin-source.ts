import { toast } from "sonner";
import { MAX_PINNED_SOURCES, usePinnedSources } from "./services/use-settings";

export function usePinSource(sourceId: string) {
	const { isPinned, toggle, isFull } = usePinnedSources();

	const pinned = isPinned(sourceId);

	return {
		pinned,
		disabled: !pinned && isFull,
		toggle: () => {
			if (!toggle(sourceId)) {
				toast.error(`You can pin up to ${MAX_PINNED_SOURCES} sources.`);
			}
		},
	};
}
