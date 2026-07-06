"""Motor de cálculo do Perfil Comportamental do cliente (F3) — base técnica usada pelo ICP Builder.

Sem scheduler: recalculado sob demanda a cada GET /clientes/{id} (mesmo padrão "calcula
ao vivo" do Farol, ver services/farol.py).
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tarefa import Tarefa
from app.models.aprovacao import Aprovacao
from app.services.farol import DIAS_APROVACAO_PARADA

SCORE_CORTE_FACIL = 70
SCORE_CORTE_NEUTRO = 40
SCORE_SEM_DADO = 50  # cliente sem nenhuma tarefa ainda — default neutro (enum não tem "sem_dado")


def _sub_score_velocidade(dias: Optional[float]) -> Optional[int]:
    if dias is None:
        return None
    if dias <= 2:
        return 100
    if dias <= 5:
        return 70
    if dias <= 10:
        return 40
    return 10


def _sub_score_alteracoes(media: Optional[float]) -> Optional[int]:
    if media is None:
        return None
    if media <= 1:
        return 100
    if media <= 2:
        return 70
    if media <= 4:
        return 40
    return 10


def _sub_score_atrasos(qtd: int) -> int:
    if qtd == 0:
        return 100
    if qtd == 1:
        return 70
    if qtd == 2:
        return 40
    return 10


async def calcular_perfil_cliente(db: AsyncSession, cliente_id: int, hoje: Optional[date] = None) -> dict:
    """Calcula o perfil comportamental de UM cliente. Não persiste nada."""
    agora = datetime.now(timezone.utc)

    tarefas_result = await db.execute(
        select(Tarefa.id, Tarefa.status, Tarefa.qtd_alteracoes)
        .where(Tarefa.cliente_id == cliente_id, Tarefa.deleted_at.is_(None))
    )
    tarefas = tarefas_result.all()

    if not tarefas:
        return {
            "perfil": "neutro",
            "score": SCORE_SEM_DADO,
            "velocidade_aprovacao_dias": None,
            "alteracoes_media_por_tarefa": None,
            "atrasos_causados_pelo_cliente": 0,
            "tarefas_avaliadas": 0,
        }

    alteracoes_media = round(sum(t.qtd_alteracoes for t in tarefas) / len(tarefas), 1)

    velocidades: list[float] = []
    atrasos = 0
    tarefas_avaliadas = 0

    tarefa_ids = [t.id for t in tarefas]
    status_por_tarefa = {t.id: t.status for t in tarefas}

    aprov_result = await db.execute(
        select(Aprovacao.tarefa_id, Aprovacao.etapa, Aprovacao.decisao, Aprovacao.created_at)
        .where(Aprovacao.tarefa_id.in_(tarefa_ids))
        .order_by(Aprovacao.tarefa_id, Aprovacao.created_at)
    )
    por_tarefa: dict[int, list] = {}
    for tarefa_id, etapa, decisao, created_at in aprov_result.all():
        por_tarefa.setdefault(tarefa_id, []).append((etapa, decisao, created_at))

    for tarefa_id, eventos in por_tarefa.items():
        internas_aprovadas = [c for (e, d, c) in eventos if e == "interna" and d == "aprovada"]
        decisoes_cliente = [c for (e, d, c) in eventos if e == "cliente"]
        if not internas_aprovadas:
            continue
        tarefas_avaliadas += 1
        # Só o ciclo interna→cliente mais recente da tarefa (simplificação — não persegue
        # histórico completo de re-ajustes, só o desfecho mais atual).
        ultima_interna = internas_aprovadas[-1]
        decisao_seguinte = next((c for c in decisoes_cliente if c > ultima_interna), None)
        if decisao_seguinte is not None:
            dias = (decisao_seguinte - ultima_interna).total_seconds() / 86400
            velocidades.append(dias)
            if dias > DIAS_APROVACAO_PARADA:
                atrasos += 1
        elif status_por_tarefa.get(tarefa_id) == "aprovacao_cliente":
            dias_em_aberto = (agora - ultima_interna).total_seconds() / 86400
            if dias_em_aberto > DIAS_APROVACAO_PARADA:
                atrasos += 1

    velocidade_media = round(sum(velocidades) / len(velocidades), 1) if velocidades else None

    sub_scores = [
        s for s in (
            _sub_score_velocidade(velocidade_media),
            _sub_score_alteracoes(alteracoes_media),
            _sub_score_atrasos(atrasos),
        )
        if s is not None
    ]
    score = round(sum(sub_scores) / len(sub_scores)) if sub_scores else SCORE_SEM_DADO

    if score >= SCORE_CORTE_FACIL:
        perfil = "facil"
    elif score >= SCORE_CORTE_NEUTRO:
        perfil = "neutro"
    else:
        perfil = "dificil"

    return {
        "perfil": perfil,
        "score": score,
        "velocidade_aprovacao_dias": velocidade_media,
        "alteracoes_media_por_tarefa": alteracoes_media,
        "atrasos_causados_pelo_cliente": atrasos,
        "tarefas_avaliadas": tarefas_avaliadas,
    }
