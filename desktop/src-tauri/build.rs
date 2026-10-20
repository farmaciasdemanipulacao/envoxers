// Comandos nativos devem constar do AppManifest para que a ACL do
// conteúdo remoto possa autorizá-los individualmente.
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "native_alert",
                "native_badge",
                "native_status",
                "native_set_autostart",
                "native_download",
                "native_save_file",
                "native_check_update",
                "native_install_update",
            ]),
        ),
    )
    .expect("Falha ao gerar as permissoes ACL do Envoxers Desktop");
}
