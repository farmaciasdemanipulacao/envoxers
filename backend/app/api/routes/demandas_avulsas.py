from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.demanda_avulsa import DemandaAvulsa
from app.models.envoxer import Envoxer
from app.api.routes.registro_foco import finalizar_foco_ativo_da_demanda_avulsa
from app.schemas.demanda_avulsa import (
    DemandaAvulsaCreate, DemandaAvulsaUpdate, DemandaAvulsaResponse,
    STATUS_AVULSA, PRIORIDADES_AVULSA,
)

router = APIRouter(prefix="/demandas-avulsas", tags=["demandas-avulsas"])

async def _serialize(db: AsyncSession, item: DemandaAvulsa) -> DemandaAvulsaResponse:
    ids = [x for x in (item.responsavel_envoxer_id, item.criado_por_envoxer_id) if x]
    pessoas = {}
    if ids:
        pessoas = {e.id: e for e in (await db.execute(select(Envoxer).where(Envoxer.id.in_(ids)))).scalars().all()}
    resp = pessoas.get(item.responsavel_envoxer_id)
    criador = pessoas.get(item.criado_por_envoxer_id)
    return DemandaAvulsaResponse(
        id=item.id,
        contexto=item.contexto,
        titulo=item.titulo,
        descricao=item.descricao,
        responsavel_envoxer_id=item.responsavel_envoxer_id,
        responsavel_nome=resp.nome if resp else None,
        responsavel_foto=resp.foto_url if resp else None,
        criado_por_envoxer_id=item.criado_por_envoxer_id,
        criado_por_nome=criador.nome if criador else None,
        prazo=item.prazo,
        prioridade=item.prioridade,
        status=item.status,
        concluida_em=item.concluida_em,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )

def _validar(prioridade: Optional[str] = None, status: Optional[str] = None) -> None:
    if prioridade is not None and prioridade not in PRIORIDADES_AVULSA:
        raise HTTPException(status_code=422, detail="Prioridade inválida")
    if status is not None and status not in STATUS_AVULSA:
        raise HTTPException(status_code=422, detail="Status inválido")

@router.get("", response_model=list[DemandaAvulsaResponse])
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    status: Optional[str] = Query(None),
):
    stmt = select(DemandaAvulsa).where(DemandaAvulsa.deleted_at.is_(None))
    if status:
        stmt = stmt.where(DemandaAvulsa.status == status)
    prioridade_ordem = {"critica": 0, "alta": 1, "media": 2, "baixa": 3}
    itens = list((await db.execute(stmt.order_by(DemandaAvulsa.prazo.asc().nullslast(), DemandaAvulsa.created_at.desc()))).scalars().all())
    itens.sort(key=lambda x: (prioridade_ordem.get(x.prioridade, 9), x.prazo is None, x.prazo or datetime.max.date()))
    return [await _serialize(db, x) for x in itens]

@router.post("", response_model=DemandaAvulsaResponse, status_code=201)
async def criar(
    payload: DemandaAvulsaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    _validar(prioridade=payload.prioridade)
    responsavel = payload.responsavel_envoxer_id
    if envoxer.permissao not in ("admin", "gestor"):
        responsavel = envoxer.id
    item = DemandaAvulsa(
        contexto=payload.contexto.strip(),
        titulo=payload.titulo.strip(),
        descricao=(payload.descricao or "").strip() or None,
        responsavel_envoxer_id=responsavel,
        criado_por_envoxer_id=envoxer.id,
        prazo=payload.prazo,
        prioridade=payload.prioridade,
        status="nova",
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)

@router.patch("/{demanda_id}", response_model=DemandaAvulsaResponse)
async def editar(
    demanda_id: int,
    payload: DemandaAvulsaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = (await db.execute(select(DemandaAvulsa).where(DemandaAvulsa.id == demanda_id, DemandaAvulsa.deleted_at.is_(None)))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Demanda avulsa não encontrada")
    dados = payload.model_dump(exclude_unset=True)
    _validar(prioridade=dados.get("prioridade"), status=dados.get("status"))
    if envoxer.permissao not in ("admin", "gestor"):
        if item.responsavel_envoxer_id != envoxer.id:
            raise HTTPException(status_code=403, detail="Você só pode atualizar demandas atribuídas a você")
        permitidos = {"status"}
        if set(dados) - permitidos:
            raise HTTPException(status_code=403, detail="Somente gestor ou admin pode editar os dados da demanda")
    for campo, valor in dados.items():
        if campo in ("contexto", "titulo") and isinstance(valor, str):
            valor = valor.strip()
        if campo == "descricao" and isinstance(valor, str):
            valor = valor.strip() or None
        setattr(item, campo, valor)
    if "status" in dados:
        item.concluida_em = datetime.now(timezone.utc) if dados["status"] == "concluida" else None
        if dados["status"] == "concluida":
            await finalizar_foco_ativo_da_demanda_avulsa(
                db, demanda_id, comentario="Finalizado automaticamente — demanda avulsa concluída"
            )
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)

@router.delete("/{demanda_id}", status_code=204)
async def excluir(
    demanda_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    item = (await db.execute(select(DemandaAvulsa).where(DemandaAvulsa.id == demanda_id, DemandaAvulsa.deleted_at.is_(None)))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Demanda avulsa não encontrada")
    await finalizar_foco_ativo_da_demanda_avulsa(
        db, demanda_id, comentario="Finalizado automaticamente — demanda avulsa excluída"
    )
    item.deleted_at = datetime.now(timezone.utc)
    await db.flush()
