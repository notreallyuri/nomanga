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
		<SidebarProvider>
			<Sidebar
				onSettingsOpenChange={setSettingsOpen}
				settingsOpen={settingsOpen}
			/>
			<SidebarInset>
				<main className="flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</SidebarInset>
			<SettingsDialog onOpenChange={setSettingsOpen} open={settingsOpen} />
		</SidebarProvider>
	);
}
