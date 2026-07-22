import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUpdateSettings } from "@/hooks/services/use-settings";
import type { Settings } from "@/types/bindings";

export type FieldsOfType<T, V> = {
	[K in keyof T]: NonNullable<T[K]> extends V ? K : never;
}[keyof T];

export type SettingValue<
	K extends keyof Settings,
	F extends keyof NonNullable<Settings[K]>,
> = NonNullable<NonNullable<Settings[K]>[F]>;

export type SwitchProps<K extends keyof Settings> = {
	field: FieldsOfType<NonNullable<Settings[K]>, boolean>;
	label: string;
	description?: string;
} & React.ComponentProps<typeof Switch>;

export type SelectProps<
	K extends keyof Settings,
	F extends FieldsOfType<NonNullable<Settings[K]>, string>,
> = {
	field: F;
	label: string;
	description?: string;
	options: readonly { label: string; value: SettingValue<K, F> }[];
} & Omit<
	React.ComponentProps<typeof Select>,
	"value" | "onValueChange" | "dir"
>;

export function SettingRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-6 py-4">
			<div className="min-w-0">
				<Label className="font-medium text-sm">{label}</Label>
				{description && (
					<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function SettingGroup({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<section className="mb-8">
			{title && (
				<h2 className="mb-1 font-heading font-semibold text-muted-foreground text-sm uppercase tracking-wide">
					{title}
				</h2>
			)}
			<div className="divide-y divide-border">{children}</div>
		</section>
	);
}

export function SettingSwitch<K extends keyof Settings>({
	group,
	field,
	label,
	description,
}: SwitchProps<K> & { group: K }) {
	const { data: settings } = useSettings();
	const update = useUpdateSettings();

	if (!settings) return null;

	const value = (settings[group] as Record<string, unknown>)[
		field as string
	] as boolean;

	return (
		<SettingRow description={description} label={label}>
			<Switch
				checked={value}
				onCheckedChange={(checked) =>
					update(group, { [field]: checked } as Partial<Settings[K]>)
				}
			/>
		</SettingRow>
	);
}

export function SettingSelect<
	K extends keyof Settings,
	F extends FieldsOfType<NonNullable<Settings[K]>, string>,
>({
	group,
	field,
	label,
	description,
	options,
}: SelectProps<K, F> & { group: K }) {
	const { data: settings } = useSettings();
	const update = useUpdateSettings();

	if (!settings) return null;

	const value = (settings[group] as Record<string, unknown>)[
		field as string
	] as string;

	const selectedLabel = options.find((opt) => opt.value === value)?.label;

	return (
		<SettingRow description={description} label={label}>
			<Select
				onValueChange={(next) =>
					update(group, { [field]: next } as Partial<Settings[K]>)
				}
				value={value}
			>
				<SelectTrigger className="w-44">
					<SelectValue>{selectedLabel}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem
							key={option.value as string}
							value={option.value as string}
						>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</SettingRow>
	);
}

export function createGroupComponents<K extends keyof Settings>(group: K) {
	return {
		Group: SettingGroup,
		Switch: (props: SwitchProps<K>) => (
			<SettingSwitch group={group} {...props} />
		),
		Select: <F extends FieldsOfType<NonNullable<Settings[K]>, string>>(
			props: SelectProps<K, F>,
		) => <SettingSelect group={group} {...props} />,
	};
}
