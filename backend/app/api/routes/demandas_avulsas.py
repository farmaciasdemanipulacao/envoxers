from datetime import date, datetime, timezone
from typing import Annotated, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.core.uploads import excluir_upload_url, salvar_upload
from app.models.demanda_avulsa import DemandaAvulsa
from app.models.envoxer import Envoxer
from app.api.routes.registro_foco import finalizar_foco_ativo_da_demanda_avulsa
from app.schemas.demanda_avulsa import (
    DemandaAvulsaChecklistCreate,
    DemandaAvulsaAnexoRename,
    DemandaAvulsaChecklistUpdate,
    DemandaAvulsaComentarioCreate,
    DemandaAvulsaCreate,
    DemandaAvulsaUpdate,
    DemandaAvulsaResponse,
    STATUS_AVULSA,
    PRIORIDADES_AVULSA,
)

router = APIRouter(prefix="/demandas-avulsas", tags=["demandas-avulsas"])

STATUS_LABEL = {
    "nova": "Nova",
    "em_andamento": "Em andamento",
    "aguardando_terceiro": "Aguardando terceiro",
    "concluida": "Concluída",
}
PRIORIDADE_LABEL = {
    "baixa": "Baixa",
    "media": "Média",
    "alta": "Alta",
    "critica": "Crítica",
}
CAMPO_LABEL = {
    "contexto": "Contexto",
    "titulo": "Título",
    "descricao": "Descrição",
    "responsavel_envoxer_id": "Responsável",
    "prazo": "Data de entrega",
    "prioridade": "Prioridade",
    "status": "Status",
}


async def _obter_ou_404(db: AsyncSession, demanda_id: int) -> DemandaAvulsa:
    item = (
        await db.execute(
            select(DemandaAvulsa).where(
                DemandaAvulsa.id == demanda_id,
                DemandaAvulsa.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Demanda avulsa não encontrada")
    return item


async def _nome_envoxer(db: AsyncSession, envoxer_id: Optional[int]) -> Optional[str]:
    if not envoxer_id:
        return None
    return (
        await db.execute(select(Envoxer.nome).where(Envoxer.id == envoxer_id))
    ).scalar_one_or_none()


def _agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validar(prioridade: Optional[str] = None, status: Optional[str] = None) -> None:
    if prioridade is not None and prioridade not in PRIORIDADES_AVULSA:
        raise HTTPException(status_code=422, detail="Prioridade inválida")
    if status is not None and status not in STATUS_AVULSA:
        raise HTTPException(status_code=422, detail="Status inválido")


def _ordenar_por_data_desc(itens: list, campo: str = "criado_em") -> list:
    return sorted(
        list(itens or []),
        key=lambda x: str(x.get(campo) or ""),
        reverse=True,
    )


async def _valor_legivel(db: AsyncSession, campo: str, valor) -> str:
    if campo == "responsavel_envoxer_id":
        return await _nome_envoxer(db, valor) or "Sem responsável"
    if campo == "status":
        return STATUS_LABEL.get(valor, str(valor or "—"))
    if campo == "prioridade":
        return PRIORIDADE_LABEL.get(valor, str(valor or "—"))
    if campo == "prazo":
        return str(valor) if valor else "Sem data"
    if valor is None or valor == "":
        return "—"
    return str(valor)


def _evento_historico(
    envoxer: Envoxer,
    tipo: str,
    descricao: str,
    alteracoes: Optional[list[dict]] = None,
) -> dict:
    return {
        "id": uuid4().hex,
        "tipo": tipo,
        "descricao": descricao,
        "autor_envoxer_id": envoxer.id,
        "autor_nome": envoxer.nome,
        "criado_em": _agora_iso(),
        "alteracoes": alteracoes or [],
    }


async def _serialize(db: AsyncSession, item: DemandaAvulsa) -> DemandaAvulsaResponse:
    uploader_ids = {
        int(a.get("enviado_por_envoxer_id"))
        for a in (item.anexos or [])
        if a.get("enviado_por_envoxer_id")
    }
    ids = {
        int(x)
        for x in (item.responsavel_envoxer_id, item.criado_por_envoxer_id)
        if x
    } | uploader_ids
    pessoas = {}
    if ids:
        pessoas = {
            e.id: e
            for e in (
                await db.execute(select(Envoxer).where(Envoxer.id.in_(ids)))
            ).scalars().all()
        }
    resp = pessoas.get(item.responsavel_envoxer_id)
    criador = pessoas.get(item.criado_por_envoxer_id)
    anexos = [
        {
            **a,
            "enviado_por_nome": (
                pessoas.get(a.get("enviado_por_envoxer_id")).nome
                if pessoas.get(a.get("enviado_por_envoxer_id"))
                else None
            ),
        }
        for a in (item.anexos or [])
    ]
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
        comentarios=_ordenar_por_data_desc(item.comentarios or []),
        checklist=list(item.checklist or []),
        historico=_ordenar_por_data_desc(item.historico or []),
        anexos=anexos,
        qtd_alteracoes_prazo=item.qtd_alteracoes_prazo or 0,
        alerta_alteracoes=(item.qtd_alteracoes_prazo or 0) > 2,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


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
    itens = list(
        (
            await db.execute(
                stmt.order_by(
                    DemandaAvulsa.prazo.asc().nullslast(),
                    DemandaAvulsa.created_at.desc(),
                )
            )
        ).scalars().all()
    )
    itens.sort(
        key=lambda x: (
            prioridade_ordem.get(x.prioridade, 9),
            x.prazo is None,
            x.prazo or datetime.max.date(),
        )
    )
    return [await _serialize(db, x) for x in itens]


@router.get("/{demanda_id}", response_model=DemandaAvulsaResponse)
async def obter(
    demanda_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    return await _serialize(db, await _obter_ou_404(db, demanda_id))


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
        comentarios=[],
        checklist=[],
        anexos=[],
        historico=[
            _evento_historico(
                envoxer,
                "criada",
                "Demanda avulsa criada",
            )
        ],
        qtd_alteracoes_prazo=0,
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
    item = await _obter_ou_404(db, demanda_id)
    dados = payload.model_dump(exclude_unset=True)
    _validar(prioridade=dados.get("prioridade"), status=dados.get("status"))

    if envoxer.permissao not in ("admin", "gestor"):
        if item.responsavel_envoxer_id != envoxer.id:
            raise HTTPException(
                status_code=403,
                detail="Você só pode atualizar demandas atribuídas a você",
            )
        permitidos = {"status"}
        if set(dados) - permitidos:
            raise HTTPException(
                status_code=403,
                detail="Somente gestor ou admin pode editar os dados da demanda",
            )

    alteracoes = []
    prazo_mudou = False
    for campo, valor in dados.items():
        if campo in ("contexto", "titulo") and isinstance(valor, str):
            valor = valor.strip()
        if campo == "descricao" and isinstance(valor, str):
            valor = valor.strip() or None

        anterior = getattr(item, campo)
        if anterior == valor:
            continue

        alteracoes.append(
            {
                "campo": campo,
                "label": CAMPO_LABEL.get(campo, campo),
                "de": await _valor_legivel(db, campo, anterior),
                "para": await _valor_legivel(db, campo, valor),
            }
        )
        if campo == "prazo":
            prazo_mudou = True
        setattr(item, campo, valor)

    if "status" in dados and any(x["campo"] == "status" for x in alteracoes):
        item.concluida_em = (
            datetime.now(timezone.utc)
            if dados["status"] == "concluida"
            else None
        )
        if dados["status"] == "concluida":
            await finalizar_foco_ativo_da_demanda_avulsa(
                db,
                demanda_id,
                comentario="Finalizado automaticamente — demanda avulsa concluída",
            )

    if prazo_mudou:
        item.qtd_alteracoes_prazo = (item.qtd_alteracoes_prazo or 0) + 1

    if alteracoes:
        historico = list(item.historico or [])
        historico.append(
            _evento_historico(
                envoxer,
                "alteracao",
                "Dados da demanda atualizados",
                alteracoes,
            )
        )
        item.historico = historico

    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.post("/{demanda_id}/comentarios", response_model=DemandaAvulsaResponse)
async def comentar(
    demanda_id: int,
    payload: DemandaAvulsaComentarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = await _obter_ou_404(db, demanda_id)
    comentarios = list(item.comentarios or [])
    comentarios.append(
        {
            "id": uuid4().hex,
            "envoxer_id": envoxer.id,
            "envoxer_nome": envoxer.nome,
            "texto": payload.texto.strip(),
            "criado_em": _agora_iso(),
        }
    )
    item.comentarios = comentarios
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.post("/{demanda_id}/checklist", response_model=DemandaAvulsaResponse)
async def criar_checklist(
    demanda_id: int,
    payload: DemandaAvulsaChecklistCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = await _obter_ou_404(db, demanda_id)
    check_id = uuid4().hex
    checklist = list(item.checklist or [])
    checklist.append(
        {
            "id": check_id,
            "titulo": payload.titulo.strip(),
            "concluido": False,
            "criado_por_envoxer_id": envoxer.id,
            "criado_por_nome": envoxer.nome,
            "criado_em": _agora_iso(),
            "concluido_em": None,
            "concluido_por_nome": None,
        }
    )
    item.checklist = checklist

    historico = list(item.historico or [])
    historico.append(
        _evento_historico(
            envoxer,
            "checklist",
            f'Checklist criado: "{payload.titulo.strip()}"',
        )
    )
    item.historico = historico

    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.patch("/{demanda_id}/checklist/{check_id}", response_model=DemandaAvulsaResponse)
async def editar_checklist(
    demanda_id: int,
    check_id: str,
    payload: DemandaAvulsaChecklistUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = await _obter_ou_404(db, demanda_id)
    checklist = [dict(x) for x in (item.checklist or [])]
    alvo = next((x for x in checklist if x.get("id") == check_id), None)
    if alvo is None:
        raise HTTPException(status_code=404, detail="Item do checklist não encontrado")

    mudou = False
    descricao_evento = None
    if payload.titulo is not None:
        novo_titulo = payload.titulo.strip()
        if novo_titulo != alvo.get("titulo"):
            alvo["titulo"] = novo_titulo
            mudou = True
            descricao_evento = f'Checklist renomeado para: "{novo_titulo}"'

    if payload.concluido is not None and bool(payload.concluido) != bool(alvo.get("concluido")):
        alvo["concluido"] = bool(payload.concluido)
        alvo["concluido_em"] = _agora_iso() if payload.concluido else None
        alvo["concluido_por_nome"] = envoxer.nome if payload.concluido else None
        mudou = True
        descricao_evento = (
            f'Checklist concluído: "{alvo.get("titulo")}"'
            if payload.concluido
            else f'Checklist reaberto: "{alvo.get("titulo")}"'
        )

    if mudou:
        item.checklist = checklist
        historico = list(item.historico or [])
        historico.append(
            _evento_historico(
                envoxer,
                "checklist",
                descricao_evento or "Checklist atualizado",
            )
        )
        item.historico = historico
        await db.flush()
        await db.refresh(item)

    return await _serialize(db, item)


@router.delete("/{demanda_id}/checklist/{check_id}", response_model=DemandaAvulsaResponse)
async def excluir_checklist(
    demanda_id: int,
    check_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = await _obter_ou_404(db, demanda_id)
    checklist = [dict(x) for x in (item.checklist or [])]
    alvo = next((x for x in checklist if x.get("id") == check_id), None)
    if alvo is None:
        raise HTTPException(status_code=404, detail="Item do checklist não encontrado")

    item.checklist = [x for x in checklist if x.get("id") != check_id]
    historico = list(item.historico or [])
    historico.append(
        _evento_historico(
            envoxer,
            "checklist",
            f'Checklist excluído: "{alvo.get("titulo")}"',
        )
    )
    item.historico = historico
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.post("/{demanda_id}/anexos", response_model=DemandaAvulsaResponse)
async def anexar_arquivo(
    demanda_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    arquivo: UploadFile = File(...),
):
    item = await _obter_ou_404(db, demanda_id)
    salvo = await salvar_upload(arquivo)
    anexos = list(item.anexos or [])
    anexo = {
        **salvo,
        "enviado_por_envoxer_id": envoxer.id,
        "criado_em": _agora_iso(),
    }
    anexos.append(anexo)
    item.anexos = anexos

    historico = list(item.historico or [])
    historico.append(
        _evento_historico(
            envoxer,
            "anexo",
            f'Arquivo anexado: "{salvo.get("nome") or "arquivo"}"',
        )
    )
    item.historico = historico
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.patch("/{demanda_id}/anexos", response_model=DemandaAvulsaResponse)
async def renomear_anexo(
    demanda_id: int,
    payload: DemandaAvulsaAnexoRename,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    item = await _obter_ou_404(db, demanda_id)
    novo_nome = payload.nome.strip()
    anexos = [dict(a) for a in (item.anexos or [])]
    alvo = next((a for a in anexos if a.get("url") == payload.url), None)
    if alvo is None:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    nome_anterior = alvo.get("nome") or "arquivo"
    if novo_nome == nome_anterior:
        return await _serialize(db, item)

    alvo["nome"] = novo_nome
    item.anexos = anexos

    historico = list(item.historico or [])
    historico.append(
        _evento_historico(
            envoxer,
            "anexo",
            "Arquivo renomeado",
            [{
                "campo": "anexo",
                "label": "Arquivo",
                "de": nome_anterior,
                "para": novo_nome,
            }],
        )
    )
    item.historico = historico
    await db.flush()
    await db.refresh(item)
    return await _serialize(db, item)


@router.delete("/{demanda_id}/anexos", response_model=DemandaAvulsaResponse)
async def excluir_anexo(
    demanda_id: int,
    url: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    gestor: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    item = await _obter_ou_404(db, demanda_id)
    anexos = [dict(a) for a in (item.anexos or [])]
    alvo = next((a for a in anexos if a.get("url") == url), None)
    if alvo is None:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    item.anexos = [a for a in anexos if a.get("url") != url]

    historico = list(item.historico or [])
    historico.append(
        _evento_historico(
            gestor,
            "anexo",
            f'Arquivo excluído: "{alvo.get("nome") or "arquivo"}"',
        )
    )
    item.historico = historico
    await db.flush()
    excluir_upload_url(url)
    await db.refresh(item)
    return await _serialize(db, item)


@router.delete("/{demanda_id}", status_code=204)
async def excluir(
    demanda_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    item = await _obter_ou_404(db, demanda_id)
    await finalizar_foco_ativo_da_demanda_avulsa(
        db,
        demanda_id,
        comentario="Finalizado automaticamente — demanda avulsa excluída",
    )
    item.deleted_at = datetime.now(timezone.utc)
    await db.flush()
