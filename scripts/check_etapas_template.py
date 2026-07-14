"""Teste de integração de "Etapas-modelo por Serviço" (D-074) — roda contra o
Postgres real, chamando a lógica das rotas diretamente (sem HTTP/JWT). Cria e
depois apaga o próprio Servico/Tarefa de teste (cascade remove templates/etapas).

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/backend/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_etapas_template.py
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
from app.models.servico import Servico  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.api.routes.etapas_template import criar_template, configurar_automacao_template  # noqa: E402
from app.api.routes.etapas import aplicar_processo, criar_etapa  # noqa: E402
from app.schemas.etapa_template import EtapaTemplateCreate, AutomacaoEtapaTemplateUpsert  # noqa: E402
from app.schemas.etapa import EtapaCreate  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        cliente = (await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)).limit(1))).scalar_one_or_none()
        assert cliente, "precisa de pelo menos 1 cliente ativo no banco pra rodar o teste"
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        envoxer = (await db.execute(select(Envoxer).where(Envoxer.permissao == "envoxer", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin and envoxer, "precisa de 1 admin e 1 envoxer ativos"
        print(f"Usando cliente={cliente.nome!r}, admin={admin.nome!r}, envoxer={envoxer.nome!r}")

        servico = Servico(nome="[TESTE TEMPLATE] Serviço", slug="teste-template-servico-check")
        db.add(servico)
        await db.flush()
        servico_id = servico.id
        print(f"Serviço de teste criado id={servico_id}")

        try:
            # --- Monta o processo-modelo: 2 etapas, automação MOVER_TAREFA_COLUNA na última ---
            t1 = await criar_template(servico_id, EtapaTemplateCreate(titulo="Briefing", descricao="Alinhar com o cliente", prazo_dias=1), db, admin)
            t2 = await criar_template(servico_id, EtapaTemplateCreate(titulo="Entrega final", prazo_dias=5), db, admin)
            await assert_true(t1.ordem == 0 and t2.ordem == 1, "2 etapas-modelo criadas em ordem 0,1")

            await configurar_automacao_template(
                servico_id, t2.id, AutomacaoEtapaTemplateUpsert(acao="MOVER_TAREFA_COLUNA", coluna_destino="programado", ativo=True), db, admin
            )
            print("Automação MOVER_TAREFA_COLUNA -> 'programado' configurada na 2ª etapa-modelo")

            # --- Tarefa sem serviço: aplicar-processo deve falhar com 400 ---
            tarefa_sem_servico = Tarefa(cliente_id=cliente.id, titulo="[TESTE TEMPLATE] sem serviço", status="nova")
            db.add(tarefa_sem_servico)
            await db.flush()
            try:
                await aplicar_processo(tarefa_sem_servico.id, db, envoxer)
                raise AssertionError("FALHOU: aplicou processo numa tarefa sem serviço definido")
            except HTTPException as exc:
                await assert_true(exc.status_code == 400, "tarefa sem serviço é recusada (400) ao aplicar processo")

            # --- Tarefa com o serviço de teste: aplica o processo ---
            tarefa = Tarefa(cliente_id=cliente.id, servico_id=servico_id, titulo="[TESTE TEMPLATE] com serviço", status="nova")
            db.add(tarefa)
            await db.flush()
            tarefa_id = tarefa.id

            # já tinha 1 etapa manual antes — aplicar-processo deve ADICIONAR, não substituir
            manual = await criar_etapa(tarefa_id, EtapaCreate(titulo="Etapa manual já existente"), db, envoxer)
            await assert_true(manual.ordem == 0, "etapa manual criada antes, ordem 0")

            novas = await aplicar_processo(tarefa_id, db, envoxer)
            await assert_true(len(novas) == 2, "aplicar-processo criou as 2 etapas do modelo")
            await assert_true(novas[0].ordem == 1 and novas[1].ordem == 2, "novas etapas continuam a ordem depois da manual (1, 2)")
            await assert_true(novas[0].titulo == "Briefing" and novas[1].titulo == "Entrega final", "títulos batem com o template, na ordem certa")
            await assert_true(novas[1].automacao is not None and novas[1].automacao.acao == "MOVER_TAREFA_COLUNA", "automação copiada pra etapa real da 2ª etapa")
            await assert_true(novas[0].prazo is not None and novas[1].prazo is not None, "prazo_dias virou prazo (data) nas etapas reais")

            # --- Serviço sem template: aplicar-processo deve falhar com 400 ---
            servico_vazio = Servico(nome="[TESTE TEMPLATE] Serviço vazio", slug="teste-template-servico-vazio-check")
            db.add(servico_vazio)
            await db.flush()
            tarefa_servico_vazio = Tarefa(cliente_id=cliente.id, servico_id=servico_vazio.id, titulo="[TESTE TEMPLATE] serviço sem template", status="nova")
            db.add(tarefa_servico_vazio)
            await db.flush()
            try:
                await aplicar_processo(tarefa_servico_vazio.id, db, envoxer)
                raise AssertionError("FALHOU: aplicou processo de serviço sem etapas-modelo")
            except HTTPException as exc:
                await assert_true(exc.status_code == 400, "serviço sem etapas-modelo é recusado (400) ao aplicar processo")

            await db.commit()
            print("\nTODOS OS CENÁRIOS PASSARAM")
        finally:
            await db.rollback()
            result = await db.execute(select(Tarefa).where(Tarefa.titulo.like("[TESTE TEMPLATE]%")))
            for t in result.scalars().all():
                await db.delete(t)
            result = await db.execute(select(Servico).where(Servico.slug.like("teste-template-servico%")))
            for s in result.scalars().all():
                await db.delete(s)
            await db.commit()
            print("Dados de teste removidos")


if __name__ == "__main__":
    asyncio.run(main())
