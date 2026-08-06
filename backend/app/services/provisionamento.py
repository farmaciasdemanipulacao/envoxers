"""Provisionamento automático de cards do Kanban a partir da cota contratada
(Item de Escopo) — sem scheduler, chamado sob demanda a cada leitura de Tarefa
por período (`GET /tarefas`, `/tarefas/dashboard-dia`, `/calendario`), mesmo
padrão já usado no projeto pro Farol/ICP/reconciliação de entregáveis.

1 card (`Tarefa`) por (item_escopo_id, ano_mes) — nunca 1 por unidade. As
unidades contratadas viram `EntregaCheck` dentro desse card (criadas/
completadas até bater com `quantidade`, nunca removidas se a quantidade cair —
ver plano). Loop por item (não por unidade): poucas dezenas de iterações
mesmo com muitos clientes, então ORM puro é suficiente — não precisa de SQL
em massa como uma versão anterior deste arquivo chegou a usar.

Atenção: `db.rollback()` expira TODOS os objetos vivos na sessão (não só o que
falhou) — acessar um atributo de um objeto ORM expirado fora de um `await`
explícito quebra com `MissingGreenlet` no driver assíncrono. Por isso, a
partir do momento em que qualquer rollback pode acontecer, as funções abaixo
só trabalham com valores Python simples (id, quantidade, etc.) extraídos
ANTES, nunca com o objeto `ItemEscopo`/`Tarefa` em si.
"""
from calendar import monthrange
from datetime import date
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.models.item_escopo import ItemEscopo
from app.models.tarefa import Tarefa
from app.models.etapa import Etapa
from app.models.entrega_check import EntregaCheck
from app.services.etapas_automacao import aplicar_processo_do_servico


def ano_mes_atual() -> str:
    hoje = date.today()
    return f"{hoje.year:04d}-{hoje.month:02d}"


def _fim_do_mes(ano_mes: str) -> Optional[date]:
    """Prazo padrão do card: último dia do ciclo. Sem isso, um card provisionado
    que nunca é finalizado fica pra sempre com `prazo=None` e não cai em NENHUM
    filtro de atrasada (Kanban/Dashboard) — o gap fica invisível fora da tela de
    reconciliação. Itens pontuais não têm mês pra fechar, então ficam sem prazo."""
    if ano_mes == "pontual":
        return None
    ano, mes = (int(p) for p in ano_mes.split("-"))
    return date(ano, mes, monthrange(ano, mes)[1])


async def _sincronizar_servico_card_existente(db, tarefa_id: int, servico_id: Optional[int]) -> None:
    """Card do mês já existia (criado antes do item ganhar um Serviço vinculado,
    ou antes desta automação existir) — sincroniza sob demanda, mesmo padrão
    sem-scheduler do Farol/ICP. Só ATUALIZA o que ainda está vazio: nunca troca
    um servico_id/responsável já setado, nunca duplica etapa se já tiver alguma."""
    if servico_id is None:
        return
    tarefa = (await db.execute(select(Tarefa).where(Tarefa.id == tarefa_id))).scalar_one()
    if tarefa.servico_id is not None:
        return
    tarefa.servico_id = servico_id
    await db.flush()

    tem_etapa = (await db.execute(
        select(func.count()).select_from(Etapa).where(Etapa.tarefa_id == tarefa_id)
    )).scalar_one()
    if tem_etapa:
        return
    novas_etapas = await aplicar_processo_do_servico(db, tarefa_id, servico_id)
    if novas_etapas and tarefa.responsavel_envoxer_id is None:
        primeira = min(novas_etapas, key=lambda e: e.ordem)
        if primeira.responsavel_id:
            tarefa.responsavel_envoxer_id = primeira.responsavel_id
            await db.flush()


async def _obter_ou_criar_card_id(
    db, item_id: int, cliente_id: int, tipo: str, servico_id: Optional[int], descricao: Optional[str], ano_mes: str,
) -> int:
    tarefa_id = (await db.execute(
        select(Tarefa.id).where(
            Tarefa.item_escopo_id == item_id, Tarefa.ano_mes == ano_mes, Tarefa.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if tarefa_id is not None:
        await _sincronizar_servico_card_existente(db, tarefa_id, servico_id)
        return tarefa_id

    titulo = f"{tipo}{f' — {descricao}' if descricao else ''} ({ano_mes})"
    tarefa = Tarefa(
        cliente_id=cliente_id, item_escopo_id=item_id, ano_mes=ano_mes, servico_id=servico_id,
        titulo=titulo, status="nova", prazo=_fim_do_mes(ano_mes),
    )
    db.add(tarefa)
    try:
        await db.flush()
    except IntegrityError:
        # Corrida: outra requisição criou o card pra este (item, ano_mes) entre
        # a checagem acima e este flush — descarta a tentativa e usa a que já
        # existe. `item_id`/`ano_mes` são valores Python simples, não o objeto
        # ORM (que ficaria expirado depois do rollback).
        await db.rollback()
        return (await db.execute(
            select(Tarefa.id).where(
                Tarefa.item_escopo_id == item_id, Tarefa.ano_mes == ano_mes, Tarefa.deleted_at.is_(None),
            )
        )).scalar_one()

    # Card recém-criado (não uma corrida recuperada acima) — puxa o checklist
    # do serviço com os responsáveis padrão de cada etapa (ver EtapaTemplate) e
    # usa o responsável da 1ª etapa como responsável "dono" do card, pra não
    # nascer sem ninguém atribuído. Serviço sem etapas-modelo (retorno vazio)
    # simplesmente não seta nada — não é erro, card provisionado nunca deve
    # falhar por causa de um processo ainda não cadastrado.
    novas_etapas = await aplicar_processo_do_servico(db, tarefa.id, servico_id)
    if novas_etapas:
        primeira = min(novas_etapas, key=lambda e: e.ordem)
        if primeira.responsavel_id:
            tarefa.responsavel_envoxer_id = primeira.responsavel_id
            await db.flush()

    return tarefa.id


async def _completar_checks(db, tarefa_id: int, quantidade: int) -> None:
    existentes = (await db.execute(
        select(func.count()).select_from(EntregaCheck).where(EntregaCheck.tarefa_id == tarefa_id)
    )).scalar_one()
    if existentes >= quantidade:
        return
    db.add_all([EntregaCheck(tarefa_id=tarefa_id, numero=n) for n in range(existentes + 1, quantidade + 1)])
    try:
        await db.flush()
    except IntegrityError:
        # Corrida no top-up — outra requisição já completou os mesmos números;
        # idempotente, só descarta esta tentativa.
        await db.rollback()


async def garantir_cards_do_mes(db) -> None:
    for cadencia, ano_mes in (("mensal", ano_mes_atual()), ("pontual", "pontual")):
        itens = (await db.execute(
            select(ItemEscopo).where(
                ItemEscopo.ativo.is_(True), ItemEscopo.cadencia == cadencia, ItemEscopo.quantidade > 0,
            )
        )).scalars().all()
        # Extrai os valores já aqui, em Python puro — depois de qualquer rollback
        # (recuperação de corrida em outro item deste mesmo loop), todos os
        # objetos ItemEscopo já carregados ficam expirados; se o loop continuasse
        # acessando `item.id`/`item.quantidade` diretamente, quebraria no primeiro
        # item seguinte também.
        dados_itens = [(i.id, i.cliente_id, i.tipo, i.servico_id, i.descricao, i.quantidade) for i in itens]
        for item_id, cliente_id, tipo, servico_id, descricao, quantidade in dados_itens:
            tarefa_id = await _obter_ou_criar_card_id(db, item_id, cliente_id, tipo, servico_id, descricao, ano_mes)
            await _completar_checks(db, tarefa_id, quantidade)
    await db.flush()
