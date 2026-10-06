"""Helpers para upload de criativo/anexos das tarefas — salvos no volume /app/uploads."""
import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps

from app.core.config import settings

# Avatar sempre quadrado, resolução única (boa em telas retina nos avatares
# pequenos, sem pesar no download) — D-090/ajuste de qualidade de foto.
FOTO_AVATAR_LADO_PX = 480
FOTO_AVATAR_QUALIDADE_JPEG = 88


def _upload_dir() -> Path:
    p = Path(settings.UPLOAD_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


MAX_UPLOAD_BYTES = 250 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024


async def salvar_upload(file: UploadFile) -> dict:
    """Salva anexos em streaming para suportar vídeos sem carregar o arquivo inteiro na RAM."""
    ext = Path(file.filename or "").suffix
    nome_arquivo = f"{uuid.uuid4().hex}{ext}"
    destino = _upload_dir() / nome_arquivo
    total = 0
    try:
        with destino.open("wb") as out:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Arquivo acima do limite de 250 MB")
                out.write(chunk)
    except Exception:
        destino.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "nome": file.filename or nome_arquivo,
        "url": f"/api/v1/uploads/{nome_arquivo}",
        "mime_type": file.content_type,
        "tamanho_kb": total // 1024,
    }


async def salvar_foto_avatar(file: UploadFile) -> dict:
    """Processa foto de perfil (avatar de Envoxer): corrige orientação EXIF (foto de
    celular vem "deitada" sem isso), corta pro quadrado central e redimensiona pra
    um tamanho único — sem isso, cada foto vinha com proporção/resolução diferente
    e ficava esticada/cortada de qualquer jeito no círculo do avatar (ver Gus, ajuste
    pós-D-090). Sempre salva como JPEG, nome de arquivo novo (não reaproveita o antigo)."""
    conteudo = await file.read()
    try:
        imagem = Image.open(io.BytesIO(conteudo))
        imagem = ImageOps.exif_transpose(imagem)
        imagem = imagem.convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Arquivo não é uma imagem válida")

    largura, altura = imagem.size
    lado = min(largura, altura)
    esquerda = (largura - lado) // 2
    topo = (altura - lado) // 2
    imagem = imagem.crop((esquerda, topo, esquerda + lado, topo + lado))
    imagem = imagem.resize((FOTO_AVATAR_LADO_PX, FOTO_AVATAR_LADO_PX), Image.LANCZOS)

    nome_arquivo = f"{uuid.uuid4().hex}.jpg"
    buffer = io.BytesIO()
    imagem.save(buffer, format="JPEG", quality=FOTO_AVATAR_QUALIDADE_JPEG, optimize=True)
    conteudo_final = buffer.getvalue()
    (_upload_dir() / nome_arquivo).write_bytes(conteudo_final)

    return {
        "nome": nome_arquivo,
        "url": f"/api/v1/uploads/{nome_arquivo}",
        "mime_type": "image/jpeg",
        "tamanho_kb": len(conteudo_final) // 1024,
    }


def excluir_upload_url(url: str) -> bool:
    """Remove um arquivo gerenciado em /api/v1/uploads sem aceitar traversal."""
    if not url or not url.startswith("/api/v1/uploads/"):
        return False
    nome = Path(url).name
    if not nome:
        return False
    alvo = _upload_dir() / nome
    try:
        alvo.unlink(missing_ok=True)
        return True
    except OSError:
        return False
