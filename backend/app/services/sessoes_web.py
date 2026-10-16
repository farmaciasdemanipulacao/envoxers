"""Sessões de navegador: JWT curto + revogação server-side."""
from datetime import datetime, timedelta, timezone
import secrets
from fastapi import HTTPException
from app.core.security import create_access_token
from app.models.sessao_web import SessaoWeb

def utcnow():
    return datetime.now(timezone.utc)

async def gerar_sessao(db, usuario, request, modo="rapido", minutos=120):
    if modo == "rapido":
        if minutos not in (30, 120, 480):
            raise HTTPException(422, "Duração inválida")
    elif modo == "web":
        minutos = 480
    elif modo == "desktop":
        # Sessão revogável para manter o aplicativo ativo entre reinicializações.
        minutos = 7 * 24 * 60
    elif modo == "normal":
        from app.core.config import settings
        minutos = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    else:
        raise HTTPException(422, "Modalidade inválida")
    sid = secrets.token_urlsafe(24)
    s = SessaoWeb(
        id=sid, envoxer_id=usuario.id, modo=modo, ultimo_acesso=utcnow(),
        expira_em=utcnow()+timedelta(minutes=minutos),
        ip=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:300],
    )
    db.add(s)
    jwt = create_access_token(
        {"sub": str(usuario.id), "tipo":"envoxer", "sid":sid, "modo":modo},
        expires_delta=timedelta(minutes=minutos),
    )
    return jwt

def valida_sessao(s, now=None):
    now = now or utcnow()
    if s is None or s.revogado_em is not None or s.expira_em <= now:
        return False
    return s.modo != "rapido" or now-s.ultimo_acesso <= timedelta(minutes=15)
