"""F2 Módulo 4 (final) — Farol Inteligente + Alertas.

GET /farol recalcula os 8 sinais de TODOS os clientes ativos a cada chamada
(sem scheduler no projeto), upserta o snapshot em farol_calculo, grava o
histórico e nasce um alerta_farol sempre que a cor do farol muda.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, case, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.farol_calculo import FarolCalculo, FarolCalculoHistorico
from app.models.alerta_farol import AlertaFarol, STATUS_ALERTA_VALUES
from app.models.alerta_config import AlertaConfig
from app.schemas.farol import FarolClienteResponse, FarolKpisResponse
from app.schemas.alerta import AlertaUpdate, AlertaResponse
from app.services.farol import calcular_farol_cliente, LABELS, _texto_sinal

router = APIRouter(tags=["farol"])

_RISCO_ORDEM = {"vermelho": 0, "amarelo": 1, "verde": 2}

# Sinais que têm alerta configurável individualmente (whatsapp fica de fora —
# sem integração no Envoxers ainda, o sinal é sempre "sem_dado", nunca piora).
_ALERTA_SINAL_CHAVE = {
    "entrega": "farol_sinal_entrega",
    "atrasadas": "farol_sinal_atrasadas",
    "alteracoes": "farol_sinal_alteracoes",
    "aprovacoes": "farol_sinal_aprovacoes",
    "pulso": "farol_sinal_pulso",
    "margem": "farol_sinal_margem",
    "silencio": "farol_sinal_silencio",
}


def _meses_de_casa(inicio: Optional[date]) -> Optional[int]:
    if inicio is None:
        return None
    hoje = date.today()
    return (hoje.year - inicio.year) * 12 + (hoje.month - inicio.month)


@router.get("/farol/kpis", response_model=FarolKpisResponse)
async def farol_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Delta do score médio vs. ~7 dias atrás, usando farol_calculo_historico. None se
    ainda não existe snapshot antigo o bastante pra comparar (Farol é recente no projeto)."""
    referencia = datetime.now(timezone.utc) - timedelta(days=7)

    ids_result = await db.execute(
        select(Cliente.id).where(Cliente.deleted_at.is_(None), Cliente.ativo.is_(True))
    )
    ids_ativos = [row[0] for row in ids_result.all()]
    if not ids_ativos:
        return FarolKpisResponse(score_medio_delta_semana=None)

    atuais_result = await db.execute(
        select(FarolCalculo.cliente_id, FarolCalculo.health_score).where(FarolCalculo.cliente_id.in_(ids_ativos))
    )
    scores_atuais = dict(atuais_result.all())

    deltas = []
    for cliente_id, score_atual in scores_atuais.items():
        historico_result = await db.execute(
            select(FarolCalculoHistorico.health_score)
            .where(FarolCalculoHistorico.cliente_id == cliente_id, FarolCalculoHistorico.calculado_em <= referencia)
            .order_by(FarolCalculoHistorico.calculado_em.desc())
            .limit(1)
        )
        score_antigo = historico_result.scalar_one_or_none()
        if score_antigo is not None:
            deltas.append(score_atual - score_antigo)

    if not deltas:
        return FarolKpisResponse(score_medio_delta_semana=None)

    return FarolKpisResponse(score_medio_delta_semana=round(sum(deltas) / len(deltas)))


@router.get("/farol", response_model=list[FarolClienteResponse])
async def listar_farol(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    hoje = date.today()
    agora = datetime.now(timezone.utc)

    configs_result = await db.execute(select(AlertaConfig))
    configs_por_chave = {c.chave: c for c in configs_result.scalars().all()}

    result = await db.execute(
        select(Cliente, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == Cliente.responsavel_envoxer_id)
        .where(Cliente.deleted_at.is_(None), Cliente.ativo.is_(True))
    )
    clientes = result.all()

    respostas = []
    # (papeis, título, corpo, tag) — resolvido pra destinatários reais só no final,
    # depois do loop, pra não repetir query de Envoxer por papel a cada cliente.
    notificacoes: list[tuple[list[str], str, str, str]] = []
    for cliente, responsavel_nome in clientes:
        calculo = await calcular_farol_cliente(db, cliente, hoje)

        existente_result = await db.execute(select(FarolCalculo).where(FarolCalculo.cliente_id == cliente.id))
        snapshot = existente_result.scalar_one_or_none()
        farol_anterior = snapshot.farol if snapshot else cliente.status_farol
        sinais_anteriores = {
            "entrega": snapshot.sinal_entrega, "atrasadas": snapshot.sinal_atrasadas,
            "alteracoes": snapshot.sinal_alteracoes, "aprovacoes": snapshot.sinal_aprovacoes,
            "pulso": snapshot.sinal_pulso, "margem": snapshot.sinal_margem,
            "silencio": snapshot.sinal_silencio,
        } if snapshot else {}

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
            # Push só quando o farol PIORA (risco sobe) — recuperação não é urgente o
            # bastante pra interromper o usuário. farol_anterior pode ser None no
            # primeiro cálculo do cliente; nesse caso não é uma "transição" real.
            piorou = (
                farol_anterior in _RISCO_ORDEM
                and _RISCO_ORDEM[calculo["farol"]] < _RISCO_ORDEM[farol_anterior]
            )
            if piorou:
                config_geral = configs_por_chave.get("farol_geral")
                if config_geral and config_geral.ativo and config_geral.papeis:
                    cor = calculo["farol"]
                    titulo = "🔴 Farol vermelho" if cor == "vermelho" else "🟡 Farol amarelo"
                    notificacoes.append((
                        config_geral.papeis, f"{titulo}: {cliente.nome}",
                        calculo["motivo_texto"][:180], "envoxers-farol",
                    ))

        # Granularidade por sinal individual — só depois do 1º cálculo do cliente
        # (senão todo sinal "nasceria" como piora no primeiro GET /farol dele).
        if snapshot is not None:
            for nome_sinal, chave_config in _ALERTA_SINAL_CHAVE.items():
                cor_anterior = sinais_anteriores.get(nome_sinal)
                cor_atual = sinais[nome_sinal][0]
                if cor_anterior not in _RISCO_ORDEM or cor_atual not in _RISCO_ORDEM:
                    continue
                if _RISCO_ORDEM[cor_atual] >= _RISCO_ORDEM[cor_anterior]:
                    continue
                config_sinal = configs_por_chave.get(chave_config)
                if config_sinal and config_sinal.ativo and config_sinal.papeis:
                    notificacoes.append((
                        config_sinal.papeis,
                        f"⚠️ {LABELS[nome_sinal]} piorou: {cliente.nome}",
                        _texto_sinal(nome_sinal, sinais[nome_sinal][1])[:180],
                        "envoxers-farol-sinal",
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
            valor_contrato=float(cliente.valor_contrato or 0),
            meses_de_casa=_meses_de_casa(cliente.data_inicio_contrato),
            calculado_em=agora,
        ))

    await db.flush()

    if notificacoes:
        from app.services.push import broadcast_push_para_muitos

        cache_destinatarios: dict[tuple, list[int]] = {}
        for papeis, titulo, corpo, tag in notificacoes:
            chave_cache = tuple(sorted(papeis))
            if chave_cache not in cache_destinatarios:
                destinatarios_result = await db.execute(
                    select(Envoxer.id).where(Envoxer.permissao.in_(papeis), Envoxer.ativo.is_(True))
                )
                cache_destinatarios[chave_cache] = [row[0] for row in destinatarios_result.all()]
            destinatario_ids = cache_destinatarios[chave_cache]
            if destinatario_ids:
                await broadcast_push_para_muitos(db, destinatario_ids, title=titulo, body=corpo, tag=tag)

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
