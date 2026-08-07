"""Teste de integração: gestor pode marcar/desmarcar Serviços contratados
(ClienteServico) sem tocar em valor_mensal — fix pro caso real da Duda, que não
conseguia cadastrar serviço contratado no cliente por ser gestora (sem acesso a
valores). Roda contra o Postgres real, chamando a lógica das rotas diretamente
(sem HTTP/JWT, mesmo padrão de check_item_escopo.py). Cria e depois apaga seu
próprio Cliente/Serviços de teste.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \
        -v /docker/envoxers:/workspace envoxers-backend:latest \
        python /workspace/scripts/check_gestor_servicos.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.servico import Servico  # noqa: E402
from app.models.cliente_servico import ClienteServico  # noqa: E402
from app.api.routes.clientes import criar_cliente, atualizar_cliente  # noqa: E402
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ClienteServicoItem  # noqa: E402


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin, "precisa de 1 admin ativo"
        gestor = Envoxer(permissao="gestor")  # não persistido — só attrs, eh_admin() só olha .permissao

        servicos = (await db.execute(select(Servico).where(Servico.ativo.is_(True)).limit(2))).scalars().all()
        assert len(servicos) >= 2, "precisa de pelo menos 2 serviços ativos"
        s1, s2 = servicos[0], servicos[1]

        # 1) admin cria cliente já com s1 contratado a R$1500
        cliente = await criar_cliente(
            ClienteCreate(nome="[TESTE RBAC] Cliente Servicos Gestor", segmento="Teste", valor_contrato=5000,
                           servicos=[ClienteServicoItem(servico_id=s1.id, valor_mensal=1500, observacao="contratado pelo admin")]),
            db, admin,
        )
        cliente_id = cliente.id
        print(f"Cliente de teste criado id={cliente_id}")

        cs_result = await db.execute(select(ClienteServico).where(ClienteServico.cliente_id == cliente_id))
        cs_map = {cs.servico_id: cs for cs in cs_result.scalars().all()}
        await assert_true(cs_map[s1.id].valor_mensal == 1500, "s1 nasceu com valor 1500 (admin)")

        # 2) gestor reenvia s1 (form não é diff) + adiciona s2, com valor_mensal=0
        #    (é o que o form real do gestor manda, já que a leitura vem redigida null)
        await atualizar_cliente(
            cliente_id,
            ClienteUpdate(servicos=[
                ClienteServicoItem(servico_id=s1.id, valor_mensal=0, observacao=None),
                ClienteServicoItem(servico_id=s2.id, valor_mensal=0, observacao=None),
            ]),
            db, gestor,
        )
        await db.flush()
        cs_result = await db.execute(select(ClienteServico).where(ClienteServico.cliente_id == cliente_id))
        cs_map = {cs.servico_id: cs for cs in cs_result.scalars().all()}
        await assert_true(s1.id in cs_map and s2.id in cs_map, "gestor conseguiu adicionar s2 mantendo s1")
        await assert_true(cs_map[s1.id].valor_mensal == 1500, "valor de s1 preservado (gestor não conseguiu zerar)")
        await assert_true(cs_map[s2.id].valor_mensal == 0, "s2 nasceu com valor 0, admin completa depois")

        # 3) gestor desmarca s1 (remove), mantém só s2
        await atualizar_cliente(
            cliente_id,
            ClienteUpdate(servicos=[ClienteServicoItem(servico_id=s2.id, valor_mensal=0, observacao=None)]),
            db, gestor,
        )
        await db.flush()
        cs_result = await db.execute(select(ClienteServico).where(ClienteServico.cliente_id == cliente_id))
        cs_map = {cs.servico_id: cs for cs in cs_result.scalars().all()}
        await assert_true(s1.id not in cs_map, "gestor conseguiu remover s1")
        await assert_true(s2.id in cs_map and cs_map[s2.id].valor_mensal == 0, "s2 continua, valor intacto")

        # 4) admin ainda consegue definir valor de verdade em s2
        await atualizar_cliente(
            cliente_id,
            ClienteUpdate(servicos=[ClienteServicoItem(servico_id=s2.id, valor_mensal=800, observacao="valor real definido pelo admin")]),
            db, admin,
        )
        await db.flush()
        cs_result = await db.execute(select(ClienteServico).where(ClienteServico.cliente_id == cliente_id))
        cs_map = {cs.servico_id: cs for cs in cs_result.scalars().all()}
        await assert_true(cs_map[s2.id].valor_mensal == 800, "admin conseguiu setar o valor real de s2")

        # limpeza
        await db.execute(delete(ClienteServico).where(ClienteServico.cliente_id == cliente_id))
        await db.execute(delete(Cliente).where(Cliente.id == cliente_id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
