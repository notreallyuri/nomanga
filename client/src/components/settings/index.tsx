import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSettingsUI } from "./context";
import { SECTIONS } from "./sections";
import { SettingsSidebar } from "./sidebar";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
	const { active, setActive } = useSettingsUI();

	const Section = SECTIONS[active.name];

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="flex h-[calc(100vh-8rem)] w-[calc(100vw-12rem)] max-w-none! overflow-hidden border-sidebar p-0">
				<DialogTitle className="sr-only">Settings</DialogTitle>
				<DialogDescription className="sr-only">
					Configure application preferences
				</DialogDescription>

				<SidebarProvider className="min-h-0 flex-1">
					<SettingsSidebar current={active} onChange={setActive} />

					{/* min-w-0: without it this flex child refuses to shrink below its
					    content, so wide sections push the dialog out instead of
					    scrolling inside their own container. */}
					<main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
						<header className="shrink-0 border-border border-b px-8 py-4">
							<h1 className="font-bold font-heading text-2xl">{active.name}</h1>
							<p className="text-muted-foreground text-sm">
								{active.description}
							</p>
						</header>

						<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
							<Section />
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}
