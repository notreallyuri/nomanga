import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import { commands, type Settings } from "@/types/bindings";

export const settingsKeys = {
	all: ["settings"] as const,
};

export function useSettings() {
	return useQuery({
		queryKey: settingsKeys.all,
		queryFn: () => unwrap(commands.getSettings()),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useSaveSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (settings: Settings) => unwrap(commands.saveSettings(settings)),
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey: settingsKeys.all });
			const previous = queryClient.getQueryData<Settings>(settingsKeys.all);
			queryClient.setQueryData(settingsKeys.all, next);
			return { previous };
		},
		onError: (_err, _next, context) => {
			if (context?.previous) {
				queryClient.setQueryData(settingsKeys.all, context.previous);
			}
		},
	});
}

export function useUpdateSettings() {
	const { data: settings } = useSettings();
	const { mutate } = useSaveSettings();

	return <K extends keyof Settings>(group: K, patch: Partial<Settings[K]>) => {
		if (!settings) return;

		mutate({
			...settings,
			[group]: { ...settings[group], ...patch },
		});
	};
}
