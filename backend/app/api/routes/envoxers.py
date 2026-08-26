from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer, get_current_gestor_ou_admin, oauth2_scheme
from app.core.security import create_access_token, decode_access_token, hash_password
from app.core.uploads import salvar_foto_avatar
from app.core.valores import redigir
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.impersonacao_log import ImpersonacaoLog
from app.schemas.auth import Token
from app.schemas.envoxer import (
    EnvoxerCreate,
    EnvoxerUpdate,
    EnvoxerResponse,
    EnvoxerDesativarRequest,
    TransferenciaResumo,
)
from app.services.transferencia_envoxer import transferir_pendencias

router = APIRouter(prefix="/envoxers", tags=["envoxers"])

_EMAIL_LIBERADO_PREFIXO = "deletado_"


def _liberar_email(envoxer: Envoxer) -> None:
    """Ao desativar, renomeia o e-mail (preservando histórico) pra liberar o original
    pra reuso em um novo cadastro. Idempotente — não re-renomeia quem já foi liberado."""
    if not envoxer.email.startswith(_EMAIL_LIBERADO_PREFIXO):
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        envoxer.email = f"{_EMAIL_LIBERADO_PREFIXO}{timestamp}_{envoxer.email}"


@router.get("", response_model=list[EnvoxerResponse])
async def listar_envoxers(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Envoxer).where(Envoxer.deleted_at.is_(None)).order_by(Envoxer.nome)
    )
    itens = [EnvoxerResponse.model_validate(e) for e in result.scalars().all()]
    for item in itens:
        redigir(item, ["salario_mensal", "custo_hora"], envoxer)
    return itens


@router.post("", response_model=EnvoxerResponse, status_code=201)
async def criar_envoxer(
    payload: EnvoxerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    existente = await db.execute(select(Envoxer).where(Envoxer.email == payload.email))
    if existente.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Já existe um envoxer com esse e-mail")

    data = payload.model_dump(exclude={"senha"})
    custo_hora = round(payload.salario_mensal / payload.horas_mes, 2)
    envoxer = Envoxer(**data, senha_hash=hash_password(payload.senha), custo_hora=custo_hora)
    db.add(envoxer)
    await db.flush()
    await db.refresh(envoxer)
    return envoxer


@router.patch("/{envoxer_id}", response_model=EnvoxerResponse)
async def atualizar_envoxer(
    envoxer_id: int,
    payload: EnvoxerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    envoxer = result.scalar_one_or_none()
    if envoxer is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")

    updates = payload.model_dump(exclude_unset=True, exclude={"senha"})
    for field, value in updates.items():
        setattr(envoxer, field, value)
    if payload.senha:
        envoxer.senha_hash = hash_password(payload.senha)

    if "salario_mensal" in updates or "horas_mes" in updates:
        if envoxer.salario_mensal is not None:
            envoxer.custo_hora = round(envoxer.salario_mensal / envoxer.horas_mes, 2)
        else:
            envoxer.custo_hora = 0

    await db.flush()
    await db.refresh(envoxer)
    return envoxer


@router.post("/me/status-instalacao", response_model=EnvoxerResponse)
async def marcar_app_instalado(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Self-service (D-114) — o frontend chama isso assim que detecta a app rodando
    em display-mode:standalone pela 1ª vez (ver OnboardingGate em tc-app.jsx).
    Idempotente e permanente: uma vez marcado, não desmarca sozinho."""
    if not envoxer.app_instalado:
        envoxer.app_instalado = True
        envoxer.app_instalado_em = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(envoxer)
    resp = EnvoxerResponse.model_validate(envoxer)
    redigir(resp, ["salario_mensal", "custo_hora"], envoxer)
    return resp


@router.post("/{envoxer_id}/impersonar", response_model=Token)
async def impersonar_envoxer(
    envoxer_id: int,
    request: Request,
    token_atual: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[Envoxer, Depends(get_current_admin)],
):
    """"Acessar como" — admin passa a usar um token da conta de outro envoxer,
    sem senha, pra ver/navegar o app do ponto de vista dele. Pedido explícito do
    Gus: nunca sair da própria conta, nunca logar na do outro. `imp_by` no JWT
    guarda o admin real (bloqueia encadear impersonação em cima de impersonação)
    e cada acesso grava um `ImpersonacaoLog` — visualizar não é passar batido,
    é auditável."""
    payload_atual = decode_access_token(token_atual) or {}
    if payload_atual.get("imp_by") is not None:
        raise HTTPException(status_code=403, detail="Volte para sua própria conta antes de acessar outra")

    if envoxer_id == admin.id:
        raise HTTPException(status_code=400, detail="Você já está na sua própria conta")

    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id, Envoxer.deleted_at.is_(None)))
    alvo = result.scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")
    if not alvo.ativo:
        raise HTTPException(status_code=400, detail="Envoxer inativo")
    if alvo.permissao == "admin":
        raise HTTPException(status_code=403, detail="Não é possível acessar a conta de outro admin")

    access_token = create_access_token({"sub": str(alvo.id), "tipo": "envoxer", "imp_by": admin.id})

    db.add(ImpersonacaoLog(
        admin_id=admin.id,
        envoxer_id=alvo.id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    await db.flush()

    return Token(access_token=access_token, id=alvo.id, nome=alvo.nome, permissao=alvo.permissao, foto_url=alvo.foto_url)


@router.post("/me/foto", response_model=EnvoxerResponse)
async def upload_minha_foto(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    arquivo: UploadFile = File(...),
):
    """Self-service (D-090) — qualquer envoxer logado troca a própria foto, sem precisar de admin."""
    salvo = await salvar_foto_avatar(arquivo)
    envoxer.foto_url = salvo["url"]
    await db.flush()
    await db.refresh(envoxer)
    resp = EnvoxerResponse.model_validate(envoxer)
    redigir(resp, ["salario_mensal", "custo_hora"], envoxer)
    return resp


@router.post("/{envoxer_id}/foto", response_model=EnvoxerResponse)
async def upload_foto_de(
    envoxer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
    arquivo: UploadFile = File(...),
):
    """Admin troca a foto de qualquer envoxer (D-090) — mesmo padrão de upload dos anexos de tarefa."""
    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    alvo = result.scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")
    salvo = await salvar_foto_avatar(arquivo)
    alvo.foto_url = salvo["url"]
    await db.flush()
    await db.refresh(alvo)
    return alvo


@router.post("/{envoxer_id}/ativar", response_model=EnvoxerResponse)
async def ativar_envoxer(
    envoxer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    envoxer = result.scalar_one_or_none()
    if envoxer is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")
    envoxer.ativo = True
    await db.flush()
    await db.refresh(envoxer)
    return envoxer


@router.post("/{envoxer_id}/desativar", response_model=TransferenciaResumo)
async def desativar_envoxer(
    envoxer_id: int,
    payload: EnvoxerDesativarRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    quem_desativa: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    """Troca de pessoa: desativar exige escolher um substituto ativo, que recebe as
    etapas abertas/atrasadas, as etapas-modelo padrão e a ordem manual de prioridade
    dessa pessoa. Etapas já concluídas mantêm o nome de quem saiu (histórico intacto)."""
    if envoxer_id == quem_desativa.id:
        raise HTTPException(status_code=400, detail="Você não pode desativar sua própria conta")
    if envoxer_id == payload.substituto_id:
        raise HTTPException(status_code=400, detail="O substituto não pode ser a própria pessoa desativada")

    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    envoxer = result.scalar_one_or_none()
    if envoxer is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")
    if not envoxer.ativo:
        raise HTTPException(status_code=400, detail="Envoxer já está inativo")

    substituto = (
        await db.execute(select(Envoxer).where(Envoxer.id == payload.substituto_id))
    ).scalar_one_or_none()
    if substituto is None or not substituto.ativo:
        raise HTTPException(status_code=400, detail="Substituto inválido — precisa ser um envoxer ativo")

    resumo = await transferir_pendencias(db, envoxer_id, payload.substituto_id)

    _liberar_email(envoxer)
    envoxer.ativo = False
    await db.flush()

    return TransferenciaResumo(substituto_nome=substituto.nome, **resumo)
