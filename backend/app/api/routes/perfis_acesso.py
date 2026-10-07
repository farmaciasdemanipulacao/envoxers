import re
import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.perfis_acesso import validar_modulos
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.perfil_acesso import PerfilAcesso
from app.schemas.perfil_acesso import PerfilAcessoCreate, PerfilAcessoUpdate, PerfilAcessoResponse

router = APIRouter(prefix="/perfis-acesso", tags=["perfis-acesso"])

def _slug(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii").lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base[:100] or "perfil"

async def _response(db: AsyncSession, item: PerfilAcesso) -> PerfilAcessoResponse:
    qtd = (await db.execute(
        select(func.count()).select_from(Envoxer).where(
            Envoxer.perfil_acesso_id == item.id,
            Envoxer.deleted_at.is_(None),
        )
    )).scalar_one()
    return PerfilAcessoResponse(
        id=item.id,
        nome=item.nome,
        slug=item.slug,
        nivel_base=item.nivel_base,
        modulos=list(item.modulos or []),
        sistema=item.sistema,
        ativo=item.ativo,
        usuarios_count=qtd,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )

@router.get("", response_model=list[PerfilAcessoResponse])
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    itens = list((await db.execute(select(PerfilAcesso).order_by(PerfilAcesso.sistema.desc(), PerfilAcesso.nome))).scalars().all())
    return [await _response(db, x) for x in itens]

@router.post("", response_model=PerfilAcessoResponse, status_code=201)
async def criar(
    payload: PerfilAcessoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    nome = payload.nome.strip()
    try:
        modulos = validar_modulos(payload.nivel_base, payload.modulos)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    slug_base = _slug(nome)
    slug = slug_base
    n = 2
    while (await db.execute(select(PerfilAcesso.id).where(PerfilAcesso.slug == slug))).scalar_one_or_none() is not None:
        slug = f"{slug_base[:92]}-{n}"
        n += 1
    if (await db.execute(select(PerfilAcesso.id).where(func.lower(PerfilAcesso.nome) == nome.lower()))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Já existe um perfil com esse nome")
    item = PerfilAcesso(nome=nome, slug=slug, nivel_base=payload.nivel_base, modulos=modulos, sistema=False, ativo=True)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return await _response(db, item)

@router.patch("/{perfil_id}", response_model=PerfilAcessoResponse)
async def atualizar(
    perfil_id: int,
    payload: PerfilAcessoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    item = await db.get(PerfilAcesso, perfil_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")

    dados = payload.model_dump(exclude_unset=True)
    nivel = dados.get("nivel_base", item.nivel_base)

    if item.sistema:
        dados.pop("nome", None)
        dados.pop("nivel_base", None)
        dados.pop("ativo", None)
        nivel = item.nivel_base

    if "nome" in dados:
        nome = dados["nome"].strip()
        existe = (await db.execute(
            select(PerfilAcesso.id).where(func.lower(PerfilAcesso.nome) == nome.lower(), PerfilAcesso.id != item.id)
        )).scalar_one_or_none()
        if existe:
            raise HTTPException(status_code=409, detail="Já existe um perfil com esse nome")
        item.nome = nome

    if "nivel_base" in dados:
        item.nivel_base = dados["nivel_base"]

    if "modulos" in dados:
        try:
            item.modulos = validar_modulos(nivel, dados["modulos"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    if "ativo" in dados:
        if not dados["ativo"]:
            qtd = (await db.execute(
                select(func.count()).select_from(Envoxer).where(
                    Envoxer.perfil_acesso_id == item.id,
                    Envoxer.ativo.is_(True),
                    Envoxer.deleted_at.is_(None),
                )
            )).scalar_one()
            if qtd:
                raise HTTPException(status_code=409, detail="Não é possível desativar um perfil em uso")
        item.ativo = dados["ativo"]

    await db.flush()
    await db.refresh(item)
    return await _response(db, item)

@router.delete("/{perfil_id}", status_code=204)
async def excluir(
    perfil_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    item = await db.get(PerfilAcesso, perfil_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    if item.sistema:
        raise HTTPException(status_code=400, detail="Perfis padrão do sistema não podem ser excluídos")
    qtd = (await db.execute(
        select(func.count()).select_from(Envoxer).where(
            Envoxer.perfil_acesso_id == item.id,
            Envoxer.deleted_at.is_(None),
        )
    )).scalar_one()
    if qtd:
        raise HTTPException(status_code=409, detail="Esse perfil está atribuído a usuários")
    await db.delete(item)
    await db.flush()
