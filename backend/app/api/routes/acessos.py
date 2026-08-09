"""Admin: histórico de acessos + status de instalação/notificação por pessoa (D-114).
Acesso = login bem-sucedido (acesso_log, gravado em auth.py::login), independente
do timer de Foco. "Notificações ativas" é derivado de existir push_subscription
(tabela já existe desde o D-071/push.py) — não precisa de campo booleano próprio,
já reflete o estado real (subscription removida = notificação de fato inativa)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.acesso_log import AcessoLog
from app.models.push_subscription import PushSubscription
from app.schemas.acesso import AcessoLogResponse, StatusDispositivoResponse

router = APIRouter(prefix="/admin", tags=["acessos"])


@router.get("/acessos", response_model=list[AcessoLogResponse])
async def listar_acessos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
    envoxer_id: Optional[int] = None,
    limit: int = Query(default=200, le=1000),
):
    query = (
        select(AcessoLog, Envoxer.nome, Envoxer.foto_url)
        .join(Envoxer, Envoxer.id == AcessoLog.envoxer_id, isouter=True)
        .order_by(AcessoLog.criado_em.desc())
        .limit(limit)
    )
    if envoxer_id is not None:
        query = query.where(AcessoLog.envoxer_id == envoxer_id)

    result = await db.execute(query)
    itens = []
    for acesso, nome, foto_url in result.all():
        item = AcessoLogResponse.model_validate(acesso)
        item.envoxer_nome = nome
        item.envoxer_foto = foto_url
        itens.append(item)
    return itens


@router.get("/status-dispositivos", response_model=list[StatusDispositivoResponse])
async def listar_status_dispositivos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    envoxers_result = await db.execute(
        select(Envoxer).where(Envoxer.deleted_at.is_(None)).order_by(Envoxer.nome)
    )
    envoxers = envoxers_result.scalars().all()
    if not envoxers:
        return []

    ids = [e.id for e in envoxers]

    subs_result = await db.execute(
        select(PushSubscription.envoxer_id, func.count(PushSubscription.id))
        .where(PushSubscription.envoxer_id.in_(ids))
        .group_by(PushSubscription.envoxer_id)
    )
    qtd_dispositivos_por_envoxer = dict(subs_result.all())

    ultimo_acesso_result = await db.execute(
        select(AcessoLog.envoxer_id, func.max(AcessoLog.criado_em))
        .where(AcessoLog.envoxer_id.in_(ids))
        .group_by(AcessoLog.envoxer_id)
    )
    ultimo_acesso_por_envoxer = dict(ultimo_acesso_result.all())

    return [
        StatusDispositivoResponse(
            envoxer_id=e.id,
            nome=e.nome,
            foto_url=e.foto_url,
            permissao=e.permissao,
            ativo=e.ativo,
            app_instalado=e.app_instalado,
            app_instalado_em=e.app_instalado_em,
            notificacoes_ativas=qtd_dispositivos_por_envoxer.get(e.id, 0) > 0,
            qtd_dispositivos=qtd_dispositivos_por_envoxer.get(e.id, 0),
            ultimo_acesso=ultimo_acesso_por_envoxer.get(e.id),
        )
        for e in envoxers
    ]
