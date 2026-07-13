"""Teste de integração da feature "Etapas do processo" — roda contra o Postgres real,
chamando a lógica das rotas diretamente (sem HTTP/JWT). Cria e depois apaga sua própria
Tarefa de teste (cascade remove etapas/automacoes/pendencias).

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/backend/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_etapas.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.pendencia import Pendencia  # noqa: E402
from app.api.routes.etapas import criar_etapa, concluir_etapa, configurar_automacao, listar_etapas  # noqa: E402
from app.schemas.etapa import EtapaCreate, AutomacaoEtapaUpsert  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        cliente = (await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)).limit(1))).scalar_one_or_none()
        assert cliente, "precisa de pelo menos 1 cliente ativo no banco pra rodar o teste"

        envoxer_a = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        envoxer_b = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True), Envoxer.id != (envoxer_a.id if envoxer_a else -1)).limit(1))).scalar_one_or_none()
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert envoxer_a and envoxer_b, "precisa de pelo menos 2 envoxers com permissao='envoxer' ativos"
        assert admin, "precisa de 1 admin ativo"
        print(f"Usando cliente={cliente.nome!r}, envoxer_a={envoxer_a.nome!r}, envoxer_b={envoxer_b.nome!r}, admin={admin.nome!r}")

        tarefa = Tarefa(cliente_id=cliente.id, titulo="[TESTE ETAPAS] checklist automático", status="nova")
        db.add(tarefa)
        await db.flush()
        tarefa_id = tarefa.id
        print(f"Tarefa de teste criada id={tarefa_id}")

        try:
            # --- Cenário 1: 3 etapas, automação MOVER_TAREFA_COLUNA na última ---
            e1 = await criar_etapa(tarefa_id, EtapaCreate(titulo="Aprovação do briefing", responsavel_id=envoxer_a.id), db, envoxer_a)
            e2 = await criar_etapa(tarefa_id, EtapaCreate(titulo="Produção do criativo", responsavel_id=envoxer_a.id), db, envoxer_a)
            e3 = await criar_etapa(tarefa_id, EtapaCreate(titulo="Revisão final", responsavel_id=envoxer_a.id), db, envoxer_a)
            await assert_true(e1.ordem == 0 and e2.ordem == 1 and e3.ordem == 2, "3 etapas criadas em ordem 0,1,2")

            await configurar_automacao(
                tarefa_id, e3.id, AutomacaoEtapaUpsert(acao="MOVER_TAREFA_COLUNA", coluna_destino="programado", ativo=True), db, admin
            )
            print("Automação MOVER_TAREFA_COLUNA -> 'programado' configurada na etapa 3")

            # não-responsável (nem admin/gestor) não pode concluir
            try:
                await concluir_etapa(tarefa_id, e1.id, db, envoxer_b)
                raise AssertionError("FALHOU: envoxer_b (não responsável) conseguiu concluir a etapa 1")
            except HTTPException as exc:
                await assert_true(exc.status_code == 403, "envoxer_b sem permissão foi barrado (403) ao tentar concluir etapa 1")

            await concluir_etapa(tarefa_id, e1.id, db, envoxer_a)
            await concluir_etapa(tarefa_id, e2.id, db, envoxer_a)
            await concluir_etapa(tarefa_id, e3.id, db, envoxer_a)
            print("As 3 etapas foram concluídas pelo responsável")

            await db.refresh(tarefa)
            await assert_true(tarefa.status == "programado", "tarefa mudou sozinha de coluna para 'programado' após concluir a última etapa")

            # --- Cenário 2: trava LIBERAR_PROXIMA_ETAPA ---
            tarefa2 = Tarefa(cliente_id=cliente.id, titulo="[TESTE ETAPAS] trava de sequência", status="nova")
            db.add(tarefa2)
            await db.flush()
            f1 = await criar_etapa(tarefa2.id, EtapaCreate(titulo="Passo 1", responsavel_id=envoxer_a.id), db, envoxer_a)
            f2 = await criar_etapa(tarefa2.id, EtapaCreate(titulo="Passo 2", responsavel_id=envoxer_a.id), db, envoxer_a)
            await configurar_automacao(
                tarefa2.id, f1.id, AutomacaoEtapaUpsert(acao="LIBERAR_PROXIMA_ETAPA", ativo=True), db, admin
            )
            lista = await listar_etapas(tarefa2.id, db, envoxer_a)
            f2_antes = next(x for x in lista if x.id == f2.id)
            await assert_true(f2_antes.bloqueada is True, "etapa 2 aparece bloqueada antes da etapa 1 (com LIBERAR_PROXIMA_ETAPA) ser concluída")

            try:
                await concluir_etapa(tarefa2.id, f2.id, db, envoxer_a)
                raise AssertionError("FALHOU: consegui concluir etapa bloqueada")
            except HTTPException as exc:
                await assert_true(exc.status_code == 400, "backend recusa (400) concluir etapa bloqueada mesmo sendo o responsável")

            await concluir_etapa(tarefa2.id, f1.id, db, envoxer_a)
            lista2 = await listar_etapas(tarefa2.id, db, envoxer_a)
            f2_depois = next(x for x in lista2 if x.id == f2.id)
            await assert_true(f2_depois.bloqueada is False, "etapa 2 destrava depois que a etapa 1 é concluída")
            await concluir_etapa(tarefa2.id, f2.id, db, envoxer_a)
            print("Trava de sequência (LIBERAR_PROXIMA_ETAPA) funcionou")

            # --- Cenário 3: CRIAR_ALERTA_RESPONSAVEL gera Pendencia ---
            tarefa3 = Tarefa(cliente_id=cliente.id, titulo="[TESTE ETAPAS] alerta responsável", status="nova")
            db.add(tarefa3)
            await db.flush()
            g1 = await criar_etapa(tarefa3.id, EtapaCreate(titulo="Passo 1", responsavel_id=envoxer_a.id), db, envoxer_a)
            g2 = await criar_etapa(tarefa3.id, EtapaCreate(titulo="Passo 2", responsavel_id=envoxer_b.id), db, envoxer_a)
            await configurar_automacao(
                tarefa3.id, g1.id, AutomacaoEtapaUpsert(acao="CRIAR_ALERTA_RESPONSAVEL", ativo=True), db, admin
            )
            await concluir_etapa(tarefa3.id, g1.id, db, envoxer_a)
            pend = (await db.execute(select(Pendencia).where(Pendencia.tarefa_id == tarefa3.id))).scalar_one_or_none()
            await assert_true(pend is not None and pend.envoxer_id == envoxer_b.id, "Pendencia criada pro responsável da PRÓXIMA etapa (envoxer_b)")
            print(f"  mensagem gerada: {pend.mensagem!r}")

            await db.commit()
            print("\nTODOS OS CENÁRIOS PASSARAM")
        finally:
            # limpa tudo que este script criou (cascade remove etapas/automacoes/pendencias)
            await db.rollback()
            result = await db.execute(select(Tarefa).where(Tarefa.titulo.like("[TESTE ETAPAS]%")))
            for t in result.scalars().all():
                await db.delete(t)
            await db.commit()
            print("Dados de teste removidos")


if __name__ == "__main__":
    asyncio.run(main())
