"""F2 Módulo 1 — Aprovações (interna + cliente) e Alterações contabilizadas."""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.tarefa import Tarefa
from app.models.escopo import Escopo
from app.models.etapa import Etapa
from app.models.aprovacao import Aprovacao
from app.models.alteracao import Alteracao
from app.schemas.aprovacao import (
    AprovacaoDecisaoCreate,
    AprovacaoResponse,
    AlteracaoCreate,
    AlteracaoUpdate,
    AlteracaoResponse,
)
from app.services.dias_uteis import proximo_dia_util
from app.services.realtime import notificar_tarefa_atualizada

router = APIRouter(tags=["aprovacoes"])


async def _obter_tarefa_ou_404(db: AsyncSession, tarefa_id: int) -> Tarefa:
    result = await db.execute(
        select(Tarefa).where(and_(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None)))
    )
    tarefa = result.scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


async def _criar_etapas_ajuste(
    db: AsyncSession, tarefa_id: int, responsaveis_ajuste: list[int], descricao: Optional[str]
) -> None:
    """Cria 1 Etapa "Ajustar" por responsável selecionado, com prazo no próximo
    dia útil — disparado tanto pelo "pediu ajuste" da Revisão interna quanto
    pela Alteração pedida pelo cliente (mesmo checklist, dois pontos de entrada).
    """
    if not responsaveis_ajuste:
        raise HTTPException(status_code=400, detail="Selecione ao menos 1 responsável pelo ajuste")

    result = await db.execute(
        select(Envoxer.id).where(Envoxer.id.in_(responsaveis_ajuste), Envoxer.ativo.is_(True))
    )
    ids_validos = [row[0] for row in result.all()]
    if not ids_validos:
        raise HTTPException(status_code=400, detail="Responsável(is) do ajuste inválido(s)")

    # Posiciona logo após a ÚLTIMA etapa já concluída, não no fim da lista —
    # ajuste pedido pela revisão/cliente é urgente, não deve ficar atrás de
    # etapas pendentes antigas que ainda nem começaram. Abre espaço deslocando
    # pra frente (+qtd_novas) quem já estava a partir dali; o cálculo de
    # bloqueio (etapas.py::_to_response) é sempre recomputado pela ordem atual,
    # então esse deslocamento não quebra nenhuma trava LIBERAR_PROXIMA_ETAPA já
    # configurada — etapa concluída nunca bloqueia a seguinte, então a etapa
    # que agora vem logo depois da última concluída não fica presa por engano.
    ordem_ultima_concluida = (
        await db.execute(
            select(func.max(Etapa.ordem)).where(Etapa.tarefa_id == tarefa_id, Etapa.status == "concluida")
        )
    ).scalar()
    posicao_insercao = (ordem_ultima_concluida + 1) if ordem_ultima_concluida is not None else 0
    qtd_novas = len(ids_validos)

    await db.execute(
        update(Etapa)
        .where(Etapa.tarefa_id == tarefa_id, Etapa.ordem >= posicao_insercao)
        .values(ordem=Etapa.ordem + qtd_novas)
    )

    prazo = proximo_dia_util(date.today())
    for indice, responsavel_id in enumerate(ids_validos):
        db.add(
            Etapa(
                tarefa_id=tarefa_id,
                titulo="Ajustar",
                descricao=descricao,
                responsavel_id=responsavel_id,
                prazo=prazo,
                ordem=posicao_insercao + indice,
            )
        )
    await db.flush()


@router.post("/tarefas/{tarefa_id}/aprovacao", response_model=AprovacaoResponse, status_code=201)
async def decidir_aprovacao(
    tarefa_id: int,
    payload: AprovacaoDecisaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.etapa not in ("interna", "cliente"):
        raise HTTPException(status_code=400, detail="etapa deve ser 'interna' ou 'cliente'")
    if payload.decisao not in ("aprovada", "pediu_ajuste"):
        raise HTTPException(status_code=400, detail="decisao deve ser 'aprovada' ou 'pediu_ajuste'")

    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)

    if payload.etapa == "interna":
        if envoxer.permissao not in ("admin", "gestor"):
            raise HTTPException(status_code=403, detail="Só gestor ou admin decide a aprovação interna")
        if tarefa.status != "revisao_interna":
            raise HTTPException(status_code=400, detail="Tarefa não está em Revisão interna")
        if payload.decisao == "aprovada":
            tarefa.aprovada_interna = True
            tarefa.status = "aprovacao_cliente"
        else:
            if not payload.comentario:
                raise HTTPException(status_code=400, detail="Comentário é obrigatório ao pedir ajuste")
            await _criar_etapas_ajuste(db, tarefa.id, payload.responsaveis_ajuste, payload.comentario)
            tarefa.status = "ajustes"
    else:  # cliente
        if tarefa.status != "aprovacao_cliente":
            raise HTTPException(status_code=400, detail="Tarefa não está em Aprovação cliente")
        if payload.decisao == "pediu_ajuste":
            raise HTTPException(
                status_code=400,
                detail="Para solicitar alteração do cliente use POST /tarefas/{id}/alteracoes",
            )
        tarefa.aprovada_cliente = True
        tarefa.status = "programado"

    aprovacao = Aprovacao(
        tarefa_id=tarefa.id,
        etapa=payload.etapa,
        decisao=payload.decisao,
        decidido_por_envoxer_id=envoxer.id,
        decidido_por_cliente_nome=payload.decidido_por_cliente_nome if payload.etapa == "cliente" else None,
        comentario=payload.comentario,
    )
    db.add(aprovacao)
    await db.flush()
    await db.refresh(aprovacao)
    await notificar_tarefa_atualizada(db, tarefa.id)
    return aprovacao


@router.get("/tarefas/{tarefa_id}/aprovacoes", response_model=list[AprovacaoResponse])
async def listar_aprovacoes(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    result = await db.execute(
        select(Aprovacao).where(Aprovacao.tarefa_id == tarefa_id).order_by(Aprovacao.created_at)
    )
    return list(result.scalars().all())


@router.post("/tarefas/{tarefa_id}/alteracoes", status_code=201)
async def solicitar_alteracao(
    tarefa_id: int,
    payload: AlteracaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    if tarefa.status != "aprovacao_cliente":
        raise HTTPException(status_code=400, detail="Tarefa não está em Aprovação cliente")

    numero_result = await db.execute(
        select(func.coalesce(func.max(Alteracao.numero), 0)).where(Alteracao.tarefa_id == tarefa_id)
    )
    proximo_numero = numero_result.scalar_one() + 1

    await _criar_etapas_ajuste(db, tarefa_id, payload.responsaveis_ajuste, payload.descricao)

    alteracao = Alteracao(
        tarefa_id=tarefa_id,
        numero=proximo_numero,
        descricao=payload.descricao,
        solicitante_cliente_nome=payload.solicitante_cliente_nome,
    )
    db.add(alteracao)

    tarefa.qtd_alteracoes = proximo_numero
    tarefa.status = "ajustes"
    await db.flush()
    await db.refresh(alteracao)

    escopo_result = await db.execute(select(Escopo).where(Escopo.cliente_id == tarefa.cliente_id))
    escopo = escopo_result.scalar_one_or_none()
    limite = escopo.limite_alteracoes if escopo else None
    ultrapassou = limite is not None and proximo_numero > limite

    await notificar_tarefa_atualizada(db, tarefa_id)
    return {
        "alteracao": AlteracaoResponse.model_validate(alteracao),
        "limite_alteracoes": limite,
        "ultrapassou_limite": ultrapassou,
    }


@router.get("/tarefas/{tarefa_id}/alteracoes", response_model=list[AlteracaoResponse])
async def listar_alteracoes(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    result = await db.execute(
        select(Alteracao).where(Alteracao.tarefa_id == tarefa_id).order_by(Alteracao.numero)
    )
    return list(result.scalars().all())


@router.patch("/alteracoes/{alteracao_id}", response_model=AlteracaoResponse)
async def atualizar_alteracao(
    alteracao_id: int,
    payload: AlteracaoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(Alteracao).where(Alteracao.id == alteracao_id))
    alteracao = result.scalar_one_or_none()
    if alteracao is None:
        raise HTTPException(status_code=404, detail="Alteração não encontrada")

    updates = payload.model_dump(exclude_unset=True)
    if updates.get("status") and updates["status"] not in ("pendente", "em_execucao", "feita", "descartada"):
        raise HTTPException(status_code=400, detail="status inválido")
    for field, value in updates.items():
        setattr(alteracao, field, value)
    await db.flush()
    await db.refresh(alteracao)
    return alteracao
