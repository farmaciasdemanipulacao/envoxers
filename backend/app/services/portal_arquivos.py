"""Private customer media stored under the persistent uploads volume, protected by StaticFiles denylist."""
from pathlib import Path
from uuid import uuid4
from fastapi import HTTPException, UploadFile
from app.core.config import settings

MAX_ANEXO_BYTES = 250 * 1024 * 1024
EXTENSOES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".mp4", ".mov", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".psd", ".ai", ".zip", ".txt", ".csv", ".svg"}

def diretorio_privado(solicitacao_id: int) -> Path:
    return Path(settings.UPLOAD_DIR) / "private" / str(int(solicitacao_id))

async def gravar_anexo(arquivo: UploadFile, solicitacao_id: int) -> dict:
    nome = Path(arquivo.filename or "arquivo").name.strip()[:255]
    extensao = Path(nome).suffix.lower()
    if not nome or extensao not in EXTENSOES:
        raise HTTPException(415, "Formato de arquivo não permitido")
    chave = uuid4().hex + extensao
    pasta = diretorio_privado(solicitacao_id)
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / chave
    tamanho = 0
    try:
        with destino.open("wb") as saida:
            while bloco := await arquivo.read(1024 * 1024):
                tamanho += len(bloco)
                if tamanho > MAX_ANEXO_BYTES:
                    raise HTTPException(413, "Arquivo excede 250 MB")
                saida.write(bloco)
    except Exception:
        destino.unlink(missing_ok=True)
        raise
    finally:
        await arquivo.close()
    if tamanho == 0:
        destino.unlink(missing_ok=True)
        raise HTTPException(422, "Arquivo vazio")
    return {"chave": chave, "nome_original": nome, "tamanho_bytes": tamanho, "content_type": "application/octet-stream"}

def caminho_anexo(solicitacao_id: int, chave: str) -> Path:
    return diretorio_privado(solicitacao_id) / chave
