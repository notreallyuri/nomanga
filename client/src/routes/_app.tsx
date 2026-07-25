import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "@/components/nav";
import { SettingsDialog } from "@/components/settings";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
});

function RouteComponent() {
	const [settingsOpen, setSettingsOpen] = useState(false);

	return (
		<SidebarProvider className="h-full overflow-hidden">
			<Sidebar
				onSettingsOpenChange={setSettingsOpen}
				settingsOpen={settingsOpen}
			/>
			<SidebarInset className="min-w-0 overflow-hidden">
				<main className="min-h-0 min-w-0 flex-1 overflow-hidden">
					<Outlet />
				</main>
			</SidebarInset>
			<SettingsDialog onOpenChange={setSettingsOpen} open={settingsOpen} />
		</SidebarProvider>
	);
}
