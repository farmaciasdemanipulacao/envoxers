"""Monitoramento de Presença (mínimo necessário, consentimento e auditoria).

A ausência de eventos de entrada NÃO prova ausência de trabalho. Não coleta
conteúdo digitado, janelas, screenshots, microfone ou imagens de câmera.
"""
import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.registro_foco import RegistroFoco
from app.models.tarefa import Tarefa
from app.models.comercial import ComercialTask
from app.models.demanda_avulsa import DemandaAvulsa
from app.models.presenca import (
    PresencaAuditoria, PresencaConfig, PresencaEstado, PresencaIntervalo,
)
from app.services.chat_ws_manager import chat_ws_manager


router = APIRouter(prefix="/presenca", tags=["monitoramento-presenca"])
TZ = ZoneInfo("America/Sao_Paulo")
ONLINE_TOLERANCIA = timedelta(seconds=150)


def agora_utc():
    return datetime.now(timezone.utc)


class AtividadePayload(BaseModel):
    # Duração de ociosidade agregada, nunca eventos ou teclas individuais.
    idle_seconds: int = Field(ge=0, le=86400)
    origem: Literal["desktop", "web"]


class PresencaConfigPayload(BaseModel):
    monitoramento_ativo: bool
    inatividade_min: int = Field(ge=2, le=120)
    alerta_min: int = Field(ge=2, le=240)
    retencao_dias: int = Field(ge=30, le=365)
    notificar_colaborador: bool

    @model_validator(mode="after")
    def validar_alerta(self):
        if self.alerta_min < self.inatividade_min:
            raise ValueError("O alerta não pode ocorrer antes da inatividade")
        return self


async def config_atual(db):
    item = await db.get(PresencaConfig, 1)
    if item is None:
        raise HTTPException(status_code=503, detail="Módulo não migrado: presenca_config ausente")
    return item


def config_dict(config):
    return {
        "monitoramento_ativo": config.monitoramento_ativo,
        "inatividade_min": config.inatividade_min,
        "alerta_min": config.alerta_min,
        "retencao_dias": config.retencao_dias,
        "notificar_colaborador": config.notificar_colaborador,
        "camera_habilitada": False,  # recurso ainda indisponível e sempre desligado
        "limites": "Ociosidade de teclado/mouse é indício, não prova de ausência.",
    }


def auditar(db, admin, acao, alvo=None, **detalhes):
    db.add(PresencaAuditoria(
        admin_envoxer_id=admin.id, acao=acao,
        alvo_envoxer_id=alvo, detalhes=detalhes,
    ))


async def limpeza_se_necessaria(db, config, now):
    if config.ultima_limpeza_em and (now - config.ultima_limpeza_em) < timedelta(days=1):
        return
    await db.execute(delete(PresencaIntervalo).where(
        PresencaIntervalo.inicio < now - timedelta(days=config.retencao_dias)
    ))
    # Estado agregado também segue retenção. Não guardar o último sinal para sempre.
    await db.execute(delete(PresencaEstado).where(
        PresencaEstado.ultimo_heartbeat < now - timedelta(days=config.retencao_dias)
    ))
    # Auditoria tem ciclo fixo e separado de 365 dias.
    await db.execute(delete(PresencaAuditoria).where(
        PresencaAuditoria.criado_em < now - timedelta(days=365)
    ))
    config.ultima_limpeza_em = now


async def fechar_intervalo(db, estado, fim, *, limitar_observacao=False):
    if not estado or not estado.intervalo_aberto_id:
        return
    intervalo = await db.get(PresencaIntervalo, estado.intervalo_aberto_id)
    if intervalo and intervalo.fim is None:
        # Sem amostras, não extrapolar inatividade além da última observação.
        if limitar_observacao:
            fim = min(fim, intervalo.ultima_observacao_em)
        intervalo.fim = max(intervalo.inicio, fim)
    estado.intervalo_aberto_id = None


async def foco_do_usuario(db, user_id):
    return (await db.execute(select(RegistroFoco).where(
        RegistroFoco.envoxer_id == user_id,
        RegistroFoco.fim.is_(None),
        RegistroFoco.descartado.is_(False),
    ).order_by(RegistroFoco.inicio.desc()).limit(1))).scalar_one_or_none()


@router.get("/me/config")
async def minha_configuracao(
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    config = await config_atual(db)
    return config_dict(config)


@router.post("/me/atividade")
async def informar_atividade(
    payload: AtividadePayload,
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    config = await config_atual(db)
    foco = await foco_do_usuario(db, usuario.id)
    if not config.monitoramento_ativo or not foco or foco.pausado_em:
        return {"ok": True, "recebido": False, "motivo": "sem_foco_em_execucao"}
    now = agora_utc()
    estado = await db.get(PresencaEstado, usuario.id, with_for_update=True)
    if estado is None:
        estado = PresencaEstado(envoxer_id=usuario.id)
        db.add(estado)
        await db.flush()

    # Uma aba web não deve sobrescrever uma amostra nativa recente do desktop.
    if (payload.origem == "web" and estado.fonte == "desktop"
            and estado.ultimo_heartbeat and now - estado.ultimo_heartbeat < ONLINE_TOLERANCIA
            and estado.registro_foco_id == foco.id):
        return {"ok": True, "recebido": False, "motivo": "desktop_prioritario"}

    if estado.registro_foco_id != foco.id:
        await fechar_intervalo(db, estado, estado.ultimo_heartbeat or now, limitar_observacao=True)
        estado.registro_foco_id = foco.id
        estado.ultima_interacao = None

    # Navegador: apenas presença NO ENVOXERS. Não classificar como ociosidade
    # do computador quando o trabalho estiver em outra aplicação.
    atraso = min(payload.idle_seconds, max(0, int((now - foco.inicio).total_seconds())))
    ultima_acao = now - timedelta(seconds=atraso)
    estado.ultimo_heartbeat = now
    estado.fonte = payload.origem
    estado.ultima_interacao = ultima_acao

    alerta = False
    if payload.origem == "desktop" and atraso >= config.inatividade_min * 60:
        aberto = (await db.get(PresencaIntervalo, estado.intervalo_aberto_id)
                  if estado.intervalo_aberto_id else None)
        if aberto is None or aberto.registro_foco_id != foco.id:
            aberto = PresencaIntervalo(
                envoxer_id=usuario.id, registro_foco_id=foco.id,
                inicio=max(foco.inicio, ultima_acao),
                ultima_observacao_em=now, fonte="desktop",
            )
            db.add(aberto)
            await db.flush()
            estado.intervalo_aberto_id = aberto.id
        else:
            aberto.ultima_observacao_em = now
            # A primeira amostra pode chegar quando o usuário já estava ocioso;
            # preserve o início mais antigo detectado dentro da sessão.
            aberto.inicio = max(foco.inicio, min(aberto.inicio, ultima_acao))
        if atraso >= config.alerta_min * 60:
            alerta = True
            if aberto.alerta_em is None:
                aberto.alerta_em = now
    else:
        await fechar_intervalo(db, estado, ultima_acao)
    await limpeza_se_necessaria(db, config, now)
    return {
        "ok": True, "recebido": True, "alerta": alerta,
        "inatividade": payload.origem == "desktop" and atraso >= config.inatividade_min * 60,
        "notificar_colaborador": config.notificar_colaborador,
    }


@router.post("/me/encerrar")
async def encerrar_amostra(
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    estado = await db.get(PresencaEstado, usuario.id, with_for_update=True)
    if estado:
        await fechar_intervalo(db, estado, agora_utc(), limitar_observacao=True)
    return {"ok": True}


@router.get("/admin/config")
async def ler_config(
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    config = await config_atual(db)
    auditar(db, admin, "consultar_config")
    return config_dict(config)


@router.put("/admin/config")
async def atualizar_config(
    payload: PresencaConfigPayload,
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    config = await config_atual(db)
    antes = config_dict(config)
    for campo, valor in payload.model_dump().items():
        setattr(config, campo, valor)
    auditar(db, admin, "alterar_config", anterior=antes, nova=config_dict(config))
    await limpeza_se_necessaria(db, config, agora_utc())
    return config_dict(config)


def _titulo_foco(reg, tarefas, comerciais, avulsas):
    if not reg:
        return None
    if reg.tarefa_id:
        return tarefas.get(reg.tarefa_id, "Tarefa removida")
    if reg.comercial_task_id:
        return comerciais.get(reg.comercial_task_id, "Tarefa comercial removida")
    if reg.demanda_avulsa_id:
        return avulsas.get(reg.demanda_avulsa_id, "Demanda avulsa removida")
    return "Foco sem tarefa"


async def titulos_foco(db, registros):
    tarefas_ids = {r.tarefa_id for r in registros if r.tarefa_id}
    comerciais_ids = {r.comercial_task_id for r in registros if r.comercial_task_id}
    avulsas_ids = {r.demanda_avulsa_id for r in registros if r.demanda_avulsa_id}
    tarefas = dict((await db.execute(select(Tarefa.id, Tarefa.titulo).where(Tarefa.id.in_(tarefas_ids)))).all()) if tarefas_ids else {}
    comerciais = dict((await db.execute(select(ComercialTask.id, ComercialTask.titulo).where(ComercialTask.id.in_(comerciais_ids)))).all()) if comerciais_ids else {}
    avulsas = dict((await db.execute(select(DemandaAvulsa.id, DemandaAvulsa.titulo).where(DemandaAvulsa.id.in_(avulsas_ids)))).all()) if avulsas_ids else {}
    return tarefas, comerciais, avulsas


def segundos_foco(reg, now):
    if not reg:
        return 0
    if reg.fim:
        return max(0, int(reg.duracao_segundos or (reg.duracao_min or 0) * 60))
    fim = reg.pausado_em or now
    return max(0, int((fim - reg.inicio).total_seconds()) - int(reg.duracao_pausada_segundos or 0))


@router.get("/admin/dashboard")
async def dashboard_admin(
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer_id: Optional[int] = Query(None),
    gestor_id: Optional[int] = Query(None),
    status: Optional[Literal["ativo", "pausado", "encerrado", "sem_timer", "possivel_inatividade"]] = Query(None),
    tarefa_id: Optional[int] = Query(None),
):
    config = await config_atual(db)
    now = agora_utc()
    pessoas_q = select(Envoxer).where(Envoxer.ativo.is_(True), Envoxer.deleted_at.is_(None))
    if envoxer_id:
        pessoas_q = pessoas_q.where(Envoxer.id == envoxer_id)
    if gestor_id:
        pessoas_q = pessoas_q.where(Envoxer.gestor_responsavel_id == gestor_id)
    pessoas = (await db.execute(pessoas_q.order_by(Envoxer.nome))).scalars().all()
    ids = [p.id for p in pessoas]
    registros = (await db.execute(select(RegistroFoco).where(
        RegistroFoco.envoxer_id.in_(ids),
        RegistroFoco.descartado.is_(False),
        ((RegistroFoco.fim.is_(None)) | (RegistroFoco.fim >= now - timedelta(days=30))),
    ).order_by(RegistroFoco.inicio.desc()).limit(3000))).scalars().all() if ids else []
    ultimos = {}
    for reg in registros:
        ultimos.setdefault(reg.envoxer_id, reg)
    estados = {
        e.envoxer_id: e for e in (
            (await db.execute(select(PresencaEstado).where(PresencaEstado.envoxer_id.in_(ids)))).scalars().all()
        )
    } if ids else {}
    tarefas, comerciais, avulsas = await titulos_foco(db, list(ultimos.values()))

    saida = []
    for p in pessoas:
        reg = ultimos.get(p.id)
        estado = estados.get(p.id)
        situacao = ("sem_timer" if not reg else "encerrado" if reg.fim
                    else "pausado" if reg.pausado_em else "ativo")
        fresco = bool(
            estado and estado.ultimo_heartbeat
            and now - estado.ultimo_heartbeat <= ONLINE_TOLERANCIA
            and reg and reg.id == estado.registro_foco_id
        )
        idle = (max(0, int((now - estado.ultima_interacao).total_seconds()))
                if fresco and estado.fonte == "desktop" and estado.ultima_interacao
                and situacao == "ativo" else None)
        possivel = bool(idle is not None and idle >= config.inatividade_min * 60)
        if status and not (status == situacao or (status == "possivel_inatividade" and possivel)):
            continue
        if tarefa_id and (not reg or reg.tarefa_id != tarefa_id):
            continue
        ws_status = chat_ws_manager.status_de(p.id)
        conectado = ws_status != "offline" or fresco
        saida.append({
            "envoxer_id": p.id,
            "nome": p.nome, "foto_url": p.foto_url, "cargo": p.cargo,
            "gestor_id": p.gestor_responsavel_id,
            "online": conectado, "presenca_envoxers": ws_status,
            "timer_status": situacao, "registro_foco_id": reg.id if reg else None,
            "tarefa_id": reg.tarefa_id if reg else None,
            "tarefa": _titulo_foco(reg, tarefas, comerciais, avulsas),
            "inicio": reg.inicio if reg else None,
            "fim": reg.fim if reg else None,
            "duracao_segundos": segundos_foco(reg, now),
            "ultimo_heartbeat": estado.ultimo_heartbeat if fresco else None,
            "ultima_interacao": estado.ultima_interacao if fresco else None,
            "inatividade_segundos": idle, "possivel_inatividade": possivel,
            "alerta": bool(idle is not None and idle >= config.alerta_min * 60),
            "fonte": estado.fonte if fresco else None,
        })
    auditar(db, admin, "consultar_dashboard", envoxer_id, gestor_id=gestor_id, status=status, tarefa_id=tarefa_id)
    return {"atualizado_em": now, "config": config_dict(config), "colaboradores": saida}


def limites_historico(inicio, fim):
    hoje = datetime.now(TZ).date()
    fim = fim or hoje
    inicio = inicio or fim - timedelta(days=6)
    if fim < inicio or (fim - inicio).days > 92:
        raise HTTPException(status_code=422, detail="Período inválido: máximo de 93 dias")
    return (
        datetime.combine(inicio, time.min, tzinfo=TZ).astimezone(timezone.utc),
        datetime.combine(fim + timedelta(days=1), time.min, tzinfo=TZ).astimezone(timezone.utc),
    )


async def consulta_historico(db, inicio, fim, envoxer_id, gestor_id, tarefa_id):
    comeco, final = limites_historico(inicio, fim)
    stmt = (
        select(RegistroFoco, Envoxer)
        .join(Envoxer, Envoxer.id == RegistroFoco.envoxer_id)
        .where(RegistroFoco.inicio >= comeco, RegistroFoco.inicio < final,
               RegistroFoco.descartado.is_(False))
        .order_by(RegistroFoco.inicio.desc())
        .limit(5000)
    )
    if envoxer_id:
        stmt = stmt.where(RegistroFoco.envoxer_id == envoxer_id)
    if gestor_id:
        stmt = stmt.where(Envoxer.gestor_responsavel_id == gestor_id)
    if tarefa_id:
        stmt = stmt.where(RegistroFoco.tarefa_id == tarefa_id)
    rows = (await db.execute(stmt)).all()
    focos = [x[0] for x in rows]
    titulos = await titulos_foco(db, focos)
    ids = [x.id for x in focos]
    intervals = (await db.execute(select(PresencaIntervalo).where(
        PresencaIntervalo.registro_foco_id.in_(ids)
    ).order_by(PresencaIntervalo.inicio))).scalars().all() if ids else []
    intervalos_por_foco = {}
    for it in intervals:
        intervalos_por_foco.setdefault(it.registro_foco_id, []).append(it)
    result = []
    now = agora_utc()
    for reg, envoxer in rows:
        it = intervalos_por_foco.get(reg.id, [])
        result.append({
            "data": reg.inicio.astimezone(TZ).date(),
            "envoxer_id": envoxer.id, "envoxer": envoxer.nome,
            "tarefa_id": reg.tarefa_id,
            "tarefa": _titulo_foco(reg, *titulos),
            "registro_foco_id": reg.id,
            "inicio": reg.inicio, "fim": reg.fim,
            "status": "encerrado" if reg.fim else "pausado" if reg.pausado_em else "ativo",
            "duracao_segundos": segundos_foco(reg, now),
            "pausas_segundos": int(reg.duracao_pausada_segundos or 0)
                              + (max(0, int((now - reg.pausado_em).total_seconds())) if reg.pausado_em else 0),
            "intervalos": [{
                "inicio": x.inicio,
                "fim": x.fim or min(x.ultima_observacao_em, reg.fim or now),
                "alerta": x.alerta_em is not None,
                "origem": x.fonte,
            } for x in it],
            "alertas": sum(x.alerta_em is not None for x in it),
            "justificativa": reg.comentario,
            "ajustes_admin": reg.ajustes_admin or [],
        })
    return result


@router.get("/admin/historico")
async def historico_admin(
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    inicio: Optional[date] = None,
    fim: Optional[date] = None,
    envoxer_id: Optional[int] = None,
    gestor_id: Optional[int] = None,
    tarefa_id: Optional[int] = None,
):
    registros = await consulta_historico(db, inicio, fim, envoxer_id, gestor_id, tarefa_id)
    auditar(db, admin, "consultar_historico", envoxer_id, inicio=str(inicio), fim=str(fim))
    return {"registros": registros, "total": len(registros)}


@router.get("/admin/exportar.csv")
async def exportar_csv_admin(
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    inicio: Optional[date] = None,
    fim: Optional[date] = None,
    envoxer_id: Optional[int] = None,
    gestor_id: Optional[int] = None,
    tarefa_id: Optional[int] = None,
):
    registros = await consulta_historico(db, inicio, fim, envoxer_id, gestor_id, tarefa_id)
    buf = io.StringIO()
    out = csv.writer(buf, delimiter=";")
    out.writerow(["Data", "Colaborador", "Tarefa", "Foco", "Início UTC", "Fim UTC",
                  "Tempo s", "Pausas s", "Intervalos possíveis", "Alertas", "Justificativa", "Correções"])
    for r in registros:
        out.writerow([r["data"], r["envoxer"], r["tarefa"], r["registro_foco_id"],
                      r["inicio"].isoformat(), r["fim"].isoformat() if r["fim"] else "",
                      r["duracao_segundos"], r["pausas_segundos"],
                      len(r["intervalos"]), r["alertas"],
                      r["justificativa"] or "", len(r["ajustes_admin"])])
    auditar(db, admin, "exportar_csv", envoxer_id, inicio=str(inicio), fim=str(fim),
            quantidade=len(registros))
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="envoxers-presenca.csv"',
                             "Cache-Control": "no-store"})


@router.get("/admin/auditoria")
async def auditoria_admin(
    admin: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    logs = (await db.execute(select(PresencaAuditoria).order_by(
        PresencaAuditoria.criado_em.desc()).limit(100))).scalars().all()
    auditar(db, admin, "consultar_auditoria")
    return [{"id": l.id, "admin_envoxer_id": l.admin_envoxer_id, "acao": l.acao,
             "alvo_envoxer_id": l.alvo_envoxer_id, "detalhes": l.detalhes,
             "criado_em": l.criado_em} for l in logs]
