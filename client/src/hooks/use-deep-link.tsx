import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { useSettingsUI } from "@/components/settings/context";

interface DeepLinkUI {
	/**
	 * A repository URL a `nomanga://add-repo` link asked to add, held until the
	 * user confirms or dismisses it. Never added on arrival — a link can come
	 * from any page on the internet.
	 */
	pendingRepository: string | null;
	clearPendingRepository: () => void;
}

const DeepLinkContext = createContext<DeepLinkUI | null>(null);

/**
 * Parses `nomanga://add-repo?url=…`, rejecting anything that is not an http(s)
 * URL so a link cannot point the app at a local file. The backend enforces this
 * again in `normalize_url`; this only keeps a bad link from reaching a dialog.
 */
function parseAddRepo(raw: string): string | null {
	let link: URL;
	try {
		link = new URL(raw);
	} catch {
		return null;
	}

	if (link.protocol !== "nomanga:") return null;

	const action = `${link.hostname}${link.pathname}`.replace(/\/+$/, "");
	if (action !== "add-repo") return null;

	const target = link.searchParams.get("url");
	if (!target) return null;

	return /^https?:\/\//i.test(target) ? target : null;
}

export function DeepLinkProvider({ children }: { children: ReactNode }) {
	const { openSettings } = useSettingsUI();
	const [pendingRepository, setPendingRepository] = useState<string | null>(
		null,
	);

	useEffect(() => {
		let disposed = false;

		function handle(urls: string[] | null, fromLaunch: boolean) {
			if (disposed || !urls?.length) return;

			const repository = urls.map(parseAddRepo).find(Boolean);
			if (!repository) {
				toast.error("That link is not something nomanga can open.");
				return;
			}

			setPendingRepository(repository);
			openSettings("Extensions");
			if (!fromLaunch) {
				getCurrentWindow()
					.setFocus()
					.catch(() => {});
			}
		}

		// onOpenUrl only fires while the app is already running, so a link that
		// started the app cold has to be read back from getCurrent.
		getCurrent()
			.then((urls) => handle(urls, true))
			.catch(() => {});

		const unlisten = onOpenUrl((urls) => handle(urls, false));

		return () => {
			disposed = true;
			unlisten.then((stop) => stop()).catch(() => {});
		};
	}, [openSettings]);

	const value = useMemo<DeepLinkUI>(
		() => ({
			pendingRepository,
			clearPendingRepository: () => setPendingRepository(null),
		}),
		[pendingRepository],
	);

	return (
		<DeepLinkContext.Provider value={value}>
			{children}
		</DeepLinkContext.Provider>
	);
}

export function useDeepLink() {
	const ctx = useContext(DeepLinkContext);
	if (!ctx) {
		throw new Error("useDeepLink must be used within a DeepLinkProvider");
	}
	return ctx;
}
