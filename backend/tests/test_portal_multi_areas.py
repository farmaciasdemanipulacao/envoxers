"""SECOVI: dois papéis, acesso por múltiplas regionais/frentes, sem dados operacionais privados."""
import unittest
from datetime import date
from fastapi import HTTPException
from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalUnidade, PortalContatoUnidade
from app.models.solicitacao import Solicitacao
from app.api.routes.portal_operacao import SolicitacaoNova, listar, detalhar, criar, solicitar_acesso
from app.services.portal_permissoes import capacidades, pode, pode_ver_solicitacao


class MultiAreasSECOVITest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await engine.dispose()

    async def test_duas_funcoes_multiplas_areas_e_privacidade(self):
        async with AsyncSessionLocal() as db:
            secovi = Cliente(nome="SECOVI fictício, múltiplas áreas")
            outro = Cliente(nome="Outro cliente fictício")
            db.add_all([secovi,outro]); await db.flush()
            maringa=PortalUnidade(cliente_id=secovi.id,tipo="regional",nome="Maringá")
            londrina=PortalUnidade(cliente_id=secovi.id,tipo="regional",nome="Londrina")
            med=PortalUnidade(cliente_id=secovi.id,tipo="frente",nome="Secovimed")
            outsider=PortalUnidade(cliente_id=outro.id,tipo="regional",nome="Fora da organização")
            db.add_all([maringa,londrina,med,outsider]);await db.flush()
            admin=ClienteContato(cliente_id=secovi.id,nome="Admin SECOVI",email="admin-multi@example.invalid",portal_papel="admin_institucional")
            marli=ClienteContato(cliente_id=secovi.id,nome="Marli",email="marli-multi@example.invalid",portal_papel="solicitante",portal_capacidades={"aprovar":True,"ver_horas":True})
            tatiana=ClienteContato(cliente_id=secovi.id,nome="Tatiana",email="tatiana-multi@example.invalid",portal_papel="solicitante")
            maria=ClienteContato(cliente_id=secovi.id,nome="Maria",email="maria-multi@example.invalid",portal_papel="solicitante")
            joao=ClienteContato(cliente_id=secovi.id,nome="João",email="joao-multi@example.invalid",portal_papel="solicitante",portal_capacidades={"aprovar":True})
            multi=ClienteContato(cliente_id=secovi.id,nome="Multi",email="multi-multi@example.invalid",portal_papel="solicitante")
            estranho=ClienteContato(cliente_id=outro.id,nome="Externo",email="externo-multi@example.invalid",portal_papel="admin_institucional")
            db.add_all([admin,marli,tatiana,maria,joao,multi,estranho]);await db.flush()
            db.add_all([
                PortalContatoUnidade(contato_id=marli.id,unidade_id=maringa.id),
                PortalContatoUnidade(contato_id=tatiana.id,unidade_id=maringa.id),
                PortalContatoUnidade(contato_id=maria.id,unidade_id=londrina.id),
                PortalContatoUnidade(contato_id=joao.id,unidade_id=med.id),
                PortalContatoUnidade(contato_id=multi.id,unidade_id=maringa.id),
                PortalContatoUnidade(contato_id=multi.id,unidade_id=med.id),
            ])
            await db.flush()
            requests = [
                Solicitacao(cliente_id=secovi.id,portal_contato_id=marli.id,portal_unidade_id=maringa.id,titulo="Maringá",tipo="evento",status="nova",descricao="Fictício",solicitante_nome="Marli",briefing_estruturado={"apoio_envox":"Arte","valor_interno":1234,"responsavel_envoxer_id":12,"campos_customizados":{"tema":"evento","custo_interno":"R$ 100"}}),
                Solicitacao(cliente_id=secovi.id,portal_contato_id=maria.id,portal_unidade_id=londrina.id,titulo="Londrina",tipo="evento",status="nova",descricao="Fictício",solicitante_nome="Maria"),
                Solicitacao(cliente_id=secovi.id,portal_contato_id=joao.id,portal_frente_id=med.id,titulo="Secovimed",tipo="evento",status="nova",descricao="Fictício",solicitante_nome="João"),
                Solicitacao(cliente_id=outro.id,portal_contato_id=estranho.id,portal_unidade_id=outsider.id,titulo="Outro cliente",tipo="evento",status="nova",descricao="Fictício",solicitante_nome="Externo"),
            ]
            db.add_all(requests);await db.flush()
            async def titles(contato):
                return {x["titulo"] for x in await listar(contato,db)}
            self.assertEqual(await titles(admin),{"Maringá","Londrina","Secovimed"})
            self.assertEqual(await titles(marli),{"Maringá"})
            self.assertEqual(await titles(tatiana),{"Maringá"})
            self.assertEqual(await titles(maria),{"Londrina"})
            self.assertEqual(await titles(joao),{"Secovimed"})
            self.assertEqual(await titles(multi),{"Maringá","Secovimed"})
            self.assertTrue(pode("solicitante","aprovar",{"aprovar":True}))
            self.assertFalse(pode("solicitante","aprovar",{}))
            self.assertFalse(pode("solicitante","gerenciar_usuarios",{"gerenciar_usuarios":True}))
            self.assertTrue(pode("admin_institucional","aprovar"))
            self.assertFalse(pode_ver_solicitacao("solicitante",joao.id,joao.id,None,set(),frente_id=med.id))
            self.assertTrue(pode_ver_solicitacao("solicitante",joao.id,joao.id,None,{med.id},frente_id=med.id))
            with self.assertRaises(HTTPException) as err:
                await solicitar_acesso(db,marli,requests[2].id)
            self.assertEqual(err.exception.status_code,404)
            self.assertEqual((await detalhar(requests[0].id,marli,db))["titulo"],"Maringá")
            private=await detalhar(requests[0].id,marli,db)
            for field in ("segundos_produtivos_autorizados","responsavel_envoxer_id","atendido_por_envoxer_id","valor","custo"):
                self.assertNotIn(field,private)
            self.assertEqual(private["briefing"]["apoio_envox"],"Arte")
            self.assertEqual(private["briefing"]["campos_customizados"],{"tema":"evento"})
            for internal in ("valor_interno","responsavel_envoxer_id","custo_interno"):
                self.assertNotIn(internal,str(private))
            def novo(**kw):
                return SolicitacaoNova(
                  unidade_id=kw.get("unidade_id"),frente_id=kw.get("frente_id"),
                  tipo="evento",titulo="Novo pedido fictício",
                  descricao="Briefing inteiramente fictício para teste",
                  prazo_solicitado=date(2026,12,20),apoio_envox="Arte de teste")
            pedido_frente=await criar(novo(frente_id=med.id),joao,db)
            self.assertIsNone(pedido_frente["unidade_id"])
            self.assertEqual(pedido_frente["frente_id"],med.id)
            with self.assertRaises(HTTPException) as err:
                await criar(novo(),joao,db)
            self.assertEqual(err.exception.status_code,422)
            with self.assertRaises(HTTPException) as err:
                await criar(novo(unidade_id=londrina.id),joao,db)
            self.assertEqual(err.exception.status_code,403)
            with self.assertRaises(HTTPException) as err:
                await criar(novo(unidade_id=maringa.id,frente_id=med.id),marli,db)
            self.assertEqual(err.exception.status_code,403)
            await db.rollback()


if __name__=="__main__":
    unittest.main()
