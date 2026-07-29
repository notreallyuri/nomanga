import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	useCategories,
	useEntryCategories,
	useSetEntryCategories,
} from "@/hooks/services/use-library";
import type { LibraryItem } from "@/types/bindings";

export function EditCategoriesDialog({
	item,
	onClose,
}: {
	item: LibraryItem | null;
	onClose: () => void;
}) {
	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={item !== null}>
			<DialogContent>
				{item && (
					<Body item={item} key={`${item.source_id}/${item.manga_id}`} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function Body({ item }: { item: LibraryItem }) {
	const categories = useCategories();
	const assigned = useEntryCategories(item.source_id, item.manga_id);
	const save = useSetEntryCategories(item.source_id, item.manga_id);

	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (assigned.data) setSelected(new Set(assigned.data));
	}, [assigned.data]);

	const toggle = (id: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});

	return (
		<>
			<DialogHeader>
				<DialogTitle>Edit categories</DialogTitle>
				<DialogDescription className="line-clamp-1">
					{item.title}
				</DialogDescription>
			</DialogHeader>

			{categories.data?.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No categories yet. Create one from “Manage categories”.
				</p>
			) : (
				<div className="max-h-72 space-y-1 overflow-y-auto">
					{categories.data?.map((category) => (
						<Label
							className="flex cursor-pointer items-center gap-3 py-1.5 font-normal text-sm"
							key={category.id}
						>
							<Checkbox
								checked={selected.has(category.id)}
								onCheckedChange={(on) => toggle(category.id, on === true)}
							/>
							{category.name}
						</Label>
					))}
				</div>
			)}

			<DialogFooter>
				<DialogClose render={<Button variant="ghost">Cancel</Button>} />
				<DialogClose
					render={
						<Button
							disabled={save.isPending || !assigned.isSuccess}
							onClick={() =>
								save.mutate([...selected], {
									onError: (e) => toast.error(e.message),
								})
							}
						>
							Save
						</Button>
					}
				/>
			</DialogFooter>
		</>
	);
}
