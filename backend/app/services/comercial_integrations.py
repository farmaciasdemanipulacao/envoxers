from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.comercial import ComercialIntegration


INTEGRATION_DEFS: dict[str, dict[str, Any]] = {
    "openai": {
        "nome": "OpenAI",
        "descricao": "Auditoria estratégica, geração de abordagens e próximas respostas do CRM.",
        "public": [
            {"key": "modelo", "label": "Modelo", "type": "text", "required": True, "default": settings.OPENAI_MODEL, "help": "Modelo usado nas análises e mensagens do Comercial."},
        ],
        "secret": [
            {"key": "api_key", "label": "API key", "type": "password", "required": True, "help": "Chave de projeto da OpenAI. Nunca é devolvida ao navegador."},
        ],
    },
    "whatsapp": {
        "nome": "WhatsApp Business Cloud",
        "descricao": "Credenciais da API oficial do WhatsApp Business/Meta.",
        "public": [
            {"key": "phone_number_id", "label": "Phone Number ID", "type": "text", "required": True},
            {"key": "waba_id", "label": "WhatsApp Business Account ID", "type": "text", "required": False},
            {"key": "graph_version", "label": "Versão da Graph API", "type": "text", "required": True, "help": "Ex.: v25.0. Use a versão habilitada no seu app Meta."},
        ],
        "secret": [
            {"key": "access_token", "label": "Access token", "type": "password", "required": True},
            {"key": "verify_token", "label": "Verify token do webhook", "type": "password", "required": False},
            {"key": "app_secret", "label": "App secret", "type": "password", "required": False},
        ],
    },
    "instagram": {
        "nome": "Instagram Messaging / Meta",
        "descricao": "Conta profissional do Instagram vinculada à infraestrutura Meta.",
        "public": [
            {"key": "instagram_account_id", "label": "Instagram Account ID", "type": "text", "required": True},
            {"key": "page_id", "label": "Facebook Page ID", "type": "text", "required": False},
            {"key": "graph_version", "label": "Versão da Graph API", "type": "text", "required": True, "help": "Use a versão habilitada no seu app Meta."},
        ],
        "secret": [
            {"key": "access_token", "label": "Access token", "type": "password", "required": True},
            {"key": "app_secret", "label": "App secret", "type": "password", "required": False},
        ],
    },
    "email": {
        "nome": "E-mail",
        "descricao": "Servidor SMTP para contatos e automações de e-mail do Comercial.",
        "public": [
            {"key": "host", "label": "Servidor SMTP", "type": "text", "required": True, "placeholder": "smtp.seudominio.com.br"},
            {"key": "port", "label": "Porta", "type": "number", "required": True, "default": 587},
            {"key": "username", "label": "Usuário", "type": "text", "required": False},
            {"key": "from_email", "label": "E-mail remetente", "type": "email", "required": True},
            {"key": "from_name", "label": "Nome remetente", "type": "text", "required": False, "default": "Envox"},
            {"key": "security", "label": "Segurança", "type": "select", "required": True, "default": "starttls", "options": [{"value": "starttls", "label": "STARTTLS"}, {"value": "ssl", "label": "SSL/TLS"}, {"value": "none", "label": "Sem TLS"}]},
        ],
        "secret": [
            {"key": "password", "label": "Senha SMTP", "type": "password", "required": False},
        ],
    },
    "google_places": {
        "nome": "Google Maps / Places",
        "descricao": "Consulta de estabelecimentos e dados públicos via Google Places API.",
        "public": [
            {"key": "language", "label": "Idioma", "type": "text", "required": False, "default": "pt-BR"},
            {"key": "region", "label": "Região", "type": "text", "required": False, "default": "BR"},
        ],
        "secret": [
            {"key": "api_key", "label": "Google API key", "type": "password", "required": True},
        ],
    },
    "pesquisa": {
        "nome": "Pesquisa pública / coleta autorizada",
        "descricao": "Conector HTTP para uma fonte própria/autorizada de pesquisa e enriquecimento.",
        "public": [
            {"key": "base_url", "label": "URL base", "type": "url", "required": True, "placeholder": "https://..."},
            {"key": "auth_header", "label": "Header de autenticação", "type": "text", "required": False, "default": "Authorization"},
            {"key": "auth_prefix", "label": "Prefixo do token", "type": "text", "required": False, "default": "Bearer"},
        ],
        "secret": [
            {"key": "api_token", "label": "Token / API key", "type": "password", "required": False},
        ],
    },
    "webhooks": {
        "nome": "Webhooks / n8n / Make / Zapier",
        "descricao": "Endpoint para enviar eventos do Comercial a uma automação externa.",
        "public": [
            {"key": "webhook_url", "label": "URL do webhook", "type": "url", "required": True, "placeholder": "https://..."},
            {"key": "method", "label": "Método de teste", "type": "select", "required": True, "default": "POST", "options": [{"value": "POST", "label": "POST"}, {"value": "GET", "label": "GET"}]},
        ],
        "secret": [
            {"key": "bearer_token", "label": "Bearer token", "type": "password", "required": False},
            {"key": "signing_secret", "label": "Signing secret", "type": "password", "required": False},
        ],
    },
}


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secrets(values: dict[str, Any]) -> str | None:
    cleaned = {k: str(v) for k, v in values.items() if v not in (None, "")}
    if not cleaned:
        return None
    return _fernet().encrypt(json.dumps(cleaned, ensure_ascii=False).encode("utf-8")).decode("ascii")


def decrypt_secrets(token: str | None) -> dict[str, str]:
    if not token:
        return {}
    try:
        raw = _fernet().decrypt(token.encode("ascii"))
        data = json.loads(raw.decode("utf-8"))
        return {str(k): str(v) for k, v in data.items()}
    except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
        return {}


def _defaults(provider: str) -> dict[str, Any]:
    definition = INTEGRATION_DEFS.get(provider) or {}
    return {f["key"]: f.get("default") for f in definition.get("public", []) if f.get("default") is not None}


def _is_configured(provider: str, public: dict[str, Any], secrets: dict[str, Any]) -> bool:
    definition = INTEGRATION_DEFS.get(provider)
    if not definition:
        return False
    for field in definition.get("public", []):
        if field.get("required") and public.get(field["key"]) in (None, ""):
            return False
    for field in definition.get("secret", []):
        if field.get("required") and secrets.get(field["key"]) in (None, ""):
            return False
    return True


async def ensure_integration_rows(db: AsyncSession) -> None:
    existing = {x.provider: x for x in (await db.execute(select(ComercialIntegration))).scalars().all()}
    changed = False
    for provider, definition in INTEGRATION_DEFS.items():
        if provider not in existing:
            db.add(ComercialIntegration(provider=provider, nome=definition["nome"], ativo=False, configurado=False, config_publica=_defaults(provider)))
            changed = True
        else:
            row = existing[provider]
            if row.nome != definition["nome"]:
                row.nome = definition["nome"]
                changed = True
            merged = {**_defaults(provider), **(row.config_publica or {})}
            if merged != (row.config_publica or {}):
                row.config_publica = merged
                changed = True
    if changed:
        await db.commit()


async def get_row(db: AsyncSession, provider: str) -> ComercialIntegration | None:
    return (await db.execute(select(ComercialIntegration).where(ComercialIntegration.provider == provider))).scalar_one_or_none()


async def runtime_config(db: AsyncSession, provider: str, require_active: bool = True) -> dict[str, Any]:
    row = await get_row(db, provider)
    if not row:
        return {}
    public = {**_defaults(provider), **(row.config_publica or {})}
    secrets = decrypt_secrets(row.credenciais_encriptadas)
    # Compatibilidade de transição: a chave colocada no .env continua válida até
    # o admin substituí-la ou removê-la explicitamente pelo painel.
    if provider == "openai" and not secrets.get("api_key") and public.get("usar_env", True) and settings.OPENAI_API_KEY:
        secrets["api_key"] = settings.OPENAI_API_KEY
        public.setdefault("modelo", settings.OPENAI_MODEL)
    configured = _is_configured(provider, public, secrets)
    if require_active:
        env_fallback_active = provider == "openai" and not row.credenciais_encriptadas and public.get("usar_env", True) and bool(settings.OPENAI_API_KEY)
        if not row.ativo and not env_fallback_active:
            return {}
    if not configured:
        return {}
    return {**public, **secrets, "_provider": provider, "_ativo": True}


async def serialize_integrations(db: AsyncSession) -> list[dict[str, Any]]:
    await ensure_integration_rows(db)
    rows = (await db.execute(select(ComercialIntegration).order_by(ComercialIntegration.nome))).scalars().all()
    out = []
    for row in rows:
        definition = INTEGRATION_DEFS.get(row.provider, {"public": [], "secret": [], "descricao": ""})
        public = {**_defaults(row.provider), **(row.config_publica or {})}
        secrets = decrypt_secrets(row.credenciais_encriptadas)
        source = "painel" if secrets else None
        if row.provider == "openai" and not secrets.get("api_key") and public.get("usar_env", True) and settings.OPENAI_API_KEY:
            secrets["api_key"] = settings.OPENAI_API_KEY
            public.setdefault("modelo", settings.OPENAI_MODEL)
            source = "ambiente"
        configured = _is_configured(row.provider, public, secrets)
        effective_active = bool(row.ativo or (row.provider == "openai" and source == "ambiente" and configured))
        out.append({
            "id": row.id,
            "provider": row.provider,
            "nome": row.nome,
            "descricao": definition.get("descricao", ""),
            "ativo": effective_active,
            "configurado": configured,
            "config_publica": {k: v for k, v in public.items() if not k.startswith("_") and k != "usar_env"},
            "secret_status": {f["key"]: bool(secrets.get(f["key"])) for f in definition.get("secret", [])},
            "campos_publicos": definition.get("public", []),
            "campos_secretos": definition.get("secret", []),
            "fonte_credencial": source,
            "ultimo_teste_em": row.ultimo_teste_em,
            "ultimo_teste_ok": row.ultimo_teste_ok,
            "ultimo_erro": row.ultimo_erro,
            "ultima_sincronizacao_em": row.ultima_sincronizacao_em,
        })
    return out


async def save_integration(db: AsyncSession, provider: str, payload: dict[str, Any]) -> ComercialIntegration:
    if provider not in INTEGRATION_DEFS:
        raise ValueError("Integração desconhecida")
    row = await get_row(db, provider)
    if not row:
        definition = INTEGRATION_DEFS[provider]
        row = ComercialIntegration(provider=provider, nome=definition["nome"], config_publica=_defaults(provider), ativo=False, configurado=False)
        db.add(row)
        await db.flush()
    definition = INTEGRATION_DEFS[provider]
    allowed_public = {f["key"] for f in definition.get("public", [])}
    allowed_secret = {f["key"] for f in definition.get("secret", [])}
    public = {**_defaults(provider), **(row.config_publica or {})}
    for key, value in (payload.get("config_publica") or {}).items():
        if key in allowed_public:
            public[key] = value
    secrets = decrypt_secrets(row.credenciais_encriptadas)
    for key, value in (payload.get("segredos") or {}).items():
        if key in allowed_secret and value not in (None, ""):
            secrets[key] = str(value)
    for key in (payload.get("remover_segredos") or []):
        if key in allowed_secret:
            secrets.pop(key, None)
    if provider == "openai" and (payload.get("remover_segredos") or []):
        public["usar_env"] = False
    validation_secrets = dict(secrets)
    if provider == "openai" and not validation_secrets.get("api_key") and public.get("usar_env", True) and settings.OPENAI_API_KEY:
        validation_secrets["api_key"] = settings.OPENAI_API_KEY
    configured = _is_configured(provider, public, validation_secrets)
    requested_active = bool(payload.get("ativo", row.ativo))
    if requested_active and not configured:
        raise ValueError("Preencha todos os campos obrigatórios antes de ativar a integração")
    row.config_publica = public
    row.credenciais_encriptadas = encrypt_secrets(secrets)
    row.configurado = configured
    row.ativo = requested_active and configured
    row.ultimo_teste_ok = None
    row.ultimo_erro = None
    await db.commit()
    await db.refresh(row)
    return row


async def clear_credentials(db: AsyncSession, provider: str) -> None:
    row = await get_row(db, provider)
    if not row:
        return
    public = {**_defaults(provider), **(row.config_publica or {})}
    if provider == "openai":
        public["usar_env"] = False
    row.config_publica = public
    row.credenciais_encriptadas = None
    row.configurado = False
    row.ativo = False
    row.ultimo_teste_ok = None
    row.ultimo_erro = None
    await db.commit()


def _http_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, payload: dict[str, Any] | None = None, timeout: int = 20) -> tuple[int, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req_headers = {"User-Agent": "Envoxers/CommercialIntegrationTest", **(headers or {})}
    if payload is not None:
        req_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(100000).decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body) if body else {}
            except json.JSONDecodeError:
                parsed = {"text": body[:500]}
            return response.status, parsed
    except urllib.error.HTTPError as exc:
        body = exc.read(100000).decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"text": body[:500]}
        raise RuntimeError(f"HTTP {exc.code}: {str(parsed)[:350]}")


def _test_sync(provider: str, cfg: dict[str, Any]) -> str:
    if provider == "openai":
        status, _ = _http_json("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {cfg['api_key']}"})
        return f"OpenAI respondeu HTTP {status}."
    if provider == "whatsapp":
        version = str(cfg["graph_version"]).strip()
        phone_id = urllib.parse.quote(str(cfg["phone_number_id"]).strip(), safe="")
        status, body = _http_json(f"https://graph.facebook.com/{version}/{phone_id}?fields=id,display_phone_number,verified_name", headers={"Authorization": f"Bearer {cfg['access_token']}"})
        label = body.get("verified_name") or body.get("display_phone_number") or phone_id
        return f"WhatsApp conectado: {label} (HTTP {status})."
    if provider == "instagram":
        version = str(cfg["graph_version"]).strip()
        account_id = urllib.parse.quote(str(cfg["instagram_account_id"]).strip(), safe="")
        status, body = _http_json(f"https://graph.facebook.com/{version}/{account_id}?fields=id,username", headers={"Authorization": f"Bearer {cfg['access_token']}"})
        return f"Instagram conectado: @{body.get('username', account_id)} (HTTP {status})."
    if provider == "email":
        host = str(cfg["host"]); port = int(cfg["port"]); security = str(cfg.get("security") or "starttls")
        context = ssl.create_default_context()
        if security == "ssl":
            server = smtplib.SMTP_SSL(host, port, timeout=20, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
        try:
            server.ehlo()
            if security == "starttls":
                server.starttls(context=context); server.ehlo()
            if cfg.get("username"):
                server.login(str(cfg["username"]), str(cfg.get("password") or ""))
        finally:
            try: server.quit()
            except Exception: pass
        return "Servidor SMTP autenticado com sucesso."
    if provider == "google_places":
        headers = {"X-Goog-Api-Key": str(cfg["api_key"]), "X-Goog-FieldMask": "places.id"}
        status, _ = _http_json("https://places.googleapis.com/v1/places:searchText", method="POST", headers=headers, payload={"textQuery": "Curitiba", "languageCode": cfg.get("language") or "pt-BR", "regionCode": cfg.get("region") or "BR"})
        return f"Google Places respondeu HTTP {status}."
    if provider == "pesquisa":
        headers = {}
        if cfg.get("api_token"):
            prefix = str(cfg.get("auth_prefix") or "").strip()
            value = f"{prefix} {cfg['api_token']}".strip()
            headers[str(cfg.get("auth_header") or "Authorization")] = value
        status, _ = _http_json(str(cfg["base_url"]), headers=headers)
        return f"Fonte respondeu HTTP {status}."
    if provider == "webhooks":
        headers = {}
        if cfg.get("bearer_token"):
            headers["Authorization"] = f"Bearer {cfg['bearer_token']}"
        method = str(cfg.get("method") or "POST").upper()
        payload = {"event": "envoxers.integration_test", "source": "comercial"} if method == "POST" else None
        status, _ = _http_json(str(cfg["webhook_url"]), method=method, headers=headers, payload=payload)
        return f"Webhook respondeu HTTP {status}."
    raise RuntimeError("Teste automático ainda não implementado para esta integração")


async def test_integration(db: AsyncSession, provider: str) -> dict[str, Any]:
    row = await get_row(db, provider)
    if not row:
        raise RuntimeError("Integração não encontrada")
    # O teste pode ser executado mesmo com integração desativada, desde que as credenciais estejam completas.
    public = {**_defaults(provider), **(row.config_publica or {})}
    secrets = decrypt_secrets(row.credenciais_encriptadas)
    if provider == "openai" and not secrets.get("api_key") and public.get("usar_env", True) and settings.OPENAI_API_KEY:
        secrets["api_key"] = settings.OPENAI_API_KEY
        public.setdefault("modelo", settings.OPENAI_MODEL)
    cfg = {**public, **secrets}
    if not _is_configured(provider, public, secrets):
        raise RuntimeError("Preencha os campos obrigatórios antes de testar")
    try:
        message = await asyncio.to_thread(_test_sync, provider, cfg)
        row.ultimo_teste_em = datetime.now(timezone.utc)
        row.ultimo_teste_ok = True
        row.ultimo_erro = None
        row.configurado = True
        await db.commit()
        return {"ok": True, "mensagem": message, "testado_em": row.ultimo_teste_em}
    except Exception as exc:
        row.ultimo_teste_em = datetime.now(timezone.utc)
        row.ultimo_teste_ok = False
        row.ultimo_erro = str(exc)[:800]
        await db.commit()
        raise RuntimeError(str(exc))
