import { BookmarkSimpleIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	useCategories,
	useEntryCategories,
	useIsInLibrary,
	useSetEntryCategories,
	useToggleLibrary,
} from "@/hooks/services/use-library";
import { categoryIcon } from "@/lib/category-visuals";
import type { Manga, MangaSimple } from "@/types/bindings";

/**
 * Library toggle with a category picker hanging off a caret. The plain button
 * quick-adds (the backend files the entry under the default category); the
 * picker lets the user choose the shelves up front, or re-file an entry that is
 * already in the library.
 */
export function LibraryAction({
	sourceId,
	mangaId,
	manga,
	chapterCount,
}: {
	sourceId: string;
	mangaId: string;
	manga?: Manga | MangaSimple;
	chapterCount?: number;
}) {
	const inLibrary = useIsInLibrary(sourceId, mangaId);
	const categories = useCategories();
	const { add, remove } = useToggleLibrary(
		sourceId,
		mangaId,
		manga,
		chapterCount,
	);

	const saved = inLibrary.data === true;
	const hasCategories = (categories.data?.length ?? 0) > 0;

	const quickAdd = () =>
		add.mutate(undefined, {
			onSuccess: () => toast.success("Added to library"),
			onError: (e) => toast.error(e.message),
		});

	return (
		<div className="flex w-full gap-2">
			<Button
				className="flex-1"
				onClick={() =>
					saved
						? remove.mutate(undefined, {
								onSuccess: () => toast.success("Removed from library"),
							})
						: quickAdd()
				}
				variant={saved ? "secondary" : "outline"}
			>
				<BookmarkSimpleIcon weight={saved ? "fill" : "regular"} />
				{saved ? "In library" : "Add to library"}
			</Button>

			{hasCategories && (
				<CategoryPicker
					mangaId={mangaId}
					onQuickAdd={quickAdd}
					saved={saved}
					sourceId={sourceId}
				/>
			)}
		</div>
	);
}

function CategoryPicker({
	sourceId,
	mangaId,
	saved,
	onQuickAdd,
	chapterCount,
}: {
	sourceId: string;
	mangaId: string;
	saved: boolean;
	onQuickAdd: () => void;
	chapterCount?: number;
}) {
	const [open, setOpen] = useState(false);
	const categories = useCategories();
	const assigned = useEntryCategories(sourceId, mangaId);
	const { add } = useToggleLibrary(sourceId, mangaId, undefined, chapterCount);
	const save = useSetEntryCategories(sourceId, mangaId);

	const [selected, setSelected] = useState<Set<string>>(new Set());

	// Seed each time the picker opens: an existing entry keeps its shelves, a new
	// one pre-checks the default so a quick confirm still honours it.
	useEffect(() => {
		if (!open) return;
		if (saved) {
			if (assigned.data) setSelected(new Set(assigned.data));
		} else {
			const defaults = (categories.data ?? [])
				.filter((c) => c.is_default)
				.map((c) => c.id);
			setSelected(new Set(defaults));
		}
	}, [open, saved, assigned.data, categories.data]);

	const toggle = (id: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});

	const confirm = async () => {
		try {
			if (!saved) await add.mutateAsync(undefined);
			await save.mutateAsync([...selected]);
			setOpen(false);
			toast.success(saved ? "Categories updated" : "Added to library");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong");
		}
	};

	const busy = add.isPending || save.isPending;
	// Editing an existing entry can't confirm until its saved set has loaded.
	const disabled = busy || (saved && !assigned.isSuccess);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button aria-label="Choose categories" size="icon" variant="outline">
						<CaretDownIcon />
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-64 gap-3">
				<div>
					<p className="font-semibold text-xs uppercase">Categories</p>
					{!saved && (
						<p className="mt-0.5 text-muted-foreground text-xs">
							Adds to your library too.
						</p>
					)}
				</div>

				<div className="-mx-1 max-h-64 space-y-0.5 overflow-y-auto px-1">
					{categories.data?.map((category) => {
						const Icon = categoryIcon(category.icon);
						return (
							<Label
								className="flex cursor-pointer items-center gap-2.5 py-1.5 font-normal text-sm"
								key={category.id}
							>
								<Checkbox
									checked={selected.has(category.id)}
									onCheckedChange={(on) => toggle(category.id, on === true)}
								/>
								{Icon && (
									<Icon
										size={15}
										style={{ color: category.color ?? undefined }}
										weight="fill"
									/>
								)}
								<span className="truncate">{category.name}</span>
							</Label>
						);
					})}
				</div>

				<div className="flex justify-between gap-2">
					{!saved && (
						<Button
							onClick={() => {
								setOpen(false);
								onQuickAdd();
							}}
							size="sm"
							variant="ghost"
						>
							Skip
						</Button>
					)}
					<Button
						className="ml-auto"
						disabled={disabled}
						onClick={confirm}
						size="sm"
					>
						{saved ? "Save" : "Add"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
