import { CaretRightIcon, GlobeIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	useAddRepository,
	useRemoveRepository,
	useRepositoryCatalog,
} from "@/hooks/services/use-repositories";
import { useDeepLink } from "@/hooks/use-deep-link";

/**
 * Repositories are set once and rarely touched, so this collapses to a single
 * summary row and leaves the extension lists as the section's subject.
 */
export function RepositoryGroup() {
	const { data: catalogs } = useRepositoryCatalog();
	const add = useAddRepository();
	const remove = useRemoveRepository();
	const { pendingRepository, clearPendingRepository } = useDeepLink();

	const [url, setUrl] = useState("");
	const [open, setOpen] = useState(false);

	const count = catalogs?.length ?? 0;
	const failing = catalogs?.filter((c) => c.error).length ?? 0;

	function addUrl(target: string, onDone?: () => void) {
		add.mutate(target, {
			onSuccess: (index) => {
				onDone?.();
				toast.success(`Added ${index.name}`);
			},
			onError: (e) => toast.error(e.message),
		});
	}

	return (
		<>
			<Collapsible onOpenChange={setOpen} open={open}>
				<CollapsibleTrigger
					className="flex w-full items-center gap-2 py-3 text-left"
					render={<button type="button" />}
				>
					<CaretRightIcon
						className={`shrink-0 text-muted-foreground transition-transform ${
							open ? "rotate-90" : ""
						}`}
						size={16}
					/>
					<span className="font-medium text-sm">Repositories</span>
					<span className="text-muted-foreground text-xs">
						{count === 0
							? "none added"
							: `${count} added${failing > 0 ? ` · ${failing} unreachable` : ""}`}
					</span>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<div className="pb-4 pl-6">
						<div className="flex gap-2">
							<Input
								onChange={(e) => setUrl(e.target.value)}
								onKeyDown={(e) =>
									e.key === "Enter" &&
									url.trim() &&
									addUrl(url.trim(), () => setUrl(""))
								}
								placeholder="https://example.github.io/pack/index.min.json"
								value={url}
							/>
							<Button
								disabled={add.isPending || !url.trim()}
								onClick={() => addUrl(url.trim(), () => setUrl(""))}
							>
								Add
							</Button>
						</div>

						{catalogs?.map((catalog) => (
							<div
								className="flex items-center gap-3 pt-3"
								key={catalog.repository.url}
							>
								<GlobeIcon
									className="shrink-0 text-muted-foreground"
									size={18}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">
										{catalog.index?.name ?? catalog.repository.name}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{catalog.repository.url}
									</p>
									{catalog.error && (
										<p className="text-destructive text-xs">{catalog.error}</p>
									)}
								</div>
								<Button
									disabled={remove.isPending}
									onClick={() =>
										remove.mutate(catalog.repository.url, {
											onSuccess: () => toast.success("Repository removed"),
											onError: (e) => toast.error(e.message),
										})
									}
									size="icon"
									variant="ghost"
								>
									<TrashIcon />
								</Button>
							</div>
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>

			<AddFromLinkDialog
				busy={add.isPending}
				onCancel={clearPendingRepository}
				onConfirm={() =>
					addUrl(pendingRepository ?? "", clearPendingRepository)
				}
				url={pendingRepository}
			/>
		</>
	);
}

/**
 * Confirms a repository that arrived over a `nomanga://add-repo` link. Adding
 * one installs nothing, but the link can come from any page on the internet, so
 * the URL is shown in full and the user decides.
 */
function AddFromLinkDialog({
	url,
	busy,
	onCancel,
	onConfirm,
}: {
	url: string | null;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog onOpenChange={(open) => !open && onCancel()} open={url !== null}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add this repository?</DialogTitle>
					<DialogDescription>
						A link asked nomanga to add the repository below. Nothing is
						installed — you pick what to install afterwards.
					</DialogDescription>
				</DialogHeader>

				<p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
					{url}
				</p>

				<DialogFooter>
					<Button onClick={onCancel} variant="outline">
						Cancel
					</Button>
					<Button disabled={busy} onClick={onConfirm}>
						Add repository
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
