#!/usr/bin/env python3
"""Publica atualizações Windows assinadas a partir de releases do GitHub.

A chave privada NUNCA sai da VPS; o GitHub Actions só publica o instalador.
O endpoint latest.json só é trocado após download, assinatura e verificações.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen

ROOT = Path("/docker/envoxers")
OUT = ROOT / "frontend/public/desktop-updates"
KEY = Path("/etc/envoxers-desktop-updater/signing.key")
CLI = ROOT / "desktop/node_modules/.bin/tauri"
RELEASES = "https://api.github.com/repos/farmaciasdemanipulacao/envoxers/releases?per_page=30"
BASE = "https://envoxers.envox.com.br/desktop-updates"
MAX_BYTES = 150 * 1024 * 1024
TAG_RE = re.compile(r"^desktop-v(\d+)\.(\d+)\.(\d+)$")
ALLOWED_FILE = re.compile(r"^[A-Za-z0-9 _.()+-]+-setup\.exe$")


def fetch_json(url):
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "Envoxers-Desktop-Signed-Updater/1.0",
    })
    with urlopen(request, timeout=25) as response:
        return json.load(response)


def latest_release(releases):
    candidates = []
    for release in releases:
        match = TAG_RE.fullmatch(release.get("tag_name", ""))
        if not match or release.get("draft") or release.get("prerelease"):
            continue
        if release.get("author", {}).get("login") != "github-actions[bot]":
            continue
        candidates.append((tuple(map(int, match.groups())), release))
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])


def pick_asset(release, version):
    matches = []
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if not ALLOWED_FILE.fullmatch(name):
            continue
        if f"_{version}_x64-setup.exe" not in name:
            continue
        url = asset.get("browser_download_url", "")
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "github.com":
            continue
        if not unquote(parsed.path).startswith(
            f"/farmaciasdemanipulacao/envoxers/releases/download/desktop-v{version}/"
        ):
            continue
        if unquote(parsed.path).split("/")[-1] != name:
            continue
        if asset.get("size", 0) > MAX_BYTES:
            continue
        matches.append((name, url))
    if len(matches) != 1:
        raise RuntimeError(f"Release {version}: esperado exatamente um instalador NSIS x64")
    return matches[0]


def download(url, destination):
    request = Request(url, headers={"User-Agent": "Envoxers-Desktop-Signed-Updater/1.0"})
    digest = hashlib.sha256()
    total = 0
    with urlopen(request, timeout=45) as response, destination.open("xb") as file:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                raise RuntimeError("Instalador excede o limite permitido")
            digest.update(chunk)
            file.write(chunk)
    if total < 100_000:
        raise RuntimeError("Instalador pequeno demais para ser válido")
    if destination.open("rb").read(2) != b"MZ":
        raise RuntimeError("Instalador não é um executável Windows válido")
    return total, digest.hexdigest()


def sign(executable, version):
    if not KEY.is_file() or not CLI.is_file():
        raise RuntimeError("Chave ou assinador indisponível")
    if KEY.stat().st_mode & 0o077:
        raise RuntimeError("Permissões da chave privada são excessivas")
    process = subprocess.run(
        [str(CLI), "signer", "sign", "--private-key-path", str(KEY),
         "--app-version", version, str(executable)],
        cwd=str(ROOT / "desktop"),
        capture_output=True, text=True, timeout=90, check=False,
    )
    if process.returncode:
        raise RuntimeError(f"Assinatura falhou (código {process.returncode})")
    sig = executable.with_name(executable.name + ".sig")
    if not sig.exists():
        raise RuntimeError("Assinatura não foi gerada")
    signature = sig.read_text(encoding="utf-8").strip()
    if not signature or len(signature) < 80:
        raise RuntimeError("Assinatura inválida")
    return signature


def publish():
    OUT.mkdir(parents=True, exist_ok=True)
    selected = latest_release(fetch_json(RELEASES))
    if not selected:
        print("Nenhuma release Windows assinável encontrada; aguardando.")
        return
    parts, release = selected
    version = ".".join(map(str, parts))
    manifest_file = OUT / "latest.json"
    if manifest_file.exists():
        current = json.loads(manifest_file.read_text(encoding="utf-8"))
        if tuple(map(int, current["version"].split("."))) > parts:
            print("Release mais antiga ignorada; sem downgrade.")
            return
        if current.get("version") == version:
            target_url = current.get("platforms", {}).get("windows-x86_64", {}).get("url", "")
            filename = target_url.rsplit("/", 1)[-1]
            if filename and (OUT / filename).exists():
                print(f"Versão {version} já publicada; sem alterações.")
                return

    name, url = pick_asset(release, version)
    with tempfile.TemporaryDirectory(prefix="envoxers-signer-") as temp:
        tempdir = Path(temp)
        executable = tempdir / name
        size, sha256 = download(url, executable)
        signature = sign(executable, version)
        final = OUT / name
        if final.exists():
            existing_sha = hashlib.sha256(final.read_bytes()).hexdigest()
            if existing_sha != sha256:
                raise RuntimeError("Instalador existente tem conteúdo diferente; publicação bloqueada")
        else:
            os.replace(executable, final)
            os.chmod(final, 0o644)
        (OUT / f"{name}.sig").write_text(signature + "\n", encoding="utf-8")
        os.chmod(OUT / f"{name}.sig", 0o644)
        manifest = {
            "version": version,
            "notes": (release.get("body") or f"Envoxers Desktop {version}: melhorias e correções.")[:1200],
            "pub_date": release.get("published_at") or release.get("created_at"),
            "platforms": {
                "windows-x86_64": {
                    "url": f"{BASE}/{name.replace(' ', '%20')}",
                    "signature": signature,
                }
            },
        }
        staging = OUT / "latest.json.tmp"
        staging.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.chmod(staging, 0o644)
        os.replace(staging, manifest_file)
        print(f"PUBLICADO {version}: {name}, {size} bytes, sha256={sha256[:16]}…")


if __name__ == "__main__":
    try:
        publish()
    except Exception as exc:
        print(f"ERRO updater: {exc}", file=sys.stderr)
        sys.exit(1)
