"""Teste de integração: presença (ativo/ausente/offline) no chat_ws_manager —
sem depender de WebSocket de rede nem de conta real no banco, chamando o
manager em memória direto (mesmo espírito de check_item_escopo.py, mas aqui
nem precisa de Postgres: presença é 100% em memória do processo). Usa ids
fake (9001/9002) só pra este teste, sem tocar em dado nenhum do banco.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal
só por consistência de imagem — este script em si não bate no Postgres):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/check_presenca.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from app.services.chat_ws_manager import chat_ws_manager as manager  # noqa: E402
from app.api.routes.chat import obter_presenca  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


class FakeWs:
    def __init__(self, nome):
        self.nome = nome
        self.recebidos = []

    async def send_json(self, payload):
        self.recebidos.append(payload)

    async def accept(self):
        pass


async def main():
    # Usa o singleton de verdade (mesmo que `routes/chat.py::obter_presenca` importa)
    # — mas este script roda num processo Python isolado via `docker run --rm`,
    # nunca o processo do backend em produção, então não há conexão de verdade
    # nenhuma pra colidir: o singleton nasce vazio aqui.
    A, B = 9001, 9002
    wsA, wsB = FakeWs("A"), FakeWs("B")

    await manager.conectar(A, wsA)
    await assert_true(manager.status_de(A) == "ausente", "A conectado sem visibilidade ainda = ausente")

    await manager.conectar(B, wsB)
    ultimo_de_A_sobre_B = wsA.recebidos[-1]
    await assert_true(
        ultimo_de_A_sobre_B == {"tipo": "presenca", "envoxer_id": B, "status": "ausente"},
        "A recebe via broadcast que B conectou (ausente, sem visibilidade ainda)",
    )

    await manager.marcar_visibilidade(B, wsB, True)
    await assert_true(manager.status_de(B) == "ativo", "B com aba em primeiro plano = ativo")
    await assert_true(
        wsA.recebidos[-1] == {"tipo": "presenca", "envoxer_id": B, "status": "ativo"},
        "A recebe a atualização de B pra ativo em tempo real",
    )

    await manager.marcar_visibilidade(B, wsB, False)
    await assert_true(manager.status_de(B) == "ausente", "B minimizou/trocou de aba = ausente (não offline, ainda conectado)")

    snapshot = manager.snapshot_presenca()
    await assert_true(snapshot == {A: "ausente", B: "ausente"}, f"snapshot bate com os 2 conectados: {snapshot}")

    admin_fake = Envoxer(permissao="admin")  # não persistido — a rota só repassa pro manager
    resp = await obter_presenca(admin_fake)
    await assert_true(resp == snapshot, "GET /chat/presenca retorna o mesmo snapshot do manager")

    await manager.desconectar(B, wsB)
    await assert_true(manager.status_de(B) == "offline", "B desconectou = offline")
    await assert_true(B not in manager.snapshot_presenca(), "B sai do snapshot depois de desconectar")
    await assert_true(
        wsA.recebidos[-1] == {"tipo": "presenca", "envoxer_id": B, "status": "offline"},
        "A recebe o aviso de que B ficou offline",
    )

    await manager.desconectar(A, wsA)
    await assert_true(manager.snapshot_presenca() == {}, "snapshot vazio depois de todo mundo desconectar")

    print("\nTodos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
