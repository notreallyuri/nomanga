import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function DialogBody({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"-mx-1 h-80 max-h-[55vh] min-w-0 overflow-y-auto px-1",
				className,
			)}
		>
			{children}
		</div>
	);
}

export interface Stat {
	label: string;
	count: number;
	variant?: "secondary" | "destructive" | "default";
}

export function StatChips({ stats }: { stats: Stat[] }) {
	const shown = stats.filter((stat) => stat.count > 0);

	if (shown.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{shown.map((stat) => (
				<Badge key={stat.label} variant={stat.variant ?? "secondary"}>
					<span className="tabular-nums">{stat.count}</span>
					{stat.label}
				</Badge>
			))}
		</div>
	);
}

export function HeadlineProgress({
	label,
	detail,
	percent,
}: {
	label: string;
	detail?: string;
	percent: number;
}) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex items-center gap-2 text-xs">
				<span className="min-w-0 flex-1 truncate text-muted-foreground">
					{label}
				</span>
				<span className="shrink-0 tabular-nums">
					{detail ? `${detail} · ` : ""}
					{percent}%
				</span>
			</div>
			<Progress value={percent} />
		</div>
	);
}

export function EmptyState({
	icon,
	title,
	body,
	action,
}: {
	icon: ReactNode;
	title: string;
	body: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
			<span className="text-muted-foreground">{icon}</span>
			<p className="font-medium text-sm">{title}</p>
			<p className="max-w-xs text-muted-foreground text-xs">{body}</p>
			{action && <div className="mt-1">{action}</div>}
		</div>
	);
}
