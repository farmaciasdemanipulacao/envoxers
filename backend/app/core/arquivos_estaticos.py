"""Deny static access to private portal media while preserving legacy files."""
from pathlib import PurePosixPath
from starlette.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

class ArquivosLegadosProtegidos(StaticFiles):
    async def get_response(self, path, scope):
        partes = PurePosixPath("/" + path.replace(chr(92), "/")).parts
        if "private" in partes:
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)
