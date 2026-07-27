use nomanga_services::cache::image::{self, ImageCacheStats};
use tauri::State;

use crate::{error::CommandResult, AppState};

#[tauri::command]
#[specta::specta]
pub async fn image_cache_stats(state: State<'_, AppState>) -> CommandResult<ImageCacheStats> {
    let res = image::stats(&state.pool).await?;

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_image_cache(state: State<'_, AppState>) -> CommandResult<()> {
    image::clear(&state.pool, &state.image_cache_dir).await?;

    Ok(())
}
