"""Integração com PostgreSQL efêmero: isolamento do portal com clientes fictícios."""
import unittest
from datetime import date
from fastapi import HTTPException
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalUnidade, PortalContatoUnidade
from app.api.routes.portal_operacao import (
    SolicitacaoNova, criar, detalhar, listar, solicitar_acesso, configurar_acesso, PapelNovo
)

class PortalDatabaseTest(unittest.IsolatedAsyncioTestCase):
    async def test_escopo_cadastro_e_acesso_cruzado(self):
        async with AsyncSessionLocal() as db:
            cliente_a = Cliente(nome="Organização Laboratório A")
            cliente_b = Cliente(nome="Organização Laboratório B")
            db.add_all([cliente_a, cliente_b]); await db.flush()
            reg_a = PortalUnidade(cliente_id=cliente_a.id, nome="Regional Alpha", tipo="regional")
            reg_a_2 = PortalUnidade(cliente_id=cliente_a.id, nome="Regional Beta", tipo="regional")
            reg_b = PortalUnidade(cliente_id=cliente_b.id, nome="Regional Gamma", tipo="regional")
            db.add_all([reg_a, reg_a_2, reg_b]); await db.flush()

            solicitante = ClienteContato(cliente_id=cliente_a.id, nome="Testador A", email="tester-a@example.invalid", portal_papel="solicitante")
            outro = ClienteContato(cliente_id=cliente_a.id, nome="Testador B", email="tester-b@example.invalid", portal_papel="consulta")
            estranho = ClienteContato(cliente_id=cliente_b.id, nome="Testador C", email="tester-c@example.invalid", portal_papel="gestor_geral")
            db.add_all([solicitante, outro, estranho]); await db.flush()
            db.add(PortalContatoUnidade(contato_id=solicitante.id, unidade_id=reg_a.id))
            await db.flush()

            dados = dict(unidade_id=reg_a.id, tipo="evento", titulo="Evento de teste",
                descricao="Solicitação completamente fictícia para verificação do isolamento.",
                prazo_solicitado=date(2026,11,15), apoio_envox="Arte e edição")
            solic = await criar(SolicitacaoNova(**dados), solicitante, db)
            self.assertIn("EVX-", solic["protocolo"])
            self.assertEqual(solic["status"], "Recebida")
            detalhe = await detalhar(solic["id"], solicitante, db)
            self.assertEqual(detalhe["titulo"], "Evento de teste")

            visiveis_a = await listar(solicitante, db)
            self.assertEqual(len([s for s in visiveis_a if s["id"] == solic["id"]]), 1)
            self.assertFalse([s for s in await listar(outro, db) if s["id"] == solic["id"]])
            self.assertFalse([s for s in await listar(estranho, db) if s["id"] == solic["id"]])

            for ator in (outro, estranho):
                with self.assertRaises(HTTPException) as erro:
                    await solicitar_acesso(db, ator, solic["id"])
                self.assertEqual(erro.exception.status_code, 404)

            with self.assertRaises(HTTPException) as erro:
                await criar(SolicitacaoNova(**{**dados,"unidade_id":reg_a_2.id}), solicitante, db)
            self.assertEqual(erro.exception.status_code, 403)
            with self.assertRaises(HTTPException) as erro:
                await criar(SolicitacaoNova(**{**dados,"unidade_id":reg_b.id}), solicitante, db)
            self.assertEqual(erro.exception.status_code, 422)

            await db.rollback()

if __name__ == "__main__":
    unittest.main()
