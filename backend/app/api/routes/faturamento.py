"""F3 — Módulo 3: Painel de Faturamento — MRR, concentração, receita em risco,
projeção 90 dias, tempo médio de casa, histórico de 12 meses e curva de retenção
por cohort.

Sem scheduler, sem snapshot mensal persistido — tudo calculado ao vivo a cada
chamada a partir de `cliente.valor_contrato`/`data_inicio_contrato`/
`data_cancelamento` (preservados mesmo após cancelamento, ver churn.py), mesmo
padrão do Farol/ICP Builder. `cliente.status_farol` já vem sincronizado por
`GET /farol` — não recalculamos o farol aqui.
"""
import calendar
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente

router = APIRouter(tags=["faturamento"])

COHORT_MESES_JANELA = 12
CONCENTRACAO_TOP_N = 9
# Tons do teal da marca, do mais escuro (maior fatia) ao mais claro — mesma
# lógica das paletas de severidade fixas do design system (colors.css).
CONCENTRACAO_CORES = [
    "#0F3D3E", "#12504F", "#166361", "#1A7674", "#1E8987",
    "#4AA3A1", "#76BDBB", "#A2D7D5", "#CEF0EE",
]
CONCENTRACAO_COR_OUTROS = "#D8D5CC"


def _fim_do_mes(ano: int, mes: int) -> date:
    return date(ano, mes, calendar.monthrange(ano, mes)[1])


def _somar_meses(ano: int, mes: int, delta: int) -> tuple[int, int]:
    total = (ano * 12 + (mes - 1)) + delta
    return total // 12, total % 12 + 1


def _meses_de_casa(inicio: Optional[date], fim: date) -> Optional[int]:
    if inicio is None or inicio > fim:
        return None
    return (fim.year - inicio.year) * 12 + (fim.month - inicio.month)


def _mrr_em(clientes: list[Cliente], referencia: date) -> float:
    """MRR recorrente 'como estava' no fim de um dia de referência (retroativo,
    usa quem já tinha contrato iniciado e ainda não tinha cancelado)."""
    return sum(
        float(c.valor_contrato)
        for c in clientes
        if c.tipo_receita == "recorrente"
        and c.data_inicio_contrato is not None
        and c.data_inicio_contrato <= referencia
        and (c.data_cancelamento is None or c.data_cancelamento > referencia)
    )


@router.get("/faturamento/painel")
async def painel_faturamento(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    hoje = date.today()

    result = await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)))
    # Exclui inconsistência de dado: cliente inativo sem data_cancelamento nunca
    # passou pelo fluxo formal de churn (ver churn.py, que sempre seta os dois
    # juntos) — sem saber quando parou de ser ativo, contaminaria o histórico
    # retroativo abaixo. Na prática só acontece com dado de teste inserido
    # direto no banco (ex.: D-041).
    todos = [c for c in result.scalars().all() if c.ativo or c.data_cancelamento is not None]

    ativos_recorrentes = [c for c in todos if c.ativo and c.tipo_receita == "recorrente"]
    ativos_pontuais = [c for c in todos if c.ativo and c.tipo_receita == "pontual"]

    mrr_atual = sum(float(c.valor_contrato) for c in ativos_recorrentes)
    qtd_recorrentes = len(ativos_recorrentes)
    ticket_medio_recorrente = round(mrr_atual / qtd_recorrentes, 2) if qtd_recorrentes else None

    receita_pontual = sum(float(c.valor_contrato) for c in ativos_pontuais)
    qtd_pontuais = len(ativos_pontuais)

    ano_ant, mes_ant = _somar_meses(hoje.year, hoje.month, -1)
    mrr_mes_anterior = _mrr_em(todos, _fim_do_mes(ano_ant, mes_ant))
    mrr_delta = round(mrr_atual - mrr_mes_anterior, 2)
    mrr_delta_pct = round(mrr_delta / mrr_mes_anterior * 100, 1) if mrr_mes_anterior > 0 else None

    # ---------- Concentração ----------
    ranking = sorted(ativos_recorrentes, key=lambda c: float(c.valor_contrato), reverse=True)
    concentracao = []
    for i, c in enumerate(ranking[:CONCENTRACAO_TOP_N]):
        pct = round(float(c.valor_contrato) / mrr_atual * 100, 1) if mrr_atual else 0.0
        concentracao.append({"nome": c.nome, "valor": float(c.valor_contrato), "pct": pct, "cor": CONCENTRACAO_CORES[i % len(CONCENTRACAO_CORES)]})
    outros = ranking[CONCENTRACAO_TOP_N:]
    if outros:
        valor_outros = sum(float(c.valor_contrato) for c in outros)
        concentracao.append({
            "nome": "Outros",
            "valor": valor_outros,
            "pct": round(valor_outros / mrr_atual * 100, 1) if mrr_atual else 0.0,
            "cor": CONCENTRACAO_COR_OUTROS,
        })
    top3_pct = round(sum(c["pct"] for c in concentracao[:3]), 1)
    top3_nomes = [c["nome"] for c in concentracao[:3]]
    top3_valor = round(sum(c["valor"] for c in concentracao[:3]), 2)

    # ---------- Receita em risco / projeção 90d ----------
    em_risco = [c for c in ativos_recorrentes if c.status_farol in ("amarelo", "vermelho")]
    vermelhos = [c for c in ativos_recorrentes if c.status_farol == "vermelho"]
    receita_em_risco = round(sum(float(c.valor_contrato) for c in em_risco), 2)
    receita_em_risco_pct = round(receita_em_risco / mrr_atual * 100, 1) if mrr_atual else 0.0
    receita_vermelha = sum(float(c.valor_contrato) for c in vermelhos)
    projecao_90d = round(mrr_atual - receita_vermelha, 2)

    # ---------- Tempo médio de casa (todos os ativos, recorrente + pontual) ----------
    ativos_todos = [c for c in todos if c.ativo]
    meses_casa_lista = [m for m in (_meses_de_casa(c.data_inicio_contrato, hoje) for c in ativos_todos) if m is not None]
    tempo_medio_casa = round(sum(meses_casa_lista) / len(meses_casa_lista), 1) if meses_casa_lista else None

    # ---------- Histórico MRR: 12 meses fechados + mês atual + projeção 3 meses ----------
    historico = []
    for i in range(11, -1, -1):
        ano_i, mes_i = _somar_meses(hoje.year, hoje.month, -i)
        referencia = hoje if i == 0 else _fim_do_mes(ano_i, mes_i)
        historico.append({
            "ano_mes": f"{ano_i:04d}-{mes_i:02d}",
            "valor": round(_mrr_em(todos, referencia), 2),
            "tipo": "atual" if i == 0 else "fechado",
        })
    for i in range(1, 4):
        ano_i, mes_i = _somar_meses(hoje.year, hoje.month, i)
        historico.append({"ano_mes": f"{ano_i:04d}-{mes_i:02d}", "valor": projecao_90d, "tipo": "projetado"})

    # ---------- Curva de retenção por cohort ----------
    limite_cohort = _somar_meses(hoje.year, hoje.month, -(COHORT_MESES_JANELA - 1))
    data_limite_cohort = date(limite_cohort[0], limite_cohort[1], 1)
    recorrentes_para_cohort = [c for c in todos if c.tipo_receita == "recorrente" and c.data_inicio_contrato and c.data_inicio_contrato >= data_limite_cohort]

    cohorts_map: dict[str, list[Cliente]] = {}
    for c in recorrentes_para_cohort:
        chave = f"{c.data_inicio_contrato.year:04d}-{c.data_inicio_contrato.month:02d}"
        cohorts_map.setdefault(chave, []).append(c)

    cohorts = []
    for chave in sorted(cohorts_map.keys()):
        clientes_cohort = cohorts_map[chave]
        ano_c, mes_c = (int(p) for p in chave.split("-"))
        meses_desde_cohort = (hoje.year - ano_c) * 12 + (hoje.month - mes_c)
        pontos = []
        for n in range(0, min(meses_desde_cohort, 11) + 1):
            ano_n, mes_n = _somar_meses(ano_c, mes_c, n)
            referencia_n = hoje if (ano_n, mes_n) == (hoje.year, hoje.month) else _fim_do_mes(ano_n, mes_n)
            ativos_em_n = sum(1 for c in clientes_cohort if c.data_cancelamento is None or c.data_cancelamento > referencia_n)
            pontos.append(round(ativos_em_n / len(clientes_cohort) * 100))
        cohorts.append({"cohort": chave, "quantidade": len(clientes_cohort), "pontos": pontos})

    return {
        "mrr_atual": round(mrr_atual, 2),
        "mrr_mes_anterior": round(mrr_mes_anterior, 2),
        "mrr_delta": mrr_delta,
        "mrr_delta_pct": mrr_delta_pct,
        "qtd_recorrentes_ativos": qtd_recorrentes,
        "ticket_medio_recorrente": ticket_medio_recorrente,
        "receita_pontual": round(receita_pontual, 2),
        "qtd_pontuais_ativos": qtd_pontuais,
        "concentracao": concentracao,
        "top3_pct": top3_pct,
        "top3_nomes": top3_nomes,
        "top3_valor": top3_valor,
        "receita_em_risco": receita_em_risco,
        "receita_em_risco_pct": receita_em_risco_pct,
        "qtd_em_risco": len(em_risco),
        "projecao_90d": projecao_90d,
        "tempo_medio_casa_meses": tempo_medio_casa,
        "historico_mrr": historico,
        "cohorts": cohorts,
    }
