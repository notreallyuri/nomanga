import { MagnifyingGlassIcon, PushPinIcon, XIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FilterSheet } from "@/components/browse/filter-sheet";
import { HomepageSections } from "@/components/browse/homepage-sections";
import { SearchResults } from "@/components/browse/search-result";
import { SectionView } from "@/components/browse/section-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePinSource } from "@/hooks/use-pin-source";
import type { FilterValue } from "@/types/bindings";

interface BrowseSearch {
	q?: string;
	filters?: FilterValue[];
	section?: string;
}

export const Route = createFileRoute("/_app/browse/$sourceId")({
	validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		filters: Array.isArray(search.filters)
			? (search.filters as FilterValue[])
			: undefined,
		section:
			typeof search.section === "string" && search.section
				? search.section
				: undefined,
	}),
	component: BrowseSource,
});

function BrowseSource() {
	const { sourceId } = Route.useParams();
	const { q = "", filters = [], section } = Route.useSearch();
	const navigate = Route.useNavigate();

	const [draft, setDraft] = useState(q);

	useEffect(() => setDraft(q), [q]);

	useEffect(() => {
		if (draft === q) return;

		const timer = setTimeout(() => {
			navigate({
				search: (prev) => ({ ...prev, q: draft || undefined }),
				replace: true,
			});
		}, 300);

		return () => clearTimeout(timer);
	}, [draft, q, navigate]);

	const setFilters = (next: FilterValue[]) => {
		navigate({
			search: (prev) => ({ ...prev, filters: next.length ? next : undefined }),
			replace: true,
		});
	};

	const searching = q.trim().length > 0 || filters.length > 0;

	if (section) {
		return (
			<div className="h-full overflow-y-auto px-6 py-6">
				<SectionView
					onBack={() =>
						navigate({
							search: (prev) => ({ ...prev, section: undefined }),
							replace: true,
						})
					}
					sectionId={section}
					sourceId={sourceId}
				/>
			</div>
		);
	}

	return (
		<div
			className="h-full overflow-y-auto"
			data-scroll-restoration-id="browse-source"
		>
			<div className="sticky top-0 z-10 bg-background/95 px-6 pt-6 pb-4 backdrop-blur">
				<div className="flex gap-2">
					<div className="relative flex-1">
						<MagnifyingGlassIcon
							className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
							size={16}
						/>
						<Input
							className="pl-9"
							onChange={(e) => setDraft(e.target.value)}
							placeholder="Search this source…"
							value={draft}
						/>
						{draft && (
							<button
								className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								onClick={() => setDraft("")}
								type="button"
							>
								<XIcon size={14} />
							</button>
						)}
					</div>

					<FilterSheet
						filters={filters}
						onChange={setFilters}
						sourceId={sourceId}
					/>

					<PinButton sourceId={sourceId} />
				</div>
			</div>

			<div className="px-6 pb-6">
				{searching ? (
					<SearchResults filters={filters} query={q} sourceId={sourceId} />
				) : (
					<HomepageSections sourceId={sourceId} />
				)}
			</div>
		</div>
	);
}

function PinButton({ sourceId }: { sourceId: string }) {
	const { pinned, toggle } = usePinSource(sourceId);

	const label = pinned ? "Unpin from sidebar" : "Pin to sidebar";

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label={label}
						aria-pressed={pinned}
						onClick={toggle}
						size="icon"
						variant={pinned ? "default" : "outline"}
					>
						<PushPinIcon weight={pinned ? "fill" : "regular"} />
					</Button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
