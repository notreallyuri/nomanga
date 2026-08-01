import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useSourceRefresh } from "@/hooks/services/use-sources";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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
