import { GlobeIcon, PlugsIcon, WarningIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourcesWithPreferences } from "@/hooks/services/use-extensions";

export const Route = createFileRoute("/_app/browse/")({
	component: BrowseIndex,
});

function BrowseIndex() {
	const { data: rows, isPending, error } = useSourcesWithPreferences();

	if (isPending) {
		return (
			<div className="p-6">
				<h1 className="mb-4 font-heading text-2xl">Browse</h1>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
					{["a", "b", "c"].map((k) => (
						<Skeleton className="h-20" key={k} />
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return <p className="p-6 text-destructive">{error.message}</p>;
	}

	const enabled = rows.filter((row) => row.preference.enabled);
	const hiddenCount = rows.length - enabled.length;

	if (rows.length === 0) {
		return <EmptyState kind="no-extensions" />;
	}

	if (enabled.length === 0) {
		return <EmptyState kind="all-disabled" />;
	}

	return (
		<div className="p-6">
			<div className="mb-4 flex items-baseline justify-between">
				<h1 className="font-heading text-2xl">Browse</h1>
				{hiddenCount > 0 && (
					<p className="text-muted-foreground text-xs">
						{hiddenCount} source{hiddenCount === 1 ? "" : "s"} hidden
					</p>
				)}
			</div>

			<div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
				{enabled.map(({ info }) => (
					<Link
						key={info.id}
						params={{ sourceId: info.id }}
						to="/browse/$sourceId"
					>
						<div className="flex h-full flex-col items-center gap-2 bg-muted/50 p-2 transition-colors hover:bg-muted">
							{info.icon_url ? (
								<img
									alt=""
									className="mt-4 size-10 shrink-0 rounded object-cover"
									src={info.icon_url}
								/>
							) : (
								<div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
									<GlobeIcon className="text-muted-foreground" size={20} />
								</div>
							)}

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<p className="truncate font-medium">{info.name}</p>
									{info.nsfw && (
										<Badge className="shrink-0" variant="destructive">
											18+
										</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-xs uppercase">
									{info.language}
								</p>
							</div>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}

function EmptyState({ kind }: { kind: "no-extensions" | "all-disabled" }) {
	const content =
		kind === "no-extensions"
			? {
					icon: PlugsIcon,
					title: "No sources yet",
					body: "Install an extension from Settings → Extensions to start browsing.",
				}
			: {
					icon: WarningIcon,
					title: "All sources are disabled",
					body: "Enable at least one in Settings → Sources.",
				};

	const Icon = content.icon;

	return (
		<div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
			<Icon className="text-muted-foreground" size={40} />
			<div>
				<p className="font-medium">{content.title}</p>
				<p className="mt-1 text-muted-foreground text-sm">{content.body}</p>
			</div>
		</div>
	);
}
