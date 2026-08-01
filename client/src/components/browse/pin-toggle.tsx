import { PushPinIcon } from "@phosphor-icons/react";
import { usePinSource } from "@/hooks/use-pin-source";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function PinToggle({
	sourceId,
	className,
}: {
	sourceId: string;
	className?: string;
}) {
	const { pinned, disabled, toggle } = usePinSource(sourceId);

	const label = pinned ? "Unpin from sidebar" : "Pin to sidebar";

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						aria-label={label}
						aria-pressed={pinned}
						className={cn(
							"flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-all hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
							pinned
								? "text-foreground opacity-100"
								: "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100",
							disabled && "cursor-not-allowed",
							className,
						)}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							toggle();
						}}
						type="button"
					>
						<PushPinIcon size={16} weight={pinned ? "fill" : "regular"} />
					</button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
