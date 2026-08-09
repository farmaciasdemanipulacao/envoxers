"""Teste de integração: onboarding obrigatório (D-114) — histórico de acessos
(login = acesso, independente do timer de Foco) + status de instalação do app
e notificações pro admin. Roda contra o Postgres real, chamando as rotas
diretamente (mesmo padrão de check_impersonacao.py — sem HTTP/senha real).
Cria e apaga sua própria conta de teste (gestor) e tudo que ela gera.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/check_acessos.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.acesso_log import AcessoLog  # noqa: E402
from app.models.push_subscription import PushSubscription  # noqa: E402
from app.core.security import hash_password, verify_password  # noqa: E402
from app.schemas.auth import LoginRequest  # noqa: E402
from app.api.routes.auth import login  # noqa: E402
from app.api.routes.envoxers import marcar_app_instalado  # noqa: E402
from app.api.routes.acessos import listar_acessos, listar_status_dispositivos  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


class FakeClient:
    host = "203.0.113.42"


class FakeRequest:
    client = FakeClient()
    headers = {"user-agent": "check_acessos.py/1.0"}


EMAIL_TESTE = "teste.acessos.d114@seedtest.envox.com.br"
SENHA_TESTE = "SenhaTeste123!"


async def main():
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin, "precisa de 1 admin ativo"

        gestor_teste = Envoxer(
            nome="[TESTE D-114] Gestor Acessos", email=EMAIL_TESTE,
            cargo="Teste", senha_hash=hash_password(SENHA_TESTE), permissao="gestor", horas_mes=220, custo_hora=0,
        )
        db.add(gestor_teste)
        await db.flush()
        print(f"Gestor de teste criado id={gestor_teste.id}")

        # 1) login grava AcessoLog
        payload = LoginRequest(email=EMAIL_TESTE, senha=SENHA_TESTE)
        token_resp = await login(payload, FakeRequest(), db)
        await assert_true(token_resp.id == gestor_teste.id, "login retorna token da conta certa")
        await assert_true(verify_password(SENHA_TESTE, gestor_teste.senha_hash), "senha do teste bate (sanity check)")

        log1 = (await db.execute(select(AcessoLog).where(AcessoLog.envoxer_id == gestor_teste.id))).scalar_one_or_none()
        await assert_true(log1 is not None and log1.ip == "203.0.113.42" and "check_acessos" in log1.user_agent, "AcessoLog gravado com IP/user-agent corretos")

        # login de novo — 2º acesso, histórico acumula (não sobrescreve)
        await login(LoginRequest(email=EMAIL_TESTE, senha=SENHA_TESTE), FakeRequest(), db)
        total_logs = (await db.execute(select(AcessoLog).where(AcessoLog.envoxer_id == gestor_teste.id))).scalars().all()
        await assert_true(len(total_logs) == 2, "2 logins geram 2 linhas de acesso_log (não sobrescreve)")

        # 2) status-instalacao — self-service, idempotente
        await assert_true(gestor_teste.app_instalado is False, "app_instalado começa False")
        resp1 = await marcar_app_instalado(db, gestor_teste)
        await assert_true(gestor_teste.app_instalado is True and gestor_teste.app_instalado_em is not None, "1ª chamada marca app_instalado=True com timestamp")
        primeiro_timestamp = gestor_teste.app_instalado_em

        await marcar_app_instalado(db, gestor_teste)
        await assert_true(gestor_teste.app_instalado_em == primeiro_timestamp, "2ª chamada não sobrescreve o timestamp original (idempotente)")

        # subscription de push pra testar notificacoes_ativas/qtd_dispositivos
        db.add(PushSubscription(
            envoxer_id=gestor_teste.id, endpoint=f"https://fcm.example/test-{gestor_teste.id}",
            p256dh="chave-publica-fake", auth="segredo-fake", user_agent="check_acessos.py",
        ))
        await db.flush()

        # 3) admin/status-dispositivos reflete tudo certo
        status_list = await listar_status_dispositivos(db, admin)
        status_teste = next((s for s in status_list if s.envoxer_id == gestor_teste.id), None)
        await assert_true(status_teste is not None, "gestor de teste aparece em status-dispositivos")
        await assert_true(status_teste.app_instalado is True, "status-dispositivos reporta app_instalado=True")
        await assert_true(status_teste.notificacoes_ativas is True and status_teste.qtd_dispositivos == 1, "status-dispositivos reporta 1 dispositivo com notificação ativa")
        await assert_true(status_teste.ultimo_acesso is not None, "status-dispositivos reporta último acesso (não nulo)")

        # 4) admin/acessos lista o histórico, com filtro por pessoa
        acessos_todos = await listar_acessos(db, admin, envoxer_id=None, limit=200)
        await assert_true(any(a.envoxer_id == gestor_teste.id and a.envoxer_nome == gestor_teste.nome for a in acessos_todos), "histórico geral inclui os acessos do teste, com nome do envoxer via join")

        acessos_filtrados = await listar_acessos(db, admin, envoxer_id=gestor_teste.id, limit=200)
        await assert_true(len(acessos_filtrados) == 2, "filtro por envoxer_id retorna só os 2 acessos do teste")

        # limpeza
        await db.execute(delete(PushSubscription).where(PushSubscription.envoxer_id == gestor_teste.id))
        await db.execute(delete(AcessoLog).where(AcessoLog.envoxer_id == gestor_teste.id))
        await db.execute(delete(Envoxer).where(Envoxer.id == gestor_teste.id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
