use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

static INSTALLING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    phase: &'static str,
    received: u64,
    total: Option<u64>,
    percent: Option<u64>,
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
        let _ = app.emit("envoxers:update-progress", UpdateProgress {
            phase: "downloading", received: 0, total: None, percent: None,
        });
        let handle = app.clone();
        let mut received = 0u64;
        let mut last_percent = None;
        let mut last_sent = Instant::now();
        update.download_and_install(
            move |bytes, total| {
                received = received.saturating_add(bytes as u64);
                let percent = total.filter(|n| *n > 0)
                    .map(|n| received.saturating_mul(100).checked_div(n).unwrap_or(0).min(100));
                if percent != last_percent || last_sent.elapsed() >= Duration::from_millis(180) {
                    let _ = handle.emit("envoxers:update-progress", UpdateProgress {
                        phase: "downloading", received, total, percent,
                    });
                    last_percent = percent;
                    last_sent = Instant::now();
                }
            },
            || {},
        ).await.map_err(|e| format!("Não foi possível instalar a atualização: {e}"))?;
        let _ = app.emit("envoxers:update-progress", UpdateProgress {
            phase: "installed", received: 0, total: None, percent: Some(100),
        });
        Ok(())
    }.await;
    if result.is_err() {
        INSTALLING.store(false, Ordering::SeqCst);
    }
    result
}
