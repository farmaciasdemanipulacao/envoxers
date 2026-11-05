"""Teste de integração do Monitoramento de Presença em PostgreSQL DESCARTÁVEL.

Nunca executar com DATABASE_URL de produção.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.api.deps import get_current_admin, perfil_comercial_pode_acessar
from app.api.routes.presenca import (
    AtividadePayload, PresencaConfigPayload, atualizar_config, auditar,
    dashboard_admin, exportar_csv_admin, historico_admin,
    informar_atividade, ler_config, minha_configuracao,
)
from app.db.session import AsyncSessionLocal
from app.models.envoxer import Envoxer
from app.models.registro_foco import RegistroFoco
from app.models.demanda_avulsa import DemandaAvulsa
from app.models.presenca import PresencaConfig, PresencaIntervalo, PresencaAuditoria


async def run():
    url = os.environ.get("DATABASE_URL", "")
    assert "envox_presenca_teste" in url and "127.0.0.1" in url, "Recusando testar fora do banco descartável!"
    assert perfil_comercial_pode_acessar("/api/v1/presenca/me/config", "GET")
    assert not perfil_comercial_pode_acessar("/api/v1/presenca/admin/dashboard", "GET")
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        admin = Envoxer(nome="Admin teste",email="admin-presenca@example.invalid",
                        cargo="Admin",permissao="admin",senha_hash="dummy",custo_hora=0)
        gestor = Envoxer(nome="Gestor teste",email="gestor-presenca@example.invalid",
                         cargo="Gestor",permissao="gestor",senha_hash="dummy",custo_hora=0)
        trabalhador = Envoxer(nome="Colaborador teste",email="pessoa-presenca@example.invalid",
                              cargo="Designer",permissao="envoxer",senha_hash="dummy",custo_hora=0)
        outro = Envoxer(nome="Colaborador sem timer",email="outra-presenca@example.invalid",
                        cargo="Operação",permissao="envoxer",senha_hash="dummy",custo_hora=0)
        db.add_all([admin,gestor,trabalhador,outro])
        await db.flush()
        trabalhador.gestor_responsavel_id = gestor.id
        demanda = DemandaAvulsa(contexto="Teste isolado", titulo="Atividade temporária de teste")
        db.add(demanda)
        await db.flush()
        foco = RegistroFoco(envoxer_id=trabalhador.id, demanda_avulsa_id=demanda.id,
                            inicio=now-timedelta(minutes=24), duracao_pausada_segundos=0)
        db.add(foco)
        await db.flush()
        print("SEED_TEMP_OK", admin.id, gestor.id, trabalhador.id, foco.id)

        for usuario in [trabalhador, gestor, outro]:
            try:
                await get_current_admin(usuario)
                raise AssertionError("Acesso indevido: " + usuario.nome)
            except HTTPException as e:
                assert e.status_code == 403
        assert await get_current_admin(admin) is admin
        print("ADMIN_ROLE_DENIAL_OK")

        cfg = await ler_config(admin, db)
        assert cfg["camera_habilitada"] is False
        assert cfg["inatividade_min"] == 5
        cfg2 = await minha_configuracao(trabalhador, db)
        assert cfg2["camera_habilitada"] is False
        print("CONFIG_SAFE_DEFAULT_OK")

        sem_foco = await informar_atividade(AtividadePayload(idle_seconds=1500, origem="desktop"),outro,db)
        assert sem_foco["recebido"] is False
        # Web não deve produzir alerta de ociosidade do computador.
        web = await informar_atividade(AtividadePayload(idle_seconds=1500, origem="web"),trabalhador,db)
        assert not web["alerta"]
        desktop = await informar_atividade(AtividadePayload(idle_seconds=1200, origem="desktop"),trabalhador,db)
        assert desktop["recebido"] and desktop["alerta"] and desktop["notificar_colaborador"]
        print("IDLE_SAMPLING_SCOPED_OK")

        dados = await dashboard_admin(admin, db, envoxer_id=None, gestor_id=None, status=None, tarefa_id=None)
        pessoa = next(x for x in dados["colaboradores"] if x["envoxer_id"] == trabalhador.id)
        assert pessoa["timer_status"] == "ativo"
        assert pessoa["alerta"] and pessoa["possivel_inatividade"]
        assert pessoa["inatividade_segundos"] >= 1200
        assert pessoa["fonte"] == "desktop"
        assert len([x for x in dados["colaboradores"] if x["envoxer_id"] == outro.id]) == 1
        print("LIVE_ADMIN_DASHBOARD_OK")

        hist = await historico_admin(admin,db,inicio=None,fim=None,envoxer_id=trabalhador.id,gestor_id=None,tarefa_id=None)
        assert hist["total"] == 1
        item = hist["registros"][0]
        assert item["alertas"] == 1 and len(item["intervalos"]) == 1
        csv = await exportar_csv_admin(admin,db,inicio=None,fim=None,envoxer_id=trabalhador.id,gestor_id=None,tarefa_id=None)
        assert "Colaborador teste" in csv.body.decode("utf-8")
        print("HISTORY_AND_CSV_OK")

        terminado = await informar_atividade(AtividadePayload(idle_seconds=0, origem="desktop"),trabalhador,db)
        assert terminado["recebido"] and not terminado["alerta"]
        abertos = (await db.execute(select(PresencaIntervalo).where(
            PresencaIntervalo.registro_foco_id == foco.id))).scalars().all()
        assert len(abertos) == 1 and abertos[0].fim is not None
        print("IDLE_INTERVAL_CLOSED_OK")

        foco.pausado_em = now
        pausado = await informar_atividade(AtividadePayload(idle_seconds=1800, origem="desktop"),trabalhador,db)
        assert not pausado["recebido"]
        print("PAUSED_TIMER_UNCHANGED_OK")

        nova = await atualizar_config(
            PresencaConfigPayload(monitoramento_ativo=True,inatividade_min=8,alerta_min=18,
                                  retencao_dias=90,notificar_colaborador=True),
            admin,db,
        )
        assert nova["inatividade_min"] == 8 and not nova["camera_habilitada"]
        await db.flush()
        log = (await db.execute(select(PresencaAuditoria))).scalars().all()
        assert any(l.acao == "consultar_dashboard" for l in log)
        assert any(l.acao == "exportar_csv" for l in log)
        assert any(l.acao == "alterar_config" for l in log)
        print("ADMIN_AUDIT_AND_CONFIG_OK")

        await db.rollback()

    print("ALL_PRESENCA_TESTS_OK")


if __name__ == "__main__":
    asyncio.run(run())
