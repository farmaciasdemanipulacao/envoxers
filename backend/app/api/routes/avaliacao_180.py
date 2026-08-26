"""F4 — Módulo D: Avaliação 180° — mão dupla gestor<->liderado (D-121)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.avaliacao_180 import Avaliacao180
from app.schemas.avaliacao_180 import Avaliacao180Responder, Avaliacao180Response

router = APIRouter(prefix="/180", tags=["avaliacao_180"])


def _eh_gestor_ou_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao in ("admin", "gestor")


async def _montar_resposta_180(av: Avaliacao180, envoxers: dict[int, Envoxer]) -> Avaliacao180Response:
    resp = Avaliacao180Response.model_validate(av)
    resp.avaliador_nome = envoxers.get(av.avaliador_id).nome if envoxers.get(av.avaliador_id) else None
    resp.avaliado_nome = envoxers.get(av.avaliado_id).nome if envoxers.get(av.avaliado_id) else None
    return resp


@router.get("/minhas-pendentes", response_model=list[Avaliacao180Response])
async def listar_minhas_pendentes_180(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: Optional[int] = Query(default=None),
):
    query = select(Avaliacao180).where(Avaliacao180.avaliador_id == envoxer.id, Avaliacao180.status == "pendente")
    if ciclo_id is not None:
        query = query.where(Avaliacao180.ciclo_id == ciclo_id)
    result = await db.execute(query)
    itens = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [await _montar_resposta_180(a, envoxers) for a in itens]


@router.get("/recebidas/{avaliado_id}", response_model=list[Avaliacao180Response])
async def listar_recebidas_180(
    avaliado_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
):
    if avaliado_id != envoxer.id and not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Sem acesso a essas avaliações")

    result = await db.execute(
        select(Avaliacao180).where(
            Avaliacao180.ciclo_id == ciclo_id, Avaliacao180.avaliado_id == avaliado_id, Avaliacao180.status == "enviada"
        )
    )
    itens = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [await _montar_resposta_180(a, envoxers) for a in itens]


@router.post("/avaliacoes/{avaliacao_id}/responder", response_model=Avaliacao180Response)
async def responder_avaliacao_180(
    avaliacao_id: int,
    payload: Avaliacao180Responder,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    av = (await db.execute(select(Avaliacao180).where(Avaliacao180.id == avaliacao_id))).scalar_one_or_none()
    if av is None:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada")
    if av.avaliador_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Essa avaliação não é sua")

    av.nota_geral = payload.nota_geral
    av.pontos_fortes = payload.pontos_fortes
    av.pontos_melhoria = payload.pontos_melhoria
    av.comentario = payload.comentario
    av.status = "enviada"
    av.enviada_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(av)
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return await _montar_resposta_180(av, envoxers)
