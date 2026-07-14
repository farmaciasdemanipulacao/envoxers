"""Reconciliação de entregáveis — contratado (ItemEscopo) × entregue (Tarefa
finalizada vinculada + EntregaManual), sob demanda, sem scheduler (mesmo
padrão do Farol/ICP/Perfil). Resolve o problema de negócio: quando o cliente
reclama que algo não foi entregue meses atrás, a resposta já está aqui —
não precisa recontar no WhatsApp/servidor.
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select, func, and_

from app.models.item_escopo import ItemEscopo
from app.models.item_escopo_historico import ItemEscopoHistorico
from app.models.entrega_manual import EntregaManual
from app.models.tarefa import Tarefa
from app.models.alerta_entrega import AlertaEntrega
from app.schemas.item_escopo import ReconciliacaoItemResponse, ReconciliacaoMesResponse, EntregaManualResponse


async def aplicar_mudanca_quantidade(
    db, item: ItemEscopo, nova_quantidade: int, motivo: str,
    alterado_por_envoxer_id: Optional[int] = None, documento_acordo_id: Optional[int] = None,
) -> None:
    """Muda a quantidade contratada e grava o histórico — usado tanto pela edição
    manual direta (rota PATCH) quanto pelo Documento de Acordo quando todo mundo
    confirma. `db.add`/atribuição só — quem chama decide quando dar flush/commit."""
    if nova_quantidade == item.quantidade:
        return
    db.add(ItemEscopoHistorico(
        item_escopo_id=item.id, quantidade_anterior=item.quantidade, quantidade_nova=nova_quantidade,
        motivo=motivo, alterado_por_envoxer_id=alterado_por_envoxer_id, documento_acordo_id=documento_acordo_id,
    ))
    item.quantidade = nova_quantidade


def _somar_meses(ano: int, mes: int, delta: int) -> tuple[int, int]:
    total = (ano * 12 + (mes - 1)) + delta
    return total // 12, total % 12 + 1


def _ano_mes_str(ano: int, mes: int) -> str:
    return f"{ano:04d}-{mes:02d}"


def _ultimos_meses(hoje: date, quantidade: int) -> list[tuple[int, int]]:
    """Do mais antigo pro mais recente (mês atual por último)."""
    return [_somar_meses(hoje.year, hoje.month, -i) for i in range(quantidade - 1, -1, -1)]


async def _entregas_manuais_do_mes(db, item_id: int, ano_mes: str) -> list[EntregaManualResponse]:
    from app.models.envoxer import Envoxer

    result = await db.execute(
        select(EntregaManual, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == EntregaManual.lancado_por_envoxer_id)
        .where(EntregaManual.item_escopo_id == item_id, EntregaManual.ano_mes == ano_mes)
        .order_by(EntregaManual.created_at)
    )
    return [
        EntregaManualResponse(
            id=em.id, ano_mes=em.ano_mes, quantidade=em.quantidade, observacao=em.observacao,
            lancado_por_nome=nome, created_at=em.created_at,
        )
        for em, nome in result.all()
    ]


async def _calcular_item_mensal(db, item: ItemEscopo, ano: int, mes: int, fechado: bool) -> ReconciliacaoItemResponse:
    ano_mes = _ano_mes_str(ano, mes)
    inicio = datetime(ano, mes, 1, tzinfo=timezone.utc)
    fim_ano, fim_mes = _somar_meses(ano, mes, 1)
    fim = datetime(fim_ano, fim_mes, 1, tzinfo=timezone.utc)

    qtd_tarefas_result = await db.execute(
        select(func.count()).select_from(Tarefa).where(
            Tarefa.item_escopo_id == item.id, Tarefa.deleted_at.is_(None),
            Tarefa.status == "finalizado", Tarefa.finalizada_em.is_not(None),
            Tarefa.finalizada_em >= inicio, Tarefa.finalizada_em < fim,
        )
    )
    qtd_tarefas = qtd_tarefas_result.scalar_one()

    entregas_manuais = await _entregas_manuais_do_mes(db, item.id, ano_mes)
    qtd_manual = sum(e.quantidade for e in entregas_manuais)
    entregue = qtd_tarefas + qtd_manual

    status = _classificar(entregue, item.quantidade, fechado)
    return ReconciliacaoItemResponse(
        item_escopo_id=item.id, tipo=item.tipo, descricao=item.descricao, cadencia=item.cadencia,
        quantidade_contratada=item.quantidade, quantidade_entregue=entregue, status=status,
        qtd_tarefas=qtd_tarefas, entregas_manuais=entregas_manuais,
    )


async def _calcular_item_pontual(db, item: ItemEscopo) -> ReconciliacaoItemResponse:
    qtd_tarefas_result = await db.execute(
        select(func.count()).select_from(Tarefa).where(
            Tarefa.item_escopo_id == item.id, Tarefa.deleted_at.is_(None),
            Tarefa.status == "finalizado",
        )
    )
    qtd_tarefas = qtd_tarefas_result.scalar_one()

    manuais_result = await db.execute(select(EntregaManual).where(EntregaManual.item_escopo_id == item.id))
    manuais = manuais_result.scalars().all()
    qtd_manual = sum(m.quantidade for m in manuais)
    entregue = qtd_tarefas + qtd_manual

    entregas_manuais = [
        EntregaManualResponse(id=m.id, ano_mes=m.ano_mes, quantidade=m.quantidade, observacao=m.observacao, lancado_por_nome=None, created_at=m.created_at)
        for m in manuais
    ]
    status = _classificar(entregue, item.quantidade, fechado=True)
    return ReconciliacaoItemResponse(
        item_escopo_id=item.id, tipo=item.tipo, descricao=item.descricao, cadencia=item.cadencia,
        quantidade_contratada=item.quantidade, quantidade_entregue=entregue, status=status,
        qtd_tarefas=qtd_tarefas, entregas_manuais=entregas_manuais,
    )


def _classificar(entregue: int, contratada: int, fechado: bool) -> str:
    if contratada <= 0:
        return "completo"
    if entregue > contratada:
        return "excedente"
    if entregue == contratada:
        return "completo"
    if not fechado:
        return "em_andamento"
    if entregue == 0:
        return "nao_entregue"
    return "parcial"


async def calcular_reconciliacao_range(db, cliente_id: int, meses: int = 6) -> list[ReconciliacaoMesResponse]:
    hoje = date.today()
    itens_result = await db.execute(
        select(ItemEscopo).where(ItemEscopo.cliente_id == cliente_id, ItemEscopo.ativo.is_(True)).order_by(ItemEscopo.tipo)
    )
    itens = itens_result.scalars().all()
    itens_mensais = [i for i in itens if i.cadencia == "mensal"]
    itens_pontuais = [i for i in itens if i.cadencia == "pontual"]

    periodo = _ultimos_meses(hoje, meses)
    respostas = []
    for idx, (ano, mes) in enumerate(periodo):
        ano_mes = _ano_mes_str(ano, mes)
        fechado = (ano, mes) != (hoje.year, hoje.month)
        itens_resp = [await _calcular_item_mensal(db, item, ano, mes, fechado) for item in itens_mensais]

        # Itens pontuais só aparecem no mês mais recente (o "resumo atual"),
        # com totais acumulados desde sempre — repetir em todo mês do range
        # sugeriria (errado) que é uma meta que se renova mensalmente.
        if idx == len(periodo) - 1:
            for item in itens_pontuais:
                itens_resp.append(await _calcular_item_pontual(db, item))

        respostas.append(ReconciliacaoMesResponse(ano_mes=ano_mes, fechado=fechado, itens=itens_resp))
    return respostas


async def gerar_alertas_gap(db, cliente_id: int, meses_reconciliados: list[ReconciliacaoMesResponse]) -> None:
    """Idempotente — só cria AlertaEntrega pra (item, mês fechado) que ainda não tem
    nenhum alerta registrado. Nunca sobrescreve um alerta já reconhecido/resolvido."""
    for mes in meses_reconciliados:
        if not mes.fechado:
            continue
        for item_resp in mes.itens:
            if item_resp.status not in ("parcial", "nao_entregue"):
                continue
            existente = await db.execute(
                select(AlertaEntrega).where(
                    AlertaEntrega.item_escopo_id == item_resp.item_escopo_id,
                    AlertaEntrega.ano_mes == mes.ano_mes,
                )
            )
            if existente.scalar_one_or_none() is not None:
                continue
            motivo = f"Entregou {item_resp.quantidade_entregue}/{item_resp.quantidade_contratada} ({item_resp.tipo}) em {mes.ano_mes}"
            db.add(AlertaEntrega(
                cliente_id=cliente_id, item_escopo_id=item_resp.item_escopo_id, ano_mes=mes.ano_mes,
                quantidade_contratada=item_resp.quantidade_contratada, quantidade_entregue=item_resp.quantidade_entregue,
                motivo_texto=motivo,
            ))
    await db.flush()
