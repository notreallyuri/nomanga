import { GlobeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SourceIcon({
	url,
	name,
	className,
	iconSize = 20,
}: {
	url: string | null | undefined;
	name: string;
	className?: string;
	iconSize?: number;
}) {
	// Keyed on the URL rather than a bare boolean: the sidebar reuses these
	// across pin changes, and a flag would carry the old icon's failure over.
	const [failedUrl, setFailedUrl] = useState<string | null>(null);

	if (!url || failedUrl === url) {
		return (
			<div
				className={cn(
					"flex shrink-0 items-center justify-center rounded bg-muted",
					className,
				)}
			>
				<GlobeIcon className="text-muted-foreground" size={iconSize} />
				<span className="sr-only">{name}</span>
			</div>
		);
	}

	return (
		<img
			alt={`${name} icon`}
			className={cn("shrink-0 rounded object-cover", className)}
			onError={() => setFailedUrl(url)}
			src={url}
		/>
	);
}
