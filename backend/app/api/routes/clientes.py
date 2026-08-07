from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.core.uploads import salvar_foto_avatar
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.cliente_servico import ClienteServico
from app.models.escopo import Escopo
from app.models.churn_snapshot import ChurnSnapshot
from app.models.motivo_churn import MotivoChurnCatalogo
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ClienteResponse, ClienteListItem, ClienteServicoItem
from app.schemas.churn import ChurnSnapshotResponse
from app.services.perfil import recalcular_e_persistir_perfil
from app.core.valores import eh_admin, redigir

router = APIRouter(prefix="/clientes", tags=["clientes"])


def _meses_de_casa(inicio: Optional[date]) -> Optional[int]:
    if inicio is None:
        return None
    hoje = date.today()
    return (hoje.year - inicio.year) * 12 + (hoje.month - inicio.month)


@router.get("", response_model=list[ClienteListItem])
async def listar_clientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Equivalente a vw_cliente_lista do schema.sql, calculado aqui em vez de VIEW no banco."""
    soma_servicos = (
        select(
            ClienteServico.cliente_id,
            func.coalesce(func.sum(ClienteServico.valor_mensal), 0).label("soma"),
        )
        .group_by(ClienteServico.cliente_id)
        .subquery()
    )

    stmt = (
        select(Cliente, soma_servicos.c.soma, Envoxer.nome, Envoxer.foto_url)
        .outerjoin(soma_servicos, soma_servicos.c.cliente_id == Cliente.id)
        .outerjoin(Envoxer, Envoxer.id == Cliente.responsavel_envoxer_id)
        .where(Cliente.deleted_at.is_(None))
        .order_by(Cliente.nome)
    )
    result = await db.execute(stmt)

    itens = []
    for cliente, soma, resp_nome, resp_foto in result.all():
        item = ClienteListItem(
            id=cliente.id,
            nome=cliente.nome,
            logo_url=cliente.logo_url,
            status_farol=cliente.status_farol,
            tipo_receita=cliente.tipo_receita,
            segmento=cliente.segmento,
            data_inicio_contrato=cliente.data_inicio_contrato,
            valor_contrato=float(cliente.valor_contrato),
            valor_servicos_soma=float(soma or 0),
            meses_de_casa=_meses_de_casa(cliente.data_inicio_contrato),
            responsavel_nome=resp_nome,
            responsavel_foto=resp_foto,
            ativo=cliente.ativo,
        )
        redigir(item, ["valor_contrato", "valor_servicos_soma"], envoxer)
        itens.append(item)
    return itens


@router.get("/{cliente_id}", response_model=ClienteResponse)
async def obter_cliente(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Cliente).where(and_(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    resp = ClienteResponse.model_validate(cliente)
    if cliente.data_cancelamento is not None:
        resp.churn = await _obter_churn_snapshot(db, cliente_id)
        if resp.churn is not None:
            redigir(resp.churn, ["valor_contrato_snap", "ticket_snap", "margem_media_snap"], envoxer)
    elif cliente.ativo:
        resp.perfil = await recalcular_e_persistir_perfil(db, cliente_id)

    servicos_result = await db.execute(
        select(ClienteServico).where(ClienteServico.cliente_id == cliente_id)
    )
    resp.servicos = [
        ClienteServicoItem(servico_id=cs.servico_id, valor_mensal=float(cs.valor_mensal), observacao=cs.observacao)
        for cs in servicos_result.scalars().all()
    ]

    escopo_result = await db.execute(select(Escopo).where(Escopo.cliente_id == cliente_id))
    escopo = escopo_result.scalar_one_or_none()
    resp.limite_alteracoes = escopo.limite_alteracoes if escopo else 2

    redigir(resp, ["valor_contrato", "ticket"], envoxer)
    for servico in resp.servicos:
        redigir(servico, ["valor_mensal"], envoxer)
    return resp


async def _obter_churn_snapshot(db: AsyncSession, cliente_id: int) -> Optional[ChurnSnapshotResponse]:
    result = await db.execute(
        select(ChurnSnapshot, MotivoChurnCatalogo.nome)
        .join(MotivoChurnCatalogo, MotivoChurnCatalogo.codigo == ChurnSnapshot.motivo_codigo)
        .where(ChurnSnapshot.cliente_id == cliente_id)
    )
    row = result.first()
    if row is None:
        return None
    snapshot, motivo_nome = row
    resp = ChurnSnapshotResponse.model_validate(snapshot)
    resp.motivo_nome = motivo_nome
    return resp


@router.post("", response_model=ClienteResponse, status_code=201)
async def criar_cliente(
    payload: ClienteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    data = payload.model_dump(exclude={"servicos", "escopo"})
    # Gestor continua podendo cadastrar cliente, mas não define valores monetários
    # nessa criação — só admin. Cliente nasce com 0/sem ticket, admin completa depois.
    if not eh_admin(envoxer):
        data["valor_contrato"] = 0
        data["ticket"] = None
    cliente = Cliente(**data)
    db.add(cliente)
    await db.flush()

    for item in payload.servicos:
        dados_item = item.model_dump()
        if not eh_admin(envoxer):
            # Gestor pode marcar quais serviços o cliente contratou (estrutura),
            # mas não define o valor — cliente nasce sem serviço nenhum aqui, então
            # não tem valor prévio pra preservar, admin completa depois.
            dados_item["valor_mensal"] = 0
        db.add(ClienteServico(cliente_id=cliente.id, **dados_item))

    if payload.escopo:
        db.add(Escopo(cliente_id=cliente.id, **payload.escopo.model_dump()))

    await db.flush()
    await db.refresh(cliente)
    resp = ClienteResponse.model_validate(cliente)
    redigir(resp, ["valor_contrato", "ticket"], envoxer)
    return resp


@router.patch("/{cliente_id}", response_model=ClienteResponse)
async def atualizar_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    updates = payload.model_dump(exclude_unset=True, exclude={"servicos", "escopo"})
    if not eh_admin(envoxer):
        # Formulário do gestor sempre reenvia esses campos junto com o resto (não é
        # diff) — como a LEITURA vem redigida (null) pra gestor, se a escrita não
        # fosse bloqueada aqui, qualquer salvamento do gestor zeraria o valor de
        # contrato/ticket de verdade no banco. Ignorar esses 2 campos preserva o
        # valor já existente.
        updates.pop("valor_contrato", None)
        updates.pop("ticket", None)
    for field, value in updates.items():
        setattr(cliente, field, value)

    if payload.servicos is not None:
        if eh_admin(envoxer):
            await db.execute(
                ClienteServico.__table__.delete().where(ClienteServico.cliente_id == cliente_id)
            )
            for item in payload.servicos:
                db.add(ClienteServico(cliente_id=cliente_id, **item.model_dump()))
        else:
            # Gestor pode marcar/desmarcar QUAIS serviços o cliente contratou, mas
            # `valor_mensal` continua só do admin. Como a leitura vem redigida (null)
            # pra gestor, o payload dele nunca tem o valor real — por isso não dá pra
            # confiar no valor_mensal submetido: serviço que já existia preserva o
            # valor gravado no banco (ignora o resto do payload pra ele), serviço novo
            # nasce com 0 pro admin completar depois.
            existentes_result = await db.execute(
                select(ClienteServico).where(ClienteServico.cliente_id == cliente_id)
            )
            existentes = {cs.servico_id: cs for cs in existentes_result.scalars().all()}
            desejados = {item.servico_id for item in payload.servicos}

            for servico_id, cs in existentes.items():
                if servico_id not in desejados:
                    await db.delete(cs)

            for item in payload.servicos:
                if item.servico_id not in existentes:
                    db.add(ClienteServico(cliente_id=cliente_id, servico_id=item.servico_id, valor_mensal=0, observacao=item.observacao))

    if payload.escopo is not None:
        existente = await db.execute(select(Escopo).where(Escopo.cliente_id == cliente_id))
        escopo = existente.scalar_one_or_none()
        if escopo:
            for field, value in payload.escopo.model_dump().items():
                setattr(escopo, field, value)
        else:
            db.add(Escopo(cliente_id=cliente_id, **payload.escopo.model_dump()))

    await db.flush()
    await db.refresh(cliente)
    resp = ClienteResponse.model_validate(cliente)
    redigir(resp, ["valor_contrato", "ticket"], envoxer)
    return resp


@router.post("/{cliente_id}/logo", response_model=ClienteResponse)
async def enviar_logo(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    arquivo: UploadFile = File(...),
):
    """Logo do cliente passa pelo mesmo recorte quadrado (arrastar/zoom no frontend,
    ver AvatarCropModal) e processamento de imagem do avatar do Envoxer (D-090/D-102)
    — `salvar_foto_avatar` é genérico, não tem nada específico de Envoxer."""
    result = await db.execute(select(Cliente).where(and_(Cliente.id == cliente_id, Cliente.deleted_at.is_(None))))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    salvo = await salvar_foto_avatar(arquivo)
    cliente.logo_url = salvo["url"]
    await db.flush()
    await db.refresh(cliente)
    resp = ClienteResponse.model_validate(cliente)
    redigir(resp, ["valor_contrato", "ticket"], envoxer)
    return resp


@router.delete("/{cliente_id}", status_code=204)
async def arquivar_cliente(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    """Soft delete."""
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    cliente.deleted_at = datetime.now(timezone.utc)
    await db.flush()
