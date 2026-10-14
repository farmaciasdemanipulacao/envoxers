// Jornada de Desenvolvimento — PDI vivo, com ações guiadas, evidências e marcos.
function PdiDataBR(iso) {
  return iso ? new Date(iso.slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR") : "—";
}
const PDI_DIAS = ["Segunda","Terça","Quarta","Quinta","Sexta"];
const PDI_STATUS = { pendente:"Aguardando feedback", validada:"Evidência validada", ajustar:"Ajuste solicitado" };
function PdiJornadaModal({ titulo, onClose, children }) {
  return <div className="modal-overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal modal-form-single" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal-head"><div className="modal-eyebrow">DESENVOLVIMENTO · ENVOX</div><h2 className="modal-title">{titulo}</h2><button className="modal-close" aria-label="Fechar" onClick={onClose}>×</button></div>
      <div className="modal-body"><div className="modal-main">{children}</div></div>
    </div>
  </div>;
}
function PdiRegistroForm({ jornada, marco, onClose, onSaved }) {
  const [acaoId,setAcaoId]=React.useState("");
  const [situacao,setSituacao]=React.useState("");
  const [impacto,setImpacto]=React.useState("");
  const [proposta,setProposta]=React.useState("");
  const [resultado,setResultado]=React.useState("");
  const [avaliacao,setAvaliacao]=React.useState(3);
  const [salvando,setSalvando]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const isMarco=!!marco;
  const salvar=async()=>{
    if([situacao,impacto,proposta,resultado].some(v=>v.trim().length<5)){
      toast("Preencha os quatro campos com pelo menos cinco caracteres.","error");return;
    }
    setSalvando(true);
    try{
      const p={situacao,impacto,proposta,resultado};
      if(isMarco){p.marco_dia=marco;p.avaliacao=Number(avaliacao)}
      else if(acaoId)p.acao_id=Number(acaoId);
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/"+(isMarco?"marcos":"registros"),{method:"POST",body:JSON.stringify(p)});
      toast(isMarco?"Revisão formal registrada!":"Evidência enviada para feedback da liderança!","success");
      onSaved();
    }catch(err){toast(err.message,"error")}finally{setSalvando(false)}
  };
  return <PdiJornadaModal titulo={isMarco?"Revisão de "+marco+" dias":"Registrar evolução da semana"} onClose={onClose}>
    <p className="pdi-help">{isMarco?"Registre fatos e recomendações da reunião. A avaliação é um parecer humano, não um cálculo automático.":"Use um exemplo real. A liderança irá analisar e poderá validar ou solicitar complemento."}</p>
    {!isMarco&&<div className="field"><label>Competência ou frente relacionada</label><select value={acaoId} onChange={e=>setAcaoId(e.target.value)}>
      <option value="">Evolução geral da jornada</option>{jornada.acoes.map(a=><option key={a.id} value={a.id}>{a.titulo}</option>)}
    </select></div>}
    <div className="field"><label>{isMarco?"O que foi observado nesses "+marco+" dias?":"1. Situação: o que aconteceu?"} *</label><textarea rows="3" value={situacao} onChange={e=>setSituacao(e.target.value)} placeholder="Descreva um caso real, de forma objetiva..." /></div>
    <div className="field"><label>{isMarco?"Impacto na rotina e nas entregas":"2. Qual foi o impacto?"} *</label><textarea rows="2" value={impacto} onChange={e=>setImpacto(e.target.value)} placeholder="Consequências para o trabalho, cliente ou equipe..." /></div>
    <div className="field"><label>{isMarco?"O que precisa evoluir no próximo período?":"3. Qual solução ou ação você propôs?"} *</label><textarea rows="2" value={proposta} onChange={e=>setProposta(e.target.value)} placeholder="Alternativa, mudança de atitude ou próximo passo..." /></div>
    <div className="field"><label>{isMarco?"Conclusões, feedback e combinados":"4. Qual foi o resultado ou aprendizado?"} *</label><textarea rows="2" value={resultado} onChange={e=>setResultado(e.target.value)} placeholder="Resultado observado, mesmo que ainda parcial..." /></div>
    {isMarco&&<div className="field"><label>Avaliação do progresso neste período (1–5)</label><select value={avaliacao} onChange={e=>setAvaliacao(e.target.value)}>
      {[1,2,3,4,5].map(n=><option value={n} key={n}>{n} · {["","Necessita apoio","Em construção","Evolução inicial","Evolução consistente","Evolução demonstrada"][n]}</option>)}
    </select><small>Registro do julgamento do gestor, não pontuação competitiva.</small></div>}
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button disabled={salvando} className="btn btn-sm btn-primary" onClick={salvar}>{salvando?"Salvando...":isMarco?"Finalizar revisão":"Enviar evidência"}</button></div>
  </PdiJornadaModal>;
}
function PdiValidarForm({ jornada, registro, onClose, onSaved }) {
  const [status,setStatus]=React.useState("validada");
  const [feedback,setFeedback]=React.useState("");
  const [saving,setSaving]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const enviar=async()=>{
    if(feedback.trim().length<5){toast("Adicione feedback construtivo com pelo menos cinco caracteres.","error");return}
    setSaving(true);
    try{
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/registros/"+registro.id+"/validar",{method:"PATCH",body:JSON.stringify({status,feedback})});
      toast("Feedback registrado com sucesso.","success");onSaved();
    }catch(err){toast(err.message,"error")}finally{setSaving(false)}
  };
  return <PdiJornadaModal titulo="Validar evidência" onClose={onClose}>
    <div className="pdi-case"><strong>Situação</strong><p>{registro.situacao}</p><strong>Impacto</strong><p>{registro.impacto}</p><strong>Ação</strong><p>{registro.proposta}</p><strong>Resultado</strong><p>{registro.resultado}</p></div>
    <div className="field"><label>Parecer</label><select value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="validada">Validar: evidência suficiente</option><option value="ajustar">Solicitar complemento</option>
    </select></div>
    <div className="field"><label>Feedback objetivo e próximo passo *</label><textarea rows="4" value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="O que demonstrou evolução? O que fazer na próxima situação?" /></div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={enviar}>{saving?"Salvando...":"Registrar feedback"}</button></div>
  </PdiJornadaModal>;
}
function PdiJornadaDetalhe({ jornada, onVoltar, onRefresh, envoxerId }) {
  const [modal,setModal]=React.useState(null);
  const [detalhes,setDetalhes]=React.useState(false);
  const [configs,setConfigs]=React.useState(false);
  const [lembreteAtivo,setLembreteAtivo]=React.useState(jornada.lembrete_ativo);
  const [lembreteDia,setLembreteDia]=React.useState(jornada.lembrete_dia);
  const [salvandoConfig,setSalvandoConfig]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  React.useEffect(()=>{setLembreteAtivo(jornada.lembrete_ativo);setLembreteDia(jornada.lembrete_dia)},[jornada.id,jornada.lembrete_ativo,jornada.lembrete_dia]);
  const salvarConfig=async()=>{
    setSalvandoConfig(true);
    try{
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/config",{method:"PATCH",body:JSON.stringify({lembrete_ativo:lembreteAtivo,lembrete_dia:Number(lembreteDia)})});
      toast("Lembretes atualizados!","success");setConfigs(false);onRefresh();
    }catch(err){toast(err.message,"error")}finally{setSalvandoConfig(false)}
  };
  const habilitarPush=async()=>{
    try{
      if(!window.pushHelpers?.isSupported()){toast("Este navegador não permite notificações push.","error");return}
      const r=await window.pushHelpers.subscribe();
      if(r)toast("Notificações habilitadas neste dispositivo!","success");
      else toast("A permissão não foi concedida.","error");
    }catch(err){toast(err.message,"error")}
  };
  const percent=Number(jornada.progresso_pct)||0;
  const ultimoCheckin=jornada.registros.find(r=>r.tipo==="evidencia");
  return <div className="pdi-jornada-page">
    <div className="pdi-top-actions">
      <button className="btn btn-sm" onClick={onVoltar}>← Voltar</button>
      <span className="pdi-pill">Ciclo {PdiDataBR(jornada.inicio)} a {PdiDataBR(jornada.fim)}</span>
      <button className="btn btn-sm" onClick={()=>setConfigs(!configs)}>⚙ Lembretes</button>
    </div>
    <div className="pdi-hero">
      <div className="pdi-hero-info">
        <div className="pdi-eyebrow">JORNADA DE DESENVOLVIMENTO · {jornada.dias_total} DIAS</div>
        <h2>{jornada.envoxer_nome}</h2>
        <p>Um passo por semana. Evidências reais, conversas relevantes e evolução observável.</p>
        <div className="pdi-hero-tags"><span>Semana {jornada.semana_atual || "—"} de {jornada.semanas_total}</span><span>{jornada.dias_passados} dias do ciclo</span><span>Gestor: {jornada.gestor_nome}</span></div>
      </div>
      <div className="pdi-hero-progress" role="img" aria-label={percent+"% da participação validada"} style={{background:"conic-gradient(#7657e8 "+percent+"%, rgba(255,255,255,.13) 0)"}}>
        <div><strong>{percent}%</strong><small>consistência validada</small></div>
      </div>
    </div>
    {configs&&<div className="pdi-panel pdi-config">
      <div><h3>Ritual de lembretes</h3><p>O sistema avisa no dia definido se não houver evidência na semana. A liderança recebe seu resumo nas segundas.</p></div>
      <div className="pdi-config-controls"><label><input type="checkbox" checked={lembreteAtivo} onChange={e=>setLembreteAtivo(e.target.checked)} /> Ativar lembretes</label>
        <select value={lembreteDia} onChange={e=>setLembreteDia(Number(e.target.value))}>{PDI_DIAS.map((v,i)=><option value={i} key={i}>{v}-feira</option>)}</select>
        <button className="btn btn-sm btn-primary" disabled={salvandoConfig} onClick={salvarConfig}>Salvar</button>
        <button className="btn btn-sm" onClick={habilitarPush}>Ativar push neste dispositivo</button>
      </div>
      <small>Os alertas na tela funcionam sem push. Para avisos fora do aplicativo, ative as notificações do navegador.</small>
    </div>}
    <div className="pdi-metric-grid">
      <div className="pdi-metric"><span>🌱</span><strong>{jornada.semanas_validadas.length}<small>/{jornada.semanas_total}</small></strong><p>Semanas com evidência validada</p></div>
      <div className="pdi-metric"><span>✨</span><strong>{jornada.pontos_participacao}</strong><p>XP de participação validada</p></div>
      <div className="pdi-metric"><span>💬</span><strong>{jornada.pendentes_validacao}</strong><p>Aguardando feedback do gestor</p></div>
      <div className="pdi-metric"><span>🏅</span><strong>{jornada.badges.length}</strong><p>Conquistas individuais</p></div>
    </div>
    <div className="pdi-columns">
      <div className="pdi-left">
        <section className="pdi-panel">
          <div className="pdi-section-title"><div><span className="pdi-eyebrow">PRÓXIMO PASSO</span><h3>Sua missão da semana</h3></div>{jornada.pode_registrar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"evidencia"})}>+ Registrar evidência</button>}</div>
          <p className="pdi-help">Observe uma situação da sua rotina e transforme em aprendizado: situação → impacto → solução → resultado.</p>
          {jornada.alertas.length>0?<div className="pdi-alert-list">{jornada.alertas.map((a,i)=><div className={"pdi-alert "+(a.nivel==="atencao"?"pdi-alert-warn":"")} key={i}><span>●</span>{a.texto}</div>)}</div>:
          <div className="pdi-positive">✓ Nenhuma pendência imediata. Continue aplicando e registrando aprendizados.</div>}
          <div className="pdi-week-grid" aria-label="Calendário de semanas do ciclo">
            {Array.from({length:jornada.semanas_total},(_,i)=>{const sem=i+1,valid=jornada.semanas_validadas.includes(sem),recorded=jornada.semanas_registradas.includes(sem);
              return <div key={sem} title={"Semana "+sem+(valid?": validada":recorded?": registrada":"")} className={"pdi-week "+(valid?"is-valid":recorded?"is-recorded":sem===jornada.semana_atual?"is-current":"")}><small>S{sem}</small><strong>{valid?"✓":recorded?"◌":sem===jornada.semana_atual?"●":"·"}</strong></div>})}
          </div>
          <p className="pdi-small">✓ Validada · ◌ Aguardando feedback · ● Semana atual. Cada semana contabiliza no máximo 20 XP, após validação humana.</p>
        </section>
        <section className="pdi-panel">
          <div className="pdi-section-title"><div><span className="pdi-eyebrow">CONVERSAS QUE IMPORTAM</span><h3>Marcos de avaliação</h3></div>{jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"1a1"})}>+ Registrar 1:1</button>}</div>
          <div className="pdi-milestones"><div className="pdi-1a1-hint">💬 Próximo 1:1: <strong>{PdiDataBR(jornada.proximo_1a1)}</strong> · registre na aba 1:1 desta área.</div>{jornada.marcos.map((m,i)=><div key={m.dia} className={"pdi-milestone "+(m.concluido?"done":m.pendente?"due":"")}>
            <div className="pdi-milestone-symbol">{m.concluido?"✓":m.pendente?"!":i+1}</div>
            <div><strong>{m.dia} dias</strong><small>{PdiDataBR(m.data)} · {m.concluido?"Revisão registrada":m.pendente?"Revisão pendente":"Próxima conversa formal"}</small></div>
            {m.pendente&&jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"marco",marco:m.dia})}>Avaliar</button>}
          </div>)}</div>
          <p className="pdi-small">A cada 15 dias, faça também a conversa individual e registre o feedback na evidência correspondente. Os marcos de 30/60/90 dias consolidam as decisões.</p>
        </section>
        <section className="pdi-panel">
          <div className="pdi-section-title"><div><span className="pdi-eyebrow">FORÇAS EM AÇÃO</span><h3>Competências e responsabilidades</h3></div><button className="btn btn-sm" onClick={()=>setDetalhes(!detalhes)}>{detalhes?"Ocultar":"Ver ações"}</button></div>
          {detalhes?<div className="pdi-action-list">{jornada.acoes.map(a=><div className="pdi-action-row" key={a.id}><span className="pdi-action-dot"/><div><strong>{a.titulo}</strong><small>{a.categoria || "Desenvolvimento"} · {a.status.replaceAll("_"," ")} · prazo {PdiDataBR(a.prazo)}</small></div></div>)}</div>:
          <p className="pdi-help">{jornada.acoes.length} ações vinculadas a competências, operação da agência e Software House. Clique para explorar as metas.</p>}
          <div className="pdi-weight-row"><div><span>Agência · 80%</span><div className="pdi-weight-track"><i style={{width:"80%",background:"#6273ef"}}/></div></div><div><span>Software House · 20%</span><div className="pdi-weight-track"><i style={{width:"20%",background:"#21ae9c"}}/></div></div></div>
          <p className="pdi-small">80/20 é referência de capacidade, não medição automática de horas.</p>
        </section>
      </div>
      <div className="pdi-right">
        <section className="pdi-panel"><span className="pdi-eyebrow">CONQUISTAS REAIS</span><h3>Meu crescimento</h3>
          {jornada.badges.length?<div className="pdi-badges">{jornada.badges.map(b=><div key={b.nome} className="pdi-badge" title={b.texto}><span>{b.icone}</span><div><strong>{b.nome}</strong><small>{b.texto}</small></div></div>)}</div>:<div className="pdi-empty-mini">Sua primeira conquista aparece quando a liderança validar sua primeira semana com uma evidência real.</div>}
          <div className="pdi-hint"><strong>O XP não mede competência.</strong><p>Ele reconhece a consistência do processo. Não existe ranking público nem comparação entre pessoas.</p></div>
        </section>
        <section className="pdi-panel"><span className="pdi-eyebrow">REGISTROS AUDITÁVEIS</span><h3>Linha do tempo</h3>
          {jornada.registros.length===0&&<div className="pdi-empty-mini">Ainda não há evidências. A jornada começa com um exemplo real.</div>}
          <div className="pdi-feed">{jornada.registros.map(r=><article key={r.id} className="pdi-entry">
            <div className="pdi-entry-top"><strong>{r.tipo==="marco"?"🏅 Revisão de "+r.marco_dia+" dias":"🌱 Evidência de evolução"}</strong><span className={"pdi-entry-status "+r.status_validacao}>{PDI_STATUS[r.status_validacao]}</span></div>
            <small>{r.autor_nome} · {new Date(r.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small>
            <div className="pdi-entry-text"><strong>Situação</strong><p>{r.situacao}</p><strong>Impacto</strong><p>{r.impacto}</p><strong>Ação</strong><p>{r.proposta}</p><strong>Resultado / aprendizado</strong><p>{r.resultado}</p></div>
            {r.tipo==="marco"&&<div className="pdi-entry-note">Avaliação do gestor: {r.avaliacao}/5</div>}
            {r.feedback_gestor&&<div className="pdi-entry-note"><strong>Feedback:</strong> {r.feedback_gestor} <small>· {r.validado_por_nome}</small></div>}
            {r.tipo==="evidencia"&&r.status_validacao==="pendente"&&jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"validar",registro:r})}>Revisar evidência</button>}
          </article>)}</div>
        </section>
      </div>
    </div>
    {modal?.tipo==="1a1"&&<PdiConversa1a1Form jornada={jornada} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="evidencia"&&<PdiRegistroForm jornada={jornada} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="marco"&&<PdiRegistroForm jornada={jornada} marco={modal.marco} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="validar"&&<PdiValidarForm jornada={jornada} registro={modal.registro} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
  </div>;
}
function PdiCriarJornada({ onClose, onSaved, envoxerId, permissao }) {
  const [pessoas,setPessoas]=React.useState([]);
  const [pessoa,setPessoa]=React.useState("");
  const [dia,setDia]=React.useState(new Date().toLocaleDateString("sv-SE"));
  const [saving,setSaving]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  React.useEffect(()=>{EnvoxersAPI.api("/envoxers").then(d=>setPessoas(d.filter(u=>u.ativo && u.id!==envoxerId))).catch(e=>toast(e.message,"error"))},[]);
  const add=async()=>{
    if(!pessoa){toast("Escolha a pessoa.","error");return}
    const start=new Date(dia+"T12:00:00");start.setDate(start.getDate()+89);
    const end=start.toLocaleDateString("sv-SE");
    setSaving(true);
    try{
      await EnvoxersAPI.api("/pdi/jornadas",{method:"POST",body:JSON.stringify({envoxer_id:Number(pessoa),gestor_id:envoxerId,nome:"Jornada de desenvolvimento · 90 dias",inicio:dia,fim:end,lembrete_dia:4})});
      toast("Jornada iniciada!","success");onSaved();
    }catch(err){toast(err.message,"error")}finally{setSaving(false)}
  };
  return <PdiJornadaModal titulo="Nova jornada de desenvolvimento" onClose={onClose}>
    <p className="pdi-help">Crie um ciclo individual com check-ins, feedbacks, lembretes e marcos formais. As competências continuam sendo cadastradas nas ações do PDI.</p>
    <div className="field"><label>Pessoa</label><select value={pessoa} onChange={e=>setPessoa(e.target.value)}><option value="">Selecione</option>{pessoas.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
    <div className="field"><label>Início do ciclo de 90 dias</label><input type="date" value={dia} onChange={e=>setDia(e.target.value)} /></div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={add}>{saving?"Criando...":"Criar jornada"}</button></div>
  </PdiJornadaModal>;
}
function PdiJornadaExperience({ permissao, envoxerId }) {
  const isLeader=permissao==="gestor"||permissao==="admin";
  const [aba,setAba]=React.useState(permissao==="admin"?"equipe":"minha");
  const [equipes,setEquipes]=React.useState([]);
  const [minhas,setMinhas]=React.useState([]);
  const [selecionada,setSelecionada]=React.useState(null);
  const [carregando,setCarregando]=React.useState(true);
  const [criando,setCriando]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const carregar=async()=>{
    setCarregando(true);
    try{
      const [a,b]=await Promise.all([EnvoxersAPI.api("/pdi/jornadas"),isLeader?EnvoxersAPI.api("/pdi/jornadas/equipe"):Promise.resolve([])]);
      setMinhas(a);setEquipes(b);
    }catch(err){toast(err.message,"error")}finally{setCarregando(false)}
  };
  React.useEffect(()=>{carregar()},[]);
  const detalheId=selecionada;
  const detalhe=[...minhas,...equipes].find(j=>j.id===detalheId);
  if(detalheId&&detalhe) return <PdiJornadaDetalhe jornada={detalhe} envoxerId={envoxerId} onVoltar={()=>setSelecionada(null)} onRefresh={carregar}/>;
  return <div className="pdi-experience">
    <div className="pdi-screen-head"><div><div className="pdi-eyebrow">F4 · DESENVOLVIMENTO DE PESSOAS</div><h2>Jornadas de desenvolvimento</h2><p>Um sistema vivo para acompanhar progresso, conversas e evolução real.</p></div>{permissao==="admin"&&<button className="btn btn-sm btn-primary" onClick={()=>setCriando(true)}>+ Nova jornada</button>}</div>
    <div className="pdi-subnav">{isLeader&&<button className={"chip"+(aba==="equipe"?" active":"")} onClick={()=>{setAba("equipe");setSelecionada(null)}}>Minha equipe</button>}<button className={"chip"+(aba==="minha"?" active":"")} onClick={()=>{setAba("minha");setSelecionada(null)}}>Minha jornada</button><button className={"chip"+(aba==="acoes"?" active":"")} onClick={()=>{setAba("acoes");setSelecionada(null)}}>Ações e PDIs anteriores</button></div>
    {aba==="acoes"?<PdiSection permissao={permissao} envoxerId={envoxerId}/>:
      carregando?<div className="app-loading">Carregando jornadas...</div>:
      <div>
        <div className="pdi-list-intro">{aba==="equipe"?"Visão da liderança: evolução individual, pendências e próximos compromissos.":"Acompanhe sua jornada, registre experiências e receba feedback do gestor."}</div>
        <div className="pdi-team-grid">{(aba==="equipe"?equipes:minhas).map(j=><button key={j.id} type="button" className="pdi-person-card" onClick={()=>setSelecionada(j.id)}>
          <div className="pdi-person-top"><div className="pdi-person-avatar">{(j.envoxer_nome||"?").trim().slice(0,1).toUpperCase()}</div><div><strong>{j.envoxer_nome}</strong><small>Semana {j.semana_atual} de {j.semanas_total} · até {PdiDataBR(j.fim)}</small></div><span>→</span></div>
          <div className="pdi-progress-title"><span>Participação validada</span><strong>{j.progresso_pct}%</strong></div><div className="pdi-progress-track"><i style={{width:j.progresso_pct+"%"}} /></div>
          <div className="pdi-person-tags"><span>🌱 {j.semanas_validadas.length} semanas</span><span>✨ {j.pontos_participacao} XP</span>{j.pendentes_validacao>0&&<span className="pdi-flag">💬 {j.pendentes_validacao} feedback(s)</span>}</div>
          {j.alertas.length>0&&<div className="pdi-person-alert">{j.alertas[0].texto}</div>}
        </button>)}</div>
        {(aba==="equipe"?equipes:minhas).length===0&&<div className="pdi-panel"><h3>{aba==="minha"?"Você ainda não tem uma jornada ativa.":"Nenhuma jornada sob seu acompanhamento."}</h3><p className="pdi-help">O cadastro das ações anteriores permanece disponível em “Ações e PDIs anteriores”. A liderança pode criar uma nova jornada para iniciar o acompanhamento de 90 dias.</p></div>}
      </div>}
    {criando&&<PdiCriarJornada permissao={permissao} envoxerId={envoxerId} onClose={()=>setCriando(false)} onSaved={()=>{setCriando(false);carregar()}} />}
  </div>;
}

// Lembrete transversal do PDI — disponível no dashboard sem entrar no F4.
function PdiAvisoGlobal({ envoxerId, permissao, view, onAbrir }) {
  const [alertas,setAlertas]=React.useState([]);
  const [fechado,setFechado]=React.useState(false);
  React.useEffect(()=>{
    if(permissao==="comercial" || !envoxerId)return;
    let ativo=true;
    const carregar=async()=>{
      try{
        const [minhas,equipe]=await Promise.all([
          EnvoxersAPI.api("/pdi/jornadas"),
          permissao==="admin"||permissao==="gestor"?EnvoxersAPI.api("/pdi/jornadas/equipe"):Promise.resolve([])
        ]);
        if(!ativo)return;
        const pessoal=(minhas||[]).filter(j=>j.status==="ativa").flatMap(j=>j.alertas||[]);
        const time=(equipe||[]).filter(j=>j.status==="ativa")
          .flatMap(j=>(j.alertas||[]).filter(a=>a.tipo==="validacao" || a.tipo==="marco"));
        setAlertas([...pessoal,...time]);
      }catch(_){if(ativo)setAlertas([])}
    };
    carregar();
    const interval=setInterval(carregar,20*60*1000);
    return()=>{ativo=false;clearInterval(interval)};
  },[envoxerId,permissao,view==="f4"]);
  React.useEffect(()=>{if(view==="f4")setFechado(false)},[view]);
  if(view==="f4"||view==="chat"||view==="comercial-dashboard"||fechado||!alertas.length)return null;
  return <div className="pdi-global-banner" role="status">
    <span className="pdi-global-symbol">🌱</span>
    <div><strong>Sua jornada de desenvolvimento pede atenção</strong><small>{alertas.length===1?alertas[0].texto:alertas.length+" pontos de acompanhamento aguardam sua atenção."}</small></div>
    <button className="btn btn-sm btn-primary" onClick={onAbrir}>Abrir PDI</button>
    <button className="pdi-global-close" aria-label="Dispensar lembrete nesta sessão" onClick={()=>setFechado(true)}>×</button>
  </div>;
}

// Ritual de 15 dias: cria um Feedback 1:1 no módulo nativo e já atualiza a jornada.
function PdiConversa1a1Form({ jornada, onClose, onSaved }) {
  const hoje=new Date().toLocaleDateString("sv-SE");
  const [data,setData]=React.useState(hoje);
  const [pauta,setPauta]=React.useState("");
  const [combinados,setCombinados]=React.useState("");
  const [salvando,setSalvando]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const salvar=async()=>{
    if(pauta.trim().length<8||combinados.trim().length<8){toast("Descreva a pauta e os combinados (mínimo 8 caracteres).","error");return}
    setSalvando(true);
    try{
      const next=new Date(data+"T12:00:00");next.setDate(next.getDate()+14);
      await EnvoxersAPI.api("/1a1",{method:"POST",body:JSON.stringify({
        gestor_id:jornada.gestor_id,liderado_id:jornada.envoxer_id,
        data,pauta,combinados,proximo_sugerido:next.toLocaleDateString("sv-SE")
      })});
      toast("Conversa quinzenal registrada. Próximo 1:1 programado!","success");
      onSaved();
    }catch(err){toast(err.message,"error")}finally{setSalvando(false)}
  };
  return <PdiJornadaModal titulo={"Conversa quinzenal · "+jornada.envoxer_nome} onClose={onClose}>
    <p className="pdi-help">Uma conversa breve sobre o que evoluiu, o que dificultou e o próximo passo. Este registro fica no módulo Feedback 1:1 e atualiza automaticamente o próximo encontro.</p>
    <div className="field"><label>Data da conversa</label><input type="date" value={data} onChange={e=>setData(e.target.value)} /></div>
    <div className="field"><label>Pauta e observações *</label><textarea rows="4" value={pauta} onChange={e=>setPauta(e.target.value)} placeholder="Quais evidências foram discutidas? Quais desafios surgiram?" /></div>
    <div className="field"><label>Combinados e próximos passos *</label><textarea rows="4" value={combinados} onChange={e=>setCombinados(e.target.value)} placeholder="O que cada pessoa fará até a próxima conversa?" /></div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={salvando} onClick={salvar}>{salvando?"Salvando...":"Registrar conversa"}</button></div>
  </PdiJornadaModal>;
}
