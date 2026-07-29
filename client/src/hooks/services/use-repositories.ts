import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { unwrap } from "@/lib/unwrap";
import type { RepositoryExtension } from "@/types/bindings";
import { commands } from "@/types/bindings";
import { extensionKeys } from "./use-extensions";
import { sourceKeys } from "./use-sources";

export const repositoryKeys = {
	all: ["repositories"] as const,
	catalog: () => [...repositoryKeys.all, "catalog"] as const,
};

/**
 * Every repository with the index it currently serves. Each row carries its own
 * `error`, so a repository that is unreachable renders as a failed row instead
 * of failing the query.
 */
export function useRepositoryCatalog() {
	return useQuery({
		queryKey: repositoryKeys.catalog(),
		queryFn: () => unwrap(commands.browseRepositories()),
		staleTime: 5 * 60 * 1000,
	});
}

export type RepositoryOffer = {
	repositoryUrl: string;
	extension: RepositoryExtension;
	unsupported: boolean;
};

/**
 * What the added repositories offer, keyed by extension id. Two repositories
 * offering the same id collapse to one entry, so an extension is never listed
 * twice; the last one added wins.
 */
export function useRepositoryOffers() {
	const query = useRepositoryCatalog();

	const offers = useMemo(() => {
		const map = new Map<string, RepositoryOffer>();

		for (const catalog of query.data ?? []) {
			for (const extension of catalog.index?.extensions ?? []) {
				map.set(extension.info.id, {
					repositoryUrl: catalog.repository.url,
					extension,
					unsupported: catalog.unsupported.includes(extension.info.id),
				});
			}
		}

		return map;
	}, [query.data]);

	return { ...query, offers };
}

export function useAddRepository() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (url: string) => unwrap(commands.addRepository(url)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
		},
	});
}

export function useRemoveRepository() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (url: string) => unwrap(commands.removeRepository(url)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
		},
	});
}

export function useInstallFromRepository() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ url, extensionId }: { url: string; extensionId: string }) =>
			unwrap(commands.installFromRepository(url, extensionId)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: extensionKeys.all });
			queryClient.invalidateQueries({ queryKey: sourceKeys.all });
			queryClient.invalidateQueries({
				queryKey: extensionKeys.withPreferences(),
			});
		},
	});
}
