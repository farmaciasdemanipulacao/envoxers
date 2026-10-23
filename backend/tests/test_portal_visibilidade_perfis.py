"""Isolamento institucional/regional das novas consultas externas do Portal."""
import unittest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalUnidade, PortalContatoUnidade, PortalSolicitacaoTarefa
from app.models.solicitacao import Solicitacao
from app.models.tarefa import Tarefa
from app.api.routes.portal_operacao import pessoas_da_instituicao, pendencias_de_validacao

class VisibilidadePerfisTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await engine.dispose()
    async def test_admin_e_aprovador_recebem_apenas_os_proprios_escopos(self):
        async with AsyncSessionLocal() as db:
            a=Cliente(nome="SECOVI fictício 1")
            b=Cliente(nome="Outra empresa fictícia")
            db.add_all([a,b]);await db.flush()
            alfa=PortalUnidade(cliente_id=a.id,nome="Regional Alfa",tipo="regional")
            beta=PortalUnidade(cliente_id=a.id,nome="Regional Beta",tipo="regional")
            fora=PortalUnidade(cliente_id=b.id,nome="Regional Externa",tipo="regional")
            db.add_all([alfa,beta,fora]);await db.flush()
            admin=ClienteContato(cliente_id=a.id,nome="Administrador Institucional",email="admin-visibilidade-a@example.invalid",portal_papel="admin_institucional",ativo=True)
            aprovador=ClienteContato(cliente_id=a.id,nome="Aprovador Regional",email="aprovador-visibilidade-a@example.invalid",portal_papel="aprovador",ativo=True)
            solicitante=ClienteContato(cliente_id=a.id,nome="Solicitante",email="solicitante-visibilidade-a@example.invalid",portal_papel="solicitante",ativo=True)
            externo=ClienteContato(cliente_id=b.id,nome="Pessoa de Outra Empresa",email="externo-visibilidade-b@example.invalid",portal_papel="admin_institucional",ativo=True)
            db.add_all([admin,aprovador,solicitante,externo]);await db.flush()
            db.add(PortalContatoUnidade(contato_id=aprovador.id,unidade_id=alfa.id))
            r1=Solicitacao(cliente_id=a.id,portal_contato_id=solicitante.id,portal_unidade_id=alfa.id,titulo="Aprovação regional Alfa",tipo="evento",descricao="Fictício",solicitante_nome="Solicitante",status="virou_demanda")
            r2=Solicitacao(cliente_id=a.id,portal_contato_id=solicitante.id,portal_unidade_id=beta.id,titulo="Aprovação regional Beta",tipo="evento",descricao="Fictício",solicitante_nome="Solicitante",status="virou_demanda")
            r3=Solicitacao(cliente_id=b.id,portal_contato_id=externo.id,portal_unidade_id=fora.id,titulo="Aprovação externa",tipo="evento",descricao="Fictício",solicitante_nome="Externo",status="virou_demanda")
            db.add_all([r1,r2,r3]);await db.flush()
            t1=Tarefa(cliente_id=a.id,titulo="Tarefa Alfa",status="aprovacao_cliente")
            t2=Tarefa(cliente_id=a.id,titulo="Tarefa Beta",status="aprovacao_cliente")
            t3=Tarefa(cliente_id=b.id,titulo="Tarefa Externa",status="aprovacao_cliente")
            db.add_all([t1,t2,t3]);await db.flush()
            db.add_all([PortalSolicitacaoTarefa(solicitacao_id=r1.id,tarefa_id=t1.id),
                        PortalSolicitacaoTarefa(solicitacao_id=r2.id,tarefa_id=t2.id),
                        PortalSolicitacaoTarefa(solicitacao_id=r3.id,tarefa_id=t3.id)])
            await db.flush()
            roster=await pessoas_da_instituicao(admin,db)
            self.assertEqual(len(roster["pessoas"]),3)
            self.assertNotIn("email",str(roster))
            self.assertNotIn("Pessoa de Outra Empresa",str(roster))
            self.assertEqual(len(roster["regionais"]),2)
            for ator in (aprovador,solicitante):
                with self.assertRaises(HTTPException) as err:
                    await pessoas_da_instituicao(ator,db)
                self.assertEqual(err.exception.status_code,403)
            pend=await pendencias_de_validacao(aprovador,db)
            self.assertEqual([p["titulo"] for p in pend],["Aprovação regional Alfa"])
            self.assertNotIn("Aprovação regional Beta",str(pend))
            self.assertNotIn("Aprovação externa",str(pend))
            with self.assertRaises(HTTPException) as err:
                await pendencias_de_validacao(solicitante,db)
            self.assertEqual(err.exception.status_code,403)
            await db.rollback()
if __name__=="__main__":unittest.main()
