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
from app.models.etapa import Etapa
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
from app.services.realtime import notificar_tarefa_atualizada

router = APIRouter(prefix="/portal", tags=["portal-operacao"])

STATUS_EM_ANDAMENTO = ("nova", "planejamento", "producao", "revisao_interna", "aprovacao_cliente", "ajustes", "programado")
AJUSTE_TIPOS = {"texto", "imagem", "layout", "informacao", "outro"}


def _solicitacao_out(s: Solicitacao) -> PortalSolicitacaoOut:
    return PortalSolicitacaoOut.model_validate(s)


def _tarefa_out(t: Tarefa) -> PortalTarefaOut:
    return PortalTarefaOut(
        id=t.id,
        titulo=t.titulo,
        status=t.status,
        prazo=t.prazo,
        etiqueta=t.etiqueta,
        etiqueta_cor=t.etiqueta_cor,
        comentarios=list(t.comentarios or []),
        anexos=list(t.anexos or []),
        qtd_alteracoes=t.qtd_alteracoes or 0,
        aprovada_cliente=bool(t.aprovada_cliente),
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


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
        tarefas_recentes=[_tarefa_out(t) for t in tarefas[:6]],
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
    stmt = select(Tarefa).where(Tarefa.cliente_id == contato.cliente_id, Tarefa.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Tarefa.status == status)
    rows = (await db.execute(stmt.order_by(Tarefa.updated_at.desc()))).scalars().all()
    return [_tarefa_out(t) for t in rows]


@router.get("/tarefas/{tarefa_id}", response_model=PortalTarefaOut)
async def obter_tarefa(
    tarefa_id: int,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return _tarefa_out(await _tarefa_do_cliente(db, contato, tarefa_id))


@router.get("/aprovacoes", response_model=list[PortalTarefaOut])
async def listar_aprovacoes_pendentes(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(
        select(Tarefa)
        .where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
            Tarefa.status == "aprovacao_cliente",
        )
        .order_by(Tarefa.prazo.asc().nulls_last(), Tarefa.updated_at.desc())
    )).scalars().all()
    return [_tarefa_out(t) for t in rows]


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
    return _tarefa_out(tarefa)


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
    return _tarefa_out(tarefa)


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
    return _tarefa_out(tarefa)


@router.get("/campanhas", response_model=list[PortalCampanhaOut])
async def listar_campanhas(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (await db.execute(
        select(Tarefa).where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
            Tarefa.etiqueta.is_not(None),
        )
    )).scalars().all()
    grupos: dict[str, list[Tarefa]] = {}
    for tarefa in rows:
        nome = (tarefa.etiqueta or "Sem campanha").strip()
        grupos.setdefault(nome, []).append(tarefa)

    saida = []
    for nome, tarefas in sorted(grupos.items(), key=lambda kv: kv[0].lower()):
        total = len(tarefas)
        finalizados = sum(1 for t in tarefas if t.status == "finalizado")
        aprovacoes = sum(1 for t in tarefas if t.status == "aprovacao_cliente")
        em_andamento = total - finalizados
        progresso = round((finalizados / total) * 100) if total else 0
        saida.append(PortalCampanhaOut(
            nome=nome,
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
    rows = (await db.execute(
        select(Tarefa)
        .where(
            Tarefa.cliente_id == contato.cliente_id,
            Tarefa.deleted_at.is_(None),
            Tarefa.status == "finalizado",
        )
        .order_by(Tarefa.finalizada_em.desc().nulls_last(), Tarefa.updated_at.desc())
    )).scalars().all()
    return [PortalBibliotecaItem(
        tarefa_id=t.id,
        titulo=t.titulo,
        campanha=t.etiqueta,
        finalizada_em=t.finalizada_em,
        anexos=list(t.anexos or []),
    ) for t in rows]
