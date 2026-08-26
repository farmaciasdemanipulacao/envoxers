"""Teste de integração de 2 demandas da mesma sessão (D-117 + D-118) — roda
contra o Postgres real, chamando a lógica das rotas diretamente (sem HTTP/JWT).
Cria e apaga sua própria Tarefa de teste (cascade remove etapas).

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_ajuste_posicao.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.etapa import Etapa  # noqa: E402
from app.api.routes.aprovacoes import _criar_etapas_ajuste  # noqa: E402
from app.api.routes.tarefas import listar_tarefas  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        cliente = (await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)).limit(1))).scalar_one_or_none()
        envoxer_a = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert cliente and envoxer_a, "precisa de 1 cliente e 1 envoxer ativos no banco"
        print(f"Usando cliente={cliente.nome!r}, envoxer_a={envoxer_a.nome!r}")

        tarefa = Tarefa(cliente_id=cliente.id, titulo="[TESTE AJUSTE POSICAO] card", status="revisao_interna")
        db.add(tarefa)
        await db.flush()
        tarefa_id = tarefa.id
        print(f"Tarefa de teste criada id={tarefa_id}")

        try:
            # --- D-118: posição da etapa de Ajustar ---
            concluida = Etapa(tarefa_id=tarefa_id, titulo="Briefing", status="concluida", ordem=0, concluida_em=datetime.now(timezone.utc))
            etapa_a = Etapa(tarefa_id=tarefa_id, titulo="Produção A", status="pendente", ordem=1)
            etapa_b = Etapa(tarefa_id=tarefa_id, titulo="Produção B", status="pendente", ordem=2)
            db.add_all([concluida, etapa_a, etapa_b])
            await db.flush()
            print(f"Etapas base: concluida(ordem=0)={concluida.id}, A(ordem=1)={etapa_a.id}, B(ordem=2)={etapa_b.id}")

            await _criar_etapas_ajuste(db, tarefa_id, [envoxer_a.id], "Cliente pediu mudança de cor")

            todas = (await db.execute(select(Etapa).where(Etapa.tarefa_id == tarefa_id).order_by(Etapa.ordem))).scalars().all()
            titulos_em_ordem = [e.titulo for e in todas]
            print(f"Ordem final: {titulos_em_ordem}")
            await assert_true(titulos_em_ordem == ["Briefing", "Ajustar", "Produção A", "Produção B"], "etapa 'Ajustar' entra logo após a última concluída, não no fim da lista")

            await db.refresh(etapa_a)
            await db.refresh(etapa_b)
            await assert_true(etapa_a.ordem == 2 and etapa_b.ordem == 3, "etapas pendentes antigas são deslocadas (+1) mantendo a ordem relativa entre si (A antes de B)")

            ajuste = next(e for e in todas if e.titulo == "Ajustar")
            await assert_true(ajuste.responsavel_id == envoxer_a.id and ajuste.prazo is not None, "etapa de ajuste nasce com responsável e prazo (próximo dia útil)")

            # --- D-117: etapas_responsaveis_ids no listar_tarefas + lógica do filtro do Kanban ---
            envoxer_b = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True), Envoxer.id != envoxer_a.id).limit(1))).scalar_one_or_none()
            if envoxer_b:
                etapa_a.responsavel_id = envoxer_b.id
                await db.flush()

            lista = await listar_tarefas(db, envoxer_a, cliente_id=None, responsavel_id=None, status=None, q=None, atrasadas=None)
            item = next(t for t in lista if t.id == tarefa_id)
            print(f"etapas_responsaveis_ids={item.etapas_responsaveis_ids}, responsavel_envoxer_id (card)={item.responsavel_envoxer_id}")
            await assert_true(envoxer_a.id in item.etapas_responsaveis_ids, "envoxer_a (responsável da etapa 'Ajustar' pendente) aparece em etapas_responsaveis_ids")
            if envoxer_b:
                await assert_true(envoxer_b.id in item.etapas_responsaveis_ids, "envoxer_b (responsável da etapa A pendente) também aparece")
            await assert_true(item.responsavel_envoxer_id != envoxer_a.id, "card em si NÃO tem responsavel_envoxer_id == envoxer_a (reproduz o bug reportado: só aparecia filtrando por Card)")

            # replica a lógica do filtro do Kanban (tc-kanban.jsx) em Python
            filtro_modo_card = str(item.responsavel_envoxer_id) == str(envoxer_a.id)
            filtro_modo_tarefa = envoxer_a.id in (item.etapas_responsaveis_ids or [])
            await assert_true(filtro_modo_card is False, "modo 'Card' do filtro NÃO encontra o card pro envoxer_a (comportamento antigo, reproduz a reclamação)")
            await assert_true(filtro_modo_tarefa is True, "modo 'Tarefa/Etapa' do filtro ENCONTRA o card pro envoxer_a (fix)")

            print("Todos os cenários passaram.")
        finally:
            await db.execute(delete(Etapa).where(Etapa.tarefa_id == tarefa_id))
            await db.execute(delete(Tarefa).where(Tarefa.id == tarefa_id))
            await db.commit()
            restante = (await db.execute(select(Tarefa).where(Tarefa.titulo.ilike("[TESTE AJUSTE POSICAO]%")))).scalars().all()
            await assert_true(len(restante) == 0, "nenhum resíduo de teste deixado no banco")


if __name__ == "__main__":
    asyncio.run(main())
