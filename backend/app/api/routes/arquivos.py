from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.servico import Servico
from app.models.tarefa import Tarefa

router = APIRouter(prefix="/arquivos", tags=["arquivos"])

@router.get("")
async def listar_arquivos(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    q: Optional[str] = Query(None),
):
    stmt = (
        select(Tarefa, Cliente.nome, Servico.nome)
        .join(Cliente, Cliente.id == Tarefa.cliente_id)
        .outerjoin(Servico, Servico.id == Tarefa.servico_id)
        .where(Tarefa.deleted_at.is_(None))
        .order_by(Cliente.nome, Tarefa.titulo, Tarefa.id)
    )
    rows = (await db.execute(stmt)).all()
    uploader_ids = {
        int(a.get("enviado_por_envoxer_id"))
        for tarefa, _, _ in rows
        for a in (tarefa.anexos or [])
        if a.get("enviado_por_envoxer_id")
    }
    nomes = {}
    if uploader_ids:
        nomes = {
            e.id: e.nome
            for e in (await db.execute(select(Envoxer).where(Envoxer.id.in_(uploader_ids)))).scalars().all()
        }

    termo = (q or "").strip().lower()
    out = []
    for tarefa, cliente_nome, servico_nome in rows:
        for anexo in tarefa.anexos or []:
            registro = {
                "contexto_tipo": "cliente",
                "contexto_nome": cliente_nome,
                "cliente_id": tarefa.cliente_id,
                "card_id": tarefa.id,
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
                hay = " ".join(str(registro.get(k) or "") for k in ("contexto_nome", "card_titulo", "servico_nome", "nome")).lower()
                if termo not in hay:
                    continue
            out.append(registro)
    return out
