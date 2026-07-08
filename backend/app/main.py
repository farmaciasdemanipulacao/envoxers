"""Envoxers — Sistema de Gestão Interna da Envox. Entry point FastAPI."""
import os
import subprocess
import sys

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.envoxer import Envoxer
from app.models.servico import Servico
from app.models.motivo_churn import MotivoChurnCatalogo
from app.api.routes import health, auth, envoxers, servicos, clientes, tarefas, registro_foco, relatorio, aprovacoes, solicitacoes, pulso_checkin, farol, churn, icp, faturamento, calendario

logger = structlog.get_logger()

SERVICOS_PADRAO = [
    ("Social Media", "social", "Planejamento, criação e gestão de conteúdo social"),
    ("Tráfego Pago", "trafego", "Meta Ads, Google Ads, gestão de campanhas"),
    ("Design", "design", "Peças gráficas, identidade, materiais"),
    ("Vídeo", "video", "Roteiro, gravação, edição"),
    ("SDR", "sdr", "Prospecção ativa e pré-venda"),
    ("Site", "site", "Landing pages e websites"),
    ("Atendimento", "atendimento", "Gestão de conta e relacionamento"),
]

MOTIVOS_CHURN_PADRAO = [
    ("preco_alto", "Preço acima do orçamento", "preco", 10),
    ("sem_retorno", "Não viu retorno / ROI", "entrega", 20),
    ("atraso_entrega", "Atrasos ou falha de entrega", "entrega", 30),
    ("qualidade_criativo", "Qualidade do criativo abaixo do esperado", "entrega", 40),
    ("mudou_estrategia", "Mudou de estratégia (internalizou / parou marketing)", "externa", 50),
    ("trocou_agencia", "Trocou por outra agência", "ativa", 60),
    ("perfil_errado", "Serviço não era o que o cliente precisava", "encaixe", 70),
    ("cliente_dificil", "Relação difícil / expectativa desalinhada", "encaixe", 80),
    ("empresa_encerrada", "Empresa fechou ou reduziu operação", "externa", 90),
    ("financeiro", "Problema financeiro do cliente", "externa", 100),
    ("sem_resposta", "Sumiu — sem resposta ao contato", "sem_resposta", 110),
    ("outro", "Outro", "externa", 120),
]


async def run_migrations():
    if not settings.AUTO_MIGRATE:
        return
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            logger.info("migrations_applied", output=result.stdout[-500:])
        else:
            logger.warning("migrations_failed", error=result.stderr[-1000:])
    except Exception as e:
        logger.error("migrations_error", error=str(e))


async def seed_dados_iniciais():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Servico))
        if result.scalars().first() is None:
            for nome, slug, descricao in SERVICOS_PADRAO:
                db.add(Servico(nome=nome, slug=slug, descricao=descricao))
            await db.commit()
            logger.info("servicos_seed_criado")

        result = await db.execute(select(MotivoChurnCatalogo))
        if result.scalars().first() is None:
            for codigo, nome, categoria, ordem in MOTIVOS_CHURN_PADRAO:
                db.add(MotivoChurnCatalogo(codigo=codigo, nome=nome, categoria=categoria, ordem=ordem))
            await db.commit()
            logger.info("motivos_churn_seed_criado")

        result = await db.execute(select(Envoxer).where(Envoxer.email == "admin@envox.com.br"))
        if result.scalar_one_or_none() is None:
            db.add(
                Envoxer(
                    nome="Admin Envoxers",
                    email="admin@envox.com.br",
                    cargo="Administrador",
                    permissao="admin",
                    senha_hash=hash_password("TrocarSenha123!"),
                    custo_hora=0,
                )
            )
            await db.commit()
            logger.info("admin_padrao_criado", email="admin@envox.com.br")


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(envoxers.router, prefix=API_PREFIX)
app.include_router(servicos.router, prefix=API_PREFIX)
app.include_router(clientes.router, prefix=API_PREFIX)
app.include_router(tarefas.router, prefix=API_PREFIX)
app.include_router(registro_foco.router, prefix=API_PREFIX)
app.include_router(relatorio.router, prefix=API_PREFIX)
app.include_router(aprovacoes.router, prefix=API_PREFIX)
app.include_router(solicitacoes.router, prefix=API_PREFIX)
app.include_router(pulso_checkin.router, prefix=API_PREFIX)
app.include_router(farol.router, prefix=API_PREFIX)
app.include_router(churn.router, prefix=API_PREFIX)
app.include_router(icp.router, prefix=API_PREFIX)
app.include_router(faturamento.router, prefix=API_PREFIX)
app.include_router(calendario.router, prefix=API_PREFIX)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount(f"{API_PREFIX}/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.on_event("startup")
async def on_startup():
    await run_migrations()
    await seed_dados_iniciais()
    logger.info("envoxers_backend_started", env=settings.APP_ENV)
