"""F4 — Módulo A: PDI (Plano de Desenvolvimento Individual)

Núcleo do F4 — os módulos seguintes (360/180/1:1) vão criar ações aqui a
partir de um resultado, usando origem_tipo/origem_id. RBAC: envoxer só vê/edita
o próprio PDI; gestor/admin veem e criam pra qualquer um (D-121).
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.pdi_acao import PdiAcao
from app.models.pdi_acao_comentario import PdiAcaoComentario
from app.schemas.pdi import (
    PdiAcaoCreate,
    PdiAcaoUpdate,
    PdiAcaoResponse,
    PdiAcaoComentarioCreate,
    PdiAcaoComentarioResponse,
    PdiResumoEnvoxerResponse,
)

router = APIRouter(tags=["pdi"])


def _eh_gestor_ou_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao in ("admin", "gestor")


async def _mapa_envoxers(db: AsyncSession) -> dict[int, Envoxer]:
    result = await db.execute(select(Envoxer))
    return {e.id: e for e in result.scalars().all()}


def _montar_resposta_acao(acao: PdiAcao, comentarios: list[PdiAcaoComentario], envoxers: dict[int, Envoxer]) -> PdiAcaoResponse:
    resp = PdiAcaoResponse.model_validate(acao)
    criador = envoxers.get(acao.criado_por_id) if acao.criado_por_id else None
    resp.criado_por_nome = criador.nome if criador else None
    resp.comentarios = []
    for c in sorted(comentarios, key=lambda x: x.criado_em):
        autor = envoxers.get(c.autor_id) if c.autor_id else None
        resp.comentarios.append(PdiAcaoComentarioResponse(
            id=c.id, autor_id=c.autor_id,
            autor_nome=autor.nome if autor else None,
            autor_foto=autor.foto_url if autor else None,
            texto=c.texto, criado_em=c.criado_em,
        ))
    return resp


@router.get("/pdi", response_model=list[PdiAcaoResponse])
async def listar_pdi(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    envoxer_id: Optional[int] = Query(default=None),
):
    alvo_id = envoxer_id if envoxer_id is not None else envoxer.id
    if alvo_id != envoxer.id and not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Você só pode ver o próprio PDI")

    result = await db.execute(select(PdiAcao).where(PdiAcao.envoxer_id == alvo_id).order_by(PdiAcao.prazo.is_(None), PdiAcao.prazo, PdiAcao.created_at.desc()))
    acoes = list(result.scalars().all())
    if not acoes:
        return []

    ids = [a.id for a in acoes]
    result_com = await db.execute(select(PdiAcaoComentario).where(PdiAcaoComentario.pdi_acao_id.in_(ids)))
    comentarios_por_acao: dict[int, list[PdiAcaoComentario]] = {}
    for c in result_com.scalars().all():
        comentarios_por_acao.setdefault(c.pdi_acao_id, []).append(c)

    envoxers = await _mapa_envoxers(db)
    return [_montar_resposta_acao(a, comentarios_por_acao.get(a.id, []), envoxers) for a in acoes]


@router.get("/pdi/equipe", response_model=list[PdiResumoEnvoxerResponse])
async def resumo_equipe_pdi(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Apenas gestor ou admin")

    result_envoxers = await db.execute(select(Envoxer).where(Envoxer.ativo.is_(True)).order_by(Envoxer.nome))
    pessoas = list(result_envoxers.scalars().all())

    result_acoes = await db.execute(select(PdiAcao))
    acoes = list(result_acoes.scalars().all())
    por_pessoa: dict[int, list[PdiAcao]] = {}
    for a in acoes:
        por_pessoa.setdefault(a.envoxer_id, []).append(a)

    resumos = []
    for pessoa in pessoas:
        itens = por_pessoa.get(pessoa.id, [])
        prazos_abertos = [a.prazo for a in itens if a.prazo and a.status in ("planejada", "em_andamento")]
        resumos.append(PdiResumoEnvoxerResponse(
            envoxer_id=pessoa.id,
            nome=pessoa.nome,
            foto_url=pessoa.foto_url,
            total=len(itens),
            planejadas=sum(1 for a in itens if a.status == "planejada"),
            em_andamento=sum(1 for a in itens if a.status == "em_andamento"),
            concluidas=sum(1 for a in itens if a.status == "concluida"),
            canceladas=sum(1 for a in itens if a.status == "cancelada"),
            proximo_prazo=min(prazos_abertos) if prazos_abertos else None,
        ))
    return resumos


@router.post("/pdi", response_model=PdiAcaoResponse, status_code=201)
async def criar_acao_pdi(
    payload: PdiAcaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.envoxer_id != envoxer.id and not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Você só pode criar ação no próprio PDI")

    alvo = (await db.execute(select(Envoxer).where(Envoxer.id == payload.envoxer_id))).scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")

    acao = PdiAcao(
        envoxer_id=payload.envoxer_id,
        titulo=payload.titulo,
        descricao=payload.descricao,
        categoria=payload.categoria,
        prazo=payload.prazo,
        origem_tipo=payload.origem_tipo or "manual",
        origem_id=payload.origem_id,
        criado_por_id=envoxer.id,
    )
    db.add(acao)
    await db.flush()
    await db.refresh(acao)
    envoxers = await _mapa_envoxers(db)
    return _montar_resposta_acao(acao, [], envoxers)


async def _carregar_acao_com_permissao(db: AsyncSession, envoxer: Envoxer, acao_id: int) -> PdiAcao:
    acao = (await db.execute(select(PdiAcao).where(PdiAcao.id == acao_id))).scalar_one_or_none()
    if acao is None:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    if acao.envoxer_id != envoxer.id and not _eh_gestor_ou_admin(envoxer):
        raise HTTPException(status_code=403, detail="Sem acesso a essa ação")
    return acao


@router.patch("/pdi/{acao_id}", response_model=PdiAcaoResponse)
async def atualizar_acao_pdi(
    acao_id: int,
    payload: PdiAcaoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    acao = await _carregar_acao_com_permissao(db, envoxer, acao_id)

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ("planejada", "em_andamento", "concluida", "cancelada"):
        raise HTTPException(status_code=400, detail="Status inválido")

    for field, value in updates.items():
        setattr(acao, field, value)

    if updates.get("status") == "concluida" and acao.concluida_em is None:
        acao.concluida_em = datetime.now(timezone.utc)
    elif "status" in updates and updates["status"] != "concluida":
        acao.concluida_em = None

    await db.flush()
    await db.refresh(acao)

    result_com = await db.execute(select(PdiAcaoComentario).where(PdiAcaoComentario.pdi_acao_id == acao.id))
    envoxers = await _mapa_envoxers(db)
    return _montar_resposta_acao(acao, list(result_com.scalars().all()), envoxers)


@router.post("/pdi/{acao_id}/comentarios", response_model=PdiAcaoResponse, status_code=201)
async def comentar_acao_pdi(
    acao_id: int,
    payload: PdiAcaoComentarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    acao = await _carregar_acao_com_permissao(db, envoxer, acao_id)

    db.add(PdiAcaoComentario(pdi_acao_id=acao.id, autor_id=envoxer.id, texto=payload.texto))
    await db.flush()

    result_com = await db.execute(select(PdiAcaoComentario).where(PdiAcaoComentario.pdi_acao_id == acao.id))
    envoxers = await _mapa_envoxers(db)
    return _montar_resposta_acao(acao, list(result_com.scalars().all()), envoxers)
