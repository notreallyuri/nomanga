/**
 * Applies a stored id order to a list of sources.
 *
 * The stored list is not a snapshot of the installed set — extensions come and
 * go while it sits in settings.json — so it is treated as a preference rather
 * than a manifest: ids it names that no longer resolve fall out here, and
 * sources it does not name sort in by name after the ones it does. That is what
 * makes a newly installed source appear at the end instead of disappearing.
 */
export function applySourceOrder<T>(
	items: T[],
	order: string[],
	id: (item: T) => string,
	name: (item: T) => string,
): T[] {
	const rank = new Map(order.map((sourceId, index) => [sourceId, index]));

	return [...items].sort((a, b) => {
		const left = rank.get(id(a));
		const right = rank.get(id(b));

		if (left !== undefined && right !== undefined) return left - right;
		if (left !== undefined) return -1;
		if (right !== undefined) return 1;

		return name(a).localeCompare(name(b));
	});
}

/**
 * Rewrites the stored order after the *visible* sources were rearranged.
 *
 * A disabled source is still installed — it is filtered out of the grid, not
 * removed — so persisting the ids on screen alone would drop it, and enabling it
 * again would send it to the end of a list it used to sit in the middle of. The
 * new arrangement is instead spliced into the slots the visible sources already
 * occupied among all installed ones, leaving the hidden ids exactly where they
 * were.
 *
 * Building the result from `installed` also prunes ids left behind by an
 * uninstalled extension, which nothing else cleans up.
 */
export function mergeSourceOrder(
	installed: string[],
	visible: string[],
): string[] {
	const moving = new Set(visible);
	let next = 0;

	return installed.map((id) =>
		moving.has(id) ? (visible[next++] as string) : id,
	);
}
