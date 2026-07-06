"""F2 Módulo 3 — Pulso de Satisfação (nota mensal) e Check-in (registro de contato)."""
import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.pulso_satisfacao import PulsoSatisfacao, METODO_PULSO_VALUES
from app.models.check_in import CheckIn, TIPO_CHECKIN_VALUES, MOTIVO_CHECKIN_VALUES, HUMOR_CHECKIN_VALUES
from app.schemas.pulso import PulsoCreate, PulsoResponse
from app.schemas.checkin import CheckInCreate, CheckInResponse

router = APIRouter(tags=["pulso-checkin"])

_ANO_MES_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


async def _obter_cliente_ou_404(db: AsyncSession, cliente_id: int) -> Cliente:
    result = await db.execute(
        select(Cliente).where(and_(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


def _to_pulso_response(pulso: PulsoSatisfacao, envoxer_nome: Optional[str] = None) -> PulsoResponse:
    resp = PulsoResponse.model_validate(pulso)
    resp.registrado_por_envoxer_nome = envoxer_nome
    return resp


def _to_checkin_response(checkin: CheckIn, envoxer_nome: Optional[str] = None) -> CheckInResponse:
    resp = CheckInResponse.model_validate(checkin)
    resp.responsavel_nome = envoxer_nome
    return resp


@router.post("/clientes/{cliente_id}/pulso", response_model=PulsoResponse, status_code=201)
async def registrar_pulso(
    cliente_id: int,
    payload: PulsoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _ANO_MES_RE.match(payload.ano_mes):
        raise HTTPException(status_code=400, detail="ano_mes deve estar no formato YYYY-MM")
    if not (0 <= payload.nota <= 10):
        raise HTTPException(status_code=400, detail="nota deve estar entre 0 e 10")
    if payload.metodo not in METODO_PULSO_VALUES:
        raise HTTPException(status_code=400, detail="metodo inválido")

    await _obter_cliente_ou_404(db, cliente_id)

    result = await db.execute(
        select(PulsoSatisfacao).where(
            and_(PulsoSatisfacao.cliente_id == cliente_id, PulsoSatisfacao.ano_mes == payload.ano_mes)
        )
    )
    pulso = result.scalar_one_or_none()
    if pulso is None:
        pulso = PulsoSatisfacao(cliente_id=cliente_id, ano_mes=payload.ano_mes)
        db.add(pulso)

    pulso.nota = payload.nota
    pulso.comentario = payload.comentario
    pulso.metodo = payload.metodo
    pulso.respondente_cliente_nome = payload.respondente_cliente_nome
    pulso.registrado_por_envoxer_id = envoxer.id

    await db.flush()
    await db.refresh(pulso)
    return _to_pulso_response(pulso, envoxer.nome)


@router.get("/clientes/{cliente_id}/pulso", response_model=list[PulsoResponse])
async def listar_pulso(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_cliente_ou_404(db, cliente_id)
    result = await db.execute(
        select(PulsoSatisfacao, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == PulsoSatisfacao.registrado_por_envoxer_id)
        .where(PulsoSatisfacao.cliente_id == cliente_id)
        .order_by(PulsoSatisfacao.ano_mes.desc())
    )
    return [_to_pulso_response(p, nome) for p, nome in result.all()]


@router.post("/clientes/{cliente_id}/checkins", response_model=CheckInResponse, status_code=201)
async def registrar_checkin(
    cliente_id: int,
    payload: CheckInCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.tipo not in TIPO_CHECKIN_VALUES:
        raise HTTPException(status_code=400, detail="tipo inválido")
    if payload.motivo not in MOTIVO_CHECKIN_VALUES:
        raise HTTPException(status_code=400, detail="motivo inválido")
    if payload.humor is not None and payload.humor not in HUMOR_CHECKIN_VALUES:
        raise HTTPException(status_code=400, detail="humor inválido")

    await _obter_cliente_ou_404(db, cliente_id)

    checkin = CheckIn(
        cliente_id=cliente_id,
        data_realizado=payload.data_realizado,
        tipo=payload.tipo,
        motivo=payload.motivo,
        humor=payload.humor,
        observacao=payload.observacao,
        proximo_sugerido=payload.proximo_sugerido,
        responsavel_envoxer_id=envoxer.id,
    )
    db.add(checkin)
    await db.flush()
    await db.refresh(checkin)
    return _to_checkin_response(checkin, envoxer.nome)


@router.get("/clientes/{cliente_id}/checkins", response_model=list[CheckInResponse])
async def listar_checkins(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_cliente_ou_404(db, cliente_id)
    result = await db.execute(
        select(CheckIn, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == CheckIn.responsavel_envoxer_id)
        .where(CheckIn.cliente_id == cliente_id)
        .order_by(CheckIn.data_realizado.desc())
    )
    return [_to_checkin_response(c, nome) for c, nome in result.all()]
