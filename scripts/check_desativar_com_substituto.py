"""Teste de integração isolado (D-117) — cria 2 envoxers de teste, 1 serviço/etapa-modelo,
1 tarefa com etapas pendente+concluída pro envoxer A, transfere pra B via
transferir_pendencias(), confirma o resultado e faz cascade delete no fim."""
import asyncio
import sys

sys.path.insert(0, "/workspace/backend")

from sqlalchemy import select, delete

from app.db.session import AsyncSessionLocal
from app.models.envoxer import Envoxer
from app.models.servico import Servico
from app.models.cliente import Cliente
from app.models.tarefa import Tarefa
from app.models.etapa import Etapa
from app.models.etapa_template import EtapaTemplate
from app.models.prioridade_manual import PrioridadeManual
from app.models.registro_foco import RegistroFoco
from app.services.transferencia_envoxer import transferir_pendencias
from app.core.security import hash_password


async def main():
    async with AsyncSessionLocal() as db:
        a = Envoxer(nome="[TESTE] Envoxer A", email="teste_transfer_a@seedtest.envox.com.br",
                    cargo="QA", permissao="envoxer", senha_hash=hash_password("x"),
                    salario_mensal=3000, horas_mes=220, custo_hora=13.6)
        b = Envoxer(nome="[TESTE] Envoxer B", email="teste_transfer_b@seedtest.envox.com.br",
                    cargo="QA", permissao="envoxer", senha_hash=hash_password("x"),
                    salario_mensal=3000, horas_mes=220, custo_hora=13.6)
        db.add_all([a, b])
        await db.flush()

        servico = Servico(nome="[TESTE] Servico Transfer", slug="teste-transfer-svc", ativo=True)
        db.add(servico)
        await db.flush()

        template = EtapaTemplate(servico_id=servico.id, titulo="Etapa modelo", ordem=0,
                                  responsavel_padrao_envoxer_id=a.id)
        db.add(template)

        cliente = Cliente(nome="[TESTE] Cliente Transfer", ativo=True)
        db.add(cliente)
        await db.flush()

        tarefa = Tarefa(cliente_id=cliente.id, servico_id=servico.id, titulo="[TESTE] Tarefa")
        db.add(tarefa)
        await db.flush()

        etapa_pendente = Etapa(tarefa_id=tarefa.id, titulo="Pendente", responsavel_id=a.id,
                                status="pendente", ordem=0)
        etapa_concluida = Etapa(tarefa_id=tarefa.id, titulo="Concluida", responsavel_id=a.id,
                                 status="concluida", ordem=1)
        db.add_all([etapa_pendente, etapa_concluida])
        await db.flush()

        prioridade = PrioridadeManual(envoxer_id=a.id, tipo="etapa", referencia_id=etapa_pendente.id, ordem=1)
        db.add(prioridade)
        await db.flush()

        ids = {"a": a.id, "b": b.id, "servico": servico.id, "template": template.id,
               "cliente": cliente.id, "tarefa": tarefa.id, "pendente": etapa_pendente.id,
               "concluida": etapa_concluida.id, "prioridade": prioridade.id}

        resumo = await transferir_pendencias(db, a.id, b.id)
        await db.commit()
        print("Resumo:", resumo)

        assert resumo["etapas_migradas"] == 1, resumo
        assert resumo["etapas_template_migradas"] == 1, resumo
        assert resumo["prioridades_migradas"] == 1, resumo
        assert resumo["foco_finalizado"] is False, resumo

        pend = (await db.execute(select(Etapa).where(Etapa.id == ids["pendente"]))).scalar_one()
        conc = (await db.execute(select(Etapa).where(Etapa.id == ids["concluida"]))).scalar_one()
        tmpl = (await db.execute(select(EtapaTemplate).where(EtapaTemplate.id == ids["template"]))).scalar_one()
        prio = (await db.execute(select(PrioridadeManual).where(PrioridadeManual.id == ids["prioridade"]))).scalar_one()

        assert pend.responsavel_id == b.id, "etapa pendente devia migrar pro substituto"
        assert conc.responsavel_id == a.id, "etapa CONCLUIDA não devia migrar (histórico preservado)"
        assert tmpl.responsavel_padrao_envoxer_id == b.id, "etapa-modelo devia migrar"
        assert prio.envoxer_id == b.id, "prioridade manual devia migrar"

        print("OK — pendente migrou, concluída manteve o histórico, template e prioridade migraram")

        # limpeza (ordem de FK)
        await db.execute(delete(PrioridadeManual).where(PrioridadeManual.id == ids["prioridade"]))
        await db.execute(delete(Etapa).where(Etapa.tarefa_id == ids["tarefa"]))
        await db.execute(delete(Tarefa).where(Tarefa.id == ids["tarefa"]))
        await db.execute(delete(Cliente).where(Cliente.id == ids["cliente"]))
        await db.execute(delete(EtapaTemplate).where(EtapaTemplate.id == ids["template"]))
        await db.execute(delete(Servico).where(Servico.id == ids["servico"]))
        await db.execute(delete(Envoxer).where(Envoxer.id.in_([ids["a"], ids["b"]])))
        await db.commit()
        print("Limpeza concluída — zero resíduo de teste no banco")


asyncio.run(main())
