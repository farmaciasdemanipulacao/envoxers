// Desenvolvimento & Pessoas v2 — experiência visual unificada com o PDI.
// APIs e regras de negócio permanecem as do F4 original.
const F4H = React;
const F4TYPE = {"360":"Feedback 360°","180":"Avaliação 180°",clima:"Clima Organizacional"};
const F4ACCENT = {"360":"#b7a5ff","180":"#9ce8e2","1a1":"#f8d596",clima:"#b4e4f8",ciclos:"#d8c6ff"};
const F4DAY = value => value ? new Date(value.slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR") : "—";
const F4PERCENT = (a,b) => b > 0 ? Math.min(100,Math.max(0,Math.round(100*a/b))) : 0;
function F4Banner({kicker,title,subtitle,icon,aside,kind="360"}) {
 return <section className={"f4-hero f4-hero-"+kind}>
  <div className="f4-hero-icon" aria-hidden="true">{icon}</div>
  <div className="f4-hero-text"><span className="f4-hero-kicker">{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div>
  {aside && <div className="f4-hero-aside">{aside}</div>}
 </section>;
}
function F4Stat({icon,number,label,sub}) {
 return <div className="f4-stat"><div className="f4-stat-icon">{icon}</div><div className="f4-stat-number">{number}</div><div className="f4-stat-label">{label}</div>{sub&&<small>{sub}</small>}</div>;
}
function F4Status({value}) {
 return <span className={"f4-status f4-status-"+(value||"rascunho")}>{({rascunho:"Rascunho",aberto:"Aberto",encerrado:"Encerrado",pendente:"Pendente",enviada:"Enviada"})[value]||value}</span>;
}
function F4Bar({value,max=100,accent}) {
 return <div className="f4-meter" role="progressbar" aria-valuemin="0" aria-valuemax={max} aria-valuenow={Number(value)||0}>
  <span style={{width:(max>0?Math.min(100,Math.max(0,100*(Number(value)||0)/max)):0)+"%",background:accent||"var(--pdi-purple)"}}/>
 </div>;
}
function F4Empty({icon,title,detail,action}) {
 return <div className="f4-empty"><div className="f4-empty-icon">{icon}</div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
function F4Segment({items,value,onChange}) {
 return <div className="f4-tabs" role="tablist" aria-label="Visualização">
  {items.map(it=><button key={it.id} role="tab" aria-selected={value===it.id} className={"f4-tab"+(value===it.id?" is-active":"")} onClick={()=>onChange(it.id)}>{it.icon&&<span aria-hidden="true">{it.icon}</span>}{it.label}{it.count!=null&&<b>{it.count}</b>}</button>)}
 </div>;
}
function F4CyclePicker({ciclos,cicloId,onChange}) {
 if(!ciclos.length)return <F4Empty icon="🗓" title="Ainda não existe ciclo" detail="O administrador precisa criar e abrir um ciclo para que as avaliações possam começar."/>;
 const atual=ciclos.find(c=>c.id===cicloId);
 return <div className="f4-cycle-picker"><div className="f4-cycle-title"><span className="f4-mini-label">CICLO SELECIONADO</span><div><strong>{atual?.nome||"Selecione um ciclo"}</strong> {atual&&<F4Status value={atual.status}/>}</div><small>{atual?F4DAY(atual.data_inicio)+" até "+F4DAY(atual.data_fim):"Escolha um ciclo"}</small></div>
  <label className="f4-cycle-select"><span>Alternar ciclo</span><select value={cicloId||""} onChange={e=>onChange(Number(e.target.value))}>{ciclos.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.status}</option>)}</select></label>
 </div>;
}
function F4ChoiceScale({value,onChange,label="Escolha uma nota",start=1,end=5}) {
 return <div className="f4-choice-scale" role="group" aria-label={label}>
  {Array.from({length:end-start+1},(_,i)=>i+start).map(n=><button type="button" key={n} aria-label={label+": "+n} aria-pressed={Number(value)===n} className={"f4-choice"+(Number(value)===n?" selected":"")} onClick={()=>onChange(n)}>{n}</button>)}
 </div>;
}
function F4MetricBar({title,value,max=5,sub}) {
 return <div className="f4-metric-row"><div className="f4-metric-heading"><strong>{title}</strong><span>{value!=null ? Number(value).toFixed(1)+" / "+max : "Sem respostas"}</span></div><F4Bar value={value||0} max={max}/>{sub&&<small>{sub}</small>}</div>;
}
function F4Panel({title,eyebrow,action,children}) {
 return <section className="f4-panel"><div className="f4-panel-head"><div>{eyebrow&&<div className="f4-mini-label">{eyebrow}</div>}{title&&<h3>{title}</h3>}</div>{action}</div>{children}</section>;
}
function F4Modal({title,kicker,children,onClose}) {
 return <div className="modal-overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
 <div className="modal modal-form-single f4-modal" role="dialog" aria-modal="true" aria-label={title}>
  <div className="modal-head"><div><div className="f4-mini-label">{kicker||"DESENVOLVIMENTO & PESSOAS"}</div><h2 className="modal-title">{title}</h2></div><button className="modal-close" aria-label="Fechar" onClick={onClose}>×</button></div>
  <div className="modal-body"><div className="modal-main">{children}</div></div>
 </div></div>;
}
function F4SelectPerson({value,onChange,pessoas,meId}) {
 return <label className="f4-person-select"><span>Visualizar resultado de</span><select value={value} onChange={e=>onChange(Number(e.target.value))}>{pessoas.map(p=><option key={p.id} value={p.id}>{p.nome}{p.id===meId?" (você)":""}</option>)}</select></label>;
}
function F4Result360({cicloId,alvoId}) {
 const [data,setData]=F4H.useState(null),[loading,setLoading]=F4H.useState(true),[erro,setErro]=F4H.useState("");
 F4H.useEffect(()=>{let alive=true;setLoading(true);setErro("");setData(null);
  if(!cicloId||!alvoId){setLoading(false);return;}
  EnvoxersAPI.api("/360/resultado/"+alvoId+"?ciclo_id="+cicloId).then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setErro(e.message)}).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[cicloId,alvoId]);
 if(loading)return <div className="f4-loading">Carregando resultado…</div>;
 if(erro)return <div className="f4-feedback-error">{erro}</div>;
 if(!data)return null;
 const total=data.total_avaliacoes||0,done=data.respondidas||0;
 return <div className="f4-grid-result">
  <F4Panel title="Visão de competências" eyebrow="LEITURA DOS RESULTADOS" action={<span className="f4-subtle">{done}/{total} avaliações respondidas</span>}>
   <div className="f4-result-intro"><strong>{data.avaliado_nome}</strong><p>Os resultados consideram apenas avaliações recebidas neste ciclo.</p></div>
   {data.por_competencia?.length?data.por_competencia.map(x=><F4MetricBar key={x.competencia_id} title={x.competencia_nome} value={x.media} sub={(x.quantidade_notas||0)+" nota(s) recebidas"}/>):<F4Empty icon="📊" title="Sem indicadores" detail="O ciclo ainda não tem competências configuradas."/>}
  </F4Panel>
  <F4Panel title="Feedbacks recebidos" eyebrow="APRENDIZADOS">
   <div className="f4-score-summary"><div><b>{F4PERCENT(done,total)}%</b><span>Retorno das avaliações</span></div><F4Bar value={done} max={total||1}/></div>
   {(data.comentarios||[]).length?<div className="f4-quote-stack">{data.comentarios.map((t,i)=><div className="f4-quote" key={i}>“{t}”</div>)}</div>:<F4Empty icon="💬" title="Ainda sem comentários" detail="Os comentários serão exibidos aqui quando forem enviados."/>}
  </F4Panel>
 </div>;
}
function F4Form360({av,competencias,onDone}) {
 const [notas,setNotas]=F4H.useState({}),[comentario,setComentario]=F4H.useState(""),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const total=competencias.length,done=Object.keys(notas).filter(k=>notas[k]>=1&&notas[k]<=5).length;
 const submit=async()=>{
  if(!total ||done!==total){toast("Avalie todas as competências antes de enviar.","error");return;}
  setSaving(true);try{
   await EnvoxersAPI.api("/360/avaliacoes/"+av.id+"/responder",{method:"POST",body:JSON.stringify({respostas:notas,comentario:comentario||null})});
   toast("Feedback 360° enviado com sucesso!","success");onDone();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 return <F4Panel eyebrow={av.avaliador_id===av.avaliado_id?"AUTOAVALIAÇÃO":"AVALIAÇÃO DE COMPETÊNCIAS"} title={av.avaliado_nome} action={<span className="f4-counter">{done}/{total} respostas</span>}>
  <p className="f4-form-hint">Escolha de 1 a 5 em cada competência. Use comportamentos observados como referência.</p><F4Bar value={done} max={total||1}/>
  <div className="f4-questions">{competencias.map((c,i)=><div className="f4-question" key={c.id}><div className="f4-question-title"><span className="f4-question-index">{String(i+1).padStart(2,"0")}</span><div><strong>{c.nome}</strong>{c.descricao&&<small>{c.descricao}</small>}</div></div>
   <F4ChoiceScale value={notas[c.id]} onChange={v=>setNotas(x=>({...x,[c.id]:v}))} label={"Nota para "+c.nome}/></div>)}</div>
  <label className="f4-field"><span>Comentário complementar <small>(opcional)</small></span><textarea value={comentario} onChange={e=>setComentario(e.target.value)} rows="3" placeholder="O que deve continuar? O que pode evoluir?"/></label>
  <div className="f4-form-footer"><span>Respostas salvas apenas ao enviar</span><button className="btn btn-sm btn-primary" disabled={saving||done!==total||!total} onClick={submit}>{saving?"Enviando…":"Enviar avaliação →"}</button></div>
 </F4Panel>;
}
function F4Premium360({permissao,envoxerId}) {
 const {ciclos,cicloId,setCicloId}=useCiclos("360"),[aba,setAba]=F4H.useState("responder"),[pendentes,setPendentes]=F4H.useState([]),
 [competencias,setCompetencias]=F4H.useState([]),[equipe,setEquipe]=F4H.useState([]),[alvo,setAlvo]=F4H.useState(envoxerId),
 [loading,setLoading]=F4H.useState(false);
 const toast=EnvoxersShared.useToast(),isAdmin=permissao==="admin",isLeader=isAdmin||permissao==="gestor";
 F4H.useEffect(()=>{EnvoxersAPI.api("/360/competencias").then(setCompetencias).catch(e=>toast(e.message,"error"))},[]);
 F4H.useEffect(()=>{if(isLeader)EnvoxersAPI.api("/envoxers").then(d=>setEquipe(d.filter(x=>x.ativo))).catch(()=>{})},[isLeader]);
 const refresh=()=>{if(!cicloId){setPendentes([]);return;}setLoading(true);EnvoxersAPI.api("/360/minhas-pendentes?ciclo_id="+cicloId).then(setPendentes).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false));};
 F4H.useEffect(()=>{refresh()},[cicloId]);
 const ciclo=ciclos.find(x=>x.id===cicloId);
 return <div className="f4-upgrade">
  <F4Banner kind="360" icon="✦" kicker="ESCUTA EM TODAS AS DIREÇÕES" title="Feedback 360°" subtitle="Uma visão plural do desenvolvimento, com competências claras e feedback construtivo." aside={<div className="f4-hero-big">{pendentes.length}<small>avaliações pendentes</small></div>}/>
  <div className="f4-stat-grid"><F4Stat icon="◎" number={ciclos.length} label="Ciclos cadastrados"/><F4Stat icon="✎" number={pendentes.length} label="Respostas pendentes"/><F4Stat icon="◈" number={competencias.length} label="Competências ativas"/></div>
  <F4CyclePicker ciclos={ciclos} cicloId={cicloId} onChange={setCicloId}/>
  {ciclo&&<><F4Segment value={aba} onChange={setAba} items={[{id:"responder",icon:"✍",label:"Responder",count:pendentes.length},{id:"resultado",icon:"◔",label:"Resultados"}]}/>
   {aba==="responder"&&(loading?<div className="f4-loading">Carregando avaliações…</div>:
    pendentes.length?<div className="f4-form-stack">{pendentes.map(p=><F4Form360 key={p.id} av={p} competencias={competencias} onDone={refresh}/>)}</div>:
    <F4Empty icon="✨" title="Tudo em dia por aqui" detail={ciclo.status==="aberto"?"Você não tem avaliações 360° pendentes neste ciclo.":"Este ciclo não tem avaliações pendentes para você."}/>)}
   {aba==="resultado"&&<>{isLeader&&<F4SelectPerson value={alvo} onChange={setAlvo} pessoas={equipe.length?equipe:[{id:envoxerId,nome:"Eu"}]} meId={envoxerId}/>}<F4Result360 cicloId={cicloId} alvoId={alvo}/></>}
  </>}
  {isAdmin&&<F4Panel title="Catálogo de competências" eyebrow="ADMINISTRAÇÃO DO 360°"><p className="f4-form-hint">Atualize as competências utilizadas nos próximos ciclos sem alterar o histórico das respostas.</p><CompetenciasAdmin/></F4Panel>}
 </div>;
}

function F4Form180({av,onDone}) {
 const [nota,setNota]=F4H.useState(""),[fortes,setFortes]=F4H.useState(""),[melhorias,setMelhorias]=F4H.useState(""),
 [comentario,setComentario]=F4H.useState(""),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const send=async()=>{
  setSaving(true);try{
   await EnvoxersAPI.api("/180/avaliacoes/"+av.id+"/responder",{method:"POST",body:JSON.stringify({
    nota_geral:nota?Number(nota):null,pontos_fortes:fortes||null,pontos_melhoria:melhorias||null,comentario:comentario||null
   })});
   toast("Avaliação 180° enviada!","success");onDone();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 const preenchido=[nota,fortes,melhorias,comentario].filter(x=>String(x).trim()).length;
 return <F4Panel title={av.avaliado_nome} eyebrow={av.direcao==="gestor_para_liderado"?"VISÃO DA LIDERANÇA":"VISÃO DA EQUIPE"} action={<span className="f4-counter">{preenchido}/4 campos preenchidos</span>}>
 <div className="f4-relationship"><span className="f4-relationship-symbol">⇄</span><div><strong>Avaliação em duas vias</strong><small>O objetivo é construir uma conversa útil entre liderança e colaborador.</small></div></div>
 <div className="f4-question"><div className="f4-question-title"><span className="f4-question-index">01</span><div><strong>Como você avalia a atuação geral?</strong><small>Selecione uma nota de 1 a 5 (opcional).</small></div></div><F4ChoiceScale value={nota} onChange={setNota} label="Nota geral"/></div>
 <div className="f4-form-double"><label className="f4-field"><span>✦ O que essa pessoa faz bem?</span><textarea rows="4" value={fortes} onChange={e=>setFortes(e.target.value)} placeholder="Cite forças e exemplos observados…"/></label>
 <label className="f4-field"><span>↗ O que poderia melhorar?</span><textarea rows="4" value={melhorias} onChange={e=>setMelhorias(e.target.value)} placeholder="Sugira melhorias concretas e respeitosas…"/></label></div>
 <label className="f4-field"><span>Mensagem adicional <small>(opcional)</small></span><textarea rows="3" value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Que orientação ou contexto ajudaria na próxima etapa?"/></label>
 <div className="f4-form-footer"><span>Seu feedback deve ser construtivo e baseado em fatos.</span><button className="btn btn-sm btn-primary" disabled={saving} onClick={send}>{saving?"Enviando…":"Enviar feedback →"}</button></div>
 </F4Panel>;
}
function F4Premium180({permissao,envoxerId}) {
 const {ciclos,cicloId,setCicloId}=useCiclos("180"),[aba,setAba]=F4H.useState("responder"),[pendentes,setPendentes]=F4H.useState([]),
 [recebidas,setRecebidas]=F4H.useState([]),[equipe,setEquipe]=F4H.useState([]),[alvo,setAlvo]=F4H.useState(envoxerId),
 [loading,setLoading]=F4H.useState(false);
 const toast=EnvoxersShared.useToast(),isLeader=permissao==="admin"||permissao==="gestor";
 F4H.useEffect(()=>{if(isLeader)EnvoxersAPI.api("/envoxers").then(d=>setEquipe(d.filter(x=>x.ativo))).catch(()=>{})},[isLeader]);
 const reload=()=>{if(!cicloId){setPendentes([]);return;}setLoading(true);EnvoxersAPI.api("/180/minhas-pendentes?ciclo_id="+cicloId).then(setPendentes).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false))};
 F4H.useEffect(()=>{reload()},[cicloId]);
 F4H.useEffect(()=>{if(!cicloId||aba!=="recebidas")return;let alive=true;setRecebidas([]);EnvoxersAPI.api("/180/recebidas/"+alvo+"?ciclo_id="+cicloId).then(d=>{if(alive)setRecebidas(d)}).catch(e=>toast(e.message,"error"));return()=>{alive=false}},[cicloId,alvo,aba]);
 const ciclo=ciclos.find(x=>x.id===cicloId);
 return <div className="f4-upgrade">
  <F4Banner kind="180" icon="⇄" kicker="DIÁLOGO DE MÃO DUPLA" title="Avaliação 180°" subtitle="Liderança e equipe aprendem uma com a outra. Feedback com exemplos, forças e caminhos de melhoria." aside={<div className="f4-hero-big">{pendentes.length}<small>conversas para responder</small></div>}/>
  <div className="f4-stat-grid"><F4Stat icon="⇆" number="2 vias" label="Gestor e colaborador"/><F4Stat icon="✎" number={pendentes.length} label="Avaliações pendentes"/><F4Stat icon="♡" number="1:1" label="Diálogo em desenvolvimento"/></div>
  <F4CyclePicker ciclos={ciclos} cicloId={cicloId} onChange={setCicloId}/>
  {ciclo&&<><F4Segment value={aba} onChange={setAba} items={[{id:"responder",icon:"✍",label:"Responder",count:pendentes.length},{id:"recebidas",icon:"◈",label:"Feedbacks recebidos"}]}/>
   {aba==="responder"&&(loading?<div className="f4-loading">Carregando avaliações…</div>:pendentes.length?<div className="f4-form-stack">{pendentes.map(av=><F4Form180 key={av.id} av={av} onDone={reload}/>)}</div>:
    <F4Empty icon="🤝" title="Sem avaliações pendentes" detail="Você já respondeu tudo que estava disponível neste ciclo. Seu próximo aprendizado pode vir da conversa 1:1."/>)}
   {aba==="recebidas"&&<>{isLeader&&<F4SelectPerson value={alvo} onChange={setAlvo} pessoas={equipe.length?equipe:[{id:envoxerId,nome:"Eu"}]} meId={envoxerId}/>}
    <div className="f4-review-grid">{recebidas.length?recebidas.map((r)=><F4Panel key={r.id} eyebrow={r.direcao==="gestor_para_liderado"?"PERSPECTIVA DA LIDERANÇA":"PERSPECTIVA DA EQUIPE"} title={r.avaliador_nome} action={r.nota_geral?<span className="f4-rating">★ {r.nota_geral}/5</span>:null}>
     <div className="f4-summary-field"><span>Pontos fortes</span><p>{r.pontos_fortes||"Não informado"}</p></div>
     <div className="f4-summary-field"><span>Oportunidades de melhoria</span><p>{r.pontos_melhoria||"Não informado"}</p></div>
     {r.comentario&&<div className="f4-quote">“{r.comentario}”</div>}</F4Panel>):<F4Empty icon="💬" title="Nenhum retorno neste ciclo" detail="Quando as avaliações forem enviadas, os feedbacks aparecerão aqui."/>}</div>
   </>}
  </>}
 </div>;
}
function F4OneToOneModal({registro,equipe,meId,onClose,onDone}) {
 const edit=!!registro,now=new Date().toLocaleDateString("sv-SE");
 const [liderado,setLiderado]=F4H.useState(registro?.liderado_id||""),[data,setData]=F4H.useState(registro?.data||now),
 [proximo,setProximo]=F4H.useState(registro?.proximo_sugerido||""),[pauta,setPauta]=F4H.useState(registro?.pauta||""),
 [combinados,setCombinados]=F4H.useState(registro?.combinados||""),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const save=async()=>{
  if(!edit&&!liderado){toast("Selecione uma pessoa da equipe.","error");return}
  if(!data){toast("Informe a data da conversa.","error");return}
  setSaving(true);try{
   const payload={data,pauta:pauta||null,combinados:combinados||null,proximo_sugerido:proximo||null};
   await EnvoxersAPI.api(edit?"/1a1/"+registro.id:"/1a1",{
    method:edit?"PATCH":"POST",body:JSON.stringify(edit?payload:{...payload,liderado_id:Number(liderado),gestor_id:meId})
   });
   toast("Conversa salva com sucesso!","success");onDone();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 return <F4Modal title={edit?"Editar conversa 1:1":"Nova conversa 1:1"} kicker="UM ENCONTRO COM PROPÓSITO" onClose={onClose}>
  <p className="f4-form-hint">Registre as principais observações e transforme a conversa em combinados que possam ser acompanhados.</p>
  {!edit&&<label className="f4-field"><span>Pessoa da equipe *</span><select value={liderado} onChange={e=>setLiderado(e.target.value)}><option value="">Selecione uma pessoa</option>{equipe.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}
  <div className="f4-form-double">
   <label className="f4-field"><span>Data da conversa *</span><input type="date" value={data} onChange={e=>setData(e.target.value)}/></label>
   <label className="f4-field"><span>Próximo encontro previsto</span><input type="date" min={data||undefined} value={proximo} onChange={e=>setProximo(e.target.value)}/></label>
  </div>
  <label className="f4-field"><span>01 · Pauta e contexto</span><textarea rows="4" value={pauta} onChange={e=>setPauta(e.target.value)} placeholder="O que funcionou? O que gerou dificuldade? O que merece reconhecimento?"/></label>
  <label className="f4-field"><span>02 · Combinados e responsabilidades</span><textarea rows="4" value={combinados} onChange={e=>setCombinados(e.target.value)} placeholder="O que ficou acordado, quem faz e para quando?"/></label>
  <div className="f4-form-footer"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving?"Salvando…":edit?"Salvar alterações":"Registrar conversa →"}</button></div>
 </F4Modal>;
}
function F4OneToOneCard({registro,userId,canEdit,onChange}) {
 const [expanded,setExpanded]=F4H.useState(false),[editing,setEditing]=F4H.useState(false),[comment,setComment]=F4H.useState(registro.comentario_liderado||""),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const isOwner=registro.liderado_id===userId;
 const submit=async()=>{
  setSaving(true);try{await EnvoxersAPI.api("/1a1/"+registro.id+"/comentario-liderado",{method:"POST",body:JSON.stringify({comentario_liderado:comment})});toast("Comentário registrado!","success");onChange()}catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 const isUpcoming=registro.proximo_sugerido&&registro.proximo_sugerido>=new Date().toLocaleDateString("sv-SE");
 return <article className="f4-meeting-card">
   <div className="f4-meeting-header"><div className="f4-meeting-date"><strong>{F4DAY(registro.data).slice(0,2)}</strong><small>{F4DAY(registro.data).slice(3,10)}</small></div>
   <div className="f4-meeting-participants"><span className="f4-mini-label">CONVERSA REGISTRADA</span><h3>{registro.gestor_nome} <span>↔</span> {registro.liderado_nome}</h3>
    <small>Próxima conversa: {registro.proximo_sugerido?F4DAY(registro.proximo_sugerido):"não agendada"}</small></div>
   <span className={"f4-meeting-chip"+(isUpcoming?" is-upcoming":"")}>{isUpcoming?"Agendada":"Histórico"}</span>
   </div>
   <div className="f4-meeting-teaser">{registro.combinados?"Combinados: "+registro.combinados:registro.pauta?"Pauta: "+registro.pauta:"Clique para visualizar os detalhes deste encontro."}</div>
   <div className="f4-meeting-actions"><button className="btn btn-sm" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"Ocultar detalhes":"Ver conversa"} {expanded?"↑":"↓"}</button>{canEdit&&<button className="btn btn-sm" onClick={()=>setEditing(true)}>Editar conversa</button>}</div>
   {expanded&&<div className="f4-meeting-details">
    <div><span>Pauta</span><p>{registro.pauta||"Sem pauta registrada."}</p></div>
    <div><span>Combinados</span><p>{registro.combinados||"Sem combinados registrados."}</p></div>
    {registro.comentario_liderado&&<div className="f4-quote">“{registro.comentario_liderado}”</div>}
    {isOwner&&<label className="f4-field"><span>Minha devolutiva sobre a conversa</span><textarea rows="3" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Qual seu ponto de vista?"/><button className="btn btn-sm btn-primary" disabled={saving||!comment.trim()} onClick={submit}>{saving?"Salvando…":"Registrar minha devolutiva"}</button></label>}
   </div>}
   {editing&&<F4OneToOneModal registro={registro} equipe={[]} meId={registro.gestor_id} onClose={()=>setEditing(false)} onDone={()=>{setEditing(false);onChange()}}/>}
 </article>;
}
function F4Premium1a1({permissao,envoxerId}) {
 const [registros,setRegistros]=F4H.useState([]),[loading,setLoading]=F4H.useState(true),[criando,setCriando]=F4H.useState(false),[equipe,setEquipe]=F4H.useState([]),
 [filtro,setFiltro]=F4H.useState("todos");
 const toast=EnvoxersShared.useToast(),isLeader=permissao==="admin"||permissao==="gestor";
 const load=()=>{setLoading(true);EnvoxersAPI.api("/1a1").then(setRegistros).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false))};
 F4H.useEffect(()=>{load()},[]);
 F4H.useEffect(()=>{if(isLeader)EnvoxersAPI.api("/envoxers").then(d=>setEquipe(d.filter(x=>x.ativo&&x.id!==envoxerId))).catch(()=>{})},[isLeader]);
 const today=new Date().toLocaleDateString("sv-SE");
 const upcoming=registros.filter(x=>x.proximo_sugerido&&x.proximo_sugerido>=today).length;
 const missing=registros.filter(x=>!x.combinados).length;
 const records=registros.filter(x=>filtro==="todos"|| (filtro==="meus"&&(x.gestor_id===envoxerId||x.liderado_id===envoxerId)) ||(filtro==="pendentes"&&(!x.combinados||!x.proximo_sugerido)));
 return <div className="f4-upgrade">
  <F4Banner kind="1a1" icon="♡" kicker="CONVERSAS QUE MOVEM PESSOAS" title="Feedback 1:1" subtitle="Encontros com contexto, acordos claros e uma próxima conversa no horizonte." aside={<div className="f4-hero-big">{registros.length}<small>conversas registradas</small></div>}/>
  <div className="f4-stat-grid"><F4Stat icon="◷" number={upcoming} label="Próximos encontros previstos"/><F4Stat icon="✓" number={registros.length-missing} label="Com combinados registrados"/><F4Stat icon="✍" number={registros.length} label="Conversas no histórico"/></div>
  <div className="f4-toolbar"><F4Segment value={filtro} onChange={setFiltro} items={[{id:"todos",label:"Todos"},{id:"meus",label:"Minhas conversas"},{id:"pendentes",label:"Sem combinados ou data"}]}/>{isLeader&&<button className="btn btn-sm btn-primary" onClick={()=>setCriando(true)}>+ Nova conversa</button>}</div>
  {loading?<div className="f4-loading">Carregando conversas…</div>:records.length?<div className="f4-meeting-grid">{records.map(r=><F4OneToOneCard key={r.id} registro={r} userId={envoxerId} canEdit={permissao==="admin"||r.gestor_id===envoxerId} onChange={load}/>)}</div>:
   <F4Empty icon="💬" title="Nenhuma conversa neste filtro" detail="Registre seu primeiro encontro e acompanhe os combinados em uma linha do tempo." action={isLeader?<button className="btn btn-sm btn-primary" onClick={()=>setCriando(true)}>Registrar conversa</button>:null}/>}
  {criando&&<F4OneToOneModal meId={envoxerId} equipe={equipe} onClose={()=>setCriando(false)} onDone={()=>{setCriando(false);load()}}/>}
 </div>;
}

function F4ClimaSurvey({ciclo,onSubmitted}) {
 const [questions,setQuestions]=F4H.useState([]),[mine,setMine]=F4H.useState(null),[answers,setAnswers]=F4H.useState({}),
 [index,setIndex]=F4H.useState(0),[saving,setSaving]=F4H.useState(false),[loading,setLoading]=F4H.useState(true);
 const toast=EnvoxersShared.useToast();
 F4H.useEffect(()=>{let alive=true;setLoading(true);setIndex(0);
  Promise.all([EnvoxersAPI.api("/clima/perguntas?ciclo_id="+ciclo.id),EnvoxersAPI.api("/clima/minha?ciclo_id="+ciclo.id)])
  .then(([q,m])=>{if(alive){setQuestions(q);setMine(m);setAnswers(m.respostas||{})}})
  .catch(e=>toast(e.message,"error")).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[ciclo.id]);
 const question=questions[index],total=questions.length,answered=questions.filter(q=>String(answers[q.id]??"").trim().length>0).length;
 const completed=answered===total&&total>0;
 const send=async()=>{
  if(!completed){toast("Responda todas as perguntas antes de finalizar.","error");return}
  setSaving(true);try{
   await EnvoxersAPI.api("/clima/responder?ciclo_id="+ciclo.id,{method:"POST",body:JSON.stringify({respostas:answers})});
   toast("Pesquisa enviada com sucesso. Obrigado pela participação!","success");onSubmitted();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 if(loading)return <div className="f4-loading">Carregando pesquisa…</div>;
 if(!total)return <F4Empty icon="✎" title="Pesquisa sem perguntas" detail="O administrador precisa cadastrar perguntas antes de abrir o ciclo de Clima." />;
 return <div className="f4-survey-layout">
  <F4Panel eyebrow="UMA PERGUNTA POR VEZ" title={mine?.respondido?"Revisar minhas respostas":"Como você percebe nossa rotina?"}>
   <div className="f4-survey-head"><span>Pergunta {index+1} de {total}</span><strong>{F4PERCENT(answered,total)}% respondido</strong></div>
   <F4Bar value={answered} max={total}/>
   {mine?.respondido&&<div className="f4-feedback-positive">Você já respondeu esta pesquisa em {new Date(mine.enviada_em).toLocaleString("pt-BR")}. Pode revisar enquanto o ciclo estiver aberto.</div>}
   <div className="f4-survey-question" key={question.id}>
    <span className="f4-mini-label">{question.tipo==="likert"?"ESCALA DE PERCEPÇÃO":"SUA OPINIÃO"}</span>
    <h3>{question.texto}</h3>
    {question.tipo==="likert"?<><F4ChoiceScale value={answers[question.id]} onChange={v=>setAnswers(x=>({...x,[question.id]:v}))} label={question.texto}/>
    <div className="f4-scale-legend"><span>1 · Discordo / muito ruim</span><span>5 · Concordo / muito bom</span></div></>:
    <label className="f4-field"><span>Escreva sua resposta</span><textarea rows="5" value={answers[question.id]||""} onChange={e=>setAnswers(x=>({...x,[question.id]:e.target.value}))} placeholder="Sua percepção faz diferença para entender o ambiente de trabalho."/></label>}
   </div>
   <div className="f4-survey-navigation"><button className="btn btn-sm" disabled={index===0} onClick={()=>setIndex(x=>Math.max(0,x-1))}>← Anterior</button>
     <div className="f4-survey-dots">{questions.map((q,i)=><button type="button" title={"Ir à pergunta "+(i+1)} aria-label={"Ir à pergunta "+(i+1)} aria-current={i===index?"step":undefined} key={q.id} className={"f4-survey-dot"+(i===index?" current":"")+(String(answers[q.id]??"").trim()?" done":"")} onClick={()=>setIndex(i)}/>)}</div>
     {index<total-1?<button className="btn btn-sm btn-primary" onClick={()=>setIndex(x=>Math.min(total-1,x+1))}>Próxima →</button>:
     <button className="btn btn-sm btn-primary" disabled={!completed||saving} onClick={send}>{saving?"Enviando…":mine?.respondido?"Atualizar respostas ✓":"Enviar pesquisa ✓"}</button>}
   </div>
  </F4Panel>
  <F4Panel eyebrow="PARTICIPAÇÃO CONSCIENTE" title="Sua voz faz parte da mudança">
    <div className="f4-clima-illustration">☀</div>
    <div className="f4-info-step"><b>01</b><span>Responda com sua percepção verdadeira, sem precisar acertar uma resposta.</span></div>
    <div className="f4-info-step"><b>02</b><span>O sistema mostra resultados agregados à equipe e à liderança.</span></div>
    <div className="f4-info-step"><b>03</b><span>Este levantamento é <strong>confidencial, não anônimo</strong>. Respostas individuais só podem ser acessadas pelo administrador na auditoria.</span></div>
  </F4Panel>
 </div>;
}
function F4ClimateResults({ciclo}) {
 const [dados,setDados]=F4H.useState(null),[loading,setLoading]=F4H.useState(true),[error,setError]=F4H.useState("");
 F4H.useEffect(()=>{let alive=true;setDados(null);setLoading(true);setError("");
 EnvoxersAPI.api("/clima/"+ciclo.id+"/resultado").then(x=>{if(alive)setDados(x)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});
 return()=>{alive=false}},[ciclo.id]);
 if(loading)return <div className="f4-loading">Carregando indicadores…</div>;
 if(error)return <div className="f4-feedback-error">{error}</div>;
 if(!dados)return null;
 const pct=F4PERCENT(dados.total_respondentes,dados.total_ativos);
 const likert=dados.perguntas.filter(x=>x.tipo==="likert"&&x.media!=null);
 const mean=likert.length?likert.reduce((a,b)=>a+Number(b.media),0)/likert.length:null;
 return <>
 <div className="f4-stat-grid"><F4Stat icon="♡" number={pct+"%"} label="Participação na pesquisa"/><F4Stat icon="◈" number={dados.total_respondentes+"/"+dados.total_ativos} label="Pessoas respondentes"/><F4Stat icon="✦" number={mean==null?"—":mean.toFixed(1)+"/5"} label="Média das perguntas de escala" sub="Média descritiva, não índice validado"/></div>
 <div className="f4-grid-result">
  <F4Panel eyebrow="TERMÔMETRO COLETIVO" title="Percepções do time">
   {dados.perguntas.filter(q=>q.tipo==="likert").length?dados.perguntas.filter(q=>q.tipo==="likert").map(q=><F4MetricBar key={q.pergunta_id} value={q.media} title={q.texto} sub="Média das respostas recebidas"/>):
   <F4Empty icon="📊" title="Sem questões de escala" detail="Este ciclo contém apenas perguntas abertas."/>}
  </F4Panel>
  <F4Panel eyebrow="PARTICIPAÇÃO E ESCUTA" title="Panorama da pesquisa">
   <div className="f4-clima-participation"><b>{pct}%</b><span>do time respondeu</span><F4Bar value={dados.total_respondentes} max={dados.total_ativos||1}/></div>
   <div className="f4-privacy-note"><strong>Privacidade e interpretação</strong><p>Os indicadores são agregados, mas respostas individuais ficam acessíveis ao administrador por auditoria. Com grupos pequenos, comentários podem permitir identificação indireta. Não use os resultados para avaliar pessoas individualmente.</p></div>
  </F4Panel>
 </div>
 {dados.perguntas.some(q=>q.tipo==="aberta")&&<F4Panel eyebrow="VOZ DO TIME" title="Respostas abertas"><div className="f4-quote-stack">
  {dados.perguntas.filter(q=>q.tipo==="aberta").map(q=><div key={q.pergunta_id} className="f4-open-responses"><h4>{q.texto}</h4>{(q.respostas||[]).length?q.respostas.map((txt,i)=><div className="f4-quote" key={i}>“{txt}”</div>):<p className="f4-subtle">Nenhuma resposta a esta pergunta.</p>}</div>)}
 </div></F4Panel>}
 </>;
}
function F4PremiumClima({permissao}) {
 const {ciclos,cicloId,setCicloId}=useCiclos("clima");
 const [aba,setAba]=F4H.useState("responder"),[bruto,setBruto]=F4H.useState(false),[refresh,setRefresh]=F4H.useState(0);
 const ciclo=ciclos.find(c=>c.id===cicloId);
 F4H.useEffect(()=>{if(ciclo)setAba(ciclo.status==="aberto"?"responder":"resultado")},[ciclo?.id,ciclo?.status]);
 return <div className="f4-upgrade">
  <F4Banner kind="clima" kicker="AMBIENTE DE TRABALHO" title="Clima Organizacional" subtitle="Transforme percepções do time em insumos para melhorar o ambiente, os processos e as relações." icon="☀" aside={<div className="f4-hero-privacy">🔒 <b>Confidencial</b><small>Respostas vinculadas ao participante; acesso individual somente via auditoria admin.</small></div>}/>
  <F4CyclePicker ciclos={ciclos} cicloId={cicloId} onChange={setCicloId}/>
  {ciclo&&<><div className="f4-toolbar"><F4Segment value={aba} onChange={setAba} items={[...(ciclo.status==="aberto"?[{id:"responder",icon:"✍",label:"Minha resposta"}]:[]),{id:"resultado",icon:"▥",label:"Visão coletiva"}]}/>
   {permissao==="admin"&&<button className="btn btn-sm" onClick={()=>setBruto(true)}>🔒 Auditoria restrita</button>}</div>
   {aba==="responder"&&ciclo.status==="aberto"&&<F4ClimaSurvey ciclo={ciclo} onSubmitted={()=>{setAba("resultado");setRefresh(x=>x+1)}}/>}
   {aba==="resultado"&&<F4ClimateResults key={cicloId+"-"+refresh} ciclo={ciclo}/>}
   {bruto&&permissao==="admin"&&<ClimaBrutoModal ciclo={ciclo} onClose={()=>setBruto(false)}/>}
  </>}
 </div>;
}

function F4CycleQuestions({ciclo}) {
 const [perguntas,setPerguntas]=F4H.useState([]),[texto,setTexto]=F4H.useState(""),[tipo,setTipo]=F4H.useState("likert"),[loading,setLoading]=F4H.useState(true),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const load=()=>{setLoading(true);EnvoxersAPI.api("/clima/perguntas?ciclo_id="+ciclo.id).then(setPerguntas).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false))};
 F4H.useEffect(()=>{load()},[ciclo.id]);
 const add=async()=>{if(texto.trim().length<5){toast("Descreva a pergunta com pelo menos 5 caracteres.","error");return;}
  setSaving(true);try{
   await EnvoxersAPI.api("/clima/perguntas?ciclo_id="+ciclo.id,{method:"POST",body:JSON.stringify({texto:texto.trim(),tipo,ordem:perguntas.length+1})});
   toast("Pergunta adicionada.","success");setTexto("");load();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 return <div className="f4-question-builder">
  <div className="f4-question-builder-title"><strong>Questionário do ciclo</strong><span className="f4-counter">{perguntas.length} perguntas</span></div>
  {loading?<div className="f4-loading">Carregando perguntas…</div>:perguntas.length?<div className="f4-draft-question-list">{perguntas.map((q,i)=><div key={q.id}><span>{String(i+1).padStart(2,"0")}</span><strong>{q.texto}</strong><small>{q.tipo==="likert"?"Escala de 1 a 5":"Resposta aberta"}</small></div>)}</div>:
   <p className="f4-form-hint">Adicione perguntas antes de abrir a pesquisa. Ao abrir o ciclo, o questionário não poderá mais ser editado.</p>}
  <div className="f4-builder-inputs"><label className="f4-field"><span>Nova pergunta</span><input value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Ex.: Sinto clareza sobre minhas prioridades." /></label><label className="f4-field"><span>Formato</span><select value={tipo} onChange={e=>setTipo(e.target.value)}><option value="likert">Escala 1–5</option><option value="aberta">Aberta</option></select></label><button className="btn btn-sm btn-primary" disabled={saving} onClick={add}>+ Incluir</button></div>
 </div>;
}
function F4NewCycle({onClose,onDone}) {
 const [tipo,setTipo]=F4H.useState("360"),[nome,setNome]=F4H.useState(""),[inicio,setInicio]=F4H.useState(""),[fim,setFim]=F4H.useState(""),[saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast();
 const save=async()=>{
  if(!nome.trim()||!inicio||!fim){toast("Preencha o nome e as datas do ciclo.","error");return}
  if(fim<inicio){toast("A data de término deve ser posterior ao início.","error");return}
  setSaving(true);try{
    await EnvoxersAPI.api("/ciclos",{method:"POST",body:JSON.stringify({tipo,nome:nome.trim(),data_inicio:inicio,data_fim:fim})});
    toast("Ciclo criado como rascunho!","success");onDone();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 return <F4Modal title="Planejar novo ciclo" kicker="ETAPA 01 · CONFIGURAÇÃO" onClose={onClose}>
  <p className="f4-form-hint">Configure o período e o objetivo. O ciclo nasce como rascunho e só começa quando você decidir abri-lo.</p>
  <div className="f4-cycle-type-grid">{[{id:"360",icon:"✦",text:"Feedback 360°",desc:"Avaliações de competências em múltiplas perspectivas"},{id:"180",icon:"⇄",text:"Avaliação 180°",desc:"Troca de feedback entre liderança e colaboradores"},{id:"clima",icon:"☀",text:"Clima",desc:"Pesquisa de percepção do ambiente de trabalho"}].map(c=>
   <button key={c.id} type="button" aria-pressed={tipo===c.id} onClick={()=>setTipo(c.id)} className={"f4-cycle-type"+(tipo===c.id?" selected":"")}><span>{c.icon}</span><strong>{c.text}</strong><small>{c.desc}</small></button>
  )}</div>
  <label className="f4-field"><span>Nome do ciclo *</span><input value={nome} onChange={e=>setNome(e.target.value)} maxLength={160} placeholder="Ex.: Avaliação do segundo semestre 2026" /></label>
  <div className="f4-form-double"><label className="f4-field"><span>Data inicial *</span><input type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></label><label className="f4-field"><span>Data final *</span><input type="date" min={inicio||undefined} value={fim} onChange={e=>setFim(e.target.value)}/></label></div>
  <div className="f4-confirm-note">◷ O ciclo será criado em <strong>rascunho</strong>. Você poderá preparar as perguntas do Clima antes da abertura.</div>
  <div className="f4-form-footer"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving?"Criando…":"Criar rascunho →"}</button></div>
 </F4Modal>;
}
function F4CycleConfirmation({ciclo,action,onClose,onDone}) {
 const [saving,setSaving]=F4H.useState(false);
 const toast=EnvoxersShared.useToast(),abertura=action==="abrir";
 const go=async()=>{
  setSaving(true);try{
   await EnvoxersAPI.api("/ciclos/"+ciclo.id+"/"+action,{method:"POST"});
   toast(abertura?"Ciclo aberto com sucesso!":"Ciclo encerrado.","success");onDone();
  }catch(e){toast(e.message,"error")}finally{setSaving(false)}
 };
 return <F4Modal title={abertura?"Abrir ciclo para a equipe?":"Encerrar este ciclo?"} kicker="CONFIRMAÇÃO DE ETAPA" onClose={onClose}>
  <div className="f4-confirm-box"><span aria-hidden="true">{abertura?"🚀":"🔒"}</span><div><strong>{ciclo.nome}</strong><p>{abertura?
   ciclo.tipo==="clima"?"As pessoas poderão responder ao questionário. Depois da abertura, não será possível acrescentar novas perguntas.":"Serão gerados os pares de avaliação de acordo com a configuração atual da equipe. A partir disso, poderão responder.":
   "O ciclo será encerrado e novas respostas deixarão de ser aceitas. O histórico já registrado será preservado."}</p></div></div>
  <div className="f4-form-footer"><button className="btn btn-sm" onClick={onClose}>Voltar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={go}>{saving?"Processando…":abertura?"Sim, abrir ciclo":"Confirmar encerramento"}</button></div>
 </F4Modal>;
}
function F4PremiumCycles() {
 const [cycles,setCycles]=F4H.useState([]),[loading,setLoading]=F4H.useState(true),[newCycle,setNewCycle]=F4H.useState(false),
 [confirm,setConfirm]=F4H.useState(null),[filter,setFilter]=F4H.useState("todos"),[expanded,setExpanded]=F4H.useState(null);
 const toast=EnvoxersShared.useToast();
 const refresh=()=>{setLoading(true);EnvoxersAPI.api("/ciclos").then(setCycles).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false))};
 F4H.useEffect(()=>{refresh()},[]);
 const draft=cycles.filter(x=>x.status==="rascunho").length,active=cycles.filter(x=>x.status==="aberto").length,closed=cycles.filter(x=>x.status==="encerrado").length;
 const shown=cycles.filter(x=>filter==="todos"||x.status===filter);
 return <div className="f4-upgrade">
  <F4Banner kind="ciclos" icon="◈" kicker="ORQUESTRAÇÃO DO DESENVOLVIMENTO" title="Ciclos de avaliação" subtitle="Planeje, prepare, abra e acompanhe cada jornada coletiva com clareza e responsabilidade." aside={<div className="f4-hero-big">{active}<small>ciclos abertos</small></div>}/>
  <div className="f4-stat-grid"><F4Stat icon="✎" number={draft} label="Rascunhos em preparação"/><F4Stat icon="◉" number={active} label="Ciclos abertos"/><F4Stat icon="✓" number={closed} label="Ciclos encerrados"/></div>
  <div className="f4-toolbar"><F4Segment value={filter} onChange={setFilter} items={[{id:"todos",label:"Todos",count:cycles.length},{id:"rascunho",label:"Rascunhos"},{id:"aberto",label:"Em andamento"},{id:"encerrado",label:"Encerrados"}]}/>
  <button className="btn btn-sm btn-primary" onClick={()=>setNewCycle(true)}>+ Novo ciclo</button></div>
  {loading?<div className="f4-loading">Carregando ciclos…</div>:shown.length?<div className="f4-cycle-card-grid">{shown.map(c=><article key={c.id} className="f4-cycle-card">
   <div className="f4-cycle-card-top"><div className="f4-cycle-symbol">{c.tipo==="360"?"✦":c.tipo==="180"?"⇄":"☀"}</div><F4Status value={c.status}/></div>
   <div className="f4-mini-label">{F4TYPE[c.tipo]||c.tipo}</div><h3>{c.nome}</h3>
   <div className="f4-cycle-dates"><span>Início <strong>{F4DAY(c.data_inicio)}</strong></span><span>Fim <strong>{F4DAY(c.data_fim)}</strong></span></div>
   <div className="f4-cycle-journey"><span className={c.status!=="rascunho"?"done":""}>01 Planejar</span><span className={c.status==="aberto"||c.status==="encerrado"?"done":""}>02 Abrir</span><span className={c.status==="encerrado"?"done":""}>03 Concluir</span></div>
   {c.tipo==="clima"&&c.status==="rascunho"&&<><button className="f4-inline-toggle" onClick={()=>setExpanded(expanded===c.id?null:c.id)} aria-expanded={expanded===c.id}>⚙ Preparar questionário {expanded===c.id?"↑":"↓"}</button>{expanded===c.id&&<F4CycleQuestions ciclo={c}/>}</>}
   <div className="f4-cycle-actions">{c.status==="rascunho"&&<button className="btn btn-sm btn-primary" onClick={()=>setConfirm({c,action:"abrir"})}>Abrir ciclo →</button>}
    {c.status==="aberto"&&<button className="btn btn-sm" onClick={()=>setConfirm({c,action:"encerrar"})}>Encerrar ciclo</button>}
    {c.status==="encerrado"&&<div className="f4-cycle-complete">✓ Ciclo finalizado · dados preservados</div>}</div>
   </article>)}</div>:<F4Empty icon="🗓" title="Nenhum ciclo neste filtro" detail="Você pode criar um novo ciclo e começar pelo planejamento, sem precisar abri-lo imediatamente." action={<button className="btn btn-sm btn-primary" onClick={()=>setNewCycle(true)}>Criar ciclo</button>}/>}
  {newCycle&&<F4NewCycle onClose={()=>setNewCycle(false)} onDone={()=>{setNewCycle(false);refresh()}}/>}
  {confirm&&<F4CycleConfirmation ciclo={confirm.c} action={confirm.action} onClose={()=>setConfirm(null)} onDone={()=>{setConfirm(null);refresh()}}/>}
 </div>;
}
