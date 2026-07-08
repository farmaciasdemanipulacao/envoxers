"""F3 — Módulo 1: Motivo de Churn — cancelamento de cliente com motivo + snapshot congelado."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.motivo_churn import MotivoChurnCatalogo
from app.models.churn_snapshot import ChurnSnapshot
from app.models.farol_calculo import FarolCalculo
from app.models.perfil_cliente import PerfilCliente
from app.models.pulso_satisfacao import PulsoSatisfacao
from app.schemas.churn import ClienteCancelarRequest, MotivoChurnResponse, ChurnSnapshotResponse, ChurnListaItemResponse

router = APIRouter(tags=["churn"])

# "Total no histórico" da tela de Cancelamentos considera os últimos 24 meses (ver
# hint do KPI no wireframe: "últimos 24 meses").
JANELA_CHURN_LISTA_MESES = 24


@router.get("/churn", response_model=list[ChurnListaItemResponse])
async def listar_churn(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    desde = date.today() - timedelta(days=JANELA_CHURN_LISTA_MESES * 30)
    result = await db.execute(
        select(ChurnSnapshot, MotivoChurnCatalogo.nome)
        .join(MotivoChurnCatalogo, MotivoChurnCatalogo.codigo == ChurnSnapshot.motivo_codigo)
        .where(ChurnSnapshot.data_cancelamento >= desde)
        .order_by(ChurnSnapshot.data_cancelamento.desc())
    )
    respostas = []
    for snapshot, motivo_nome in result.all():
        resp = ChurnListaItemResponse.model_validate(snapshot)
        resp.motivo_nome = motivo_nome
        respostas.append(resp)
    return respostas


def _meses_de_casa_churn(inicio: Optional[date], fim: date) -> int:
    if inicio is None:
        return 0
    return max(0, (fim.year - inicio.year) * 12 + (fim.month - inicio.month))


@router.get("/motivos-churn", response_model=list[MotivoChurnResponse])
async def listar_motivos_churn(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(MotivoChurnCatalogo).order_by(MotivoChurnCatalogo.ordem))
    return list(result.scalars().all())


@router.post("/clientes/{cliente_id}/cancelar", response_model=ChurnSnapshotResponse, status_code=201)
async def cancelar_cliente(
    cliente_id: int,
    payload: ClienteCancelarRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    result = await db.execute(
        select(Cliente).where(and_(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if cliente.data_cancelamento is not None:
        raise HTTPException(status_code=400, detail="Cliente já está cancelado")

    motivo_result = await db.execute(
        select(MotivoChurnCatalogo).where(MotivoChurnCatalogo.codigo == payload.motivo_codigo)
    )
    motivo = motivo_result.scalar_one_or_none()
    if motivo is None:
        raise HTTPException(status_code=400, detail="motivo_codigo inválido")

    data_cancelamento = payload.data_cancelamento or date.today()
    meses_de_casa = _meses_de_casa_churn(cliente.data_inicio_contrato, data_cancelamento)

    perfil_result = await db.execute(
        select(PerfilCliente.perfil).where(PerfilCliente.cliente_id == cliente_id)
    )
    perfil_snap = perfil_result.scalar_one_or_none()

    farol_result = await db.execute(
        select(FarolCalculo.farol, FarolCalculo.sinal_margem_valor).where(FarolCalculo.cliente_id == cliente_id)
    )
    farol_row = farol_result.first()
    farol_ultimo_snap = farol_row[0] if farol_row else cliente.status_farol
    margem_media_snap = float(farol_row[1]) if farol_row and farol_row[1] is not None else None

    pulso_result = await db.execute(
        select(func.avg(PulsoSatisfacao.nota)).where(PulsoSatisfacao.cliente_id == cliente_id)
    )
    pulso_medio = pulso_result.scalar_one_or_none()
    pulso_medio_snap = round(float(pulso_medio), 1) if pulso_medio is not None else None

    snapshot = ChurnSnapshot(
        cliente_id=cliente_id,
        data_cancelamento=data_cancelamento,
        meses_de_casa=meses_de_casa,
        motivo_codigo=payload.motivo_codigo,
        motivo_detalhe=payload.motivo_detalhe,
        quem_registrou_envoxer_id=envoxer.id,
        cliente_nome_snap=cliente.nome,
        segmento_snap=cliente.segmento,
        ticket_snap=cliente.ticket,
        canal_aquisicao_snap=cliente.canal_aquisicao,
        maturidade_snap=cliente.maturidade_digital,
        perfil_snap=perfil_snap,
        valor_contrato_snap=cliente.valor_contrato,
        tipo_receita_snap=cliente.tipo_receita,
        margem_media_snap=margem_media_snap,
        pulso_medio_snap=pulso_medio_snap,
        farol_ultimo_snap=farol_ultimo_snap,
    )
    db.add(snapshot)

    cliente.data_cancelamento = data_cancelamento
    cliente.ativo = False

    await db.flush()
    await db.refresh(snapshot)

    resp = ChurnSnapshotResponse.model_validate(snapshot)
    resp.motivo_nome = motivo.nome
    return resp
