"""F2 Módulo 2 — Solicitações do Cliente (inbox do atendimento)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.core.uploads import salvar_upload
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.solicitacao import Solicitacao, TIPO_SOLICITACAO_VALUES, STATUS_SOLICITACAO_VALUES
from app.models.tarefa import Tarefa
from app.schemas.solicitacao import SolicitacaoCreate, SolicitacaoUpdate, SolicitacaoResponse

router = APIRouter(prefix="/solicitacoes", tags=["solicitacoes"])

# tipo de solicitação -> tipo_tarefa do catálogo, quando existe correspondência direta.
_TIPO_TAREFA_MAP = {"campanha": "Campanha de tráfego"}


def _to_response(solicitacao: Solicitacao, cliente_nome: Optional[str] = None) -> SolicitacaoResponse:
    resp = SolicitacaoResponse.model_validate(solicitacao)
    resp.cliente_nome = cliente_nome
    return resp


async def _obter_solicitacao_ou_404(db: AsyncSession, solicitacao_id: int) -> Solicitacao:
    result = await db.execute(select(Solicitacao).where(Solicitacao.id == solicitacao_id))
    solicitacao = result.scalar_one_or_none()
    if solicitacao is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    return solicitacao


@router.post("", response_model=SolicitacaoResponse, status_code=201)
async def criar_solicitacao(
    payload: SolicitacaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.tipo not in TIPO_SOLICITACAO_VALUES:
        raise HTTPException(status_code=400, detail="tipo inválido")

    cliente_result = await db.execute(select(Cliente).where(Cliente.id == payload.cliente_id))
    cliente = cliente_result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    solicitacao = Solicitacao(**payload.model_dump())
    db.add(solicitacao)
    await db.flush()
    await db.refresh(solicitacao)
    return _to_response(solicitacao, cliente.nome)


@router.get("", response_model=list[SolicitacaoResponse])
async def listar_solicitacoes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    cliente_id: Optional[int] = None,
    status: Optional[str] = None,
    tipo: Optional[str] = None,
):
    stmt = select(Solicitacao, Cliente.nome).join(Cliente, Cliente.id == Solicitacao.cliente_id)
    if cliente_id is not None:
        stmt = stmt.where(Solicitacao.cliente_id == cliente_id)
    if status is not None:
        stmt = stmt.where(Solicitacao.status == status)
    if tipo is not None:
        stmt = stmt.where(Solicitacao.tipo == tipo)
    stmt = stmt.order_by(Solicitacao.created_at.desc())

    result = await db.execute(stmt)
    return [_to_response(s, cliente_nome) for s, cliente_nome in result.all()]


@router.get("/{solicitacao_id}", response_model=SolicitacaoResponse)
async def obter_solicitacao(
    solicitacao_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Solicitacao, Cliente.nome)
        .join(Cliente, Cliente.id == Solicitacao.cliente_id)
        .where(Solicitacao.id == solicitacao_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    return _to_response(*row)


@router.patch("/{solicitacao_id}", response_model=SolicitacaoResponse)
async def atualizar_solicitacao(
    solicitacao_id: int,
    payload: SolicitacaoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    solicitacao = await _obter_solicitacao_ou_404(db, solicitacao_id)
    updates = payload.model_dump(exclude_unset=True)

    if "status" in updates:
        novo_status = updates["status"]
        if novo_status not in STATUS_SOLICITACAO_VALUES:
            raise HTTPException(status_code=400, detail="status inválido")
        if novo_status == "recusada" and not updates.get("motivo_recusa") and not solicitacao.motivo_recusa:
            raise HTTPException(status_code=400, detail="motivo_recusa é obrigatório ao recusar")
        if novo_status == "virou_demanda":
            raise HTTPException(
                status_code=400,
                detail="Para virar demanda use POST /solicitacoes/{id}/virar-demanda",
            )
        if novo_status in ("em_analise", "recusada"):
            solicitacao.atendido_por_envoxer_id = envoxer.id
            solicitacao.respondido_em = datetime.now(timezone.utc)

    for field, value in updates.items():
        setattr(solicitacao, field, value)
    await db.flush()
    await db.refresh(solicitacao)

    cliente_result = await db.execute(select(Cliente.nome).where(Cliente.id == solicitacao.cliente_id))
    cliente_nome = cliente_result.scalar_one_or_none()
    return _to_response(solicitacao, cliente_nome)


@router.post("/{solicitacao_id}/anexos", response_model=SolicitacaoResponse)
async def anexar_arquivo_solicitacao(
    solicitacao_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    arquivo: UploadFile = File(...),
):
    solicitacao = await _obter_solicitacao_ou_404(db, solicitacao_id)
    salvo = await salvar_upload(arquivo)
    anexos = list(solicitacao.anexos or [])
    anexos.append({
        **salvo,
        "enviado_por_envoxer_id": envoxer.id,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    })
    solicitacao.anexos = anexos
    await db.flush()
    await db.refresh(solicitacao)

    cliente_result = await db.execute(select(Cliente.nome).where(Cliente.id == solicitacao.cliente_id))
    cliente_nome = cliente_result.scalar_one_or_none()
    return _to_response(solicitacao, cliente_nome)


@router.post("/{solicitacao_id}/virar-demanda", response_model=SolicitacaoResponse)
async def virar_demanda(
    solicitacao_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    solicitacao = await _obter_solicitacao_ou_404(db, solicitacao_id)
    if solicitacao.status == "virou_demanda":
        raise HTTPException(status_code=400, detail="Solicitação já virou demanda")

    comentarios = []
    if solicitacao.descricao:
        comentarios.append({
            "envoxer_id": envoxer.id,
            "envoxer_nome": envoxer.nome,
            "texto": f"Solicitação original do cliente ({solicitacao.tipo}): {solicitacao.descricao}",
            "criado_em": datetime.now(timezone.utc).isoformat(),
        })

    tarefa = Tarefa(
        cliente_id=solicitacao.cliente_id,
        titulo=solicitacao.titulo,
        tipo_tarefa=_TIPO_TAREFA_MAP.get(solicitacao.tipo),
        status="nova",
        comentarios=comentarios,
    )
    db.add(tarefa)
    await db.flush()
    await db.refresh(tarefa)

    solicitacao.status = "virou_demanda"
    solicitacao.tarefa_id_gerada = tarefa.id
    solicitacao.atendido_por_envoxer_id = envoxer.id
    solicitacao.respondido_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(solicitacao)

    cliente_result = await db.execute(select(Cliente.nome).where(Cliente.id == solicitacao.cliente_id))
    cliente_nome = cliente_result.scalar_one_or_none()
    return _to_response(solicitacao, cliente_nome)
