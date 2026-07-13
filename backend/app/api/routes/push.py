"""Endpoints de Web Push — vapid-public-key, subscribe, unsubscribe, test."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.db.session import get_db
from app.api.deps import get_current_envoxer
from app.models.envoxer import Envoxer
from app.models.push_subscription import PushSubscription
from app.core.config import settings

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str = ""


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Retorna a chave pública VAPID para o frontend montar a subscription."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push não configurado no servidor")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
async def subscribe(
    payload: SubscribeRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Registra (ou atualiza) uma subscription de push para o envoxer autenticado."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.envoxer_id == envoxer.id,
        )
    )
    sub = result.scalar_one_or_none()
    ua = payload.user_agent or request.headers.get("user-agent", "")[:500]

    if sub:
        sub.p256dh = payload.p256dh
        sub.auth = payload.auth
        sub.user_agent = ua
    else:
        db.add(PushSubscription(
            envoxer_id=envoxer.id, endpoint=payload.endpoint,
            p256dh=payload.p256dh, auth=payload.auth, user_agent=ua,
        ))

    await db.commit()
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
async def unsubscribe(
    payload: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Remove a subscription do envoxer autenticado."""
    endpoint = payload.get("endpoint", "")
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.envoxer_id == envoxer.id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await db.commit()
    return {"status": "unsubscribed"}


@router.post("/test")
async def test_push(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Envia uma push de teste para o envoxer autenticado (usado no botão de teste do perfil)."""
    from app.services.push import broadcast_push

    sent = await broadcast_push(
        db=db, envoxer_id=envoxer.id,
        title="Envoxers", body="Notificações ativas! Você vai receber alertas de farol e chat aqui.",
        tag="envoxers-test",
    )
    if sent == 0:
        raise HTTPException(status_code=404, detail="Nenhuma subscription ativa encontrada")
    return {"sent": sent}
