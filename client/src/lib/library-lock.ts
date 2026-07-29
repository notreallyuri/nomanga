import { useSyncExternalStore } from "react";
import type { CategoryLockSession } from "@/types/bindings";

/**
 * Which locked categories are open right now. Module state rather than context
 * so an unlock survives navigating away from the library and back — under the
 * "until the app closes" policy that is the whole point, and a reload clears it
 * either way.
 */
const unlocked = new Set<string>();
const listeners = new Set<() => void>();

let lastActivity = Date.now();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export const libraryLock = {
	isUnlocked: (categoryId: string) => unlocked.has(categoryId),

	unlock(categoryId: string) {
		unlocked.add(categoryId);
		lastActivity = Date.now();
		emit();
	},

	lock(categoryId: string) {
		if (unlocked.delete(categoryId)) emit();
	},

	lockAll() {
		if (unlocked.size === 0) return;
		unlocked.clear();
		emit();
	},

	/** Pushes back the idle deadline; called while a locked category is on screen. */
	touch() {
		lastActivity = Date.now();
	},

	idleFor: () => Date.now() - lastActivity,
};

export function useIsUnlocked(categoryId: string | undefined): boolean {
	return useSyncExternalStore(subscribe, () =>
		categoryId ? unlocked.has(categoryId) : false,
	);
}

export const LOCK_SESSION_LABELS: Record<CategoryLockSession, string> = {
	UntilAppCloses: "Until the app closes",
	UntilLeave: "Until I leave the category",
	IdleTimeout: "After a period of inactivity",
};
