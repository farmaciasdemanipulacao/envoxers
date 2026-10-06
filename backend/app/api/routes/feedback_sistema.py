from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_admin
from app.db.session import get_db
from app.core.uploads import salvar_upload, excluir_upload_url
from app.models.envoxer import Envoxer
from app.models.feedback_sistema import FeedbackSistema
from app.schemas.feedback_sistema import (
    FeedbackSistemaCreate, FeedbackSistemaUpdate, FeedbackSistemaResponse,
    FeedbackSistemaNovosCount,
)

router = APIRouter(prefix="/feedback-sistema", tags=["feedback-sistema"])

@router.post("", response_model=FeedbackSistemaResponse)
async def criar_feedback(
    payload: FeedbackSistemaCreate,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = FeedbackSistema(
        tipo=payload.tipo,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao.strip(),
        pagina=(payload.pagina or "").strip() or None,
        status="novo",
        criado_por_envoxer_id=envoxer.id,
        criado_por_nome=envoxer.nome,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item

@router.get("", response_model=list[FeedbackSistemaResponse])
async def listar_feedbacks(
    _: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=300),
):
    stmt = select(FeedbackSistema)
    if status:
        stmt = stmt.where(FeedbackSistema.status == status)
    stmt = stmt.order_by(FeedbackSistema.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())

@router.get("/novos-count", response_model=FeedbackSistemaNovosCount)
async def contar_novos(
    _: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    total = (await db.execute(
        select(func.count()).select_from(FeedbackSistema).where(FeedbackSistema.status == "novo")
    )).scalar_one()
    return FeedbackSistemaNovosCount(total=total)

@router.patch("/{feedback_id}", response_model=FeedbackSistemaResponse)
async def atualizar_feedback(
    feedback_id: int,
    payload: FeedbackSistemaUpdate,
    _: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    dados = payload.model_dump(exclude_unset=True)
    for campo, valor in dados.items():
        setattr(item, campo, valor)
    await db.flush()
    await db.refresh(item)
    return item


@router.post("/{feedback_id}/screenshot", response_model=FeedbackSistemaResponse)
async def anexar_screenshot(
    feedback_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    arquivo: UploadFile = File(...),
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if envoxer.permissao != "admin" and item.criado_por_envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Sem permissão para anexar captura")
    if not (arquivo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="A captura precisa ser uma imagem")
    salvo = await salvar_upload(arquivo)
    if item.screenshot_url:
        excluir_upload_url(item.screenshot_url)
    item.screenshot_url = salvo["url"]
    await db.flush()
    await db.refresh(item)
    return item
