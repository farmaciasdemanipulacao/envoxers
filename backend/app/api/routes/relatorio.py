from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.servico import Servico
from app.models.tarefa import Tarefa
from app.models.registro_foco import RegistroFoco

router = APIRouter(prefix="/relatorio", tags=["relatorio"])


def _periodo_para_datas(periodo: str, inicio: Optional[date], fim: Optional[date]) -> tuple[datetime, datetime]:
    hoje = date.today()
    if periodo == "personalizado":
        if inicio is None or fim is None:
            raise HTTPException(status_code=400, detail="periodo=personalizado exige inicio e fim")
        d_inicio, d_fim = inicio, fim
    elif periodo == "semana":
        d_inicio, d_fim = hoje - timedelta(days=7), hoje
    else:  # "mes" (default)
        d_inicio, d_fim = hoje - timedelta(days=30), hoje

    inicio_dt = datetime.combine(d_inicio, datetime.min.time(), tzinfo=timezone.utc)
    fim_dt = datetime.combine(d_fim, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
    return inicio_dt, fim_dt


@router.get("/tempo-custo")
async def relatorio_tempo_custo(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    agrupar: str = "cliente",
    periodo: str = "mes",
    inicio: Optional[date] = None,
    fim: Optional[date] = None,
):
    if agrupar not in ("cliente", "servico", "tipo"):
        raise HTTPException(status_code=400, detail="agrupar deve ser cliente, servico ou tipo")

    inicio_dt, fim_dt = _periodo_para_datas(periodo, inicio, fim)

    if agrupar == "cliente":
        stmt = (
            select(
                Cliente.id, Cliente.nome, Cliente.segmento, Cliente.valor_contrato,
                func.coalesce(func.sum(RegistroFoco.duracao_min), 0),
                func.coalesce(func.sum(RegistroFoco.custo), 0),
            )
            .select_from(RegistroFoco)
            .join(Tarefa, Tarefa.id == RegistroFoco.tarefa_id)
            .join(Cliente, Cliente.id == Tarefa.cliente_id)
            .where(RegistroFoco.fim.is_not(None), RegistroFoco.inicio >= inicio_dt, RegistroFoco.inicio < fim_dt)
            .group_by(Cliente.id, Cliente.nome, Cliente.segmento, Cliente.valor_contrato)
        )
        rows = (await db.execute(stmt)).all()
        itens = []
        for cliente_id, nome, segmento, valor_contrato, min_total, custo_total in rows:
            valor_contrato = float(valor_contrato)
            custo_total = float(custo_total)
            margem_reais = valor_contrato - custo_total
            margem_pct = (margem_reais / valor_contrato * 100) if valor_contrato > 0 else None
            itens.append({
                "cliente_id": cliente_id,
                "cliente_nome": nome,
                "segmento": segmento,
                "horas": round(min_total / 60, 2),
                "custo_horas": custo_total,
                "valor_contrato": valor_contrato,
                "margem_reais": round(margem_reais, 2),
                "margem_pct": round(margem_pct, 1) if margem_pct is not None else None,
            })
        itens.sort(key=lambda i: (i["margem_pct"] is None, i["margem_pct"]))

    elif agrupar == "servico":
        stmt = (
            select(
                Servico.id, func.coalesce(Servico.nome, "Sem serviço"),
                func.coalesce(func.sum(RegistroFoco.duracao_min), 0),
                func.coalesce(func.sum(RegistroFoco.custo), 0),
            )
            .select_from(RegistroFoco)
            .join(Tarefa, Tarefa.id == RegistroFoco.tarefa_id)
            .outerjoin(Servico, Servico.id == Tarefa.servico_id)
            .where(RegistroFoco.fim.is_not(None), RegistroFoco.inicio >= inicio_dt, RegistroFoco.inicio < fim_dt)
            .group_by(Servico.id, Servico.nome)
        )
        rows = (await db.execute(stmt)).all()
        custo_geral = sum(float(r[3]) for r in rows) or 1
        itens = []
        for servico_id, nome, min_total, custo_total in rows:
            custo_total = float(custo_total)
            itens.append({
                "servico_id": servico_id,
                "servico_nome": nome,
                "horas": round(min_total / 60, 2),
                "custo_horas": custo_total,
                "pct_custo_total": round(custo_total / custo_geral * 100, 1),
            })
        itens.sort(key=lambda i: i["custo_horas"], reverse=True)

    else:  # tipo
        stmt = (
            select(
                func.coalesce(Tarefa.tipo_tarefa, "Sem tipo"),
                func.count(func.distinct(Tarefa.id)),
                func.coalesce(func.sum(RegistroFoco.duracao_min), 0),
                func.coalesce(func.sum(RegistroFoco.custo), 0),
            )
            .select_from(RegistroFoco)
            .join(Tarefa, Tarefa.id == RegistroFoco.tarefa_id)
            .where(RegistroFoco.fim.is_not(None), RegistroFoco.inicio >= inicio_dt, RegistroFoco.inicio < fim_dt)
            .group_by(Tarefa.tipo_tarefa)
        )
        rows = (await db.execute(stmt)).all()
        itens = []
        for tipo_tarefa, qtd_tarefas, min_total, custo_total in rows:
            custo_total = float(custo_total)
            itens.append({
                "tipo_tarefa": tipo_tarefa,
                "qtd_tarefas": qtd_tarefas,
                "horas": round(min_total / 60, 2),
                "custo_horas": custo_total,
                "custo_medio_tarefa": round(custo_total / qtd_tarefas, 2) if qtd_tarefas else 0,
            })
        itens.sort(key=lambda i: i["custo_horas"], reverse=True)

    return {
        "agrupar": agrupar,
        "periodo_inicio": inicio_dt.date().isoformat(),
        "periodo_fim": (fim_dt - timedelta(days=1)).date().isoformat(),
        "itens": itens,
    }
