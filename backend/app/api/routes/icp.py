"""F3 — Módulo 2: ICP Builder — comparativo entre clientes retidos e perdidos.

Sem scheduler, sem persistência de snapshot — calculado ao vivo a cada chamada
(mesmo padrão do Farol/relatório tempo×custo). Retidos: perfil comportamental e
margem recalculados na hora. Perdidos: usa os campos _snap congelados no momento
do cancelamento (ver api/routes/churn.py).
"""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.churn_snapshot import ChurnSnapshot
from app.models.farol_calculo import FarolCalculo
from app.services.perfil import recalcular_e_persistir_perfil

router = APIRouter(tags=["icp"])

MESES_RETIDO_MINIMO = 12
MESES_PERDIDO_MAXIMO = 6

DIMENSOES_LABELS = {
    "segmento": "Segmento",
    "canal_aquisicao": "Canal de aquisição",
    "maturidade_digital": "Maturidade digital",
    "perfil": "Perfil comportamental",
}


def _meses_de_casa(inicio: Optional[date], fim: date) -> Optional[int]:
    if inicio is None:
        return None
    return (fim.year - inicio.year) * 12 + (fim.month - inicio.month)


def _distribuicao(valores: list) -> dict:
    total = len(valores)
    contagem: dict = {}
    for v in valores:
        chave = v or "Sem dado"
        contagem[chave] = contagem.get(chave, 0) + 1
    return {
        chave: {"quantidade": qtd, "pct": round(qtd / total * 100, 1) if total else 0.0}
        for chave, qtd in contagem.items()
    }


def _media(valores: list) -> Optional[float]:
    vals = [v for v in valores if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 1)


@router.get("/icp/comparativo")
async def icp_comparativo(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    hoje = date.today()

    # ---------- RETIDOS: ativos com 12+ meses de casa ----------
    result = await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None), Cliente.ativo.is_(True)))
    ativos = result.scalars().all()
    retidos = [c for c in ativos if (_meses_de_casa(c.data_inicio_contrato, hoje) or 0) >= MESES_RETIDO_MINIMO]

    perfis_retidos = []
    margens_retidos = []
    for c in retidos:
        perfil = await recalcular_e_persistir_perfil(db, c.id)
        perfis_retidos.append(perfil.perfil)
        farol_result = await db.execute(
            select(FarolCalculo.sinal_margem_valor).where(FarolCalculo.cliente_id == c.id)
        )
        margem = farol_result.scalar_one_or_none()
        margens_retidos.append(float(margem) if margem is not None else None)

    retidos_bloco = {
        "quantidade": len(retidos),
        "ticket_medio": _media([c.ticket for c in retidos]),
        "margem_media": _media(margens_retidos),
        "meses_de_casa_medio": _media([_meses_de_casa(c.data_inicio_contrato, hoje) for c in retidos]),
        "distribuicao": {
            "segmento": _distribuicao([c.segmento for c in retidos]),
            "canal_aquisicao": _distribuicao([c.canal_aquisicao for c in retidos]),
            "maturidade_digital": _distribuicao([c.maturidade_digital for c in retidos]),
            "perfil": _distribuicao(perfis_retidos),
        },
    }

    # ---------- PERDIDOS: cancelados com <6 meses de casa ----------
    result = await db.execute(select(ChurnSnapshot).where(ChurnSnapshot.meses_de_casa < MESES_PERDIDO_MAXIMO))
    perdidos = result.scalars().all()

    perdidos_bloco = {
        "quantidade": len(perdidos),
        "ticket_medio": _media([p.ticket_snap for p in perdidos]),
        "margem_media": _media([p.margem_media_snap for p in perdidos]),
        "meses_de_casa_medio": _media([p.meses_de_casa for p in perdidos]),
        "distribuicao": {
            "segmento": _distribuicao([p.segmento_snap for p in perdidos]),
            "canal_aquisicao": _distribuicao([p.canal_aquisicao_snap for p in perdidos]),
            "maturidade_digital": _distribuicao([p.maturidade_snap for p in perdidos]),
            "perfil": _distribuicao([p.perfil_snap for p in perdidos]),
        },
    }

    # ---------- DESTAQUES: maiores gaps percentuais entre os dois grupos ----------
    destaques = []
    if retidos_bloco["quantidade"] > 0 and perdidos_bloco["quantidade"] > 0:
        for dimensao in ("segmento", "canal_aquisicao", "maturidade_digital", "perfil"):
            dist_r = retidos_bloco["distribuicao"][dimensao]
            dist_p = perdidos_bloco["distribuicao"][dimensao]
            for label in set(dist_r) | set(dist_p):
                pct_r = dist_r.get(label, {"pct": 0.0})["pct"]
                pct_p = dist_p.get(label, {"pct": 0.0})["pct"]
                gap = round(pct_p - pct_r, 1)
                if abs(gap) < 0.1:
                    continue
                destaques.append({
                    "dimensao": dimensao,
                    "dimensao_label": DIMENSOES_LABELS[dimensao],
                    "valor": label,
                    "pct_retidos": pct_r,
                    "pct_perdidos": pct_p,
                    "gap": gap,
                })
        destaques.sort(key=lambda d: abs(d["gap"]), reverse=True)
        destaques = destaques[:3]
        for d in destaques:
            d["texto"] = (
                f'{d["dimensao_label"]} "{d["valor"]}": {d["pct_perdidos"]}% dos perdidos '
                f'vs {d["pct_retidos"]}% dos retidos'
            )

    return {
        "retidos": retidos_bloco,
        "perdidos": perdidos_bloco,
        "destaques": destaques,
    }
