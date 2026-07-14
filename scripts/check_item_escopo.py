"""Teste de integração do Portal do Cliente — Módulo B: Itens de Escopo /
Reconciliação / Alertas de Entrega (D-076) — roda contra o Postgres real,
chamando a lógica das rotas diretamente (sem HTTP/JWT). Cria e depois apaga
seu próprio Cliente/Tarefas de teste.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_item_escopo.py
"""
import asyncio
import os
import sys
from datetime import date, datetime, timezone

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.item_escopo import ItemEscopo  # noqa: E402
from app.models.alerta_entrega import AlertaEntrega  # noqa: E402
from app.api.routes.item_escopo import (  # noqa: E402
    criar_item_escopo, atualizar_item_escopo, lancar_entrega_manual,
    reconciliacao_cliente, painel_entregaveis, listar_alertas_entrega, atualizar_alerta_entrega,
)
from app.schemas.item_escopo import ItemEscopoCreate, ItemEscopoUpdate, EntregaManualCreate, AlertaEntregaUpdate  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


def _somar_meses(ano, mes, delta):
    total = (ano * 12 + (mes - 1)) + delta
    return total // 12, total % 12 + 1


async def main():
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin, "precisa de 1 admin ativo"

        cliente = Cliente(nome="[TESTE ENTREGAVEIS] Cliente Check", segmento="Teste", valor_contrato=1000, tipo_receita="recorrente", ativo=True)
        db.add(cliente)
        await db.flush()
        cliente_id = cliente.id
        print(f"Cliente de teste criado id={cliente_id}")

        # 1) criar item mensal quantidade=3
        item = await criar_item_escopo(cliente_id, ItemEscopoCreate(tipo="post_social", cadencia="mensal", quantidade=3), db, admin)
        await assert_true(item.quantidade == 3, "item mensal criado com quantidade 3")

        # 2) criar item pontual quantidade=1
        item_pontual = await criar_item_escopo(cliente_id, ItemEscopoCreate(tipo="video", cadencia="pontual", quantidade=1), db, admin)

        hoje = date.today()
        ano_passado, mes_passado = _somar_meses(hoje.year, hoje.month, -1)
        inicio_mes_passado = datetime(ano_passado, mes_passado, 15, tzinfo=timezone.utc)

        # 3) 2 tarefas finalizadas no MÊS PASSADO vinculadas ao item mensal (backdated
        # diretamente no banco — a API real sempre usa now(), não dá pra simular
        # retroatividade só com PATCH normal)
        for i in range(2):
            t = Tarefa(cliente_id=cliente_id, item_escopo_id=item.id, titulo=f"Post teste {i}", status="finalizado", finalizada_em=inicio_mes_passado)
            db.add(t)
        await db.flush()

        # 4) reconciliação do mês passado deve dar "parcial" (2/3) e criar 1 alerta
        resultado = await reconciliacao_cliente(cliente_id, db, admin, meses=2)
        mes_fechado = resultado[0]
        item_resp = next(i for i in mes_fechado.itens if i.item_escopo_id == item.id)
        await assert_true(mes_fechado.fechado is True, "mês passado marcado como fechado")
        await assert_true(item_resp.quantidade_entregue == 2, "2 tarefas finalizadas contadas no mês passado")
        await assert_true(item_resp.status == "parcial", "status parcial (2/3) no mês fechado")

        alertas_result = await db.execute(select(AlertaEntrega).where(AlertaEntrega.item_escopo_id == item.id))
        alerta = alertas_result.scalar_one_or_none()
        await assert_true(alerta is not None, "AlertaEntrega criado automaticamente pro gap do mês fechado")
        await assert_true(alerta.quantidade_entregue == 2 and alerta.quantidade_contratada == 3, "alerta com os números certos")

        # 5) reconciliação de novo não duplica o alerta (idempotente)
        await reconciliacao_cliente(cliente_id, db, admin, meses=2)
        alertas_result2 = await db.execute(select(AlertaEntrega).where(AlertaEntrega.item_escopo_id == item.id))
        await assert_true(len(alertas_result2.scalars().all()) == 1, "recalcular de novo não duplica o alerta")

        # 6) mês ATUAL (em andamento) não deve gerar alerta mesmo com 0 entregue
        item_mes_atual = next(i for i in resultado[1].itens if i.item_escopo_id == item.id)
        await assert_true(resultado[1].fechado is False, "mês atual não é 'fechado'")
        await assert_true(item_mes_atual.status == "em_andamento", "mês atual em andamento, não 'não entregue'")

        # 7) lançar entrega manual pro mês passado — fecha o gap (3/3)
        ano_mes_passado = f"{ano_passado:04d}-{mes_passado:02d}"
        await lancar_entrega_manual(cliente_id, item.id, EntregaManualCreate(ano_mes=ano_mes_passado, quantidade=1, observacao="Entregue via WhatsApp"), db, admin)
        resultado2 = await reconciliacao_cliente(cliente_id, db, admin, meses=2)
        item_resp2 = next(i for i in resultado2[0].itens if i.item_escopo_id == item.id)
        await assert_true(item_resp2.quantidade_entregue == 3, "entrega manual soma no total (2 tarefas + 1 manual = 3)")
        await assert_true(item_resp2.status == "completo", "status completo depois da entrega manual")

        # 8) item pontual: nao_entregue até ter 1 tarefa finalizada vinculada (qualquer data)
        resultado_pontual_antes = next(i for i in resultado2[-1].itens if i.item_escopo_id == item_pontual.id)
        await assert_true(resultado_pontual_antes.status == "nao_entregue", "item pontual sem entrega ainda = nao_entregue")
        t_pontual = Tarefa(cliente_id=cliente_id, item_escopo_id=item_pontual.id, titulo="Vídeo institucional", status="finalizado", finalizada_em=datetime.now(timezone.utc))
        db.add(t_pontual)
        await db.flush()
        resultado3 = await reconciliacao_cliente(cliente_id, db, admin, meses=2)
        resultado_pontual_depois = next(i for i in resultado3[-1].itens if i.item_escopo_id == item_pontual.id)
        await assert_true(resultado_pontual_depois.status == "completo", "item pontual completo depois de 1 tarefa finalizada")

        # 9) update de quantidade exige motivo
        try:
            await atualizar_item_escopo(cliente_id, item.id, ItemEscopoUpdate(quantidade=5), db, admin)
            raise AssertionError("FALHOU: deveria exigir motivo pra mudar quantidade")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "mudar quantidade sem motivo é rejeitado (400)")

        item_atualizado = await atualizar_item_escopo(cliente_id, item.id, ItemEscopoUpdate(quantidade=5, motivo="Cliente pediu aumento"), db, admin)
        await assert_true(item_atualizado.quantidade == 5, "quantidade atualizada com motivo")

        from app.models.item_escopo_historico import ItemEscopoHistorico
        hist_result = await db.execute(select(ItemEscopoHistorico).where(ItemEscopoHistorico.item_escopo_id == item.id))
        hist = hist_result.scalar_one_or_none()
        await assert_true(hist is not None and hist.quantidade_anterior == 3 and hist.quantidade_nova == 5, "histórico gravado com antes/depois corretos")

        # 10) painel cruzado mostra o cliente de teste com gap (item pontual virou completo,
        # mas o mensal do mês atual pode estar em_andamento — não conta como gap; então
        # forçamos checar que o cliente aparece listado, sem quebrar)
        painel = await painel_entregaveis(db, admin)
        await assert_true(any(p.cliente_id == cliente_id for p in painel), "cliente de teste aparece no painel cruzado de entregáveis")

        # 11) alertas-entrega: listar, reconhecer, resolver
        abertos = await listar_alertas_entrega(db, admin, status="aberto", cliente_id=cliente_id)
        await assert_true(len(abertos) == 1, "1 alerta aberto listado pro cliente de teste")
        alerta_id = abertos[0].id

        try:
            await atualizar_alerta_entrega(alerta_id, AlertaEntregaUpdate(status="resolvido"), db, admin)
            raise AssertionError("FALHOU: resolver sem nota deveria falhar")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "resolver sem resolucao_nota é rejeitado (400)")

        reconhecido = await atualizar_alerta_entrega(alerta_id, AlertaEntregaUpdate(status="reconhecido"), db, admin)
        await assert_true(reconhecido.status == "reconhecido" and reconhecido.reconhecido_por_nome == admin.nome, "alerta reconhecido com autor certo")

        resolvido = await atualizar_alerta_entrega(alerta_id, AlertaEntregaUpdate(status="resolvido", resolucao_nota="Fechado com o cliente, era engano dele"), db, admin)
        await assert_true(resolvido.status == "resolvido" and resolvido.resolvido_em is not None, "alerta resolvido com nota")

        # limpeza
        await db.execute(delete(Tarefa).where(Tarefa.cliente_id == cliente_id))
        await db.execute(delete(ItemEscopo).where(ItemEscopo.cliente_id == cliente_id))
        await db.execute(delete(Cliente).where(Cliente.id == cliente_id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
