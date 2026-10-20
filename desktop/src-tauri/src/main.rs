#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod downloads;
use serde::Serialize;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

#[derive(Serialize)]
struct NativeStatus {
    version: &'static str,
    windows: bool,
    autostart_registered: bool,
    autostart_error: Option<String>,
}

#[tauri::command]
fn native_status(app: tauri::AppHandle) -> NativeStatus {
    let auto = app.autolaunch();
    let state = auto.is_enabled();
    NativeStatus {
        version: env!("CARGO_PKG_VERSION"),
        windows: cfg!(windows),
        autostart_registered: state.as_ref().copied().unwrap_or(false),
        autostart_error: state.err().map(|e| e.to_string()),
    }
}

#[tauri::command]
fn native_set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let auto = app.autolaunch();
    if enabled {
        auto.enable().map_err(|e| format!("Falha ao ativar inicialização: {e}"))?;
    } else {
        auto.disable().map_err(|e| format!("Falha ao desativar inicialização: {e}"))?;
    }
    auto.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn native_alert(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    if title.trim().is_empty() || title.len() > 200 || body.len() > 500 {
        return Err("Notificação inválida".into());
    }
    let result = app.notification().builder().title(title).body(body).show();
    if let Err(ref err) = result {
        eprintln!("Envoxers: falha na notificação nativa: {err}");
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn native_badge(window: tauri::WebviewWindow, count: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        if count == 0 {
            return window.set_overlay_icon(None).map_err(|e| e.to_string());
        }
        let mut rgba = vec![0u8; 16 * 16 * 4];
        for y in 0..16i32 {
            for x in 0..16i32 {
                let d = (x - 8) * (x - 8) + (y - 8) * (y - 8);
                if d < 64 {
                    let i = ((y * 16 + x) * 4) as usize;
                    rgba[i..i + 4].copy_from_slice(if d > 42 {
                        &[255, 255, 255, 255]
                    } else {
                        &[220, 43, 70, 255]
                    });
                }
            }
        }
        window
            .set_overlay_icon(Some(Image::new_owned(rgba, 16, 16)))
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (window, count);
        Ok(())
    }
}

fn abrir(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn configurar_autostart(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&dir)?;
    let marker = dir.join("autostart-v2-visible");
    if marker.exists() {
        return Ok(());
    }
    let antigo = dir.join("autostart-configurado").exists();
    let auto = app.autolaunch();
    if antigo {
        // Preserva a escolha do usuário: somente reescreve a entrada se ela
        // já estava ativa. A versão anterior iniciava OCULTA na bandeja.
        if auto.is_enabled()? {
            auto.disable()?;
            auto.enable()?;
        }
    } else {
        auto.enable()?;
    }
    std::fs::write(marker, b"configurado")?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| abrir(app)))
        .plugin(tauri_plugin_notification::init())
        // Sem --minimized: o usuário consegue ver que o app iniciou com o Windows.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            native_alert,
            native_badge,
            native_status,
            native_set_autostart,
            downloads::native_download,
            downloads::native_save_file
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Abrir Envoxers", true, None::<&str>)?;
            let startup = MenuItem::with_id(
                app, "startup", "Alternar início com Windows", true, None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Encerrar Envoxers", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &startup, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("ícone do aplicativo").clone())
                .tooltip("Envoxers Desktop")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => abrir(app),
                    "startup" => {
                        let auto = app.autolaunch();
                        let result = if auto.is_enabled().unwrap_or(false) {
                            auto.disable()
                        } else {
                            auto.enable()
                        };
                        if let Err(err) = result {
                            eprintln!("Envoxers: falha ao alterar autostart: {err}");
                        }
                    }
                    "quit" => app.exit(0),
                    _ => (),
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        abrir(tray.app_handle());
                    }
                })
                .build(app)?;
            if let Err(err) = configurar_autostart(app.handle()) {
                // Não impede o usuário de abrir o Envoxers caso o Windows
                // bloqueie o registro de inicialização automática.
                eprintln!("Envoxers: autostart não configurado: {err}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar Envoxers Desktop");
}
