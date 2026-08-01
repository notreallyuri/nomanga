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
