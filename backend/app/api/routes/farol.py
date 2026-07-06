"""F2 Módulo 4 (final) — Farol Inteligente + Alertas.

GET /farol recalcula os 8 sinais de TODOS os clientes ativos a cada chamada
(sem scheduler no projeto), upserta o snapshot em farol_calculo, grava o
histórico e nasce um alerta_farol sempre que a cor do farol muda.
"""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.farol_calculo import FarolCalculo, FarolCalculoHistorico
from app.models.alerta_farol import AlertaFarol, STATUS_ALERTA_VALUES
from app.schemas.farol import FarolClienteResponse
from app.schemas.alerta import AlertaUpdate, AlertaResponse
from app.services.farol import calcular_farol_cliente

router = APIRouter(tags=["farol"])

_RISCO_ORDEM = {"vermelho": 0, "amarelo": 1, "verde": 2}


@router.get("/farol", response_model=list[FarolClienteResponse])
async def listar_farol(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    hoje = date.today()
    agora = datetime.now(timezone.utc)

    result = await db.execute(
        select(Cliente, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == Cliente.responsavel_envoxer_id)
        .where(Cliente.deleted_at.is_(None), Cliente.ativo.is_(True))
    )
    clientes = result.all()

    respostas = []
    for cliente, responsavel_nome in clientes:
        calculo = await calcular_farol_cliente(db, cliente, hoje)

        existente_result = await db.execute(select(FarolCalculo).where(FarolCalculo.cliente_id == cliente.id))
        snapshot = existente_result.scalar_one_or_none()
        farol_anterior = snapshot.farol if snapshot else cliente.status_farol

        sinais = calculo["sinais"]
        if snapshot is None:
            snapshot = FarolCalculo(cliente_id=cliente.id)
            db.add(snapshot)

        snapshot.farol = calculo["farol"]
        snapshot.health_score = calculo["health_score"]
        snapshot.sinal_entrega, snapshot.sinal_entrega_valor = sinais["entrega"]
        snapshot.sinal_atrasadas, snapshot.sinal_atrasadas_valor = sinais["atrasadas"]
        snapshot.sinal_alteracoes, snapshot.sinal_alteracoes_valor = sinais["alteracoes"]
        snapshot.sinal_aprovacoes, snapshot.sinal_aprovacoes_valor = sinais["aprovacoes"]
        snapshot.sinal_pulso, snapshot.sinal_pulso_valor = sinais["pulso"]
        snapshot.sinal_margem, snapshot.sinal_margem_valor = sinais["margem"]
        snapshot.sinal_silencio, snapshot.sinal_silencio_valor = sinais["silencio"]
        snapshot.sinal_whatsapp, snapshot.sinal_whatsapp_valor = sinais["whatsapp"]
        snapshot.motivo_json = calculo["motivo_json"]

        db.add(FarolCalculoHistorico(
            cliente_id=cliente.id,
            farol=calculo["farol"],
            health_score=calculo["health_score"],
            motivo_json=calculo["motivo_json"],
        ))

        if calculo["farol"] != farol_anterior:
            db.add(AlertaFarol(
                cliente_id=cliente.id,
                farol_de=farol_anterior,
                farol_para=calculo["farol"],
                motivo_json=calculo["motivo_json"],
                motivo_texto=calculo["motivo_texto"],
                sugestao_acao=calculo["sugestao_acao"],
            ))

        cliente.status_farol = calculo["farol"]

        respostas.append(FarolClienteResponse(
            cliente_id=cliente.id,
            cliente_nome=cliente.nome,
            responsavel_nome=responsavel_nome,
            farol=calculo["farol"],
            health_score=calculo["health_score"],
            sinais={nome: {"cor": cor, "valor": valor} for nome, (cor, valor) in sinais.items()},
            sinais_vermelhos=calculo["sinais_vermelhos"],
            sinais_amarelos=calculo["sinais_amarelos"],
            motivo_texto=calculo["motivo_texto"],
            sugestao_acao=calculo["sugestao_acao"],
            calculado_em=agora,
        ))

    await db.flush()

    respostas.sort(key=lambda r: (_RISCO_ORDEM[r.farol], r.health_score))
    return respostas


@router.get("/alertas", response_model=list[AlertaResponse])
async def listar_alertas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
):
    if status is not None and status not in STATUS_ALERTA_VALUES:
        raise HTTPException(status_code=400, detail="status inválido")

    reconhecedor = Envoxer.__table__.alias("reconhecedor")

    stmt = (
        select(AlertaFarol, Cliente.nome, reconhecedor.c.nome)
        .join(Cliente, Cliente.id == AlertaFarol.cliente_id)
        .outerjoin(reconhecedor, reconhecedor.c.id == AlertaFarol.reconhecido_por_envoxer_id)
    )
    if status is not None:
        stmt = stmt.where(AlertaFarol.status == status)
    if cliente_id is not None:
        stmt = stmt.where(AlertaFarol.cliente_id == cliente_id)

    prioridade = case(
        (AlertaFarol.status == "aberto", 0),
        (AlertaFarol.status == "reconhecido", 1),
        else_=2,
    )
    stmt = stmt.order_by(prioridade, AlertaFarol.created_at.desc())

    result = await db.execute(stmt)
    respostas = []
    for alerta, cliente_nome, reconhecedor_nome in result.all():
        resp = AlertaResponse.model_validate(alerta)
        resp.cliente_nome = cliente_nome
        resp.reconhecido_por_nome = reconhecedor_nome
        respostas.append(resp)
    return respostas


@router.patch("/alertas/{alerta_id}", response_model=AlertaResponse)
async def atualizar_alerta(
    alerta_id: int,
    payload: AlertaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(AlertaFarol).where(AlertaFarol.id == alerta_id))
    alerta = result.scalar_one_or_none()
    if alerta is None:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    updates = payload.model_dump(exclude_unset=True)

    if "resolucao_nota" in updates:
        alerta.resolucao_nota = updates["resolucao_nota"]

    if "status" in updates:
        novo_status = updates["status"]
        if novo_status not in STATUS_ALERTA_VALUES:
            raise HTTPException(status_code=400, detail="status inválido")
        if novo_status == "resolvido" and not alerta.resolucao_nota:
            raise HTTPException(status_code=400, detail="resolucao_nota é obrigatória ao resolver o alerta")

        agora = datetime.now(timezone.utc)
        if novo_status == "reconhecido":
            alerta.reconhecido_por_envoxer_id = envoxer.id
            alerta.reconhecido_em = agora
        elif novo_status == "resolvido":
            alerta.resolvido_em = agora
        alerta.status = novo_status

    await db.flush()
    await db.refresh(alerta)

    result = await db.execute(
        select(Cliente.nome).where(Cliente.id == alerta.cliente_id)
    )
    cliente_nome = result.scalar_one_or_none()
    reconhecedor_nome = None
    if alerta.reconhecido_por_envoxer_id:
        r = await db.execute(select(Envoxer.nome).where(Envoxer.id == alerta.reconhecido_por_envoxer_id))
        reconhecedor_nome = r.scalar_one_or_none()

    resp = AlertaResponse.model_validate(alerta)
    resp.cliente_nome = cliente_nome
    resp.reconhecido_por_nome = reconhecedor_nome
    return resp
