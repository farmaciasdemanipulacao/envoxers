"""Teste de integração: Dashboard do dia separado Card x Tarefa/Etapa + prioridade
automática/manual (D-116). Roda contra o Postgres real, chamando a lógica das
rotas diretamente (sem HTTP/JWT), mesmo padrão de check_etapas.py. Cria e apaga
sua própria Tarefa de teste (cascade remove etapas) e a linha de prioridade
manual que gerar.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/backend/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_prioridades_dia.py
"""
import asyncio
import os
import sys
from datetime import date, timedelta

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.etapa import Etapa  # noqa: E402
from app.models.prioridade_manual import PrioridadeManual  # noqa: E402
from app.api.routes.tarefas import dashboard_dia, reordenar_prioridades_dia  # noqa: E402
from app.schemas.tarefa import PrioridadeDiaReordenar  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        cliente = (await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)).limit(1))).scalar_one_or_none()
        envoxer_a = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        gestor = (await db.execute(select(Envoxer).where(Envoxer.permissao.in_(("gestor", "admin")), Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert cliente and envoxer_a and gestor, "precisa de 1 cliente, 1 envoxer e 1 gestor/admin ativos no banco"
        print(f"Usando cliente={cliente.nome!r}, envoxer_a={envoxer_a.nome!r}, gestor/admin={gestor.nome!r} ({gestor.permissao})")

        hoje = date.today()
        ontem = hoje - timedelta(days=1)

        tarefa_atrasada = Tarefa(cliente_id=cliente.id, titulo="[TESTE PRIORIDADE] card atrasado", status="producao", prazo=ontem, responsavel_envoxer_id=envoxer_a.id)
        tarefa_hoje = Tarefa(cliente_id=cliente.id, titulo="[TESTE PRIORIDADE] card de hoje", status="producao", prazo=hoje, responsavel_envoxer_id=envoxer_a.id)
        db.add_all([tarefa_atrasada, tarefa_hoje])
        await db.flush()
        print(f"Cards de teste criados: atrasado={tarefa_atrasada.id}, hoje={tarefa_hoje.id}")

        etapa_atrasada = Etapa(tarefa_id=tarefa_hoje.id, titulo="[TESTE PRIORIDADE] etapa atrasada", responsavel_id=envoxer_a.id, prazo=ontem, status="pendente")
        etapa_hoje = Etapa(tarefa_id=tarefa_hoje.id, titulo="[TESTE PRIORIDADE] etapa de hoje", responsavel_id=envoxer_a.id, prazo=hoje, status="pendente")
        db.add_all([etapa_atrasada, etapa_hoje])
        await db.flush()
        print(f"Etapas de teste criadas: atrasada={etapa_atrasada.id}, hoje={etapa_hoje.id}")

        try:
            # --- 1) separação Card x Etapa + ranking automático (atraso primeiro) ---
            dash = await dashboard_dia(db, envoxer_a)
            ids_cards = [i["id"] for i in dash["cards"]["prioridades_hoje"]]
            ids_etapas = [i["id"] for i in dash["etapas"]["prioridades_hoje"]]
            await assert_true(tarefa_atrasada.id in ids_cards and tarefa_hoje.id in ids_cards, "os 2 cards de teste aparecem em cards.prioridades_hoje")
            await assert_true(etapa_atrasada.id in ids_etapas and etapa_hoje.id in ids_etapas, "as 2 etapas de teste aparecem em etapas.prioridades_hoje")
            await assert_true(
                ids_cards.index(tarefa_atrasada.id) < ids_cards.index(tarefa_hoje.id),
                "ranking automático: card atrasado vem antes do card de hoje",
            )
            await assert_true(
                ids_etapas.index(etapa_atrasada.id) < ids_etapas.index(etapa_hoje.id),
                "ranking automático: etapa atrasada vem antes da etapa de hoje",
            )
            item_card_hoje = next(i for i in dash["cards"]["prioridades_hoje"] if i["id"] == tarefa_hoje.id)
            await assert_true("cliente_farol" in item_card_hoje and "prazo" in item_card_hoje, "item de card carrega cliente_farol/prazo pro frontend ordenar/exibir")
            item_etapa_hoje = next(i for i in dash["etapas"]["prioridades_hoje"] if i["id"] == etapa_hoje.id)
            await assert_true(item_etapa_hoje["tarefa_id"] == tarefa_hoje.id, "item de etapa carrega tarefa_id (card-dono) pro frontend abrir")

            # --- 2) envoxer não pode reordenar lista de outra pessoa ---
            try:
                await reordenar_prioridades_dia(
                    PrioridadeDiaReordenar(tipo="card", envoxer_id=gestor.id, ids_em_ordem=[tarefa_hoje.id, tarefa_atrasada.id]),
                    db, envoxer_a,
                )
                raise AssertionError("FALHOU: envoxer conseguiu reordenar a lista de outra pessoa")
            except HTTPException as exc:
                await assert_true(exc.status_code == 403, "envoxer tentando reordenar lista de outra pessoa é barrado (403)")

            # --- 3) reordenação manual (envoxer na própria lista) inverte a ordem automática ---
            await reordenar_prioridades_dia(
                PrioridadeDiaReordenar(tipo="card", envoxer_id=envoxer_a.id, ids_em_ordem=[tarefa_hoje.id, tarefa_atrasada.id]),
                db, envoxer_a,
            )
            dash2 = await dashboard_dia(db, envoxer_a)
            ids_cards2 = [i["id"] for i in dash2["cards"]["prioridades_hoje"]]
            await assert_true(
                ids_cards2.index(tarefa_hoje.id) < ids_cards2.index(tarefa_atrasada.id),
                "ordem manual (card de hoje primeiro) vence o ranking automático",
            )

            # --- 4) gestor reordena a lista de etapas de outra pessoa (envoxer_a) sem 403 ---
            await reordenar_prioridades_dia(
                PrioridadeDiaReordenar(tipo="etapa", envoxer_id=envoxer_a.id, ids_em_ordem=[etapa_hoje.id, etapa_atrasada.id]),
                db, gestor,
            )
            dash3 = await dashboard_dia(db, gestor)
            ids_etapas3 = [i["id"] for i in dash3["etapas"]["prioridades_hoje"]]
            await assert_true(
                ids_etapas3.index(etapa_hoje.id) < ids_etapas3.index(etapa_atrasada.id),
                "gestor reordenando a lista do envoxer_a (etapa de hoje primeiro) funciona",
            )

            print("Todos os cenários passaram.")
        finally:
            await db.execute(delete(PrioridadeManual).where(PrioridadeManual.envoxer_id == envoxer_a.id, PrioridadeManual.referencia_id.in_([tarefa_atrasada.id, tarefa_hoje.id, etapa_atrasada.id, etapa_hoje.id])))
            await db.execute(delete(Etapa).where(Etapa.id.in_([etapa_atrasada.id, etapa_hoje.id])))
            await db.execute(delete(Tarefa).where(Tarefa.id.in_([tarefa_atrasada.id, tarefa_hoje.id])))
            await db.commit()
            restante = (await db.execute(select(Tarefa).where(Tarefa.titulo.ilike("[TESTE PRIORIDADE]%")))).scalars().all()
            await assert_true(len(restante) == 0, "nenhum resíduo de teste deixado no banco")


if __name__ == "__main__":
    asyncio.run(main())
