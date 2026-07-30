import { ImageBrokenIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { sourceImageUrl } from "@/lib/source-image";
import { cn } from "@/lib/utils";

/**
 * A source cover, routed through the image proxy and degrading to a placeholder
 * rather than a broken-image glyph.
 *
 * Covers fail for reasons outside the app's control — a CDN rotating a shard, a
 * hotlink check, a series whose cover was never uploaded — so every surface
 * showing one needs the same fallback.
 */
export function CoverImage({
	sourceId,
	url,
	alt,
	className,
	iconSize = 20,
}: {
	sourceId: string;
	url: string | null | undefined;
	alt?: string;
	/** Applied to both the image and the placeholder, so layout holds either way. */
	className?: string;
	iconSize?: number;
}) {
	const resolved = sourceImageUrl(sourceId, url, { cache: true });

	// Keyed on the URL rather than a bare boolean: these components are reused
	// across navigations, and a flag would keep reporting the previous cover's
	// failure for the next series.
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const failed = !resolved || failedUrl === resolved;

	if (failed) {
		return (
			<div
				className={cn(
					"flex items-center justify-center bg-muted text-muted-foreground",
					className,
				)}
			>
				<ImageBrokenIcon size={iconSize} />
				{alt && <span className="sr-only">{alt}</span>}
			</div>
		);
	}

	return (
		<img
			alt={alt ?? ""}
			className={className}
			decoding="async"
			loading="lazy"
			onError={() => setFailedUrl(resolved)}
			src={resolved}
		/>
	);
}
