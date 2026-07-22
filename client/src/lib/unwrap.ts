export async function unwrap<T, E>(
	promise: Promise<{ status: "ok"; data: T } | { status: "error"; error: E }>,
): Promise<T> {
	const res = await promise;

	if (res.status === "error") {
		throw new Error(
			typeof res.error === "string" ? res.error : JSON.stringify(res.error),
		);
	}

	return res.data;
}
