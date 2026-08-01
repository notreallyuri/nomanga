import { useEffect } from "react";
import { useSettings, useSystem } from "@/hooks/services/use-settings";
import { unwrap } from "@/lib/unwrap";
import { commands } from "@/types/bindings";

// Once per app session, whichever route the user lands on. The backend throttles
// per series, so this is a no-op when everything was checked recently.
let checked = false;

export function useStartupLibraryCheck() {
	const settings = useSettings();
	const { check_library_on_start } = useSystem();

	// Waits for the settings query rather than reading useSystem() straight
	// away: until it resolves the hook reports the default, which would check
	// once anyway for a user who turned it off.
	useEffect(() => {
		if (checked || !settings.isSuccess) return;
		checked = true;
		if (!check_library_on_start) return;

		// Called directly instead of through useLibraryRefresh, which tracks
		// progress in state — holding that this high in the tree would re-render
		// the whole shell once per series checked. Nothing is reported either:
		// the progress listener in the sidebar drives the indicator and
		// invalidates the library queries when the run lands.
		unwrap(commands.refreshLibrary({ type: "All" }, false)).catch(() => {});
	}, [settings.isSuccess, check_library_on_start]);
}
