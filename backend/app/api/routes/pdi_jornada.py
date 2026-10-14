"""Jornada de PDI: evolução baseada em evidências, revisão humana e progressão individual.

Nenhum indicador calcula competência ou desempenho de alguém automaticamente.
Os pontos medem participação VALIDADA, nunca valor da pessoa ou performance.
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
from app.models.feedback_1a1 import Feedback1a1
from app.models.pdi_jornada import PdiJornada, PdiRegistro

router = APIRouter(prefix="/pdi/jornadas", tags=["pdi-jornada"])
TZ = ZoneInfo("America/Sao_Paulo")

class CriarJornada(BaseModel):
    model_config = ConfigDict(extra="forbid")
    envoxer_id: int
    gestor_id: int
    nome: str = Field(min_length=4, max_length=160)
    inicio: date
    fim: date
    lembrete_dia: int = Field(ge=0,le=6,default=4)

class ConfigJornada(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lembrete_ativo: bool
    lembrete_dia: int = Field(ge=0,le=6)

class NovoRegistro(BaseModel):
    model_config = ConfigDict(extra="forbid")
    acao_id: int | None = None
    situacao: str = Field(min_length=5,max_length=3000)
    impacto: str = Field(min_length=5,max_length=3000)
    proposta: str = Field(min_length=5,max_length=3000)
    resultado: str = Field(min_length=5,max_length=3000)

class ValidacaoRegistro(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["validada","ajustar"]
    feedback: str = Field(min_length=5,max_length=3000)

class NovoMarco(BaseModel):
    model_config = ConfigDict(extra="forbid")
    marco_dia: Literal[30,60,90]
    situacao: str = Field(min_length=5,max_length=3000)
    impacto: str = Field(min_length=5,max_length=3000)
    proposta: str = Field(min_length=5,max_length=3000)
    resultado: str = Field(min_length=5,max_length=3000)
    avaliacao: int = Field(ge=1, le=5)

def _gestor(usuario: Envoxer):
    return usuario.permissao in ("gestor", "admin")

def _permitido(jornada, usuario):
    return usuario.id == jornada.envoxer_id or usuario.id == jornada.gestor_id or usuario.permissao == "admin"

def _pode_validar(jornada, usuario):
    return usuario.id != jornada.envoxer_id and (_gestor(usuario) and (usuario.id == jornada.gestor_id or usuario.permissao == "admin"))

async def _buscar(db, id, usuario):
    j=(await db.execute(select(PdiJornada).where(PdiJornada.id==id))).scalar_one_or_none()
    if not j: raise HTTPException(404,"Jornada não encontrada")
    if not _permitido(j,usuario): raise HTTPException(403,"Acesso não permitido")
    return j

def _serializar_registro(r, nomes):
    return {
        "id":r.id,"tipo":r.tipo,"acao_id":r.acao_id,"marco_dia":r.marco_dia,
        "situacao":r.situacao,"impacto":r.impacto,"proposta":r.proposta,
        "resultado":r.resultado,"avaliacao":r.avaliacao,
        "status_validacao":r.status_validacao,"feedback_gestor":r.feedback_gestor,
        "autor_nome":nomes.get(r.autor_id,"—"),"validado_por_nome":nomes.get(r.validado_por_id),
        "criado_em":r.criado_em.isoformat() if r.criado_em else None,
        "validado_em":r.validado_em.isoformat() if r.validado_em else None,
    }

async def montar_painel(db, j, usuario):
    rows=(await db.execute(select(PdiRegistro).where(PdiRegistro.jornada_id==j.id).order_by(PdiRegistro.criado_em.desc(),PdiRegistro.id.desc()))).scalars().all()
    actions=(await db.execute(select(PdiAcao).where(PdiAcao.envoxer_id==j.envoxer_id, PdiAcao.created_at>=datetime.combine(j.inicio,datetime.min.time(),timezone.utc)).order_by(PdiAcao.prazo))).scalars().all()
    members=(await db.execute(select(Envoxer.id,Envoxer.nome).where(Envoxer.id.in_([j.envoxer_id,j.gestor_id]+[r.autor_id for r in rows])))).all()
    names=dict(members)
    hoje=datetime.now(TZ).date()
    duracao=max(1,(j.fim-j.inicio).days)
    passados=max(0,(hoje-j.inicio).days)
    semana_atual=min(passados//7+1,(duracao+6)//7) if hoje>=j.inicio else 0
    semana_atual=max(0,semana_atual)
    total_semanas=(duracao+6)//7
    semanas_validadas=set()
    semanas_registradas=set()
    for r in rows:
        if r.tipo=="evidencia" and r.criado_em:
            w=(r.criado_em.astimezone(TZ).date()-j.inicio).days//7+1
            if 1 <= w <= total_semanas:
                semanas_registradas.add(w)
                if r.status_validacao=="validada": semanas_validadas.add(w)
    marcos=[r for r in rows if r.tipo=="marco"]
    concluidos={r.marco_dia for r in marcos if r.status_validacao=="validada"}
    pendentes=[r for r in rows if r.tipo=="evidencia" and r.status_validacao=="pendente"]
    pct=round(100*(0.7*len(semanas_validadas)/total_semanas+0.3*len(concluidos)/3)) if total_semanas else 0
    pontos=20*len(semanas_validadas)+30*len(concluidos)
    badges=[]
    if len(semanas_validadas)>=1: badges.append({"nome":"Primeiro passo","icone":"🌱","texto":"Primeira semana com evidência validada"})
    if len(semanas_validadas)>=4: badges.append({"nome":"Consistência","icone":"🔥","texto":"Quatro semanas diferentes com evidências validadas"})
    if len(semanas_validadas)>=8: badges.append({"nome":"Evolução contínua","icone":"🚀","texto":"Oito semanas com evidências validadas"})
    for n in (30,60,90):
        if n in concluidos: badges.append({"nome":f"Marco {n} dias","icone":"🏅","texto":"Revisão registrada pela liderança"})
    alertas=[]
    ultima_1a1=(await db.execute(select(Feedback1a1.data).where(Feedback1a1.gestor_id==j.gestor_id,Feedback1a1.liderado_id==j.envoxer_id,Feedback1a1.data>=j.inicio).order_by(Feedback1a1.data.desc()).limit(1))).scalar_one_or_none()
    proximo_1a1=(ultima_1a1 or j.inicio)+timedelta(days=14)
    if j.status=="ativa" and hoje>=j.inicio and passados<=duracao+30:
        if semana_atual and semana_atual not in semanas_registradas:
            alertas.append({"tipo":"checkin","nivel":"atencao" if hoje.weekday()>=j.lembrete_dia else "info",
                            "texto":f"Semana {semana_atual}: registre uma situação real e como você conduziu."})
        if pendentes and _pode_validar(j,usuario):
            alertas.append({"tipo":"validacao","nivel":"atencao",
                            "texto":f"{len(pendentes)} evidência(s) aguardando validação e feedback."})
        if hoje>=proximo_1a1 and _pode_validar(j,usuario):
            alertas.append({"tipo":"quinzenal","nivel":"atencao","texto":"Conversa 1:1 quinzenal pendente. Registre pauta e combinados na aba 1:1."})
        for marco in (30,60,90):
            if passados>=marco and marco not in concluidos:
                alertas.append({"tipo":"marco","nivel":"atencao","texto":f"Revisão de {marco} dias está pendente."})
    proximas=[]
    for m in (30,60,90):
        proximas.append({"dia":m,"data":(j.inicio+timedelta(days=m)).isoformat(),"concluido":m in concluidos,
                         "pendente": passados>=m and m not in concluidos})
    return {
      "id":j.id,"nome":j.nome,"envoxer_id":j.envoxer_id,"envoxer_nome":names.get(j.envoxer_id),
      "gestor_id":j.gestor_id,"gestor_nome":names.get(j.gestor_id),
      "inicio":j.inicio.isoformat(),"fim":j.fim.isoformat(),"status":j.status,
      "lembrete_ativo":j.lembrete_ativo,"lembrete_dia":j.lembrete_dia,
      "dias_passados":min(passados,duracao),"dias_total":duracao,"semana_atual":semana_atual,"semanas_total":total_semanas,
      "semanas_registradas":sorted(semanas_registradas),"semanas_validadas":sorted(semanas_validadas),
      "progresso_pct":pct,"pontos_participacao":pontos,"badges":badges,"alertas":alertas,
      "marcos":proximas,"proximo_1a1":proximo_1a1.isoformat(),"pendentes_validacao":len(pendentes),
      "pode_validar":_pode_validar(j,usuario),"pode_registrar":usuario.id==j.envoxer_id,
      "acoes":[{"id":a.id,"titulo":a.titulo,"categoria":a.categoria,"status":a.status,"prazo":a.prazo.isoformat() if a.prazo else None} for a in actions],
      "registros":[_serializar_registro(r,names) for r in rows],
      "criterio":"O percentual e os pontos medem semanas com evidências validadas e marcos formais. Não são notas de competência nem avaliação de desempenho.",
    }

@router.get("")
async def minhas_jornadas(
    db: Annotated[AsyncSession,Depends(get_db)],
    usuario: Annotated[Envoxer,Depends(get_current_envoxer)],
    envoxer_id: int | None=Query(default=None)
):
    alvo=envoxer_id or usuario.id
    if alvo!=usuario.id and not _gestor(usuario): raise HTTPException(403,"Sem permissão")
    js=(await db.execute(select(PdiJornada).where(PdiJornada.envoxer_id==alvo).order_by(PdiJornada.inicio.desc()))).scalars().all()
    js=[j for j in js if _permitido(j,usuario)]
    return [await montar_painel(db,j,usuario) for j in js]

@router.get("/equipe")
async def quadro_equipe(
    db: Annotated[AsyncSession,Depends(get_db)],
    usuario: Annotated[Envoxer,Depends(get_current_envoxer)]
):
    if not _gestor(usuario):raise HTTPException(403,"Apenas liderança")
    consulta=select(PdiJornada).where(PdiJornada.status=="ativa")
    if usuario.permissao!="admin": consulta=consulta.where(PdiJornada.gestor_id==usuario.id)
    jornadas=(await db.execute(consulta.order_by(PdiJornada.inicio.desc()))).scalars().all()
    return [await montar_painel(db,j,usuario) for j in jornadas]

@router.post("",status_code=201)
async def criar_jornada(
    data:CriarJornada,
    db:Annotated[AsyncSession,Depends(get_db)],
    usuario:Annotated[Envoxer,Depends(get_current_envoxer)]
):
    if not _gestor(usuario): raise HTTPException(403,"Apenas liderança")
    if usuario.permissao!="admin" and data.gestor_id!=usuario.id:raise HTTPException(403,"Você deve ser o gestor responsável")
    if data.fim <= data.inicio or (data.fim-data.inicio).days>365:raise HTTPException(400,"Período inválido")
    users=(await db.execute(select(Envoxer).where(Envoxer.id.in_([data.envoxer_id,data.gestor_id]),Envoxer.ativo.is_(True)))).scalars().all()
    if len({u.id for u in users})!=len({data.envoxer_id,data.gestor_id}): raise HTTPException(400,"Pessoas inexistentes/inativas")
    if usuario.permissao!="admin":
        alvo=next((u for u in users if u.id==data.envoxer_id),None)
        if not alvo or alvo.gestor_responsavel_id!=usuario.id:
            raise HTTPException(403,"Somente o gestor responsável cadastrado pode iniciar a jornada")
    exists=(await db.execute(select(PdiJornada).where(PdiJornada.envoxer_id==data.envoxer_id,PdiJornada.status=="ativa"))).first()
    if exists:raise HTTPException(409,"Já existe jornada ativa para esta pessoa")
    j=PdiJornada(**data.model_dump(),status="ativa");db.add(j);await db.flush()
    return await montar_painel(db,j,usuario)

@router.patch("/{jornada_id}/config")
async def config_jornada(
    jornada_id:int,data:ConfigJornada,
    db:Annotated[AsyncSession,Depends(get_db)],
    usuario:Annotated[Envoxer,Depends(get_current_envoxer)]
):
    j=await _buscar(db,jornada_id,usuario)
    j.lembrete_ativo=data.lembrete_ativo;j.lembrete_dia=data.lembrete_dia
    await db.flush()
    return await montar_painel(db,j,usuario)

@router.post("/{jornada_id}/registros",status_code=201)
async def registrar_evidencia(
    jornada_id:int,data:NovoRegistro,
    db:Annotated[AsyncSession,Depends(get_db)],
    usuario:Annotated[Envoxer,Depends(get_current_envoxer)]
):
    j=await _buscar(db,jornada_id,usuario)
    if usuario.id!=j.envoxer_id:raise HTTPException(403,"Evidências são registradas pela própria pessoa")
    if j.status!="ativa":raise HTTPException(400,"Jornada encerrada")
    if not all(len(v.strip()) >= 5 for v in (data.situacao,data.impacto,data.proposta,data.resultado)):
        raise HTTPException(422,"Descreva os quatro campos com informações reais e objetivas")
    if data.acao_id:
        acao=(await db.execute(select(PdiAcao).where(PdiAcao.id==data.acao_id,PdiAcao.envoxer_id==j.envoxer_id))).scalar_one_or_none()
        if not acao:raise HTTPException(400,"Ação não pertence a esta jornada")
    r=PdiRegistro(jornada_id=j.id,autor_id=usuario.id,acao_id=data.acao_id,tipo="evidencia",
       situacao=data.situacao.strip(),impacto=data.impacto.strip(),proposta=data.proposta.strip(),
       resultado=data.resultado.strip(),status_validacao="pendente")
    db.add(r);await db.flush()
    return await montar_painel(db,j,usuario)

@router.patch("/{jornada_id}/registros/{registro_id}/validar")
async def validar_evidencia(
    jornada_id:int,registro_id:int,data:ValidacaoRegistro,
    db:Annotated[AsyncSession,Depends(get_db)],
    usuario:Annotated[Envoxer,Depends(get_current_envoxer)]
):
    j=await _buscar(db,jornada_id,usuario)
    if not _pode_validar(j,usuario):raise HTTPException(403,"Somente gestor responsável pode validar")
    r=(await db.execute(select(PdiRegistro).where(PdiRegistro.id==registro_id,PdiRegistro.jornada_id==j.id,PdiRegistro.tipo=="evidencia"))).scalar_one_or_none()
    if not r:raise HTTPException(404,"Registro não encontrado")
    if r.status_validacao!="pendente":raise HTTPException(409,"Registro já revisado; preserve o histórico")
    if len(data.feedback.strip()) < 5: raise HTTPException(422,"Feedback obrigatório")
    r.status_validacao=data.status;r.feedback_gestor=data.feedback.strip()
    r.validado_por_id=usuario.id;r.validado_em=datetime.now(timezone.utc)
    await db.flush()
    return await montar_painel(db,j,usuario)

@router.post("/{jornada_id}/marcos",status_code=201)
async def revisar_marco(
    jornada_id:int,data:NovoMarco,
    db:Annotated[AsyncSession,Depends(get_db)],
    usuario:Annotated[Envoxer,Depends(get_current_envoxer)]
):
    j=await _buscar(db,jornada_id,usuario)
    if not _pode_validar(j,usuario):raise HTTPException(403,"Somente gestor responsável pode registrar marcos")
    if j.status!="ativa":raise HTTPException(400,"Jornada encerrada")
    if datetime.now(TZ).date()<j.inicio+timedelta(days=data.marco_dia):
        raise HTTPException(400,"Marco ainda não chegou ao período de avaliação")
    if not all(len(v.strip()) >= 5 for v in (data.situacao,data.impacto,data.proposta,data.resultado)):
        raise HTTPException(422,"Registre fatos e combinados reais")
    other=(await db.execute(select(PdiRegistro).where(PdiRegistro.jornada_id==j.id,PdiRegistro.tipo=="marco",PdiRegistro.marco_dia==data.marco_dia))).first()
    if other:raise HTTPException(409,"Este marco já tem uma avaliação; preserve o histórico")
    r=PdiRegistro(jornada_id=j.id,autor_id=usuario.id,tipo="marco",marco_dia=data.marco_dia,
        situacao=data.situacao.strip(),impacto=data.impacto.strip(),proposta=data.proposta.strip(),
        resultado=data.resultado.strip(),avaliacao=data.avaliacao,status_validacao="validada",
        feedback_gestor=data.resultado.strip(),validado_por_id=usuario.id,validado_em=datetime.now(timezone.utc))
    db.add(r);await db.flush()
    return await montar_painel(db,j,usuario)
