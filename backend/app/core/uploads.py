"""Helpers para upload de criativo/anexos das tarefas — salvos no volume /app/uploads."""
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings


def _upload_dir() -> Path:
    p = Path(settings.UPLOAD_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def salvar_upload(file: UploadFile) -> dict:
    ext = Path(file.filename or "").suffix
    nome_arquivo = f"{uuid.uuid4().hex}{ext}"
    conteudo = await file.read()
    (_upload_dir() / nome_arquivo).write_bytes(conteudo)
    return {
        "nome": file.filename or nome_arquivo,
        "url": f"/api/v1/uploads/{nome_arquivo}",
        "mime_type": file.content_type,
        "tamanho_kb": len(conteudo) // 1024,
    }
