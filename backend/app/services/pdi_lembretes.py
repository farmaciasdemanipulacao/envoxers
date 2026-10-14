"""Lembretes de PDI no servidor, independentes de a pessoa abrir a tela.

Envio apenas no horário comercial de São Paulo, com deduplicação persistente.
Necessita inscrição no Web Push feita voluntariamente pelo usuário no Envoxers.
"""
import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import structlog
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.pdi_jornada import PdiJornada, PdiRegistro, PdiLembreteEnvio
from app.models.envoxer import Envoxer
from app.models.push_subscription import PushSubscription
from app.services.push import broadcast_push

logger=structlog.get_logger()
TZ=ZoneInfo("America/Sao_Paulo")

async def executar_lembretes():
    agora=datetime.now(TZ)
    hoje=agora.date()
    if hoje.weekday()>4 or not 9<=agora.hour<=17:
        return {"enviados":0,"motivo":"fora_horario"}
    enviados=0
    async with AsyncSessionLocal() as db:
        js=(await db.execute(select(PdiJornada).where(PdiJornada.status=="ativa",PdiJornada.lembrete_ativo.is_(True)))).scalars().all()
        subscribers={id for (id,) in (await db.execute(select(PushSubscription.envoxer_id).distinct())).all()}
        pendentes=[]
        for j in js:
            passados=(hoje-j.inicio).days
            if passados<0 or passados>(j.fim-j.inicio).days+35: continue
            if hoje.weekday()==j.lembrete_dia and j.envoxer_id in subscribers:
                semana=max(1,passados//7+1)
                inicio_semana=j.inicio+timedelta(days=(semana-1)*7)
                fim_semana=inicio_semana+timedelta(days=7)
                registros=(await db.execute(select(PdiRegistro.id).where(
                    PdiRegistro.jornada_id==j.id,PdiRegistro.tipo=="evidencia",
                    PdiRegistro.criado_em>=datetime.combine(inicio_semana,datetime.min.time(),TZ),
                    PdiRegistro.criado_em<datetime.combine(fim_semana,datetime.min.time(),TZ)
                ))).first()
                if not registros:
                    pendentes.append((j.envoxer_id,f"semana:{j.id}:{semana}",
                        "Sua jornada de desenvolvimento 🌱","Registre uma situação real e o aprendizado desta semana no seu PDI."))
            # Toda segunda: lembrete coletivo para o gestor, sem spam por pessoa.
        gestores={j.gestor_id for j in js}
        if hoje.weekday()==0:
            for gestor in gestores & subscribers:
                pendentes.append((gestor,f"gestor:{gestor}:{hoje.isocalendar().year}-{hoje.isocalendar().week}",
                    "PDI da equipe · revisão semanal","Confira evidências, feedbacks pendentes e próximos marcos de 30/60/90 dias."))
        for receptor,chave,titulo,corpo in pendentes:
            chave="pdi:"+chave
            existe=(await db.execute(select(PdiLembreteEnvio.id).where(PdiLembreteEnvio.chave==chave))).first()
            if existe: continue
            try:
                n=await broadcast_push(db,receptor,title=titulo,body=corpo,tag="envoxers-pdi")
                if n:
                    db.add(PdiLembreteEnvio(destinatario_id=receptor,chave=chave))
                    await db.commit()
                    enviados+=n
            except Exception:
                await db.rollback()
                logger.exception("pdi_lembrete_falhou",destinatario_id=receptor)
    return {"enviados":enviados}

async def loop_lembretes():
    # 1 instância em produção (uvicorn --workers 1). Evita correr no boot antes da migração.
    await asyncio.sleep(90)
    while True:
        try: await executar_lembretes()
        except asyncio.CancelledError: raise
        except Exception: logger.exception("pdi_lembrete_ciclo_falhou")
        await asyncio.sleep(3600)
