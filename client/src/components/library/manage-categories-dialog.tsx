import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	BellSlashIcon,
	CheckIcon,
	DotsSixVerticalIcon,
	EyeSlashIcon,
	LockKeyIcon,
	PencilSimpleIcon,
	PlusIcon,
	SlidersHorizontalIcon,
	StarIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	useCategories,
	useCreateCategory,
	useDeleteCategory,
	useLibraryLockIsSet,
	useRenameCategory,
	useReorderCategories,
	useUpdateCategoryOptions,
} from "@/hooks/services/use-library";
import {
	CATEGORY_COLORS,
	CATEGORY_ICON_KEYS,
	CATEGORY_ICONS,
	categoryIcon,
} from "@/lib/category-visuals";
import { cn } from "@/lib/utils";
import type { Category, CategoryOptions, CategorySort } from "@/types/bindings";

export function ManageCategoriesDialog({ trigger }: { trigger: ReactElement }) {
	const categories = useCategories();
	const reorder = useReorderCategories();

	const [items, setItems] = useState<Category[]>([]);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		if (!dragging) setItems(categories.data ?? []);
	}, [categories.data, dragging]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const dragEnd = (event: DragEndEvent) => {
		setDragging(false);
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const from = items.findIndex((c) => c.id === active.id);
		const to = items.findIndex((c) => c.id === over.id);
		if (from === -1 || to === -1) return;

		const next = arrayMove(items, from, to);
		setItems(next);
		reorder.mutate(next.map((c) => c.id));
	};

	return (
		<Dialog>
			<DialogTrigger render={trigger} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Manage categories</DialogTitle>
					<DialogDescription>
						Group your library into shelves. Drag to set the tab order.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1">
					{items.length === 0 && (
						<p className="py-2 text-muted-foreground text-sm">
							No categories yet.
						</p>
					)}

					<DndContext
						collisionDetection={closestCenter}
						modifiers={[restrictToVerticalAxis, restrictToParentElement]}
						onDragEnd={dragEnd}
						onDragStart={() => setDragging(true)}
						sensors={sensors}
					>
						<SortableContext
							items={items.map((c) => c.id)}
							strategy={verticalListSortingStrategy}
						>
							{items.map((category) => (
								<CategoryRow category={category} key={category.id} />
							))}
						</SortableContext>
					</DndContext>
				</div>

				<CreateRow />
			</DialogContent>
		</Dialog>
	);
}

function CategoryRow({ category }: { category: Category }) {
	const rename = useRenameCategory();
	const remove = useDeleteCategory();

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: category.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(category.name);

	const commit = () => {
		const name = draft.trim();
		if (!name || name === category.name) {
			setEditing(false);
			setDraft(category.name);
			return;
		}
		rename.mutate(
			{ categoryId: category.id, name },
			{
				onSuccess: () => setEditing(false),
				onError: (e) => toast.error(e.message),
			},
		);
	};

	if (editing) {
		return (
			<div className="flex items-center gap-1.5" ref={setNodeRef} style={style}>
				<Input
					autoFocus
					className="h-8"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							setEditing(false);
							setDraft(category.name);
						}
					}}
					value={draft}
				/>
				<Button onClick={commit} size="icon-sm" variant="ghost">
					<CheckIcon />
				</Button>
				<Button
					onClick={() => {
						setEditing(false);
						setDraft(category.name);
					}}
					size="icon-sm"
					variant="ghost"
				>
					<XIcon />
				</Button>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-md",
				isDragging && "relative z-10 bg-background opacity-80 shadow-sm",
			)}
			ref={setNodeRef}
			style={style}
		>
			<button
				className="shrink-0 cursor-grab touch-none rounded-sm text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
				type="button"
				{...attributes}
				{...listeners}
			>
				<DotsSixVerticalIcon size={16} />
				<span className="sr-only">Drag to reorder {category.name}</span>
			</button>
			<CategoryBadge category={category} />
			<span className="flex-1 truncate text-sm">{category.name}</span>

			{category.is_default && (
				<StarIcon
					className="shrink-0 text-muted-foreground"
					size={14}
					weight="fill"
				/>
			)}
			{category.hidden && (
				<EyeSlashIcon className="shrink-0 text-muted-foreground" size={14} />
			)}
			{category.locked && (
				<LockKeyIcon className="shrink-0 text-muted-foreground" size={14} />
			)}
			{category.skip_updates && (
				<BellSlashIcon className="shrink-0 text-muted-foreground" size={14} />
			)}

			<CategoryOptionsPopover category={category} />
			<Button onClick={() => setEditing(true)} size="icon-sm" variant="ghost">
				<PencilSimpleIcon />
			</Button>
			<Button
				className="text-destructive"
				onClick={() => remove.mutate(category.id)}
				size="icon-sm"
				variant="ghost"
			>
				<TrashIcon />
			</Button>
		</div>
	);
}

const SORT_LABELS: Record<CategorySort, string> = {
	added: "Recently added",
	title: "Title (A–Z)",
	unread: "Most unread",
};

function CategoryBadge({ category }: { category: Category }) {
	const Icon = categoryIcon(category.icon);
	const color = category.color ?? undefined;

	if (Icon) {
		return (
			<Icon className="shrink-0" size={16} style={{ color }} weight="fill" />
		);
	}
	if (color) {
		return (
			<span
				className="size-2.5 shrink-0 rounded-full"
				style={{ backgroundColor: color }}
			/>
		);
	}
	return null;
}

function optionsOf(c: Category): CategoryOptions {
	return {
		hidden: c.hidden,
		locked: c.locked,
		is_default: c.is_default,
		skip_updates: c.skip_updates,
		sort_mode: c.sort_mode,
		color: c.color,
		icon: c.icon,
	};
}

function LockRow({
	category,
	onApply,
}: {
	category: Category;
	onApply: (patch: Partial<CategoryOptions>) => void;
}) {
	const lockIsSet = useLibraryLockIsSet();
	const hasPassword = lockIsSet.data === true;

	return (
		<div className="flex items-center justify-between gap-4">
			<Label className="flex flex-col gap-0.5">
				<span>Locked</span>
				<span className="font-normal text-muted-foreground text-xs">
					{hasPassword
						? "Ask for the library password before opening it."
						: "Set a library password in Settings → System first."}
				</span>
			</Label>
			<Switch
				checked={category.locked}
				disabled={!hasPassword}
				onCheckedChange={(locked) => onApply({ locked })}
			/>
		</div>
	);
}

function CategoryOptionsPopover({ category }: { category: Category }) {
	const update = useUpdateCategoryOptions();

	const apply = (patch: Partial<CategoryOptions>) => {
		update.mutate(
			{
				categoryId: category.id,
				options: { ...optionsOf(category), ...patch },
			},
			{ onError: (e) => toast.error(e.message) },
		);
	};

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button size="icon-sm" variant="ghost">
						<SlidersHorizontalIcon />
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-72 gap-4">
				<div className="flex items-center justify-between gap-4">
					<Label className="flex flex-col gap-0.5">
						<span>Private</span>
						<span className="font-normal text-muted-foreground text-xs">
							Hide its contents from the All tab.
						</span>
					</Label>
					<Switch
						checked={category.hidden}
						onCheckedChange={(hidden) => apply({ hidden })}
					/>
				</div>

				<LockRow category={category} onApply={apply} />

				<div className="flex items-center justify-between gap-4">
					<Label className="flex flex-col gap-0.5">
						<span>Default</span>
						<span className="font-normal text-muted-foreground text-xs">
							New additions join this category.
						</span>
					</Label>
					<Switch
						checked={category.is_default}
						onCheckedChange={(is_default) => apply({ is_default })}
					/>
				</div>

				<div className="flex items-center justify-between gap-4">
					<Label className="flex flex-col gap-0.5">
						<span>Skip updates</span>
						<span className="font-normal text-muted-foreground text-xs">
							Leave its series out of update checks, unless they are also in a
							category that is not skipped.
						</span>
					</Label>
					<Switch
						checked={category.skip_updates}
						onCheckedChange={(skip_updates) => apply({ skip_updates })}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Sort by</Label>
					<Select
						items={Object.entries(SORT_LABELS).map(([value, label]) => ({
							value,
							label,
						}))}
						onValueChange={(value) =>
							apply({ sort_mode: value as CategorySort })
						}
						value={category.sort_mode}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(Object.keys(SORT_LABELS) as CategorySort[]).map((value) => (
								<SelectItem key={value} value={value}>
									{SORT_LABELS[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Accent colour</Label>
					<div className="flex flex-wrap gap-1.5">
						<button
							aria-label="No colour"
							className={cn(
								"flex size-6 items-center justify-center rounded-full border border-input text-muted-foreground",
								!category.color && "ring-2 ring-ring ring-offset-1",
							)}
							onClick={() => apply({ color: null })}
							type="button"
						>
							<XIcon size={12} />
						</button>
						{CATEGORY_COLORS.map((color) => (
							<button
								aria-label={color}
								className={cn(
									"size-6 rounded-full",
									category.color === color && "ring-2 ring-ring ring-offset-1",
								)}
								key={color}
								onClick={() => apply({ color })}
								style={{ backgroundColor: color }}
								type="button"
							/>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Icon</Label>
					<div className="flex flex-wrap gap-1">
						<button
							aria-label="No icon"
							className={cn(
								"flex size-7 items-center justify-center rounded-md border border-input text-muted-foreground",
								!category.icon && "border-ring bg-accent",
							)}
							onClick={() => apply({ icon: null })}
							type="button"
						>
							<XIcon size={14} />
						</button>
						{CATEGORY_ICON_KEYS.map((key) => {
							const Icon = CATEGORY_ICONS[key];
							return (
								<button
									aria-label={key}
									className={cn(
										"flex size-7 items-center justify-center rounded-md border border-transparent hover:bg-accent",
										category.icon === key && "border-ring bg-accent",
									)}
									key={key}
									onClick={() => apply({ icon: key })}
									type="button"
								>
									<Icon size={16} />
								</button>
							);
						})}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function CreateRow() {
	const create = useCreateCategory();
	const [name, setName] = useState("");

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		create.mutate(trimmed, {
			onSuccess: () => setName(""),
			onError: (e) => toast.error(e.message),
		});
	};

	return (
		<div className="flex items-center gap-1.5 border-border border-t pt-3">
			<Input
				className="h-8"
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => e.key === "Enter" && submit()}
				placeholder="New category…"
				value={name}
			/>
			<Button
				disabled={!name.trim() || create.isPending}
				onClick={submit}
				size="sm"
			>
				<PlusIcon />
				Add
			</Button>
		</div>
	);
}
