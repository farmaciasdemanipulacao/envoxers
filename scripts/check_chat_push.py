"""Teste de integração: push de chat pro canal geral/cliente (D-115) — antes só
DM disparava notificação. Roda contra o Postgres real, chamando a rota direto
(mesmo padrão de check_impersonacao.py). Usa um canal de CLIENTE de teste (não o
canal "geral" de verdade) pra nunca poluir o chat real da empresa — cria e apaga
tudo que gera (cliente/canal/mensagem/envoxers de teste).

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/check_chat_push.py
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.chat_canal import ChatCanal  # noqa: E402
from app.models.chat_mensagem import ChatMensagem  # noqa: E402
from app.models.alerta_config import AlertaConfig  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.schemas.chat import ChatMensagemCreate  # noqa: E402
from app.api.routes.chat import enviar_mensagem  # noqa: E402
from app.services.chat_ws_manager import chat_ws_manager  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        # 1) catálogo de alertas tem "chat_geral" (seed idempotente por chave, D-115)
        config_result = await db.execute(select(AlertaConfig).where(AlertaConfig.chave == "chat_geral"))
        config_geral = config_result.scalar_one_or_none()
        await assert_true(config_geral is not None, "AlertaConfig 'chat_geral' existe (seed idempotente por chave rodou)")
        await assert_true(config_geral.ativo is True, "'chat_geral' nasce ativo por padrão")

        remetente = Envoxer(
            nome="[TESTE D-115] Remetente", email="teste.d115.remetente@seedtest.envox.com.br",
            cargo="Teste", senha_hash=hash_password("x"), permissao="envoxer", horas_mes=220, custo_hora=0,
        )
        ausente = Envoxer(
            nome="[TESTE D-115] Ausente", email="teste.d115.ausente@seedtest.envox.com.br",
            cargo="Teste", senha_hash=hash_password("x"), permissao="envoxer", horas_mes=220, custo_hora=0,
        )
        visivel = Envoxer(
            nome="[TESTE D-115] Visivel", email="teste.d115.visivel@seedtest.envox.com.br",
            cargo="Teste", senha_hash=hash_password("x"), permissao="envoxer", horas_mes=220, custo_hora=0,
        )
        cliente_teste = Cliente(nome="[TESTE D-115] Cliente Chat", segmento="Teste", valor_contrato=1000, tipo_receita="recorrente", ativo=True)
        db.add_all([remetente, ausente, visivel, cliente_teste])
        await db.flush()
        print(f"Envoxers de teste: remetente={remetente.id} ausente={ausente.id} visivel={visivel.id}, cliente={cliente_teste.id}")

        canal = ChatCanal(tipo="cliente", cliente_id=cliente_teste.id)
        db.add(canal)
        await db.flush()

        # "visivel" está com a aba em primeiro plano + foco (simulado direto no manager
        # em memória, sem precisar de WebSocket real)
        chat_ws_manager._visiveis[visivel.id] = {object()}

        try:
            with patch("app.services.push.broadcast_push", new_callable=AsyncMock) as mock_push:
                await enviar_mensagem(
                    canal.id, ChatMensagemCreate(texto="mensagem de teste D-115"), remetente, db,
                )
                destinatarios_notificados = {call.args[1] for call in mock_push.call_args_list}
                await assert_true(ausente.id in destinatarios_notificados, "envoxer 'ausente' (não visível) recebe push")
                await assert_true(visivel.id not in destinatarios_notificados, "envoxer 'visivel' (aba em primeiro plano+foco) NÃO recebe push")
                await assert_true(remetente.id not in destinatarios_notificados, "o próprio remetente nunca recebe push da própria mensagem")

            # 2) toggle desligado — admin desativou "chat_geral", ninguém recebe push
            config_geral.ativo = False
            await db.flush()
            with patch("app.services.push.broadcast_push", new_callable=AsyncMock) as mock_push:
                await enviar_mensagem(
                    canal.id, ChatMensagemCreate(texto="segunda mensagem, toggle off"), remetente, db,
                )
                await assert_true(mock_push.call_count == 0, "com 'chat_geral' desativado, nenhum push é disparado")
            config_geral.ativo = True
            await db.flush()

        finally:
            chat_ws_manager._visiveis.pop(visivel.id, None)

        # limpeza
        await db.execute(delete(ChatMensagem).where(ChatMensagem.canal_id == canal.id))
        await db.execute(delete(ChatCanal).where(ChatCanal.id == canal.id))
        await db.execute(delete(Envoxer).where(Envoxer.id.in_([remetente.id, ausente.id, visivel.id])))
        await db.execute(delete(Cliente).where(Cliente.id == cliente_teste.id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
