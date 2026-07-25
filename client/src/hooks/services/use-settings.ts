import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/unwrap";
import {
	type AppearanceSettings,
	commands,
	type ReaderOverride,
	type Settings,
} from "@/types/bindings";

export const settingsKeys = {
	all: ["settings"] as const,
};

export const readerKeys = {
	all: ["reader"] as const,
	effective: (sourceId: string, mangaId: string) =>
		[...readerKeys.all, "effective", sourceId, mangaId] as const,
	sourceOverride: (sourceId: string) =>
		[...readerKeys.all, "override", "source", sourceId] as const,
	mangaOverride: (sourceId: string, mangaId: string) =>
		[...readerKeys.all, "override", "manga", sourceId, mangaId] as const,
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
		// The global reader defaults feed every manga's effective settings, so a
		// save has to refresh the resolved reader queries too.
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: readerKeys.all }),
	});
}

export const APPEARANCE_DEFAULTS: Required<AppearanceSettings> = {
	theme: "Default",
	dark_mode: "System",
	show_titles: true,
	compact_mode: false,
	cover_style: "Default",
};

export function useAppearance(): Required<AppearanceSettings> {
	const { data } = useSettings();
	const appearance = data?.appearance;

	return {
		theme: appearance?.theme ?? APPEARANCE_DEFAULTS.theme,
		dark_mode: appearance?.dark_mode ?? APPEARANCE_DEFAULTS.dark_mode,
		show_titles: appearance?.show_titles ?? APPEARANCE_DEFAULTS.show_titles,
		compact_mode: appearance?.compact_mode ?? APPEARANCE_DEFAULTS.compact_mode,
		cover_style: appearance?.cover_style ?? APPEARANCE_DEFAULTS.cover_style,
	};
}

export function useEffectiveReader(sourceId: string, mangaId: string) {
	return useQuery({
		queryKey: readerKeys.effective(sourceId, mangaId),
		queryFn: () => unwrap(commands.effectiveReaderSettings(sourceId, mangaId)),
	});
}

export function useSourceReaderOverride(sourceId: string) {
	return useQuery({
		queryKey: readerKeys.sourceOverride(sourceId),
		queryFn: () => unwrap(commands.getSourceReaderOverride(sourceId)),
	});
}

export function useMangaReaderOverride(sourceId: string, mangaId: string) {
	return useQuery({
		queryKey: readerKeys.mangaOverride(sourceId, mangaId),
		queryFn: () => unwrap(commands.getMangaReaderOverride(sourceId, mangaId)),
	});
}

export function useSetSourceReaderOverride(sourceId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (over: ReaderOverride) =>
			unwrap(commands.setSourceReaderOverride(sourceId, over)),
		// Effective settings for every manga in this source can change, so the
		// whole reader tree is refreshed rather than a single key.
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: readerKeys.all }),
	});
}

export function useSetMangaReaderOverride(sourceId: string, mangaId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (over: ReaderOverride) =>
			unwrap(commands.setMangaReaderOverride(sourceId, mangaId, over)),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: readerKeys.all }),
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
