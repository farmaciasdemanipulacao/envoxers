from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_gestor_ou_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.servico import Servico
from app.models.cliente_servico import ClienteServico
from app.models.item_escopo import ItemEscopo
from app.models.tarefa import Tarefa
from app.models.etapa_template import EtapaTemplate
from app.schemas.servico import ServicoCreate, ServicoUpdate, ServicoResponse, ServicoExclusaoResponse

router = APIRouter(prefix="/servicos", tags=["servicos"])


@router.get("", response_model=list[ServicoResponse])
async def listar_servicos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(Servico).order_by(Servico.nome))
    return result.scalars().all()


@router.post("", response_model=ServicoResponse, status_code=201)
async def criar_servico(
    payload: ServicoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    servico = Servico(**payload.model_dump())
    db.add(servico)
    await db.flush()
    await db.refresh(servico)
    return servico


@router.patch("/{servico_id}", response_model=ServicoResponse)
async def atualizar_servico(
    servico_id: int,
    payload: ServicoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    result = await db.execute(select(Servico).where(Servico.id == servico_id))
    servico = result.scalar_one_or_none()
    if servico is None:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(servico, field, value)
    await db.flush()
    await db.refresh(servico)
    return servico


@router.delete("/{servico_id}", response_model=ServicoExclusaoResponse)
async def excluir_servico(
    servico_id: int,
    substituir_por_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    """Exclui o Serviço de verdade (não é toggle de `ativo`) — pra isso, TUDO que
    está vinculado a ele (contratos de cliente, itens de escopo, tarefas/cards e
    etapas-modelo do processo) migra pro `substituir_por_id` antes da exclusão.
    Nada fica órfão."""
    if servico_id == substituir_por_id:
        raise HTTPException(status_code=400, detail="O serviço de destino não pode ser o mesmo que está sendo excluído")

    servico = (await db.execute(select(Servico).where(Servico.id == servico_id))).scalar_one_or_none()
    if servico is None:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    substituto = (await db.execute(select(Servico).where(Servico.id == substituir_por_id))).scalar_one_or_none()
    if substituto is None:
        raise HTTPException(status_code=400, detail="Serviço de destino não encontrado")

    # ClienteServico tem UNIQUE(cliente_id, servico_id) — se o cliente já
    # contratou os dois serviços, migrar duplicaria a chave. Nesse caso só
    # descarta a linha antiga (o cliente já tem o serviço de destino).
    contratos = (await db.execute(select(ClienteServico).where(ClienteServico.servico_id == servico_id))).scalars().all()
    contratos_migrados = 0
    for contrato in contratos:
        ja_tem_destino = (await db.execute(
            select(func.count()).select_from(ClienteServico).where(
                ClienteServico.cliente_id == contrato.cliente_id, ClienteServico.servico_id == substituir_por_id,
            )
        )).scalar_one()
        if ja_tem_destino:
            await db.delete(contrato)
        else:
            contrato.servico_id = substituir_por_id
            contratos_migrados += 1
    await db.flush()

    itens_result = await db.execute(
        select(func.count()).select_from(ItemEscopo).where(ItemEscopo.servico_id == servico_id)
    )
    itens_escopo_migrados = itens_result.scalar_one()
    await db.execute(
        ItemEscopo.__table__.update().where(ItemEscopo.servico_id == servico_id).values(servico_id=substituir_por_id)
    )

    tarefas_result = await db.execute(
        select(func.count()).select_from(Tarefa).where(Tarefa.servico_id == servico_id)
    )
    tarefas_migradas = tarefas_result.scalar_one()
    await db.execute(
        Tarefa.__table__.update().where(Tarefa.servico_id == servico_id).values(servico_id=substituir_por_id)
    )

    # Etapas-modelo migram pro final da lista do serviço de destino, pra não
    # colidir visualmente com a ordem que já existir lá.
    maior_ordem = (await db.execute(
        select(func.max(EtapaTemplate.ordem)).where(EtapaTemplate.servico_id == substituir_por_id)
    )).scalar_one() or -1
    templates = (await db.execute(
        select(EtapaTemplate).where(EtapaTemplate.servico_id == servico_id).order_by(EtapaTemplate.ordem, EtapaTemplate.id)
    )).scalars().all()
    etapas_modelo_migradas = len(templates)
    for template in templates:
        maior_ordem += 1
        template.servico_id = substituir_por_id
        template.ordem = maior_ordem
    await db.flush()

    await db.delete(servico)
    await db.flush()

    return ServicoExclusaoResponse(
        servico_excluido_id=servico_id,
        substituto_id=substituir_por_id,
        contratos_migrados=contratos_migrados,
        itens_escopo_migrados=itens_escopo_migrados,
        tarefas_migradas=tarefas_migradas,
        etapas_modelo_migradas=etapas_modelo_migradas,
    )
