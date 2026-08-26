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
from app.models.chat_canal import ChatCanal
from app.models.alerta_config import AlertaConfig
from app.models.competencia_catalogo import CompetenciaCatalogo
from app.api.routes import health, auth, envoxers, servicos, clientes, tarefas, registro_foco, relatorio, aprovacoes, solicitacoes, pulso_checkin, farol, churn, icp, faturamento, calendario, chat, push, alertas_config, etapas, pendencias, etapas_template, cliente_contatos, portal_auth, item_escopo, documento_acordo, portal_documentos, acessos, pdi, ciclos, avaliacao_360, avaliacao_180, feedback_1a1, clima

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

# Mesmo seed original da migration 0016_alerta_config — precisou virar idempotente
# aqui também porque migration só roda uma vez (marcada como aplicada no
# alembic_version) e um TRUNCATE/wipe da tabela (ex.: D-108) não a refaz sozinha,
# diferente de Servico/MotivoChurnCatalogo/ChatCanal, que já eram recriados aqui.
ALERTAS_CONFIG_PADRAO = [
    ("farol_geral", "Farol piorou (geral)", "farol", "Dispara quando a cor geral do Farol de um cliente piora.", True, ["admin", "gestor"]),
    ("farol_sinal_entrega", "Sinal: Entrega no prazo", "farol", "Dispara quando o sinal de entrega piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_atrasadas", "Sinal: Tarefas atrasadas", "farol", "Dispara quando o sinal de atrasadas piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_alteracoes", "Sinal: Alterações acima do limite", "farol", "Dispara quando o sinal de alterações piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_aprovacoes", "Sinal: Aprovações paradas", "farol", "Dispara quando o sinal de aprovações piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_pulso", "Sinal: Pulso de satisfação", "farol", "Dispara quando o sinal de pulso piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_margem", "Sinal: Margem", "farol", "Dispara quando o sinal de margem piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_silencio", "Sinal: Silêncio do cliente", "farol", "Dispara quando o sinal de silêncio piora, isoladamente.", False, ["admin", "gestor"]),
    ("chat_dm", "Mensagem direta no chat", "chat", "Dispara quando alguém manda uma DM pra um envoxer que não está com a aba visível.", True, None),
    ("chat_geral", "Mensagem no chat (geral/cliente)", "chat", "Dispara quando alguém manda mensagem no canal geral ou de um cliente, pra quem não está com a aba visível.", True, None),
]

# F4 (D-121) — catálogo inicial de competências do Feedback 360°, editável depois pelo admin.
COMPETENCIAS_360_PADRAO = [
    ("Comunicação", "Clareza e frequência ao se comunicar com o time e com clientes.", 10),
    ("Qualidade técnica", "Domínio técnico e capricho na entrega do próprio trabalho.", 20),
    ("Colaboração", "Disposição pra ajudar, dar e receber feedback, trabalhar em equipe.", 30),
    ("Proatividade", "Antecipa problemas e propõe solução sem esperar ser cobrado.", 40),
    ("Cumprimento de prazos", "Entrega no prazo combinado, avisa cedo quando não vai dar.", 50),
    ("Organização", "Prioriza bem, mantém tarefas/etapas em dia, não deixa solto.", 60),
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

        # Checa por QUALQUER admin ativo, não pelo e-mail exato "admin@envox.com.br" —
        # se checasse só o e-mail, trocar o e-mail do admin real (ex.: pra
        # gustavo@envox.com.br) faria o seed "não reconhecer" o admin existente e
        # recriar um fantasma com senha padrão a cada restart/deploy (aconteceu de
        # verdade em produção, ver demand_log D-113).
        result = await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)))
        if result.scalars().first() is None:
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

        # Por chave, não "tabela vazia" (D-115) — senão um tipo novo adicionado ao
        # catálogo (ex.: chat_geral) nunca nasceria numa produção que já rodou o
        # seed antes (a tabela não está mais vazia, então o `first() is None` de
        # baixo nunca mais seria True pra fazer o catálogo crescer sozinho).
        result = await db.execute(select(AlertaConfig.chave))
        chaves_existentes = {row[0] for row in result.all()}
        novas = [item for item in ALERTAS_CONFIG_PADRAO if item[0] not in chaves_existentes]
        if novas:
            for chave, nome, grupo, descricao, ativo, papeis in novas:
                db.add(AlertaConfig(chave=chave, nome=nome, grupo=grupo, descricao=descricao, ativo=ativo, papeis=papeis))
            await db.commit()
            logger.info("alertas_config_seed_criado", novas=[n[0] for n in novas])

        result = await db.execute(select(CompetenciaCatalogo))
        if result.scalars().first() is None:
            for nome, descricao, ordem in COMPETENCIAS_360_PADRAO:
                db.add(CompetenciaCatalogo(nome=nome, descricao=descricao, ordem=ordem))
            await db.commit()
            logger.info("competencias_360_seed_criado")

        result = await db.execute(select(ChatCanal).where(ChatCanal.tipo == "geral"))
        if result.scalar_one_or_none() is None:
            db.add(ChatCanal(tipo="geral"))
            await db.commit()
            logger.info("chat_canal_geral_criado")


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
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(push.router, prefix=API_PREFIX)
app.include_router(alertas_config.router, prefix=API_PREFIX)
app.include_router(etapas.router, prefix=API_PREFIX)
app.include_router(pendencias.router, prefix=API_PREFIX)
app.include_router(etapas_template.router, prefix=API_PREFIX)
app.include_router(cliente_contatos.router, prefix=API_PREFIX)
app.include_router(portal_auth.router, prefix=API_PREFIX)
app.include_router(item_escopo.router, prefix=API_PREFIX)
app.include_router(documento_acordo.router, prefix=API_PREFIX)
app.include_router(portal_documentos.router, prefix=API_PREFIX)
app.include_router(acessos.router, prefix=API_PREFIX)
app.include_router(pdi.router, prefix=API_PREFIX)
app.include_router(ciclos.router, prefix=API_PREFIX)
app.include_router(avaliacao_360.router, prefix=API_PREFIX)
app.include_router(avaliacao_180.router, prefix=API_PREFIX)
app.include_router(feedback_1a1.router, prefix=API_PREFIX)
app.include_router(clima.router, prefix=API_PREFIX)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount(f"{API_PREFIX}/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.on_event("startup")
async def on_startup():
    await run_migrations()
    await seed_dados_iniciais()
    logger.info("envoxers_backend_started", env=settings.APP_ENV)
