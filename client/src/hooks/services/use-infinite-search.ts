import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { unwrap } from "@/lib/unwrap";
import type { FilterValue } from "@/types/bindings";
import { commands } from "@/types/bindings";
import { sourceKeys } from "./use-sources";

export function useInfiniteSourceSearch(
	sourceId: string | undefined,
	query: string,
	filters: FilterValue[],
	enabled = true,
) {
	return useInfiniteQuery({
		queryKey: [
			...sourceKeys.all,
			sourceId ?? "",
			"search-infinite",
			query,
			filters,
		],
		queryFn: ({ pageParam }) =>
			unwrap(
				commands.sourceSearch(sourceId as string, {
					query,
					page: pageParam,
					filters,
				}),
			),
		initialPageParam: 1,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.has_next ? allPages.length + 1 : undefined,
		enabled: Boolean(sourceId) && enabled,
	});
}

export function useInfiniteSourceSection(
	sourceId: string | undefined,
	sectionId: string,
	enabled = true,
) {
	return useInfiniteQuery({
		queryKey: [
			...sourceKeys.all,
			sourceId ?? "",
			"section-infinite",
			sectionId,
		],
		queryFn: ({ pageParam }) =>
			unwrap(
				commands.sourceSection(sourceId as string, {
					section_id: sectionId,
					page: pageParam,
				}),
			),
		initialPageParam: 1,
		getNextPageParam: (lastPage, allPages) =>
			lastPage.has_next ? allPages.length + 1 : undefined,
		enabled: Boolean(sourceId && sectionId) && enabled,
	});
}

export function useInView<T extends HTMLElement>(rootMargin = "400px") {
	const [inView, setInView] = useState(false);
	const [node, setNode] = useState<T | null>(null);

	useEffect(() => {
		if (!node) return;

		const observer = new IntersectionObserver(
			([entry]) => setInView(entry?.isIntersecting ?? false),
			{ rootMargin },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [node, rootMargin]);

	return { ref: setNode, inView };
}
