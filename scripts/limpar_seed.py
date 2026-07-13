"""Apaga TODO o dado fake gerado por scripts/seed_dados.py, num único comando.

Identifica os registros pela marcação (ver seed_common.py): Cliente/Envoxer
com nome prefixado "[SEED] ". Apaga na ordem certa de dependências (filhos
antes dos pais) pra não esbarrar nas constraints de FK do banco. Não toca em
nenhum dado que não tenha essa marcação.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/limpar_seed.py
"""
import os
import sys
import asyncio

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, delete  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402

from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.cliente_servico import ClienteServico  # noqa: E402
from app.models.escopo import Escopo  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.registro_foco import RegistroFoco  # noqa: E402
from app.models.aprovacao import Aprovacao  # noqa: E402
from app.models.alteracao import Alteracao  # noqa: E402
from app.models.pulso_satisfacao import PulsoSatisfacao  # noqa: E402
from app.models.check_in import CheckIn  # noqa: E402
from app.models.churn_snapshot import ChurnSnapshot  # noqa: E402
from app.models.farol_calculo import FarolCalculo, FarolCalculoHistorico  # noqa: E402
from app.models.alerta_farol import AlertaFarol  # noqa: E402
from app.models.perfil_cliente import PerfilCliente, PerfilClienteHistorico  # noqa: E402

from seed_common import SEED_PREFIX, SEED_EMAIL_DOMAIN  # noqa: E402


async def apagar_dados_seed(db) -> dict:
    """Executa todos os deletes (sem commitar) e devolve {tabela: linhas_apagadas}."""
    contagens = {}

    cliente_ids_result = await db.execute(select(Cliente.id).where(Cliente.nome.like(f"{SEED_PREFIX}%")))
    cliente_ids = list(cliente_ids_result.scalars().all())

    envoxer_ids_result = await db.execute(select(Envoxer.id).where(Envoxer.email.like(f"%{SEED_EMAIL_DOMAIN}")))
    envoxer_ids = list(envoxer_ids_result.scalars().all())

    if not cliente_ids and not envoxer_ids:
        return contagens

    tarefa_ids = []
    if cliente_ids:
        tarefa_ids_result = await db.execute(select(Tarefa.id).where(Tarefa.cliente_id.in_(cliente_ids)))
        tarefa_ids = list(tarefa_ids_result.scalars().all())

    async def apagar(nome_tabela, stmt):
        result = await db.execute(stmt)
        contagens[nome_tabela] = result.rowcount

    if tarefa_ids:
        await apagar("alteracao", delete(Alteracao).where(Alteracao.tarefa_id.in_(tarefa_ids)))
        await apagar("aprovacao", delete(Aprovacao).where(Aprovacao.tarefa_id.in_(tarefa_ids)))
        await apagar("registro_foco", delete(RegistroFoco).where(RegistroFoco.tarefa_id.in_(tarefa_ids)))
        await apagar("tarefa", delete(Tarefa).where(Tarefa.id.in_(tarefa_ids)))
    else:
        contagens.update({"alteracao": 0, "aprovacao": 0, "registro_foco": 0, "tarefa": 0})

    if cliente_ids:
        await apagar("cliente_servico", delete(ClienteServico).where(ClienteServico.cliente_id.in_(cliente_ids)))
        await apagar("escopo", delete(Escopo).where(Escopo.cliente_id.in_(cliente_ids)))
        await apagar("pulso_satisfacao", delete(PulsoSatisfacao).where(PulsoSatisfacao.cliente_id.in_(cliente_ids)))
        await apagar("check_in", delete(CheckIn).where(CheckIn.cliente_id.in_(cliente_ids)))
        await apagar("alerta_farol", delete(AlertaFarol).where(AlertaFarol.cliente_id.in_(cliente_ids)))
        await apagar("farol_calculo_historico", delete(FarolCalculoHistorico).where(FarolCalculoHistorico.cliente_id.in_(cliente_ids)))
        await apagar("farol_calculo", delete(FarolCalculo).where(FarolCalculo.cliente_id.in_(cliente_ids)))
        await apagar("perfil_cliente_historico", delete(PerfilClienteHistorico).where(PerfilClienteHistorico.cliente_id.in_(cliente_ids)))
        await apagar("perfil_cliente", delete(PerfilCliente).where(PerfilCliente.cliente_id.in_(cliente_ids)))
        await apagar("churn_snapshot", delete(ChurnSnapshot).where(ChurnSnapshot.cliente_id.in_(cliente_ids)))
        await apagar("cliente", delete(Cliente).where(Cliente.id.in_(cliente_ids)))

    if envoxer_ids:
        await apagar("envoxer", delete(Envoxer).where(Envoxer.id.in_(envoxer_ids)))

    return contagens


async def main():
    async with AsyncSessionLocal() as db:
        contagens = await apagar_dados_seed(db)

        if not contagens:
            print("Nenhum dado fake encontrado (nenhum Cliente/Envoxer com a marcação de seed). Nada a apagar.")
            return

        await db.commit()

        print("=== Limpeza concluída ===")
        for tabela, qtd in contagens.items():
            print(f"{tabela}: {qtd} linha(s) apagada(s)")


if __name__ == "__main__":
    asyncio.run(main())
