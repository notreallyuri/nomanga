import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/nav";
import { SettingsDialog } from "@/components/settings";
import {
	SettingsUIProvider,
	useSettingsUI,
} from "@/components/settings/context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DownloadsProvider } from "@/hooks/services/use-downloads";
import { DeepLinkProvider } from "@/hooks/use-deep-link";

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<SettingsUIProvider>
			<DeepLinkProvider>
				<DownloadsProvider>
					<AppShell />
				</DownloadsProvider>
			</DeepLinkProvider>
		</SettingsUIProvider>
	);
}

function AppShell() {
	const { open, setOpen } = useSettingsUI();

	return (
		<SidebarProvider className="h-full overflow-hidden">
			<Sidebar onSettingsOpenChange={setOpen} settingsOpen={open} />
			<SidebarInset className="min-w-0 overflow-hidden">
				<main className="min-h-0 min-w-0 flex-1 overflow-hidden">
					<Outlet />
				</main>
			</SidebarInset>
			<SettingsDialog onOpenChange={setOpen} open={open} />
		</SidebarProvider>
	);
}
