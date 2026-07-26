import { createRootRoute, Outlet } from "@tanstack/react-router";
import * as React from "react";
import { Titlebar } from "@/components/titlebar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<React.Fragment>
			<div className="flex h-svh flex-col overflow-hidden">
				<Titlebar />
				<div className="min-h-0 flex-1">
					<Outlet />
				</div>
			</div>
			<Toaster />
		</React.Fragment>
	);
}
