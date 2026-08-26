"""Operação do Portal do Cliente.

Todas as consultas são escopadas pelo cliente_id do ClienteContato autenticado.
O token do portal nunca é aceito nas rotas internas do Envoxers e vice-versa.
"""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_cliente_contato
from app.db.session import get_db
from app.models.alteracao import Alteracao
from app.models.aprovacao import Aprovacao
from app.models.cliente_contato import ClienteContato
from app.models.campanha import Campanha
from app.models.entrega_check import EntregaCheck
from app.models.etapa import Etapa
from app.models.item_escopo import ItemEscopo
from app.models.solicitacao import Solicitacao, TIPO_SOLICITACAO_VALUES
from app.models.tarefa import Tarefa
from app.schemas.portal_operacao import (
    PortalAjusteCreate,
    PortalBibliotecaItem,
    PortalCampanhaOut,
    PortalComentarioCreate,
    PortalDashboardOut,
    PortalSolicitacaoCreate,
    PortalSolicitacaoOut,
    PortalTarefaOut,
)
from app.services.dias_uteis import proximo_dia_util
from app.services.provisionamento import garantir_cards_do_mes
from app.services.realtime import notificar_tarefa_atualizada

router = APIRouter(prefix="/portal", tags=["portal-operacao"])

STATUS_EM_ANDAMENTO = ("nova", "planejamento", "producao", "revisao_interna", "aprovacao_cliente", "ajustes", "programado")
AJUSTE_TIPOS = {"texto", "imagem", "layout", "informacao", "outro"}


def _solicitacao_out(s: Solicitacao) -> PortalSolicitacaoOut:
    return PortalSolicitacaoOut.model_validate(s)


async def _tarefas_out(db: AsyncSession, tarefas: list[Tarefa]) -> list[PortalTarefaOut]:
    if not tarefas:
        return []

    item_ids = {t.item_escopo_id for t in tarefas if t.item_escopo_id}
    campanha_ids = {t.campanha_id for t in tarefas if getattr(t, "campanha_id", None)}
    tarefa_ids = [t.id for t in tarefas]

    itens = {}
    if item_ids:
        rows = (await db.execute(select(ItemEscopo).where(ItemEscopo.id.in_(item_ids)))).scalars().all()
        itens = {i.id: i for i in rows}

    campanhas = {}
    if campanha_ids:
        rows = (await db.execute(select(Campanha).where(Campanha.id.in_(campanha_ids)))).scalars().all()
        campanhas = {c.id: c for c in rows}

    entregues = {}
    if tarefa_ids:
        rows = (await db.execute(
            select(EntregaCheck.tarefa_id, func.count(EntregaCheck.id))
            .where(EntregaCheck.tarefa_id.in_(tarefa_ids), EntregaCheck.entregue.is_(True))
            .group_by(EntregaCheck.tarefa_id)
        )).all()
        entregues = {tid: int(qtd) for tid, qtd in rows}

    saida = []
    for t in tarefas:
        item = itens.get(t.item_escopo_id)
        campanha = campanhas.get(getattr(t, "campanha_id", None))
        saida.append(PortalTarefaOut(
            id=t.id,
            titulo=t.titulo,
            status=t.status,
            prazo=t.prazo,
            etiqueta=t.etiqueta,
            etiqueta_cor=t.etiqueta_cor,
            ano_mes=t.ano_mes,
            cadencia=item.cadencia if item else None,
            item_tipo=item.tipo if item else None,
            item_descricao=item.descricao if item else None,
            quantidade_contratada=item.quantidade if item else None,
            quantidade_entregue=entregues.get(t.id, 0),
            campanha_id=campanha.id if campanha else None,
            campanha_nome=campanha.nome if campanha else None,
            comentarios=list(t.comentarios or []),
            anexos=list(t.anexos or []),
            qtd_alteracoes=t.qtd_alteracoes or 0,
            aprovada_cliente=bool(t.aprovada_cliente),
            created_at=t.created_at,
            updated_at=t.updated_at,
        ))
    return saida


async def _tarefa_out(db: AsyncSession, tarefa: Tarefa) -> PortalTarefaOut:
    return (await _tarefas_out(db, [tarefa]))[0]


async def _tarefa_do_cliente(db: AsyncSession, contato: ClienteContato, tarefa_id: int) -> Tarefa:
    result = await db.execute(
        select(Tarefa).where(
            Tarefa.id == tarefa_id,
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
        )
    )
    tarefa = result.scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    return tarefa


@router.get("/dashboard", response_model=PortalDashboardOut)
async def dashboard(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await garantir_cards_do_mes(db, contato.cliente_id)
    solicitacoes = list((await db.execute(
        select(Solicitacao)
        .where(Solicitacao.cliente_id == contato.cliente_id)
        .order_by(Solicitacao.created_at.desc())
    )).scalars().all())
    tarefas = list((await db.execute(
        select(Tarefa)
        .where(Tarefa.cliente_id == contato.cliente_id, Tarefa.deleted_at.is_(None))
        .order_by(Tarefa.updated_at.desc())
    )).scalars().all())

    return PortalDashboardOut(
        solicitacoes_abertas=sum(1 for s in solicitacoes if s.status in ("nova", "em_analise")),
        em_andamento=sum(1 for t in tarefas if t.status in STATUS_EM_ANDAMENTO),
        aprovacoes_pendentes=sum(1 for t in tarefas if t.status == "aprovacao_cliente"),
        finalizados=sum(1 for t in tarefas if t.status == "finalizado"),
        solicitacoes_recentes=[_solicitacao_out(s) for s in solicitacoes[:4]],
        tarefas_recentes=await _tarefas_out(db, tarefas[:6]),
    )


@router.get("/solicitacoes", response_model=list[PortalSolicitacaoOut])
async def listar_solicitacoes(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(
        select(Solicitacao)
        .where(Solicitacao.cliente_id == contato.cliente_id)
        .order_by(Solicitacao.created_at.desc())
    )).scalars().all()
    return [_solicitacao_out(s) for s in rows]


@router.post("/solicitacoes", response_model=PortalSolicitacaoOut, status_code=201)
async def criar_solicitacao(
    payload: PortalSolicitacaoCreate,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.tipo not in TIPO_SOLICITACAO_VALUES:
        raise HTTPException(status_code=400, detail="Tipo de solicitação inválido")
    solicitacao = Solicitacao(
        cliente_id=contato.cliente_id,
        tipo=payload.tipo,
        titulo=payload.titulo.strip(),
        descricao=(payload.descricao or "").strip() or None,
        solicitante_nome=contato.nome,
        status="nova",
    )
    db.add(solicitacao)
    await db.flush()
    await db.refresh(solicitacao)
    return _solicitacao_out(solicitacao)


@router.get("/tarefas", response_model=list[PortalTarefaOut])
async def listar_tarefas(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = None,
):
    await garantir_cards_do_mes(db, contato.cliente_id)
    stmt = select(Tarefa).where(Tarefa.cliente_id == contato.cliente_id, Tarefa.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Tarefa.status == status)
    rows = (await db.execute(stmt.order_by(Tarefa.updated_at.desc()))).scalars().all()
    return await _tarefas_out(db, list(rows))


@router.get("/tarefas/{tarefa_id}", response_model=PortalTarefaOut)
async def obter_tarefa(
    tarefa_id: int,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await _tarefa_out(db, await _tarefa_do_cliente(db, contato, tarefa_id))


@router.get("/aprovacoes", response_model=list[PortalTarefaOut])
async def listar_aprovacoes_pendentes(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await garantir_cards_do_mes(db, contato.cliente_id)
    rows = (await db.execute(
        select(Tarefa)
        .where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
            Tarefa.status == "aprovacao_cliente",
        )
        .order_by(Tarefa.prazo.asc().nulls_last(), Tarefa.updated_at.desc())
    )).scalars().all()
    return await _tarefas_out(db, list(rows))


@router.post("/tarefas/{tarefa_id}/aprovar", response_model=PortalTarefaOut)
async def aprovar_tarefa(
    tarefa_id: int,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    tarefa = await _tarefa_do_cliente(db, contato, tarefa_id)
    if tarefa.status != "aprovacao_cliente":
        raise HTTPException(status_code=400, detail="Este material não está aguardando aprovação")

    tarefa.aprovada_cliente = True
    tarefa.status = "programado"
    db.add(Aprovacao(
        tarefa_id=tarefa.id,
        etapa="cliente",
        decisao="aprovada",
        decidido_por_cliente_nome=contato.nome,
        comentario=None,
    ))
    await db.flush()
    await db.refresh(tarefa)
    await notificar_tarefa_atualizada(db, tarefa.id)
    return await _tarefa_out(db, tarefa)


@router.post("/tarefas/{tarefa_id}/ajuste", response_model=PortalTarefaOut)
async def pedir_ajuste(
    tarefa_id: int,
    payload: PortalAjusteCreate,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    tarefa = await _tarefa_do_cliente(db, contato, tarefa_id)
    if tarefa.status != "aprovacao_cliente":
        raise HTTPException(status_code=400, detail="Este material não está aguardando aprovação")
    if payload.tipo not in AJUSTE_TIPOS:
        raise HTTPException(status_code=400, detail="Tipo de ajuste inválido")

    atual = (await db.execute(
        select(func.coalesce(func.max(Alteracao.numero), 0)).where(Alteracao.tarefa_id == tarefa.id)
    )).scalar_one()
    numero = int(atual) + 1
    descricao = f"[{payload.tipo}] {payload.descricao.strip()}"
    db.add(Alteracao(
        tarefa_id=tarefa.id,
        numero=numero,
        descricao=descricao,
        solicitante_cliente_nome=contato.nome,
        status="pendente",
    ))

    # Se a demanda já tem um responsável, cria uma etapa de ajuste automaticamente.
    # Se não tiver, o pedido ainda fica registrado e pode ser triado pela Envox.
    if tarefa.responsavel_envoxer_id:
        ordem = (await db.execute(
            select(func.coalesce(func.max(Etapa.ordem), -1)).where(Etapa.tarefa_id == tarefa.id)
        )).scalar_one() + 1
        db.add(Etapa(
            tarefa_id=tarefa.id,
            titulo="Ajustar",
            descricao=descricao,
            responsavel_id=tarefa.responsavel_envoxer_id,
            prazo=proximo_dia_util(date.today()),
            ordem=ordem,
        ))

    tarefa.qtd_alteracoes = numero
    tarefa.status = "ajustes"
    db.add(Aprovacao(
        tarefa_id=tarefa.id,
        etapa="cliente",
        decisao="pediu_ajuste",
        decidido_por_cliente_nome=contato.nome,
        comentario=descricao,
    ))
    await db.flush()
    await db.refresh(tarefa)
    await notificar_tarefa_atualizada(db, tarefa.id)
    return await _tarefa_out(db, tarefa)


@router.post("/tarefas/{tarefa_id}/comentar", response_model=PortalTarefaOut)
async def comentar_tarefa(
    tarefa_id: int,
    payload: PortalComentarioCreate,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    tarefa = await _tarefa_do_cliente(db, contato, tarefa_id)
    comentarios = list(tarefa.comentarios or [])
    comentarios.append({
        "envoxer_id": 0,
        "envoxer_nome": f"{contato.nome} · Cliente",
        "texto": payload.texto.strip(),
        "mencoes": [],
        "criado_em": datetime.now(timezone.utc).isoformat(),
    })
    tarefa.comentarios = comentarios
    await db.flush()
    await db.refresh(tarefa)
    await notificar_tarefa_atualizada(db, tarefa.id)
    return await _tarefa_out(db, tarefa)


@router.get("/campanhas", response_model=list[PortalCampanhaOut])
async def listar_campanhas(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    campanhas = (await db.execute(
        select(Campanha)
        .where(Campanha.cliente_id == contato.cliente_id)
        .order_by(Campanha.data_inicio.desc().nulls_last(), Campanha.created_at.desc())
    )).scalars().all()
    if not campanhas:
        return []

    ids = [c.id for c in campanhas]
    tarefas = (await db.execute(
        select(Tarefa).where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.campanha_id.in_(ids),
            Tarefa.deleted_at.is_(None),
        )
    )).scalars().all()
    por_campanha: dict[int, list[Tarefa]] = {c.id: [] for c in campanhas}
    for tarefa in tarefas:
        por_campanha.setdefault(tarefa.campanha_id, []).append(tarefa)

    saida = []
    for campanha in campanhas:
        jobs = por_campanha.get(campanha.id, [])
        total = len(jobs)
        finalizados = sum(1 for t in jobs if t.status == "finalizado")
        aprovacoes = sum(1 for t in jobs if t.status == "aprovacao_cliente")
        em_andamento = sum(1 for t in jobs if t.status in STATUS_EM_ANDAMENTO)
        progresso = round((finalizados / total) * 100) if total else 0
        saida.append(PortalCampanhaOut(
            id=campanha.id,
            nome=campanha.nome,
            descricao=campanha.descricao,
            status=campanha.status,
            data_inicio=campanha.data_inicio,
            data_fim=campanha.data_fim,
            total=total,
            em_andamento=em_andamento,
            aprovacao=aprovacoes,
            finalizados=finalizados,
            progresso=progresso,
        ))
    return saida


@router.get("/biblioteca", response_model=list[PortalBibliotecaItem])
async def listar_biblioteca(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await garantir_cards_do_mes(db, contato.cliente_id)
    rows = (await db.execute(
        select(Tarefa)
        .where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
            Tarefa.status == "finalizado",
        )
        .order_by(Tarefa.finalizada_em.desc().nulls_last(), Tarefa.updated_at.desc())
    )).scalars().all()
    enriched = await _tarefas_out(db, list(rows))
    by_id = {item.id: item for item in enriched}
    return [PortalBibliotecaItem(
        tarefa_id=t.id,
        titulo=t.titulo,
        campanha=by_id[t.id].campanha_nome,
        finalizada_em=t.finalizada_em,
        anexos=list(t.anexos or []),
    ) for t in rows]
