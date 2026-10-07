from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import case, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_admin
from app.db.session import get_db
from app.core.uploads import salvar_upload, excluir_upload_url
from app.models.envoxer import Envoxer
from app.models.feedback_sistema import FeedbackSistema
from app.schemas.feedback_sistema import (
    FeedbackSistemaCreate, FeedbackSistemaUserUpdate, FeedbackSistemaUpdate,
    FeedbackSistemaResponse, FeedbackSistemaNovosCount,
)

router = APIRouter(prefix="/feedback-sistema", tags=["feedback-sistema"])

PRIORIDADE_ORDEM = case(
    (FeedbackSistema.prioridade == "alta", 1),
    (FeedbackSistema.prioridade == "media", 2),
    else_=3,
)

def _assert_editavel_pelo_autor(item: FeedbackSistema, envoxer: Envoxer) -> None:
    if item.criado_por_envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Solicitação pertence a outro usuário")
    if item.status != "novo":
        raise HTTPException(status_code=409, detail="A solicitação não pode mais ser alterada porque já foi analisada pelo admin")

@router.post("", response_model=FeedbackSistemaResponse, status_code=201)
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
        prioridade=payload.prioridade,
        status="novo",
        criado_por_envoxer_id=envoxer.id,
        criado_por_nome=envoxer.nome,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item

@router.get("/me", response_model=list[FeedbackSistemaResponse])
async def minhas_solicitacoes(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return list((await db.execute(
        select(FeedbackSistema)
        .where(FeedbackSistema.criado_por_envoxer_id == envoxer.id)
        .order_by(PRIORIDADE_ORDEM, FeedbackSistema.created_at.desc())
    )).scalars().all())

@router.patch("/me/{feedback_id}", response_model=FeedbackSistemaResponse)
async def editar_minha_solicitacao(
    feedback_id: int,
    payload: FeedbackSistemaUserUpdate,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    _assert_editavel_pelo_autor(item, envoxer)
    dados = payload.model_dump(exclude_unset=True)
    if "titulo" in dados:
        dados["titulo"] = dados["titulo"].strip()
    if "descricao" in dados:
        dados["descricao"] = dados["descricao"].strip()
    for campo, valor in dados.items():
        setattr(item, campo, valor)
    await db.flush()
    await db.refresh(item)
    return item

@router.delete("/me/{feedback_id}", status_code=204)
async def excluir_minha_solicitacao(
    feedback_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    _assert_editavel_pelo_autor(item, envoxer)
    if item.screenshot_url:
        excluir_upload_url(item.screenshot_url)
    await db.delete(item)
    await db.flush()
    return None

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
    stmt = stmt.order_by(PRIORIDADE_ORDEM, FeedbackSistema.created_at.desc()).limit(limit)
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
    if envoxer.permissao != "admin":
        _assert_editavel_pelo_autor(item, envoxer)
    if not (arquivo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="A captura precisa ser uma imagem")
    salvo = await salvar_upload(arquivo)
    if item.screenshot_url:
        excluir_upload_url(item.screenshot_url)
    item.screenshot_url = salvo["url"]
    await db.flush()
    await db.refresh(item)
    return item
