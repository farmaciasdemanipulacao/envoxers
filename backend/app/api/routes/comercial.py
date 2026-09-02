from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.comercial import *
from app.services.comercial_ai import gerar_json, PROMPT_VERSION
import csv, io

router=APIRouter(prefix='/comercial',tags=['comercial'])

def d(obj):
    return {c.name:getattr(obj,c.name) for c in obj.__table__.columns}
async def lead_or_404(db,id):
    x=(await db.execute(select(ComercialLead).where(ComercialLead.id==id,ComercialLead.deleted_at.is_(None)))).scalar_one_or_none()
    if not x: raise HTTPException(404,'Lead não encontrado')
    return x
async def activity(db,lead,user,tipo,desc,dados=None): db.add(ComercialActivity(lead_id=lead,usuario_envoxer_id=user,tipo=tipo,descricao=desc,dados=dados))
async def contexto(db,lead):
    channels=[d(x) for x in (await db.execute(select(ComercialLeadChannel).where(ComercialLeadChannel.lead_id==lead.id,ComercialLeadChannel.ativo.is_(True)))).scalars()]
    sources=[d(x) for x in (await db.execute(select(ComercialAuditSource).where(ComercialAuditSource.lead_id==lead.id).order_by(ComercialAuditSource.consultado_em.desc()))).scalars()]
    insights=[d(x) for x in (await db.execute(select(ComercialInsight).where(ComercialInsight.lead_id==lead.id,ComercialInsight.ativo.is_(True)).order_by(ComercialInsight.created_at.desc()))).scalars()]
    messages=[d(x) for x in (await db.execute(select(ComercialMessage).where(ComercialMessage.lead_id==lead.id).order_by(ComercialMessage.enviado_em))).scalars()]
    contacts=[d(x) for x in (await db.execute(select(ComercialLeadContact).where(ComercialLeadContact.lead_id==lead.id))).scalars()]
    return {'lead':d(lead),'canais':channels,'fontes':sources,'ouros':insights,'mensagens':messages,'contatos':contacts}

@router.get('/stages')
async def stages(db:Annotated[AsyncSession,Depends(get_db)], _:Annotated[Envoxer,Depends(get_current_envoxer)]):
    return [d(x) for x in (await db.execute(select(ComercialPipelineStage).where(ComercialPipelineStage.ativo.is_(True)).order_by(ComercialPipelineStage.ordem))).scalars()]

@router.get('/dashboard')
async def dashboard(db:Annotated[AsyncSession,Depends(get_db)], _:Annotated[Envoxer,Depends(get_current_envoxer)]):
    leads=(await db.execute(select(ComercialLead).where(ComercialLead.deleted_at.is_(None)))).scalars().all(); ids=[x.id for x in leads]
    msgs=(await db.execute(select(ComercialMessage).where(ComercialMessage.lead_id.in_(ids)))).scalars().all() if ids else []
    sent=[m for m in msgs if m.direcao=='enviada']; recv=[m for m in msgs if m.direcao=='recebida']
    def n(status): return sum(1 for x in leads if x.status_codigo==status)
    return {'leads':len(leads),'novos':n('novo'),'analisados':sum(1 for x in leads if x.status_codigo not in ('novo','a_pesquisar','em_analise')),'mensagens_enviadas':len(sent),'respostas':len(recv),'taxa_resposta':round(len(recv)/len(sent)*100,1) if sent else 0,'conversas':n('em_conversa')+n('respondeu'),'reunioes':n('reuniao_agendada'),'propostas':n('proposta'),'ganhos':n('ganho'),'perdidos':n('perdido')}

@router.get('/hoje')
async def hoje(db:Annotated[AsyncSession,Depends(get_db)], user:Annotated[Envoxer,Depends(get_current_envoxer)]):
    now=datetime.now(timezone.utc)
    q=select(ComercialLead).where(ComercialLead.deleted_at.is_(None),ComercialLead.nao_prospectar.is_(False),or_(ComercialLead.proxima_acao_em<=now,ComercialLead.proxima_acao_em.is_(None))).order_by(ComercialLead.proxima_acao_em.asc().nullsfirst(),ComercialLead.score_total.desc())
    if user.permissao=='envoxer': q=q.where(or_(ComercialLead.responsavel_envoxer_id==user.id,ComercialLead.responsavel_envoxer_id.is_(None)))
    return [d(x) for x in (await db.execute(q)).scalars().all()]

@router.get('/leads')
async def listar(q:Optional[str]=None,status:Optional[str]=None,db:AsyncSession=Depends(get_db),_:Envoxer=Depends(get_current_envoxer)):
    st=select(ComercialLead).where(ComercialLead.deleted_at.is_(None))
    if status: st=st.where(ComercialLead.status_codigo==status)
    if q: st=st.where(or_(ComercialLead.nome_estabelecimento.ilike('%'+q+'%'),ComercialLead.segmento.ilike('%'+q+'%'),ComercialLead.cidade.ilike('%'+q+'%')))
    return [d(x) for x in (await db.execute(st.order_by(ComercialLead.updated_at.desc()))).scalars().all()]

@router.post('/leads',status_code=201)
async def criar(payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    channels=payload.pop('canais',{}) or {}; contact=payload.pop('contato',None)
    allowed={c.name for c in ComercialLead.__table__.columns}-{'id','created_at','updated_at','deleted_at'}
    lead=ComercialLead(**{k:v for k,v in payload.items() if k in allowed}); db.add(lead); await db.flush()
    for tipo,valor in channels.items():
        if valor: db.add(ComercialLeadChannel(lead_id=lead.id,tipo=tipo,valor=str(valor)))
    if contact and contact.get('nome'): db.add(ComercialLeadContact(lead_id=lead.id,principal=True,**{k:v for k,v in contact.items() if k in {'nome','cargo','telefone','whatsapp','email'}}))
    await activity(db,lead.id,user.id,'lead_criado','Lead criado'); await db.commit(); await db.refresh(lead); return d(lead)

@router.get('/leads/{lead_id}')
async def detalhe(lead_id:int,db:AsyncSession=Depends(get_db),_:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); ctx=await contexto(db,lead)
    audits=[d(x) for x in (await db.execute(select(ComercialAudit).where(ComercialAudit.lead_id==lead_id).order_by(ComercialAudit.created_at.desc()))).scalars()]
    acts=[d(x) for x in (await db.execute(select(ComercialActivity).where(ComercialActivity.lead_id==lead_id).order_by(ComercialActivity.created_at.desc()).limit(100))).scalars()]
    tasks=[d(x) for x in (await db.execute(select(ComercialTask).where(ComercialTask.lead_id==lead_id).order_by(ComercialTask.prazo))).scalars()]
    return {**ctx,'auditorias':audits,'historico':acts,'tarefas':tasks}

@router.patch('/leads/{lead_id}')
async def editar(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); before=lead.status_codigo
    allowed={c.name for c in ComercialLead.__table__.columns}-{'id','created_at','updated_at','deleted_at'}
    for k,v in payload.items():
        if k in allowed: setattr(lead,k,v)
    if before!=lead.status_codigo: await activity(db,lead.id,user.id,'status_alterado',f'Status: {before} → {lead.status_codigo}',{'antes':before,'depois':lead.status_codigo})
    await db.commit(); await db.refresh(lead); return d(lead)

@router.post('/leads/{lead_id}/fontes',status_code=201)
async def fonte(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    await lead_or_404(db,lead_id); x=ComercialAuditSource(lead_id=lead_id,tipo=payload.get('tipo','outro'),fonte=payload.get('fonte'),url=payload.get('url'),evidencia=payload.get('evidencia',''),consultado_em=datetime.now(timezone.utc)); db.add(x); await activity(db,lead_id,user.id,'fonte_adicionada',f"Fonte adicionada: {x.tipo}"); await db.commit(); await db.refresh(x); return d(x)

@router.post('/leads/{lead_id}/analisar')
async def analisar(lead_id:int,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); lead.status_codigo='em_analise'; await db.flush(); ctx=await contexto(db,lead)
    formato='{"resumo":"","tese_central":"","forcas":[],"vazamentos":[],"oportunidades":[],"ouros":[{"categoria":"","titulo":"","evidencia":"","impacto":"","fonte":"","grau_confianca":"alto|medio|baixo"}],"prioridade":"","risco_comercial":"","observacoes":[],"fit_score":0,"opportunity_score":0}'
    try: result,usage=await gerar_json('Audite o negócio usando somente o contexto fornecido. Não trate ausência de dado como problema observado.',ctx,formato)
    except RuntimeError as e: lead.status_codigo='a_pesquisar'; await db.commit(); raise HTTPException(503,str(e))
    a=ComercialAudit(lead_id=lead.id,executado_por_envoxer_id=user.id,resumo=result.get('resumo'),tese_central=result.get('tese_central'),forcas=result.get('forcas',[]),vazamentos=result.get('vazamentos',[]),oportunidades=result.get('oportunidades',[]),prioridade=result.get('prioridade'),risco_comercial=result.get('risco_comercial'),observacoes=result.get('observacoes',[]),modelo='openai'); db.add(a); await db.flush()
    for o in result.get('ouros',[]): db.add(ComercialInsight(lead_id=lead.id,audit_id=a.id,categoria=o.get('categoria','outro'),titulo=o.get('titulo','Ouro'),evidencia=o.get('evidencia',''),impacto=o.get('impacto',''),fonte=o.get('fonte'),grau_confianca=o.get('grau_confianca','medio')))
    lead.fit_score=max(0,min(100,int(result.get('fit_score',0) or 0))); lead.opportunity_score=max(0,min(100,int(result.get('opportunity_score',0) or 0))); lead.score_total=round((lead.fit_score+lead.opportunity_score+lead.engagement_score)/3); lead.status_codigo='pronto_abordagem'; lead.proxima_acao='Gerar primeira abordagem'; lead.proxima_acao_em=datetime.now(timezone.utc)
    db.add(ComercialAIGeneration(lead_id=lead.id,usuario_envoxer_id=user.id,tipo='auditoria',modelo='openai',prompt_version=PROMPT_VERSION,entrada=ctx,resultado=result,tokens_entrada=usage.get('input_tokens'),tokens_saida=usage.get('output_tokens'))); await activity(db,lead.id,user.id,'auditoria_ia','Auditoria por IA concluída'); await db.commit(); return result

@router.post('/leads/{lead_id}/gerar-mensagem')
async def gerar_mensagem(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id)
    ouro=(await db.execute(select(ComercialInsight).where(ComercialInsight.lead_id==lead_id,ComercialInsight.utilizado.is_(False),ComercialInsight.ativo.is_(True)).order_by(ComercialInsight.created_at))).scalars().first()
    if not ouro: raise HTTPException(409,'Não há ouro disponível. Adicione evidências ou rode nova auditoria.')
    ctx=await contexto(db,lead); ctx['ouro_escolhido']=d(ouro); ctx['canal']=payload.get('canal','instagram')
    result,usage=await gerar_json('Gere somente a próxima mensagem. Primeira abordagem deve buscar resposta e usar apenas um ouro.',ctx,'{"mensagem":"","gancho":"","evidencia":"","pepita":"","marcacao_valor":"","pergunta":""}')
    ouro.utilizado=True; ouro.utilizado_em=datetime.now(timezone.utc)
    db.add(ComercialAIGeneration(lead_id=lead.id,usuario_envoxer_id=user.id,tipo='mensagem',modelo='openai',prompt_version=PROMPT_VERSION,entrada=ctx,resultado=result,tokens_entrada=usage.get('input_tokens'),tokens_saida=usage.get('output_tokens'))); await activity(db,lead.id,user.id,'mensagem_gerada',f'Mensagem gerada com ouro: {ouro.titulo}',{'insight_id':ouro.id}); await db.commit(); result['insight_id']=ouro.id; return result

@router.post('/leads/{lead_id}/mensagens',status_code=201)
async def registrar_mensagem(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); direcao=payload.get('direcao','enviada'); before=lead.status_codigo
    if direcao=='recebida': lead.status_codigo='respondeu'; lead.engagement_score=min(100,lead.engagement_score+25); lead.temperatura='quente' if lead.engagement_score>=60 else 'morno'; lead.proxima_acao='Responder lead'; lead.proxima_acao_em=datetime.now(timezone.utc); await db.execute(ComercialLeadCadence.__table__.update().where(ComercialLeadCadence.lead_id==lead_id,ComercialLeadCadence.status=='ativa').values(status='pausada',pausada_em=datetime.now(timezone.utc)))
    else: lead.status_codigo='mensagem_1_enviada' if before in ('novo','a_pesquisar','em_analise','analise_concluida','pronto_abordagem') else before; lead.proxima_acao='Follow-up com nova pepita'; lead.proxima_acao_em=datetime.now(timezone.utc)+timedelta(days=2)
    lead.ultimo_contato_em=datetime.now(timezone.utc); lead.score_total=round((lead.fit_score+lead.opportunity_score+lead.engagement_score)/3)
    m=ComercialMessage(lead_id=lead_id,direcao=direcao,canal=payload.get('canal','instagram'),tipo=payload.get('tipo','abordagem' if direcao=='enviada' else 'resposta'),conteudo=payload.get('conteudo',''),responsavel_envoxer_id=user.id,insight_id=payload.get('insight_id'),status_antes=before,status_depois=lead.status_codigo,enviado_em=datetime.now(timezone.utc)); db.add(m); await activity(db,lead_id,user.id,'mensagem_'+direcao,f'Mensagem {direcao} registrada',{'canal':m.canal}); await db.commit(); await db.refresh(m); return d(m)

@router.post('/leads/{lead_id}/gerar-resposta')
async def gerar_resposta(lead_id:int,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); ctx=await contexto(db,lead)
    result,usage=await gerar_json('Interprete a resposta mais recente e gere SOMENTE a próxima mensagem. Use novo ouro apenas se fizer sentido. Nunca discuta.',ctx,'{"interpretacao":{"tipo":"","sentimento":"","intencao":"","objecao":"","proximo_passo":""},"mensagem":"","insight_id":null}')
    iid=result.get('insight_id');
    if iid:
        ouro=(await db.execute(select(ComercialInsight).where(ComercialInsight.id==iid,ComercialInsight.lead_id==lead_id,ComercialInsight.utilizado.is_(False)))).scalar_one_or_none()
        if ouro: ouro.utilizado=True; ouro.utilizado_em=datetime.now(timezone.utc)
    db.add(ComercialAIGeneration(lead_id=lead.id,usuario_envoxer_id=user.id,tipo='proxima_resposta',modelo='openai',prompt_version=PROMPT_VERSION,entrada=ctx,resultado=result,tokens_entrada=usage.get('input_tokens'),tokens_saida=usage.get('output_tokens'))); await db.commit(); return result

@router.post('/leads/{lead_id}/cadencia')
async def iniciar_cadencia(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id)
    if lead.nao_prospectar: raise HTTPException(409,'Lead está na lista de não prospectar')
    x=ComercialLeadCadence(lead_id=lead_id,cadence_id=int(payload.get('cadence_id',1)),status='ativa',iniciada_em=datetime.now(timezone.utc),proximo_step_ordem=1); db.add(x); lead.proxima_acao='Enviar mensagem inicial'; lead.proxima_acao_em=datetime.now(timezone.utc); await activity(db,lead_id,user.id,'cadencia_iniciada','Cadência comercial iniciada'); await db.commit(); return {'ok':True}

@router.post('/leads/{lead_id}/nao-prospectar')
async def nao_prospectar(lead_id:int,payload:dict,db:AsyncSession=Depends(get_db),user:Envoxer=Depends(get_current_envoxer)):
    lead=await lead_or_404(db,lead_id); lead.nao_prospectar=True; lead.status_codigo='nao_prospectar'; lead.proxima_acao=None; lead.proxima_acao_em=None
    for tipo,valor in [('email',lead.email),('whatsapp',lead.whatsapp),('telefone',lead.telefone)]:
        if valor: db.add(ComercialSuppression(lead_id=lead_id,tipo=tipo,valor=valor,motivo=payload.get('motivo','Pedido para não contatar'),created_by_envoxer_id=user.id))
    await db.execute(ComercialLeadCadence.__table__.update().where(ComercialLeadCadence.lead_id==lead_id,ComercialLeadCadence.status=='ativa').values(status='encerrada',pausada_em=datetime.now(timezone.utc))); await activity(db,lead_id,user.id,'nao_prospectar','Lead marcado como NÃO PROSPECTAR'); await db.commit(); return {'ok':True}

@router.post('/importar/preview')
async def importar_preview(arquivo:UploadFile=File(...),_:Envoxer=Depends(get_current_envoxer)):
    raw=await arquivo.read(); name=(arquivo.filename or '').lower()
    if name.endswith('.csv'):
        text=raw.decode('utf-8-sig',errors='replace'); rows=list(csv.DictReader(io.StringIO(text)))
    else: raise HTTPException(400,'Neste primeiro deploy, use CSV. XLSX será habilitado na próxima evolução do importador.')
    aliases={'data':'data_entrada','nome':'nome_estabelecimento','segmento':'segmento','instagram':'instagram','telefone':'telefone','email':'email','site':'site'}
    cols=list(rows[0].keys()) if rows else []; mapping={c:aliases.get(c.strip().lower()) for c in cols}
    return {'colunas':cols,'mapeamento_sugerido':mapping,'preview':rows[:20],'total':len(rows)}
