import {
	ArrowLeftIcon,
	CaretRightIcon,
	MagnifyingGlassIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { ChallengeDialog } from "@/components/challenge-dialog";
import {
	SettingAction,
	SettingGroup,
	SettingRow,
} from "@/components/settings/components/parts";
import { useSettingsUI } from "@/components/settings/context";
import { ExtensionSettings } from "@/components/settings/sections/source-settings-form";
import { SourceIcon } from "@/components/source-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	useExtensions,
	useSetSourcePreference,
	useSourcePreference,
	useSourcesWithPreferences,
} from "@/hooks/services/use-extensions";
import { useCategories } from "@/hooks/services/use-library";
import { useRefreshSourceFilters } from "@/hooks/services/use-sources";
import type {
	InstalledExtension,
	SourceInfo,
	SourceWithPreference,
} from "@/types/bindings";

export function SourceSection() {
	const { data: rows, isPending, error } = useSourcesWithPreferences();
	const extensions = useExtensions();
	const { sourceTarget, setSourceTarget } = useSettingsUI();
	const [query, setQuery] = useState("");

	if (isPending) return <ListSkeleton />;
	if (extensions.isPending) return <ListSkeleton />;

	if (error) return <ErrorText message={error.message} />;
	if (extensions.error) return <ErrorText message={extensions.error.message} />;

	if (rows.length === 0) {
		return (
			<p className="py-10 text-center text-muted-foreground text-sm">
				No sources available. Install an extension first.
			</p>
		);
	}

	// The target can outlive the source it names — an extension uninstalled
	// while the dialog is open, say — so a miss falls back to the list.
	const configuring = rows.find((row) => row.info.id === sourceTarget)?.info;

	if (configuring) {
		return (
			<SourceDetail info={configuring} onBack={() => setSourceTarget(null)} />
		);
	}

	const needle = query.trim().toLowerCase();
	const matches = rows.filter(
		({ info }) =>
			info.name.toLowerCase().includes(needle) ||
			info.language.toLowerCase().includes(needle),
	);

	const groups = groupByExtension(matches, extensions.data);

	return (
		<>
			<div className="relative mb-4">
				<MagnifyingGlassIcon
					className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
					size={16}
				/>
				<Input
					aria-label="Search sources"
					className="pl-9"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search sources…"
					value={query}
				/>
			</div>

			{groups.length === 0 ? (
				<p className="py-10 text-center text-muted-foreground text-sm">
					No source matches “{query}”.
				</p>
			) : (
				groups.map((group) => (
					<SettingGroup key={group.key} title={group.title}>
						{group.rows.map((row) => (
							<SourceListRow
								info={row.info}
								key={row.info.id}
								onConfigure={() => setSourceTarget(row.info.id)}
							/>
						))}
					</SettingGroup>
				))
			)}
		</>
	);
}

function ErrorText({ message }: { message: string }) {
	return <p className="text-destructive text-sm">{message}</p>;
}

function ListSkeleton() {
	return (
		<div className="space-y-3">
			{["a", "b"].map((k) => (
				<Skeleton className="h-16" key={k} />
			))}
		</div>
	);
}

interface SourceGroup {
	key: string;
	title: string;
	rows: SourceWithPreference[];
}

function groupByExtension(
	rows: SourceWithPreference[],
	extensions: InstalledExtension[],
): SourceGroup[] {
	const byId = new Map(rows.map((row) => [row.info.id, row]));

	const groups = extensions
		.map((extension) => ({
			key: extension.info.id,
			title: extension.info.name,
			rows: extension.sources
				.map((source) => byId.get(source.id))
				.filter((row) => row !== undefined),
		}))
		.filter((group) => group.rows.length > 0)
		.sort((a, b) => a.title.localeCompare(b.title));

	const claimed = new Set(
		extensions.flatMap((extension) =>
			extension.sources.map((source) => source.id),
		),
	);
	const orphans = rows.filter((row) => !claimed.has(row.info.id));

	if (orphans.length > 0) {
		groups.push({ key: "unclaimed", title: "Other sources", rows: orphans });
	}

	return groups;
}

function SourceListRow({
	info,
	onConfigure,
}: {
	info: SourceInfo;
	onConfigure: () => void;
}) {
	const preference = useSourcePreference(info.id);
	const { mutate } = useSetSourcePreference();

	return (
		<div className="flex items-center gap-3 py-3">
			<button
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
				onClick={onConfigure}
				type="button"
			>
				<SourceIcon
					className="size-8"
					iconSize={16}
					name={info.name}
					url={info.icon_url}
				/>

				<div className="min-w-0">
					<SourceName name={info.name} nsfw={info.nsfw} />
					<p className="text-muted-foreground text-xs uppercase">
						{info.language}
					</p>
				</div>

				<CaretRightIcon className="shrink-0 text-muted-foreground" size={14} />
			</button>

			<Switch
				checked={preference.enabled}
				onCheckedChange={(enabled) => mutate({ ...preference, enabled })}
			/>
		</div>
	);
}

function SourceDetail({
	info,
	onBack,
}: {
	info: SourceInfo;
	onBack: () => void;
}) {
	const preference = useSourcePreference(info.id);
	const { mutate } = useSetSourcePreference();
	const { mutate: refreshFilters, isPending: isRefreshingFilters } =
		useRefreshSourceFilters(info.id);
	const [solving, setSolving] = useState(false);

	const toggle = (patch: Partial<typeof preference>) =>
		mutate({ ...preference, ...patch });

	return (
		<div>
			<div className="mb-6 flex items-center gap-3">
				<Button
					aria-label="Back to sources"
					onClick={onBack}
					size="icon"
					variant="ghost"
				>
					<ArrowLeftIcon />
				</Button>
				<SourceIcon
					className="size-8"
					iconSize={16}
					name={info.name}
					url={info.icon_url}
				/>
				<div className="min-w-0 flex-1">
					<SourceName name={info.name} nsfw={info.nsfw} />
					<p className="text-muted-foreground text-xs uppercase">
						{info.language}
					</p>
				</div>
			</div>

			<SettingGroup title="Behaviour">
				<SettingRow
					description="Show this source and its titles in Browse"
					label="Enabled"
				>
					<Switch
						checked={preference.enabled}
						onCheckedChange={(enabled) => toggle({ enabled })}
					/>
				</SettingRow>
				<SettingRow
					description="Keep reading progress, but hide this source from history"
					label="Private"
				>
					<Switch
						checked={preference.private}
						onCheckedChange={(v) => toggle({ private: v })}
					/>
				</SettingRow>
				<SettingRow
					description="Blur cover art until hovered"
					label="Blur covers"
				>
					<Switch
						checked={preference.blur_covers}
						onCheckedChange={(v) => toggle({ blur_covers: v })}
					/>
				</SettingRow>
				<SettingRow
					description="Exclude this source from library update runs"
					label="Skip updates"
				>
					<Switch
						checked={preference.skip_updates}
						onCheckedChange={(v) => toggle({ skip_updates: v })}
					/>
				</SettingRow>
				<SettingRow
					description="Leave this source out of the search-all-sources results on Browse (coming soon)"
					label="Hide from search"
				>
					<Switch
						checked={preference.hide_from_search}
						onCheckedChange={(v) => toggle({ hide_from_search: v })}
					/>
				</SettingRow>
				<DefaultCategoryRow
					onChange={(default_category_id) => toggle({ default_category_id })}
					value={preference.default_category_id}
				/>
			</SettingGroup>

			{info.challenge && (
				<SettingGroup title="Access">
					<SettingRow
						description="Clear this source's browser check. The clearance lasts until the app is closed."
						label="Browser check"
					>
						<Button
							onClick={() => setSolving(true)}
							size="sm"
							variant="outline"
						>
							<ShieldCheckIcon />
							Verify
						</Button>
					</SettingRow>
				</SettingGroup>
			)}

			<SettingGroup title="Source settings">
				<SettingAction
					actionLabel={isRefreshingFilters ? "Refreshing…" : "Refresh"}
					description="Ask the source for its filter options again. They are cached for a day, so this is only needed when the source changes them sooner."
					disabled={isRefreshingFilters}
					label="Filters"
					onAction={() =>
						refreshFilters(undefined, {
							onSuccess: () => toast.success("Filters refreshed"),
							onError: (e) => toast.error(e.message),
						})
					}
				/>

				<div className="pt-2">
					<p className="mb-4 text-muted-foreground text-xs">
						Options provided by the extension itself — API keys, tag filters,
						language.
					</p>
					<ExtensionSettings sourceId={info.id} />
				</div>
			</SettingGroup>

			<ChallengeDialog onOpenChange={setSolving} open={solving} source={info} />
		</div>
	);
}

const LIBRARY_DEFAULT = "library-default";

function DefaultCategoryRow({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (categoryId: string | null) => void;
}) {
	const categories = useCategories();

	const items = {
		[LIBRARY_DEFAULT]: "Library default",
		...Object.fromEntries((categories.data ?? []).map((c) => [c.id, c.name])),
	};

	return (
		<SettingRow
			description="Where titles added from this source are filed"
			label="Default category"
		>
			<Select
				items={items}
				onValueChange={(next) =>
					onChange(!next || next === LIBRARY_DEFAULT ? null : next)
				}
				value={value ?? LIBRARY_DEFAULT}
			>
				<SelectTrigger className="w-56">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={LIBRARY_DEFAULT}>Library default</SelectItem>
					{categories.data?.map((category) => (
						<SelectItem key={category.id} value={category.id}>
							{category.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</SettingRow>
	);
}

function SourceName({ name, nsfw }: { name: string; nsfw: boolean }) {
	return (
		<p className="truncate font-medium text-sm">
			{name}
			{nsfw && (
				<span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive text-xs">
					18+
				</span>
			)}
		</p>
	);
}
