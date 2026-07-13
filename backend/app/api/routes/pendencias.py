"""Lista simples de avisos gerados pela automação CRIAR_ALERTA_RESPONSAVEL — consumida
pelo card "Pendências" do Dashboard.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.pendencia import Pendencia
from app.models.tarefa import Tarefa
from app.schemas.pendencia import PendenciaResponse

router = APIRouter(prefix="/pendencias", tags=["pendencias"])


@router.get("", response_model=list[PendenciaResponse])
async def listar_pendencias(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Pendencia, Tarefa.titulo)
        .join(Tarefa, Tarefa.id == Pendencia.tarefa_id)
        .where(and_(Pendencia.envoxer_id == envoxer.id, Pendencia.lida.is_(False)))
        .order_by(Pendencia.created_at.desc())
    )
    respostas = []
    for pendencia, tarefa_titulo in result.all():
        resp = PendenciaResponse.model_validate(pendencia)
        resp.tarefa_titulo = tarefa_titulo
        respostas.append(resp)
    return respostas


@router.patch("/{pendencia_id}/lida", response_model=PendenciaResponse)
async def marcar_lida(
    pendencia_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Pendencia).where(and_(Pendencia.id == pendencia_id, Pendencia.envoxer_id == envoxer.id))
    )
    pendencia = result.scalar_one_or_none()
    if pendencia is None:
        raise HTTPException(status_code=404, detail="Pendência não encontrada")
    pendencia.lida = True
    await db.flush()
    await db.refresh(pendencia)
    return pendencia
