"""Avisa o front em tempo real quando uma Tarefa muda — reaproveita o mesmo
WebSocket global do chat (conectado assim que o app loga, não só na tela de
Chat — ver chat_ws_manager.py), só que manda um sinal leve em vez do objeto
inteiro. O front reage recarregando a lista (mesmo `dataVersion` que já existe
pro Kanban/Dashboard depois de salvar, ver tc-app.jsx), sem precisar de F5.

Sem isso, uma mudança causada por automação (ex.: concluir uma Etapa move a
Tarefa de coluna) só aparecia pra quem clicou o botão — o resto do time (e até
o Kanban aberto atrás do próprio card) ficava com a tela desatualizada até dar
refresh manual.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.envoxer import Envoxer
from app.services.chat_ws_manager import chat_ws_manager


async def notificar_tarefa_atualizada(db: AsyncSession, tarefa_id: Optional[int] = None) -> None:
    result = await db.execute(select(Envoxer.id).where(Envoxer.ativo.is_(True)))
    ids_ativos = [row[0] for row in result.all()]
    await chat_ws_manager.broadcast_geral_ou_cliente(
        ids_ativos, {"tipo": "tarefa_atualizada", "tarefa_id": tarefa_id}
    )
