"""Gerenciador de conexões WebSocket do chat — em memória, um processo backend só.

O WS só empurra eventos (mensagem_nova); enviar mensagem continua sendo via POST REST,
que persiste e depois chama broadcast_mensagem daqui. Evita duplicar validação de
conteúdo dentro do protocolo WS.
"""
from typing import Optional

from fastapi import WebSocket


class ChatConnectionManager:
    def __init__(self):
        self._conexoes: dict[int, set[WebSocket]] = {}
        # Conexões cuja aba está em primeiro plano no momento (subset de _conexoes).
        # O WS é global (aberto assim que o app loga, não só na tela de Chat), então
        # "conectado" sozinho não diz se o envoxer realmente veria a mensagem — só
        # "visível" diz isso.
        self._visiveis: dict[int, set[WebSocket]] = {}

    async def conectar(self, envoxer_id: int, ws: WebSocket):
        await ws.accept()
        self._conexoes.setdefault(envoxer_id, set()).add(ws)

    def marcar_visibilidade(self, envoxer_id: int, ws: WebSocket, visivel: bool):
        if visivel:
            self._visiveis.setdefault(envoxer_id, set()).add(ws)
        else:
            visiveis = self._visiveis.get(envoxer_id)
            if visiveis:
                visiveis.discard(ws)
                if not visiveis:
                    self._visiveis.pop(envoxer_id, None)

    def esta_visivel(self, envoxer_id: int) -> bool:
        """Usado pra decidir quem recebe push de mensagem nova — quem está com alguma
        aba em primeiro plano não precisa de notificação, só quem está com o app
        fechado/minimizado/em outra aba."""
        return bool(self._visiveis.get(envoxer_id))

    def desconectar(self, envoxer_id: int, ws: WebSocket):
        conexoes = self._conexoes.get(envoxer_id)
        if conexoes:
            conexoes.discard(ws)
            if not conexoes:
                self._conexoes.pop(envoxer_id, None)
        self.marcar_visibilidade(envoxer_id, ws, False)

    async def _enviar_para(self, envoxer_id: int, payload: dict):
        mortas = []
        for ws in self._conexoes.get(envoxer_id, ()):
            try:
                await ws.send_json(payload)
            except Exception:
                mortas.append(ws)
        for ws in mortas:
            self.desconectar(envoxer_id, ws)

    async def broadcast_geral_ou_cliente(self, envoxer_ids_ativos: list[int], payload: dict):
        for envoxer_id in envoxer_ids_ativos:
            await self._enviar_para(envoxer_id, payload)

    async def broadcast_dm(self, envoxer_a_id: int, envoxer_b_id: int, payload: dict):
        await self._enviar_para(envoxer_a_id, payload)
        await self._enviar_para(envoxer_b_id, payload)


chat_ws_manager = ChatConnectionManager()
