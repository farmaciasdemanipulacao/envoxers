"""Serviço de Web Push Notifications — mesmo mecanismo do ATENX (VAPID), adaptado
ao Envoxers: sem campanhas/admin, só envio direto disparado por eventos do sistema
(alerta de farol piorando, mensagem de chat pra quem está offline).
"""
import json
from typing import Optional

import structlog

from app.core.config import settings

logger = structlog.get_logger()


def _get_vapid_claims():
    return {"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"}


async def send_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    title: str,
    body: str,
    tag: str = "envoxers",
) -> tuple[bool, Optional[str]]:
    """Envia uma Web Push notification para uma subscription específica. Retorna (sucesso, erro)."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("push_skipped_no_vapid")
        return False, "VAPID não configurado no servidor"

    try:
        from pywebpush import webpush

        payload = json.dumps({"title": title, "body": body, "tag": tag})

        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=_get_vapid_claims(),
        )
        logger.info("push_sent", endpoint=endpoint[:60], title=title)
        return True, None

    except Exception as exc:
        logger.error("push_failed", error=str(exc)[:200], endpoint=endpoint[:60])
        return False, str(exc)[:500]


async def broadcast_push(db, envoxer_id: int, title: str, body: str, tag: str = "envoxers") -> int:
    """Envia push para todas as subscriptions ativas de um envoxer. Remove subscriptions
    mortas (endpoint que o browser não reconhece mais). Retorna nº de envios com sucesso."""
    from sqlalchemy import select, delete
    from app.models.push_subscription import PushSubscription

    result = await db.execute(select(PushSubscription).where(PushSubscription.envoxer_id == envoxer_id))
    subscriptions = result.scalars().all()
    if not subscriptions:
        return 0

    count = 0
    dead_ids = []
    for sub in subscriptions:
        ok, _error = await send_push(
            endpoint=sub.endpoint, p256dh=sub.p256dh, auth=sub.auth, title=title, body=body, tag=tag,
        )
        if ok:
            count += 1
        else:
            dead_ids.append(sub.id)

    if dead_ids:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead_ids)))
        await db.commit()
        logger.info("push_dead_subscriptions_removed", count=len(dead_ids))

    return count


async def broadcast_push_para_muitos(db, envoxer_ids: list[int], title: str, body: str, tag: str = "envoxers") -> int:
    """Atalho pra disparar broadcast_push pra vários envoxers de uma vez (ex.: todos os
    admins/gestores num alerta de farol, ou os participantes de um canal de chat)."""
    total = 0
    for envoxer_id in envoxer_ids:
        total += await broadcast_push(db, envoxer_id, title, body, tag)
    return total
