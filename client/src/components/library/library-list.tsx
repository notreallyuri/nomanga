import { CheckCircleIcon, ImageBrokenIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { UnreadBadge } from "@/components/manga/manga-card";
import { useAppearance } from "@/hooks/services/use-settings";
import { sourceImageUrl } from "@/lib/source-image";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/types/bindings";
import { LibraryEntryMenu } from "./library-entry-menu";

const keyOf = (item: { source_id: string; manga_id: string }) =>
	`${item.source_id}/${item.manga_id}`;

export function LibraryList({
	items,
	selectionMode,
	selected,
	onToggleSelect,
	onStartSelect,
	onEditCategories,
}: {
	items: LibraryItem[];
	selectionMode: boolean;
	selected: Set<string>;
	onToggleSelect: (item: LibraryItem) => void;
	onStartSelect: (item: LibraryItem) => void;
	onEditCategories: (item: LibraryItem) => void;
}) {
	return (
		<div className="flex flex-col divide-y divide-border/60 border-y">
			{items.map((item) => (
				<LibraryRow
					isSelected={selected.has(keyOf(item))}
					item={item}
					key={keyOf(item)}
					onEditCategories={onEditCategories}
					onStartSelect={onStartSelect}
					onToggleSelect={onToggleSelect}
					selectionMode={selectionMode}
				/>
			))}
		</div>
	);
}

function LibraryRow({
	item,
	selectionMode,
	isSelected,
	onToggleSelect,
	onStartSelect,
	onEditCategories,
}: {
	item: LibraryItem;
	selectionMode: boolean;
	isSelected: boolean;
	onToggleSelect: (item: LibraryItem) => void;
	onStartSelect: (item: LibraryItem) => void;
	onEditCategories: (item: LibraryItem) => void;
}) {
	const { show_unread_badge } = useAppearance();
	const unread = Math.max(0, item.cached_total_chapters - item.read_chapters);

	const body = (
		<>
			{selectionMode && (
				<span
					className={cn(
						"flex size-5 shrink-0 items-center justify-center rounded-full border-2",
						isSelected
							? "border-primary text-primary"
							: "border-muted-foreground/50 text-transparent",
					)}
				>
					<CheckCircleIcon size={16} weight="fill" />
				</span>
			)}

			<Thumb
				title={item.title}
				url={sourceImageUrl(item.source_id, item.cover_url, { cache: true })}
			/>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-sm">{item.title}</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{item.cached_total_chapters > 0
						? `${item.read_chapters}/${item.cached_total_chapters} read`
						: "—"}
				</p>
			</div>

			{show_unread_badge && <UnreadBadge count={unread} />}
		</>
	);

	const row: ReactNode = selectionMode ? (
		<button
			aria-pressed={isSelected}
			className={cn(
				"flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-muted/50",
				isSelected && "bg-primary/10",
			)}
			onClick={() => onToggleSelect(item)}
			type="button"
		>
			{body}
		</button>
	) : (
		<Link
			className="flex items-center gap-3 px-2 py-2 transition-colors hover:bg-muted/50"
			params={{ sourceId: item.source_id, mangaId: item.manga_id }}
			to="/manga/$sourceId/$mangaId"
		>
			{body}
		</Link>
	);

	return (
		<LibraryEntryMenu
			item={item}
			onEditCategories={onEditCategories}
			onStartSelect={onStartSelect}
		>
			{row}
		</LibraryEntryMenu>
	);
}

function Thumb({ url, title }: { url: string; title: string }) {
	const [failed, setFailed] = useState(!url);

	return (
		<div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-sm bg-muted">
			{failed ? (
				<div className="flex h-full w-full items-center justify-center">
					<ImageBrokenIcon className="text-muted-foreground" size={16} />
				</div>
			) : (
				<img
					alt=""
					className="h-full w-full object-cover"
					decoding="async"
					loading="lazy"
					onError={() => setFailed(true)}
					src={url}
					title={title}
				/>
			)}
		</div>
	);
}
