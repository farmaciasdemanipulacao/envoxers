"""Métricas internas consultam somente Tarefa e Solicitacao preexistentes."""
import unittest
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.solicitacao import Solicitacao
from app.models.tarefa import Tarefa
from app.api.routes.portal_operacao import indicadores_gargalos_portal

class IndicadoresGargalosTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await engine.dispose()

    async def test_indicadores_reais_filtrados_por_cliente(self):
        async with AsyncSessionLocal() as db:
            a=Cliente(nome="Empresa Alfa Gargalos")
            b=Cliente(nome="Empresa Beta Gargalos")
            db.add_all([a,b]);await db.flush()
            antiga=date.today()-timedelta(days=4)
            db.add_all([
                Tarefa(cliente_id=a.id,titulo="A atrasada",status="producao",prazo=antiga),
                Tarefa(cliente_id=a.id,titulo="A finalizada",status="finalizado",prazo=antiga),
                Tarefa(cliente_id=b.id,titulo="B aguardando cliente",status="aprovacao_cliente",prazo=antiga),
                Solicitacao(cliente_id=a.id,titulo="Pedido A",tipo="evento",descricao="Teste",solicitante_nome="Contato",status="nova"),
                Solicitacao(cliente_id=b.id,titulo="Pedido B",tipo="evento",descricao="Teste",solicitante_nome="Contato",status="nova"),
            ])
            await db.flush()
            a_stats=(await indicadores_gargalos_portal(a.id,None,db))["indicadores"]
            b_stats=(await indicadores_gargalos_portal(b.id,None,db))["indicadores"]
            self.assertEqual(a_stats["tarefas_atrasadas"],1)
            self.assertEqual(a_stats["tarefas_sem_responsavel"],1)
            self.assertEqual(a_stats["tarefas_aguardando_cliente"],0)
            self.assertEqual(a_stats["solicitacoes_sem_triagem"],1)
            self.assertEqual(b_stats["tarefas_aguardando_cliente"],1)
            self.assertEqual(b_stats["tarefas_atrasadas"],1)
            self.assertEqual(b_stats["solicitacoes_sem_triagem"],1)
            await db.rollback()

if __name__=="__main__":
    unittest.main()
