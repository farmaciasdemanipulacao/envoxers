"""Portal B2B: projeção autorizada da operação existente; não replica Kanban nem timer."""
from datetime import date, datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_cliente_contato, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.cliente_contato import ClienteContato
from app.models.envoxer import Envoxer
from app.models.solicitacao import Solicitacao, TIPO_SOLICITACAO_VALUES
from app.models.tarefa import Tarefa
from app.models.evento import Evento
from app.models.portal_operacao import PortalUnidade, PortalContatoUnidade, PortalSolicitacaoTarefa, PortalEvento, PortalComentario, PortalFormulario, PortalClienteConfig, PortalCampanha
from app.services.portal_permissoes import capacidades, pode, pode_ver_solicitacao

router = APIRouter(prefix="/portal/operacao", tags=["portal-operacao"])

CAMPOS_PADRAO = [
    {"chave": "regional", "rotulo": "Regional (opcional se houver frente)", "tipo": "unidade", "obrigatorio": False},
    {"chave": "tipo", "rotulo": "Tipo da demanda", "tipo": "select", "obrigatorio": True},
    {"chave": "titulo", "rotulo": "Nome da demanda", "tipo": "texto", "obrigatorio": True},
    {"chave": "descricao", "rotulo": "Briefing da demanda", "tipo": "texto_longo", "obrigatorio": True},
    {"chave": "prazo_solicitado", "rotulo": "Data desejada", "tipo": "data", "obrigatorio": True},
    {"chave": "apoio_envox", "rotulo": "Apoio Envox", "tipo": "texto_longo", "obrigatorio": True},
    {"chave": "referencias", "rotulo": "Referências", "tipo": "texto_longo", "obrigatorio": False},
]
PUBLIC_STATUS = {
    "nova": "Recebida", "em_analise": "Em triagem", "virou_demanda": "Em andamento", "recusada": "Não aceita",
}
TAREFA_STATUS = {
    "nova": "Planejamento", "planejamento": "Planejamento", "producao": "Em produção",
    "revisao_interna": "Em revisão", "aprovacao_cliente": "Aguardando aprovação",
    "ajustes": "Em ajustes", "programado": "Programada", "finalizado": "Concluída",
}

class SolicitacaoNova(BaseModel):
    unidade_id: int | None = None
    frente_id: int | None = None
    campanha_id: int | None = Field(..., description='Informe ID ou null para Sem campanha')
    evento_id: int | None = Field(..., description='Informe ID ou null para Sem evento')
    tipo: str
    titulo: str = Field(min_length=3, max_length=200)
    descricao: str = Field(min_length=10, max_length=12000)
    prazo_solicitado: date
    apoio_envox: str = Field(min_length=2, max_length=4000)
    referencias: str = Field(default="", max_length=4000)
    campos_customizados: dict = Field(default_factory=dict)

class CampanhaNova(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    unidade_id: int | None = None
    frente_id: int | None = None

class EventoNovo(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    data: date
    unidade_id: int | None = None
    frente_id: int | None = None

class ComentarioNovo(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)

class UnidadeNova(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    tipo: str

class VinculoNovo(BaseModel):
    tarefa_id: int

class PapelNovo(BaseModel):
    papel: str
    unidade_ids: list[int] = Field(default_factory=list)
    capacidades: dict[str, bool] = Field(default_factory=dict)

class FormularioNovo(BaseModel):
    campos: list[dict]

async def unidades_do_contato(db: AsyncSession, contato: ClienteContato) -> set[int]:
    result = await db.execute(
        select(PortalContatoUnidade.unidade_id).join(
            PortalUnidade, PortalUnidade.id == PortalContatoUnidade.unidade_id
        ).where(PortalContatoUnidade.contato_id == contato.id, PortalUnidade.cliente_id == contato.cliente_id, PortalUnidade.ativo.is_(True))
    )
    return set(result.scalars().all())

async def solicitar_acesso(db: AsyncSession, contato: ClienteContato, solicitacao_id: int) -> Solicitacao:
    solicitacao = await db.get(Solicitacao, solicitacao_id)
    if not solicitacao or solicitacao.cliente_id != contato.cliente_id:
        raise HTTPException(404, "Solicitação não encontrada")
    unidades = await unidades_do_contato(db, contato)
    if not pode_ver_solicitacao(contato.portal_papel, contato.id, solicitacao.portal_contato_id, solicitacao.portal_unidade_id, unidades, contato.portal_capacidades, frente_id=solicitacao.portal_frente_id):
        raise HTTPException(404, "Solicitação não encontrada")
    return solicitacao

# Dados externos são uma projeção explícita: não transmitir JSON operacional bruto.
CHAVES_INTERNAS = ("valor", "preco", "preço", "custo", "honorario", "honorário", "hora", "tempo", "executor", "responsavel_envoxer", "responsável_envoxer", "faturamento")

def briefing_publico(briefing: dict | None) -> dict:
    base = briefing if isinstance(briefing, dict) else {}
    resposta = {chave: base[chave] for chave in ("apoio_envox", "referencias")
                if isinstance(base.get(chave), str)}
    extras = base.get("campos_customizados")
    if isinstance(extras, dict):
        resposta["campos_customizados"] = {
            chave: valor for chave, valor in extras.items()
            if isinstance(chave, str) and isinstance(valor, str)
            and not any(reservada in chave.lower() for reservada in CHAVES_INTERNAS)
        }
    return resposta

def representacao(s: Solicitacao) -> dict:
    return {
        "id": s.id, "protocolo": s.protocolo or f"LEGADO-{s.id:06d}",
        "titulo": s.titulo, "tipo": s.tipo, "descricao": s.descricao,
        "status": PUBLIC_STATUS.get(s.status, "Em acompanhamento"),
        "unidade_id": s.portal_unidade_id, "frente_id": s.portal_frente_id,
        "campanha_id": s.portal_campanha_id, "evento_id": s.portal_evento_id,
        "prazo_solicitado": s.prazo_solicitado, "prazo_confirmado": s.prazo_confirmado,
        "criado_em": s.created_at, "solicitante": s.solicitante_nome,
        "briefing": briefing_publico(s.briefing_estruturado),
    }

async def escopo_stmt(db: AsyncSession, contato: ClienteContato):
    unidades = await unidades_do_contato(db, contato)
    caps = capacidades(contato.portal_papel, contato.portal_capacidades)
    stmt = select(Solicitacao).where(Solicitacao.cliente_id == contato.cliente_id)
    if "ver_todas" not in caps:
        if "ver_unidades" in caps:
            # Filtro restritivo: jamais unir "meus pedidos" a unidades não autorizadas.
            stmt = stmt.where(or_(Solicitacao.portal_unidade_id.in_(unidades), Solicitacao.portal_frente_id.in_(unidades)))
        else:
            stmt = stmt.where(Solicitacao.portal_contato_id == contato.id)
    return stmt


# Flags de produto, nunca uma fonte alternativa para tarefas ou entregas.
MODULOS_PORTAL = ("solicitacoes", "documentos", "aprovacoes", "campanhas", "biblioteca", "ia")
MODULOS_PRONTOS_PARA_HABILITAR = frozenset({"solicitacoes", "documentos"})
DEFAULT_MODULOS_PORTAL = {
    "solicitacoes": True, "documentos": True, "aprovacoes": False,
    "campanhas": False, "biblioteca": False, "ia": False,
}
NOTIFICACOES_PERMITIDAS = frozenset({"alteracao_status", "aprovar_material", "comentario", "nova_solicitacao"})
VISIBILIDADE_PERMITIDA = frozenset({"mostrar_prazo", "mostrar_responsavel", "mostrar_horas"})

class ConfigClientePatch(BaseModel):
    habilitado: bool
    modulos: dict[str, bool] = Field(default_factory=dict)
    notificacoes: dict[str, bool] = Field(default_factory=dict)
    visibilidade: dict[str, bool] = Field(default_factory=dict)

def serializar_config(cliente_id: int, config: PortalClienteConfig | None) -> dict:
    return {
        "cliente_id": cliente_id,
        "habilitado": bool(config.habilitado) if config else False,
        "modulos": {**DEFAULT_MODULOS_PORTAL, **(config.modulos or {})} if config else DEFAULT_MODULOS_PORTAL.copy(),
        "notificacoes": config.notificacoes or {} if config else {},
        "visibilidade": config.visibilidade or {} if config else {},
    }

async def contato_habilitado(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClienteContato:
    conf = await db.get(PortalClienteConfig, contato.cliente_id)
    if conf is None or not conf.habilitado or not (conf.modulos or {}).get("solicitacoes", True):
        # Não revela a existência de configurações de outros clientes.
        raise HTTPException(403, "Portal não habilitado para esta organização")
    return contato

@router.get("/admin/clientes")
async def listar_clientes_portal(
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.cliente import Cliente
    resultado = (await db.execute(
        select(Cliente, PortalClienteConfig)
        .outerjoin(PortalClienteConfig, PortalClienteConfig.cliente_id == Cliente.id)
        .where(Cliente.deleted_at.is_(None))
        .order_by(Cliente.nome)
    )).all()
    return [
        {"id": c.id, "nome": c.nome, "config": serializar_config(c.id, conf)}
        for c, conf in resultado
    ]

@router.get("/admin/clientes/{cliente_id}/gargalos")
async def indicadores_gargalos_portal(
    cliente_id: int,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Painel interno da Envox com dados canônicos do Kanban, sem contagem duplicada."""
    from app.models.cliente import Cliente
    cliente = await db.get(Cliente, cliente_id)
    if not cliente or cliente.deleted_at is not None:
        raise HTTPException(404, "Cliente não encontrado")
    hoje = date.today()
    tarefas = select(func.count(Tarefa.id)).where(
        Tarefa.cliente_id == cliente_id,
        Tarefa.deleted_at.is_(None),
    )
    solicitacoes = select(func.count(Solicitacao.id)).where(Solicitacao.cliente_id == cliente_id)
    # Cada contador consulta exclusivamente a fonte operacional preexistente.
    def t(*criterios):
        return tarefas.where(*criterios)
    def s(*criterios):
        return solicitacoes.where(*criterios)
    consultas = {
        "solicitacoes_sem_triagem": s(Solicitacao.status == "nova"),
        "solicitacoes_em_triagem": s(Solicitacao.status == "em_analise"),
        "tarefas_sem_responsavel": t(Tarefa.responsavel_envoxer_id.is_(None), Tarefa.status != "finalizado"),
        "tarefas_aguardando_cliente": t(Tarefa.status == "aprovacao_cliente"),
        "tarefas_atrasadas": t(Tarefa.prazo < hoje, Tarefa.status != "finalizado"),
    }
    indicadores = {}
    for chave, consulta in consultas.items():
        indicadores[chave] = int((await db.execute(consulta)).scalar_one() or 0)
    return {"cliente_id": cliente_id, "indicadores": indicadores, "gerado_em": datetime.now(timezone.utc)}


@router.get("/admin/clientes/{cliente_id}/configuracao")
async def obter_config_portal(
    cliente_id: int,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.cliente import Cliente
    cliente = await db.get(Cliente, cliente_id)
    if not cliente or cliente.deleted_at is not None:
        raise HTTPException(404, "Cliente não encontrado")
    config = await db.get(PortalClienteConfig, cliente_id)
    unidades = (await db.execute(select(PortalUnidade).where(PortalUnidade.cliente_id == cliente_id).order_by(PortalUnidade.tipo, PortalUnidade.nome))).scalars().all()
    contatos = (await db.execute(select(ClienteContato).where(ClienteContato.cliente_id == cliente_id).order_by(ClienteContato.nome))).scalars().all()
    vinculos = (await db.execute(select(PortalContatoUnidade).join(
        PortalUnidade, PortalUnidade.id == PortalContatoUnidade.unidade_id
    ).where(PortalUnidade.cliente_id == cliente_id))).scalars().all()
    ids_por_contato: dict[int, list[int]] = {}
    for vinc in vinculos:
        ids_por_contato.setdefault(vinc.contato_id, []).append(vinc.unidade_id)
    formulario = (await db.execute(select(PortalFormulario).where(
        PortalFormulario.cliente_id == cliente_id, PortalFormulario.ativo.is_(True)
    ).order_by(PortalFormulario.versao.desc()).limit(1))).scalar_one_or_none()
    return {
        "cliente": {"id": cliente.id, "nome": cliente.nome},
        "config": serializar_config(cliente_id, config),
        "unidades": [{"id": u.id, "nome": u.nome, "tipo": u.tipo, "ativo": u.ativo} for u in unidades],
        "contatos": [{"id": c.id, "nome": c.nome, "email": c.email, "papel": c.portal_papel, "ativo": c.ativo, "unidade_ids": ids_por_contato.get(c.id, []), "pode_aprovar": pode(c.portal_papel, "aprovar", c.portal_capacidades)} for c in contatos],
        "formulario": {"versao": formulario.versao, "campos": formulario.campos} if formulario else {"versao": 0, "campos": CAMPOS_PADRAO},
        "modulos_habilitaveis": sorted(MODULOS_PRONTOS_PARA_HABILITAR),
    }

@router.put("/admin/clientes/{cliente_id}/configuracao")
async def salvar_config_portal(
    cliente_id: int,
    payload: ConfigClientePatch,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.cliente import Cliente
    cliente = await db.get(Cliente, cliente_id)
    if not cliente or cliente.deleted_at is not None:
        raise HTTPException(404, "Cliente não encontrado")
    if set(payload.modulos) - set(MODULOS_PORTAL):
        raise HTTPException(422, "Módulo desconhecido")
    if any(valor is True and nome not in MODULOS_PRONTOS_PARA_HABILITAR for nome, valor in payload.modulos.items()):
        raise HTTPException(422, "Este módulo ainda não passou pela homologação de segurança")
    if set(payload.notificacoes) - NOTIFICACOES_PERMITIDAS:
        raise HTTPException(422, "Notificação desconhecida")
    if any(payload.notificacoes.values()):
        raise HTTPException(422, "Notificações externas ainda não estão homologadas")
    if set(payload.visibilidade) - VISIBILIDADE_PERMITIDA:
        raise HTTPException(422, "Regra de visibilidade desconhecida")
    if payload.visibilidade.get("mostrar_horas"):
        raise HTTPException(422, "Indicadores de horas exigem política de exposição homologada")
    config = await db.get(PortalClienteConfig, cliente_id)
    if config is None:
        config = PortalClienteConfig(cliente_id=cliente_id)
        db.add(config)
    config.habilitado = payload.habilitado
    config.modulos = {**DEFAULT_MODULOS_PORTAL, **payload.modulos}
    config.notificacoes = payload.notificacoes
    config.visibilidade = payload.visibilidade
    config.atualizado_em = datetime.now(timezone.utc)
    await db.flush()
    return serializar_config(cliente_id, config)

@router.get("/configuracao")
async def configuracao(
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ids = await unidades_do_contato(db, contato)
    caps = capacidades(contato.portal_papel, contato.portal_capacidades)
    stmt = select(PortalUnidade).where(PortalUnidade.cliente_id == contato.cliente_id, PortalUnidade.ativo.is_(True))
    if "ver_todas" not in caps:
        stmt = stmt.where(PortalUnidade.id.in_(ids))
    unidades = (await db.execute(stmt.order_by(PortalUnidade.tipo, PortalUnidade.nome))).scalars().all()
    formulario = (await db.execute(select(PortalFormulario).where(
        PortalFormulario.cliente_id == contato.cliente_id, PortalFormulario.ativo.is_(True)
    ).order_by(PortalFormulario.versao.desc()).limit(1))).scalar_one_or_none()
    return {
        "papel": contato.portal_papel, "capacidades": sorted(caps),
        "produto": serializar_config(contato.cliente_id, await db.get(PortalClienteConfig, contato.cliente_id)),
        "unidades": [{"id": u.id, "nome": u.nome, "tipo": u.tipo} for u in unidades],
        "tipo_opcoes": list(TIPO_SOLICITACAO_VALUES),
        "formulario": {"versao": formulario.versao if formulario else 0, "campos": formulario.campos if formulario else CAMPOS_PADRAO},
    }


async def validar_areas_catalogo(db: AsyncSession, contato: ClienteContato, unidade_id: int | None, frente_id: int | None):
    if unidade_id is None and frente_id is None and not pode(contato.portal_papel,"ver_todas",contato.portal_capacidades):
        raise HTTPException(422, "Selecione uma regional ou frente antes de criar")
    ids = await unidades_do_contato(db, contato)
    for ident, tipo in ((unidade_id,"regional"),(frente_id,"frente")):
        if ident is None:
            continue
        u=await db.get(PortalUnidade,ident)
        if not u or u.cliente_id != contato.cliente_id or u.tipo != tipo or not u.ativo:
            raise HTTPException(422, "Regional ou frente inválida")
        if not pode(contato.portal_papel,"ver_todas",contato.portal_capacidades) and ident not in ids:
            raise HTTPException(403, "Área não autorizada")

def escopo_catalogo(stmt, model, ids: set[int], todas: bool):
    if todas: return stmt
    return stmt.where(or_(model.portal_unidade_id.in_(ids), model.portal_frente_id.in_(ids)))

async def campanhas_visiveis(db: AsyncSession, contato: ClienteContato):
    ids=await unidades_do_contato(db,contato)
    stmt=select(PortalCampanha).where(
        PortalCampanha.cliente_id==contato.cliente_id,PortalCampanha.ativo.is_(True)
    )
    stmt=escopo_catalogo(stmt,PortalCampanha,ids,pode(contato.portal_papel,"ver_todas",contato.portal_capacidades))
    return (await db.execute(stmt.order_by(PortalCampanha.criado_em.desc(),PortalCampanha.id.desc()).limit(300))).scalars().all()

async def eventos_visiveis(db: AsyncSession, contato: ClienteContato):
    ids=await unidades_do_contato(db,contato)
    stmt=select(Evento).where(
        Evento.cliente_id==contato.cliente_id,
        Evento.deleted_at.is_(None), Evento.tipo=="evento_externo",
    )
    stmt=escopo_catalogo(stmt,Evento,ids,pode(contato.portal_papel,"ver_todas",contato.portal_capacidades))
    return (await db.execute(stmt.order_by(Evento.data_inicio.desc(),Evento.id.desc()).limit(300))).scalars().all()

@router.get("/campanhas")
async def listar_campanhas(
    contato: Annotated[ClienteContato,Depends(contato_habilitado)],
    db: Annotated[AsyncSession,Depends(get_db)],
):
    campanhas=await campanhas_visiveis(db,contato)
    # Contagens vêm da solicitação canônica e respeitam escopo do usuário.
    base=await escopo_stmt(db,contato)
    pedidos=(await db.execute(base.where(Solicitacao.portal_campanha_id.in_([c.id for c in campanhas])))).scalars().all() if campanhas else []
    totais={}
    for pedido in pedidos:
        totais[pedido.portal_campanha_id]=totais.get(pedido.portal_campanha_id,0)+1
    return [{"id":c.id,"nome":c.nome,"unidade_id":c.portal_unidade_id,
             "frente_id":c.portal_frente_id,"total_solicitacoes":totais.get(c.id,0)}
            for c in campanhas]

@router.post("/campanhas",status_code=201)
async def criar_campanha(
    payload: CampanhaNova,
    contato: Annotated[ClienteContato,Depends(contato_habilitado)],
    db: Annotated[AsyncSession,Depends(get_db)],
):
    if not pode(contato.portal_papel,"solicitar",contato.portal_capacidades):
        raise HTTPException(403,"Sem permissão para cadastrar campanha")
    await validar_areas_catalogo(db,contato,payload.unidade_id,payload.frente_id)
    nome=payload.nome.strip()
    if len(nome)<2: raise HTTPException(422,"Informe o nome da campanha")
    encontrado=(await db.execute(select(PortalCampanha).where(
        PortalCampanha.cliente_id==contato.cliente_id,
        func.lower(PortalCampanha.nome)==nome.lower(),
    ))).scalar_one_or_none()
    if encontrado:
        # Não vazar catálogo de outra regional só porque o nome coincide.
        visiveis=await campanhas_visiveis(db,contato)
        if encontrado.id not in {c.id for c in visiveis}:
            raise HTTPException(409,"Nome já utilizado. Solicite à Envox o acesso à campanha")
        return {"id":encontrado.id,"nome":encontrado.nome,"unidade_id":encontrado.portal_unidade_id,
                "frente_id":encontrado.portal_frente_id,"ja_existia":True}
    c=PortalCampanha(cliente_id=contato.cliente_id,nome=nome,
        portal_unidade_id=payload.unidade_id,portal_frente_id=payload.frente_id,
        criado_por_contato_id=contato.id)
    db.add(c);await db.flush()
    return {"id":c.id,"nome":c.nome,"unidade_id":c.portal_unidade_id,"frente_id":c.portal_frente_id,
            "total_solicitacoes":0,"ja_existia":False}

@router.get("/eventos")
async def listar_eventos_portal(
    contato: Annotated[ClienteContato,Depends(contato_habilitado)],
    db: Annotated[AsyncSession,Depends(get_db)],
):
    eventos=await eventos_visiveis(db,contato)
    base=await escopo_stmt(db,contato)
    pedidos=(await db.execute(base.where(Solicitacao.portal_evento_id.in_([e.id for e in eventos])))).scalars().all() if eventos else []
    totais={}
    for pedido in pedidos:
        totais[pedido.portal_evento_id]=totais.get(pedido.portal_evento_id,0)+1
    return [{"id":e.id,"nome":e.titulo,"data":e.data_inicio.date().isoformat(),
             "unidade_id":e.portal_unidade_id,"frente_id":e.portal_frente_id,
             "total_solicitacoes":totais.get(e.id,0)}
            for e in eventos]

@router.post("/eventos",status_code=201)
async def criar_evento_portal(
    payload: EventoNovo,
    contato: Annotated[ClienteContato,Depends(contato_habilitado)],
    db: Annotated[AsyncSession,Depends(get_db)],
):
    if not pode(contato.portal_papel,"solicitar",contato.portal_capacidades):
        raise HTTPException(403,"Sem permissão para cadastrar evento")
    await validar_areas_catalogo(db,contato,payload.unidade_id,payload.frente_id)
    nome=payload.nome.strip()
    if len(nome)<2: raise HTTPException(422,"Informe o nome do evento")
    e=Evento(cliente_id=contato.cliente_id,titulo=nome,tipo="evento_externo",
        data_inicio=datetime.combine(payload.data,datetime.min.time(),tzinfo=timezone.utc),
        dia_inteiro=True,portal_unidade_id=payload.unidade_id,portal_frente_id=payload.frente_id)
    db.add(e);await db.flush()
    return {"id":e.id,"nome":e.titulo,"data":payload.data.isoformat(),
            "unidade_id":e.portal_unidade_id,"frente_id":e.portal_frente_id,"total_solicitacoes":0}

@router.get("/solicitacoes")
async def listar(
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = await escopo_stmt(db, contato)
    resultado = (await db.execute(stmt.order_by(Solicitacao.created_at.desc()).limit(200))).scalars().all()
    return [representacao(s) for s in resultado]

@router.post("/solicitacoes", status_code=201)
async def criar(
    payload: SolicitacaoNova,
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not pode(contato.portal_papel, "solicitar", contato.portal_capacidades):
        raise HTTPException(403, "Sem permissão para solicitar")
    if payload.tipo not in TIPO_SOLICITACAO_VALUES:
        raise HTTPException(422, "Tipo inválido")
    if payload.unidade_id is None and payload.frente_id is None:
        raise HTTPException(422, "Informe uma regional, uma frente ou ambas")
    ids = await unidades_do_contato(db, contato)
    if payload.unidade_id is not None:
        unidade = await db.get(PortalUnidade, payload.unidade_id)
        if not unidade or unidade.cliente_id != contato.cliente_id or unidade.tipo != "regional" or not unidade.ativo:
            raise HTTPException(422, "Regional inválida")
        if not pode(contato.portal_papel, "ver_todas", contato.portal_capacidades) and unidade.id not in ids:
            raise HTTPException(403, "Regional não autorizada")
    if payload.frente_id is not None:
        frente = await db.get(PortalUnidade, payload.frente_id)
        if not frente or frente.cliente_id != contato.cliente_id or frente.tipo != "frente" or not frente.ativo:
            raise HTTPException(422, "Frente inválida")
        if not pode(contato.portal_papel, "ver_todas", contato.portal_capacidades) and frente.id not in ids:
            raise HTTPException(403, "Frente não autorizada")
    # Vínculos opcionais, com escolha explícita ("Sem campanha"/"Sem evento").
    # Ids estrangeiros, de outra regional ou de outro cliente são rejeitados.
    if payload.campanha_id is not None:
        c=await db.get(PortalCampanha,payload.campanha_id)
        if not c or not c.ativo or c.cliente_id!=contato.cliente_id:
            raise HTTPException(422,"Campanha inválida")
        if c.portal_unidade_id!=payload.unidade_id or c.portal_frente_id!=payload.frente_id:
            # Admin pode criar campanhas globais; elas só podem ser usadas com
            # escopos já autorizados e sem misturar áreas distintas.
            if c.portal_unidade_id is not None or c.portal_frente_id is not None:
                raise HTTPException(422,"A campanha pertence a outra área")
    if payload.evento_id is not None:
        ev=await db.get(Evento,payload.evento_id)
        if not ev or ev.deleted_at is not None or ev.cliente_id!=contato.cliente_id or ev.tipo!="evento_externo":
            raise HTTPException(422,"Evento inválido")
        if ev.portal_unidade_id!=payload.unidade_id or ev.portal_frente_id!=payload.frente_id:
            if ev.portal_unidade_id is not None or ev.portal_frente_id is not None:
                raise HTTPException(422,"O evento pertence a outra área")
    # O frontend não é a autoridade de validação: exigir campos extras ativos no servidor.
    formulario_ativo = (await db.execute(select(PortalFormulario).where(
        PortalFormulario.cliente_id == contato.cliente_id, PortalFormulario.ativo.is_(True)
    ).order_by(PortalFormulario.versao.desc()).limit(1))).scalar_one_or_none()
    if formulario_ativo:
        campos = formulario_ativo.campos or []
        chaves = {f.get("chave") for f in campos if isinstance(f, dict)}
        extras = payload.campos_customizados or {}
        if set(extras) - chaves:
            raise HTTPException(422, "O formulário contém campos não autorizados")
        for campo in campos:
            chave = campo.get("chave")
            if chave in ("regional", "tipo", "titulo", "descricao", "prazo_solicitado", "apoio_envox", "referencias"):
                continue
            valor = extras.get(chave)
            if campo.get("obrigatorio") and (not isinstance(valor, str) or not valor.strip()):
                raise HTTPException(422, f"Campo obrigatório ausente: {chave}")
            if valor is not None and (not isinstance(valor, str) or len(valor) > 4000):
                raise HTTPException(422, f"Campo inválido: {chave}")
    elif payload.campos_customizados:
        raise HTTPException(422, "Campos extras ainda não foram configurados")
    s = Solicitacao(
        cliente_id=contato.cliente_id, portal_contato_id=contato.id,
        portal_unidade_id=payload.unidade_id, portal_frente_id=payload.frente_id,
        portal_campanha_id=payload.campanha_id,portal_evento_id=payload.evento_id,
        tipo=payload.tipo, titulo=payload.titulo.strip(), descricao=payload.descricao.strip(),
        prazo_solicitado=payload.prazo_solicitado, solicitante_nome=contato.nome,
        status="nova", briefing_estruturado={
            "apoio_envox": payload.apoio_envox, "referencias": payload.referencias,
            "campos_customizados": payload.campos_customizados,
        },
    )
    db.add(s)
    await db.flush()
    s.protocolo = f"EVX-{datetime.now(timezone.utc).year}-{s.id:07d}"
    db.add(PortalEvento(solicitacao_id=s.id, tipo="recebida", descricao="Solicitação recebida pela Envox", publico=True))
    await db.flush()
    return representacao(s)

@router.get("/solicitacoes/{solicitacao_id}")
async def detalhar(
    solicitacao_id: int,
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await solicitar_acesso(db, contato, solicitacao_id)
    eventos = (await db.execute(select(PortalEvento).where(
        PortalEvento.solicitacao_id == s.id, PortalEvento.publico.is_(True)
    ).order_by(PortalEvento.criado_em, PortalEvento.id))).scalars().all()
    comentarios = (await db.execute(select(PortalComentario).where(
        PortalComentario.solicitacao_id == s.id, PortalComentario.publico.is_(True)
    ).order_by(PortalComentario.criado_em, PortalComentario.id))).scalars().all()
    vinculos = (await db.execute(select(Tarefa).join(
        PortalSolicitacaoTarefa, PortalSolicitacaoTarefa.tarefa_id == Tarefa.id
    ).where(
        PortalSolicitacaoTarefa.solicitacao_id == s.id,
        Tarefa.cliente_id == contato.cliente_id,
        Tarefa.deleted_at.is_(None),
    ))).scalars().all()
    if s.tarefa_id_gerada and all(t.id != s.tarefa_id_gerada for t in vinculos):
        tarefa_legada = await db.get(Tarefa, s.tarefa_id_gerada)
        if tarefa_legada and tarefa_legada.cliente_id == contato.cliente_id and tarefa_legada.deleted_at is None:
            vinculos.append(tarefa_legada)
    resposta = representacao(s)
    resposta["eventos"] = [{"tipo": e.tipo, "descricao": e.descricao, "criado_em": e.criado_em} for e in eventos]
    resposta["comentarios"] = [{"id": c.id, "autor": c.autor_nome, "texto": c.texto, "criado_em": c.criado_em} for c in comentarios]
    resposta["tarefas"] = [{"id": t.id, "titulo": t.titulo, "status": TAREFA_STATUS.get(t.status, "Em andamento"), "prazo": t.prazo} for t in vinculos]
    # Horas, valores e executor interno não são campos da API externa, mesmo
    # quando há configuração antiga tentando habilitá-los.
    return resposta

@router.post("/solicitacoes/{solicitacao_id}/comentarios", status_code=201)
async def comentar(
    solicitacao_id: int, payload: ComentarioNovo,
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await solicitar_acesso(db, contato, solicitacao_id)
    if not pode(contato.portal_papel, "comentar", contato.portal_capacidades):
        raise HTTPException(403, "Sem permissão para comentar")
    comentario = PortalComentario(solicitacao_id=s.id, cliente_contato_id=contato.id, autor_nome=contato.nome, texto=payload.texto.strip(), publico=True)
    db.add(comentario)
    await db.flush()
    return {"id": comentario.id, "ok": True}

@router.get("/pendencias")
async def pendencias_de_validacao(
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Consulta pendências do Kanban canônico, sem autorizar aprovação por esta rota."""
    if not pode(contato.portal_papel, "aprovar", contato.portal_capacidades):
        raise HTTPException(403, "Sem permissão para consultar aprovações")
    stmt = await escopo_stmt(db, contato)
    stmt = stmt.join(
        PortalSolicitacaoTarefa,
        PortalSolicitacaoTarefa.solicitacao_id == Solicitacao.id,
    ).join(
        Tarefa,
        Tarefa.id == PortalSolicitacaoTarefa.tarefa_id,
    ).where(
        Tarefa.cliente_id == contato.cliente_id,
        Tarefa.deleted_at.is_(None),
        Tarefa.status == "aprovacao_cliente",
    ).distinct().order_by(Solicitacao.created_at.desc()).limit(100)
    items = (await db.execute(stmt)).scalars().all()
    return [
        {**representacao(s), "orientacao": "Material em validação. Aprovação externa ainda não habilitada."}
        for s in items
    ]


@router.get("/pessoas")
async def pessoas_da_instituicao(
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Visão institucional de acesso, nunca do cadastro interno Envoxers.

    Retorna apenas pessoas e regionais da organização do token. Não inclui
    senha, email, telefone, capacidades internas ou dados de outros clientes.
    """
    if not pode(contato.portal_papel, "gerenciar_usuarios", contato.portal_capacidades):
        raise HTTPException(403, "Acesso restrito à administração institucional")
    usuarios = (await db.execute(
        select(ClienteContato).where(
            ClienteContato.cliente_id == contato.cliente_id,
            ClienteContato.ativo.is_(True),
        ).order_by(ClienteContato.nome, ClienteContato.id)
    )).scalars().all()
    unidades = (await db.execute(
        select(PortalUnidade).where(
            PortalUnidade.cliente_id == contato.cliente_id,
            PortalUnidade.ativo.is_(True),
        ).order_by(PortalUnidade.nome)
    )).scalars().all()
    ids = [u.id for u in unidades]
    relacionamentos = (await db.execute(
        select(PortalContatoUnidade).where(
            PortalContatoUnidade.contato_id.in_([c.id for c in usuarios]),
            PortalContatoUnidade.unidade_id.in_(ids),
        )
    )).scalars().all() if usuarios and ids else []
    escopos: dict[int, list[int]] = {}
    for vinc in relacionamentos:
        escopos.setdefault(vinc.contato_id, []).append(vinc.unidade_id)
    return {
        "pessoas": [
            {"nome": c.nome, "papel": c.portal_papel,
             "pode_aprovar": pode(c.portal_papel, "aprovar", c.portal_capacidades),
             "areas": [{"nome": u.nome, "tipo": u.tipo} for u in unidades if u.id in escopos.get(c.id, [])]}
            for c in usuarios
        ],
        "regionais": [u.nome for u in unidades if u.tipo == "regional"],
        "frentes": [u.nome for u in unidades if u.tipo == "frente"],
    }


@router.get("/dashboard")
async def dashboard(
    contato: Annotated[ClienteContato, Depends(contato_habilitado)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = await escopo_stmt(db, contato)
    itens = (await db.execute(stmt.order_by(Solicitacao.created_at.desc()).limit(300))).scalars().all()
    return {
        "total": len(itens), "recebidas": sum(s.status == "nova" for s in itens),
        "triagem": sum(s.status == "em_analise" for s in itens),
        "em_andamento": sum(s.status == "virou_demanda" for s in itens),
        "nao_aceitas": sum(s.status == "recusada" for s in itens),
        "recentes": [representacao(s) for s in itens[:8]],
        "indicadores_limitados_a": 300,
    }

# Administração interna. Não se confunde com administração institucional do cliente.
@router.post("/admin/clientes/{cliente_id}/unidades", status_code=201)
async def criar_unidade(
    cliente_id: int, payload: UnidadeNova,
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.cliente import Cliente
    if not await db.get(Cliente, cliente_id):
        raise HTTPException(404, "Cliente não encontrado")
    if payload.tipo not in ("regional", "frente"):
        raise HTTPException(422, "Tipo de unidade deve ser regional ou frente")
    existente = (await db.execute(select(PortalUnidade).where(
        PortalUnidade.cliente_id == cliente_id, PortalUnidade.tipo == payload.tipo, PortalUnidade.nome == payload.nome
    ))).scalar_one_or_none()
    if existente:
        raise HTTPException(409, "Unidade já cadastrada")
    unidade = PortalUnidade(cliente_id=cliente_id, nome=payload.nome.strip(), tipo=payload.tipo)
    db.add(unidade)
    await db.flush()
    return {"id": unidade.id, "nome": unidade.nome, "tipo": unidade.tipo}

@router.patch("/admin/clientes/{cliente_id}/contatos/{contato_id}/acesso")
async def configurar_acesso(
    cliente_id: int, contato_id: int, payload: PapelNovo,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.services.portal_permissoes import PAPEIS
    if payload.papel not in PAPEIS:
        raise HTTPException(422, "Papel desconhecido")
    contato = await db.get(ClienteContato, contato_id)
    if not contato or contato.cliente_id != cliente_id:
        raise HTTPException(404, "Contato não encontrado")
    validas = (await db.execute(select(PortalUnidade.id).where(
        PortalUnidade.cliente_id == cliente_id,
        PortalUnidade.ativo.is_(True),
        PortalUnidade.id.in_(set(payload.unidade_ids)),
    ))).scalars().all()
    if len(validas) != len(set(payload.unidade_ids)):
        raise HTTPException(422, "Unidade não pertence ao cliente")
    if payload.papel not in ("admin_institucional", "solicitante"):
        raise HTTPException(422, "Escolha Administrador/Gestor SECOVI ou Solicitante")
    permitidas = set(PAPEIS[payload.papel]) | ({"aprovar"} if payload.papel == "solicitante" else set())
    if set(payload.capacidades) - permitidas:
        raise HTTPException(422, "Capacidade não autorizada para o perfil")
    if any(type(v) is not bool for v in payload.capacidades.values()):
        raise HTTPException(422, "Valores de capacidades devem ser booleanos")
    contato.portal_papel = payload.papel
    contato.portal_capacidades = payload.capacidades
    antigos = (await db.execute(select(PortalContatoUnidade).where(PortalContatoUnidade.contato_id == contato.id))).scalars().all()
    for vinc in antigos:
        await db.delete(vinc)
    await db.flush()
    for uid in set(payload.unidade_ids):
        db.add(PortalContatoUnidade(contato_id=contato.id, unidade_id=uid))
    return {"ok": True, "papel": contato.portal_papel, "unidade_ids": list(set(payload.unidade_ids))}

@router.post("/admin/solicitacoes/{solicitacao_id}/vincular-tarefa", status_code=201)
async def vincular_tarefa(
    solicitacao_id: int, payload: VinculoNovo,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await db.get(Solicitacao, solicitacao_id)
    t = await db.get(Tarefa, payload.tarefa_id)
    if not s or not t or t.deleted_at is not None or s.cliente_id != t.cliente_id:
        raise HTTPException(404, "Solicitação ou tarefa incompatível")
    vinculo = await db.get(PortalSolicitacaoTarefa, (s.id, t.id))
    if vinculo:
        return {"ok": True, "ja_vinculada": True}
    db.add(PortalSolicitacaoTarefa(solicitacao_id=s.id, tarefa_id=t.id))
    if s.status != "virou_demanda":
        s.status = "virou_demanda"
    db.add(PortalEvento(solicitacao_id=s.id, tipo="andamento", descricao="Demanda encaminhada à produção", publico=True))
    return {"ok": True, "ja_vinculada": False}

@router.post("/admin/solicitacoes/{solicitacao_id}/comentarios", status_code=201)
async def comentar_interno(
    solicitacao_id: int, payload: ComentarioNovo,
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    publico: bool = False,
):
    s = await db.get(Solicitacao, solicitacao_id)
    if not s:
        raise HTTPException(404, "Solicitação não encontrada")
    c = PortalComentario(solicitacao_id=s.id, envoxer_id=envoxer.id, autor_nome=envoxer.nome, texto=payload.texto.strip(), publico=publico)
    db.add(c)
    await db.flush()
    return {"id": c.id, "publico": c.publico}

@router.post("/admin/clientes/{cliente_id}/formularios", status_code=201)
async def configurar_formulario(
    cliente_id: int, payload: FormularioNovo,
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models.cliente import Cliente
    if not await db.get(Cliente, cliente_id):
        raise HTTPException(404, "Cliente não encontrado")
    if len(payload.campos) > 30 or not payload.campos:
        raise HTTPException(422, "Informe de 1 a 30 campos")
    tipos_validos = {"texto", "texto_longo", "data", "select", "unidade"}
    for campo in payload.campos:
        if campo.get("tipo") not in tipos_validos or not isinstance(campo.get("chave"), str) or len(campo["chave"]) > 64:
            raise HTTPException(422, "Campo inválido")
    ultimo = (await db.execute(select(func.max(PortalFormulario.versao)).where(PortalFormulario.cliente_id == cliente_id))).scalar_one()
    ativos = (await db.execute(select(PortalFormulario).where(PortalFormulario.cliente_id == cliente_id, PortalFormulario.ativo.is_(True)))).scalars().all()
    for atual in ativos:
        atual.ativo = False
    formulario = PortalFormulario(cliente_id=cliente_id, versao=(ultimo or 0) + 1, campos=payload.campos, ativo=True)
    db.add(formulario)
    await db.flush()
    return {"id": formulario.id, "versao": formulario.versao}
