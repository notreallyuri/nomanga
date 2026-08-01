// What a session costs and how much of it comes back.
//
// Walks the path the app walks -- install, call each source, let the sweep
// evict them -- printing resident memory at each step, so a change to how
// plugins are cached can be checked against a number rather than an argument.
//
//     cargo run --release --example rss -- path/to/extension.wasm [calls]
use nomanga_host::registry::Registry;
use nomanga_host::transport::denied;
use std::collections::HashMap;
use std::time::Duration;

fn rss_kb() -> u64 {
    let statm = std::fs::read_to_string("/proc/self/statm").unwrap_or_default();
    statm
        .split_whitespace()
        .nth(1)
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0)
        * 4
}

fn mark(label: &str, base: u64) {
    println!(
        "{label:<38} rss {:>7} KB   ({:+} KB)",
        rss_kb(),
        rss_kb() as i64 - base as i64
    );
}

fn trim() {
    #[cfg(all(target_os = "linux", target_env = "gnu"))]
    {
        unsafe extern "C" {
            fn malloc_trim(pad: usize) -> i32;
        }
        unsafe { malloc_trim(0) };
    }
}

fn main() {
    let wasm = std::env::args().nth(1).expect("usage: rss <extension.wasm>");
    let calls: usize = std::env::args()
        .nth(2)
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);

    let dir = std::env::temp_dir().join(format!("nomanga-rss-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");

    let base = rss_kb();
    println!("baseline                               rss {base:>7} KB");

    let configs: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut registry = Registry::empty(&dir, denied());
    registry.install(&wasm, &configs).expect("install");
    mark("after install (compiles a snapshot)", base);

    let sources = registry.sources();
    println!("{} source(s), {calls} call(s) each", sources.len());

    for info in &sources {
        let handle = registry.source(&info.id).expect("source");
        for _ in 0..calls {
            // Any export would do; this only has to run guest code.
            handle.with_plugin(|_| Ok(())).expect("call");
        }
        mark(&format!("after calling {}", info.id), base);
    }

    let peak = rss_kb();
    println!("loaded: {}", registry.loaded_count());

    let evicted = registry.evict_idle(Duration::ZERO);
    mark(&format!("after evicting {evicted} source(s)"), base);

    trim();
    mark("after releasing to the OS", base);

    let end = rss_kb();
    println!(
        "\npeak {peak} KB (+{}), settled {end} KB (+{}) -- {}% of the session's growth returned",
        peak as i64 - base as i64,
        end as i64 - base as i64,
        (100.0 * (peak - end) as f64 / (peak - base).max(1) as f64).round() as i64
    );

    std::fs::remove_dir_all(&dir).ok();
}
