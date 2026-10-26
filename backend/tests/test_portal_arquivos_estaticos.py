"""Regressão sem dados reais: privacidade dos arquivos do Portal.

Esta suíte verifica a classe protetora isoladamente; NÃO comprova que
main.py já a montou. O release gate mantém essa exigência separada.
"""
import tempfile
import unittest
from pathlib import Path

from starlette.exceptions import HTTPException
from app.core.arquivos_estaticos import ArquivosLegadosProtegidos


class GuardedUploadTest(unittest.IsolatedAsyncioTestCase):
    async def test_private_media_denied_while_legacy_urls_remain_compatible(self):
        with tempfile.TemporaryDirectory(prefix="portal-upload-test-") as folder:
            root=Path(folder)
            private=root/"private"
            private.mkdir()
            (private/"fake-contract.pdf").write_text("fictitious sensitive file")
            (root/"avatar-ficticio.jpg").write_bytes(b"fake image bytes")
            files=ArquivosLegadosProtegidos(directory=folder)
            scope={"type":"http","method":"GET","path":"/api/v1/uploads/","headers":[],"query_string":b""}

            for path in ("private/fake-contract.pdf", "./private/fake-contract.pdf",
                         "subdir/../private/fake-contract.pdf", "private\\fake-contract.pdf"):
                with self.subTest(path=path):
                    with self.assertRaises(HTTPException) as error:
                        await files.get_response(path,scope)
                    self.assertEqual(error.exception.status_code,404)

            legacy=await files.get_response("avatar-ficticio.jpg",scope)
            self.assertEqual(legacy.status_code,200)
            self.assertEqual(Path(legacy.path).name,"avatar-ficticio.jpg")


if __name__=="__main__":
    unittest.main()
