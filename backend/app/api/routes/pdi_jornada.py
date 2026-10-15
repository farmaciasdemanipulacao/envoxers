"""Jornada de PDI guiada: diagnóstico inicial, plano de ações, prática semanal,
marcos formais e evolução comparável ao longo do ciclo.

Os indicadores representam participação e auto-observação. Não são nota de
performance nem ranking entre pessoas.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.pdi_acao import PdiAcao
from app.models.pdi_acao_comentario import PdiAcaoComentario
from app.models.feedback_1a1 import Feedback1a1
from app.models.pdi_jornada import PdiJornada, PdiRegistro, PdiDiagnostico

router = APIRouter(prefix="/pdi/jornadas", tags=["pdi-jornada"])
TZ = ZoneInfo("America/Sao_Paulo")

PDI_DIMENSOES = [
    {"chave": "autonomia", "label": "Autonomia e iniciativa", "descricao": "Age sem esperar instrução para tudo e leva alternativas, não apenas problemas."},
    {"chave": "organizacao", "label": "Organização e priorização", "descricao": "Consegue distinguir o que é urgente, importante e o que pode esperar."},
    {"chave": "comunicacao", "label": "Comunicação", "descricao": "Comunica contexto, decisão, risco e próximo passo com clareza."},
    {"chave": "qualidade", "label": "Qualidade e atenção", "descricao": "Entrega com revisão, critério e menos retrabalho evitável."},
    {"chave": "prazos", "label": "Compromisso com prazos", "descricao": "Antecipa riscos, sinaliza desvios e mantém previsibilidade."},
    {"chave": "colaboracao", "label": "Colaboração", "descricao": "Ajuda o fluxo coletivo, dá contexto e recebe feedback de forma produtiva."},
    {"chave": "resolucao", "label": "Resolução de problemas", "descricao": "Transforma problemas em hipóteses, opções e decisão prática."},
    {"chave": "adaptacao", "label": "Aprendizado e adaptação", "descricao": "Aprende com situações reais e ajusta comportamento e processo."},
]
DIM_KEYS = {d["chave"] for d in PDI_DIMENSOES}
MOMENTO_DIA = {"inicial": 0, "30": 30, "60": 60, "90": 90}
MOMENTO_LABEL = {"inicial": "Ponto de partida", "30": "30 dias", "60": "60 dias", "90": "90 dias"}


class CriarJornada(BaseModel):
    model_config = ConfigDict(extra="forbid")
    envoxer_id: int
    gestor_id: int
    nome: str = Field(min_length=4, max_length=160)
    inicio: date
    fim: date
    lembrete_dia: int = Field(ge=0, le=6, default=4)


class AtualizarJornadaAdmin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str | None = Field(default=None, min_length=4, max_length=160)
    gestor_id: int | None = None
    inicio: date | None = None
    fim: date | None = None
    lembrete_ativo: bool | None = None
    lembrete_dia: int | None = Field(default=None, ge=0, le=6)


class ConfigJornada(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lembrete_ativo: bool
    lembrete_dia: int = Field(ge=0, le=6)


class NovoRegistro(BaseModel):
    model_config = ConfigDict(extra="forbid")
    acao_id: int | None = None
    situacao: str = Field(min_length=5, max_length=3000)
    impacto: str = Field(min_length=5, max_length=3000)
    proposta: str = Field(min_length=5, max_length=3000)
    resultado: str = Field(min_length=5, max_length=3000)


class ValidacaoRegistro(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["validada", "ajustar"]
    feedback: str = Field(min_length=5, max_length=3000)


class NovoMarco(BaseModel):
    model_config = ConfigDict(extra="forbid")
    marco_dia: Literal[30, 60, 90]
    situacao: str = Field(min_length=5, max_length=3000)
    impacto: str = Field(min_length=5, max_length=3000)
    proposta: str = Field(min_length=5, max_length=3000)
    resultado: str = Field(min_length=5, max_length=3000)
    avaliacao: int = Field(ge=1, le=5)


class DiagnosticoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    momento: Literal["inicial", "30", "60", "90"]
    notas: dict[str, int]
    forca_atual: str = Field(min_length=5, max_length=2000)
    desafio_atual: str = Field(min_length=5, max_length=2000)
    objetivo_proximo: str = Field(min_length=5, max_length=2000)
    reflexao: str | None = Field(default=None, max_length=3000)
    conquistas: str | None = Field(default=None, max_length=3000)


class AcaoJornadaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    titulo: str = Field(min_length=4, max_length=200)
    descricao: str = Field(min_length=8, max_length=3000)
    categoria: str | None = Field(default=None, max_length=80)
    prazo: date | None = None
    como_fazer: str = Field(min_length=8, max_length=3000)
    criterio_sucesso: str = Field(min_length=8, max_length=3000)
    evidencia_esperada: str = Field(min_length=8, max_length=3000)


class AcaoJornadaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    titulo: str | None = Field(default=None, min_length=4, max_length=200)
    descricao: str | None = Field(default=None, min_length=8, max_length=3000)
    categoria: str | None = Field(default=None, max_length=80)
    prazo: date | None = None
    como_fazer: str | None = Field(default=None, min_length=8, max_length=3000)
    criterio_sucesso: str | None = Field(default=None, min_length=8, max_length=3000)
    evidencia_esperada: str | None = Field(default=None, min_length=8, max_length=3000)
    status: Literal["planejada", "em_andamento", "concluida", "cancelada"] | None = None


def _gestor(usuario: Envoxer) -> bool:
    return usuario.permissao in ("gestor", "admin")


def _admin(usuario: Envoxer) -> bool:
    # Liberação ao Gestor fica concentrada aqui quando a operação estiver pronta.
    return usuario.permissao == "admin"


def _permitido(jornada: PdiJornada, usuario: Envoxer) -> bool:
    return usuario.id == jornada.envoxer_id or usuario.id == jornada.gestor_id or usuario.permissao == "admin"


def _pode_validar(jornada: PdiJornada, usuario: Envoxer) -> bool:
    return usuario.id != jornada.envoxer_id and (
        _gestor(usuario) and (usuario.id == jornada.gestor_id or usuario.permissao == "admin")
    )


async def _buscar(db: AsyncSession, id: int, usuario: Envoxer) -> PdiJornada:
    j = (await db.execute(select(PdiJornada).where(PdiJornada.id == id))).scalar_one_or_none()
    if not j:
        raise HTTPException(404, "Jornada não encontrada")
    if not _permitido(j, usuario):
        raise HTTPException(403, "Acesso não permitido")
    return j


def _serializar_registro(r: PdiRegistro, nomes: dict[int, str]):
    return {
        "id": r.id,
        "tipo": r.tipo,
        "acao_id": r.acao_id,
        "marco_dia": r.marco_dia,
        "situacao": r.situacao,
        "impacto": r.impacto,
        "proposta": r.proposta,
        "resultado": r.resultado,
        "avaliacao": r.avaliacao,
        "status_validacao": r.status_validacao,
        "feedback_gestor": r.feedback_gestor,
        "autor_nome": nomes.get(r.autor_id, "—"),
        "validado_por_nome": nomes.get(r.validado_por_id),
        "criado_em": r.criado_em.isoformat() if r.criado_em else None,
        "validado_em": r.validado_em.isoformat() if r.validado_em else None,
    }


def _serializar_diagnostico(d: PdiDiagnostico, nomes: dict[int, str]):
    respostas = d.respostas or {}
    notas = respostas.get("notas") or {}
    valores = [int(notas[k]) for k in DIM_KEYS if k in notas and isinstance(notas[k], int)]
    return {
        "id": d.id,
        "momento": d.momento,
        "momento_label": MOMENTO_LABEL.get(d.momento, d.momento),
        "notas": notas,
        "forca_atual": respostas.get("forca_atual"),
        "desafio_atual": respostas.get("desafio_atual"),
        "objetivo_proximo": respostas.get("objetivo_proximo"),
        "reflexao": d.reflexao,
        "conquistas": d.conquistas,
        "media": round(sum(valores) / len(valores), 2) if valores else None,
        "autor_nome": nomes.get(d.autor_id, "—"),
        "criado_em": d.criado_em.isoformat() if d.criado_em else None,
    }


def _acao_completa(a: PdiAcao) -> bool:
    return all(bool((x or "").strip()) for x in (a.descricao, a.como_fazer, a.criterio_sucesso, a.evidencia_esperada))


def _serializar_acao(
    a: PdiAcao,
    comentarios: list[PdiAcaoComentario],
    nomes: dict[int, str],
    fotos: dict[int, str | None],
):
    return {
        "id": a.id,
        "jornada_id": a.jornada_id,
        "titulo": a.titulo,
        "descricao": a.descricao,
        "como_fazer": a.como_fazer,
        "criterio_sucesso": a.criterio_sucesso,
        "evidencia_esperada": a.evidencia_esperada,
        "categoria": a.categoria,
        "status": a.status,
        "prazo": a.prazo.isoformat() if a.prazo else None,
        "origem_tipo": a.origem_tipo,
        "origem_id": a.origem_id,
        "criado_por_nome": nomes.get(a.criado_por_id),
        "concluida_em": a.concluida_em.isoformat() if a.concluida_em else None,
        "configuracao_completa": _acao_completa(a),
        "comentarios": [
            {
                "id": c.id,
                "autor_id": c.autor_id,
                "autor_nome": nomes.get(c.autor_id, "—"),
                "autor_foto": fotos.get(c.autor_id),
                "texto": c.texto,
                "criado_em": c.criado_em.isoformat() if c.criado_em else None,
            }
            for c in sorted(comentarios, key=lambda x: x.criado_em)
        ],
    }


def _etapas_jornada(
    inicial_ok: bool,
    tem_acoes: bool,
    acoes_ok: bool,
    j: PdiJornada,
    passados: int,
    marcos_concluidos: set[int],
    diag_momentos: set[str],
):
    pratica_status = "bloqueada"
    if inicial_ok and tem_acoes:
        pratica_status = "em_andamento" if j.status == "ativa" else "concluida"
    marcos_status = "bloqueada" if not (inicial_ok and tem_acoes) else (
        "concluida" if {30, 60, 90}.issubset(marcos_concluidos) else "em_andamento"
    )
    fechamento_status = "concluida" if "90" in diag_momentos else ("em_andamento" if passados >= 90 else "pendente")
    return [
        {
            "numero": 1,
            "chave": "diagnostico",
            "titulo": "Diagnóstico inicial",
            "status": "concluida" if inicial_ok else "em_andamento",
            "responsavel": "Pessoa em desenvolvimento",
            "o_que_fazer": "Responder o questionário de ponto de partida antes de iniciar os check-ins.",
            "como_fazer": "Avalie sua percepção de 1 a 5 nas oito dimensões e descreva uma força, um desafio real e o que deseja fazer diferente ao fim do ciclo.",
            "conclui_quando": "O diagnóstico inicial estiver salvo.",
        },
        {
            "numero": 2,
            "chave": "plano",
            "titulo": "Plano de ações",
            "status": "concluida" if acoes_ok else ("em_andamento" if inicial_ok else "bloqueada"),
            "responsavel": "Admin, com contexto da liderança",
            "o_que_fazer": "Cadastrar ações específicas que transformem os objetivos do PDI em comportamento observável.",
            "como_fazer": "Cada ação precisa explicar o que fazer, como executar, qual evidência registrar e qual critério mostra que a ação avançou.",
            "conclui_quando": "Existir ao menos uma ação ativa e detalhada na jornada.",
        },
        {
            "numero": 3,
            "chave": "pratica",
            "titulo": "Prática e evidências semanais",
            "status": pratica_status,
            "responsavel": "Pessoa em desenvolvimento",
            "o_que_fazer": "Aplicar as ações na rotina e registrar uma situação real por semana.",
            "como_fazer": "Escolha uma ação, descreva situação → impacto → decisão/ação → resultado ou aprendizado. Evidência não é intenção; precisa ter acontecido.",
            "conclui_quando": "O ciclo terminar com uma trilha consistente de evidências e feedbacks.",
        },
        {
            "numero": 4,
            "chave": "marcos",
            "titulo": "Conversas e marcos",
            "status": marcos_status,
            "responsavel": "Pessoa + liderança",
            "o_que_fazer": "Fazer 1:1 quinzenal e revisões formais de 30, 60 e 90 dias.",
            "como_fazer": "Use as evidências da linha do tempo para conversar sobre evolução, obstáculos, apoio necessário e próximos combinados.",
            "conclui_quando": "Os marcos do ciclo estiverem registrados.",
        },
        {
            "numero": 5,
            "chave": "fechamento",
            "titulo": "Fechamento e comparação",
            "status": fechamento_status,
            "responsavel": "Pessoa em desenvolvimento + liderança",
            "o_que_fazer": "Responder novamente o mapa de evolução e comparar o ponto A com o ponto atual.",
            "como_fazer": "Repita as mesmas oito dimensões, registre conquistas concretas e identifique o que ainda precisa virar próximo ciclo.",
            "conclui_quando": "O diagnóstico de 90 dias e o fechamento do ciclo estiverem registrados.",
        },
    ]


async def montar_painel(db: AsyncSession, j: PdiJornada, usuario: Envoxer):
    rows = (
        await db.execute(
            select(PdiRegistro)
            .where(PdiRegistro.jornada_id == j.id)
            .order_by(PdiRegistro.criado_em.desc(), PdiRegistro.id.desc())
        )
    ).scalars().all()
    actions = (
        await db.execute(
            select(PdiAcao)
            .where(PdiAcao.jornada_id == j.id)
            .order_by(PdiAcao.prazo.is_(None), PdiAcao.prazo, PdiAcao.id)
        )
    ).scalars().all()
    historico_actions = (
        await db.execute(
            select(PdiAcao)
            .where(PdiAcao.envoxer_id == j.envoxer_id, PdiAcao.jornada_id.is_(None))
            .order_by(PdiAcao.created_at.desc(), PdiAcao.id.desc())
        )
    ).scalars().all()
    diagnosticos = (
        await db.execute(
            select(PdiDiagnostico)
            .where(PdiDiagnostico.jornada_id == j.id)
            .order_by(PdiDiagnostico.criado_em, PdiDiagnostico.id)
        )
    ).scalars().all()

    action_ids = [a.id for a in [*actions, *historico_actions]]
    comentarios = []
    if action_ids:
        comentarios = (
            await db.execute(
                select(PdiAcaoComentario).where(PdiAcaoComentario.pdi_acao_id.in_(action_ids))
            )
        ).scalars().all()
    comentarios_por_acao: dict[int, list[PdiAcaoComentario]] = {}
    for c in comentarios:
        comentarios_por_acao.setdefault(c.pdi_acao_id, []).append(c)

    pessoa_ids = {j.envoxer_id, j.gestor_id}
    pessoa_ids.update(r.autor_id for r in rows if r.autor_id)
    pessoa_ids.update(r.validado_por_id for r in rows if r.validado_por_id)
    pessoa_ids.update(d.autor_id for d in diagnosticos if d.autor_id)
    pessoa_ids.update(a.criado_por_id for a in [*actions, *historico_actions] if a.criado_por_id)
    pessoa_ids.update(c.autor_id for c in comentarios if c.autor_id)
    members = (
        await db.execute(select(Envoxer.id, Envoxer.nome, Envoxer.foto_url).where(Envoxer.id.in_(list(pessoa_ids))))
    ).all()
    names = {row.id: row.nome for row in members}
    fotos = {row.id: row.foto_url for row in members}

    hoje = datetime.now(TZ).date()
    duracao = max(1, (j.fim - j.inicio).days)
    passados_reais = max(0, (hoje - j.inicio).days)
    passados = min(passados_reais, duracao)
    semana_atual = min(passados_reais // 7 + 1, (duracao + 6) // 7) if hoje >= j.inicio else 0
    semana_atual = max(0, semana_atual)
    total_semanas = (duracao + 6) // 7

    semanas_validadas: set[int] = set()
    semanas_registradas: set[int] = set()
    for r in rows:
        if r.tipo == "evidencia" and r.criado_em:
            w = (r.criado_em.astimezone(TZ).date() - j.inicio).days // 7 + 1
            if 1 <= w <= total_semanas:
                semanas_registradas.add(w)
                if r.status_validacao == "validada":
                    semanas_validadas.add(w)

    marcos = [r for r in rows if r.tipo == "marco"]
    concluidos = {r.marco_dia for r in marcos if r.status_validacao == "validada"}
    pendentes = [r for r in rows if r.tipo == "evidencia" and r.status_validacao == "pendente"]

    diag_momentos = {d.momento for d in diagnosticos}
    inicial = next((d for d in diagnosticos if d.momento == "inicial"), None)
    posteriores = sorted(
        [d for d in diagnosticos if d.momento != "inicial"],
        key=lambda d: MOMENTO_DIA.get(d.momento, 0),
    )
    atual = posteriores[-1] if posteriores else inicial
    inicial_ok = inicial is not None
    acoes_ativas = [a for a in actions if a.status != "cancelada"]
    tem_acoes = bool(acoes_ativas)
    acoes_incompletas = [a for a in acoes_ativas if not _acao_completa(a)]
    acoes_ok = tem_acoes and not acoes_incompletas

    pct_consistencia = round(
        100 * (0.7 * len(semanas_validadas) / total_semanas + 0.3 * len(concluidos) / 3)
    ) if total_semanas else 0
    pontos = 20 * len(semanas_validadas) + 30 * len(concluidos)

    diag_formais = len([m for m in ("30", "60", "90") if m in diag_momentos])
    jornada_pct = round(
        (15 if inicial_ok else 0)
        + (15 if acoes_ok else 0)
        + (40 * len(semanas_validadas) / total_semanas if total_semanas else 0)
        + 15 * len(concluidos) / 3
        + 15 * diag_formais / 3
    )
    jornada_pct = max(0, min(100, jornada_pct))

    badges = []
    if inicial_ok:
        badges.append({"nome": "Ponto A registrado", "icone": "🧭", "texto": "Diagnóstico inicial concluído"})
    if len(semanas_validadas) >= 1:
        badges.append({"nome": "Primeiro passo", "icone": "🌱", "texto": "Primeira semana com evidência validada"})
    if len(semanas_validadas) >= 4:
        badges.append({"nome": "Consistência", "icone": "🔥", "texto": "Quatro semanas diferentes com evidências validadas"})
    if len(semanas_validadas) >= 8:
        badges.append({"nome": "Evolução contínua", "icone": "🚀", "texto": "Oito semanas com evidências validadas"})
    for a in actions:
        if a.status == "concluida":
            badges.append({"nome": "Ação concluída", "icone": "✅", "texto": a.titulo})
    for n in (30, 60, 90):
        if n in concluidos:
            badges.append({"nome": f"Marco {n} dias", "icone": "🏅", "texto": "Revisão registrada pela liderança"})

    evolucao = []
    evolucao_media = None
    if inicial and atual and atual.id != inicial.id:
        n0 = (inicial.respostas or {}).get("notas") or {}
        n1 = (atual.respostas or {}).get("notas") or {}
        deltas = []
        for d in PDI_DIMENSOES:
            a = int(n0.get(d["chave"], 0) or 0)
            b = int(n1.get(d["chave"], 0) or 0)
            delta = b - a if a and b else 0
            evolucao.append({**d, "inicial": a, "atual": b, "delta": delta})
            if a and b:
                deltas.append(delta)
            if delta >= 1:
                badges.append({
                    "nome": f"Evolução percebida · {d['label']}",
                    "icone": "↗",
                    "texto": f"Autoavaliação avançou de {a} para {b} entre o ponto inicial e {MOMENTO_LABEL.get(atual.momento, atual.momento)}.",
                })
        evolucao_media = round(sum(deltas) / len(deltas), 2) if deltas else None

    ultima_1a1 = (
        await db.execute(
            select(Feedback1a1.data)
            .where(
                Feedback1a1.gestor_id == j.gestor_id,
                Feedback1a1.liderado_id == j.envoxer_id,
                Feedback1a1.data >= j.inicio,
            )
            .order_by(Feedback1a1.data.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    proximo_1a1 = (ultima_1a1 or j.inicio) + timedelta(days=14)

    alertas = []
    if j.status == "ativa" and hoje >= j.inicio and passados_reais <= duracao + 30:
        if not inicial_ok:
            alertas.append({
                "tipo": "diagnostico",
                "nivel": "atencao",
                "texto": "Diagnóstico inicial pendente. Ele registra o ponto de partida antes das evidências semanais.",
            })
        if inicial_ok and not tem_acoes:
            alertas.append({
                "tipo": "plano",
                "nivel": "atencao",
                "texto": "Plano de ações vazio. O Admin precisa cadastrar ao menos uma ação para o ciclo.",
            })
        elif inicial_ok and acoes_incompletas and _admin(usuario):
            alertas.append({
                "tipo": "plano",
                "nivel": "atencao",
                "texto": f"{len(acoes_incompletas)} ação(ões) ainda precisam de instrução, evidência esperada e critério de sucesso.",
            })
        if inicial_ok and tem_acoes and semana_atual and semana_atual not in semanas_registradas:
            alertas.append({
                "tipo": "checkin",
                "nivel": "atencao" if hoje.weekday() >= j.lembrete_dia else "info",
                "texto": f"Semana {semana_atual}: escolha uma ação e registre uma situação real, decisão e resultado.",
            })
        if pendentes and _pode_validar(j, usuario):
            alertas.append({
                "tipo": "validacao",
                "nivel": "atencao",
                "texto": f"{len(pendentes)} evidência(s) aguardando validação e feedback.",
            })
        if hoje >= proximo_1a1 and _pode_validar(j, usuario):
            alertas.append({
                "tipo": "quinzenal",
                "nivel": "atencao",
                "texto": "Conversa 1:1 quinzenal pendente. Use as evidências para registrar evolução e próximos combinados.",
            })
        for marco in (30, 60, 90):
            if passados_reais >= marco and marco not in concluidos:
                alertas.append({"tipo": "marco", "nivel": "atencao", "texto": f"Revisão formal de {marco} dias está pendente."})
            momento = str(marco)
            if passados_reais >= marco and momento not in diag_momentos:
                alertas.append({
                    "tipo": "diagnostico",
                    "nivel": "atencao",
                    "texto": f"Mapa de evolução de {marco} dias pendente. Responda novamente para comparar com o ponto inicial.",
                })

    proximas = []
    for m in (30, 60, 90):
        proximas.append({
            "dia": m,
            "data": (j.inicio + timedelta(days=m)).isoformat(),
            "concluido": m in concluidos,
            "diagnostico_concluido": str(m) in diag_momentos,
            "pendente": passados_reais >= m and m not in concluidos,
        })

    diagnosticos_disponiveis = []
    if not inicial_ok:
        diagnosticos_disponiveis.append("inicial")
    elif j.status == "ativa":
        for m in (30, 60, 90):
            if passados_reais >= m and str(m) not in diag_momentos:
                diagnosticos_disponiveis.append(str(m))

    proximo_passo = None
    if not inicial_ok:
        if usuario.id == j.envoxer_id:
            proximo_passo = {
                "tipo": "diagnostico",
                "titulo": "Registre seu ponto de partida",
                "texto": "Antes de começar os check-ins, responda o diagnóstico inicial. Ele será a referência para visualizar sua evolução.",
                "acao": "Responder diagnóstico inicial",
            }
        else:
            proximo_passo = {
                "tipo": "aguardar",
                "titulo": f"Aguardando {names.get(j.envoxer_id, 'a pessoa')} responder o diagnóstico",
                "texto": "O ponto de partida precisa ser registrado pela própria pessoa.",
                "acao": None,
            }
    elif not tem_acoes:
        if _admin(usuario):
            proximo_passo = {
                "tipo": "acao_admin",
                "titulo": "Transforme o diagnóstico em ações concretas",
                "texto": "Cadastre a primeira ação com instrução, evidência esperada e critério de sucesso.",
                "acao": "Cadastrar ação",
            }
        else:
            proximo_passo = {
                "tipo": "aguardar",
                "titulo": "Seu plano de ações está sendo preparado",
                "texto": "O Admin precisa transformar os objetivos do ciclo em ações claras antes dos check-ins semanais.",
                "acao": None,
            }
    elif acoes_incompletas and _admin(usuario):
        proximo_passo = {
            "tipo": "acao_admin",
            "titulo": "Complete a orientação das ações importadas",
            "texto": f"{len(acoes_incompletas)} ação(ões) vieram do PDI anterior sem instrução completa. Abra e detalhe como fazer, evidência e critério de sucesso.",
            "acao": "Revisar ações",
        }
    elif diagnosticos_disponiveis and usuario.id == j.envoxer_id:
        momento = diagnosticos_disponiveis[0]
        proximo_passo = {
            "tipo": "diagnostico",
            "momento": momento,
            "titulo": f"Atualize seu mapa de evolução · {MOMENTO_LABEL[momento]}",
            "texto": "Repita as mesmas dimensões e registre conquistas concretas para comparar com o início.",
            "acao": "Atualizar mapa",
        }
    elif pendentes and _pode_validar(j, usuario):
        proximo_passo = {
            "tipo": "validacao",
            "titulo": "Há evidências aguardando feedback",
            "texto": "Revise o caso real, valide o aprendizado ou solicite complemento.",
            "acao": "Revisar evidência",
        }
    elif usuario.id == j.envoxer_id:
        proximo_passo = {
            "tipo": "evidencia",
            "titulo": f"Semana {semana_atual or 1}: aplique uma ação na rotina",
            "texto": "Escolha uma ação do plano, pratique em uma situação real e registre o que aconteceu.",
            "acao": "Registrar evidência",
        }
    else:
        proximo_passo = {
            "tipo": "acompanhar",
            "titulo": "Acompanhe evidências e mantenha o ritual de feedback",
            "texto": "Use os registros reais para orientar 1:1, marcos e próximos combinados.",
            "acao": None,
        }

    return {
        "id": j.id,
        "nome": j.nome,
        "envoxer_id": j.envoxer_id,
        "envoxer_nome": names.get(j.envoxer_id),
        "gestor_id": j.gestor_id,
        "gestor_nome": names.get(j.gestor_id),
        "inicio": j.inicio.isoformat(),
        "fim": j.fim.isoformat(),
        "status": j.status,
        "lembrete_ativo": j.lembrete_ativo,
        "lembrete_dia": j.lembrete_dia,
        "dias_passados": passados,
        "dias_total": duracao,
        "semana_atual": semana_atual,
        "semanas_total": total_semanas,
        "semanas_registradas": sorted(semanas_registradas),
        "semanas_validadas": sorted(semanas_validadas),
        "progresso_pct": pct_consistencia,
        "jornada_pct": jornada_pct,
        "pontos_participacao": pontos,
        "badges": badges,
        "alertas": alertas,
        "marcos": proximas,
        "proximo_1a1": proximo_1a1.isoformat(),
        "pendentes_validacao": len(pendentes),
        "pode_validar": _pode_validar(j, usuario),
        "pode_registrar": usuario.id == j.envoxer_id and inicial_ok and tem_acoes,
        "pode_responder_diagnostico": usuario.id == j.envoxer_id,
        "pode_administrar": _admin(usuario),
        "diagnostico_inicial_concluido": inicial_ok,
        "diagnosticos_disponiveis": diagnosticos_disponiveis,
        "dimensoes": PDI_DIMENSOES,
        "diagnosticos": [_serializar_diagnostico(d, names) for d in diagnosticos],
        "evolucao": evolucao,
        "evolucao_media": evolucao_media,
        "tem_comparacao": bool(evolucao),
        "etapas": _etapas_jornada(inicial_ok, tem_acoes, acoes_ok, j, passados_reais, concluidos, diag_momentos),
        "proximo_passo": proximo_passo,
        "acoes_incompletas": len(acoes_incompletas),
        "acoes": [_serializar_acao(a, comentarios_por_acao.get(a.id, []), names, fotos) for a in actions],
        "historico_acoes": [_serializar_acao(a, comentarios_por_acao.get(a.id, []), names, fotos) for a in historico_actions],
        "registros": [_serializar_registro(r, names) for r in rows],
        "criterio": "O progresso combina diagnóstico, plano de ações, evidências validadas e marcos formais. As notas do mapa são auto-observação e servem para comparação individual, nunca para ranking.",
    }


@router.get("")
async def minhas_jornadas(
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
    envoxer_id: int | None = Query(default=None),
):
    alvo = envoxer_id or usuario.id
    if alvo != usuario.id and not _gestor(usuario):
        raise HTTPException(403, "Sem permissão")
    js = (
        await db.execute(
            select(PdiJornada).where(PdiJornada.envoxer_id == alvo).order_by(PdiJornada.inicio.desc())
        )
    ).scalars().all()
    js = [j for j in js if _permitido(j, usuario)]
    return [await montar_painel(db, j, usuario) for j in js]


@router.get("/equipe")
async def quadro_equipe(
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _gestor(usuario):
        raise HTTPException(403, "Apenas liderança")
    consulta = select(PdiJornada).where(PdiJornada.status == "ativa")
    if usuario.permissao != "admin":
        consulta = consulta.where(PdiJornada.gestor_id == usuario.id)
    jornadas = (await db.execute(consulta.order_by(PdiJornada.inicio.desc()))).scalars().all()
    return [await montar_painel(db, j, usuario) for j in jornadas]


@router.post("", status_code=201)
async def criar_jornada(
    data: CriarJornada,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _admin(usuario):
        raise HTTPException(403, "Neste momento, somente o Admin pode criar jornadas")
    if data.fim <= data.inicio or (data.fim - data.inicio).days > 365:
        raise HTTPException(400, "Período inválido")
    users = (
        await db.execute(
            select(Envoxer).where(
                Envoxer.id.in_([data.envoxer_id, data.gestor_id]),
                Envoxer.ativo.is_(True),
            )
        )
    ).scalars().all()
    if len({u.id for u in users}) != len({data.envoxer_id, data.gestor_id}):
        raise HTTPException(400, "Pessoas inexistentes/inativas")
    exists = (
        await db.execute(
            select(PdiJornada).where(
                PdiJornada.envoxer_id == data.envoxer_id,
                PdiJornada.status == "ativa",
            )
        )
    ).first()
    if exists:
        raise HTTPException(409, "Já existe jornada ativa para esta pessoa")
    j = PdiJornada(**data.model_dump(), status="ativa")
    db.add(j)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.patch("/{jornada_id}/admin")
async def atualizar_jornada_admin(
    jornada_id: int,
    data: AtualizarJornadaAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _admin(usuario):
        raise HTTPException(403, "Neste momento, somente o Admin pode editar a jornada")
    j = await _buscar(db, jornada_id, usuario)
    updates = data.model_dump(exclude_unset=True)
    novo_inicio = updates.get("inicio", j.inicio)
    novo_fim = updates.get("fim", j.fim)
    if novo_fim <= novo_inicio or (novo_fim - novo_inicio).days > 365:
        raise HTTPException(400, "Período inválido")
    if "gestor_id" in updates:
        gestor = (
            await db.execute(
                select(Envoxer).where(Envoxer.id == updates["gestor_id"], Envoxer.ativo.is_(True))
            )
        ).scalar_one_or_none()
        if not gestor:
            raise HTTPException(404, "Gestor não encontrado")
    for k, v in updates.items():
        setattr(j, k, v)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.patch("/{jornada_id}/config")
async def config_jornada(
    jornada_id: int,
    data: ConfigJornada,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _admin(usuario):
        raise HTTPException(403, "Neste momento, somente o Admin pode configurar a jornada")
    j = await _buscar(db, jornada_id, usuario)
    j.lembrete_ativo = data.lembrete_ativo
    j.lembrete_dia = data.lembrete_dia
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.post("/{jornada_id}/acoes", status_code=201)
async def criar_acao_jornada(
    jornada_id: int,
    data: AcaoJornadaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _admin(usuario):
        raise HTTPException(403, "Neste momento, somente o Admin pode cadastrar ações")
    j = await _buscar(db, jornada_id, usuario)
    a = PdiAcao(
        envoxer_id=j.envoxer_id,
        jornada_id=j.id,
        titulo=data.titulo.strip(),
        descricao=data.descricao.strip(),
        categoria=(data.categoria or "").strip() or None,
        prazo=data.prazo,
        como_fazer=data.como_fazer.strip(),
        criterio_sucesso=data.criterio_sucesso.strip(),
        evidencia_esperada=data.evidencia_esperada.strip(),
        origem_tipo="manual",
        criado_por_id=usuario.id,
    )
    db.add(a)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.patch("/{jornada_id}/acoes/{acao_id}")
async def atualizar_acao_jornada(
    jornada_id: int,
    acao_id: int,
    data: AcaoJornadaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if not _admin(usuario):
        raise HTTPException(403, "Neste momento, somente o Admin pode editar ações")
    j = await _buscar(db, jornada_id, usuario)
    acao = (
        await db.execute(
            select(PdiAcao).where(PdiAcao.id == acao_id, PdiAcao.jornada_id == j.id)
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(404, "Ação não encontrada nesta jornada")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(acao, field, value)
    if updates.get("status") == "concluida" and acao.concluida_em is None:
        acao.concluida_em = datetime.now(timezone.utc)
    elif "status" in updates and updates["status"] != "concluida":
        acao.concluida_em = None
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.post("/{jornada_id}/diagnosticos", status_code=201)
async def registrar_diagnostico(
    jornada_id: int,
    data: DiagnosticoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    j = await _buscar(db, jornada_id, usuario)
    if usuario.id != j.envoxer_id:
        raise HTTPException(403, "O mapa de evolução é respondido pela própria pessoa")
    if j.status != "ativa":
        raise HTTPException(400, "Jornada encerrada")

    if set(data.notas.keys()) != DIM_KEYS:
        raise HTTPException(422, "Responda todas as oito dimensões")
    if any(not isinstance(v, int) or v < 1 or v > 5 for v in data.notas.values()):
        raise HTTPException(422, "Cada dimensão precisa receber uma nota de 1 a 5")

    existente = (
        await db.execute(
            select(PdiDiagnostico).where(
                PdiDiagnostico.jornada_id == j.id,
                PdiDiagnostico.momento == data.momento,
            )
        )
    ).scalar_one_or_none()
    if existente:
        raise HTTPException(409, "Este momento do mapa já foi respondido; preserve o histórico")

    hoje = datetime.now(TZ).date()
    dias = (hoje - j.inicio).days
    if data.momento != "inicial":
        inicial = (
            await db.execute(
                select(PdiDiagnostico).where(
                    PdiDiagnostico.jornada_id == j.id,
                    PdiDiagnostico.momento == "inicial",
                )
            )
        ).scalar_one_or_none()
        if not inicial:
            raise HTTPException(409, "Responda primeiro o diagnóstico inicial")
        minimo = MOMENTO_DIA[data.momento]
        if dias < minimo:
            raise HTTPException(400, f"O mapa de {minimo} dias ainda não está disponível")
        if not (data.reflexao or "").strip() or not (data.conquistas or "").strip():
            raise HTTPException(422, "Nos marcos, registre também reflexão e conquistas concretas")

    d = PdiDiagnostico(
        jornada_id=j.id,
        autor_id=usuario.id,
        momento=data.momento,
        respostas={
            "notas": data.notas,
            "forca_atual": data.forca_atual.strip(),
            "desafio_atual": data.desafio_atual.strip(),
            "objetivo_proximo": data.objetivo_proximo.strip(),
        },
        reflexao=(data.reflexao or "").strip() or None,
        conquistas=(data.conquistas or "").strip() or None,
    )
    db.add(d)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.post("/{jornada_id}/registros", status_code=201)
async def registrar_evidencia(
    jornada_id: int,
    data: NovoRegistro,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    j = await _buscar(db, jornada_id, usuario)
    if usuario.id != j.envoxer_id:
        raise HTTPException(403, "Evidências são registradas pela própria pessoa")
    if j.status != "ativa":
        raise HTTPException(400, "Jornada encerrada")
    inicial = (
        await db.execute(
            select(PdiDiagnostico).where(
                PdiDiagnostico.jornada_id == j.id,
                PdiDiagnostico.momento == "inicial",
            )
        )
    ).scalar_one_or_none()
    if not inicial:
        raise HTTPException(409, "Responda o diagnóstico inicial antes de registrar evidências")
    if not all(len(v.strip()) >= 5 for v in (data.situacao, data.impacto, data.proposta, data.resultado)):
        raise HTTPException(422, "Descreva os quatro campos com informações reais e objetivas")
    if data.acao_id:
        acao = (
            await db.execute(
                select(PdiAcao).where(
                    PdiAcao.id == data.acao_id,
                    PdiAcao.jornada_id == j.id,
                    PdiAcao.envoxer_id == j.envoxer_id,
                )
            )
        ).scalar_one_or_none()
        if not acao:
            raise HTTPException(400, "Ação não pertence a esta jornada")
    else:
        raise HTTPException(422, "Escolha qual ação do PDI foi praticada nesta evidência")

    r = PdiRegistro(
        jornada_id=j.id,
        autor_id=usuario.id,
        acao_id=data.acao_id,
        tipo="evidencia",
        situacao=data.situacao.strip(),
        impacto=data.impacto.strip(),
        proposta=data.proposta.strip(),
        resultado=data.resultado.strip(),
        status_validacao="pendente",
    )
    db.add(r)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.patch("/{jornada_id}/registros/{registro_id}/validar")
async def validar_evidencia(
    jornada_id: int,
    registro_id: int,
    data: ValidacaoRegistro,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    j = await _buscar(db, jornada_id, usuario)
    if not _pode_validar(j, usuario):
        raise HTTPException(403, "Somente gestor responsável ou Admin pode validar")
    r = (
        await db.execute(
            select(PdiRegistro).where(
                PdiRegistro.id == registro_id,
                PdiRegistro.jornada_id == j.id,
                PdiRegistro.tipo == "evidencia",
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Registro não encontrado")
    if r.status_validacao != "pendente":
        raise HTTPException(409, "Registro já revisado; preserve o histórico")
    if len(data.feedback.strip()) < 5:
        raise HTTPException(422, "Feedback obrigatório")
    r.status_validacao = data.status
    r.feedback_gestor = data.feedback.strip()
    r.validado_por_id = usuario.id
    r.validado_em = datetime.now(timezone.utc)
    await db.flush()
    return await montar_painel(db, j, usuario)


@router.post("/{jornada_id}/marcos", status_code=201)
async def revisar_marco(
    jornada_id: int,
    data: NovoMarco,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    j = await _buscar(db, jornada_id, usuario)
    if not _pode_validar(j, usuario):
        raise HTTPException(403, "Somente gestor responsável ou Admin pode registrar marcos")
    if j.status != "ativa":
        raise HTTPException(400, "Jornada encerrada")
    if datetime.now(TZ).date() < j.inicio + timedelta(days=data.marco_dia):
        raise HTTPException(400, "Marco ainda não chegou ao período de avaliação")
    if not all(len(v.strip()) >= 5 for v in (data.situacao, data.impacto, data.proposta, data.resultado)):
        raise HTTPException(422, "Registre fatos e combinados reais")
    other = (
        await db.execute(
            select(PdiRegistro).where(
                PdiRegistro.jornada_id == j.id,
                PdiRegistro.tipo == "marco",
                PdiRegistro.marco_dia == data.marco_dia,
            )
        )
    ).first()
    if other:
        raise HTTPException(409, "Este marco já tem uma avaliação; preserve o histórico")
    r = PdiRegistro(
        jornada_id=j.id,
        autor_id=usuario.id,
        tipo="marco",
        marco_dia=data.marco_dia,
        situacao=data.situacao.strip(),
        impacto=data.impacto.strip(),
        proposta=data.proposta.strip(),
        resultado=data.resultado.strip(),
        avaliacao=data.avaliacao,
        status_validacao="validada",
        feedback_gestor=data.resultado.strip(),
        validado_por_id=usuario.id,
        validado_em=datetime.now(timezone.utc),
    )
    db.add(r)
    await db.flush()
    return await montar_painel(db, j, usuario)
