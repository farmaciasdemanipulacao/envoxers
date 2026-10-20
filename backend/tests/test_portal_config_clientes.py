"""Configuração multi-cliente: desativado por padrão, habilitação explícita e travas de módulos não homologados."""
import unittest
from fastapi import HTTPException
from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalClienteConfig
from app.api.routes.portal_operacao import ConfigClientePatch, contato_habilitado, salvar_config_portal, serializar_config

class PortalConfigClientesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        # IsolatedAsyncioTestCase usa novo event loop por teste.
        # Descarta conexões do pool antes do loop seguinte, evitando Future de outro loop.
        await engine.dispose()

    async def test_opt_in_modulos_e_separacao(self):
        async with AsyncSessionLocal() as db:
            a=Cliente(nome="Empresa A laboratório")
            b=Cliente(nome="Empresa B laboratório")
            db.add_all([a,b]); await db.flush()
            ct_a=ClienteContato(cliente_id=a.id,nome="Contato A",email="contatoteste-portal-a@example.invalid")
            ct_b=ClienteContato(cliente_id=b.id,nome="Contato B",email="contatoteste-portal-b@example.invalid")
            db.add_all([ct_a,ct_b]);await db.flush()
            self.assertFalse(serializar_config(a.id,None)["habilitado"])
            for contato in (ct_a,ct_b):
                with self.assertRaises(HTTPException) as err:
                    await contato_habilitado(contato,db)
                self.assertEqual(err.exception.status_code,403)

            with self.assertRaises(HTTPException) as err:
                await salvar_config_portal(a.id,ConfigClientePatch(habilitado=True,modulos={"ia":True}),None,db)
            self.assertEqual(err.exception.status_code,422)
            with self.assertRaises(HTTPException) as err:
                await salvar_config_portal(a.id,ConfigClientePatch(habilitado=True,notificacoes={"comentario":True}),None,db)
            self.assertEqual(err.exception.status_code,422)
            with self.assertRaises(HTTPException) as err:
                await salvar_config_portal(a.id,ConfigClientePatch(habilitado=True,visibilidade={"mostrar_horas":True}),None,db)
            self.assertEqual(err.exception.status_code,422)

            result=await salvar_config_portal(a.id,ConfigClientePatch(habilitado=True,modulos={"solicitacoes":True}),None,db)
            self.assertTrue(result["habilitado"])
            self.assertFalse(result["modulos"]["aprovacoes"])
            self.assertIs(await contato_habilitado(ct_a,db),ct_a)
            with self.assertRaises(HTTPException) as err:
                await contato_habilitado(ct_b,db)
            self.assertEqual(err.exception.status_code,403)

            result=await salvar_config_portal(a.id,ConfigClientePatch(habilitado=False,modulos={"solicitacoes":True}),None,db)
            self.assertFalse(result["habilitado"])
            with self.assertRaises(HTTPException) as err:
                await contato_habilitado(ct_a,db)
            self.assertEqual(err.exception.status_code,403)
            await db.rollback()

if __name__=="__main__":
    unittest.main()
