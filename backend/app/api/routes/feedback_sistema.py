from collections import defaultdict
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import and_, case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_admin_ou_tecnico, get_current_envoxer
from app.core.uploads import excluir_upload_url, salvar_upload
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.feedback_sistema import FeedbackSistema
from app.models.feedback_sistema_interacao import FeedbackSistemaInteracao
from app.models.feedback_sistema_visualizacao import FeedbackSistemaVisualizacao
from app.schemas.feedback_sistema import (
    FeedbackSistemaAlertasResponse,
    FeedbackSistemaCreate,
    FeedbackSistemaInteracaoResponse,
    FeedbackSistemaNovosCount,
    FeedbackSistemaPendentesTesteCount,
    FeedbackSistemaResponse,
    FeedbackSistemaUpdate,
    FeedbackSistemaUserUpdate,
)

router = APIRouter(prefix="/feedback-sistema", tags=["feedback-sistema"])

PRIORIDADE_ORDEM = case(
    (FeedbackSistema.prioridade == "alta", 1),
    (FeedbackSistema.prioridade == "media", 2),
    else_=3,
)
TESTE_ORDEM = case(
    (FeedbackSistema.status == "aguardando_teste", 0),
    else_=1,
)


async def _responses(db: AsyncSession, itens: list[FeedbackSistema]) -> list[FeedbackSistemaResponse]:
    if not itens:
        return []
    ids = [x.id for x in itens]
    interacoes = list((await db.execute(
        select(FeedbackSistemaInteracao)
        .where(FeedbackSistemaInteracao.feedback_id.in_(ids))
        .order_by(FeedbackSistemaInteracao.created_at.asc(), FeedbackSistemaInteracao.id.asc())
    )).scalars().all())
    por_feedback: dict[int, list[FeedbackSistemaInteracaoResponse]] = defaultdict(list)
    for interacao in interacoes:
        por_feedback[interacao.feedback_id].append(
            FeedbackSistemaInteracaoResponse.model_validate(interacao)
        )
    respostas = []
    for item in itens:
        resp = FeedbackSistemaResponse.model_validate(item)
        resp.interacoes = por_feedback.get(item.id, [])
        respostas.append(resp)
    return respostas


async def _response(db: AsyncSession, item: FeedbackSistema) -> FeedbackSistemaResponse:
    return (await _responses(db, [item]))[0]


def _assert_autor(item: FeedbackSistema, envoxer: Envoxer) -> None:
    if item.criado_por_envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Solicitação pertence a outro usuário")


def _assert_editavel_pelo_autor(item: FeedbackSistema, envoxer: Envoxer) -> None:
    _assert_autor(item, envoxer)
    if item.status != "novo":
        raise HTTPException(
            status_code=409,
            detail="A solicitação não pode mais ser alterada porque já foi analisada pelo admin",
        )


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
        alertavel=True,
        criado_por_envoxer_id=envoxer.id,
        criado_por_nome=envoxer.nome,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return await _response(db, item)


@router.get("/me/pendentes-teste-count", response_model=FeedbackSistemaPendentesTesteCount)
async def contar_meus_pendentes_teste(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    total = (await db.execute(
        select(func.count()).select_from(FeedbackSistema).where(
            FeedbackSistema.criado_por_envoxer_id == envoxer.id,
            FeedbackSistema.status == "aguardando_teste",
        )
    )).scalar_one()
    return FeedbackSistemaPendentesTesteCount(total=total)


@router.get("/me", response_model=list[FeedbackSistemaResponse])
async def minhas_solicitacoes(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    itens = list((await db.execute(
        select(FeedbackSistema)
        .where(FeedbackSistema.criado_por_envoxer_id == envoxer.id)
        .order_by(TESTE_ORDEM, PRIORIDADE_ORDEM, FeedbackSistema.created_at.desc())
    )).scalars().all())
    return await _responses(db, itens)


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
    return await _response(db, item)


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


@router.post("/me/{feedback_id}/confirmar-teste", response_model=FeedbackSistemaResponse)
async def confirmar_teste_funcionou(
    feedback_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    _assert_autor(item, envoxer)
    if item.status != "aguardando_teste":
        raise HTTPException(status_code=409, detail="Esta solicitação não está aguardando seu teste")

    db.add(FeedbackSistemaInteracao(
        feedback_id=item.id,
        tipo="usuario_aprovou",
        autor_envoxer_id=envoxer.id,
        autor_nome=envoxer.nome,
        descricao="Testei e funcionou.",
    ))
    item.status = "concluido"
    await db.flush()
    await db.refresh(item)
    return await _response(db, item)


@router.post("/me/{feedback_id}/reportar-falha", response_model=FeedbackSistemaResponse)
async def reportar_teste_nao_funcionou(
    feedback_id: int,
    descricao: Annotated[str, Form(min_length=5, max_length=5000)],
    arquivo: UploadFile = File(...),
    envoxer: Envoxer = Depends(get_current_envoxer),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    _assert_autor(item, envoxer)
    if item.status != "aguardando_teste":
        raise HTTPException(status_code=409, detail="Esta solicitação não está aguardando seu teste")
    if not (arquivo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Envie um print/imagem mostrando o que não funcionou")

    detalhe = descricao.strip()
    if len(detalhe) < 5:
        raise HTTPException(status_code=422, detail="Descreva com mais detalhes o que não funcionou")

    salvo = await salvar_upload(arquivo)
    db.add(FeedbackSistemaInteracao(
        feedback_id=item.id,
        tipo="usuario_reprovou",
        autor_envoxer_id=envoxer.id,
        autor_nome=envoxer.nome,
        descricao=detalhe,
        screenshot_url=salvo["url"],
    ))
    # Falha no reteste precisa reacender o alerta para todos os responsáveis técnicos.
    item.status = "em_analise"
    item.alertavel = True
    await db.execute(
        delete(FeedbackSistemaVisualizacao).where(
            FeedbackSistemaVisualizacao.feedback_id == item.id
        )
    )
    await db.flush()
    await db.refresh(item)
    return await _response(db, item)


@router.get("/alertas-nao-vistos", response_model=FeedbackSistemaAlertasResponse)
async def listar_alertas_nao_vistos(
    responsavel: Annotated[Envoxer, Depends(get_current_admin_ou_tecnico)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    visualizacao = FeedbackSistemaVisualizacao
    stmt = (
        select(FeedbackSistema)
        .outerjoin(
            visualizacao,
            and_(
                visualizacao.feedback_id == FeedbackSistema.id,
                visualizacao.envoxer_id == responsavel.id,
            ),
        )
        .where(
            FeedbackSistema.alertavel.is_(True),
            FeedbackSistema.status.in_(("novo", "em_analise", "aguardando_teste")),
            visualizacao.id.is_(None),
        )
        .order_by(
            case((FeedbackSistema.tipo == "erro", 0), else_=1),
            PRIORIDADE_ORDEM,
            FeedbackSistema.created_at.desc(),
        )
        .limit(50)
    )
    itens = list((await db.execute(stmt)).scalars().all())
    respostas = await _responses(db, itens)
    return FeedbackSistemaAlertasResponse(
        erros=[x for x in respostas if x.tipo == "erro"],
        sugestoes=[x for x in respostas if x.tipo != "erro"],
    )


@router.post("/{feedback_id}/visualizar-alerta", status_code=204)
async def visualizar_alerta(
    feedback_id: int,
    responsavel: Annotated[Envoxer, Depends(get_current_admin_ou_tecnico)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")

    existente = (await db.execute(
        select(FeedbackSistemaVisualizacao.id).where(
            FeedbackSistemaVisualizacao.feedback_id == feedback_id,
            FeedbackSistemaVisualizacao.envoxer_id == responsavel.id,
        )
    )).scalar_one_or_none()
    if existente is None:
        db.add(FeedbackSistemaVisualizacao(
            feedback_id=feedback_id,
            envoxer_id=responsavel.id,
        ))
        await db.flush()
    return None


@router.get("", response_model=list[FeedbackSistemaResponse])
async def listar_feedbacks(
    _: Annotated[Envoxer, Depends(get_current_admin_ou_tecnico)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=300),
):
    stmt = select(FeedbackSistema)
    if status:
        stmt = stmt.where(FeedbackSistema.status == status)
    itens = list((await db.execute(
        stmt.order_by(TESTE_ORDEM, PRIORIDADE_ORDEM, FeedbackSistema.created_at.desc()).limit(limit)
    )).scalars().all())
    return await _responses(db, itens)


@router.get("/novos-count", response_model=FeedbackSistemaNovosCount)
async def contar_novos(
    _: Annotated[Envoxer, Depends(get_current_admin_ou_tecnico)],
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
    admin: Annotated[Envoxer, Depends(get_current_admin_ou_tecnico)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(FeedbackSistema, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")

    dados = payload.model_dump(exclude_unset=True)
    status_novo = dados.get("status")
    observacao = dados.get("observacao_admin")

    if observacao is not None:
        observacao = observacao.strip() or None
        item.observacao_admin = observacao

    if status_novo == "aguardando_teste" and item.status != "aguardando_teste":
        nota = observacao if observacao is not None else item.observacao_admin
        if not nota:
            raise HTTPException(
                status_code=422,
                detail="Explique o que foi feito antes de enviar a solicitação para teste",
            )
        db.add(FeedbackSistemaInteracao(
            feedback_id=item.id,
            tipo="admin_enviou_teste",
            autor_envoxer_id=admin.id,
            autor_nome=admin.nome,
            descricao=nota,
        ))

    if status_novo is not None:
        item.status = status_novo

    if "prioridade" in dados:
        item.prioridade = dados["prioridade"]

    await db.flush()
    await db.refresh(item)
    return await _response(db, item)


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
    return await _response(db, item)
