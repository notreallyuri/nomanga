use crate::error::{ServiceError, ServiceResult};
use std::path::Path;

const HOOK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

pub(super) async fn run_hook(kind: &str, command: &str, folder: &Path) -> ServiceResult<()> {
    // `{folder_name}` / `{folder_parent}` exist because tools that transfer a
    // directory take the parent as the destination: downloading back into
    // `{folder}` itself would nest a copy inside it.
    let rendered = command
        .replace("{folder_parent}", &lossy(folder.parent().unwrap_or(folder)))
        .replace(
            "{folder_name}",
            &folder
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
        )
        .replace("{folder}", &lossy(folder));

    let mut cmd = if cfg!(windows) {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C");
        c
    } else {
        let mut c = tokio::process::Command::new("sh");
        c.arg("-c");
        c
    };
    cmd.arg(&rendered);

    let output = tokio::time::timeout(HOOK_TIMEOUT, cmd.output())
        .await
        .map_err(|_| ServiceError::SyncHookTimeout {
            kind: kind.to_owned(),
            seconds: HOOK_TIMEOUT.as_secs(),
        })?
        .map_err(|e| ServiceError::SyncHookFailed {
            kind: kind.to_owned(),
            detail: e.to_string(),
        })?;

    if output.status.success() {
        return Ok(());
    }

    // stderr is where these tools explain themselves; fall back to stdout so a
    // failing hook is never reported as a bare exit code.
    let mut detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if detail.is_empty() {
        detail = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    }
    if detail.is_empty() {
        detail = format!("exited with {}", output.status);
    }

    Err(ServiceError::SyncHookFailed {
        kind: kind.to_owned(),
        detail,
    })
}

fn lossy(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub(super) fn non_empty(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}
