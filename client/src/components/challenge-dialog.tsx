import { ShieldCheckIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { unwrap } from "@/lib/unwrap";
import type { SourceInfo } from "@/types/bindings";
import { commands } from "@/types/bindings";

export function ChallengeDialog({
	source,
	open,
	onOpenChange,
	onSolved,
}: {
	source: SourceInfo | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSolved?: () => void;
}) {
	const sourceId = source?.id ?? null;
	const hasChallenge = Boolean(source?.challenge);

	useEffect(() => {
		if (!(open && sourceId && hasChallenge)) return;

		let dropped = false;

		unwrap(commands.solveChallenge(sourceId))
			.then((outcome) => {
				if (dropped) return;

				if (outcome.solved) {
					toast.success("Challenge cleared");
					onSolved?.();
				} else if (outcome.error && outcome.reads === 0) {
					// The store never answered, so nothing can be concluded about
					// whether the site issued a clearance.
					toast.error(`Could not read the window's cookies: ${outcome.error}`);
				} else if (outcome.reads > 0) {
					toast.warning(
						outcome.seen.length > 0
							? `No clearance found at ${outcome.landed}. Cookies present: ${outcome.seen.join(", ")}`
							: `No cookies at all at ${outcome.landed} after ${outcome.reads} reads.`,
						{ duration: 30_000 },
					);
				} else {
					toast.info("Challenge was not completed");
				}

				onOpenChange(false);
			})
			.catch((e: Error) => {
				if (dropped) return;
				toast.error(e.message);
				onOpenChange(false);
			});

		return () => {
			dropped = true;
			// Closing the window is what makes the pending solve_challenge resolve
			// false rather than sitting until its timeout.
			void commands.cancelChallenge();
		};
	}, [open, sourceId, hasChallenge, onOpenChange, onSolved]);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheckIcon size={18} />
						Verify you are human
					</DialogTitle>
					<DialogDescription>
						{source?.name ?? "This source"} is behind a browser check. Complete
						it in the window that just opened — nomanga keeps the clearance for
						the rest of the session.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
					<SpinnerIcon className="animate-spin" size={14} />
					Waiting for the check to pass…
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="ghost">
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
