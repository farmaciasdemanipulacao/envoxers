"""Cria (ou garante que existe) uma conta permanente de teste com permissão admin,
pra login rápido em validações futuras sem depender da conta real do Gus.

Diferente do padrão dos scripts check_*.py (que criam e apagam sua própria conta
de teste), esta conta é deixada de propósito no ambiente — ver [[demand_log]] D-119,
mesmo espírito do "Dado de teste persistente" do D-041.

Idempotente: se o e-mail já existir, não faz nada (só confirma e imprime o estado atual).

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/criar_usuario_tester.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.core.security import hash_password  # noqa: E402

EMAIL_TESTER = os.getenv("ENVOXERS_TESTER_EMAIL", "tester@envox.com.br")
SENHA_TESTER = os.getenv("ENVOXERS_TESTER_PASSWORD")
NOME_TESTER = os.getenv("ENVOXERS_TESTER_NAME", "[TESTER] Conta de Testes")


async def main():
    if not SENHA_TESTER:
        raise RuntimeError("Defina ENVOXERS_TESTER_PASSWORD antes de executar este script")
    async with AsyncSessionLocal() as db:
        existente = (
            await db.execute(select(Envoxer).where(Envoxer.email == EMAIL_TESTER))
        ).scalar_one_or_none()

        if existente:
            print(f"Já existe: id={existente.id}, permissao={existente.permissao}, ativo={existente.ativo}")
            return

        tester = Envoxer(
            nome=NOME_TESTER,
            email=EMAIL_TESTER,
            cargo="Conta de Teste",
            senha_hash=hash_password(SENHA_TESTER),
            permissao="admin",
            horas_mes=220,
            custo_hora=0,
            ativo=True,
        )
        db.add(tester)
        await db.flush()
        await db.commit()
        print(f"Criado: id={tester.id}, email={EMAIL_TESTER}, permissao=admin")


if __name__ == "__main__":
    asyncio.run(main())
