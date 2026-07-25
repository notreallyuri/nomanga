import {
	CaretUpDownIcon,
	CheckIcon,
	MinusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/types/bindings";

/**
 * Searchable single-select. Renders a trigger showing the current label and a
 * popover with a filterable list. Selecting the active option again clears it.
 */
export function SearchableSelect({
	options,
	value,
	placeholder = "Any",
	onChange,
}: {
	options: SelectOption[];
	value: string | undefined;
	placeholder?: string;
	onChange: (value: string | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const selected = options.find((o) => o.id === value);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button
						className="w-full justify-between font-normal normal-case tracking-normal"
						variant="outline"
					/>
				}
			>
				<span className={cn("truncate", !selected && "text-muted-foreground")}>
					{selected?.label ?? placeholder}
				</span>
				<CaretUpDownIcon className="opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-(--anchor-width) gap-0 p-0"
				initialFocus={inputRef}
			>
				<Command>
					<CommandInput placeholder="Search…" ref={inputRef} />
					<CommandList>
						<CommandEmpty>No results.</CommandEmpty>
						{options.map((option) => (
							<CommandItem
								data-checked={option.id === value}
								key={option.id}
								onSelect={() => {
									onChange(option.id === value ? undefined : option.id);
									setOpen(false);
								}}
								value={option.label}
							>
								{option.label}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

type TriState = "neutral" | "included" | "excluded";

/**
 * Searchable multi-select with optional tri-state exclusion. Selecting an option
 * cycles neutral → included → (excluded →) neutral, mirroring the pill control.
 * Chosen options are shown as removable chips above the trigger.
 */
export function SearchableMultiSelect({
	options,
	included,
	excluded,
	supportsExclusion,
	onChange,
}: {
	options: SelectOption[];
	included: string[];
	excluded: string[];
	supportsExclusion: boolean;
	onChange: (next: { included: string[]; excluded: string[] }) => void;
}) {
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const stateOf = (id: string): TriState => {
		if (included.includes(id)) return "included";
		if (excluded.includes(id)) return "excluded";
		return "neutral";
	};

	const cycle = (id: string) => {
		const state = stateOf(id);
		const nextIncluded = included.filter((x) => x !== id);
		const nextExcluded = excluded.filter((x) => x !== id);

		if (state === "neutral") {
			nextIncluded.push(id);
		} else if (state === "included" && supportsExclusion) {
			nextExcluded.push(id);
		}
		// "included" without exclusion support, or "excluded", falls through to
		// neutral — nothing pushed.

		onChange({ included: nextIncluded, excluded: nextExcluded });
	};

	const chips = [
		...included.map((id) => ({ id, state: "included" as const })),
		...excluded.map((id) => ({ id, state: "excluded" as const })),
	];
	const labelFor = (id: string) =>
		options.find((o) => o.id === id)?.label ?? id;

	return (
		<div className="space-y-1.5">
			{chips.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{chips.map(({ id, state }) => (
						<button
							className={cn(
								"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
								state === "included" &&
									"border-primary bg-primary text-primary-foreground",
								state === "excluded" &&
									"border-destructive bg-destructive/10 text-destructive line-through",
							)}
							key={id}
							onClick={() => {
								onChange({
									included: included.filter((x) => x !== id),
									excluded: excluded.filter((x) => x !== id),
								});
							}}
							type="button"
						>
							{state === "excluded" && <MinusIcon size={10} weight="bold" />}
							{labelFor(id)}
							<XIcon size={10} weight="bold" />
						</button>
					))}
				</div>
			)}

			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger
					render={
						<Button
							className="w-full justify-between font-normal normal-case tracking-normal"
							variant="outline"
						/>
					}
				>
					<span className="text-muted-foreground">
						{chips.length > 0 ? `${chips.length} selected` : "Select…"}
					</span>
					<CaretUpDownIcon className="opacity-50" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--anchor-width) gap-0 p-0"
					initialFocus={inputRef}
				>
					<Command>
						<CommandInput placeholder="Search…" ref={inputRef} />
						<CommandList>
							<CommandEmpty>No results.</CommandEmpty>
							{options.map((option) => {
								const state = stateOf(option.id);

								return (
									<CommandItem
										key={option.id}
										onSelect={() => cycle(option.id)}
										value={option.label}
									>
										<span
											className={cn(
												"flex size-4 items-center justify-center rounded-sm border",
												state === "included" &&
													"border-primary bg-primary text-primary-foreground",
												state === "excluded" &&
													"border-destructive bg-destructive/10 text-destructive",
												state === "neutral" && "border-border",
											)}
										>
											{state === "included" && (
												<CheckIcon size={12} weight="bold" />
											)}
											{state === "excluded" && (
												<MinusIcon size={12} weight="bold" />
											)}
										</span>
										{option.label}
									</CommandItem>
								);
							})}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
