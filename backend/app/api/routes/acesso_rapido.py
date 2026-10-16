"""Acesso rápido e pareamento QR. Nenhuma rota pública entrega token sem senha
válida ou aprovação explícita de um usuário já autenticado."""
from typing import Annotated
from datetime import timedelta
import hashlib
import hmac
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.core.security import decode_access_token, verify_password
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.acesso_log import AcessoLog
from app.models.sessao_web import SessaoWeb, PareamentoWeb
from app.services.sessoes_web import gerar_sessao, utcnow, valida_sessao

router = APIRouter(prefix="/acesso-rapido", tags=["acesso-rapido"])

class Entrar(BaseModel):
    email: EmailStr
    senha: str
    modo: str = "rapido"
    minutos: int = 120

class InicioQR(BaseModel):
    minutos: int = 120

class ConsultaQR(BaseModel):
    segredo: str = Field(min_length=20, max_length=128)

def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def _usuario_resposta(u, token, modo="rapido"):
    return {"access_token": token, "token_type": "bearer", "id": u.id,
            "nome": u.nome, "permissao": u.permissao, "foto_url": u.foto_url, "modo": modo}

def _claims(request):
    auth = request.headers.get("authorization", "")
    return decode_access_token(auth[7:]) if auth.lower().startswith("bearer ") else None

@router.post("/login")
async def login_web(payload: Entrar, request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    usuario = (await db.execute(select(Envoxer).where(Envoxer.email == payload.email))).scalar_one_or_none()
    if usuario is None or not verify_password(payload.senha, usuario.senha_hash):
        raise HTTPException(401, "E-mail ou senha inválidos")
    if not usuario.ativo:
        raise HTTPException(403, "Envoxer inativo")
    token = await gerar_sessao(db, usuario, request, payload.modo, payload.minutos)
    db.add(AcessoLog(envoxer_id=usuario.id, ip=request.client.host if request.client else None,
                     user_agent=(request.headers.get("user-agent") or "")[:300]))
    return _usuario_resposta(usuario, token, payload.modo)

@router.get("/sessoes")
async def sessoes(request: Request, usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
                 db: Annotated[AsyncSession, Depends(get_db)]):
    atual = (_claims(request) or {}).get("sid")
    rows = (await db.execute(
        select(SessaoWeb).where(SessaoWeb.envoxer_id == usuario.id, SessaoWeb.expira_em > utcnow())
        .order_by(SessaoWeb.criado_em.desc()).limit(50)
    )).scalars().all()
    return [{"id": s.id, "modo": s.modo, "ip": s.ip, "user_agent": s.user_agent,
             "criado_em": s.criado_em.isoformat(), "ultimo_acesso": s.ultimo_acesso.isoformat(),
             "ativo": valida_sessao(s), "atual": s.id == atual} for s in rows]

@router.delete("/sessoes/{sid}", status_code=204)
async def revogar(sid: str, usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
                  db: Annotated[AsyncSession, Depends(get_db)]):
    sessao = await db.get(SessaoWeb, sid)
    if sessao is None or sessao.envoxer_id != usuario.id:
        raise HTTPException(404, "Sessão não encontrada")
    sessao.revogado_em = utcnow()

@router.post("/sair", status_code=204)
async def sair(request: Request, usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
              db: Annotated[AsyncSession, Depends(get_db)]):
    sid = (_claims(request) or {}).get("sid")
    if sid:
        sessao = await db.get(SessaoWeb, sid)
        if sessao is not None and sessao.envoxer_id == usuario.id:
            sessao.revogado_em = utcnow()

@router.post("/qr/iniciar")
async def iniciar_qr(payload: InicioQR, request: Request,
                    db: Annotated[AsyncSession, Depends(get_db)]):
    if payload.minutos not in (30, 120, 480):
        raise HTTPException(422, "Duração inválida")
    ip = request.client.host if request.client else None
    qtd = (await db.execute(select(func.count(PareamentoWeb.id)).where(
        PareamentoWeb.ip == ip,
        PareamentoWeb.criado_em > utcnow()-timedelta(minutes=10),
    ))).scalar_one()
    if qtd >= 12:
        raise HTTPException(429, "Limite de tentativas atingido")
    pedido_id = secrets.token_urlsafe(20)
    segredo = secrets.token_urlsafe(32)
    codigo = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(10))
    db.add(PareamentoWeb(id=pedido_id, poll_hash=_sha(segredo), codigo=codigo,
                         ip=ip, user_agent=(request.headers.get("user-agent") or "")[:300],
                         minutos=payload.minutos, expira_em=utcnow()+timedelta(minutes=2)))
    return {"id": pedido_id, "codigo": codigo, "segredo": segredo, "expira_segundos": 120}

@router.get("/qr/{pedido_id}")
async def detalhes_qr(pedido_id: str, usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
                      db: Annotated[AsyncSession, Depends(get_db)]):
    p = await db.get(PareamentoWeb, pedido_id)
    if p is None or p.expira_em <= utcnow() or p.consumido_em or p.autorizado_id:
        raise HTTPException(410, "Pareamento expirou")
    return {"navegador": p.user_agent or "Navegador desconhecido", "valido": True}

@router.post("/qr/{pedido_id}/autorizar")
async def autorizar_qr(pedido_id: str, request: Request,
                       usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
                       db: Annotated[AsyncSession, Depends(get_db)]):
    if (_claims(request) or {}).get("modo") == "rapido":
        raise HTTPException(403, "Autorize no dispositivo habitual")
    p = await db.get(PareamentoWeb, pedido_id, with_for_update=True)
    if p is None or p.expira_em <= utcnow() or p.consumido_em or p.autorizado_id:
        raise HTTPException(410, "Pareamento expirou")
    p.autorizado_id = usuario.id
    return {"autorizado": True}

@router.post("/qr/{pedido_id}/consultar")
async def consultar_qr(pedido_id: str, payload: ConsultaQR, request: Request,
                       db: Annotated[AsyncSession, Depends(get_db)]):
    p = await db.get(PareamentoWeb, pedido_id, with_for_update=True)
    if p is None or not hmac.compare_digest(p.poll_hash, _sha(payload.segredo)):
        raise HTTPException(404, "Pareamento não encontrado")
    if p.expira_em <= utcnow() or p.consumido_em:
        raise HTTPException(410, "Pareamento expirado")
    if not p.autorizado_id:
        return {"status": "aguardando"}
    u = await db.get(Envoxer, p.autorizado_id)
    if u is None or not u.ativo:
        raise HTTPException(403, "Usuário indisponível")
    p.consumido_em = utcnow()
    token = await gerar_sessao(db, u, request, "rapido", p.minutos)
    db.add(AcessoLog(envoxer_id=u.id, ip=request.client.host if request.client else None,
                     user_agent=(request.headers.get("user-agent") or "")[:300]))
    return {"status": "autorizado", **_usuario_resposta(u, token)}


class AprovarCodigo(BaseModel):
    codigo: str = Field(min_length=10, max_length=12)

@router.post("/qr/validar-codigo")
async def validar_codigo(
    payload: AprovarCodigo,
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    codigo = payload.codigo.strip().upper()
    pedido = (await db.execute(select(PareamentoWeb).where(PareamentoWeb.codigo == codigo))).scalar_one_or_none()
    if pedido is None or pedido.expira_em <= utcnow() or pedido.consumido_em or pedido.autorizado_id:
        raise HTTPException(410, "Código inválido ou expirado")
    return {"codigo": pedido.codigo, "navegador": pedido.user_agent or "Dispositivo desconhecido"}

@router.post("/qr/aprovar-codigo")
async def aprovar_codigo(
    payload: AprovarCodigo, request: Request,
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if (_claims(request) or {}).get("modo") == "rapido":
        raise HTTPException(403, "Autorize pelo seu dispositivo habitual")
    pedido = (await db.execute(select(PareamentoWeb).where(PareamentoWeb.codigo == payload.codigo.strip().upper()).with_for_update())).scalar_one_or_none()
    if pedido is None or pedido.expira_em <= utcnow() or pedido.consumido_em or pedido.autorizado_id:
        raise HTTPException(410, "Código inválido ou expirado")
    pedido.autorizado_id = usuario.id
    return {"autorizado": True}
