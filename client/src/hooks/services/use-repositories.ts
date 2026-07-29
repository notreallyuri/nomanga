import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
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
