"""F4 — Módulo C: Feedback 360° — catálogo de competências + avaliação N×N (D-121)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.competencia_catalogo import CompetenciaCatalogo
from app.models.avaliacao_360 import Avaliacao360
from app.schemas.avaliacao_360 import (
    CompetenciaCreate, CompetenciaUpdate, CompetenciaResponse,
    Avaliacao360Responder, Avaliacao360Response,
    Avaliacao360ResultadoItem, Avaliacao360Resultado,
)

router = APIRouter(prefix="/360", tags=["avaliacao_360"])


def _eh_gestor_ou_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao in ("admin", "gestor")


@router.get("/competencias", response_model=list[CompetenciaResponse])
async def listar_competencias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    apenas_ativas: bool = Query(default=True),
):
    query = select(CompetenciaCatalogo).order_by(CompetenciaCatalogo.ordem)
    if apenas_ativas:
        query = query.where(CompetenciaCatalogo.ativo.is_(True))
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/competencias", response_model=CompetenciaResponse, status_code=201)
async def criar_competencia(
    payload: CompetenciaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    competencia = CompetenciaCatalogo(**payload.model_dump())
    db.add(competencia)
    await db.flush()
    await db.refresh(competencia)
    return competencia


@router.patch("/competencias/{competencia_id}", response_model=CompetenciaResponse)
async def atualizar_competencia(
    competencia_id: int,
    payload: CompetenciaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    competencia = (await db.execute(select(CompetenciaCatalogo).where(CompetenciaCatalogo.id == competencia_id))).scalar_one_or_none()
    if competencia is None:
        raise HTTPException(status_code=404, detail="Competência não encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(competencia, field, value)
    await db.flush()
    await db.refresh(competencia)
    return competencia


async def _montar_resposta_360(av: Avaliacao360, envoxers: dict[int, Envoxer]) -> Avaliacao360Response:
    resp = Avaliacao360Response.model_validate(av)
    resp.avaliador_nome = envoxers.get(av.avaliador_id).nome if envoxers.get(av.avaliador_id) else None
    resp.avaliado_nome = envoxers.get(av.avaliado_id).nome if envoxers.get(av.avaliado_id) else None
    return resp


@router.get("/minhas-pendentes", response_model=list[Avaliacao360Response])
async def listar_minhas_pendentes_360(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: Optional[int] = Query(default=None),
):
    query = select(Avaliacao360).where(Avaliacao360.avaliador_id == envoxer.id, Avaliacao360.status == "pendente")
    if ciclo_id is not None:
        query = query.where(Avaliacao360.ciclo_id == ciclo_id)
    result = await db.execute(query)
    itens = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [await _montar_resposta_360(a, envoxers) for a in itens]


@router.get("/avaliacoes", response_model=list[Avaliacao360Response])
async def listar_avaliacoes_360(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
    avaliado_id: Optional[int] = Query(default=None),
):
    """Visão individual (quem avaliou o quê) — só gestor/admin, o avaliado em si
    só enxerga o agregado via /360/resultado/{id}, sem saber quem disse o quê."""
    if not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Apenas gestor ou admin")
    query = select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_id)
    if avaliado_id is not None:
        query = query.where(Avaliacao360.avaliado_id == avaliado_id)
    result = await db.execute(query)
    itens = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [await _montar_resposta_360(a, envoxers) for a in itens]


@router.post("/avaliacoes/{avaliacao_id}/responder", response_model=Avaliacao360Response)
async def responder_avaliacao_360(
    avaliacao_id: int,
    payload: Avaliacao360Responder,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    av = (await db.execute(select(Avaliacao360).where(Avaliacao360.id == avaliacao_id))).scalar_one_or_none()
    if av is None:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada")
    if av.avaliador_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Essa avaliação não é sua")

    av.respostas = payload.respostas
    av.comentario = payload.comentario
    av.status = "enviada"
    av.enviada_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(av)
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return await _montar_resposta_360(av, envoxers)


@router.get("/resultado/{avaliado_id}", response_model=Avaliacao360Resultado)
async def resultado_360(
    avaliado_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
):
    if avaliado_id != envoxer.id and not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Sem acesso a esse resultado")

    alvo = (await db.execute(select(Envoxer).where(Envoxer.id == avaliado_id))).scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")

    result = await db.execute(
        select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_id, Avaliacao360.avaliado_id == avaliado_id)
    )
    todas = list(result.scalars().all())
    enviadas = [a for a in todas if a.status == "enviada"]

    competencias_result = await db.execute(select(CompetenciaCatalogo).order_by(CompetenciaCatalogo.ordem))
    competencias = list(competencias_result.scalars().all())

    por_competencia = []
    for c in competencias:
        notas = []
        for a in enviadas:
            valor = a.respostas.get(str(c.id))
            if valor is not None:
                notas.append(valor)
        media = round(sum(notas) / len(notas), 2) if notas else None
        por_competencia.append(Avaliacao360ResultadoItem(competencia_id=c.id, competencia_nome=c.nome, media=media, quantidade_notas=len(notas)))

    comentarios = [a.comentario for a in enviadas if a.comentario]

    return Avaliacao360Resultado(
        avaliado_id=avaliado_id, avaliado_nome=alvo.nome,
        total_avaliacoes=len(todas), respondidas=len(enviadas),
        por_competencia=por_competencia, comentarios=comentarios,
    )
