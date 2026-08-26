from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, and_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.api.routes.registro_foco import finalizar_foco_ativo_da_tarefa
from app.core.uploads import salvar_upload
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.servico import Servico
from app.models.tarefa import Tarefa
from app.models.entrega_check import EntregaCheck
from app.models.etapa import Etapa
from app.models.prioridade_manual import PrioridadeManual
from app.schemas.tarefa import TarefaCreate, TarefaUpdate, TarefaResponse, ComentarioCreate, EntregaCheckResponse, PrioridadeDiaReordenar
from app.services.provisionamento import garantir_cards_do_mes
from app.services.etapas_automacao import aplicar_processo_do_servico
from app.services.realtime import notificar_tarefa_atualizada

router = APIRouter(prefix="/tarefas", tags=["tarefas"])

_JOIN_STMT = (
    select(Tarefa, Cliente.nome, Cliente.status_farol, Servico.nome, Envoxer.nome, Envoxer.foto_url)
    .join(Cliente, Cliente.id == Tarefa.cliente_id)
    .outerjoin(Servico, Servico.id == Tarefa.servico_id)
    .outerjoin(Envoxer, Envoxer.id == Tarefa.responsavel_envoxer_id)
)


def _to_response(
    tarefa: Tarefa,
    cliente_nome: str,
    cliente_farol: str,
    servico_nome: Optional[str],
    responsavel_nome: Optional[str],
    responsavel_foto: Optional[str],
    proxima_etapa: Optional[dict] = None,
    etapas_responsaveis_ids: Optional[list[int]] = None,
) -> TarefaResponse:
    hoje = date.today()
    atrasada = bool(tarefa.prazo and tarefa.prazo < hoje and tarefa.status != "finalizado")
    return TarefaResponse(
        id=tarefa.id,
        cliente_id=tarefa.cliente_id,
        servico_id=tarefa.servico_id,
        item_escopo_id=tarefa.item_escopo_id,
        titulo=tarefa.titulo,
        responsavel_envoxer_id=tarefa.responsavel_envoxer_id,
        status=tarefa.status,
        ordem=tarefa.ordem,
        prazo=tarefa.prazo,
        etiqueta=tarefa.etiqueta,
        etiqueta_cor=tarefa.etiqueta_cor,
        comentarios=tarefa.comentarios or [],
        anexos=tarefa.anexos or [],
        cliente_nome=cliente_nome,
        cliente_farol=cliente_farol,
        servico_nome=servico_nome,
        responsavel_nome=responsavel_nome,
        responsavel_foto=responsavel_foto,
        atrasada=atrasada,
        qtd_comentarios=len(tarefa.comentarios or []),
        qtd_anexos=len(tarefa.anexos or []),
        qtd_alteracoes=tarefa.qtd_alteracoes,
        aprovada_interna=tarefa.aprovada_interna,
        aprovada_cliente=tarefa.aprovada_cliente,
        proxima_etapa_titulo=proxima_etapa["titulo"] if proxima_etapa else None,
        proxima_etapa_responsavel_id=proxima_etapa["responsavel_id"] if proxima_etapa else None,
        proxima_etapa_responsavel_nome=proxima_etapa["responsavel_nome"] if proxima_etapa else None,
        proxima_etapa_responsavel_foto=proxima_etapa["responsavel_foto"] if proxima_etapa else None,
        proxima_etapa_prazo=proxima_etapa["prazo"] if proxima_etapa else None,
        etapas_responsaveis_ids=etapas_responsaveis_ids or [],
        finalizada_em=tarefa.finalizada_em,
        ano_mes=tarefa.ano_mes,
        created_at=tarefa.created_at,
        updated_at=tarefa.updated_at,
    )


async def _proxima_etapa_por_tarefa(db: AsyncSession, tarefa_ids: list[int]) -> dict[int, dict]:
    """P/ cada tarefa, a etapa pendente de menor ordem (ordem, id) — mesmo
    critério de "próxima etapa" já usado em CRIAR_ALERTA_RESPONSAVEL (ver
    services/etapas_automacao.py). 1 query só, pegando a 1ª ocorrência de cada
    tarefa_id (garantida pelo ORDER BY) em vez de 1 query por card."""
    if not tarefa_ids:
        return {}
    result = await db.execute(
        select(Etapa, Envoxer.nome, Envoxer.foto_url)
        .outerjoin(Envoxer, Envoxer.id == Etapa.responsavel_id)
        .where(Etapa.tarefa_id.in_(tarefa_ids), Etapa.status == "pendente")
        .order_by(Etapa.tarefa_id, Etapa.ordem, Etapa.id)
    )
    proxima_por_tarefa: dict[int, dict] = {}
    for etapa, resp_nome, resp_foto in result.all():
        if etapa.tarefa_id in proxima_por_tarefa:
            continue
        proxima_por_tarefa[etapa.tarefa_id] = {
            "titulo": etapa.titulo,
            "responsavel_id": etapa.responsavel_id,
            "responsavel_nome": resp_nome,
            "responsavel_foto": resp_foto,
            "prazo": etapa.prazo,
        }
    return proxima_por_tarefa


async def _etapas_responsaveis_por_tarefa(db: AsyncSession, tarefa_ids: list[int]) -> dict[int, list[int]]:
    """P/ cada tarefa, o conjunto de envoxers responsáveis por alguma Etapa
    PENDENTE dela — usado pelo filtro de responsável do Kanban no modo
    "Tarefa/Etapa" (D-117), pra achar cards onde a pessoa é dona de uma etapa
    do checklist mesmo sem ser a responsavel_envoxer_id do card."""
    if not tarefa_ids:
        return {}
    result = await db.execute(
        select(Etapa.tarefa_id, Etapa.responsavel_id)
        .where(Etapa.tarefa_id.in_(tarefa_ids), Etapa.status == "pendente", Etapa.responsavel_id.is_not(None))
        .distinct()
    )
    por_tarefa: dict[int, list[int]] = {}
    for tarefa_id, responsavel_id in result.all():
        por_tarefa.setdefault(tarefa_id, []).append(responsavel_id)
    return por_tarefa


# Ranking automático da lista "prioridades de hoje" do Dashboard: atrasado
# primeiro, depois farol do cliente (vermelho > amarelo > verde > sem_dado),
# depois prazo mais próximo. Prioridade manual (drag-and-drop) sempre vence o
# automático — ver PrioridadeManual/_chave_ordenacao_prioridade.
FAROL_RANK_PRIORIDADE = {"vermelho": 0, "amarelo": 1, "verde": 2}


async def _prioridades_manuais(db: AsyncSession, tipo: str, referencia_ids: list[int]) -> dict[tuple[int, int], int]:
    if not referencia_ids:
        return {}
    result = await db.execute(
        select(PrioridadeManual.envoxer_id, PrioridadeManual.referencia_id, PrioridadeManual.ordem)
        .where(PrioridadeManual.tipo == tipo, PrioridadeManual.referencia_id.in_(referencia_ids))
    )
    return {(envoxer_id, referencia_id): ordem for envoxer_id, referencia_id, ordem in result.all()}


def _chave_ordenacao_prioridade(item: dict, manuais: dict[tuple[int, int], int]) -> tuple:
    responsavel = item["responsavel_envoxer_id"] or 0
    manual_ordem = manuais.get((item["responsavel_envoxer_id"], item["id"])) if item["responsavel_envoxer_id"] else None
    farol_rank = FAROL_RANK_PRIORIDADE.get(item.get("cliente_farol"), 3)
    prazo_ordinal = item["prazo"].toordinal() if item.get("prazo") else 9999999
    if manual_ordem is not None:
        return (responsavel, 0, manual_ordem, 0, 0, item["id"])
    return (responsavel, 1, 0 if item.get("atrasada") else 1, farol_rank, prazo_ordinal, item["id"])


async def _obter_tarefa_ou_404(db: AsyncSession, tarefa_id: int) -> Tarefa:
    result = await db.execute(
        select(Tarefa).where(and_(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None)))
    )
    tarefa = result.scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


@router.get("", response_model=list[TarefaResponse])
async def listar_tarefas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    cliente_id: Optional[int] = None,
    responsavel_id: Optional[int] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    atrasadas: Optional[bool] = None,
):
    await garantir_cards_do_mes(db)
    stmt = _JOIN_STMT.where(Tarefa.deleted_at.is_(None))
    if cliente_id is not None:
        stmt = stmt.where(Tarefa.cliente_id == cliente_id)
    if responsavel_id is not None:
        stmt = stmt.where(Tarefa.responsavel_envoxer_id == responsavel_id)
    if status is not None:
        stmt = stmt.where(Tarefa.status == status)
    if q:
        stmt = stmt.where(Tarefa.titulo.ilike(f"%{q}%"))
    if atrasadas:
        hoje = date.today()
        stmt = stmt.where(and_(Tarefa.prazo < hoje, Tarefa.status != "finalizado"))
    stmt = stmt.order_by(Tarefa.status, Tarefa.ordem)

    result = await db.execute(stmt)
    rows = result.all()
    ids = [row[0].id for row in rows]
    proxima_por_tarefa = await _proxima_etapa_por_tarefa(db, ids)
    etapas_resp_por_tarefa = await _etapas_responsaveis_por_tarefa(db, ids)
    return [
        _to_response(*row, proxima_por_tarefa.get(row[0].id), etapas_resp_por_tarefa.get(row[0].id))
        for row in rows
    ]


@router.get("/dashboard-dia")
async def dashboard_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Separado em 2 blocos, de propósito: `cards` olha o prazo do CARD
    (Tarefa.prazo) e `etapas` olha o prazo de cada TAREFA/ETAPA/CHECKLIST
    (Etapa.prazo) dentro dos cards — são datas independentes, um card pode
    estar tranquilo enquanto uma etapa dele já está atrasada, ou vice-versa.
    `prioridades_hoje` de cada bloco é a lista acionável (atrasado + vence
    hoje), ordenada automaticamente (atraso > farol do cliente > prazo) e
    reordenável manualmente por drag-and-drop (ver PATCH /prioridades-dia).
    """
    await garantir_cards_do_mes(db)
    hoje = date.today()
    em_tres_dias = hoje + timedelta(days=3)

    def _serializar_card(rows):
        itens = []
        for tarefa, cliente_nome, cliente_farol, servico_nome, responsavel_nome, responsavel_foto in rows:
            itens.append({
                "id": tarefa.id,
                "titulo": tarefa.titulo,
                "cliente_nome": cliente_nome,
                "cliente_farol": cliente_farol,
                "servico_nome": servico_nome,
                "responsavel_envoxer_id": tarefa.responsavel_envoxer_id,
                "responsavel_nome": responsavel_nome,
                "responsavel_foto": responsavel_foto,
                "prazo": tarefa.prazo,
                "status": tarefa.status,
                "atrasada": bool(tarefa.prazo and tarefa.prazo < hoje and tarefa.status != "finalizado"),
            })
        return itens

    base = _JOIN_STMT.where(Tarefa.deleted_at.is_(None))

    em_andamento = (await db.execute(base.where(Tarefa.status != "finalizado"))).all()
    cards_atrasados_rows = (await db.execute(
        base.where(and_(Tarefa.prazo < hoje, Tarefa.status != "finalizado"))
    )).all()
    cards_hoje_rows = (await db.execute(
        base.where(and_(Tarefa.prazo == hoje, Tarefa.status != "finalizado"))
    )).all()
    aprovacoes_pendentes = (await db.execute(
        base.where(Tarefa.status == "aprovacao_cliente")
    )).all()
    proximas_entregas = (await db.execute(
        base.where(and_(
            Tarefa.prazo.is_not(None),
            Tarefa.prazo > hoje,
            Tarefa.prazo <= em_tres_dias,
            Tarefa.status != "finalizado",
        ))
    )).all()

    cards_prioridades = _serializar_card(cards_atrasados_rows) + _serializar_card(cards_hoje_rows)
    manuais_card = await _prioridades_manuais(db, "card", [i["id"] for i in cards_prioridades])
    cards_prioridades.sort(key=lambda i: _chave_ordenacao_prioridade(i, manuais_card))

    # Etapas (checklist/tarefa) — mesma lógica de "hoje/atrasado", em cima de
    # Etapa.prazo em vez de Tarefa.prazo, com o card/cliente-dono anexado pro
    # frontend saber onde abrir.
    etapa_base = (
        select(Etapa, Tarefa.id, Tarefa.titulo, Cliente.nome, Cliente.status_farol, Envoxer.nome, Envoxer.foto_url)
        .join(Tarefa, and_(Tarefa.id == Etapa.tarefa_id, Tarefa.deleted_at.is_(None)))
        .join(Cliente, Cliente.id == Tarefa.cliente_id)
        .outerjoin(Envoxer, Envoxer.id == Etapa.responsavel_id)
        .where(Etapa.status == "pendente")
    )

    def _serializar_etapa(rows):
        itens = []
        for etapa, tarefa_id, tarefa_titulo, cliente_nome, cliente_farol, responsavel_nome, responsavel_foto in rows:
            itens.append({
                "id": etapa.id,
                "tarefa_id": tarefa_id,
                "titulo": etapa.titulo,
                "tarefa_titulo": tarefa_titulo,
                "cliente_nome": cliente_nome,
                "cliente_farol": cliente_farol,
                "responsavel_envoxer_id": etapa.responsavel_id,
                "responsavel_nome": responsavel_nome,
                "responsavel_foto": responsavel_foto,
                "prazo": etapa.prazo,
                "atrasada": bool(etapa.prazo and etapa.prazo < hoje),
            })
        return itens

    etapas_atrasadas_rows = (await db.execute(etapa_base.where(Etapa.prazo < hoje))).all()
    etapas_hoje_rows = (await db.execute(etapa_base.where(Etapa.prazo == hoje))).all()
    etapas_proximas_rows = (await db.execute(
        etapa_base.where(and_(Etapa.prazo > hoje, Etapa.prazo <= em_tres_dias))
    )).all()

    etapas_prioridades = _serializar_etapa(etapas_atrasadas_rows) + _serializar_etapa(etapas_hoje_rows)
    manuais_etapa = await _prioridades_manuais(db, "etapa", [i["id"] for i in etapas_prioridades])
    etapas_prioridades.sort(key=lambda i: _chave_ordenacao_prioridade(i, manuais_etapa))

    return {
        "cards": {
            "em_andamento": _serializar_card(em_andamento),
            "prioridades_hoje": cards_prioridades,
            "aprovacoes_pendentes": _serializar_card(aprovacoes_pendentes),
            "proximas_entregas": _serializar_card(proximas_entregas),
        },
        "etapas": {
            "prioridades_hoje": etapas_prioridades,
            "proximos_3_dias": _serializar_etapa(etapas_proximas_rows),
        },
    }


@router.patch("/prioridades-dia")
async def reordenar_prioridades_dia(
    payload: PrioridadeDiaReordenar,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Salva a ordem manual (drag-and-drop) da lista "prioridades de hoje" do
    Dashboard. Envoxer só reordena a própria lista; gestor/admin reordenam a
    de qualquer um (`payload.envoxer_id` é o dono da lista, não quem chama).
    Replace-on-write: apaga a ordem manual anterior desse dono+tipo e grava a
    nova de uma vez (mesmo padrão simples já usado no projeto pra sincronizar
    listas, em vez de PATCH incremental item a item).
    """
    if payload.tipo not in ("card", "etapa"):
        raise HTTPException(status_code=422, detail="tipo precisa ser 'card' ou 'etapa'")
    if envoxer.permissao == "envoxer" and payload.envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Você só pode reordenar as suas próprias prioridades")

    await db.execute(
        PrioridadeManual.__table__.delete().where(
            and_(PrioridadeManual.envoxer_id == payload.envoxer_id, PrioridadeManual.tipo == payload.tipo)
        )
    )
    for indice, referencia_id in enumerate(payload.ids_em_ordem):
        db.add(PrioridadeManual(
            envoxer_id=payload.envoxer_id, tipo=payload.tipo, referencia_id=referencia_id, ordem=indice,
        ))
    await db.flush()
    return {"ok": True}


@router.get("/{tarefa_id}", response_model=TarefaResponse)
async def obter_tarefa(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(_JOIN_STMT.where(and_(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))))
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return _to_response(*row)


@router.post("", response_model=TarefaResponse, status_code=201)
async def criar_tarefa(
    payload: TarefaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    # Tarefa avulsa (sem vínculo de cota) — card de Item de Escopo nunca se cria
    # manualmente, só nasce sozinho via garantir_cards_do_mes.
    tarefa = Tarefa(**payload.model_dump())
    db.add(tarefa)
    await db.flush()
    await db.refresh(tarefa)

    # Puxa o checklist do serviço automaticamente — mesma lógica do card
    # provisionado (services/provisionamento.py), sem exigir clique manual em
    # "Usar processo do serviço". Serviço sem etapas-modelo cadastradas
    # (retorno vazio) não é erro aqui, diferente do botão manual.
    if tarefa.servico_id is not None:
        novas_etapas = await aplicar_processo_do_servico(db, tarefa.id, tarefa.servico_id)
        primeira = next((e for e in novas_etapas if e.ordem == min(x.ordem for x in novas_etapas)), None) if novas_etapas else None
        if primeira and primeira.responsavel_id and tarefa.responsavel_envoxer_id is None:
            tarefa.responsavel_envoxer_id = primeira.responsavel_id
            await db.flush()

    result = await db.execute(_JOIN_STMT.where(Tarefa.id == tarefa.id))
    row = result.one()
    await notificar_tarefa_atualizada(db, tarefa.id)
    return _to_response(*row)


@router.patch("/{tarefa_id}", response_model=TarefaResponse)
async def atualizar_tarefa(
    tarefa_id: int,
    payload: TarefaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(tarefa, field, value)
    if "status" in updates:
        if updates["status"] == "finalizado" and tarefa.finalizada_em is None:
            tarefa.finalizada_em = datetime.now(timezone.utc)
        elif updates["status"] != "finalizado":
            tarefa.finalizada_em = None
    await db.flush()
    await db.refresh(tarefa)

    result = await db.execute(_JOIN_STMT.where(Tarefa.id == tarefa.id))
    row = result.one()
    await notificar_tarefa_atualizada(db, tarefa.id)
    return _to_response(*row)


@router.delete("/{tarefa_id}", status_code=204)
async def excluir_tarefa(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    # Nunca deixar uma tarefa sumir com um RegistroFoco travado nela — finaliza
    # automaticamente (mesma lógica do botão Finalizar) antes do soft-delete.
    await finalizar_foco_ativo_da_tarefa(
        db, tarefa_id, comentario="Finalizado automaticamente — tarefa excluída"
    )
    # Se for o card automático de um Item de Escopo (item_escopo_id+ano_mes), o
    # progresso de entrega (EntregaCheck) marcado até aqui se perde — um card
    # novo, zerado, nasce sozinho no próximo garantir_cards_do_mes. O frontend
    # avisa disso antes de confirmar a exclusão.
    tarefa.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await notificar_tarefa_atualizada(db, tarefa_id)


def _check_to_response(check: EntregaCheck, nome: Optional[str]) -> EntregaCheckResponse:
    return EntregaCheckResponse(
        id=check.id, numero=check.numero, entregue=check.entregue, entregue_em=check.entregue_em,
        entregue_por_nome=nome, excedente=check.excedente,
    )


@router.get("/{tarefa_id}/entregas", response_model=list[EntregaCheckResponse])
async def listar_entregas(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    result = await db.execute(
        select(EntregaCheck, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == EntregaCheck.entregue_por_envoxer_id)
        .where(EntregaCheck.tarefa_id == tarefa_id)
        .order_by(EntregaCheck.numero)
    )
    return [_check_to_response(c, nome) for c, nome in result.all()]


async def _obter_check_ou_404(db: AsyncSession, tarefa_id: int, check_id: int) -> EntregaCheck:
    result = await db.execute(
        select(EntregaCheck).where(EntregaCheck.id == check_id, EntregaCheck.tarefa_id == tarefa_id)
    )
    check = result.scalar_one_or_none()
    if check is None:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    return check


@router.post("/{tarefa_id}/entregas/{check_id}/marcar", response_model=EntregaCheckResponse)
async def marcar_entrega(
    tarefa_id: int,
    check_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    check = await _obter_check_ou_404(db, tarefa_id, check_id)
    check.entregue = True
    check.entregue_em = datetime.now(timezone.utc)
    check.entregue_por_envoxer_id = envoxer.id
    await db.flush()
    return _check_to_response(check, envoxer.nome)


@router.post("/{tarefa_id}/entregas/{check_id}/desmarcar", response_model=EntregaCheckResponse)
async def desmarcar_entrega(
    tarefa_id: int,
    check_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    check = await _obter_check_ou_404(db, tarefa_id, check_id)
    check.entregue = False
    check.entregue_em = None
    check.entregue_por_envoxer_id = None
    await db.flush()
    return _check_to_response(check, None)


@router.post("/{tarefa_id}/entregas/extra", response_model=EntregaCheckResponse, status_code=201)
async def registrar_entrega_extra(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    proximo_numero = (await db.execute(
        select(func.max(EntregaCheck.numero)).where(EntregaCheck.tarefa_id == tarefa_id)
    )).scalar_one_or_none() or 0
    check = EntregaCheck(
        tarefa_id=tarefa_id, numero=proximo_numero + 1, entregue=True,
        entregue_em=datetime.now(timezone.utc), entregue_por_envoxer_id=envoxer.id, excedente=True,
    )
    db.add(check)
    try:
        await db.flush()
    except IntegrityError:
        # 2 gestores registrando entrega extra no mesmo card ao mesmo tempo
        # podem calcular o mesmo próximo número — pede pra tentar de novo em
        # vez de estourar um 500 cru.
        raise HTTPException(status_code=409, detail="Outra entrega extra foi registrada ao mesmo tempo — tente de novo")
    return _check_to_response(check, envoxer.nome)


@router.post("/{tarefa_id}/comentarios", response_model=TarefaResponse)
async def comentar_tarefa(
    tarefa_id: int,
    payload: ComentarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)

    # Só considera @menção válida se for de fato um envoxer ativo (evita
    # confiar cegamente no que o frontend mandou) e nunca notifica o próprio
    # autor do comentário se ele se mencionar.
    ids_mencionados = []
    if payload.mencoes:
        result_mencoes = await db.execute(
            select(Envoxer.id).where(Envoxer.id.in_(payload.mencoes), Envoxer.ativo.is_(True))
        )
        ids_mencionados = [row[0] for row in result_mencoes.all() if row[0] != envoxer.id]

    comentarios = list(tarefa.comentarios or [])
    comentarios.append({
        "envoxer_id": envoxer.id,
        "envoxer_nome": envoxer.nome,
        "texto": payload.texto,
        "mencoes": ids_mencionados,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    })
    tarefa.comentarios = comentarios
    await db.flush()
    await db.refresh(tarefa)

    if ids_mencionados:
        from app.models.pendencia import Pendencia
        from app.services.push import broadcast_push

        mensagem = f'{envoxer.nome} te mencionou num comentário na tarefa "{tarefa.titulo}": "{payload.texto[:140]}"'
        for destinatario_id in ids_mencionados:
            db.add(Pendencia(envoxer_id=destinatario_id, tarefa_id=tarefa.id, mensagem=mensagem))
        await db.flush()
        for destinatario_id in ids_mencionados:
            await broadcast_push(
                db, destinatario_id,
                title=f"{envoxer.nome} te mencionou",
                body=payload.texto[:180],
                tag="envoxers-mencao",
            )

    result = await db.execute(_JOIN_STMT.where(Tarefa.id == tarefa.id))
    row = result.one()
    await notificar_tarefa_atualizada(db, tarefa.id)
    return _to_response(*row)


@router.post("/{tarefa_id}/anexos", response_model=TarefaResponse)
async def anexar_arquivo(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    arquivo: UploadFile = File(...),
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    salvo = await salvar_upload(arquivo)
    anexos = list(tarefa.anexos or [])
    anexos.append({
        **salvo,
        "enviado_por_envoxer_id": envoxer.id,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    })
    tarefa.anexos = anexos
    await db.flush()
    await db.refresh(tarefa)

    result = await db.execute(_JOIN_STMT.where(Tarefa.id == tarefa.id))
    row = result.one()
    await notificar_tarefa_atualizada(db, tarefa.id)
    return _to_response(*row)
