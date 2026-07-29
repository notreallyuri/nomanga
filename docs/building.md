# Building & running

Prerequisites: a Rust toolchain (edition 2024), `pnpm`, and the
[Tauri v2 system dependencies](https://tauri.app/start/prerequisites/) for your OS.

## Desktop app

```sh
cd client
pnpm install
pnpm tauri dev        # run the app
pnpm tauri build      # production bundle
```

A debug build also regenerates `client/src/types/bindings.ts`. That write is
relative to `client/src-tauri`, so it is skipped with a warning when the binary
starts from anywhere else — which is what happens when a `nomanga://` link
launches it. Use the test to regenerate deliberately:

```sh
SQLX_OFFLINE=true cargo test -p client --test export_bindings
```

## Tests

```sh
SQLX_OFFLINE=true cargo test --workspace
SQLX_OFFLINE=true cargo check --workspace --all-targets   # what CI runs
```

`packages/host/tests/reinstall.rs` needs a real extension and skips unless
`TEST_WASM` points at one:

```sh
TEST_WASM=/path/to/extension.wasm cargo test -p nomanga-host --test reinstall
```

## Packaged builds

The `Build` workflow (Actions → Build → Run workflow) builds on Linux, macOS and
Windows and uploads the bundles as artifacts. Tagged runs attach them to a draft
release, along with `nomanga-cli` for each platform.

| Platform | Artifact | Notes |
|---|---|---|
| Windows | `.exe` (NSIS), `.msi` | Unsigned — SmartScreen shows a dismissible warning. |
| macOS | `.dmg` (universal) | Unsigned — Gatekeeper **refuses** to open it. Right-click → Open, or `xattr -dr com.apple.quarantine /Applications/nomanga.app`. |
| Linux | `.deb`, `.AppImage` | Built on Ubuntu 24.04, so glibc 2.39 or newer. |
| Linux | `.rpm` | ⚠️ **Untested.** Built on Ubuntu, not Fedora — the file is produced, but its dependency names come from Tauri's list rather than Fedora's, so it may not resolve on install. |

### Code signing

Both unsigned warnings are a paid problem, not a fixable one: macOS needs an Apple
Developer Program membership, Windows an OV/EV certificate or Azure Trusted
Signing. Neither is set up.

### Arch

Use `packaging/arch/PKGBUILD` rather than any of the above.

**Do not build the AppImage locally.** linuxdeploy's GTK plugin copies
`/usr/lib/gdk-pixbuf-2.0/2.10.0`, which `gdk-pixbuf2` 2.44 no longer ships, so
`pnpm tauri build` fails at the bundling step. Pass `--no-bundle` (as the PKGBUILD
does) or `--bundles deb`.

Note that cargo names the binary after the crate (`client`); `productName` only
renames it inside a bundle, which `--no-bundle` skips. The PKGBUILD installs
`target/release/client` as `/usr/bin/nomanga`.

`packaging/install-local.sh` registers a dev build with your desktop environment
without packaging it. Rerun it after changes to `packaging/nomanga.desktop` — it
is what registers `MimeType=x-scheme-handler/nomanga` for `nomanga://` links.

## Extensions

Extensions build separately, targeting WebAssembly. See
[Writing a source](writing-a-source.md) — each extension repo pins
`wasm32-unknown-unknown` in `.cargo/config.toml`, so a plain
`cargo build --release` produces the `.wasm`.
