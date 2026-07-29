import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Filter, FilterValue } from "@/types/bindings";
import { SearchableMultiSelect, SearchableSelect } from "./searchable-select";

const SEARCH_THRESHOLD = 12;

const optionLabels = (options: { id: string; label: string }[]) =>
	Object.fromEntries(options.map((option) => [option.id, option.label]));

interface Props {
	filters: Filter[];
	values: FilterValue[];
	onChange: (values: FilterValue[]) => void;
}

export function FilterPanel({ filters, values, onChange }: Props) {
	const valueFor = (id: string) => values.find((v) => v.id === id);

	const setValue = (next: FilterValue) => {
		const rest = values.filter((v) => v.id !== next.id);
		onChange([...rest, next]);
	};

	const clearValue = (id: string) => {
		onChange(values.filter((v) => v.id !== id));
	};

	return (
		<div className="space-y-5">
			{filters.map((filter) => (
				<FilterControl
					clearValue={clearValue}
					filter={filter}
					key={filter.id}
					setValue={setValue}
					value={valueFor(filter.id)}
				/>
			))}

			{values.length > 0 && (
				<Button onClick={() => onChange([])} size="sm" variant="ghost">
					Clear all filters
				</Button>
			)}
		</div>
	);
}

function FilterControl({
	filter,
	value,
	setValue,
	clearValue,
}: {
	filter: Filter;
	value: FilterValue | undefined;
	setValue: (value: FilterValue) => void;
	clearValue: (id: string) => void;
}) {
	switch (filter.type) {
		case "Sort": {
			const current = value?.type === "Sort" ? value : undefined;

			return (
				<div>
					<Label className="mb-1.5 block text-sm">{filter.label}</Label>
					<div className="flex gap-2">
						<Select
							items={optionLabels(filter.options)}
							onValueChange={(v) =>
								setValue({
									type: "Sort",
									id: filter.id,
									value: v ?? "",
									reversed: current?.reversed ?? false,
								})
							}
							value={current?.value ?? filter.default ?? ""}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder="Default" />
							</SelectTrigger>
							<SelectContent>
								{filter.options.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{filter.can_reverse && (
							<Button
								onClick={() =>
									setValue({
										type: "Sort",
										id: filter.id,
										value: current?.value ?? filter.default ?? "",
										reversed: !current?.reversed,
									})
								}
								size="icon"
								variant="outline"
							>
								{current?.reversed ? <ArrowUpIcon /> : <ArrowDownIcon />}
							</Button>
						)}
					</div>
				</div>
			);
		}

		case "Select": {
			const current = value?.type === "Select" ? value.value : undefined;

			if (filter.options.length > SEARCH_THRESHOLD) {
				return (
					<div>
						<Label className="mb-1.5 block text-sm">{filter.label}</Label>
						<SearchableSelect
							onChange={(v) =>
								v === undefined
									? clearValue(filter.id)
									: setValue({ type: "Select", id: filter.id, value: v })
							}
							options={filter.options}
							value={current ?? filter.default ?? undefined}
						/>
					</div>
				);
			}

			return (
				<div>
					<Label className="mb-1.5 block text-sm">{filter.label}</Label>
					<Select
						items={optionLabels(filter.options)}
						onValueChange={(v) =>
							setValue({ type: "Select", id: filter.id, value: v ?? "" })
						}
						value={current ?? filter.default ?? ""}
					>
						<SelectTrigger>
							<SelectValue placeholder="Any" />
						</SelectTrigger>
						<SelectContent>
							{filter.options.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			);
		}

		case "Toggle": {
			const current = value?.type === "Toggle" ? value.value : filter.default;

			return (
				<div className="flex items-center justify-between">
					<Label className="text-sm">{filter.label}</Label>
					<Switch
						checked={current ?? false}
						onCheckedChange={(v) =>
							setValue({ type: "Toggle", id: filter.id, value: v })
						}
					/>
				</div>
			);
		}

		case "Text": {
			const current = value?.type === "Text" ? value.value : "";

			return (
				<div>
					<Label className="mb-1.5 block text-sm">{filter.label}</Label>
					<Input
						onChange={(e) =>
							e.target.value
								? setValue({
										type: "Text",
										id: filter.id,
										value: e.target.value,
									})
								: clearValue(filter.id)
						}
						placeholder={filter.placeholder ?? ""}
						value={current}
					/>
				</div>
			);
		}

		case "MultiSelect": {
			const current =
				value?.type === "MultiSelect"
					? value
					: {
							type: "MultiSelect" as const,
							id: filter.id,
							included: [],
							excluded: [],
						};

			if (filter.options.length > SEARCH_THRESHOLD) {
				return (
					<div>
						<Label className="mb-1.5 block text-sm">{filter.label}</Label>
						<SearchableMultiSelect
							excluded={current.excluded}
							included={current.included}
							onChange={({ included, excluded }) =>
								setValue({
									type: "MultiSelect",
									id: filter.id,
									included,
									excluded,
								})
							}
							options={filter.options}
							supportsExclusion={filter.supports_exclusion}
						/>
					</div>
				);
			}

			return (
				<MultiSelectControl
					filter={filter}
					setValue={setValue}
					value={current}
				/>
			);
		}
	}
}

type MultiSelectFilter = Extract<Filter, { type: "MultiSelect" }>;
type MultiSelectValue = Extract<FilterValue, { type: "MultiSelect" }>;

function MultiSelectControl({
	filter,
	value,
	setValue,
}: {
	filter: MultiSelectFilter;
	value: MultiSelectValue;
	setValue: (value: FilterValue) => void;
}) {
	const stateOf = (id: string): "neutral" | "included" | "excluded" => {
		if (value.included.includes(id)) return "included";
		if (value.excluded.includes(id)) return "excluded";
		return "neutral";
	};

	const cycle = (id: string) => {
		const state = stateOf(id);
		const included = value.included.filter((x) => x !== id);
		const excluded = value.excluded.filter((x) => x !== id);

		if (state === "neutral") {
			included.push(id);
		} else if (state === "included" && filter.supports_exclusion) {
			excluded.push(id);
		}

		setValue({ type: "MultiSelect", id: filter.id, included, excluded });
	};

	return (
		<div>
			<Label className="mb-1.5 block text-sm">{filter.label}</Label>
			<div className="flex flex-wrap gap-1.5">
				{filter.options.map((option) => {
					const state = stateOf(option.id);

					return (
						<button
							className={cn(
								"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
								state === "neutral" &&
									"border-border text-muted-foreground hover:border-foreground/40",
								state === "included" &&
									"border-primary bg-primary text-primary-foreground",
								state === "excluded" &&
									"border-destructive bg-destructive/10 text-destructive line-through",
							)}
							key={option.id}
							onClick={() => cycle(option.id)}
							type="button"
						>
							{state === "excluded" && <MinusIcon size={10} weight="bold" />}
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
