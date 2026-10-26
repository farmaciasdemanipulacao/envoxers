"""Static release gates for the SECOVI portal.

Run separately from functional tests. Deliberately FAILS while critical
security gaps exist: a green feature suite is not deployment approval.
This is an early-warning gate, not a complete security audit.
"""
from pathlib import Path
import re
import sys

BACKEND = Path(__file__).resolve().parents[1]
routes = BACKEND / "app" / "api" / "routes"
auth = (routes / "portal_auth.py").read_text(encoding="utf-8")
docs = (routes / "portal_documentos.py").read_text(encoding="utf-8")
deps = (BACKEND / "app" / "api" / "deps.py").read_text(encoding="utf-8")
main = (BACKEND / "app" / "main.py").read_text(encoding="utf-8")
private_static = (BACKEND / "app" / "core" / "arquivos_estaticos.py").read_text(encoding="utf-8")

checks = [
    (
        "Portal desativado: login deve rejeitar clientes sem opt-in",
        "PortalClienteConfig" in auth and "habilitado" in auth,
        "portal_auth.py precisa consultar a configuração do próprio cliente antes de criar o token",
    ),
    (
        "Revogação: sessões externas devem ser revalidadas a cada requisição",
        "PortalClienteConfig" in deps and "habilitado" in deps and "get_current_cliente_contato" in deps,
        "get_current_cliente_contato precisa rejeitar clientes desabilitados mesmo com token válido",
    ),
    (
        "Documentos externos precisam de autorização e opt-in por módulo",
        ("contato_habilitado" in docs or ("PortalClienteConfig" in docs and "habilitado" in docs))
        and '"documentos"' in docs,
        "portal_documentos.py deve validar cliente, autorização e módulo documentos antes de leitura/confirmação",
    ),
    (
        "Uploads privados não podem utilizar StaticFiles aberto",
        "ArquivosLegadosProtegidos" in main
        and not re.search(r'app\.mount\([^\n]+StaticFiles\(directory=settings\.UPLOAD_DIR\)', main),
        "substituir mount legado aberto por classe de arquivos protegidos e rodar regressões Drive/Windows",
    ),
    (
        "Proteção de uploads deve conservar bloqueio para caminhos privados",
        '"private" in partes' in private_static,
        "manter bloqueio de private, inclusive caminhos normalizados",
    ),
]

failed = 0
for title, passed, action in checks:
    if passed:
        print("PASS", title)
    else:
        failed += 1
        print("BLOCKER", title)
        print("         Ação:", action)

print(f"\nPortal security release gate: {len(checks)-failed}/{len(checks)} passed; {failed} blocker(s).")
if failed:
    print("Não realizar merge nem deploy real enquanto os bloqueios existirem.")
sys.exit(1 if failed else 0)
