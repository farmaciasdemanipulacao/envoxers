"""Regressões de segurança: opt-in, revogação JWT e documentos por módulo.

Banco PostgreSQL isolado do staging; fixtures só em transação revertida.
Nenhuma conta real, email real nem requisição externa.
"""
import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.api.deps import get_current_cliente_contato
from app.api.routes.portal_auth import definir_senha, login
from app.api.routes.portal_documentos import documentos_habilitados, listar_documentos_portal
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.models.portal_operacao import PortalClienteConfig
from app.schemas.cliente_contato import PortalSetSenhaRequest, PortalLoginRequest


class PortalExternalAccessSecurityTest(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await engine.dispose()

    async def test_opt_in_session_revocation_and_document_access(self):
        async with AsyncSessionLocal() as db:
            company_a=Cliente(nome="Tenant fictício A")
            company_b=Cliente(nome="Tenant fictício B")
            db.add_all([company_a, company_b])
            await db.flush()
            pwd="senha-ficticia-melhor-que-12-chars"
            a=ClienteContato(cliente_id=company_a.id,nome="A",email="sec-tenant-a@example.com",
                             senha_hash=hash_password(pwd),ativo=True,
                             set_senha_token="token-ficticio-a",
                             set_senha_token_expira=datetime.now(timezone.utc)+timedelta(days=1))
            b=ClienteContato(cliente_id=company_b.id,nome="B",email="sec-tenant-b@example.com",
                             senha_hash=hash_password(pwd),ativo=True,
                             set_senha_token="token-ficticio-b",
                             set_senha_token_expira=datetime.now(timezone.utc)+timedelta(days=1))
            db.add_all([a,b]);await db.flush()
            # Sem configuração = fechado, mesmo com senha correta.
            with self.assertRaises(HTTPException) as err:
                await login(PortalLoginRequest(email=a.email,senha=pwd),db)
            self.assertEqual(err.exception.status_code,403)
            with self.assertRaises(HTTPException) as err:
                await definir_senha(PortalSetSenhaRequest(token="token-ficticio-a",senha=pwd),db)
            self.assertEqual(err.exception.status_code,400)

            cb=PortalClienteConfig(cliente_id=company_b.id,habilitado=True,
                                    modulos={"solicitacoes":True,"documentos":False})
            db.add(cb);await db.flush()
            session=await login(PortalLoginRequest(email=b.email,senha=pwd),db)
            self.assertIs(await get_current_cliente_contato(session.access_token,db),b)
            with self.assertRaises(HTTPException) as err:
                await documentos_habilitados(b,db)
            self.assertEqual(err.exception.status_code,403)

            # A alteração de apenas um módulo não deve interromper login/solicitações.
            cb.modulos={"solicitacoes":True,"documentos":True}
            await db.flush()
            self.assertIs(await documentos_habilitados(b,db),b)
            self.assertEqual(await listar_documentos_portal(b,db),[])

            # Kill switch: um token já emitido perde o acesso imediatamente.
            cb.habilitado=False
            await db.flush()
            with self.assertRaises(HTTPException) as err:
                await get_current_cliente_contato(session.access_token,db)
            self.assertEqual(err.exception.status_code,401)
            with self.assertRaises(HTTPException) as err:
                await login(PortalLoginRequest(email=b.email,senha=pwd),db)
            self.assertEqual(err.exception.status_code,403)
            with self.assertRaises(HTTPException) as err:
                await definir_senha(PortalSetSenhaRequest(token="token-ficticio-b",senha=pwd),db)
            self.assertEqual(err.exception.status_code,400)

            # A configuração de B jamais ativa A.
            cb.habilitado=True
            await db.flush()
            self.assertIs(await get_current_cliente_contato(session.access_token,db),b)
            with self.assertRaises(HTTPException) as err:
                await login(PortalLoginRequest(email=a.email,senha=pwd),db)
            self.assertEqual(err.exception.status_code,403)
            await db.rollback()


if __name__ == "__main__":
    unittest.main()
