import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const json = path => JSON.parse(read(path));

const commands = ["native_alert", "native_badge", "native_status", "native_set_autostart"];
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
const registered = handler[1].split(",").map(s => s.trim()).filter(Boolean);
assert.deepEqual([...registered].sort(), [...commands].sort(), "invoke_handler difere do AppManifest");

assert.deepEqual(cap.windows, ["main"], "Somente a janela main deve acessar comandos");
assert.deepEqual(cap.remote?.urls, ["https://envoxers.envox.com.br/*"], "Origem remota não pode ser ampliada");
assert.deepEqual(cap.permissions, ["core:default", ...expectedPermissions], "Permissões explícitas faltando");
assert.deepEqual(conf.app.security.capabilities, ["envoxers-remote"], "Capability não ativada");

const js = read("../frontend/public/runtime-boot.js") + read("../frontend/public/desktop-diagnostics.js");
for (const command of commands) {
  assert.ok(js.includes('"' + command + '"'), "Frontend não invoca comando: " + command);
}
assert.equal(conf.version, "0.2.1");
assert.equal(pkg.version, conf.version);
assert.equal(lock.version, pkg.version);
console.log("NATIVE_ACL_OK: 4 comandos registrados, 4 permissões remotas explícitas, domínio restrito.");
