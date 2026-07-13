"""Seed de dados fakes para navegar/testar o Envoxers do F0 ao F3.

Cria 7 envoxers, 10 clientes (3 farol verde, 3 amarelo, 2 vermelho, 2 cancelados),
tarefas distribuídas nas 8 colunas do Kanban, registros de Foco, aprovações,
alterações, pulso de satisfação e check-ins — e força o recálculo do Farol
para os clientes ativos ao final (mesma lógica de GET /farol).

Marcação (ver seed_common.py): Cliente/Envoxer com nome prefixado "[SEED] ",
Cliente.observacoes contém a tag SEED_DATA_2026, Envoxer.email usa o domínio
@seedtest.envox.com.br. Senha de login de todos os envoxers fake:
SeedTeste123!

Rodar de novo com dado fake já presente ABORTA com aviso — rode
scripts/limpar_seed.py antes se quiser regenerar.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/seed_dados.py
"""
import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.services.farol import calcular_farol_cliente  # noqa: E402

from app.models.envoxer import Envoxer  # noqa: E402
from app.models.servico import Servico  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.cliente_servico import ClienteServico  # noqa: E402
from app.models.escopo import Escopo  # noqa: E402
from app.models.tarefa import Tarefa  # noqa: E402
from app.models.registro_foco import RegistroFoco  # noqa: E402
from app.models.aprovacao import Aprovacao  # noqa: E402
from app.models.alteracao import Alteracao  # noqa: E402
from app.models.pulso_satisfacao import PulsoSatisfacao  # noqa: E402
from app.models.check_in import CheckIn  # noqa: E402
from app.models.churn_snapshot import ChurnSnapshot  # noqa: E402
from app.models.farol_calculo import FarolCalculo, FarolCalculoHistorico  # noqa: E402
from app.models.alerta_farol import AlertaFarol  # noqa: E402
from app.models.motivo_churn import MotivoChurnCatalogo  # noqa: E402

from seed_common import SEED_PREFIX, SEED_TAG, SEED_EMAIL_DOMAIN, SEED_SENHA_PADRAO  # noqa: E402

HOJE = date.today()


def dt(d: date, hora: int = 12) -> datetime:
    return datetime(d.year, d.month, d.day, hora, 0, tzinfo=timezone.utc)


def ha_dias(dias: int) -> date:
    return HOJE - timedelta(days=dias)


def daqui_a(dias: int) -> date:
    return HOJE + timedelta(days=dias)


def ano_mes(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


# ============================================================
# ENVOXERS (7)
# ============================================================
ENVOXERS_SEED = [
    ("Ana Beatriz Souza", "ana.souza", "Gestora de Tráfego", 4800),
    ("Bruno Costa Lima", "bruno.lima", "Designer", 3500),
    ("Carla Menezes Rocha", "carla.rocha", "Social Media", 3200),
    ("Diego Ferreira Alves", "diego.alves", "SDR", 2800),
    ("Elisa Ramos Cardoso", "elisa.cardoso", "Atendimento", 3000),
    ("Fábio Nogueira Pinto", "fabio.pinto", "Videomaker", 4200),
    ("Gabriela Martins Duarte", "gabriela.duarte", "Social Media", 3600),
]


async def criar_envoxers(db):
    envoxers = []
    for nome, login, cargo, salario in ENVOXERS_SEED:
        custo_hora = round(salario / 220, 2)
        env = Envoxer(
            nome=f"{SEED_PREFIX}{nome}",
            email=f"{login}{SEED_EMAIL_DOMAIN}",
            cargo=cargo,
            salario_mensal=salario,
            horas_mes=220,
            custo_hora=custo_hora,
            permissao="envoxer",
            senha_hash=hash_password(SEED_SENHA_PADRAO),
        )
        db.add(env)
        envoxers.append(env)
    await db.flush()
    return envoxers


# ============================================================
# CLIENTES (10) — 3 verde, 3 amarelo, 2 vermelho, 2 cancelados
# ============================================================
# cenario: "verde" | "amarelo_atraso" | "amarelo_alteracoes" | "vermelho" | "cancelado_curto" | "cancelado_longo"
CLIENTES_SEED = [
    dict(
        nome="Sabor & Cia Restaurante", cenario="verde", segmento="Restaurante",
        ticket=42000, canal_aquisicao="indicacao", maturidade_digital="media",
        valor_contrato=1800, tipo_receita="recorrente", data_inicio_contrato=ha_dias(26 * 30),
        servicos=[("social", 900), ("design", 500), ("trafego", 400)],
        escopo=dict(posts_mes=12, videos_mes=1, campanhas_mes=1, limite_alteracoes=2, outros_itens="1 sessão de fotos/mês"),
        links=dict(instagram="@saborecia", facebook="/saborecia", site="https://saborecia.com.br"),
    ),
    dict(
        nome="Farmácia Vida Plena", cenario="verde", segmento="Farmácia de Manipulação",
        ticket=85000, canal_aquisicao="inbound", maturidade_digital="alta",
        valor_contrato=3200, tipo_receita="recorrente", data_inicio_contrato=ha_dias(32 * 30),
        servicos=[("social", 1200), ("atendimento", 900), ("trafego", 700)],
        escopo=dict(posts_mes=16, videos_mes=2, campanhas_mes=2, limite_alteracoes=2, outros_itens="Conteúdo educativo semanal"),
        links=dict(instagram="@vidaplenafarma", facebook="/vidaplenafarma", site="https://farmaciavidaplena.com.br"),
    ),
    dict(
        nome="Studio Bella Estética", cenario="verde", segmento="Estética",
        ticket=26000, canal_aquisicao="evento", maturidade_digital="media",
        valor_contrato=1500, tipo_receita="recorrente", data_inicio_contrato=ha_dias(10 * 30),
        servicos=[("social", 700), ("video", 500), ("design", 300)],
        escopo=dict(posts_mes=10, videos_mes=3, campanhas_mes=1, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@studiobellaestetica", facebook="/studiobella", site=None),
    ),
    dict(
        nome="Doce Ponto Confeitaria", cenario="amarelo_atraso", segmento="Alimentação",
        ticket=15000, canal_aquisicao="outbound", maturidade_digital="baixa",
        valor_contrato=1200, tipo_receita="recorrente", data_inicio_contrato=ha_dias(18 * 30),
        servicos=[("social", 700), ("design", 500)],
        escopo=dict(posts_mes=8, videos_mes=0, campanhas_mes=1, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@doceponto", facebook="/doceponto", site=None),
    ),
    dict(
        nome="Odonto Sorriso Clínica", cenario="amarelo_alteracoes", segmento="Odontologia",
        ticket=60000, canal_aquisicao="sdr", maturidade_digital="media",
        valor_contrato=2500, tipo_receita="recorrente", data_inicio_contrato=ha_dias(9 * 30),
        servicos=[("social", 1000), ("trafego", 900), ("atendimento", 600)],
        escopo=dict(posts_mes=10, videos_mes=1, campanhas_mes=2, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@odontosorriso", facebook="/odontosorriso", site="https://odontosorriso.com.br"),
    ),
    dict(
        nome="Vetorial Contabilidade", cenario="amarelo_atraso", segmento="Contabilidade",
        ticket=30000, canal_aquisicao="outro", maturidade_digital="baixa",
        valor_contrato=900, tipo_receita="pontual", data_inicio_contrato=ha_dias(3 * 30),
        servicos=[("site", 600), ("atendimento", 300)],
        escopo=dict(posts_mes=4, videos_mes=0, campanhas_mes=0, limite_alteracoes=2, outros_itens="Projeto pontual — e-book + landing page"),
        links=dict(instagram=None, facebook=None, site="https://vetorialcontabil.com.br"),
    ),
    dict(
        nome="Pet Amigo Petshop", cenario="vermelho", segmento="Pet",
        ticket=12000, canal_aquisicao="indicacao", maturidade_digital="baixa",
        valor_contrato=400, tipo_receita="recorrente", data_inicio_contrato=ha_dias(14 * 30),
        servicos=[("social", 250), ("trafego", 150)],
        escopo=dict(posts_mes=8, videos_mes=0, campanhas_mes=1, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@petamigoshop", facebook="/petamigoshop", site=None),
    ),
    dict(
        nome="Fit Total Academia", cenario="vermelho", segmento="Academia",
        ticket=20000, canal_aquisicao="inbound", maturidade_digital="media",
        valor_contrato=400, tipo_receita="recorrente", data_inicio_contrato=ha_dias(5 * 30),
        servicos=[("social", 250), ("video", 150)],
        escopo=dict(posts_mes=8, videos_mes=2, campanhas_mes=1, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@fittotalacademia", facebook="/fittotalacademia", site=None),
    ),
    dict(
        nome="Moda Urbana Boutique", cenario="cancelado_curto", segmento="Moda",
        ticket=18000, canal_aquisicao="evento", maturidade_digital="media",
        valor_contrato=1000, tipo_receita="recorrente", data_inicio_contrato=date(2026, 2, 1),
        data_cancelamento=date(2026, 6, 20), motivo_codigo="sem_retorno", farol_congelado="vermelho",
        servicos=[("social", 600), ("design", 400)],
        escopo=dict(posts_mes=8, videos_mes=0, campanhas_mes=1, limite_alteracoes=2, outros_itens=None),
        links=dict(instagram="@modaurbana", facebook="/modaurbana", site=None),
    ),
    dict(
        nome="Imóveis Horizonte Imobiliária", cenario="cancelado_longo", segmento="Imobiliária",
        ticket=150000, canal_aquisicao="outbound", maturidade_digital="alta",
        valor_contrato=2200, tipo_receita="recorrente", data_inicio_contrato=date(2024, 3, 15),
        data_cancelamento=date(2026, 5, 10), motivo_codigo="trocou_agencia", farol_congelado="amarelo",
        servicos=[("site", 900), ("trafego", 800), ("atendimento", 500)],
        escopo=dict(posts_mes=10, videos_mes=1, campanhas_mes=2, limite_alteracoes=3, outros_itens=None),
        links=dict(instagram="@imoveishorizonte", facebook="/imoveishorizonte", site="https://imoveishorizonte.com.br"),
    ),
]

OBS_POR_CENARIO = {
    "verde": "cenário-alvo: farol VERDE (entrega em dia, sem atraso, pulso alto).",
    "amarelo_atraso": "cenário-alvo: farol AMARELO (tarefas atrasadas).",
    "amarelo_alteracoes": "cenário-alvo: farol AMARELO (alterações acima do limite do escopo).",
    "vermelho": "cenário-alvo: farol VERMELHO (atrasado, margem negativa, pulso baixo).",
    "cancelado_curto": "cenário-alvo: churn com MENOS de 6 meses de casa (alimenta 'Perdidos' do ICP).",
    "cancelado_longo": "cenário-alvo: churn com MAIS de 12 meses de casa.",
}


async def criar_clientes(db, envoxers, servico_ids):
    clientes = []
    for i, c in enumerate(CLIENTES_SEED):
        responsavel = envoxers[i % len(envoxers)]
        cliente = Cliente(
            nome=f"{SEED_PREFIX}{c['nome']}",
            valor_contrato=c["valor_contrato"],
            tipo_receita=c["tipo_receita"],
            data_inicio_contrato=c["data_inicio_contrato"],
            segmento=c["segmento"],
            canal_aquisicao=c["canal_aquisicao"],
            ticket=c["ticket"],
            maturidade_digital=c["maturidade_digital"],
            responsavel_envoxer_id=responsavel.id,
            links_redes=c["links"],
            observacoes=f"{SEED_TAG} — {OBS_POR_CENARIO[c['cenario']]} Cliente fictício gerado para testes de navegação.",
            status_farol=c.get("farol_congelado", "verde"),
        )
        db.add(cliente)
        clientes.append(cliente)
    await db.flush()

    for cliente, c in zip(clientes, CLIENTES_SEED):
        db.add(Escopo(cliente_id=cliente.id, **c["escopo"]))
        for slug, valor in c["servicos"]:
            db.add(ClienteServico(cliente_id=cliente.id, servico_id=servico_ids[slug], valor_mensal=valor))
    await db.flush()

    return clientes


# ============================================================
# TAREFAS + REGISTRO DE FOCO por cenário
# ============================================================
async def criar_tarefas_e_foco(db, clientes_por_nome, envoxers_por_login, servico_ids):
    tarefas_criadas = []
    focos_criados = []
    aprovacoes_criadas = []
    alteracoes_criadas = []

    def env(login):
        return envoxers_por_login[login]

    def nova_tarefa(cliente, titulo, servico_slug, status, responsavel, prazo=None, **extra):
        t = Tarefa(
            cliente_id=cliente.id,
            servico_id=servico_ids.get(servico_slug),
            titulo=titulo,
            status=status,
            responsavel_envoxer_id=responsavel.id,
            prazo=prazo,
            **extra,
        )
        db.add(t)
        tarefas_criadas.append(t)
        return t

    def nova_aprovacao(**kwargs):
        a = Aprovacao(**kwargs)
        db.add(a)
        aprovacoes_criadas.append(a)
        return a

    def nova_alteracao(**kwargs):
        a = Alteracao(**kwargs)
        db.add(a)
        alteracoes_criadas.append(a)
        return a

    def novo_foco(**kwargs):
        f = RegistroFoco(**kwargs)
        db.add(f)
        focos_criados.append(f)
        return f

    # --- VERDE: Sabor & Cia Restaurante -----------------------------------
    c = clientes_por_nome["Sabor & Cia Restaurante"]
    nova_tarefa(c, "Fotografar pratos para cardápio digital", "design", "finalizado", env("carla.rocha"),
                finalizada_em=dt(ha_dias(4)))
    t = nova_tarefa(c, "Configurar campanha Meta Ads - Dia dos Pais", "trafego", "programado", env("ana.souza"),
                     prazo=daqui_a(10), aprovada_interna=True, aprovada_cliente=True)
    await db.flush()
    nova_aprovacao(tarefa_id=t.id, etapa="interna", decisao="aprovada", decidido_por_envoxer_id=env("ana.souza").id)
    nova_aprovacao(tarefa_id=t.id, etapa="cliente", decisao="aprovada", decidido_por_cliente_nome="Roberto (sócio)")
    nova_tarefa(c, "Criar 4 posts feed - promoção fim de semana", "social", "planejamento", env("carla.rocha"),
                prazo=daqui_a(6))

    # --- VERDE: Farmácia Vida Plena ----------------------------------------
    c = clientes_por_nome["Farmácia Vida Plena"]
    nova_tarefa(c, "Criar arte institucional - linha de manipulados capilares", "design", "finalizado", env("bruno.lima"),
                finalizada_em=dt(ha_dias(8)))
    t = nova_tarefa(c, "Escrever legenda educativa sobre manipulados", "social", "aprovacao_cliente", env("carla.rocha"),
                     prazo=daqui_a(5), aprovada_interna=True)
    await db.flush()
    nova_aprovacao(tarefa_id=t.id, etapa="interna", decisao="aprovada", decidido_por_envoxer_id=env("elisa.cardoso").id)
    nova_tarefa(c, "Configurar campanha Google Ads - captação de receitas", "trafego", "programado", env("ana.souza"),
                prazo=daqui_a(15))

    # --- VERDE: Studio Bella Estética ---------------------------------------
    c = clientes_por_nome["Studio Bella Estética"]
    nova_tarefa(c, "Gravar vídeo depoimento de cliente", "video", "finalizado", env("fabio.pinto"),
                finalizada_em=dt(ha_dias(3)))
    t = nova_tarefa(c, "Criar 6 posts feed - promoção botox", "social", "aprovacao_cliente", env("carla.rocha"),
                     prazo=daqui_a(7), aprovada_interna=True)
    await db.flush()
    nova_aprovacao(tarefa_id=t.id, etapa="interna", decisao="aprovada", decidido_por_envoxer_id=env("gabriela.duarte").id)
    nova_tarefa(c, "Editar reels - bastidores do estúdio", "video", "nova", env("fabio.pinto"), prazo=daqui_a(20))

    # --- AMARELO (atraso): Doce Ponto Confeitaria — 3 tarefas atrasadas -----
    c = clientes_por_nome["Doce Ponto Confeitaria"]
    o1 = nova_tarefa(c, "Criar 4 posts feed - campanha dia dos pais", "social", "producao", env("carla.rocha"),
                      prazo=ha_dias(6))
    o2 = nova_tarefa(c, "Gravar vídeo institucional", "video", "planejamento", env("fabio.pinto"), prazo=ha_dias(10))
    o3 = nova_tarefa(c, "Configurar campanha Meta Ads - Black Friday", "trafego", "ajustes", env("ana.souza"),
                      prazo=ha_dias(3))
    nova_tarefa(c, "Criar arte para vitrine de doces", "design", "nova", env("bruno.lima"), prazo=daqui_a(12))

    # --- AMARELO (alterações): Odonto Sorriso — 2 tarefas c/ 3 alterações --
    c = clientes_por_nome["Odonto Sorriso Clínica"]
    alt1 = nova_tarefa(c, "Criar campanha de captação - avaliação gratuita", "trafego", "ajustes", env("ana.souza"),
                        prazo=daqui_a(8), aprovada_interna=True, qtd_alteracoes=3)
    alt2 = nova_tarefa(c, "Produzir vídeo institucional da clínica", "video", "ajustes", env("fabio.pinto"),
                        prazo=daqui_a(14), aprovada_interna=True, qtd_alteracoes=3)
    await db.flush()
    for n, desc in enumerate(
        ["Trocar chamada da campanha", "Ajustar público-alvo da segmentação", "Trocar imagem do criativo"], start=1
    ):
        nova_alteracao(tarefa_id=alt1.id, numero=n, descricao=desc, solicitante_cliente_nome="Dra. Fernanda")
    for n, desc in enumerate(
        ["Regravar trecho de abertura", "Trocar trilha sonora", "Adicionar depoimento de paciente"], start=1
    ):
        nova_alteracao(tarefa_id=alt2.id, numero=n, descricao=desc, solicitante_cliente_nome="Dra. Fernanda")
    nova_tarefa(c, "Postar depoimento de paciente", "social", "finalizado", env("carla.rocha"),
                finalizada_em=dt(ha_dias(5)))

    # --- AMARELO (atraso): Vetorial Contabilidade — 3 tarefas atrasadas -----
    c = clientes_por_nome["Vetorial Contabilidade"]
    nova_tarefa(c, "Criar e-book - guia tributário 2026", "design", "planejamento", env("bruno.lima"), prazo=ha_dias(8))
    nova_tarefa(c, "Configurar landing page - captação de leads", "site", "producao", env("diego.alves"), prazo=ha_dias(4))
    nova_tarefa(c, "Criar posts educativos sobre IR", "social", "revisao_interna", env("carla.rocha"), prazo=ha_dias(2))
    nova_tarefa(c, "Revisar atendimento via WhatsApp Business", "atendimento", "nova", env("elisa.cardoso"),
                prazo=daqui_a(9))

    # --- VERMELHO: Pet Amigo Petshop — 3 atrasadas + foco pesado ------------
    c = clientes_por_nome["Pet Amigo Petshop"]
    pa1 = nova_tarefa(c, "Criar posts - promoção banho e tosa", "social", "producao", env("gabriela.duarte"),
                       prazo=ha_dias(9))
    nova_tarefa(c, "Configurar campanha Meta Ads - adestramento", "trafego", "planejamento", env("ana.souza"),
                prazo=ha_dias(5))
    nova_tarefa(c, "Gravar vídeo - novo espaço da loja", "social", "ajustes", env("gabriela.duarte"), prazo=ha_dias(2))
    nova_tarefa(c, "Responder comentários e mensagens da semana", "atendimento", "nova", env("elisa.cardoso"),
                prazo=daqui_a(4))
    await db.flush()
    for k in range(6):
        inicio = dt(ha_dias(1 + k * 2), hora=9 + k)
        fim = inicio + timedelta(minutes=150)
        novo_foco(
            envoxer_id=env("ana.souza").id, tarefa_id=pa1.id, inicio=inicio, fim=fim, duracao_min=150,
            custo_hora_snapshot=env("ana.souza").custo_hora, custo=round(150 / 60 * float(env("ana.souza").custo_hora), 2),
        )

    # --- VERMELHO: Fit Total Academia — 3 atrasadas + foco pesado -----------
    c = clientes_por_nome["Fit Total Academia"]
    ft1 = nova_tarefa(c, "Criar posts - desafio de verão", "social", "producao", env("gabriela.duarte"), prazo=ha_dias(7))
    nova_tarefa(c, "Gravar vídeo - treino funcional", "video", "planejamento", env("fabio.pinto"), prazo=ha_dias(11))
    nova_tarefa(c, "Configurar campanha Meta Ads - matrícula com desconto", "trafego", "ajustes", env("ana.souza"),
                prazo=ha_dias(1))
    nova_tarefa(c, "Planejar calendário de conteúdo do próximo mês", "social", "nova", env("gabriela.duarte"),
                prazo=daqui_a(18))
    await db.flush()
    for k in range(6):
        inicio = dt(ha_dias(2 + k * 2), hora=10 + k)
        fim = inicio + timedelta(minutes=150)
        novo_foco(
            envoxer_id=env("ana.souza").id, tarefa_id=ft1.id, inicio=inicio, fim=fim, duracao_min=150,
            custo_hora_snapshot=env("ana.souza").custo_hora, custo=round(150 / 60 * float(env("ana.souza").custo_hora), 2),
        )

    await db.flush()

    # --- Foco leve nos 6 clientes verde/amarelo restantes (1 sessão cada) --
    leves = [
        (clientes_por_nome["Sabor & Cia Restaurante"], tarefas_criadas[0], "diego.alves"),
        (clientes_por_nome["Farmácia Vida Plena"], tarefas_criadas[3], "carla.rocha"),
        (clientes_por_nome["Studio Bella Estética"], tarefas_criadas[6], "diego.alves"),
        (clientes_por_nome["Doce Ponto Confeitaria"], o1, "carla.rocha"),
        (clientes_por_nome["Odonto Sorriso Clínica"], alt1, "diego.alves"),
        (clientes_por_nome["Vetorial Contabilidade"], tarefas_criadas[16], "elisa.cardoso"),
    ]
    for _cliente, tarefa, login in leves:
        envoxer = env(login)
        inicio = dt(ha_dias(6), hora=14)
        fim = inicio + timedelta(minutes=60)
        novo_foco(
            envoxer_id=envoxer.id, tarefa_id=tarefa.id, inicio=inicio, fim=fim, duracao_min=60,
            custo_hora_snapshot=envoxer.custo_hora, custo=round(60 / 60 * float(envoxer.custo_hora), 2),
        )

    await db.flush()
    return {
        "tarefas": tarefas_criadas,
        "focos": focos_criados,
        "aprovacoes": aprovacoes_criadas,
        "alteracoes": alteracoes_criadas,
    }


# ============================================================
# PULSO DE SATISFAÇÃO (últimos 3 meses, clientes ativos)
# ============================================================
PULSO_POR_CLIENTE = {
    "Sabor & Cia Restaurante": [9, 9, 10],
    "Farmácia Vida Plena": [8, 9, 9],
    "Studio Bella Estética": [9, 8, 9],
    "Doce Ponto Confeitaria": [7, 6, 7],
    "Odonto Sorriso Clínica": [6, 7, 6],
    "Vetorial Contabilidade": [7, 7, 6],
    "Pet Amigo Petshop": [4, 3, 4],
    "Fit Total Academia": [5, 4, 3],
}


async def criar_pulsos(db, clientes_por_nome):
    meses = [HOJE - timedelta(days=60), HOJE - timedelta(days=30), HOJE]
    total = 0
    for nome, notas in PULSO_POR_CLIENTE.items():
        cliente = clientes_por_nome[nome]
        for mes_ref, nota in zip(meses, notas):
            db.add(PulsoSatisfacao(
                cliente_id=cliente.id, ano_mes=ano_mes(mes_ref), nota=nota,
                metodo="ligacao", respondente_cliente_nome="Contato do cliente",
            ))
            total += 1
    await db.flush()
    return total


# ============================================================
# CHECK-INS (8) — sem check-in nos 2 clientes vermelho (reforça o silêncio)
# ============================================================
async def criar_checkins(db, clientes_por_nome, envoxers_por_login):
    def env(login):
        return envoxers_por_login[login]

    checkins = [
        ("Sabor & Cia Restaurante", ha_dias(5), "ligacao", "positivo", daqui_a(25), "carla.rocha"),
        ("Farmácia Vida Plena", ha_dias(10), "reuniao", "positivo", ha_dias(2), "elisa.cardoso"),  # vencido: proximo_sugerido no passado
        ("Farmácia Vida Plena", ha_dias(32), "ligacao", "neutro", None, "elisa.cardoso"),
        ("Studio Bella Estética", ha_dias(8), "mensagem", "positivo", ha_dias(-1), "carla.rocha"),  # vencido
        ("Studio Bella Estética", ha_dias(29), "ligacao", "neutro", None, "carla.rocha"),
        ("Doce Ponto Confeitaria", ha_dias(6), "ligacao", "neutro", daqui_a(20), "diego.alves"),
        ("Odonto Sorriso Clínica", ha_dias(12), "reuniao", "neutro", None, "elisa.cardoso"),
        ("Vetorial Contabilidade", ha_dias(9), "email", "neutro", daqui_a(15), "diego.alves"),
    ]
    for nome, data_realizado, tipo, humor, proximo_sugerido, login in checkins:
        cliente = clientes_por_nome[nome]
        db.add(CheckIn(
            cliente_id=cliente.id, data_realizado=dt(data_realizado, hora=15), tipo=tipo, motivo="rotina",
            responsavel_envoxer_id=env(login).id, humor=humor,
            observacao="Contato de rotina registrado via seed de testes.",
            proximo_sugerido=proximo_sugerido, proximo_realizado=False,
        ))
    await db.flush()
    return len(checkins)


# ============================================================
# CHURN (2 clientes cancelados)
# ============================================================
def _meses_de_casa(inicio, fim):
    if inicio is None:
        return 0
    return max(0, (fim.year - inicio.year) * 12 + (fim.month - inicio.month))


async def cancelar_clientes(db, clientes_por_nome):
    for c in CLIENTES_SEED:
        if c["cenario"] not in ("cancelado_curto", "cancelado_longo"):
            continue
        cliente = clientes_por_nome[c["nome"]]
        cliente.ativo = False
        cliente.data_cancelamento = c["data_cancelamento"]
        meses = _meses_de_casa(cliente.data_inicio_contrato, c["data_cancelamento"])
        db.add(ChurnSnapshot(
            cliente_id=cliente.id,
            data_cancelamento=c["data_cancelamento"],
            meses_de_casa=meses,
            motivo_codigo=c["motivo_codigo"],
            motivo_detalhe=f"{SEED_TAG} — motivo fictício gerado pelo seed de testes.",
            cliente_nome_snap=cliente.nome,
            segmento_snap=cliente.segmento,
            ticket_snap=cliente.ticket,
            canal_aquisicao_snap=cliente.canal_aquisicao,
            maturidade_snap=cliente.maturidade_digital,
            perfil_snap=None,
            valor_contrato_snap=cliente.valor_contrato,
            tipo_receita_snap=cliente.tipo_receita,
            margem_media_snap=None,
            pulso_medio_snap=None,
            farol_ultimo_snap=c["farol_congelado"],
            observacoes=f"{SEED_TAG}",
        ))
    await db.flush()


# ============================================================
# FAROL — recalcula e persiste (mesma lógica de GET /farol) só p/ os
# clientes fake ativos (não mexe em cliente real nenhum).
# ============================================================
async def recalcular_farol(db, clientes_ativos):
    resultado = {}
    for cliente in clientes_ativos:
        calculo = await calcular_farol_cliente(db, cliente, HOJE)

        existente = await db.execute(select(FarolCalculo).where(FarolCalculo.cliente_id == cliente.id))
        snapshot = existente.scalar_one_or_none()
        farol_anterior = snapshot.farol if snapshot else cliente.status_farol

        sinais = calculo["sinais"]
        if snapshot is None:
            snapshot = FarolCalculo(cliente_id=cliente.id)
            db.add(snapshot)

        snapshot.farol = calculo["farol"]
        snapshot.health_score = calculo["health_score"]
        snapshot.sinal_entrega, snapshot.sinal_entrega_valor = sinais["entrega"]
        snapshot.sinal_atrasadas, snapshot.sinal_atrasadas_valor = sinais["atrasadas"]
        snapshot.sinal_alteracoes, snapshot.sinal_alteracoes_valor = sinais["alteracoes"]
        snapshot.sinal_aprovacoes, snapshot.sinal_aprovacoes_valor = sinais["aprovacoes"]
        snapshot.sinal_pulso, snapshot.sinal_pulso_valor = sinais["pulso"]
        snapshot.sinal_margem, snapshot.sinal_margem_valor = sinais["margem"]
        snapshot.sinal_silencio, snapshot.sinal_silencio_valor = sinais["silencio"]
        snapshot.sinal_whatsapp, snapshot.sinal_whatsapp_valor = sinais["whatsapp"]
        snapshot.motivo_json = calculo["motivo_json"]

        db.add(FarolCalculoHistorico(
            cliente_id=cliente.id, farol=calculo["farol"], health_score=calculo["health_score"],
            motivo_json=calculo["motivo_json"],
        ))

        if calculo["farol"] != farol_anterior:
            db.add(AlertaFarol(
                cliente_id=cliente.id, farol_de=farol_anterior, farol_para=calculo["farol"],
                motivo_json=calculo["motivo_json"], motivo_texto=calculo["motivo_texto"],
                sugestao_acao=calculo["sugestao_acao"],
            ))

        cliente.status_farol = calculo["farol"]
        resultado[cliente.nome] = calculo["farol"]

    await db.flush()
    return resultado


async def main():
    async with AsyncSessionLocal() as db:
        existente = await db.execute(select(Cliente).where(Cliente.nome.like(f"{SEED_PREFIX}%")))
        if existente.scalars().first() is not None:
            print(f"Já existe dado fake no banco (nome começando com '{SEED_PREFIX}').")
            print("Rode scripts/limpar_seed.py antes de gerar de novo.")
            return

        servicos_result = await db.execute(select(Servico))
        servico_ids = {s.slug: s.id for s in servicos_result.scalars().all()}
        faltando = {"social", "trafego", "design", "video", "sdr", "site", "atendimento"} - set(servico_ids)
        if faltando:
            print(f"Serviços padrão ausentes no banco: {faltando}. Suba o backend pelo menos uma vez antes (seed inicial).")
            return

        motivos_usados = {"sem_retorno", "trocou_agencia"}
        motivos_result = await db.execute(
            select(MotivoChurnCatalogo.codigo).where(MotivoChurnCatalogo.codigo.in_(motivos_usados))
        )
        motivos_faltando = motivos_usados - set(motivos_result.scalars().all())
        if motivos_faltando:
            print(f"Códigos de motivo de churn ausentes no banco: {motivos_faltando}. Suba o backend pelo menos uma vez antes (seed inicial).")
            return

        envoxers = await criar_envoxers(db)
        envoxers_por_login = {login: e for (_, login, *_r), e in zip(ENVOXERS_SEED, envoxers)}

        clientes = await criar_clientes(db, envoxers, servico_ids)
        clientes_por_nome = {c["nome"]: cliente for c, cliente in zip(CLIENTES_SEED, clientes)}

        criado = await criar_tarefas_e_foco(db, clientes_por_nome, envoxers_por_login, servico_ids)
        total_pulsos = await criar_pulsos(db, clientes_por_nome)
        total_checkins = await criar_checkins(db, clientes_por_nome, envoxers_por_login)
        await cancelar_clientes(db, clientes_por_nome)

        clientes_ativos = [
            clientes_por_nome[c["nome"]] for c in CLIENTES_SEED
            if c["cenario"] not in ("cancelado_curto", "cancelado_longo")
        ]
        farois = await recalcular_farol(db, clientes_ativos)

        await db.commit()

        print("=== Seed concluído ===")
        print(f"Envoxers criados: {len(envoxers)} (senha de todos: {SEED_SENHA_PADRAO})")
        print(f"Clientes criados: {len(clientes)}")
        print(f"Tarefas criadas: {len(criado['tarefas'])}")
        print(f"Registros de Foco criados: {len(criado['focos'])}")
        print(f"Aprovações criadas: {len(criado['aprovacoes'])}")
        print(f"Alterações criadas: {len(criado['alteracoes'])}")
        print(f"Pulsos de satisfação criados: {total_pulsos}")
        print(f"Check-ins criados: {total_checkins}")
        print(f"Clientes cancelados (churn): 2")
        print("\nFarol calculado para os clientes ativos:")
        for nome, farol in farois.items():
            print(f"  - {nome}: {farol}")


if __name__ == "__main__":
    asyncio.run(main())
