import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { SettingGroup } from "@/components/settings/components/parts";
import { NetworkLog } from "@/components/settings/sections/network-log";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useDebugState,
	useDebugTable,
	useExportTableRows,
} from "@/hooks/services/use-debug";
import { formatBytes } from "@/lib/utils";

export function DeveloperSection() {
	const state = useDebugState();

	if (state.isPending) return <Skeleton className="h-64" />;
	if (state.error)
		return <p className="text-destructive text-sm">{state.error.message}</p>;

	const data = state.data;

	return (
		<>
			<SettingGroup title="Build">
				<Facts
					rows={[
						["App version", data.app_version],
						["Extension ABI", String(data.abi_version)],
						["Device name", data.device_name],
						[
							"Cover cache",
							`${data.image_cache.file_count} files · ${formatBytes(data.image_cache.total_bytes ?? 0)}`,
						],
					]}
				/>
			</SettingGroup>

			<SettingGroup title="Paths">
				<Facts
					mono
					rows={data.paths.map((p) => [
						p.name,
						p.path || "—",
						p.exists ? undefined : "missing",
					])}
				/>
			</SettingGroup>

			<SettingGroup title="Extensions">
				{data.extensions.length === 0 ? (
					<p className="py-3 text-muted-foreground text-sm">
						No extensions installed.
					</p>
				) : (
					<Facts
						rows={data.extensions.map((e) => [
							e.id,
							`v${e.version} · ABI ${e.abi_version} · ${e.sources.length} source${e.sources.length === 1 ? "" : "s"}`,
							e.abi_version === data.abi_version ? undefined : "ABI mismatch",
						])}
					/>
				)}
			</SettingGroup>

			<SettingGroup title="Network">
				<NetworkLog />
			</SettingGroup>

			<SettingGroup title="Database">
				<TableBrowser
					tables={data.tables.map((t) => ({ name: t.name, rows: t.rows ?? 0 }))}
				/>
			</SettingGroup>
		</>
	);
}

function Facts({
	rows,
	mono,
}: {
	rows: [string, string, (string | undefined)?][];
	mono?: boolean;
}) {
	return (
		<div className="divide-y divide-border">
			{rows.map(([label, value, warning]) => (
				<div
					className="flex items-baseline justify-between gap-6 py-2.5"
					key={label}
				>
					<span className="shrink-0 font-medium text-sm">{label}</span>
					<span
						className={`min-w-0 truncate text-muted-foreground text-xs ${mono ? "font-mono" : ""}`}
						title={value}
					>
						{value}
						{warning && (
							<span className="ml-2 text-destructive">({warning})</span>
						)}
					</span>
				</div>
			))}
		</div>
	);
}

function TableBrowser({
	tables,
}: {
	tables: { name: string; rows: number }[];
}) {
	const [name, setName] = useState(tables[0]?.name ?? "manga");
	const [page, setPage] = useState(0);
	const [selected, setSelected] = useState<Set<number>>(new Set());

	const table = useDebugTable(name, page);
	const exportRows = useExportTableRows();

	// Selection is by position within the current page, so it cannot survive a
	// change of table or page.
	const pick = (next: string | null) => {
		if (!next) return;
		setName(next);
		setPage(0);
		setSelected(new Set());
	};

	const goToPage = (next: number) => {
		setPage(next);
		setSelected(new Set());
	};

	const toggle = (index: number) => {
		setSelected((current) => {
			const next = new Set(current);
			if (!next.delete(index)) next.add(index);
			return next;
		});
	};

	const rows = table.data?.rows ?? [];
	const allSelected = rows.length > 0 && selected.size === rows.length;

	const download = async () => {
		if (!table.data || selected.size === 0) return;

		const path = await save({
			defaultPath: `nomanga-${name}-${new Date().toISOString().slice(0, 10)}.json`,
			filters: [{ name: "JSON", extensions: ["json"] }],
		});
		if (!path) return;

		exportRows.mutate(
			{
				path,
				table: name,
				columns: table.data.columns,
				rows: [...selected].sort((a, b) => a - b).map((i) => rows[i]),
			},
			{
				onSuccess: () => toast.success(`Exported ${selected.size} rows`),
				onError: (e) => toast.error(e.message),
			},
		);
	};

	const total = table.data?.total ?? 0;
	const pageSize = table.data?.page_size ?? 50;
	const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

	return (
		<div className="space-y-3 py-3">
			<div className="flex items-center gap-2">
				<Select onValueChange={pick} value={name}>
					<SelectTrigger className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{tables.map((t) => (
							<SelectItem key={t.name} value={t.name}>
								{t.name} ({t.rows})
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<span className="text-muted-foreground text-xs tabular-nums">
					{total} row{total === 1 ? "" : "s"}
				</span>

				<Button
					disabled={selected.size === 0 || exportRows.isPending}
					onClick={download}
					size="sm"
					variant="outline"
				>
					{exportRows.isPending
						? "Exporting…"
						: `Export${selected.size > 0 ? ` (${selected.size})` : ""}`}
				</Button>

				<div className="ml-auto flex items-center gap-2">
					<Button
						disabled={page === 0}
						onClick={() => goToPage(page - 1)}
						size="sm"
						variant="outline"
					>
						Prev
					</Button>
					<span className="text-muted-foreground text-xs tabular-nums">
						{page + 1} / {lastPage + 1}
					</span>
					<Button
						disabled={page >= lastPage}
						onClick={() => goToPage(page + 1)}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			</div>

			{table.isPending ? (
				<Skeleton className="h-40" />
			) : table.data && table.data.rows.length > 0 ? (
				<div className="overflow-x-auto rounded border border-border">
					{/* w-max, not w-full: the table has to be allowed to exceed the
					    container for the horizontal scroll to have anything to do. */}
					<table className="w-max min-w-full text-xs">
						<thead className="bg-muted/50">
							<tr>
								<th className="w-8 px-2 py-1.5">
									<Checkbox
										aria-label="Select all rows on this page"
										checked={allSelected}
										onCheckedChange={() =>
											setSelected(
												allSelected
													? new Set()
													: new Set(rows.map((_, i) => i)),
											)
										}
									/>
								</th>
								{table.data.columns.map((c) => (
									<th
										className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
										key={c}
									>
										{c}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="font-mono">
							{rows.map((row, i) => (
								// Raw rows have no id column to key on, and a page is always
								// refetched whole.
								<tr className="border-border border-t" key={i}>
									<td className="px-2 py-1">
										<Checkbox
											aria-label={`Select row ${i + 1}`}
											checked={selected.has(i)}
											onCheckedChange={() => toggle(i)}
										/>
									</td>
									{row.map((cell, j) => (
										<td
											className="max-w-56 truncate px-2 py-1"
											key={j}
											title={cell ?? "NULL"}
										>
											{cell ?? (
												<span className="text-muted-foreground italic">
													NULL
												</span>
											)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="py-6 text-center text-muted-foreground text-sm">
					No rows.
				</p>
			)}
		</div>
	);
}
