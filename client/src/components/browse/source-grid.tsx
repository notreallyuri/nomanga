import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowsDownUpIcon,
	CaretRightIcon,
	DotsSixVerticalIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useSettingsUI } from "@/components/settings/context";
import { SourceIcon } from "@/components/source-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExtensions } from "@/hooks/services/use-extensions";
import { useSourceOrder } from "@/hooks/services/use-settings";
import { applySourceOrder, mergeSourceOrder } from "@/lib/source-order";
import { cn } from "@/lib/utils";
import type {
	InstalledExtension,
	SourceInfo,
	SourceWithPreference,
} from "@/types/bindings";
import { PinToggle } from "./pin-toggle";
import { SourceMenuContent } from "./source-menu";

export function SourceGrid({ rows }: { rows: SourceWithPreference[] }) {
	const { order, setOrder } = useSourceOrder();
	const extensions = useExtensions();

	// Ordered across everything installed, then filtered — not the other way
	// round. A disabled source has to keep its slot in the stored order so
	// enabling it again puts it back where it was.
	const installed = applySourceOrder(
		rows,
		order,
		(row) => row.info.id,
		(row) => row.info.name,
	);

	const visible = installed.filter((row) => row.preference.enabled);
	const hiddenCount = installed.length - visible.length;

	const installedIds = installed.map((row) => row.info.id);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const dragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const ids = visible.map((row) => row.info.id);
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) return;

		setOrder(mergeSourceOrder(installedIds, arrayMove(ids, from, to)));
	};

	const sortByName = () =>
		setOrder(
			[...installed]
				.sort((a, b) => a.info.name.localeCompare(b.info.name))
				.map((row) => row.info.id),
		);

	const groupByExtension = () =>
		setOrder(byExtension(installedIds, extensions.data ?? []));

	return (
		<>
			<div className="mb-3 flex items-baseline justify-between gap-4">
				<h2 className="font-heading font-semibold text-muted-foreground text-sm uppercase tracking-wide">
					Sources
				</h2>

				<div className="flex items-baseline gap-3">
					{hiddenCount > 0 && (
						<p className="text-muted-foreground text-xs">
							{hiddenCount} hidden
						</p>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button size="sm" variant="ghost">
									<ArrowsDownUpIcon />
									Order
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={sortByName}>Sort A–Z</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!extensions.data}
								onClick={groupByExtension}
							>
								Group by extension
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{/* Clearing is not the same as sorting A–Z, even though both
							    look alphabetical right now: with nothing stored, a source
							    installed later sorts into place by name instead of landing
							    at the end of a list that predates it. */}
							<DropdownMenuItem onClick={() => setOrder([])}>
								Reset to default
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<DndContext
				collisionDetection={closestCenter}
				modifiers={[restrictToParentElement]}
				onDragEnd={dragEnd}
				sensors={sensors}
			>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
					<SortableContext
						items={visible.map((row) => row.info.id)}
						strategy={rectSortingStrategy}
					>
						{visible.map(({ info }) => (
							<SourceCard info={info} key={info.id} />
						))}
					</SortableContext>

					<AddMoreCard />
				</div>
			</DndContext>
		</>
	);
}

/**
 * Extensions by name, then each one's sources by name. Any installed source the
 * extension list does not account for keeps its current position at the end,
 * so a partially loaded list cannot drop ids from the order it writes.
 */
function byExtension(
	installedIds: string[],
	extensions: InstalledExtension[],
): string[] {
	const known = new Set(installedIds);

	const grouped = [...extensions]
		.sort((a, b) => a.info.name.localeCompare(b.info.name))
		.flatMap((extension) =>
			[...extension.sources]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((source) => source.id)
				.filter((id) => known.has(id)),
		);

	const placed = new Set(grouped);

	return [...grouped, ...installedIds.filter((id) => !placed.has(id))];
}

function SourceCard({ info }: { info: SourceInfo }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: info.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			className={cn("group/card relative", isDragging && "z-10 opacity-80")}
			ref={setNodeRef}
			style={style}
		>
			<ContextMenu>
				<ContextMenuTrigger
					render={
						<Link
							className="group flex items-center gap-3 rounded-lg border border-border bg-card py-3 pr-3 pl-8 transition-colors hover:border-foreground/20 hover:bg-muted"
							params={{ sourceId: info.id }}
							to="/browse/$sourceId"
						>
							<SourceIcon
								className="size-10 shrink-0"
								name={info.name}
								url={info.icon_url}
							/>

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<p className="truncate font-medium">{info.name}</p>
									{info.nsfw && (
										<Badge className="shrink-0" variant="destructive">
											18+
										</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									{info.language}
								</p>
							</div>

							<PinToggle sourceId={info.id} />

							<CaretRightIcon
								className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
								size={16}
							/>
						</Link>
					}
				/>

				<SourceMenuContent info={info} />
			</ContextMenu>

			{/*
			 * A handle rather than a draggable card, because the card is a link and
			 * making the whole thing a drag target costs a plain click on it. It
			 * sits beside the link and overlaps its left padding instead of inside
			 * it: a button nested in an anchor is invalid, and the drag would have
			 * to fight the link for the same pointer events.
			 */}
			<button
				aria-label={`Reorder ${info.name}`}
				className="absolute inset-y-0 left-1 flex w-6 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover/card:opacity-100"
				type="button"
				{...attributes}
				{...listeners}
			>
				<DotsSixVerticalIcon size={16} />
			</button>
		</div>
	);
}

/**
 * Sends the user to the Extensions tab of the settings dialog, where sources
 * are installed — so the grid always offers a way to add to it.
 */
function AddMoreCard() {
	const { openSettings } = useSettingsUI();

	return (
		<button
			className="group flex items-center gap-3 rounded-lg border border-border border-dashed p-3 text-left text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
			onClick={() => openSettings("Extensions")}
			type="button"
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted transition-colors group-hover:bg-background">
				<PlusIcon size={20} />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">Add more</p>
				<p className="text-xs">Install extensions</p>
			</div>
		</button>
	);
}
