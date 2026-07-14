"""Etapas-modelo de um Serviço — "receita" de processo reaproveitável, aplicada
numa Tarefa via POST /tarefas/{id}/aplicar-processo (ver app/api/routes/etapas.py).
CRUD restrito a admin, mesma regra do catálogo de Serviços (mexer aqui não
afeta tarefas já criadas — só as próximas aplicações do processo).
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.servico import Servico
from app.models.tarefa import STATUS_TAREFA_VALUES
from app.models.etapa_template import EtapaTemplate
from app.models.automacao_etapa_template import AutomacaoEtapaTemplate, ACAO_AUTOMACAO_VALUES
from app.schemas.etapa_template import (
    EtapaTemplateCreate,
    EtapaTemplateUpdate,
    EtapaTemplateResponse,
    AutomacaoEtapaTemplateUpsert,
    AutomacaoEtapaTemplateResponse,
)

router = APIRouter(tags=["etapas-template"])


async def _obter_servico_ou_404(db: AsyncSession, servico_id: int) -> Servico:
    result = await db.execute(select(Servico).where(Servico.id == servico_id))
    servico = result.scalar_one_or_none()
    if servico is None:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return servico


async def _listar_templates_ordenados(db: AsyncSession, servico_id: int) -> list[EtapaTemplate]:
    result = await db.execute(
        select(EtapaTemplate).where(EtapaTemplate.servico_id == servico_id).order_by(EtapaTemplate.ordem, EtapaTemplate.id)
    )
    return list(result.scalars().all())


async def _obter_template_ou_404(db: AsyncSession, servico_id: int, template_id: int) -> EtapaTemplate:
    result = await db.execute(
        select(EtapaTemplate).where(EtapaTemplate.id == template_id, EtapaTemplate.servico_id == servico_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Etapa-modelo não encontrada")
    return template


async def _obter_automacao_template(db: AsyncSession, etapa_template_id: int) -> Optional[AutomacaoEtapaTemplate]:
    result = await db.execute(
        select(AutomacaoEtapaTemplate).where(AutomacaoEtapaTemplate.etapa_template_id == etapa_template_id)
    )
    return result.scalar_one_or_none()


async def _to_response(db: AsyncSession, templates: list[EtapaTemplate]) -> list[EtapaTemplateResponse]:
    templates = sorted(templates, key=lambda t: (t.ordem, t.id))
    automacoes_result = await db.execute(
        select(AutomacaoEtapaTemplate).where(
            AutomacaoEtapaTemplate.etapa_template_id.in_([t.id for t in templates] or [-1])
        )
    )
    automacoes_por_template = {a.etapa_template_id: a for a in automacoes_result.scalars().all()}

    respostas = []
    for template in templates:
        automacao = automacoes_por_template.get(template.id)
        respostas.append(
            EtapaTemplateResponse(
                id=template.id,
                servico_id=template.servico_id,
                titulo=template.titulo,
                descricao=template.descricao,
                prazo_dias=template.prazo_dias,
                ordem=template.ordem,
                automacao=AutomacaoEtapaTemplateResponse.model_validate(automacao) if automacao else None,
            )
        )
    return respostas


@router.get("/servicos/{servico_id}/etapas-template", response_model=list[EtapaTemplateResponse])
async def listar_templates(
    servico_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    templates = await _listar_templates_ordenados(db, servico_id)
    return await _to_response(db, templates)


@router.post("/servicos/{servico_id}/etapas-template", response_model=EtapaTemplateResponse, status_code=201)
async def criar_template(
    servico_id: int,
    payload: EtapaTemplateCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="Título é obrigatório")

    result = await db.execute(select(EtapaTemplate.ordem).where(EtapaTemplate.servico_id == servico_id))
    maior_ordem = max([o for (o,) in result.all()], default=-1)

    template = EtapaTemplate(
        servico_id=servico_id,
        titulo=payload.titulo,
        descricao=payload.descricao,
        prazo_dias=payload.prazo_dias,
        ordem=maior_ordem + 1,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    resp = await _to_response(db, await _listar_templates_ordenados(db, servico_id))
    return next(r for r in resp if r.id == template.id)


@router.patch("/servicos/{servico_id}/etapas-template/{template_id}", response_model=EtapaTemplateResponse)
async def atualizar_template(
    servico_id: int,
    template_id: int,
    payload: EtapaTemplateUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    template = await _obter_template_ou_404(db, servico_id, template_id)

    data = payload.model_dump(exclude_unset=True)
    for campo, valor in data.items():
        setattr(template, campo, valor)

    await db.flush()
    await db.refresh(template)
    resp = await _to_response(db, await _listar_templates_ordenados(db, servico_id))
    return next(r for r in resp if r.id == template.id)


@router.delete("/servicos/{servico_id}/etapas-template/{template_id}", status_code=204)
async def excluir_template(
    servico_id: int,
    template_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    template = await _obter_template_ou_404(db, servico_id, template_id)
    await db.delete(template)
    await db.flush()


@router.put(
    "/servicos/{servico_id}/etapas-template/{template_id}/automacao",
    response_model=AutomacaoEtapaTemplateResponse,
)
async def configurar_automacao_template(
    servico_id: int,
    template_id: int,
    payload: AutomacaoEtapaTemplateUpsert,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    await _obter_template_ou_404(db, servico_id, template_id)

    if payload.acao not in ACAO_AUTOMACAO_VALUES:
        raise HTTPException(status_code=400, detail="Ação de automação inválida")
    if payload.acao == "MOVER_TAREFA_COLUNA":
        if not payload.coluna_destino or payload.coluna_destino not in STATUS_TAREFA_VALUES:
            raise HTTPException(status_code=400, detail="coluna_destino inválida")

    automacao = await _obter_automacao_template(db, template_id)
    if automacao is None:
        automacao = AutomacaoEtapaTemplate(etapa_template_id=template_id)
        db.add(automacao)

    automacao.acao = payload.acao
    automacao.coluna_destino = payload.coluna_destino if payload.acao == "MOVER_TAREFA_COLUNA" else None
    automacao.ativo = payload.ativo

    await db.flush()
    await db.refresh(automacao)
    return automacao


@router.delete("/servicos/{servico_id}/etapas-template/{template_id}/automacao", status_code=204)
async def remover_automacao_template(
    servico_id: int,
    template_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    await _obter_servico_ou_404(db, servico_id)
    await _obter_template_ou_404(db, servico_id, template_id)
    automacao = await _obter_automacao_template(db, template_id)
    if automacao:
        await db.delete(automacao)
        await db.flush()
