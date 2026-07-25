import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	useBulkCategoryCounts,
	useBulkUpdateCategories,
	useCategories,
} from "@/hooks/services/use-library";
import { categoryIcon } from "@/lib/category-visuals";
import { cn } from "@/lib/utils";
import type { EntryRef, LibraryItem } from "@/types/bindings";

/** neutral = leave every entry as it is; add/remove apply to all of them. */
type Action = "add" | "remove";

export function BulkCategoriesDialog({
	items,
	open,
	onOpenChange,
	onApplied,
}: {
	items: LibraryItem[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApplied: () => void;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				{/* Remounted per selection so the action state starts clean and the
				    counts are seeded from the right entries. */}
				{open && items.length > 0 && (
					<Body items={items} onApplied={onApplied} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function Body({
	items,
	onApplied,
}: {
	items: LibraryItem[];
	onApplied: () => void;
}) {
	const entries = useMemo<EntryRef[]>(
		() => items.map((i) => ({ source_id: i.source_id, manga_id: i.manga_id })),
		[items],
	);

	const categories = useCategories();
	const counts = useBulkCategoryCounts(entries);
	const apply = useBulkUpdateCategories();

	const [actions, setActions] = useState<Map<string, Action>>(new Map());

	const countFor = (categoryId: string) =>
		counts.data?.find((c) => c.category_id === categoryId)?.count ?? 0;

	// neutral → add → remove → neutral
	const cycle = (categoryId: string) =>
		setActions((prev) => {
			const next = new Map(prev);
			const current = next.get(categoryId);
			if (current === undefined) next.set(categoryId, "add");
			else if (current === "add") next.set(categoryId, "remove");
			else next.delete(categoryId);
			return next;
		});

	const add = [...actions].filter(([, a]) => a === "add").map(([id]) => id);
	const remove = [...actions]
		.filter(([, a]) => a === "remove")
		.map(([id]) => id);
	const dirty = add.length > 0 || remove.length > 0;

	const submit = () =>
		apply.mutate(
			{ entries, add, remove },
			{
				onSuccess: () => {
					toast.success(`Updated ${items.length} series`);
					onApplied();
				},
				onError: (e) => toast.error(e.message),
			},
		);

	return (
		<>
			<DialogHeader>
				<DialogTitle>Manage categories</DialogTitle>
				<DialogDescription>
					Changes apply to all {items.length} selected series.
				</DialogDescription>
			</DialogHeader>

			{categories.data?.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No categories yet. Create one from “Manage categories”.
				</p>
			) : (
				<div className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
					{categories.data?.map((category) => {
						const Icon = categoryIcon(category.icon);
						const action = actions.get(category.id);
						const inCount = countFor(category.id);

						return (
							<button
								className="flex w-full items-center gap-2.5 rounded-md py-1.5 pr-1 pl-1 text-left text-sm hover:bg-accent"
								key={category.id}
								onClick={() => cycle(category.id)}
								type="button"
							>
								{Icon && (
									<Icon
										size={16}
										style={{ color: category.color ?? undefined }}
										weight="fill"
									/>
								)}
								<span className="flex-1 truncate">{category.name}</span>

								{/* Current membership across the selection, so the user knows
								    what a change would actually do. */}
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{inCount}/{items.length}
								</span>

								<ActionPill action={action} />
							</button>
						);
					})}
				</div>
			)}

			<DialogFooter>
				<DialogClose render={<Button variant="ghost">Cancel</Button>} />
				<Button disabled={!dirty || apply.isPending} onClick={submit}>
					Apply
				</Button>
			</DialogFooter>
		</>
	);
}

function ActionPill({ action }: { action: Action | undefined }) {
	return (
		<span
			className={cn(
				"inline-flex w-20 shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs",
				action === undefined && "border-border text-muted-foreground",
				action === "add" && "border-primary bg-primary text-primary-foreground",
				action === "remove" &&
					"border-destructive bg-destructive/10 text-destructive",
			)}
		>
			{action === "add" && (
				<>
					<PlusIcon size={11} weight="bold" /> Add
				</>
			)}
			{action === "remove" && (
				<>
					<MinusIcon size={11} weight="bold" /> Remove
				</>
			)}
			{action === undefined && "Leave"}
		</span>
	);
}
