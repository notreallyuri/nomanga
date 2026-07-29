import {
	ArrowLeftIcon,
	CaretRightIcon,
	GlobeIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
	SettingGroup,
	SettingRow,
} from "@/components/settings/components/parts";
import { ExtensionSettings } from "@/components/settings/sections/source-settings-form";
import { Button } from "@/components/ui/button";
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
	useSetSourcePreference,
	useSourcePreference,
	useSourcesWithPreferences,
} from "@/hooks/services/use-extensions";
import { useCategories } from "@/hooks/services/use-library";
import type { SourceInfo } from "@/types/bindings";

export function SourceSection() {
	const { data: rows, isPending, error } = useSourcesWithPreferences();

	const [configuring, setConfiguring] = useState<SourceInfo | null>(null);

	if (configuring) {
		return (
			<SourceDetail info={configuring} onBack={() => setConfiguring(null)} />
		);
	}

	if (isPending) {
		return (
			<div className="space-y-3">
				{["a", "b"].map((k) => (
					<Skeleton className="h-16" key={k} />
				))}
			</div>
		);
	}

	if (error) {
		return <p className="text-destructive text-sm">{error.message}</p>;
	}

	if (rows.length === 0) {
		return (
			<p className="py-10 text-center text-muted-foreground text-sm">
				No sources available. Install an extension first.
			</p>
		);
	}

	return (
		<SettingGroup title="Installed sources">
			{rows.map((row) => (
				<SourceListRow
					info={row.info}
					key={row.info.id}
					onConfigure={() => setConfiguring(row.info)}
				/>
			))}
		</SettingGroup>
	);
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
				<SourceIcon name={info.name} url={info.icon_url ?? undefined} />

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

/**
 * One cohesive view for a single source: the app's own policy toggles and the
 * extension-declared settings side by side, rather than split between an
 * expanding row and a separate screen.
 */
function SourceDetail({
	info,
	onBack,
}: {
	info: SourceInfo;
	onBack: () => void;
}) {
	const preference = useSourcePreference(info.id);
	const { mutate } = useSetSourcePreference();

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
				<SourceIcon name={info.name} url={info.icon_url ?? undefined} />
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
				<DefaultCategoryRow
					onChange={(default_category_id) => toggle({ default_category_id })}
					value={preference.default_category_id}
				/>
			</SettingGroup>

			<SettingGroup title="Source settings">
				<div className="pt-2">
					<p className="mb-4 text-muted-foreground text-xs">
						Options provided by the extension itself — API keys, tag filters,
						language.
					</p>
					<ExtensionSettings sourceId={info.id} />
				</div>
			</SettingGroup>
		</div>
	);
}

const LIBRARY_DEFAULT = "library-default";

/**
 * Where titles added from this source get filed. Unset falls back to the
 * category flagged as default for the whole library.
 */
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

/**
 * Icons come from the source's own site and can fail or be absent, so a
 * fallback is required rather than optional — a broken image in a list of
 * eight sources is more distracting than a neutral glyph.
 */
function SourceIcon({ url, name }: { url?: string; name: string }) {
	const [failed, setFailed] = useState(false);

	if (!url || failed) {
		return (
			<div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
				<GlobeIcon className="text-muted-foreground" size={16} />
			</div>
		);
	}

	return (
		<img
			alt={`${name} icon`}
			className="size-8 shrink-0 rounded object-cover"
			onError={() => setFailed(true)}
			src={url}
		/>
	);
}
