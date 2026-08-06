"""Execução das 4 ações fechadas de AutomacaoEtapa, disparada só na transição
pendente -> concluida de uma Etapa (ver app/api/routes/etapas.py::concluir_etapa),
e aplicação do processo-modelo de um Serviço numa Tarefa (usado tanto pelo botão
manual "Usar processo do serviço" quanto pela criação automática de card — ver
app/services/provisionamento.py).
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automacao_etapa import AutomacaoEtapa
from app.models.automacao_etapa_template import AutomacaoEtapaTemplate
from app.models.etapa import Etapa
from app.models.etapa_template import EtapaTemplate
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


async def aplicar_processo_do_servico(db: AsyncSession, tarefa_id: int, servico_id: Optional[int]) -> list[Etapa]:
    """Copia as etapas-modelo do Serviço pra dentro da Tarefa como Etapas reais,
    já com o responsável padrão de cada etapa (Etapa.responsavel_id). Acrescenta
    ao final das etapas que já existirem, nunca substitui. Usada tanto pelo botão
    manual "Usar processo do serviço" (routes/etapas.py) quanto pela criação
    automática de card (services/provisionamento.py, routes/tarefas.py).
    Retorna lista vazia (sem erro) se o serviço não tiver etapas-modelo — quem
    chama decide se isso é um problema (o botão manual vira 400, a criação
    automática só segue sem checklist).
    """
    if servico_id is None:
        return []

    result = await db.execute(
        select(EtapaTemplate).where(EtapaTemplate.servico_id == servico_id).order_by(EtapaTemplate.ordem, EtapaTemplate.id)
    )
    templates = list(result.scalars().all())
    if not templates:
        return []

    automacoes_result = await db.execute(
        select(AutomacaoEtapaTemplate).where(AutomacaoEtapaTemplate.etapa_template_id.in_([t.id for t in templates]))
    )
    automacoes_por_template = {a.etapa_template_id: a for a in automacoes_result.scalars().all()}

    ordem_result = await db.execute(select(Etapa.ordem).where(Etapa.tarefa_id == tarefa_id))
    proxima_ordem = max([o for (o,) in ordem_result.all()], default=-1) + 1
    hoje = date.today()

    novas_etapas = []
    for template in templates:
        etapa = Etapa(
            tarefa_id=tarefa_id,
            titulo=template.titulo,
            descricao=template.descricao,
            responsavel_id=template.responsavel_padrao_envoxer_id,
            prazo=hoje + timedelta(days=template.prazo_dias) if template.prazo_dias is not None else None,
            ordem=proxima_ordem,
        )
        proxima_ordem += 1
        db.add(etapa)
        novas_etapas.append((etapa, automacoes_por_template.get(template.id)))

    await db.flush()

    for etapa, automacao_template in novas_etapas:
        await db.refresh(etapa)
        if automacao_template:
            db.add(
                AutomacaoEtapa(
                    etapa_id=etapa.id,
                    acao=automacao_template.acao,
                    coluna_destino=automacao_template.coluna_destino,
                    ativo=automacao_template.ativo,
                )
            )

    await db.flush()
    return [etapa for etapa, _ in novas_etapas]
