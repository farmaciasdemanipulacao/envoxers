"""F4 — Módulo B: Infra de Ciclos — janela de tempo compartilhada por 360/180/clima (D-121)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.ciclo_avaliacao import CicloAvaliacao, TIPO_CICLO_VALUES
from app.schemas.ciclo import CicloAvaliacaoCreate, CicloAvaliacaoResponse
from app.services.ciclos import gerar_pares_360, gerar_pares_180

router = APIRouter(prefix="/ciclos", tags=["ciclos"])


@router.get("", response_model=list[CicloAvaliacaoResponse])
async def listar_ciclos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    tipo: Optional[str] = Query(default=None),
    status_: Optional[str] = Query(default=None, alias="status"),
):
    query = select(CicloAvaliacao).order_by(CicloAvaliacao.data_inicio.desc())
    if tipo:
        query = query.where(CicloAvaliacao.tipo == tipo)
    if status_:
        query = query.where(CicloAvaliacao.status == status_)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=CicloAvaliacaoResponse, status_code=201)
async def criar_ciclo(
    payload: CicloAvaliacaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[Envoxer, Depends(get_current_admin)],
):
    if payload.tipo not in TIPO_CICLO_VALUES:
        raise HTTPException(status_code=400, detail="Tipo de ciclo inválido")
    if payload.data_fim < payload.data_inicio:
        raise HTTPException(status_code=400, detail="Data fim não pode ser antes da data início")

    ciclo = CicloAvaliacao(
        tipo=payload.tipo, nome=payload.nome,
        data_inicio=payload.data_inicio, data_fim=payload.data_fim,
        criado_por_id=admin.id,
    )
    db.add(ciclo)
    await db.flush()
    await db.refresh(ciclo)
    return ciclo


@router.post("/{ciclo_id}/abrir", response_model=CicloAvaliacaoResponse)
async def abrir_ciclo(
    ciclo_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    ciclo = (await db.execute(select(CicloAvaliacao).where(CicloAvaliacao.id == ciclo_id))).scalar_one_or_none()
    if ciclo is None:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")
    if ciclo.status != "rascunho":
        raise HTTPException(status_code=400, detail="Só é possível abrir um ciclo em rascunho")

    if ciclo.tipo == "360":
        await gerar_pares_360(db, ciclo)
    elif ciclo.tipo == "180":
        await gerar_pares_180(db, ciclo)
    # clima não pré-cria linha nenhuma — cada pessoa responde sob demanda enquanto o ciclo está aberto.

    ciclo.status = "aberto"
    ciclo.aberto_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(ciclo)
    return ciclo


@router.post("/{ciclo_id}/encerrar", response_model=CicloAvaliacaoResponse)
async def encerrar_ciclo(
    ciclo_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    ciclo = (await db.execute(select(CicloAvaliacao).where(CicloAvaliacao.id == ciclo_id))).scalar_one_or_none()
    if ciclo is None:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")
    if ciclo.status != "aberto":
        raise HTTPException(status_code=400, detail="Só é possível encerrar um ciclo aberto")

    ciclo.status = "encerrado"
    ciclo.encerrado_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(ciclo)
    return ciclo
