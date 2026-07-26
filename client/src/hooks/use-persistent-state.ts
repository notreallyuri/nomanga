import { useCallback, useEffect, useState } from "react";

/**
 * `useState` mirrored to `localStorage` under `key`. Used for lightweight UI
 * preferences (last-opened tab, sort choice) that shouldn't round-trip through
 * the settings backend. Reads are lazy so the first render already has the
 * stored value; a `validate` guard lets callers reject stale/invalid data.
 */
export function usePersistentState<T>(
	key: string,
	fallback: T,
	validate?: (value: unknown) => value is T,
): [T, (next: T) => void] {
	const read = useCallback((): T => {
		try {
			const raw = localStorage.getItem(key);
			if (raw === null) return fallback;
			const parsed = JSON.parse(raw) as unknown;
			if (validate && !validate(parsed)) return fallback;
			return parsed as T;
		} catch {
			return fallback;
		}
	}, [key, fallback, validate]);

	const [value, setValue] = useState<T>(read);

	// Re-read when the key changes (rare, but keeps the hook honest).
	useEffect(() => {
		setValue(read());
	}, [read]);

	const set = useCallback(
		(next: T) => {
			setValue(next);
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch {
				// Ignore quota/availability errors — the in-memory value still works.
			}
		},
		[key],
	);

	return [value, set];
}
