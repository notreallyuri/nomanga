// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer composites the second webview in a process to
    // black under Wayland — the app's own window is fine, the challenge window
    // opens empty. Has to be set before webkit initialises, so main() is the
    // only place it fits. Only respected on Linux; the var is read once at
    // startup, so setting it here costs nothing on the platforms that ignore it.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    nomanga_client_lib::run()
}
