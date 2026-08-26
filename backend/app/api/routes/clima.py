"""F4 — Módulo F: Pesquisa de Clima Organizacional (D-121).

Híbrida: o vínculo envoxer_id fica gravado no banco (não é anônimo de fato),
mas a API nunca expõe resposta individual pra gestor — só agregados. Only
admin tem a rota de auditoria (/clima/{ciclo_id}/bruto) pro dado bruto.
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.ciclo_avaliacao import CicloAvaliacao
from app.models.pergunta_clima import PerguntaClima
from app.models.resposta_clima import RespostaClima
from app.schemas.clima import (
    PerguntaClimaCreate, PerguntaClimaResponse,
    RespostaClimaEnviar, RespostaClimaMinhaResponse,
    ClimaResultado, ClimaRespostaBrutaResponse,
)

router = APIRouter(prefix="/clima", tags=["clima"])


@router.get("/perguntas", response_model=list[PerguntaClimaResponse])
async def listar_perguntas_clima(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
):
    result = await db.execute(select(PerguntaClima).where(PerguntaClima.ciclo_id == ciclo_id).order_by(PerguntaClima.ordem))
    return list(result.scalars().all())


@router.post("/perguntas", response_model=PerguntaClimaResponse, status_code=201)
async def criar_pergunta_clima(
    payload: PerguntaClimaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
    ciclo_id: int = Query(...),
):
    ciclo = (await db.execute(select(CicloAvaliacao).where(CicloAvaliacao.id == ciclo_id))).scalar_one_or_none()
    if ciclo is None:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")
    if ciclo.status != "rascunho":
        raise HTTPException(status_code=400, detail="Só dá pra editar perguntas com o ciclo em rascunho")

    pergunta = PerguntaClima(ciclo_id=ciclo_id, **payload.model_dump())
    db.add(pergunta)
    await db.flush()
    await db.refresh(pergunta)
    return pergunta


@router.get("/minha", response_model=RespostaClimaMinhaResponse)
async def minha_resposta_clima(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
):
    resposta = (
        await db.execute(select(RespostaClima).where(RespostaClima.ciclo_id == ciclo_id, RespostaClima.envoxer_id == envoxer.id))
    ).scalar_one_or_none()
    if resposta is None:
        return RespostaClimaMinhaResponse(ciclo_id=ciclo_id, respondido=False)
    return RespostaClimaMinhaResponse(ciclo_id=ciclo_id, respondido=True, respostas=resposta.respostas, enviada_em=resposta.enviada_em)


@router.post("/responder", response_model=RespostaClimaMinhaResponse)
async def responder_clima(
    payload: RespostaClimaEnviar,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    ciclo_id: int = Query(...),
):
    ciclo = (await db.execute(select(CicloAvaliacao).where(CicloAvaliacao.id == ciclo_id))).scalar_one_or_none()
    if ciclo is None:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")
    if ciclo.status != "aberto":
        raise HTTPException(status_code=400, detail="Esse ciclo de clima não está aberto pra respostas")

    # Upsert — mesmo padrão de PulsoSatisfacao (permite revisar a resposta
    # enquanto o ciclo estiver aberto, em vez de rejeitar reenvio).
    stmt = pg_insert(RespostaClima).values(
        ciclo_id=ciclo_id, envoxer_id=envoxer.id, respostas=payload.respostas, enviada_em=datetime.now(timezone.utc),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["ciclo_id", "envoxer_id"],
        set_={"respostas": payload.respostas, "enviada_em": datetime.now(timezone.utc)},
    )
    await db.execute(stmt)
    await db.flush()

    return RespostaClimaMinhaResponse(ciclo_id=ciclo_id, respondido=True, respostas=payload.respostas, enviada_em=datetime.now(timezone.utc))


@router.get("/{ciclo_id}/resultado", response_model=ClimaResultado)
async def resultado_clima(
    ciclo_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Agregado — aberto a qualquer logado (transparência de clima), nunca
    identifica quem respondeu o quê."""
    perguntas_result = await db.execute(select(PerguntaClima).where(PerguntaClima.ciclo_id == ciclo_id).order_by(PerguntaClima.ordem))
    perguntas = list(perguntas_result.scalars().all())

    respostas_result = await db.execute(select(RespostaClima).where(RespostaClima.ciclo_id == ciclo_id))
    respostas = list(respostas_result.scalars().all())

    total_ativos_result = await db.execute(select(Envoxer).where(Envoxer.ativo.is_(True)))
    total_ativos = len(list(total_ativos_result.scalars().all()))

    perguntas_out = []
    for p in perguntas:
        if p.tipo == "likert":
            valores = [r.respostas.get(str(p.id)) for r in respostas if r.respostas.get(str(p.id)) is not None]
            valores = [v for v in valores if isinstance(v, (int, float))]
            distribuicao = {str(n): sum(1 for v in valores if int(v) == n) for n in range(1, 6)}
            media = round(sum(valores) / len(valores), 2) if valores else None
            perguntas_out.append({"pergunta_id": p.id, "texto": p.texto, "tipo": "likert", "media": media, "distribuicao": distribuicao})
        else:
            textos = [r.respostas.get(str(p.id)) for r in respostas if r.respostas.get(str(p.id))]
            perguntas_out.append({"pergunta_id": p.id, "texto": p.texto, "tipo": "aberta", "respostas": textos})

    return ClimaResultado(ciclo_id=ciclo_id, total_ativos=total_ativos, total_respondentes=len(respostas), perguntas=perguntas_out)


@router.get("/{ciclo_id}/bruto", response_model=list[ClimaRespostaBrutaResponse])
async def resultado_bruto_clima(
    ciclo_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    """Auditoria — só admin, dado bruto com identificação de quem respondeu.
    Gestor nunca tem acesso a isso (decisão híbrida do Gus, D-121)."""
    result = await db.execute(select(RespostaClima).where(RespostaClima.ciclo_id == ciclo_id))
    respostas = list(result.scalars().all())
    envoxers_result = await db.execute(select(Envoxer))
    envoxers = {e.id: e for e in envoxers_result.scalars().all()}
    return [
        ClimaRespostaBrutaResponse(
            envoxer_id=r.envoxer_id,
            envoxer_nome=envoxers.get(r.envoxer_id).nome if envoxers.get(r.envoxer_id) else "(removido)",
            respostas=r.respostas, enviada_em=r.enviada_em,
        )
        for r in respostas
    ]
