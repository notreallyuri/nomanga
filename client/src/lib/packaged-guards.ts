const DEVTOOLS_KEYS = new Set(["I", "J", "C"]);

function isEditable(target: EventTarget | null) {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/**
 * Suppresses the webview's own context menu and inspector shortcuts in a built
 * app. Only the native menu goes away — base-ui's ContextMenu runs its own
 * `contextmenu` handler and does not care that the default was prevented.
 */
export function installPackagedGuards() {
	if (import.meta.env.DEV) return;

	window.addEventListener(
		"contextmenu",
		(event) => {
			// Text fields keep theirs, or cut/copy/paste becomes unreachable for
			// anyone who does not know the shortcuts.
			if (isEditable(event.target)) return;
			event.preventDefault();
		},
		{ capture: true },
	);

	window.addEventListener(
		"keydown",
		(event) => {
			const key = event.key.toUpperCase();
			const modifier = event.ctrlKey || event.metaKey;

			if (
				key === "F12" ||
				(modifier && event.shiftKey && DEVTOOLS_KEYS.has(key)) ||
				(event.metaKey && event.altKey && (key === "I" || key === "C"))
			) {
				event.preventDefault();
				return;
			}

			// View source. Ctrl+U also erases the line in a GTK text field, so
			// editable targets are left alone.
			if (modifier && key === "U" && !isEditable(event.target)) {
				event.preventDefault();
			}
		},
		{ capture: true },
	);
}
