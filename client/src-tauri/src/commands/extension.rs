use nomanga_core::extension::source::SourceInfo;
use nomanga_core::extension::{config::Setting, info::ExtensionInfo};
use nomanga_services::cache::source as source_cache;
use nomanga_services::source::config;
use nomanga_services::source::preference::{self, SourcePreference};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::error::CommandError;
use crate::{error::CommandResult, AppState};
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct InstalledExtension {
    pub info: ExtensionInfo,
    pub sources: Vec<SourceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SourceSettings {
    pub schema: Vec<Setting>,
    pub values: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SourceWithPreference {
    pub info: SourceInfo,
    pub preference: SourcePreference,
}

#[tauri::command]
#[specta::specta]
pub async fn list_extensions(state: State<'_, AppState>) -> CommandResult<Vec<InstalledExtension>> {
    let registry = state.registry.read()?;

    Ok(registry
        .extensions()
        .iter()
        .map(|info| InstalledExtension {
            info: info.clone(),
            sources: registry.sources_of(&info.id),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_extension(
    state: State<'_, AppState>,
    extension_id: String,
) -> CommandResult<()> {
    let removed_sources = {
        let mut registry = state.registry.write()?;
        registry.uninstall(&extension_id)?
    };

    for source_id in removed_sources {
        preference::remove(&state.pool, &source_id).await?;
        config::clear(&state.pool, &source_id).await?;
        source_cache::clear(&state.pool, &source_id).await?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_sources_with_preferences(
    state: State<'_, AppState>,
) -> CommandResult<Vec<SourceWithPreference>> {
    let sources = {
        let registry = state.registry.read()?;
        registry.sources()
    };

    let mut stored: HashMap<String, SourcePreference> = preference::list(&state.pool)
        .await?
        .into_iter()
        .map(|p| (p.source_id.clone(), p))
        .collect();

    Ok(sources
        .into_iter()
        .map(|info| SourceWithPreference {
            preference: stored
                .remove(&info.id)
                .unwrap_or_else(|| SourcePreference::default_for(&info.id)),
            info,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn set_source_preference(
    state: State<'_, AppState>,
    preference: SourcePreference,
) -> CommandResult<()> {
    preference::set(&state.pool, &preference).await?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_source_settings(
    state: State<'_, AppState>,
    source_id: String,
) -> CommandResult<SourceSettings> {
    let handle = {
        let registry = state.registry.read()?;
        registry.source(&source_id)?
    };

    let id = source_id.clone();
    let schema =
        tauri::async_runtime::spawn_blocking(move || handle.with_plugin(|ext| ext.settings(&id)))
            .await
            .map_err(|e| CommandError::Internal {
                message: format!("settings task panicked: {e}"),
            })??;

    let values = config::config_for(&state.pool, &source_id).await?;

    Ok(SourceSettings { schema, values })
}

#[tauri::command]
#[specta::specta]
pub async fn save_source_settings(
    state: State<'_, AppState>,
    source_id: String,
    values: HashMap<String, String>,
) -> CommandResult<()> {
    config::set_many(&state.pool, &source_id, &values).await?;

    let config = config::config_for(&state.pool, &source_id).await?;

    let mut registry = state.registry.write()?;
    registry.reactivate(&source_id, config)?;

    Ok(())
}
