import type { CommandError } from "@/types/bindings";

export function messageOf(error: CommandError): string {
	switch (error.kind) {
		case "Source":
			return error.detail.source_id
				? `${error.detail.source_id}: ${error.detail.message}`
				: error.detail.message;
		case "MangaNotCached":
			return `Manga is not cached: ${error.detail.source_id}/${error.detail.manga_id}`;
		default:
			return error.detail.message;
	}
}

export class NomangaError extends Error {
	readonly cause: CommandError;

	constructor(cause: CommandError) {
		super(messageOf(cause));
		this.name = "NomangaError";
		this.cause = cause;
	}

	get isRetryable(): boolean {
		return this.cause.kind === "Source";
	}
}

export async function unwrap<T>(
	promise: Promise<
		{ status: "ok"; data: T } | { status: "error"; error: CommandError }
	>,
): Promise<T> {
	const res = await promise;

	if (res.status === "error") {
		throw new NomangaError(res.error);
	}

	return res.data;
}
