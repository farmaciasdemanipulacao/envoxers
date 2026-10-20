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
from app.models.registro_foco import RegistroFoco
from app.models.portal_operacao import PortalUnidade, PortalContatoUnidade, PortalSolicitacaoTarefa, PortalEvento, PortalComentario, PortalFormulario
from app.services.portal_permissoes import capacidades, pode, pode_ver_solicitacao

router = APIRouter(prefix="/portal/operacao", tags=["portal-operacao"])

CAMPOS_PADRAO = [
    {"chave": "regional", "rotulo": "Regional solicitante", "tipo": "unidade", "obrigatorio": True},
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
    unidade_id: int
    frente_id: int | None = None
    tipo: str
    titulo: str = Field(min_length=3, max_length=200)
    descricao: str = Field(min_length=10, max_length=12000)
    prazo_solicitado: date
    apoio_envox: str = Field(min_length=2, max_length=4000)
    referencias: str = Field(default="", max_length=4000)
    campos_customizados: dict = Field(default_factory=dict)

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
    if not pode_ver_solicitacao(contato.portal_papel, contato.id, solicitacao.portal_contato_id, solicitacao.portal_unidade_id, unidades, contato.portal_capacidades):
        raise HTTPException(404, "Solicitação não encontrada")
    return solicitacao

def representacao(s: Solicitacao) -> dict:
    return {
        "id": s.id, "protocolo": s.protocolo or f"LEGADO-{s.id:06d}",
        "titulo": s.titulo, "tipo": s.tipo, "descricao": s.descricao,
        "status": PUBLIC_STATUS.get(s.status, "Em acompanhamento"),
        "unidade_id": s.portal_unidade_id, "frente_id": s.portal_frente_id,
        "prazo_solicitado": s.prazo_solicitado, "prazo_confirmado": s.prazo_confirmado,
        "criado_em": s.created_at, "solicitante": s.solicitante_nome,
        "briefing": s.briefing_estruturado or {},
    }

async def escopo_stmt(db: AsyncSession, contato: ClienteContato):
    unidades = await unidades_do_contato(db, contato)
    caps = capacidades(contato.portal_papel, contato.portal_capacidades)
    stmt = select(Solicitacao).where(Solicitacao.cliente_id == contato.cliente_id)
    if "ver_todas" not in caps:
        if "ver_unidades" in caps:
            # Filtro restritivo: jamais unir "meus pedidos" a unidades não autorizadas.
            stmt = stmt.where(Solicitacao.portal_unidade_id.in_(unidades))
        else:
            stmt = stmt.where(Solicitacao.portal_contato_id == contato.id)
    return stmt

@router.get("/configuracao")
async def configuracao(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
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
        "unidades": [{"id": u.id, "nome": u.nome, "tipo": u.tipo} for u in unidades],
        "tipo_opcoes": list(TIPO_SOLICITACAO_VALUES),
        "formulario": {"versao": formulario.versao if formulario else 0, "campos": formulario.campos if formulario else CAMPOS_PADRAO},
    }

@router.get("/solicitacoes")
async def listar(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = await escopo_stmt(db, contato)
    resultado = (await db.execute(stmt.order_by(Solicitacao.created_at.desc()).limit(200))).scalars().all()
    return [representacao(s) for s in resultado]

@router.post("/solicitacoes", status_code=201)
async def criar(
    payload: SolicitacaoNova,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not pode(contato.portal_papel, "solicitar", contato.portal_capacidades):
        raise HTTPException(403, "Sem permissão para solicitar")
    if payload.tipo not in TIPO_SOLICITACAO_VALUES:
        raise HTTPException(422, "Tipo inválido")
    unidade = await db.get(PortalUnidade, payload.unidade_id)
    if not unidade or unidade.cliente_id != contato.cliente_id or unidade.tipo != "regional" or not unidade.ativo:
        raise HTTPException(422, "Regional inválida")
    ids = await unidades_do_contato(db, contato)
    if not pode(contato.portal_papel, "ver_todas", contato.portal_capacidades) and unidade.id not in ids:
        raise HTTPException(403, "Regional não autorizada")
    if payload.frente_id is not None:
        frente = await db.get(PortalUnidade, payload.frente_id)
        if not frente or frente.cliente_id != contato.cliente_id or frente.tipo != "frente" or not frente.ativo:
            raise HTTPException(422, "Frente inválida")
        if not pode(contato.portal_papel, "ver_todas", contato.portal_capacidades) and frente.id not in ids:
            raise HTTPException(403, "Frente não autorizada")
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
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
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
    # Horas nunca são créditos. Por padrão não há exposição. Requer habilitação expressa.
    if (contato.portal_capacidades or {}).get("ver_horas") is True:
        ids = [t.id for t in vinculos]
        total = (await db.execute(select(func.coalesce(func.sum(RegistroFoco.duracao_segundos), 0)).where(
            RegistroFoco.tarefa_id.in_(ids), RegistroFoco.fim.is_not(None), RegistroFoco.descartado.is_(False)
        ))).scalar_one() if ids else 0
        resposta["segundos_produtivos_autorizados"] = int(total or 0)
    return resposta

@router.post("/solicitacoes/{solicitacao_id}/comentarios", status_code=201)
async def comentar(
    solicitacao_id: int, payload: ComentarioNovo,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await solicitar_acesso(db, contato, solicitacao_id)
    if not pode(contato.portal_papel, "comentar", contato.portal_capacidades):
        raise HTTPException(403, "Sem permissão para comentar")
    comentario = PortalComentario(solicitacao_id=s.id, cliente_contato_id=contato.id, autor_nome=contato.nome, texto=payload.texto.strip(), publico=True)
    db.add(comentario)
    await db.flush()
    return {"id": comentario.id, "ok": True}

@router.get("/dashboard")
async def dashboard(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
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
    if set(payload.capacidades) - set(PAPEIS[payload.papel]) - {"ver_horas"}:
        raise HTTPException(422, "Capacidade não autorizada para o papel")
    # Capacidade ver_horas é opt-in explícito; nenhum papel a recebe automaticamente.
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
