"""Testa isolamento HTTP real do Monitoramento de Presenca em banco descartavel."""
import asyncio
import os
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.models.envoxer import Envoxer
from app.models.presenca import PresencaAuditoria

ROOT = "http://127.0.0.1:18766/api/v1/presenca"

async def seed():
    assert "envox_presenca_teste" in os.environ["DATABASE_URL"]
    async with AsyncSessionLocal() as db:
        tokens = {}
        for permission in ("admin", "gestor", "envoxer", "comercial"):
            user = Envoxer(
                nome="Teste HTTP " + permission,
                email="http-presenca-" + permission + "@example.invalid",
                cargo="Teste", permissao=permission, senha_hash="dummy", custo_hora=0
            )
            db.add(user)
            await db.flush()
            tokens[permission] = create_access_token({"sub": str(user.id), "tipo": "envoxer"})
        tokens["portal"] = create_access_token({"sub": "1", "tipo": "cliente_contato"})
        await db.commit()
    return tokens

def request(path, token=None, method="GET", payload=None):
    hdr = {"Content-Type": "application/json"}
    if token:
        hdr["Authorization"] = "Bearer " + token
    req = Request(ROOT + path, data=payload, method=method, headers=hdr)
    try:
        with urlopen(req, timeout=5) as res:
            return res.status, res.read()
    except HTTPError as e:
        return e.code, e.read()

async def audit_count():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(PresencaAuditoria))).scalars().all()
        return len(rows)

def main():
    tokens = asyncio.run(seed())
    env = os.environ.copy()
    env["AUTO_MIGRATE"] = "false"
    env["APP_ENV"] = "test"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", "18766"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env
    )
    try:
        for _ in range(60):
            try:
                result, _ = request("/me/config", tokens["admin"])
                if result == 200:
                    break
            except URLError:
                pass
            if proc.poll() is not None:
                raise AssertionError("Aplicacao terminou ao iniciar: " + proc.stderr.read().decode("utf8", errors="replace")[-2500:])
            time.sleep(0.2)
        else:
            raise AssertionError("API nao iniciou")

        for path in (
            "/admin/dashboard", "/admin/historico", "/admin/config",
            "/admin/auditoria", "/admin/exportar.csv"
        ):
            assert request(path)[0] == 401, (path, "anonimo")
            assert request(path, tokens["portal"])[0] == 401, (path, "portal")
            for role in ("gestor", "envoxer", "comercial"):
                code, _ = request(path, tokens[role])
                assert code == 403, (path, role, code)
            code, _ = request(path, tokens["admin"])
            assert code == 200, (path, "admin", code)
        print("HTTP_ADMIN_RBAC_OK")

        code, body = request("/admin/config", tokens["envoxer"], "PUT",
                             b'{"monitoramento_ativo":false,"inatividade_min":5,"alerta_min":15,"retencao_dias":90,"notificar_colaborador":true}')
        assert code == 403, ("write_permissao", code, body[:100])
        assert request("/me/config", tokens["envoxer"])[0] == 200
        assert request("/me/atividade", tokens["envoxer"], "POST",
                       b'{"idle_seconds":120,"origem":"web"}')[0] == 200
        assert request("/me/atividade", tokens["envoxer"], "POST",
                       b'{"idle_seconds":120,"origem":"desktop"}')[0] == 200
        print("HTTP_WRITE_DENIAL_AND_SELF_SAMPLING_OK")

        import json
        audit_status, audit_body = request("/admin/auditoria", tokens["admin"])
        assert audit_status == 200 and len(json.loads(audit_body)) >= 5
        print("HTTP_AUDIT_PERSISTED_OK")
        print("ALL_PRESENCA_HTTP_TESTS_OK")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)

if __name__ == "__main__":
    main()
