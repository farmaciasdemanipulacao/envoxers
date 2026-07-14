"""Teste de integração do Portal do Cliente — Módulo A (D-075) — roda contra o
Postgres real, chamando a lógica das rotas diretamente (sem HTTP/JWT). Cria e
depois apaga o próprio ClienteContato de teste.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/backend/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_cliente_contato.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.core.security import decode_access_token  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.cliente_contato import ClienteContato  # noqa: E402
from app.api.routes.cliente_contatos import criar_contato, atualizar_contato, reenviar_link  # noqa: E402
from app.api.routes.portal_auth import definir_senha, login, me  # noqa: E402
from app.api.deps import get_current_cliente_contato  # noqa: E402
from app.schemas.cliente_contato import ClienteContatoCreate, ClienteContatoUpdate, PortalSetSenhaRequest, PortalLoginRequest  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        cliente = (await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None)).limit(1))).scalar_one_or_none()
        assert cliente, "precisa de pelo menos 1 cliente ativo no banco pra rodar o teste"
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin, "precisa de 1 admin ativo"
        print(f"Usando cliente={cliente.nome!r}, admin={admin.nome!r}")

        email_teste = "contato.teste.check@clienteteste.com.br"
        await db.execute(delete(ClienteContato).where(ClienteContato.email == email_teste))
        await db.commit()

        # 1) criar contato — gera link de definição de senha
        resp = await criar_contato(
            cliente.id, ClienteContatoCreate(nome="Contato Teste", cargo="Marketing", email=email_teste), db, admin,
        )
        await assert_true(resp.id is not None, "contato criado com id")
        await assert_true(not resp.senha_definida, "senha ainda não definida ao criar")
        await assert_true(resp.link_definicao_senha.startswith("/portal/definir-senha?token="), "link de definição gerado")
        token = resp.link_definicao_senha.split("token=")[1]
        contato_id = resp.id

        # 2) e-mail duplicado deve ser rejeitado (409)
        try:
            await criar_contato(cliente.id, ClienteContatoCreate(nome="Outro", email=email_teste), db, admin)
            raise AssertionError("FALHOU: deveria rejeitar e-mail duplicado")
        except HTTPException as e:
            await assert_true(e.status_code == 409, "e-mail duplicado rejeitado (409)")

        # 3) token inválido rejeitado
        try:
            await definir_senha(PortalSetSenhaRequest(token="token-invalido-xyz", senha="SenhaForte123"), db)
            raise AssertionError("FALHOU: deveria rejeitar token inválido")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "token inválido rejeitado")

        # 4) senha curta rejeitada
        try:
            await definir_senha(PortalSetSenhaRequest(token=token, senha="123"), db)
            raise AssertionError("FALHOU: deveria rejeitar senha curta")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "senha curta rejeitada")

        # 5) definir senha com token válido
        await definir_senha(PortalSetSenhaRequest(token=token, senha="SenhaForte123"), db)
        await db.refresh((await db.execute(select(ClienteContato).where(ClienteContato.id == contato_id))).scalar_one())
        contato_db = (await db.execute(select(ClienteContato).where(ClienteContato.id == contato_id))).scalar_one()
        await assert_true(contato_db.senha_hash is not None, "senha_hash gravado após definir-senha")
        await assert_true(contato_db.set_senha_token is None, "token consumido (limpo) após uso")

        # 6) reusar o mesmo token depois de consumido deve falhar
        try:
            await definir_senha(PortalSetSenhaRequest(token=token, senha="OutraSenha123"), db)
            raise AssertionError("FALHOU: token consumido não deveria funcionar de novo")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "token consumido rejeitado numa 2ª tentativa")

        # 7) login com senha errada
        try:
            await login(PortalLoginRequest(email=email_teste, senha="SenhaErrada"), db)
            raise AssertionError("FALHOU: deveria rejeitar senha errada")
        except HTTPException as e:
            await assert_true(e.status_code == 401, "senha errada rejeitada no login")

        # 8) login correto — gera token JWT com tipo=cliente_contato
        token_resp = await login(PortalLoginRequest(email=email_teste, senha="SenhaForte123"), db)
        await assert_true(token_resp.cliente_id == cliente.id, "login retorna cliente correto")
        payload = decode_access_token(token_resp.access_token)
        await assert_true(payload.get("tipo") == "cliente_contato", "JWT do portal carrega tipo=cliente_contato")
        await assert_true(str(payload.get("sub")) == str(contato_id), "JWT do portal aponta pro contato certo")

        # 9) get_current_cliente_contato resolve o contato a partir do token
        contato_resolvido = await get_current_cliente_contato(token_resp.access_token, db)
        await assert_true(contato_resolvido.id == contato_id, "dependency get_current_cliente_contato resolve o contato certo")

        # 10) endpoint /me
        me_resp = await me(contato_resolvido, db)
        await assert_true(me_resp.cliente_nome == cliente.nome, "/portal/auth/me retorna o cliente certo")

        # 11) desativar contato via PATCH e confirmar bloqueio de login
        await atualizar_contato(cliente.id, contato_id, ClienteContatoUpdate(ativo=False), db, admin)
        try:
            await login(PortalLoginRequest(email=email_teste, senha="SenhaForte123"), db)
            raise AssertionError("FALHOU: contato inativo não deveria logar")
        except HTTPException as e:
            await assert_true(e.status_code == 403, "contato desativado não consegue logar (403)")

        # reativa e testa reenvio de link
        await atualizar_contato(cliente.id, contato_id, ClienteContatoUpdate(ativo=True), db, admin)
        resp2 = await reenviar_link(cliente.id, contato_id, db, admin)
        await assert_true(resp2.link_definicao_senha.split("token=")[1] != token, "reenviar-link gera um token novo")

        # limpeza
        await db.execute(delete(ClienteContato).where(ClienteContato.id == contato_id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
