"""Teste de integração: "Acessar como" — admin acessa a conta de outro envoxer
sem senha, sem sair da própria conta (pedido do Gus). Roda contra o Postgres
real, chamando a rota via HTTP direto no backend (porta interna 8000, sem
depender de nginx nem de senha de login real — só o endpoint novo, que não
precisa de credencial nenhuma pra ser exercitado no teste, o próprio admin
seed é usado só como ponto de partida em memória). Cria e apaga sua própria
conta de teste (gestor) e limpa o ImpersonacaoLog gerado.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/check_impersonacao.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from fastapi import Request  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.impersonacao_log import ImpersonacaoLog  # noqa: E402
from app.core.security import hash_password, decode_access_token  # noqa: E402
from app.api.routes.envoxers import impersonar_envoxer  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


class FakeClient:
    host = "127.0.0.1"


class FakeRequest:
    client = FakeClient()
    headers = {"user-agent": "check_impersonacao.py"}


async def main():
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin, "precisa de 1 admin ativo"

        gestor_teste = Envoxer(
            nome="[TESTE RBAC] Gestor Impersonado", email="teste.rbac.impersonar@seedtest.envox.com.br",
            cargo="Teste", senha_hash=hash_password("x"), permissao="gestor", horas_mes=220, custo_hora=0,
        )
        db.add(gestor_teste)
        await db.flush()
        print(f"Gestor de teste criado id={gestor_teste.id}")

        # 1) admin acessa a conta do gestor de teste
        token_resp = await impersonar_envoxer(gestor_teste.id, FakeRequest(), "token-fake-sem-imp-by", db, admin)
        await assert_true(token_resp.id == gestor_teste.id and token_resp.nome == gestor_teste.nome, "token retornado é da conta do gestor")
        payload = decode_access_token(token_resp.access_token)
        await assert_true(payload["sub"] == str(gestor_teste.id) and payload["imp_by"] == admin.id, "JWT tem sub do gestor + imp_by do admin real")

        # 2) log de auditoria gravado
        log_result = await db.execute(select(ImpersonacaoLog).where(ImpersonacaoLog.envoxer_id == gestor_teste.id))
        log = log_result.scalar_one_or_none()
        await assert_true(log is not None and log.admin_id == admin.id and log.ip == "127.0.0.1", "ImpersonacaoLog gravado com admin/ip corretos")

        # 3) não dá pra impersonar de novo usando o token JÁ impersonado (bloqueia encadeamento)
        try:
            await impersonar_envoxer(admin.id, FakeRequest(), token_resp.access_token, db, admin)
            raise AssertionError("FALHOU: deveria ter bloqueado encadeamento de impersonação")
        except HTTPException as e:
            await assert_true(e.status_code == 403, "encadear impersonação (token com imp_by) é bloqueado com 403")

        # 4) não dá pra impersonar outro admin
        try:
            await impersonar_envoxer(admin.id, FakeRequest(), "token-fake-sem-imp-by", db, admin)
            raise AssertionError("FALHOU: deveria ter bloqueado impersonar a si mesmo")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "impersonar a própria conta é bloqueado com 400")

        # limpeza
        await db.execute(delete(ImpersonacaoLog).where(ImpersonacaoLog.envoxer_id == gestor_teste.id))
        await db.execute(delete(Envoxer).where(Envoxer.id == gestor_teste.id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
