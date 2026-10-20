use tauri::Manager;
use tokio::io::AsyncWriteExt;
use base64::Engine;
use std::path::Path;

const LIMIT: u64 = 300 * 1024 * 1024;
fn safe_name(name: &str) -> String {
    let s: String = name.chars().take(160).map(|c|
        if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }
    ).collect();
    let s = s.trim().trim_matches('.').trim().to_string();
    let s = if s.is_empty() { "arquivo".to_string() } else { s };
    let stem = s.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON","PRN","AUX","NUL","COM1","COM2","COM3","LPT1","LPT2","LPT3"].contains(&stem.as_str()) {
        format!("_{s}")
    } else { s }
}

async fn save_bytes(app: &tauri::AppHandle, name: &str, bytes: &[u8]) -> Result<String, String> {
    let folder = app.path().download_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&folder).await.map_err(|e| e.to_string())?;
    let name = safe_name(name);
    let p = Path::new(&name);
    let stem = p.file_stem().and_then(|x| x.to_str()).unwrap_or("arquivo");
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
    for i in 0..1000 {
        let candidate = if i == 0 { name.clone() } else if ext.is_empty() {
            format!("{stem} ({i})")
        } else { format!("{stem} ({i}).{ext}") };
        let dest = folder.join(&candidate);
        match tokio::fs::OpenOptions::new().write(true).create_new(true).open(&dest).await {
            Ok(mut file) => {
                let written = file.write_all(bytes).await;
                drop(file);
                if let Err(err) = written {
                    let _ = tokio::fs::remove_file(&dest).await;
                    return Err(format!("Falha ao salvar: {err}"));
                }
                return Ok(candidate);
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("Falha na pasta Downloads: {err}")),
        }
    }
    Err("Muitos arquivos com o mesmo nome".into())
}

#[tauri::command]
pub async fn native_save_file(app: tauri::AppHandle, filename: String, data_base64: String) -> Result<String, String> {
    if data_base64.len() > 17_000_000 { return Err("Relatório acima de 12 MB".into()); }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_base64)
        .map_err(|_| "Arquivo codificado inválido")?;
    if bytes.len() > 12 * 1024 * 1024 { return Err("Relatório acima de 12 MB".into()); }
    save_bytes(&app, &filename, &bytes).await
}

#[tauri::command]
pub async fn native_download(app: tauri::AppHandle, url: String, filename: Option<String>) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "URL inválida")?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("envoxers.envox.com.br")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some() {
        return Err("Apenas downloads do domínio oficial são permitidos".into());
    }
    let stored = parsed.path().strip_prefix("/api/v1/uploads/")
        .ok_or("Este link não é um anexo do Envoxers")?;
    if stored.is_empty() || stored.contains('/') || stored.contains('\\') {
        return Err("Nome do anexo inválido".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(600))
        .build().map_err(|e| e.to_string())?;
    let mut response = client.get(parsed).send().await.map_err(|e| format!("Falha de conexão: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Servidor recusou o download (HTTP {})", response.status()));
    }
    if response.content_length().unwrap_or(0) > LIMIT { return Err("Arquivo acima de 300 MB".into()); }
    let name = filename.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| stored.to_string());
    let folder = app.path().download_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&folder).await.map_err(|e| e.to_string())?;
    let name = safe_name(&name);
    let p = Path::new(&name);
    let stem = p.file_stem().and_then(|x| x.to_str()).unwrap_or("arquivo");
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
    for i in 0..1000 {
        let candidate = if i == 0 { name.clone() } else if ext.is_empty() {
            format!("{stem} ({i})")
        } else { format!("{stem} ({i}).{ext}") };
        let dest = folder.join(&candidate);
        let file = tokio::fs::OpenOptions::new().write(true).create_new(true).open(&dest).await;
        let mut file = match file {
            Ok(file) => file,
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("Falha na pasta Downloads: {err}")),
        };
        let outcome: Result<(), String> = async {
            let mut total = 0u64;
            while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
                total += chunk.len() as u64;
                if total > LIMIT { return Err("Arquivo acima de 300 MB".into()); }
                file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            }
            file.flush().await.map_err(|e| e.to_string())?;
            Ok(())
        }.await;
        drop(file);
        if let Err(err) = outcome {
            let _ = tokio::fs::remove_file(&dest).await;
            return Err(err);
        }
        return Ok(candidate);
    }
    Err("Muitos arquivos com o mesmo nome".into())
}
