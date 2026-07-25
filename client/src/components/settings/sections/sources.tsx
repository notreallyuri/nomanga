import { CaretDownIcon, GearSixIcon, GlobeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SettingGroup } from "@/components/settings/components/parts";
import { SourceSettingsForm } from "@/components/settings/sections/source-settings-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	useSetSourcePreference,
	useSourcesWithPreferences,
} from "@/hooks/services/use-extensions";
import { cn } from "@/lib/utils";
import type { SourcePreference } from "@/types/bindings";

interface Configuring {
	id: string;
	name: string;
}

export function SourceSection() {
	const { data: rows, isPending, error } = useSourcesWithPreferences();

	const [configuring, setConfiguring] = useState<Configuring | null>(null);

	if (configuring) {
		return (
			<SourceSettingsForm
				onBack={() => setConfiguring(null)}
				sourceId={configuring.id}
				sourceName={configuring.name}
			/>
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
				<SourceRow
					icon={row.info.icon_url ?? undefined}
					key={row.info.id}
					language={row.info.language}
					name={row.info.name}
					nsfw={row.info.nsfw}
					onConfigure={() =>
						setConfiguring({ id: row.info.id, name: row.info.name })
					}
					preference={row.preference}
				/>
			))}
		</SettingGroup>
	);
}

function SourceRow({
	name,
	language,
	nsfw,
	preference,
	icon,
	onConfigure,
}: {
	name: string;
	language: string;
	nsfw: boolean;
	preference: SourcePreference;
	icon?: string;
	onConfigure: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const { mutate } = useSetSourcePreference();

	const toggle = (patch: Partial<SourcePreference>) =>
		mutate({ ...preference, ...patch });

	return (
		<div className="py-3">
			<div className="flex items-center justify-between gap-4">
				<button
					className="flex min-w-0 flex-1 items-center gap-2 text-left"
					onClick={() => setExpanded((v) => !v)}
					type="button"
				>
					<CaretDownIcon
						className={cn(
							"shrink-0 text-muted-foreground transition-transform",
							!expanded && "-rotate-90",
						)}
						size={14}
					/>

					<SourceIcon name={name} url={icon} />

					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{name}
							{nsfw && (
								<span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive text-xs">
									18+
								</span>
							)}
						</p>
						<p className="text-muted-foreground text-xs uppercase">
							{language}
						</p>
					</div>
				</button>

				<Switch
					checked={preference.enabled}
					onCheckedChange={(enabled) => toggle({ enabled })}
				/>
			</div>

			{expanded && (
				<div className="mt-3 ml-6 space-y-3 border-border border-l pl-4">
					<Toggle
						checked={preference.private}
						description="Keep reading progress, but hide this source from history"
						label="Private"
						onChange={(v) => toggle({ private: v })}
					/>
					<Toggle
						checked={preference.blur_covers}
						description="Blur cover art until hovered"
						label="Blur covers"
						onChange={(v) => toggle({ blur_covers: v })}
					/>
					<Toggle
						checked={preference.skip_updates}
						description="Exclude this source from library update runs"
						label="Skip updates"
						onChange={(v) => toggle({ skip_updates: v })}
					/>

					{/* Separated from the toggles above because it's a different
					    kind of thing: those are the app's policy about the source,
					    this opens config the *extension* declared. */}
					<div className="border-border border-t pt-3">
						<Button onClick={onConfigure} size="sm" variant="outline">
							<GearSixIcon />
							Source settings
						</Button>
						<p className="mt-1.5 text-muted-foreground text-xs">
							Options provided by the extension itself — API keys, tag filters,
							language.
						</p>
					</div>
				</div>
			)}
		</div>
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

function Toggle({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="min-w-0">
				<Label className="text-sm">{label}</Label>
				<p className="text-muted-foreground text-xs">{description}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}
