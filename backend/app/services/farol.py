"""Motor de cálculo do Farol Inteligente (F2 Módulo 4) — 8 sinais de saúde do cliente.

Sem scheduler no projeto (diferente do envox-intel): o cálculo roda sob demanda,
disparado a cada GET /farol (ver api/routes/farol.py), não em background.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cliente import Cliente
from app.models.escopo import Escopo
from app.models.tarefa import Tarefa
from app.models.registro_foco import RegistroFoco
from app.models.pulso_satisfacao import PulsoSatisfacao
from app.models.check_in import CheckIn

JANELA_ENTREGA_DIAS = 90
JANELA_ALTERACOES_DIAS = 90
JANELA_MARGEM_DIAS = 30
DIAS_APROVACAO_PARADA = 5
LIMITE_ALTERACOES_PADRAO = 2

# Peso de cada sinal no health_score (0-100). whatsapp pesa 0 porque, sem integração
# no Envoxers ainda, o sinal é sempre "sem_dado" — o peso existe só documentando a
# intenção original do schema.sql para quando a integração existir.
PESOS = {
    "entrega": 15, "atrasadas": 15, "alteracoes": 10, "aprovacoes": 10,
    "pulso": 25, "margem": 15, "silencio": 10, "whatsapp": 0,
}
PONTOS_COR = {"verde": 100, "amarelo": 50, "vermelho": 0}

LABELS = {
    "entrega": "Entrega no prazo",
    "atrasadas": "Tarefas atrasadas",
    "alteracoes": "Alterações acima do limite",
    "aprovacoes": "Aprovações paradas",
    "pulso": "Pulso de satisfação",
    "margem": "Margem",
    "silencio": "Silêncio do cliente",
    "whatsapp": "Termômetro WhatsApp",
}

def _texto_sinal(nome: str, valor) -> str:
    """Formata o valor real de um sinal (não a categoria) para exibição por extenso."""
    if nome == "entrega":
        return f"entrega {valor}"
    if nome == "atrasadas":
        return f"{valor} tarefa(s) atrasada(s)"
    if nome == "alteracoes":
        return f"alterações: {valor}"
    if nome == "aprovacoes":
        return f"aprovações: {valor}"
    if nome == "pulso":
        return f"pulso {valor}"
    if nome == "margem":
        return f"margem {valor}%"
    if nome == "silencio":
        if valor is None:
            return "sem check-in registrado desde o início do contrato"
        return f"{valor} dia(s) sem contato"
    if nome == "whatsapp":
        return f"WhatsApp {valor}"
    return f"{nome}: {valor}"


def _motivo_texto_detalhado(sinais: dict) -> str:
    """Motivo por extenso com o dado real de cada sinal não-verde — não a categoria genérica."""
    partes = [
        _texto_sinal(nome, valor)
        for nome, (cor, valor) in sinais.items()
        if cor in ("vermelho", "amarelo")
    ]
    if not partes:
        return "Todos os sinais saudáveis."
    return " · ".join(partes)


def _sugestao_acao(sinais: dict, farol: str) -> str:
    """Recomendação de ação por regras condicionais (sem IA) a partir dos sinais vermelhos/amarelos."""
    if farol == "verde":
        return "Manter cadência mensal. Cliente saudável."

    if sinais["pulso"][0] == "vermelho" or sinais["whatsapp"][0] == "vermelho":
        return "Ligar hoje. Pulso/WhatsApp em vermelho indica insatisfação que vai virar cancelamento em semanas."

    acoes = []
    if sinais["silencio"][0] == "vermelho":
        acoes.append("romper o silêncio esta semana")
    if sinais["entrega"][0] == "vermelho":
        acoes.append("recuperar entrega do mês antes do dia 25")
    if sinais["aprovacoes"][0] == "vermelho":
        acoes.append("destravar aprovações paradas")
    if sinais["alteracoes"][0] == "vermelho":
        acoes.append("renegociar limite de alterações")
    if sinais["margem"][0] == "vermelho":
        acoes.append("rever escopo ou preço — margem inviável")
    if acoes:
        return "Ações: " + "; ".join(acoes) + "."

    return "Ligar essa semana. Um dos sinais está no limite — não deixe virar vermelho."


async def _sinal_entrega(db: AsyncSession, cliente_id: int, hoje: date) -> tuple[str, Optional[str]]:
    desde = datetime.combine(hoje - timedelta(days=JANELA_ENTREGA_DIAS), datetime.min.time(), tzinfo=timezone.utc)
    result = await db.execute(
        select(Tarefa.prazo, Tarefa.finalizada_em).where(
            Tarefa.cliente_id == cliente_id, Tarefa.deleted_at.is_(None),
            Tarefa.status == "finalizado", Tarefa.finalizada_em.is_not(None),
            Tarefa.finalizada_em >= desde,
        )
    )
    rows = result.all()
    total = len(rows)
    if total == 0:
        return "verde", "sem entregas finalizadas no período"

    no_prazo = sum(1 for prazo, fin in rows if prazo is None or fin.date() <= prazo)
    pct = round(no_prazo / total * 100)
    valor = f"{pct}% no prazo ({no_prazo}/{total})"
    if pct >= 80:
        return "verde", valor
    if pct >= 50:
        return "amarelo", valor
    return "vermelho", valor


async def _sinal_atrasadas(db: AsyncSession, cliente_id: int, hoje: date) -> tuple[str, int]:
    result = await db.execute(
        select(func.count()).select_from(Tarefa).where(
            Tarefa.cliente_id == cliente_id, Tarefa.deleted_at.is_(None),
            Tarefa.status != "finalizado", Tarefa.prazo.is_not(None), Tarefa.prazo < hoje,
        )
    )
    qtd = result.scalar_one()
    if qtd == 0:
        return "verde", qtd
    if qtd <= 2:
        return "amarelo", qtd
    return "vermelho", qtd


async def _sinal_alteracoes(db: AsyncSession, cliente_id: int, hoje: date) -> tuple[str, str]:
    desde = datetime.combine(hoje - timedelta(days=JANELA_ALTERACOES_DIAS), datetime.min.time(), tzinfo=timezone.utc)
    escopo_result = await db.execute(select(Escopo.limite_alteracoes).where(Escopo.cliente_id == cliente_id))
    limite = escopo_result.scalar_one_or_none()
    if limite is None:
        limite = LIMITE_ALTERACOES_PADRAO

    result = await db.execute(
        select(func.count()).select_from(Tarefa).where(
            Tarefa.cliente_id == cliente_id, Tarefa.deleted_at.is_(None),
            Tarefa.updated_at >= desde, Tarefa.qtd_alteracoes > limite,
        )
    )
    qtd_acima = result.scalar_one()
    valor = f"{qtd_acima} tarefa(s) acima do limite ({limite})"
    if qtd_acima == 0:
        return "verde", valor
    if qtd_acima == 1:
        return "amarelo", valor
    return "vermelho", valor


async def _sinal_aprovacoes(db: AsyncSession, cliente_id: int) -> tuple[str, str]:
    limite_dt = datetime.now(timezone.utc) - timedelta(days=DIAS_APROVACAO_PARADA)
    result = await db.execute(
        select(func.count()).select_from(Tarefa).where(
            Tarefa.cliente_id == cliente_id, Tarefa.deleted_at.is_(None),
            Tarefa.status.in_(("revisao_interna", "aprovacao_cliente")),
            Tarefa.updated_at <= limite_dt,
        )
    )
    qtd = result.scalar_one()
    valor = f"{qtd} tarefa(s) parada(s) há mais de {DIAS_APROVACAO_PARADA}d em aprovação"
    if qtd == 0:
        return "verde", valor
    if qtd == 1:
        return "amarelo", valor
    return "vermelho", valor


async def _sinal_pulso(db: AsyncSession, cliente_id: int) -> tuple[str, Optional[int]]:
    result = await db.execute(
        select(PulsoSatisfacao.nota)
        .where(PulsoSatisfacao.cliente_id == cliente_id)
        .order_by(PulsoSatisfacao.ano_mes.desc())
        .limit(1)
    )
    nota = result.scalar_one_or_none()
    if nota is None:
        return "sem_dado", None
    if nota >= 8:
        return "verde", nota
    if nota >= 6:
        return "amarelo", nota
    return "vermelho", nota


async def _sinal_margem(db: AsyncSession, cliente: Cliente, hoje: date) -> tuple[str, Optional[float]]:
    if not cliente.valor_contrato or float(cliente.valor_contrato) <= 0:
        return "sem_dado", None

    desde = datetime.combine(hoje - timedelta(days=JANELA_MARGEM_DIAS), datetime.min.time(), tzinfo=timezone.utc)
    result = await db.execute(
        select(func.coalesce(func.sum(RegistroFoco.custo), 0))
        .select_from(RegistroFoco)
        .join(Tarefa, Tarefa.id == RegistroFoco.tarefa_id)
        .where(
            Tarefa.cliente_id == cliente.id, RegistroFoco.fim.is_not(None),
            RegistroFoco.descartado.is_(False), RegistroFoco.inicio >= desde,
        )
    )
    custo_total = float(result.scalar_one())
    if custo_total == 0:
        return "sem_dado", None

    valor_contrato = float(cliente.valor_contrato)
    margem_pct = round((valor_contrato - custo_total) / valor_contrato * 100, 1)
    if margem_pct >= 40:
        return "verde", margem_pct
    if margem_pct >= 20:
        return "amarelo", margem_pct
    return "vermelho", margem_pct


async def _sinal_silencio(db: AsyncSession, cliente: Cliente, hoje: date) -> tuple[str, Optional[int]]:
    result = await db.execute(select(func.max(CheckIn.data_realizado)).where(CheckIn.cliente_id == cliente.id))
    ultimo = result.scalar_one_or_none()
    if ultimo is None:
        dias_de_casa = (hoje - cliente.data_inicio_contrato).days if cliente.data_inicio_contrato else None
        if dias_de_casa is not None and dias_de_casa > 30:
            return "vermelho", None
        return "verde", None

    dias = (hoje - ultimo.date()).days
    if dias <= 15:
        return "verde", dias
    if dias <= 30:
        return "amarelo", dias
    return "vermelho", dias


def _sinal_whatsapp(cliente: Cliente) -> tuple[str, Optional[str]]:
    # Sem integração de WhatsApp no Envoxers ainda — placeholder pronto pra quando existir
    # (o campo já existe em `cliente` desde o F0, só não é alimentado por nada hoje).
    return "sem_dado", cliente.termometro_whatsapp


async def calcular_farol_cliente(db: AsyncSession, cliente: Cliente, hoje: Optional[date] = None) -> dict:
    """Calcula os 8 sinais + farol geral + health_score de UM cliente. Não persiste nada."""
    hoje = hoje or date.today()

    sinais = {
        "entrega": await _sinal_entrega(db, cliente.id, hoje),
        "atrasadas": await _sinal_atrasadas(db, cliente.id, hoje),
        "alteracoes": await _sinal_alteracoes(db, cliente.id, hoje),
        "aprovacoes": await _sinal_aprovacoes(db, cliente.id),
        "pulso": await _sinal_pulso(db, cliente.id),
        "margem": await _sinal_margem(db, cliente, hoje),
        "silencio": await _sinal_silencio(db, cliente, hoje),
        "whatsapp": _sinal_whatsapp(cliente),
    }

    peso_total = 0
    pontos_total = 0
    vermelhos: list[str] = []
    amarelos: list[str] = []
    for nome, (cor, _valor) in sinais.items():
        if cor == "sem_dado":
            continue
        peso_total += PESOS[nome]
        pontos_total += PESOS[nome] * PONTOS_COR[cor]
        if cor == "vermelho":
            vermelhos.append(nome)
        elif cor == "amarelo":
            amarelos.append(nome)

    health_score = round(pontos_total / peso_total) if peso_total > 0 else 100

    if len(vermelhos) >= 2:
        farol = "vermelho"
    elif health_score < 50:
        farol = "vermelho"
    elif health_score < 75 or len(vermelhos) >= 1:
        farol = "amarelo"
    else:
        farol = "verde"

    motivo_texto = _motivo_texto_detalhado(sinais)
    sugestao = _sugestao_acao(sinais, farol)

    return {
        "farol": farol,
        "health_score": health_score,
        "sinais": sinais,
        "sinais_vermelhos": vermelhos,
        "sinais_amarelos": amarelos,
        "motivo_texto": motivo_texto,
        "sugestao_acao": sugestao,
        "motivo_json": {
            "health_score": health_score,
            "sinais_vermelhos": vermelhos,
            "sinais_amarelos": amarelos,
            "sinais": {nome: {"cor": cor, "valor": valor} for nome, (cor, valor) in sinais.items()},
        },
    }
