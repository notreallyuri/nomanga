#!/usr/bin/env bash
# Registers the dev build with the desktop environment, without packaging it.
# Re-run after every rebuild you want to actually use: the binary is copied out
# of target/, not linked into it, so an install survives `cargo clean` wiping
# tens of gigabytes. The trade is that a rebuild alone does not update it.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo/target/release/nomanga-client"

[[ -x "$bin" ]] || { echo "no binary at $bin — run: cargo tauri build --no-bundle" >&2; exit 1; }

# argv[0] becomes the GTK prgname, which is what Wayland reports as app_id, so
# launching through a file named nomanga is what makes the launcher match the
# window to this .desktop file. A copy carries that as well as a symlink did.
install -Dm755 "$bin" "$HOME/.local/bin/nomanga"

# The packaged .desktop uses a bare Exec=nomanga, which is right for /usr/bin
# but not here: the compositor is started outside systemd and never sources the
# shell rc that adds ~/.local/bin, so a launcher child cannot resolve the name.
install -Dm644 "$repo/packaging/nomanga.desktop" \
	"$HOME/.local/share/applications/nomanga.desktop"
sed -i "s|^Exec=nomanga$|Exec=$HOME/.local/bin/nomanga|" \
	"$HOME/.local/share/applications/nomanga.desktop"

for size in 32 128; do
	install -Dm644 "$repo/client/src-tauri/icons/${size}x${size}.png" \
		"$HOME/.local/share/icons/hicolor/${size}x${size}/apps/nomanga.png"
done
install -Dm644 "$repo/client/src-tauri/icons/128x128@2x.png" \
	"$HOME/.local/share/icons/hicolor/256x256/apps/nomanga.png"

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "installed: ~/.local/bin/nomanga (copied from $bin)"
