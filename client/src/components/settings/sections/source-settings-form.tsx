import {
	ArrowLeftIcon,
	MagnifyingGlassIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	useSaveSourceSettings,
	useSourceSettings,
} from "@/hooks/services/use-source-settings";
import { cn } from "@/lib/utils";
import type { Setting, SettingKind } from "@/types/bindings";

function decodeList(raw: string | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

const encodeList = (values: string[]) => JSON.stringify(values);

function defaultValue(kind: SettingKind): string {
	switch (kind.type) {
		case "Text":
			return kind.default ?? "";
		case "Toggle":
			return String(kind.default);
		case "Select":
			return kind.default ?? "";
		case "Number":
			return kind.default != null ? String(kind.default) : "";
		case "MultiSelect":
		case "TextList":
			return encodeList(kind.default);
	}
}

export function SourceSettingsForm({
	sourceId,
	sourceName,
	onBack,
}: {
	sourceId: string;
	sourceName: string;
	onBack: () => void;
}) {
	const { data, isPending, error } = useSourceSettings(sourceId);
	const { mutate: save, isPending: isSaving } = useSaveSourceSettings(sourceId);

	const [draft, setDraft] = useState<Record<string, string> | null>(null);

	const values = useMemo(() => {
		if (!data) return {};

		const base: Record<string, string> = {};
		for (const setting of data.schema) {
			base[setting.id] = data.values[setting.id] ?? defaultValue(setting.kind);
		}
		return base;
	}, [data]);

	const current = draft ?? values;
	const dirty =
		draft !== null && data
			? data.schema.some((s) => current[s.id] !== values[s.id])
			: false;

	const setValue = (id: string, value: string) =>
		setDraft({ ...current, [id]: value });

	return (
		<div className="flex h-full flex-col">
			<div className="mb-4 flex items-center gap-2">
				<Button onClick={onBack} size="icon" variant="ghost">
					<ArrowLeftIcon />
				</Button>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium">{sourceName}</p>
					<p className="text-muted-foreground text-xs">Source settings</p>
				</div>
			</div>

			{isPending && (
				<div className="space-y-4">
					{["a", "b", "c"].map((k) => (
						<Skeleton className="h-14" key={k} />
					))}
				</div>
			)}

			{error && <p className="text-destructive text-sm">{error.message}</p>}

			{data && data.schema.length === 0 && (
				<p className="py-10 text-center text-muted-foreground text-sm">
					This source has no configurable settings.
				</p>
			)}

			{data && data.schema.length > 0 && (
				<>
					<div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
						{data.schema.map((setting) => (
							<SettingField
								key={setting.id}
								onChange={(v) => setValue(setting.id, v)}
								setting={setting}
								value={current[setting.id] ?? ""}
							/>
						))}
					</div>

					<div className="mt-4 flex shrink-0 items-center gap-2 border-border border-t pt-4">
						<Button
							disabled={!dirty || isSaving}
							onClick={() =>
								save(current, {
									onSuccess: () => {
										setDraft(null);
										toast.success("Settings saved");
									},
									onError: (e) => toast.error(e.message),
								})
							}
						>
							{isSaving ? "Saving…" : "Save"}
						</Button>
						<Button
							disabled={!dirty || isSaving}
							onClick={() => setDraft(null)}
							variant="ghost"
						>
							Discard
						</Button>
					</div>
				</>
			)}
		</div>
	);
}

function SettingField({
	setting,
	value,
	onChange,
}: {
	setting: Setting;
	value: string;
	onChange: (value: string) => void;
}) {
	const { kind } = setting;

	const inline = kind.type === "Toggle";

	return (
		<div className={cn(inline && "flex items-center justify-between gap-6")}>
			<div className={cn(!inline && "mb-2", "min-w-0")}>
				<Label className="font-medium text-sm">{setting.label}</Label>
				{setting.description && (
					<p className="mt-0.5 text-muted-foreground text-xs">
						{setting.description}
					</p>
				)}
			</div>

			<Control kind={kind} onChange={onChange} value={value} />
		</div>
	);
}

function Control({
	kind,
	value,
	onChange,
}: {
	kind: SettingKind;
	value: string;
	onChange: (value: string) => void;
}) {
	switch (kind.type) {
		case "Text":
			return (
				<Input
					onChange={(e) => onChange(e.target.value)}
					placeholder={kind.placeholder ?? ""}
					type={kind.secret ? "password" : "text"}
					value={value}
				/>
			);

		case "Toggle":
			return (
				<Switch
					checked={value === "true"}
					onCheckedChange={(v) => onChange(String(v))}
				/>
			);

		case "Number":
			return (
				<Input
					max={kind.max ?? undefined}
					min={kind.min ?? undefined}
					onChange={(e) => onChange(e.target.value)}
					type="number"
					value={value}
				/>
			);

		case "Select":
			return (
				<Select onValueChange={(v) => onChange(v ?? "")} value={value}>
					<SelectTrigger>
						<SelectValue placeholder="Not set" />
					</SelectTrigger>
					<SelectContent>
						{kind.options.map((option) => (
							<SelectItem key={option.id} value={option.id}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);

		case "MultiSelect":
			return (
				<MultiSelectControl
					onChange={onChange}
					options={kind.options}
					value={value}
				/>
			);

		case "TextList":
			return (
				<TextListControl
					onChange={onChange}
					placeholder={kind.placeholder ?? "Type and press Enter"}
					value={value}
				/>
			);
	}
}

function MultiSelectControl({
	options,
	value,
	onChange,
}: {
	options: { id: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
}) {
	const [filter, setFilter] = useState("");
	const selected = decodeList(value);

	const visible = filter
		? options.filter((o) =>
				o.label.toLowerCase().includes(filter.toLowerCase()),
			)
		: options;

	const toggle = (id: string) => {
		const next = selected.includes(id)
			? selected.filter((v) => v !== id)
			: [...selected, id];
		onChange(encodeList(next));
	};

	return (
		<div className="rounded-md border border-border">
			{options.length > 8 && (
				<div className="relative border-border border-b">
					<MagnifyingGlassIcon
						className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
						size={14}
					/>
					<Input
						className="border-0 pl-9 focus-visible:ring-0"
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Filter…"
						value={filter}
					/>
				</div>
			)}

			<div className="max-h-56 space-y-1 overflow-y-auto p-2">
				{visible.map((option) => (
					// biome-ignore lint/a11y/noLabelWithoutControl: ignore
					<label
						className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
						key={option.id}
					>
						<Checkbox
							checked={selected.includes(option.id)}
							onCheckedChange={() => toggle(option.id)}
						/>
						{option.label}
					</label>
				))}

				{visible.length === 0 && (
					<p className="px-2 py-3 text-center text-muted-foreground text-xs">
						No matches
					</p>
				)}
			</div>

			{selected.length > 0 && (
				<div className="flex items-center justify-between border-border border-t px-3 py-2">
					<span className="text-muted-foreground text-xs">
						{selected.length} selected
					</span>
					<Button
						className="h-auto p-0 text-xs"
						onClick={() => onChange(encodeList([]))}
						variant="link"
					>
						Clear
					</Button>
				</div>
			)}
		</div>
	);
}

function TextListControl({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	const [entry, setEntry] = useState("");
	const items = decodeList(value);

	const add = () => {
		const trimmed = entry.trim();
		if (!trimmed || items.includes(trimmed)) {
			setEntry("");
			return;
		}
		onChange(encodeList([...items, trimmed]));
		setEntry("");
	};

	return (
		<div className="space-y-2">
			<Input
				onChange={(e) => setEntry(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						add();
					}
				}}
				placeholder={placeholder}
				value={entry}
			/>

			{items.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{items.map((item) => (
						<span
							className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground text-xs"
							key={item}
						>
							{item}
							<button
								aria-label={`Remove ${item}`}
								className="text-muted-foreground hover:text-foreground"
								onClick={() =>
									onChange(encodeList(items.filter((v) => v !== item)))
								}
								type="button"
							>
								<XIcon size={12} />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}
