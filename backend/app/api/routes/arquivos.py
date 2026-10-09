from typing import Annotated, Optional
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.core.config import settings
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.servico import Servico
from app.models.tarefa import Tarefa
from app.models.demanda_avulsa import DemandaAvulsa

router = APIRouter(prefix="/arquivos", tags=["arquivos"])

def _dir_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for base, _, files in os.walk(path):
        for nome in files:
            try:
                total += (Path(base) / nome).stat().st_size
            except OSError:
                pass
    return total

@router.get("/storage-status")
async def storage_status(
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(upload_dir)
    percent = round((usage.used / usage.total) * 100, 1) if usage.total else 0.0
    if percent >= 90:
        level = "critical"
    elif percent >= 75:
        level = "warning"
    else:
        level = "ok"
    return {
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "used_percent": percent,
        "uploads_bytes": _dir_size_bytes(upload_dir),
        "warning_percent": 75,
        "critical_percent": 90,
        "level": level,
    }

@router.get("")
async def listar_arquivos(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    q: Optional[str] = Query(None),
):
    tarefa_stmt = (
        select(Tarefa, Cliente.nome, Servico.nome)
        .join(Cliente, Cliente.id == Tarefa.cliente_id)
        .outerjoin(Servico, Servico.id == Tarefa.servico_id)
        .where(Tarefa.deleted_at.is_(None))
        .order_by(Cliente.nome, Tarefa.titulo, Tarefa.id)
    )
    tarefa_rows = (await db.execute(tarefa_stmt)).all()

    avulsa_rows = list(
        (
            await db.execute(
                select(DemandaAvulsa)
                .where(DemandaAvulsa.deleted_at.is_(None))
                .order_by(DemandaAvulsa.contexto, DemandaAvulsa.titulo, DemandaAvulsa.id)
            )
        ).scalars().all()
    )

    uploader_ids = {
        int(a.get("enviado_por_envoxer_id"))
        for tarefa, _, _ in tarefa_rows
        for a in (tarefa.anexos or [])
        if a.get("enviado_por_envoxer_id")
    } | {
        int(a.get("enviado_por_envoxer_id"))
        for demanda in avulsa_rows
        for a in (demanda.anexos or [])
        if a.get("enviado_por_envoxer_id")
    }

    nomes = {}
    if uploader_ids:
        nomes = {
            e.id: e.nome
            for e in (
                await db.execute(select(Envoxer).where(Envoxer.id.in_(uploader_ids)))
            ).scalars().all()
        }

    termo = (q or "").strip().lower()
    out = []

    for tarefa, cliente_nome, servico_nome in tarefa_rows:
        for anexo in tarefa.anexos or []:
            registro = {
                "contexto_tipo": "cliente",
                "contexto_nome": cliente_nome,
                "cliente_id": tarefa.cliente_id,
                "card_tipo": "tarefa",
                "card_id": tarefa.id,
                "card_chave": f"tarefa:{tarefa.id}",
                "card_titulo": tarefa.titulo,
                "servico_nome": servico_nome,
                "nome": anexo.get("nome"),
                "url": anexo.get("url"),
                "mime_type": anexo.get("mime_type"),
                "tamanho_kb": anexo.get("tamanho_kb"),
                "enviado_por_envoxer_id": anexo.get("enviado_por_envoxer_id"),
                "enviado_por_nome": nomes.get(anexo.get("enviado_por_envoxer_id")),
                "criado_em": anexo.get("criado_em"),
                "pode_excluir": envoxer.permissao in ("admin", "gestor"),
            }
            if termo:
                hay = " ".join(
                    str(registro.get(k) or "")
                    for k in ("contexto_nome", "card_titulo", "servico_nome", "nome")
                ).lower()
                if termo not in hay:
                    continue
            out.append(registro)

    for demanda in avulsa_rows:
        for anexo in demanda.anexos or []:
            registro = {
                "contexto_tipo": "demanda_avulsa",
                "contexto_nome": demanda.contexto,
                "cliente_id": None,
                "card_tipo": "demanda_avulsa",
                "card_id": demanda.id,
                "card_chave": f"demanda_avulsa:{demanda.id}",
                "card_titulo": demanda.titulo,
                "servico_nome": "Demanda avulsa",
                "nome": anexo.get("nome"),
                "url": anexo.get("url"),
                "mime_type": anexo.get("mime_type"),
                "tamanho_kb": anexo.get("tamanho_kb"),
                "enviado_por_envoxer_id": anexo.get("enviado_por_envoxer_id"),
                "enviado_por_nome": nomes.get(anexo.get("enviado_por_envoxer_id")),
                "criado_em": anexo.get("criado_em"),
                "pode_excluir": envoxer.permissao in ("admin", "gestor"),
            }
            if termo:
                hay = " ".join(
                    str(registro.get(k) or "")
                    for k in ("contexto_nome", "card_titulo", "servico_nome", "nome")
                ).lower()
                if termo not in hay:
                    continue
            out.append(registro)

    out.sort(
        key=lambda x: (
            str(x.get("contexto_nome") or "").lower(),
            str(x.get("card_titulo") or "").lower(),
            str(x.get("nome") or "").lower(),
        )
    )
    return out
