import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useSourceRefresh } from "@/hooks/services/use-sources";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Refetches the source view currently on screen. Disabled while a fetch is in
 * flight, which also keeps a repeatedly clicked refresh from queueing up behind
 * a source's rate limiter — a homepage can cost several requests.
 */
export function RefreshButton({ sourceId }: { sourceId: string }) {
	const { isRefreshing, refresh } = useSourceRefresh(sourceId);

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label="Refresh"
						disabled={isRefreshing}
						onClick={() => refresh()}
						size="icon"
						variant="outline"
					>
						<ArrowClockwiseIcon
							className={isRefreshing ? "animate-spin" : undefined}
						/>
					</Button>
				}
			/>
			<TooltipContent>Refresh</TooltipContent>
		</Tooltip>
	);
}
