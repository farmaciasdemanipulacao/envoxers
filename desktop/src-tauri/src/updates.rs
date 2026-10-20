use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

static INSTALLING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

#[tauri::command]
pub async fn native_check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| format!("Atualizador indisponível: {e}"))?;
    let update = updater.check().await.map_err(|e| format!("Falha ao consultar atualizações: {e}"))?;
    Ok(update.map(|update| UpdateInfo {
        version: update.version.to_string(),
        notes: update.body.unwrap_or_default(),
    }))
}

#[tauri::command]
pub async fn native_install_update(app: AppHandle) -> Result<(), String> {
    if INSTALLING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("Já existe uma atualização em andamento".into());
    }
    let result: Result<(), String> = async {
        let updater = app.updater().map_err(|e| e.to_string())?;
        let update = updater.check().await.map_err(|e| format!("Falha ao consultar versão: {e}"))?
            .ok_or("Nenhuma atualização disponível")?;
        let version = update.version.to_string();
        let _ = app.emit("envoxers:update-progress", format!("Baixando versão {version}…"));
        let handle = app.clone();
        update.download_and_install(
            move |_bytes, _total| {
                let _ = handle.emit("envoxers:update-progress", "Baixando atualização…");
            },
            || {},
        ).await.map_err(|e| format!("Não foi possível instalar a atualização: {e}"))?;
        Ok(())
    }.await;
    if result.is_err() {
        INSTALLING.store(false, Ordering::SeqCst);
    }
    result
}
