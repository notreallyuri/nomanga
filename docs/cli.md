# CLI reference

`nomanga-cli` runs and inspects an extension `.wasm` without launching the app,
and builds a repository index. It is the fast loop while writing a source: no
app, no database, no install.

```sh
cargo install --git https://github.com/notreallyuri/nomanga nomanga-cli
# or, in this repo
cargo run -p nomanga-cli -- <args>
```

Prebuilt binaries ride along on each
[release](https://github.com/notreallyuri/nomanga/releases) —
`nomanga-cli-linux`, `-macos`, `-windows.exe` — which avoids a wasmtime compile.

## Running a source

`--wasm` selects the extension; `--source` selects one source inside it.

```sh
W=path/to/extension.wasm

nomanga-cli --wasm $W info
nomanga-cli --wasm $W --source <id> homepage
nomanga-cli --wasm $W --source <id> filters
nomanga-cli --wasm $W --source <id> search "spy family" [--page 2]
nomanga-cli --wasm $W --source <id> section <section_id> [--page 2]
nomanga-cli --wasm $W --source <id> manga <manga_id>
nomanga-cli --wasm $W --source <id> chapters <manga_id>
nomanga-cli --wasm $W --source <id> pages <manga_id> <chapter_id>
```

`info` needs no `--source` — it prints the extension's name, version, ABI, every
source it bundles and the union of their declared hosts.

Add `--json` anywhere for compact output instead of pretty-printed.

Two caveats: the CLI has no async runtime, so requests go through a blocking
client rather than the app's reqwest bridge; and it activates sources with an
empty config, so anything gated behind a setting takes its fallback.

## Building an index

```sh
nomanga-cli index --name "My pack" \
  [--description "..."] [--website "https://..."] \
  [--base-url "https://..."] \
  [--out docs/index.min.json] [--json] \
  [--html docs/index.html] \
  docs/*.wasm
```

Reads metadata out of the binaries, so the published `abi_version` and source
lists cannot drift from what shipped.

| Flag | Effect |
|---|---|
| `--out` | Write to a file instead of stdout |
| `--json` | Compact rather than pretty — what `index.min.json` should be |
| `--html` | Also write a self-contained landing page |
| `--base-url` | Absolute download URLs. Omit it and each is a bare file name resolved against the index's own URL, which is what makes a repository portable |

See [Publishing a repository](publishing.md).

## Building an icon

```sh
nomanga-cli icon <url-or-file> --out icons/example.txt
```

Fetches (or reads) an image, normalises it to a 64×64 PNG and writes a `data:` URI
with no trailing newline, ready for `include_str!`. Takes a local file because
some favicons cannot be fetched — behind Cloudflare, or served from a path other
than `/favicon.ico`.
