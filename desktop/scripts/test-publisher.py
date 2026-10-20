#!/usr/bin/env python3
"""Testes offline do filtro de releases do atualizador."""
import importlib.util
from pathlib import Path
import unittest

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

    def test_path_traversal_rejected(self):
        release = {"assets": [{
            "name": "../evil_0.3.1_x64-setup.exe", "size": 100,
            "browser_download_url": "https://github.com/farmaciasdemanipulacao/envoxers/releases/download/desktop-v0.3.1/evil.exe",
        }]}
        with self.assertRaises(RuntimeError):
            module.pick_asset(release, "0.3.1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
