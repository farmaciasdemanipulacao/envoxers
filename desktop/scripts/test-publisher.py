#!/usr/bin/env python3
"""Testes offline do filtro de releases do atualizador."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json

path = Path(__file__).with_name("publish-signed-updates.py")
spec = importlib.util.spec_from_file_location("publisher", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublisherTests(unittest.TestCase):
    def test_only_bot_stable_desktop_releases(self):
        good = {
            "tag_name": "desktop-v0.3.1", "draft": False, "prerelease": False,
            "author": {"login": "github-actions[bot]"}, "assets": [],
        }
        malicious = {**good, "tag_name": "desktop-v99.0.0", "author": {"login": "stranger"}}
        other = {**good, "tag_name": "farmas-v1.0.0"}
        beta = {**good, "tag_name": "desktop-v0.4.0", "prerelease": True}
        result = module.latest_release([good, malicious, other, beta])
        self.assertEqual(result[0], (0, 3, 1))

    def test_only_official_exe_release_asset(self):
        version = "0.3.1"
        name = f"Envoxers Desktop_{version}_x64-setup.exe"
        release = {"assets": [
            {"name": name, "size": 1_000_000,
             "browser_download_url": f"https://github.com/farmaciasdemanipulacao/envoxers/releases/download/desktop-v{version}/Envoxers%20Desktop_{version}_x64-setup.exe"},
        ]}
        self.assertEqual(module.pick_asset(release, version)[0], name)
        release["assets"][0]["browser_download_url"] = "https://attacker.example/evil.exe"
        with self.assertRaises(RuntimeError):
            module.pick_asset(release, version)

    def test_publish_manifest_atomic_and_idempotent(self):
        version = "0.3.1"
        name = f"Envoxers Desktop_{version}_x64-setup.exe"
        release = {
            "tag_name": f"desktop-v{version}", "draft": False, "prerelease": False,
            "author": {"login": "github-actions[bot]"},
            "published_at": "2026-10-20T12:00:00Z",
            "assets": [{
                "name": name, "size": 120_000,
                "browser_download_url": f"https://github.com/farmaciasdemanipulacao/envoxers/releases/download/desktop-v{version}/Envoxers%20Desktop_{version}_x64-setup.exe",
            }],
        }
        def fake_download(url, destination):
            data = b"MZ" + b"0" * 120_000
            destination.write_bytes(data)
            import hashlib
            return len(data), hashlib.sha256(data).hexdigest()
        def fake_sign(executable, signed_version):
            self.assertEqual(signed_version, version)
            signature = "S" * 200
            executable.with_name(executable.name + ".sig").write_text(signature)
            return signature
        with tempfile.TemporaryDirectory() as temp:
            with (patch.object(module, "OUT", Path(temp)),
                 patch.object(module, "fetch_json", return_value=[release]),
                 patch.object(module, "download", side_effect=fake_download) as downloader,
                 patch.object(module, "sign", side_effect=fake_sign)):
                module.publish()
                manifest = json.loads((Path(temp) / "latest.json").read_text())
                self.assertEqual(manifest["version"], version)
                self.assertEqual(manifest["platforms"]["windows-x86_64"]["signature"], "S" * 200)
                self.assertTrue((Path(temp) / name).is_file())
                module.publish()
                self.assertEqual(downloader.call_count, 1)

    def test_path_traversal_rejected(self):
        release = {"assets": [{
            "name": "../evil_0.3.1_x64-setup.exe", "size": 100,
            "browser_download_url": "https://github.com/farmaciasdemanipulacao/envoxers/releases/download/desktop-v0.3.1/evil.exe",
        }]}
        with self.assertRaises(RuntimeError):
            module.pick_asset(release, "0.3.1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
