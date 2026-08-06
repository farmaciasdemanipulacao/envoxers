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
from app.schemas.tarefa import TarefaCreate, TarefaUpdate, TarefaResponse, ComentarioCreate, EntregaCheckResponse
from app.services.provisionamento import garantir_cards_do_mes
from app.services.etapas_automacao import aplicar_processo_do_servico

router = APIRouter(prefix="/tarefas", tags=["tarefas"])

_JOIN_STMT = (
    select(Tarefa, Cliente.nome, Cliente.status_farol, Servico.nome, Envoxer.nome, Envoxer.foto_url)
    .join(Cliente, Cliente.id == Tarefa.cliente_id)
    .outerjoin(Servico, Servico.id == Tarefa.servico_id)
    .outerjoin(Envoxer, Envoxer.id == Tarefa.responsavel_envoxer_id)
)


def _to_response(tarefa: Tarefa, cliente_nome: str, cliente_farol: str, servico_nome: Optional[str], responsavel_nome: Optional[str], responsavel_foto: Optional[str]) -> TarefaResponse:
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
        finalizada_em=tarefa.finalizada_em,
        ano_mes=tarefa.ano_mes,
        created_at=tarefa.created_at,
        updated_at=tarefa.updated_at,
    )


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
    return [_to_response(*row) for row in result.all()]


@router.get("/dashboard-dia")
async def dashboard_dia(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await garantir_cards_do_mes(db)
    hoje = date.today()
    em_tres_dias = hoje + timedelta(days=3)

    def _serializar(rows):
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
            })
        return itens

    base = _JOIN_STMT.where(Tarefa.deleted_at.is_(None))

    em_andamento = (await db.execute(base.where(Tarefa.status != "finalizado"))).all()
    atrasadas = (await db.execute(
        base.where(and_(Tarefa.prazo < hoje, Tarefa.status != "finalizado"))
    )).all()
    aprovacoes_pendentes = (await db.execute(
        base.where(Tarefa.status == "aprovacao_cliente")
    )).all()
    proximas_entregas = (await db.execute(
        base.where(and_(
            Tarefa.prazo.is_not(None),
            Tarefa.prazo >= hoje,
            Tarefa.prazo <= em_tres_dias,
            Tarefa.status != "finalizado",
        ))
    )).all()

    return {
        "em_andamento": _serializar(em_andamento),
        "atrasadas": _serializar(atrasadas),
        "aprovacoes_pendentes": _serializar(aprovacoes_pendentes),
        "proximas_entregas": _serializar(proximas_entregas),
    }


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
    comentarios = list(tarefa.comentarios or [])
    comentarios.append({
        "envoxer_id": envoxer.id,
        "envoxer_nome": envoxer.nome,
        "texto": payload.texto,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    })
    tarefa.comentarios = comentarios
    await db.flush()
    await db.refresh(tarefa)

    result = await db.execute(_JOIN_STMT.where(Tarefa.id == tarefa.id))
    row = result.one()
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
    return _to_response(*row)
