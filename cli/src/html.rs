use nomanga_core::extension::repository::RepositoryIndex;

/// Renders the landing page that sits beside the index. Every link is relative
/// and the repository URL is derived from `location` at view time, so the page
/// shows the right thing wherever it ends up being served from — the generator
/// never has to be told its own hostname.
pub fn render(index: &RepositoryIndex) -> String {
    let mut extensions = String::new();

    for extension in &index.extensions {
        let sources = extension
            .sources
            .iter()
            .map(|source| {
                format!(
                    "<tr><td>{}</td><td><code>{}</code></td><td>{}</td><td>{}</td></tr>",
                    esc(&source.name),
                    esc(&source.id),
                    esc(&source.language),
                    if source.nsfw {
                        "<span class=\"nsfw\">nsfw</span>"
                    } else {
                        ""
                    }
                )
            })
            .collect::<String>();

        let mut hosts: Vec<&str> = extension
            .sources
            .iter()
            .flat_map(|source| source.hosts.iter().map(String::as_str))
            .collect();
        hosts.sort_unstable();
        hosts.dedup();

        let hosts = hosts
            .iter()
            .map(|host| format!("<li>{}</li>", esc(host)))
            .collect::<String>();

        extensions.push_str(&format!(
            r#"<section class="ext">
  <header>
    <h2>{name}</h2>
    <span class="meta">v{version} &middot; abi {abi} &middot; by {author}</span>
  </header>
  <table>
    <thead><tr><th>Source</th><th>Id</th><th>Language</th><th></th></tr></thead>
    <tbody>{sources}</tbody>
  </table>
  <details>
    <summary>Declared hosts ({host_count})</summary>
    <ul class="hosts">{hosts}</ul>
  </details>
  <a class="download" href="{download}" download>Download {download}</a>
</section>
"#,
            name = esc(&extension.info.name),
            version = esc(&extension.info.version),
            abi = extension.info.abi_version,
            author = esc(&extension.info.author),
            sources = sources,
            host_count = extension
                .sources
                .iter()
                .flat_map(|s| s.hosts.iter())
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            hosts = hosts,
            download = esc(&extension.download_url),
        ));
    }

    let description = index
        .description
        .as_deref()
        .map(|d| format!("<p class=\"lede\">{}</p>", esc(d)))
        .unwrap_or_default();

    let website = index
        .website
        .as_deref()
        .map(|w| format!("<a class=\"repo\" href=\"{0}\">{0}</a>", esc(w)))
        .unwrap_or_default();

    format!(
        r##"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} &mdash; nomanga extensions</title>
<style>
:root {{
  --bg: #fbfbfd; --fg: #16161a; --muted: #6b6b76;
  --card: #fff; --line: #e4e4ea; --accent: #4f46e5; --code: #f2f2f6;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg: #121216; --fg: #ececf1; --muted: #9a9aa6;
    --card: #1b1b21; --line: #2b2b33; --accent: #a5a0ff; --code: #23232b;
  }}
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 3rem 1.25rem 5rem; background: var(--bg); color: var(--fg);
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}}
main {{ max-width: 46rem; margin: 0 auto; }}
h1 {{ margin: 0 0 .25rem; font-size: 1.85rem; letter-spacing: -.02em; }}
.lede {{ margin: 0 0 .5rem; color: var(--muted); }}
.repo {{ color: var(--muted); font-size: .875rem; }}
.add {{
  margin: 2rem 0 2.5rem; padding: 1.15rem 1.25rem; background: var(--card);
  border: 1px solid var(--line); border-radius: .75rem;
}}
.add h2 {{ margin: 0 0 .35rem; font-size: .8rem; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }}
.add p {{ margin: .6rem 0 0; font-size: .875rem; color: var(--muted); }}
.open {{
  display: inline-block; margin-bottom: .85rem; padding: .55rem 1.1rem;
  background: var(--accent); color: #fff; border-radius: .5rem;
  font-size: .875rem; font-weight: 600; text-decoration: none;
}}
.row {{ display: flex; gap: .5rem; align-items: stretch; }}
#url {{
  flex: 1; min-width: 0; padding: .6rem .7rem; border: 1px solid var(--line);
  border-radius: .5rem; background: var(--code); color: var(--fg);
  font: .8125rem ui-monospace, SFMono-Regular, Menlo, monospace;
}}
button {{
  padding: .6rem 1rem; border: 0; border-radius: .5rem; cursor: pointer;
  background: var(--accent); color: #fff; font-size: .875rem; font-weight: 600;
}}
button:active {{ transform: translateY(1px); }}
.ext {{
  margin-bottom: 1.25rem; padding: 1.25rem; background: var(--card);
  border: 1px solid var(--line); border-radius: .75rem;
}}
.ext header {{ display: flex; flex-wrap: wrap; align-items: baseline; gap: .6rem; }}
.ext h2 {{ margin: 0; font-size: 1.15rem; }}
.meta {{ color: var(--muted); font-size: .8125rem; }}
table {{ width: 100%; border-collapse: collapse; margin: 1rem 0 .5rem;
  font-size: .875rem; display: block; overflow-x: auto; }}
th {{ text-align: left; font-size: .75rem; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); font-weight: 600; }}
th, td {{ padding: .4rem .75rem .4rem 0; border-bottom: 1px solid var(--line);
  white-space: nowrap; }}
code {{ background: var(--code); padding: .1rem .35rem; border-radius: .25rem;
  font: .8125rem ui-monospace, SFMono-Regular, Menlo, monospace; }}
.nsfw {{ background: #b4243a; color: #fff; padding: .05rem .4rem;
  border-radius: .25rem; font-size: .7rem; font-weight: 600; }}
details {{ margin-top: .75rem; font-size: .875rem; }}
summary {{ cursor: pointer; color: var(--muted); }}
.hosts {{ margin: .5rem 0 0; padding-left: 1.1rem; color: var(--muted);
  font: .8125rem ui-monospace, SFMono-Regular, Menlo, monospace; }}
.download {{ display: inline-block; margin-top: 1rem; color: var(--accent);
  font-size: .8125rem; text-decoration: none; }}
.download:hover {{ text-decoration: underline; }}
footer {{ margin-top: 3rem; color: var(--muted); font-size: .8125rem; }}
footer a {{ color: inherit; }}
</style>
</head>
<body>
<main>
  <h1>{name}</h1>
  {description}
  {website}

  <div class="add">
    <h2>Add this repository</h2>
    <a class="open" id="open" href="#">Open in nomanga</a>
    <div class="row">
      <input id="url" readonly value="index.min.json">
      <button id="copy" type="button">Copy</button>
    </div>
    <p>The button hands this URL to nomanga, which asks you to confirm before
    adding it &mdash; nothing installs on its own. If nothing happens, nomanga
    is not installed or has not registered the <code>nomanga://</code> handler;
    copy the URL into Settings &rarr; Extensions instead.</p>
  </div>

  {extensions}

  <footer>
    Machine-readable index:
    <a href="index.min.json">index.min.json</a> &middot;
    <a href="index.json">index.json</a><br>
    Extensions run sandboxed and may only reach the hosts they declare above.
  </footer>
</main>
<script>
  const field = document.getElementById("url");
  field.value = new URL("index.min.json", location.href).href;

  document.getElementById("open").href =
    "nomanga://add-repo?url=" + encodeURIComponent(field.value);

  document.getElementById("copy").addEventListener("click", async () => {{
    const button = document.getElementById("copy");
    try {{
      await navigator.clipboard.writeText(field.value);
    }} catch {{
      field.select();
      document.execCommand("copy");
    }}
    button.textContent = "Copied";
    setTimeout(() => {{ button.textContent = "Copy"; }}, 1500);
  }});
</script>
</body>
</html>
"##,
        name = esc(&index.name),
        description = description,
        website = website,
        extensions = extensions,
    )
}

fn esc(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use nomanga_core::extension::info::ExtensionInfo;
    use nomanga_core::extension::repository::RepositoryExtension;
    use nomanga_core::extension::source::SourceInfo;

    fn index() -> RepositoryIndex {
        RepositoryIndex {
            index_version: 1,
            name: "Test pack".into(),
            description: None,
            website: None,
            extensions: vec![RepositoryExtension {
                info: ExtensionInfo {
                    id: "dev.test.pack".into(),
                    name: "Test <Pack>".into(),
                    version: "0.1.0".into(),
                    abi_version: 5,
                    author: "a & b".into(),
                    website: None,
                },
                download_url: "test.wasm".into(),
                sources: vec![SourceInfo {
                    id: "com.example.en".into(),
                    name: "Example".into(),
                    version: "1.0".into(),
                    language: "en".into(),
                    base_url: "https://example.org".into(),
                    icon_url: None,
                    hosts: vec!["example.org".into()],
                    nsfw: true,
                    challenge: None,
                }],
            }],
        }
    }

    /// The page is one big raw string, so a stray `"#` in the markup truncates
    /// it. Checking that the closing tags survive catches that.
    #[test]
    fn renders_a_complete_document() {
        let page = render(&index());

        assert!(page.starts_with("<!doctype html>"));
        assert!(page.trim_end().ends_with("</html>"));
        assert!(page.contains("nomanga://add-repo?url="));
        assert!(page.contains("test.wasm"));
        assert!(page.contains("class=\"nsfw\""));
    }

    #[test]
    fn escapes_names_from_the_extension() {
        let page = render(&index());

        assert!(page.contains("Test &lt;Pack&gt;"));
        assert!(page.contains("a &amp; b"));
        assert!(!page.contains("Test <Pack>"));
    }
}
