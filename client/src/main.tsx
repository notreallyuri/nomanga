import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installPackagedGuards } from "./lib/packaged-guards";
import type { NomangaError } from "./lib/unwrap";
import { Providers } from "./providers";
import { routeTree } from "./routeTree.gen";
import "./globals.css";

installPackagedGuards();

const router = createRouter({ routeTree, scrollRestoration: true });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

declare module "@tanstack/react-query" {
	interface Register {
		defaultError: NomangaError;
	}
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Providers>
			<RouterProvider router={router} />
		</Providers>
	</StrictMode>,
);
