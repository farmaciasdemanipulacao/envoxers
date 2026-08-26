"""F4 — Módulo E: Feedback 1:1 — registro contínuo por par gestor<->liderado (D-121)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.feedback_1a1 import Feedback1a1
from app.schemas.feedback_1a1 import (
    Feedback1a1Create, Feedback1a1Update, Feedback1a1ComentarioLideradoUpdate, Feedback1a1Response,
)

router = APIRouter(prefix="/1a1", tags=["feedback_1a1"])


def _eh_gestor_ou_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao in ("admin", "gestor")


async def _montar_resposta_1a1(f: Feedback1a1, envoxers: dict[int, Envoxer]) -> Feedback1a1Response:
    resp = Feedback1a1Response.model_validate(f)
    resp.gestor_nome = envoxers.get(f.gestor_id).nome if envoxers.get(f.gestor_id) else None
    resp.liderado_nome = envoxers.get(f.liderado_id).nome if envoxers.get(f.liderado_id) else None
    return resp


@router.get("", response_model=list[Feedback1a1Response])
async def listar_1a1(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    liderado_id: Optional[int] = Query(default=None),
    gestor_id: Optional[int] = Query(default=None),
):
    query = select(Feedback1a1).order_by(Feedback1a1.data.desc())
    if _eh_gestor_ou_admin(envoxer):
        if liderado_id is not None:
            query = query.where(Feedback1a1.liderado_id == liderado_id)
        if gestor_id is not None:
            query = query.where(Feedback1a1.gestor_id == gestor_id)
    else:
        # envoxer comum só enxerga os 1:1 dos quais é o liderado.
        query = query.where(Feedback1a1.liderado_id == envoxer.id)

    result = await db.execute(query)
    itens = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [await _montar_resposta_1a1(f, envoxers) for f in itens]


@router.post("", response_model=Feedback1a1Response, status_code=201)
async def criar_1a1(
    payload: Feedback1a1Create,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Apenas gestor ou admin registram um 1:1")

    if envoxer.permissao == "gestor":
        gestor_id = envoxer.id
    else:
        if payload.gestor_id is None:
            raise HTTPException(status_code=400, detail="Informe o gestor_id")
        gestor_id = payload.gestor_id

    liderado = (await db.execute(select(Envoxer).where(Envoxer.id == payload.liderado_id))).scalar_one_or_none()
    if liderado is None:
        raise HTTPException(status_code=404, detail="Liderado não encontrado")

    f = Feedback1a1(
        gestor_id=gestor_id, liderado_id=payload.liderado_id, data=payload.data,
        pauta=payload.pauta, combinados=payload.combinados, proximo_sugerido=payload.proximo_sugerido,
        criado_por_id=envoxer.id,
    )
    db.add(f)
    await db.flush()
    await db.refresh(f)
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return await _montar_resposta_1a1(f, envoxers)


async def _carregar_1a1(db: AsyncSession, id_: int) -> Feedback1a1:
    f = (await db.execute(select(Feedback1a1).where(Feedback1a1.id == id_))).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Registro de 1:1 não encontrado")
    return f


@router.patch("/{feedback_id}", response_model=Feedback1a1Response)
async def atualizar_1a1(
    feedback_id: int,
    payload: Feedback1a1Update,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    f = await _carregar_1a1(db, feedback_id)
    if not (envoxer.permissao == "admin" or (envoxer.permissao == "gestor" and f.gestor_id == envoxer.id)):
        raise HTTPException(status_code=403, detail="Só quem registrou (ou admin) edita este 1:1")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(f, field, value)
    await db.flush()
    await db.refresh(f)
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return await _montar_resposta_1a1(f, envoxers)


@router.post("/{feedback_id}/comentario-liderado", response_model=Feedback1a1Response)
async def comentar_como_liderado_1a1(
    feedback_id: int,
    payload: Feedback1a1ComentarioLideradoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    f = await _carregar_1a1(db, feedback_id)
    if f.liderado_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Só o liderado desse 1:1 comenta aqui")

    f.comentario_liderado = payload.comentario_liderado
    await db.flush()
    await db.refresh(f)
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return await _montar_resposta_1a1(f, envoxers)
