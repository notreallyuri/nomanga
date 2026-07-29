import { useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	useMangaReaderOverride,
	useSetMangaReaderOverride,
	useSetSourceReaderOverride,
	useSourceReaderOverride,
} from "@/hooks/services/use-settings";
import type { ReaderOverride } from "@/types/bindings";

const INHERIT = "inherit";

const FIELDS = [
	{
		key: "page_layout",
		label: "Page layout",
		options: [
			{ label: "Single page", value: "SinglePage" },
			{ label: "Double page", value: "DoublePage" },
			{ label: "Vertical scroll", value: "VerticalScroll" },
		],
	},
	{
		key: "reading_direction",
		label: "Reading direction",
		options: [
			{ label: "Left to right", value: "LeftToRight" },
			{ label: "Right to left", value: "RightToLeft" },
		],
	},
	{
		key: "zoom_behavior",
		label: "Zoom",
		options: [
			{ label: "Fit width", value: "FitWidth" },
			{ label: "Fit height", value: "FitHeight" },
			{ label: "Actual size", value: "ActualSize" },
			{ label: "Manual", value: "Manual" },
		],
	},
] as const;

const FIELD_ITEMS: Record<string, Record<string, string>> = Object.fromEntries(
	FIELDS.map((field) => [
		field.key,
		{
			[INHERIT]: "Inherit",
			...Object.fromEntries(field.options.map((o) => [o.value, o.label])),
		},
	]),
);

export function ReaderOverrideDialog({
	sourceId,
	mangaId,
	open,
	onOpenChange,
}: {
	sourceId: string;
	mangaId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [level, setLevel] = useState<"manga" | "source">("manga");

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reader settings</DialogTitle>
					<DialogDescription>
						Override the global defaults for this title or source. “Inherit”
						falls back to the level above (source, then global).
					</DialogDescription>
				</DialogHeader>

				<Tabs
					onValueChange={(v) => setLevel(v as "manga" | "source")}
					value={level}
				>
					<TabsList className="w-full" variant="line">
						<TabsTrigger value="manga">This title</TabsTrigger>
						<TabsTrigger value="source">Whole source</TabsTrigger>
					</TabsList>
				</Tabs>

				{level === "manga" ? (
					<MangaPanel mangaId={mangaId} sourceId={sourceId} />
				) : (
					<SourcePanel sourceId={sourceId} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function MangaPanel({
	sourceId,
	mangaId,
}: {
	sourceId: string;
	mangaId: string;
}) {
	const query = useMangaReaderOverride(sourceId, mangaId);
	const mutation = useSetMangaReaderOverride(sourceId, mangaId);
	return <Panel mutation={mutation} query={query} />;
}

function SourcePanel({ sourceId }: { sourceId: string }) {
	const query = useSourceReaderOverride(sourceId);
	const mutation = useSetSourceReaderOverride(sourceId);
	return <Panel mutation={mutation} query={query} />;
}

function Panel({
	query,
	mutation,
}: {
	query:
		| ReturnType<typeof useMangaReaderOverride>
		| ReturnType<typeof useSourceReaderOverride>;
	mutation:
		| ReturnType<typeof useSetMangaReaderOverride>
		| ReturnType<typeof useSetSourceReaderOverride>;
}) {
	if (query.isPending) {
		return (
			<div className="space-y-3 py-1">
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
		);
	}

	return (
		<Form
			initial={query.data ?? {}}
			onChange={(over) =>
				mutation.mutate(over, { onError: (e) => toast.error(e.message) })
			}
		/>
	);
}

function Form({
	initial,
	onChange,
}: {
	initial: ReaderOverride;
	onChange: (over: ReaderOverride) => void;
}) {
	const [over, setOver] = useState<ReaderOverride>(initial);

	const set = (key: keyof ReaderOverride, value: string) => {
		const next = { ...over, [key]: value === INHERIT ? null : value };
		setOver(next);
		onChange(next);
	};

	return (
		<div className="space-y-3 py-1">
			{FIELDS.map((field) => (
				<div
					className="flex items-center justify-between gap-4"
					key={field.key}
				>
					<Label>{field.label}</Label>
					<Select
						items={FIELD_ITEMS[field.key]}
						onValueChange={(v) => set(field.key, (v as string) ?? INHERIT)}
						value={over[field.key] ?? INHERIT}
					>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={INHERIT}>Inherit</SelectItem>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			))}
		</div>
	);
}
