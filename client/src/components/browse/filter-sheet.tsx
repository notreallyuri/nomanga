import { FunnelIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useSourceFilters } from "@/hooks/services/use-sources";
import type { FilterValue } from "@/types/bindings";
import { Button } from "../ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { FilterPanel } from "./filter-panel";

export function FilterSheet({
	sourceId,
	filters,
	onChange,
}: {
	sourceId: string;
	filters: FilterValue[];
	onChange: (values: FilterValue[]) => void;
}) {
	const { data, isPending } = useSourceFilters(sourceId);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<FilterValue[]>(filters);

	const handleOpenChange = (next: boolean) => {
		if (next) {
			setDraft(filters);
		} else if (draft !== filters) {
			onChange(draft);
		}
		setOpen(next);
	};

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<div className="flex items-center gap-1">
				<SheetTrigger
					render={
						<Button variant={filters.length > 0 ? "default" : "outline"}>
							<FunnelIcon />
							Filters
							{filters.length > 0 && ` (${filters.length})`}
						</Button>
					}
				/>
				{filters.length > 0 && (
					<Button
						aria-label="Clear filters"
						onClick={() => onChange([])}
						size="icon"
						variant="ghost"
					>
						<XIcon />
					</Button>
				)}
			</div>
			<SheetContent className="w-96 overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Filters</SheetTitle>
				</SheetHeader>

				<div className="p-4">
					{isPending && <Skeleton className="h-64" />}
					{data && (
						<FilterPanel filters={data} onChange={setDraft} values={draft} />
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
