import { useEffect } from "react";
import { useSystem } from "@/hooks/services/use-settings";
import { libraryLock } from "@/lib/library-lock";
import type { CategoryFilter } from "@/types/bindings";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const IDLE_CHECK_MS = 15_000;

/**
 * Applies the configured re-lock policy to whatever the user has unlocked.
 * `UntilAppCloses` needs nothing — module state dies with the window.
 */
export function useLockSession(filter: CategoryFilter) {
	const { category_lock_session, category_lock_idle_minutes } = useSystem();
	const activeId = filter.type === "Category" ? filter.id : null;

	useEffect(() => {
		if (category_lock_session !== "UntilLeave") return;

		// Cleanup runs when the tab changes or the route unmounts — both count
		// as leaving.
		return () => libraryLock.lockAll();
	}, [category_lock_session, activeId]);

	useEffect(() => {
		if (category_lock_session !== "IdleTimeout") return;

		const idleMs = Math.max(1, category_lock_idle_minutes) * 60_000;
		const touch = () => libraryLock.touch();

		for (const event of ACTIVITY_EVENTS) {
			window.addEventListener(event, touch, { passive: true });
		}

		const timer = window.setInterval(() => {
			if (libraryLock.idleFor() >= idleMs) libraryLock.lockAll();
		}, IDLE_CHECK_MS);

		return () => {
			for (const event of ACTIVITY_EVENTS) {
				window.removeEventListener(event, touch);
			}
			window.clearInterval(timer);
		};
	}, [category_lock_session, category_lock_idle_minutes]);
}
