"""Transferência em massa de pendências ao desativar um Envoxer (troca de pessoa) —
etapas abertas/atrasadas, etapas-modelo padrão e ordem manual de prioridade migram
pro substituto; etapas já concluídas mantêm o nome de quem saiu (histórico intacto)."""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.registro_foco import finalizar_foco_ativo_do_envoxer
from app.models.etapa import Etapa
from app.models.etapa_template import EtapaTemplate
from app.models.prioridade_manual import PrioridadeManual


async def transferir_pendencias(db: AsyncSession, de_id: int, para_id: int) -> dict:
    etapas_result = await db.execute(
        update(Etapa)
        .where(Etapa.responsavel_id == de_id, Etapa.status == "pendente")
        .values(responsavel_id=para_id)
        .returning(Etapa.id)
    )
    etapas_migradas = len(etapas_result.fetchall())

    templates_result = await db.execute(
        update(EtapaTemplate)
        .where(EtapaTemplate.responsavel_padrao_envoxer_id == de_id)
        .values(responsavel_padrao_envoxer_id=para_id)
        .returning(EtapaTemplate.id)
    )
    templates_migrados = len(templates_result.fetchall())

    # UNIQUE(envoxer_id, tipo, referencia_id) — se o substituto já tem uma entrada pro
    # mesmo item, a linha de quem saiu é descartada em vez de colidir na migração.
    prioridades = (
        await db.execute(select(PrioridadeManual).where(PrioridadeManual.envoxer_id == de_id))
    ).scalars().all()
    prioridades_migradas = 0
    for prioridade in prioridades:
        ja_existe = (
            await db.execute(
                select(PrioridadeManual.id).where(
                    PrioridadeManual.envoxer_id == para_id,
                    PrioridadeManual.tipo == prioridade.tipo,
                    PrioridadeManual.referencia_id == prioridade.referencia_id,
                )
            )
        ).scalar_one_or_none()
        if ja_existe is not None:
            await db.delete(prioridade)
        else:
            prioridade.envoxer_id = para_id
            prioridades_migradas += 1
    await db.flush()

    foco_finalizado = await finalizar_foco_ativo_do_envoxer(db, de_id)

    return {
        "etapas_migradas": etapas_migradas,
        "etapas_template_migradas": templates_migrados,
        "prioridades_migradas": prioridades_migradas,
        "foco_finalizado": foco_finalizado is not None,
    }
