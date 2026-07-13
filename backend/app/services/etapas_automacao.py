"""Execução das 4 ações fechadas de AutomacaoEtapa, disparada só na transição
pendente -> concluida de uma Etapa (ver app/api/routes/etapas.py::concluir_etapa).
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automacao_etapa import AutomacaoEtapa
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa
from app.models.pendencia import Pendencia


async def executar_automacao(
    db: AsyncSession,
    automacao: AutomacaoEtapa,
    etapa: Etapa,
    tarefa: Tarefa,
    proxima_etapa: Optional[Etapa],
) -> None:
    if automacao.acao == "LIBERAR_PROXIMA_ETAPA":
        # Sem efeito de dado — a próxima etapa deixa de aparecer "bloqueada" no
        # próximo GET, pois o cálculo em etapas.py::_to_response já considera
        # etapa.status == "concluida".
        return

    if automacao.acao == "MOVER_TAREFA_COLUNA":
        if automacao.coluna_destino:
            tarefa.status = automacao.coluna_destino
        return

    if automacao.acao == "MARCAR_TAREFA_CONCLUIDA":
        tarefa.status = "finalizado"
        tarefa.finalizada_em = datetime.now(timezone.utc)
        return

    if automacao.acao == "CRIAR_ALERTA_RESPONSAVEL":
        destinatario_id = None
        mensagem = f'Etapa "{etapa.titulo}" concluída na tarefa "{tarefa.titulo}".'
        if proxima_etapa and proxima_etapa.responsavel_id:
            destinatario_id = proxima_etapa.responsavel_id
            mensagem = f'Etapa "{etapa.titulo}" concluída — sua vez: "{proxima_etapa.titulo}" (tarefa "{tarefa.titulo}").'
        elif tarefa.responsavel_envoxer_id:
            destinatario_id = tarefa.responsavel_envoxer_id

        if destinatario_id:
            db.add(
                Pendencia(
                    envoxer_id=destinatario_id,
                    tarefa_id=tarefa.id,
                    etapa_id=etapa.id,
                    mensagem=mensagem,
                )
            )
        return
