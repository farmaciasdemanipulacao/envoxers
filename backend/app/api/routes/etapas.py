"""Etapas do processo — checklist estruturado dentro da Tarefa, com automação simples
entre elas (LIBERAR_PROXIMA_ETAPA, MOVER_TAREFA_COLUNA, MARCAR_TAREFA_CONCLUIDA,
CRIAR_ALERTA_RESPONSAVEL). Ver app/services/etapas_automacao.py para a execução.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.tarefa import Tarefa, STATUS_TAREFA_VALUES
from app.models.etapa import Etapa
from app.models.automacao_etapa import AutomacaoEtapa, ACAO_AUTOMACAO_VALUES
from app.schemas.etapa import EtapaCreate, EtapaUpdate, EtapaResponse, AutomacaoEtapaUpsert, AutomacaoEtapaResponse
from app.services.etapas_automacao import executar_automacao

router = APIRouter(tags=["etapas"])


async def _obter_tarefa_ou_404(db: AsyncSession, tarefa_id: int) -> Tarefa:
    result = await db.execute(
        select(Tarefa).where(and_(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None)))
    )
    tarefa = result.scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


async def _listar_etapas_ordenadas(db: AsyncSession, tarefa_id: int) -> list[Etapa]:
    result = await db.execute(
        select(Etapa).where(Etapa.tarefa_id == tarefa_id).order_by(Etapa.ordem, Etapa.id)
    )
    return list(result.scalars().all())


async def _obter_etapa_ou_404(db: AsyncSession, tarefa_id: int, etapa_id: int) -> Etapa:
    result = await db.execute(
        select(Etapa).where(and_(Etapa.id == etapa_id, Etapa.tarefa_id == tarefa_id))
    )
    etapa = result.scalar_one_or_none()
    if etapa is None:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")
    return etapa


async def _obter_automacao(db: AsyncSession, etapa_id: int) -> Optional[AutomacaoEtapa]:
    result = await db.execute(select(AutomacaoEtapa).where(AutomacaoEtapa.etapa_id == etapa_id))
    return result.scalar_one_or_none()


async def _nomes_envoxers(db: AsyncSession, ids: set[int]) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    result = await db.execute(select(Envoxer.id, Envoxer.nome).where(Envoxer.id.in_(ids)))
    return {row[0]: row[1] for row in result.all()}


async def _to_response(db: AsyncSession, etapas: list[Etapa]) -> list[EtapaResponse]:
    """Monta a lista com nome do responsável, automação e cálculo de bloqueio pela etapa anterior."""
    etapas = sorted(etapas, key=lambda e: (e.ordem, e.id))
    nomes = await _nomes_envoxers(db, {e.responsavel_id for e in etapas})

    automacoes_result = await db.execute(
        select(AutomacaoEtapa).where(AutomacaoEtapa.etapa_id.in_([e.id for e in etapas] or [-1]))
    )
    automacoes_por_etapa = {a.etapa_id: a for a in automacoes_result.scalars().all()}

    respostas = []
    anterior: Optional[Etapa] = None
    for etapa in etapas:
        automacao_anterior = automacoes_por_etapa.get(anterior.id) if anterior else None
        bloqueada = bool(
            anterior
            and automacao_anterior
            and automacao_anterior.ativo
            and automacao_anterior.acao == "LIBERAR_PROXIMA_ETAPA"
            and anterior.status != "concluida"
        )
        automacao = automacoes_por_etapa.get(etapa.id)
        resp = EtapaResponse(
            id=etapa.id,
            tarefa_id=etapa.tarefa_id,
            titulo=etapa.titulo,
            descricao=etapa.descricao,
            responsavel_id=etapa.responsavel_id,
            responsavel_nome=nomes.get(etapa.responsavel_id),
            prazo=etapa.prazo,
            ordem=etapa.ordem,
            status=etapa.status,
            concluida_em=etapa.concluida_em,
            automacao=AutomacaoEtapaResponse.model_validate(automacao) if automacao else None,
            bloqueada=bloqueada,
        )
        respostas.append(resp)
        anterior = etapa
    return respostas


def _pode_concluir(envoxer: Envoxer, etapa: Etapa) -> bool:
    if envoxer.permissao in ("admin", "gestor"):
        return True
    return etapa.responsavel_id is not None and etapa.responsavel_id == envoxer.id


@router.get("/tarefas/{tarefa_id}/etapas", response_model=list[EtapaResponse])
async def listar_etapas(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    etapas = await _listar_etapas_ordenadas(db, tarefa_id)
    return await _to_response(db, etapas)


@router.post("/tarefas/{tarefa_id}/etapas", response_model=EtapaResponse, status_code=201)
async def criar_etapa(
    tarefa_id: int,
    payload: EtapaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="Título é obrigatório")

    result = await db.execute(select(Etapa.ordem).where(Etapa.tarefa_id == tarefa_id))
    maior_ordem = max([o for (o,) in result.all()], default=-1)

    etapa = Etapa(
        tarefa_id=tarefa_id,
        titulo=payload.titulo,
        descricao=payload.descricao,
        responsavel_id=payload.responsavel_id,
        prazo=payload.prazo,
        ordem=maior_ordem + 1,
    )
    db.add(etapa)
    await db.flush()
    await db.refresh(etapa)
    resp = await _to_response(db, await _listar_etapas_ordenadas(db, tarefa_id))
    return next(r for r in resp if r.id == etapa.id)


@router.patch("/tarefas/{tarefa_id}/etapas/{etapa_id}", response_model=EtapaResponse)
async def atualizar_etapa(
    tarefa_id: int,
    etapa_id: int,
    payload: EtapaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    etapa = await _obter_etapa_ou_404(db, tarefa_id, etapa_id)

    data = payload.model_dump(exclude_unset=True)
    for campo, valor in data.items():
        setattr(etapa, campo, valor)

    await db.flush()
    await db.refresh(etapa)
    resp = await _to_response(db, await _listar_etapas_ordenadas(db, tarefa_id))
    return next(r for r in resp if r.id == etapa.id)


@router.delete("/tarefas/{tarefa_id}/etapas/{etapa_id}", status_code=204)
async def excluir_etapa(
    tarefa_id: int,
    etapa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    etapa = await _obter_etapa_ou_404(db, tarefa_id, etapa_id)
    await db.delete(etapa)
    await db.flush()


@router.post("/tarefas/{tarefa_id}/etapas/{etapa_id}/concluir", response_model=EtapaResponse)
async def concluir_etapa(
    tarefa_id: int,
    etapa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    etapa = await _obter_etapa_ou_404(db, tarefa_id, etapa_id)

    if not _pode_concluir(envoxer, etapa):
        raise HTTPException(status_code=403, detail="Só o responsável da etapa (ou gestor/admin) pode concluí-la")

    if etapa.status == "concluida":
        resp = await _to_response(db, await _listar_etapas_ordenadas(db, tarefa_id))
        return next(r for r in resp if r.id == etapa.id)

    todas = await _listar_etapas_ordenadas(db, tarefa_id)
    respostas = await _to_response(db, todas)
    minha = next(r for r in respostas if r.id == etapa.id)
    if minha.bloqueada:
        raise HTTPException(status_code=400, detail="Etapa bloqueada — conclua a etapa anterior primeiro")

    etapa.status = "concluida"
    etapa.concluida_em = datetime.now(timezone.utc)
    await db.flush()

    automacao = await _obter_automacao(db, etapa.id)
    if automacao and automacao.ativo:
        proxima = next((e for e in todas if e.ordem > etapa.ordem), None)
        await executar_automacao(db, automacao=automacao, etapa=etapa, tarefa=tarefa, proxima_etapa=proxima)

    await db.flush()
    await db.refresh(etapa)
    resp = await _to_response(db, await _listar_etapas_ordenadas(db, tarefa_id))
    return next(r for r in resp if r.id == etapa.id)


@router.post("/tarefas/{tarefa_id}/etapas/{etapa_id}/reabrir", response_model=EtapaResponse)
async def reabrir_etapa(
    tarefa_id: int,
    etapa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    etapa = await _obter_etapa_ou_404(db, tarefa_id, etapa_id)

    if not _pode_concluir(envoxer, etapa):
        raise HTTPException(status_code=403, detail="Só o responsável da etapa (ou gestor/admin) pode reabri-la")

    etapa.status = "pendente"
    etapa.concluida_em = None
    await db.flush()
    await db.refresh(etapa)
    resp = await _to_response(db, await _listar_etapas_ordenadas(db, tarefa_id))
    return next(r for r in resp if r.id == etapa.id)


@router.put("/tarefas/{tarefa_id}/etapas/{etapa_id}/automacao", response_model=AutomacaoEtapaResponse)
async def configurar_automacao(
    tarefa_id: int,
    etapa_id: int,
    payload: AutomacaoEtapaUpsert,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    await _obter_etapa_ou_404(db, tarefa_id, etapa_id)

    if payload.acao not in ACAO_AUTOMACAO_VALUES:
        raise HTTPException(status_code=400, detail="Ação de automação inválida")
    if payload.acao == "MOVER_TAREFA_COLUNA":
        if not payload.coluna_destino or payload.coluna_destino not in STATUS_TAREFA_VALUES:
            raise HTTPException(status_code=400, detail="coluna_destino inválida")

    automacao = await _obter_automacao(db, etapa_id)
    if automacao is None:
        automacao = AutomacaoEtapa(etapa_id=etapa_id)
        db.add(automacao)

    automacao.acao = payload.acao
    automacao.coluna_destino = payload.coluna_destino if payload.acao == "MOVER_TAREFA_COLUNA" else None
    automacao.ativo = payload.ativo

    await db.flush()
    await db.refresh(automacao)
    return automacao


@router.delete("/tarefas/{tarefa_id}/etapas/{etapa_id}/automacao", status_code=204)
async def remover_automacao(
    tarefa_id: int,
    etapa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    await _obter_etapa_ou_404(db, tarefa_id, etapa_id)
    automacao = await _obter_automacao(db, etapa_id)
    if automacao:
        await db.delete(automacao)
        await db.flush()
