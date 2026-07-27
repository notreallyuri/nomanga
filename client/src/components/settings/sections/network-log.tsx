import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	useCallLog,
	useClearCallLog,
	useExportCallLog,
	useSetCallRecording,
} from "@/hooks/services/use-debug";
import { cn, formatBytes } from "@/lib/utils";
import type { CallEntry } from "@/types/bindings";

export function NetworkLog() {
	const log = useCallLog();
	const setServerRecording = useSetCallRecording();
	const clear = useClearCallLog();
	const exportLog = useExportCallLog();

	const download = async () => {
		const path = await save({
			defaultPath: `nomanga-network-${new Date().toISOString().slice(0, 10)}.json`,
			filters: [{ name: "JSON", extensions: ["json"] }],
		});
		if (!path) return;

		exportLog.mutate(path, {
			onSuccess: () => toast.success("Network log exported"),
			onError: (e) => toast.error(e.message),
		});
	};

	const isRecording = log.data?.recording ?? false;
	const entries = log.data?.entries ?? [];

	return (
		<div className="space-y-3 py-3">
			<div className="flex items-center gap-3">
				<Switch
					checked={isRecording}
					onCheckedChange={(on) => setServerRecording.mutate(on)}
				/>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">Record extension requests</p>
					<p className="text-muted-foreground text-xs">
						Every fetch an extension makes, with the raw response. Off by
						default — bodies are held in memory. Export strips credential
						headers so the file is safe to attach to an issue.
					</p>
				</div>
				<Button
					disabled={entries.length === 0 || exportLog.isPending}
					onClick={download}
					size="sm"
					variant="outline"
				>
					{exportLog.isPending ? "Exporting…" : "Export"}
				</Button>
				<Button
					disabled={entries.length === 0 || clear.isPending}
					onClick={() => clear.mutate()}
					size="sm"
					variant="outline"
				>
					Clear
				</Button>
			</div>

			{entries.length === 0 ? (
				<p className="py-6 text-center text-muted-foreground text-sm">
					{isRecording
						? "Recording. Browse a source and requests will appear here."
						: "Nothing recorded."}
				</p>
			) : (
				<div className="divide-y divide-border rounded border border-border">
					{entries.map((entry) => (
						<CallRow entry={entry} key={`${entry.at} ${entry.url}`} />
					))}
				</div>
			)}
		</div>
	);
}

function statusTone(entry: CallEntry) {
	if (entry.error) return "text-destructive";
	const status = entry.status ?? 0;
	if (status >= 200 && status < 300)
		return "text-emerald-600 dark:text-emerald-400";
	if (status >= 400) return "text-destructive";
	return "text-muted-foreground";
}

function CallRow({ entry }: { entry: CallEntry }) {
	const [open, setOpen] = useState(false);

	return (
		<div>
			<button
				className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-muted/50"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<span className="w-12 shrink-0 font-mono text-muted-foreground text-xs">
					{entry.method}
				</span>
				<span
					className={cn(
						"w-10 shrink-0 font-mono text-xs tabular-nums",
						statusTone(entry),
					)}
				>
					{entry.error ? "err" : (entry.status ?? "—")}
				</span>
				<span
					className="min-w-0 flex-1 truncate font-mono text-xs"
					title={entry.url}
				>
					{entry.url}
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{Math.round(entry.duration_ms ?? 0)} ms
				</span>
			</button>

			{open && (
				<div className="space-y-3 border-border border-t bg-muted/30 px-3 py-3">
					<Facts
						rows={[
							["Source", entry.source_id || "—"],
							["When", new Date(entry.at).toLocaleTimeString()],
							[
								"Response",
								`${formatBytes(entry.body_bytes ?? 0)}${entry.truncated ? " (log shows the first part)" : ""}`,
							],
							...(entry.error
								? [["Error", entry.error] as [string, string]]
								: []),
						]}
					/>

					<Headers label="Request headers" rows={entry.request_headers} />
					<Headers label="Response headers" rows={entry.response_headers} />

					{entry.body && (
						<div>
							<p className="mb-1 font-medium text-xs">Body</p>
							<pre className="max-h-64 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px] leading-relaxed">
								{entry.body}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function Facts({ rows }: { rows: [string, string][] }) {
	return (
		<div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-xs">
			{rows.map(([label, value]) => (
				<div className="contents" key={label}>
					<span className="text-muted-foreground">{label}</span>
					<span className="min-w-0 break-all font-mono">{value}</span>
				</div>
			))}
		</div>
	);
}

function Headers({ label, rows }: { label: string; rows: [string, string][] }) {
	if (rows.length === 0) return null;

	return (
		<div>
			<p className="mb-1 font-medium text-xs">{label}</p>
			<div className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
				{rows.map(([key, value]) => (
					<div className="contents" key={`${key} ${value}`}>
						<span className="truncate text-muted-foreground" title={key}>
							{key}
						</span>
						<span className="min-w-0 break-all">{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}
