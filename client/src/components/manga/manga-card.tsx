import { EyeSlashIcon, ImageBrokenIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { cva } from "class-variance-authority";
import { type ReactNode, useState } from "react";
import { useSourcePreference } from "@/hooks/services/use-extensions";
import { useAppearance } from "@/hooks/services/use-settings";
import { sourceImageUrl } from "@/lib/source-image";
import { cn } from "@/lib/utils";
import type { CoverStyle } from "@/types/bindings";

interface MangaCardProps {
	sourceId: string;
	mangaId: string;
	title: string;
	coverUrl: string;
	badge?: ReactNode;
	blurred?: boolean;
	dimmed?: boolean;
	compactTitle?: boolean;
	showTitle?: boolean;
}

const cardVariants = cva("group block focus-visible:outline-none", {
	variants: {
		dimmed: {
			true: "opacity-60 hover:opacity-100",
			false: "",
		},
	},
	defaultVariants: { dimmed: false },
});

const coverVariants = cva(
	[
		"relative aspect-2/3 overflow-hidden bg-muted",
		"ring-offset-2 ring-offset-background transition-shadow",
		"group-focus-visible:ring-2 group-focus-visible:ring-ring",
	],
	{
		variants: {
			coverStyle: {
				Default: "rounded-none",
				Rounded: "rounded-lg",
				Border: "rounded-none border-2 border-border",
				Shadow: "rounded-none shadow-black/25 shadow-lg",
			} satisfies Record<CoverStyle, string>,
		},
		defaultVariants: { coverStyle: "Default" },
	},
);

const titleVariants = cva("leading-tight", {
	variants: {
		compact: {
			true: "mt-1.5 line-clamp-1 text-xs",
			false: "mt-2 line-clamp-2 text-sm",
		},
	},
	defaultVariants: { compact: false },
});

export function MangaCard({
	sourceId,
	mangaId,
	title,
	coverUrl,
	badge,
	blurred,
	dimmed = false,
	compactTitle,
	showTitle,
}: MangaCardProps) {
	const appearance = useAppearance();
	const preference = useSourcePreference(sourceId);

	const titleVisible = showTitle ?? appearance.show_titles;
	const compact = compactTitle ?? appearance.compact_mode;
	const blurCover = blurred ?? preference.blur_covers;

	return (
		<Link
			className={cardVariants({ dimmed })}
			params={{ sourceId, mangaId }}
			to="/manga/$sourceId/$mangaId"
		>
			<Cover
				badge={badge}
				blurred={blurCover}
				className={coverVariants({ coverStyle: appearance.cover_style })}
				title={title}
				titleVisible={titleVisible}
				// Proxied so covers on hotlink-protected CDNs (NatoManga) load;
				// a pass-through for every other source.
				url={sourceImageUrl(sourceId, coverUrl)}
			/>

			{titleVisible && (
				<p className={titleVariants({ compact })} title={title}>
					{title}
				</p>
			)}
		</Link>
	);
}

type LoadState = "loading" | "loaded" | "error";

function Cover({
	url,
	title,
	blurred,
	badge,
	titleVisible,
	className,
}: {
	url: string;
	title: string;
	blurred: boolean;
	badge?: ReactNode;
	titleVisible: boolean;
	className: string;
}) {
	const [state, setState] = useState<LoadState>(url ? "loading" : "error");

	return (
		<div className={className}>
			{state !== "error" && (
				<img
					alt=""
					className={cn(
						"h-full w-full object-cover transition-all duration-300",
						"group-hover:scale-105",
						state === "loading" ? "opacity-0" : "opacity-100",
						blurred && "blur-lg group-hover:blur-none",
					)}
					decoding="async"
					loading="lazy"
					onError={() => setState("error")}
					onLoad={() => setState("loaded")}
					src={url}
				/>
			)}

			{state === "loading" && (
				<div className="absolute inset-0 animate-pulse bg-muted" />
			)}

			{state === "error" && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
					<ImageBrokenIcon className="text-muted-foreground" size={24} />
					{!titleVisible && (
						<p className="line-clamp-3 text-muted-foreground text-xs leading-tight">
							{title}
						</p>
					)}
				</div>
			)}

			{blurred && state === "loaded" && (
				<div className="absolute inset-0 flex items-center justify-center opacity-70 transition-opacity group-hover:opacity-0">
					<EyeSlashIcon className="text-foreground drop-shadow" size={20} />
				</div>
			)}

			{badge && <div className="absolute top-1.5 right-1.5">{badge}</div>}
		</div>
	);
}

export function UnreadBadge({ count }: { count: number }) {
	if (count <= 0) return null;

	return (
		<span className="rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground text-xs tabular-nums shadow">
			{count > 99 ? "99+" : count}
		</span>
	);
}
