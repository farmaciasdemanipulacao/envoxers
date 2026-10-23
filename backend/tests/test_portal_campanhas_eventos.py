"""Campaigns/events are metadata on canonical Solicitacao + Evento, not duplicate Kanban."""
import unittest
from datetime import date
from fastapi import HTTPException
from pydantic import ValidationError
from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalContatoUnidade, PortalUnidade
from app.api.routes.portal_operacao import (
    CampanhaNova, EventoNovo, SolicitacaoNova, listar_campanhas, listar_eventos_portal,
    criar_campanha, criar_evento_portal, criar, listar, detalhar,
)
class CampanhasEventosTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await engine.dispose()

    async def test_campaign_event_foreign_ids_explicit_none_and_tenant_scope(self):
        async with AsyncSessionLocal() as db:
            a=Cliente(nome="Cliente fictício Campanhas A")
            b=Cliente(nome="Cliente fictício Campanhas B")
            db.add_all([a,b]);await db.flush()
            alfa=PortalUnidade(cliente_id=a.id,nome="Maringá",tipo="regional")
            beta=PortalUnidade(cliente_id=a.id,nome="Londrina",tipo="regional")
            frente=PortalUnidade(cliente_id=a.id,nome="Secovimed",tipo="frente")
            externo=PortalUnidade(cliente_id=b.id,nome="Região externa",tipo="regional")
            db.add_all([alfa,beta,frente,externo]);await db.flush()
            admin=ClienteContato(cliente_id=a.id,nome="Admin",email="camp-admin@example.invalid",portal_papel="admin_institucional")
            marli=ClienteContato(cliente_id=a.id,nome="Marli",email="camp-marli@example.invalid",portal_papel="solicitante")
            maria=ClienteContato(cliente_id=a.id,nome="Maria",email="camp-maria@example.invalid",portal_papel="solicitante")
            joao=ClienteContato(cliente_id=a.id,nome="João",email="camp-joao@example.invalid",portal_papel="solicitante")
            other=ClienteContato(cliente_id=b.id,nome="Outro",email="camp-other@example.invalid",portal_papel="solicitante")
            db.add_all([admin,marli,maria,joao,other]);await db.flush()
            db.add_all([
                PortalContatoUnidade(contato_id=marli.id,unidade_id=alfa.id),
                PortalContatoUnidade(contato_id=maria.id,unidade_id=beta.id),
                PortalContatoUnidade(contato_id=joao.id,unidade_id=frente.id),
                PortalContatoUnidade(contato_id=other.id,unidade_id=externo.id),
            ]);await db.flush()
            camp=await criar_campanha(CampanhaNova(nome="Outubro Rosa",unidade_id=alfa.id),marli,db)
            evt=await criar_evento_portal(EventoNovo(nome="Café com Conhecimento",data=date(2026,11,4),unidade_id=alfa.id),marli,db)
            self.assertEqual(len(await listar_campanhas(marli,db)),1)
            self.assertEqual(len(await listar_eventos_portal(marli,db)),1)
            self.assertEqual(await listar_campanhas(maria,db),[])
            self.assertEqual(await listar_eventos_portal(maria,db),[])
            self.assertEqual(len(await listar_campanhas(admin,db)),1)
            def novo(**kw):
                return SolicitacaoNova(
                    unidade_id=kw.get("unidade_id",alfa.id),frente_id=kw.get("frente_id"),
                    campanha_id=kw.get("campanha_id"),evento_id=kw.get("evento_id"),
                    tipo="novo_post",titulo="Criação de arte para ação de teste",
                    descricao="Conteúdo completamente fictício de homologação",
                    prazo_solicitado=date(2026,12,15),apoio_envox="Design",
                )
            solicit=await criar(novo(campanha_id=camp["id"],evento_id=evt["id"]),marli,db)
            self.assertEqual((await detalhar(solic["id"],marli,db))["campanha_id"],camp["id"])
            self.assertEqual((await detalhar(solic["id"],marli,db))["evento_id"],evt["id"])
            self.assertEqual((await listar_campanhas(marli,db))[0]["total_solicitacoes"],1)
            self.assertEqual((await listar_eventos_portal(marli,db))[0]["total_solicitacoes"],1)
            standalone=await criar(novo(campanha_id=None,evento_id=None),marli,db)
            self.assertIsNone(standalone["campanha_id"])
            self.assertIsNone(standalone["evento_id"])
            for payload in [
               dict(campanha_id=camp["id"],evento_id=evt["id"],unidade_id=beta.id),
               dict(campanha_id=camp["id"],evento_id=evt["id"],unidade_id=externo.id),
            ]:
                with self.assertRaises(HTTPException):
                    await criar(novo(**payload),maria,db)
            with self.assertRaises(HTTPException):
                await criar(novo(unidade_id=beta.id,campanha_id=camp["id"]),maria,db)
            with self.assertRaises(HTTPException):
                await criar(novo(unidade_id=alfa.id,evento_id=evt["id"]),maria,db)
            with self.assertRaises(HTTPException):
                await criar_campanha(CampanhaNova(nome="Inválida",unidade_id=beta.id),marli,db)
            self.assertEqual(await listar_campanhas(other,db),[])
            front_event=await criar_evento_portal(EventoNovo(nome="Ação do Secovimed",data=date(2026,11,20),frente_id=frente.id),joao,db)
            front_campaign=await criar_campanha(CampanhaNova(nome="Campanha Secovimed",frente_id=frente.id),joao,db)
            self.assertEqual((await criar(novo(unidade_id=None,frente_id=frente.id,campanha_id=front_campaign["id"],evento_id=front_event["id"]),joao,db))["frente_id"],frente.id)
            with self.assertRaises(ValidationError):
                SolicitacaoNova(tipo="novo_post",titulo="Três palavras",descricao="Descrição de teste maior que dez",prazo_solicitado=date(2026,12,15),apoio_envox="Artes")
            await db.rollback()

if __name__=="__main__":
    unittest.main()
