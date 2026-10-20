import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const json = path => JSON.parse(read(path));

const commands = ["native_alert", "native_badge", "native_status", "native_set_autostart",   "native_download", "native_save_file", "native_open_downloads", "native_check_update", "native_install_update"];
const expectedPermissions = commands.map(c => "allow-" + c.replaceAll("_", "-"));
const build = read("src-tauri/build.rs");
const main = read("src-tauri/src/main.rs");
const cap = json("src-tauri/capabilities/envoxers-remote.json");
const conf = json("src-tauri/tauri.conf.json");
const pkg = json("package.json");
const lock = json("package-lock.json");

assert.match(build, /AppManifest::new\(\)\.commands\(/, "AppManifest precisa registrar comandos nativos");
const manifestList = build.match(/AppManifest::new\(\)\.commands\(&\[([\s\S]*?)\]\)/);
assert.ok(manifestList, "Lista de comandos no AppManifest ausente");
const declared = [...manifestList[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
assert.deepEqual([...declared].sort(), [...commands].sort(), "Manifest não corresponde aos comandos esperados");

const handler = main.match(/tauri::generate_handler!\[([\s\S]*?)\]/);
assert.ok(handler, "invoke_handler não encontrado");
const registered = handler[1].split(",").map(s => s.trim().split("::").at(-1)).filter(Boolean);
assert.deepEqual([...registered].sort(), [...commands].sort(), "invoke_handler difere do AppManifest");

assert.deepEqual(cap.windows, ["main"], "Somente a janela main deve acessar comandos");
assert.deepEqual(cap.remote?.urls, ["https://envoxers.envox.com.br/*"], "Origem remota não pode ser ampliada");
assert.deepEqual(cap.permissions, ["core:default", ...expectedPermissions], "Permissões explícitas faltando");
assert.deepEqual(conf.app.security.capabilities, ["envoxers-remote"], "Capability não ativada");

const js = read("../frontend/public/runtime-boot.js") + read("../frontend/public/desktop-diagnostics.js") + read("../frontend/public/desktop-downloads.js") + read("../frontend/public/desktop-updater.js");
for (const command of commands) {
  assert.ok(js.includes('"' + command + '"'), "Frontend não invoca comando: " + command);
}
const nativeDownload = read("src-tauri/src/downloads.rs");
assert.ok(nativeDownload.includes('Some("envoxers.envox.com.br")'), "Domínio do download não está restrito");
assert.ok(nativeDownload.includes('"/api/v1/uploads/"'), "Caminho do download não está restrito");
assert.ok(nativeDownload.includes("create_new(true)"), "Downloads não podem sobrescrever arquivos");
assert.ok(nativeDownload.includes("LIMIT"), "Download precisa limitar o tamanho");
assert.match(nativeDownload, /envoxers:download-progress/, "Progresso nativo ausente");
assert.match(nativeDownload, /explorer\.exe/, "Abertura da pasta Downloads ausente");
assert.match(nativeDownload, /download_dir\(\)/, "Pasta Downloads precisa ser resolvida pelo Windows");
assert.match(read("../frontend/public/desktop-downloads.js"), /envox-download-panel/, "Gerenciador de downloads ausente");
assert.match(read("../frontend/public/desktop-downloads.js"), /video\.currentTime/, "Prévia de vídeo ausente");
assert.match(read("src-tauri/src/updates.rs"), /envoxers:update-progress/, "Progresso do atualizador ausente");
assert.equal(conf.version, "0.3.2");
assert.equal(conf.plugins?.updater?.endpoints?.[0], "https://envoxers.envox.com.br/desktop-updates/latest.json");
assert.ok(conf.plugins?.updater?.pubkey?.length > 100, "Chave pública do atualizador ausente");
assert.equal(conf.bundle.createUpdaterArtifacts, false, "Assinatura deve ocorrer apenas na VPS");
assert.match(read("src-tauri/src/main.rs"), /tauri_plugin_updater::Builder::new/);
assert.match(read("src-tauri/src/updates.rs"), /download_and_install/);
assert.match(read("scripts/publish-signed-updates.py"), /--private-key-path/);
assert.match(read("../.github/workflows/envoxers-desktop-windows.yml"), /gh release create/);
assert.equal(pkg.version, conf.version);
assert.equal(lock.version, pkg.version);
console.log("NATIVE_ACL_OK: 9 comandos, progresso de downloads e pasta nativa, atualizador assinado.");
