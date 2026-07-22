import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "./query";
import { ThemeProvider } from "./theme";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<QueryProvider>
			<ThemeProvider>
				<TooltipProvider>{children}</TooltipProvider>
			</ThemeProvider>
		</QueryProvider>
	);
}
