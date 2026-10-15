// Jornada de Desenvolvimento — PDI vivo, guiado, com ações, diagnóstico e evolução.
function PdiDataBR(iso) {
  return iso ? new Date(iso.slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR") : "—";
}
const PDI_DIAS = ["Segunda","Terça","Quarta","Quinta","Sexta"];
const PDI_STATUS = { pendente:"Aguardando feedback", validada:"Evidência validada", ajustar:"Ajuste solicitado" };
const PDI_ETAPA_STATUS = {
  concluida:"Concluída",
  em_andamento:"Em andamento",
  pendente:"Próxima",
  bloqueada:"Aguardando etapa anterior",
};
const PDI_NOTA_LABEL = {
  1:"Preciso de bastante apoio",
  2:"Ainda acontece de forma irregular",
  3:"Consigo na maior parte das situações",
  4:"Faço com consistência",
  5:"É uma força bem estabelecida",
};

function PdiJornadaModal({ titulo, onClose, children, largo=false }) {
  return <div className="modal-overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={"modal modal-form-single"+(largo?" pdi-modal-wide":"")} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal-head">
        <div className="modal-eyebrow">DESENVOLVIMENTO · ENVOX</div>
        <h2 className="modal-title">{titulo}</h2>
        <button className="modal-close" aria-label="Fechar" onClick={onClose}>×</button>
      </div>
      <div className="modal-body"><div className="modal-main">{children}</div></div>
    </div>
  </div>;
}

function PdiDiagnosticoForm({ jornada, momento, onClose, onSaved }) {
  const [notas,setNotas]=React.useState(()=>Object.fromEntries((jornada.dimensoes||[]).map(d=>[d.chave,3])));
  const [forca,setForca]=React.useState("");
  const [desafio,setDesafio]=React.useState("");
  const [objetivo,setObjetivo]=React.useState("");
  const [reflexao,setReflexao]=React.useState("");
  const [conquistas,setConquistas]=React.useState("");
  const [salvando,setSalvando]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const inicial=momento==="inicial";
  const label=inicial?"Diagnóstico inicial":"Mapa de evolução · "+momento+" dias";

  const salvar=async()=>{
    if(Object.keys(notas).length!==(jornada.dimensoes||[]).length){toast("Responda todas as dimensões.","error");return}
    if([forca,desafio,objetivo].some(v=>v.trim().length<5)){toast("Descreva força, desafio e objetivo com um pouco mais de contexto.","error");return}
    if(!inicial && (reflexao.trim().length<5 || conquistas.trim().length<5)){toast("Nos marcos, registre também sua reflexão e suas conquistas.","error");return}
    setSalvando(true);
    try{
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/diagnosticos",{method:"POST",body:JSON.stringify({
        momento,notas,forca_atual:forca,desafio_atual:desafio,objetivo_proximo:objetivo,
        reflexao:inicial?null:reflexao,conquistas:inicial?null:conquistas
      })});
      toast(inicial?"Ponto de partida registrado!":"Mapa de evolução atualizado!","success");
      onSaved();
    }catch(err){toast(err.message,"error")}finally{setSalvando(false)}
  };

  return <PdiJornadaModal titulo={label} onClose={onClose} largo>
    <div className="pdi-diagnostic-intro">
      <strong>{inicial?"Isto é o seu ponto A.":"Compare percepção com fatos, não com expectativa."}</strong>
      <p>{inicial
        ?"Responda como você se percebe hoje. Não é prova nem nota de desempenho. As mesmas perguntas voltam nos marcos para tornar a evolução visível."
        :"Use situações que realmente aconteceram desde o início. A comparação é com você mesmo, nunca com outra pessoa."}</p>
    </div>
    <div className="pdi-score-list">
      {(jornada.dimensoes||[]).map(d=><div className="pdi-score-row" key={d.chave}>
        <div><strong>{d.label}</strong><small>{d.descricao}</small></div>
        <div className="pdi-score-buttons">
          {[1,2,3,4,5].map(n=><button type="button" key={n} title={PDI_NOTA_LABEL[n]} className={notas[d.chave]===n?"is-active":""} onClick={()=>setNotas({...notas,[d.chave]:n})}>{n}</button>)}
        </div>
        <span className="pdi-score-caption">{PDI_NOTA_LABEL[notas[d.chave]]}</span>
      </div>)}
    </div>
    <div className="field"><label>Hoje, qual é sua principal força? *</label><textarea rows="3" value={forca} onChange={e=>setForca(e.target.value)} placeholder="Cite comportamento e um exemplo real..." /></div>
    <div className="field"><label>Qual é o principal ponto que limita sua evolução hoje? *</label><textarea rows="3" value={desafio} onChange={e=>setDesafio(e.target.value)} placeholder="Descreva a situação, não apenas uma palavra..." /></div>
    <div className="field"><label>{inicial?"O que você quer estar fazendo diferente ao fim do ciclo?":"Qual deve ser o próximo avanço?"} *</label><textarea rows="3" value={objetivo} onChange={e=>setObjetivo(e.target.value)} placeholder="O que será observável na prática?" /></div>
    {!inicial&&<>
      <div className="field"><label>O que mudou desde o ponto inicial? *</label><textarea rows="3" value={reflexao} onChange={e=>setReflexao(e.target.value)} placeholder="Comportamentos, decisões, rotina, relação com equipe..." /></div>
      <div className="field"><label>Quais conquistas concretas você reconhece? *</label><textarea rows="3" value={conquistas} onChange={e=>setConquistas(e.target.value)} placeholder="Resultados, situações conduzidas melhor, autonomia conquistada..." /></div>
    </>}
    <div className="pdi-scale-help">1 = muito apoio · 3 = consigo na maioria das situações · 5 = força bem estabelecida</div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={salvando} onClick={salvar}>{salvando?"Salvando...":"Salvar mapa"}</button></div>
  </PdiJornadaModal>;
}

function PdiAcaoAdminForm({ jornada, acao, onClose, onSaved }) {
  const editando=!!acao;
  const [titulo,setTitulo]=React.useState(acao?.titulo||"");
  const [categoria,setCategoria]=React.useState(acao?.categoria||"");
  const [prazo,setPrazo]=React.useState(acao?.prazo||"");
  const [descricao,setDescricao]=React.useState(acao?.descricao||"");
  const [comoFazer,setComoFazer]=React.useState(acao?.como_fazer||"");
  const [evidencia,setEvidencia]=React.useState(acao?.evidencia_esperada||"");
  const [criterio,setCriterio]=React.useState(acao?.criterio_sucesso||"");
  const [status,setStatus]=React.useState(acao?.status||"planejada");
  const [salvando,setSalvando]=React.useState(false);
  const toast=EnvoxersShared.useToast();

  const salvar=async()=>{
    if([titulo,descricao,comoFazer,evidencia,criterio].some(v=>v.trim().length<4)){toast("Preencha título e todas as orientações da ação.","error");return}
    setSalvando(true);
    try{
      const payload={titulo,categoria:categoria||null,prazo:prazo||null,descricao,como_fazer:comoFazer,evidencia_esperada:evidencia,criterio_sucesso:criterio};
      if(editando)payload.status=status;
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/acoes"+(editando?"/"+acao.id:""),{method:editando?"PATCH":"POST",body:JSON.stringify(payload)});
      toast(editando?"Ação atualizada!":"Ação criada e vinculada à jornada!","success");
      onSaved();
    }catch(err){toast(err.message,"error")}finally{setSalvando(false)}
  };

  return <PdiJornadaModal titulo={editando?"Editar ação do PDI":"Nova ação do PDI"} onClose={onClose} largo>
    <div className="pdi-admin-note"><strong>Administração do PDI</strong><p>Neste momento, o cadastro e a edição das ações são exclusivos do Admin. A estrutura já está preparada para liberar ao Gestor depois.</p></div>
    <div className="form-row">
      <div className="field"><label>Título da ação *</label><input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Ex.: Priorizar três entregas principais por semana" /></div>
      <div className="field"><label>Competência / frente</label><input value={categoria} onChange={e=>setCategoria(e.target.value)} placeholder="Ex.: Liderança | Priorização" /></div>
    </div>
    <div className="field"><label>O que precisa ser desenvolvido? *</label><textarea rows="3" value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Explique o comportamento ou responsabilidade a desenvolver e por que isso importa." /></div>
    <div className="field"><label>Como fazer na prática? *</label><textarea rows="4" value={comoFazer} onChange={e=>setComoFazer(e.target.value)} placeholder={"Exemplo:\\n1. No início da semana, listar entregas críticas.\\n2. Escolher três prioridades.\\n3. Sinalizar riscos antes do prazo."} /></div>
    <div className="field"><label>Que evidência a pessoa deve registrar? *</label><textarea rows="3" value={evidencia} onChange={e=>setEvidencia(e.target.value)} placeholder="Ex.: situação real em que priorizou, comunicou a decisão e mostrou o resultado." /></div>
    <div className="field"><label>Como saberemos que houve avanço? *</label><textarea rows="3" value={criterio} onChange={e=>setCriterio(e.target.value)} placeholder="Defina o critério observável: frequência, redução de retrabalho, previsibilidade, autonomia..." /></div>
    <div className="form-row">
      <div className="field"><label>Prazo</label><input type="date" value={prazo} onChange={e=>setPrazo(e.target.value)} /></div>
      {editando&&<div className="field"><label>Status</label><select value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="planejada">Planejada</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
      </select></div>}
    </div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={salvando} onClick={salvar}>{salvando?"Salvando...":"Salvar ação"}</button></div>
  </PdiJornadaModal>;
}

function PdiRegistroForm({ jornada, marco, onClose, onSaved }) {
  const [acaoId,setAcaoId]=React.useState(jornada.acoes?.find(a=>a.status!=="cancelada")?.id||"");
  const [situacao,setSituacao]=React.useState("");
  const [impacto,setImpacto]=React.useState("");
  const [proposta,setProposta]=React.useState("");
  const [resultado,setResultado]=React.useState("");
  const [avaliacao,setAvaliacao]=React.useState(3);
  const [salvando,setSalvando]=React.useState(false);
  const toast=EnvoxersShared.useToast();
  const isMarco=!!marco;
  const acao=jornada.acoes?.find(a=>String(a.id)===String(acaoId));

  const salvar=async()=>{
    if(!isMarco&&!acaoId){toast("Escolha qual ação do PDI você praticou.","error");return}
    if([situacao,impacto,proposta,resultado].some(v=>v.trim().length<5)){toast("Preencha os quatro campos com pelo menos cinco caracteres.","error");return}
    setSalvando(true);
    try{
      const p={situacao,impacto,proposta,resultado};
      if(isMarco){p.marco_dia=marco;p.avaliacao=Number(avaliacao)}
      else p.acao_id=Number(acaoId);
      await EnvoxersAPI.api("/pdi/jornadas/"+jornada.id+"/"+(isMarco?"marcos":"registros"),{method:"POST",body:JSON.stringify(p)});
      toast(isMarco?"Revisão formal registrada!":"Evidência enviada para feedback da liderança!","success");
      onSaved();
    }catch(err){toast(err.message,"error")}finally{setSalvando(false)}
  };

  return <PdiJornadaModal titulo={isMarco?"Revisão de "+marco+" dias":"Registrar evidência da semana"} onClose={onClose} largo>
    <p className="pdi-help">{isMarco
      ?"Use as evidências acumuladas para registrar fatos, evolução observada e os próximos combinados."
      :"Evidência é algo que aconteceu. Escolha a ação praticada e conte um caso real usando situação → impacto → decisão → resultado."}</p>
    {!isMarco&&<div className="field"><label>Ação do PDI praticada *</label><select value={acaoId} onChange={e=>setAcaoId(e.target.value)}>
      <option value="">Selecione uma ação</option>{(jornada.acoes||[]).filter(a=>a.status!=="cancelada").map(a=><option key={a.id} value={a.id}>{a.titulo}</option>)}
    </select></div>}
    {!isMarco&&acao&&<div className="pdi-evidence-guide">
      <strong>O que fazer nesta ação</strong><p>{acao.como_fazer||"A orientação detalhada ainda precisa ser completada pelo Admin."}</p>
      <strong>Evidência esperada</strong><p>{acao.evidencia_esperada||"Registre uma situação real em que aplicou esta ação."}</p>
    </div>}
    <div className="field"><label>{isMarco?"O que foi observado nesses "+marco+" dias?":"1. Situação: o que aconteceu?"} *</label><textarea rows="3" value={situacao} onChange={e=>setSituacao(e.target.value)} placeholder="Descreva um caso real, de forma objetiva..." /></div>
    <div className="field"><label>{isMarco?"Impacto na rotina e nas entregas":"2. Qual foi o impacto?"} *</label><textarea rows="2" value={impacto} onChange={e=>setImpacto(e.target.value)} placeholder="Consequências para o trabalho, cliente ou equipe..." /></div>
    <div className="field"><label>{isMarco?"O que precisa evoluir no próximo período?":"3. O que você fez ou decidiu?"} *</label><textarea rows="2" value={proposta} onChange={e=>setProposta(e.target.value)} placeholder="Ação tomada, alternativa escolhida ou mudança de comportamento..." /></div>
    <div className="field"><label>{isMarco?"Conclusões, feedback e combinados":"4. Qual foi o resultado ou aprendizado?"} *</label><textarea rows="2" value={resultado} onChange={e=>setResultado(e.target.value)} placeholder="Resultado observado, mesmo que parcial..." /></div>
    {isMarco&&<div className="field"><label>Avaliação do progresso neste período (1–5)</label><select value={avaliacao} onChange={e=>setAvaliacao(e.target.value)}>
      {[1,2,3,4,5].map(n=><option value={n} key={n}>{n} · {["","Necessita apoio","Em construção","Evolução inicial","Evolução consistente","Evolução demonstrada"][n]}</option>)}
    </select><small>Registro da liderança baseado nas evidências do período, sem comparação entre pessoas.</small></div>}
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
    <div className="field"><label>Feedback objetivo e próximo passo *</label><textarea rows="4" value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="O que demonstrou evolução? O que deve ser repetido ou ajustado na próxima situação?" /></div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={saving} onClick={enviar}>{saving?"Salvando...":"Registrar feedback"}</button></div>
  </PdiJornadaModal>;
}

function PdiEtapasGuia({ jornada, onAcao }) {
  return <section className="pdi-panel pdi-guide-panel">
    <div className="pdi-section-title"><div><span className="pdi-eyebrow">MAPA DA JORNADA</span><h3>O que acontece em cada etapa</h3></div></div>
    <p className="pdi-help">O PDI não é uma lista de tarefas soltas. Ele começa com um ponto de partida, vira ações práticas e termina mostrando o que mudou.</p>
    <div className="pdi-stage-grid">{(jornada.etapas||[]).map(e=><article className={"pdi-stage "+e.status} key={e.chave}>
      <div className="pdi-stage-top"><span>{e.numero}</span><div><strong>{e.titulo}</strong><small>{e.responsavel}</small></div><em>{PDI_ETAPA_STATUS[e.status]||e.status}</em></div>
      <div className="pdi-stage-copy"><b>O que fazer</b><p>{e.o_que_fazer}</p><b>Como fazer</b><p>{e.como_fazer}</p><b>Conclui quando</b><p>{e.conclui_quando}</p></div>
    </article>)}</div>
  </section>;
}

function PdiEvolucaoPanel({ jornada }) {
  const diagnosticos=jornada.diagnosticos||[];
  const inicial=diagnosticos.find(d=>d.momento==="inicial");
  const atual=[...diagnosticos].filter(d=>d.momento!=="inicial").sort((a,b)=>Number(a.momento)-Number(b.momento)).pop();
  return <section className="pdi-panel">
    <div className="pdi-section-title"><div><span className="pdi-eyebrow">ANTES × AGORA</span><h3>Mapa de evolução</h3></div></div>
    {!inicial&&<div className="pdi-empty-mini">O mapa aparece assim que o diagnóstico inicial for respondido.</div>}
    {inicial&&!jornada.tem_comparacao&&<>
      <div className="pdi-baseline-card"><strong>🧭 Ponto A registrado</strong><p>Seu diagnóstico inicial já está salvo. Nos marcos de 30, 60 e 90 dias as mesmas dimensões serão respondidas novamente.</p><small>Média inicial: {inicial.media?.toFixed?.(1)||inicial.media}/5 · {PdiDataBR(inicial.criado_em)}</small></div>
      <div className="pdi-hint"><strong>Agora precisamos de fatos.</strong><p>As evidências semanais e os marcos dão contexto para que a próxima comparação não seja apenas sensação.</p></div>
    </>}
    {jornada.tem_comparacao&&<>
      <div className="pdi-evolution-summary">
        <div><small>Ponto inicial</small><strong>{inicial?.media?.toFixed?.(1)||inicial?.media}</strong></div>
        <span>→</span>
        <div><small>{atual?.momento_label||"Atual"}</small><strong>{atual?.media?.toFixed?.(1)||atual?.media}</strong></div>
        <div className={(jornada.evolucao_media||0)>=0?"positive":"negative"}><small>Variação média</small><strong>{(jornada.evolucao_media||0)>0?"+":""}{jornada.evolucao_media}</strong></div>
      </div>
      <div className="pdi-evolution-list">{(jornada.evolucao||[]).map(d=><div key={d.chave} className="pdi-evolution-row">
        <div><strong>{d.label}</strong><small>{d.inicial} → {d.atual}</small></div>
        <div className="pdi-evolution-bars"><i style={{width:(d.inicial/5*100)+"%"}}/><b style={{width:(d.atual/5*100)+"%"}}/></div>
        <span className={d.delta>0?"up":d.delta<0?"down":"same"}>{d.delta>0?"+":""}{d.delta}</span>
      </div>)}</div>
      {atual?.conquistas&&<div className="pdi-achievement-note"><strong>Conquistas registradas em {atual.momento_label}</strong><p>{atual.conquistas}</p></div>}
    </>}
  </section>;
}

function PdiActionCard({ jornada, acao, historico=false, onEdit }) {
  const [aberta,setAberta]=React.useState(false);
  return <article className={"pdi-guided-action"+(acao.configuracao_completa?"":" needs-detail")}>
    <button type="button" className="pdi-guided-action-head" onClick={()=>setAberta(!aberta)}>
      <div><strong>{acao.titulo}</strong><small>{acao.categoria||"Desenvolvimento"} · {acao.status.replaceAll("_"," ")}{acao.prazo?" · prazo "+PdiDataBR(acao.prazo):""}</small></div>
      <div className="pdi-action-head-flags">{!acao.configuracao_completa&&!historico&&<span>precisa detalhar</span>}<b>{aberta?"−":"+"}</b></div>
    </button>
    {aberta&&<div className="pdi-guided-action-body">
      {acao.descricao&&<div><b>Objetivo desta ação</b><p>{acao.descricao}</p></div>}
      {acao.como_fazer&&<div><b>Como fazer</b><p>{acao.como_fazer}</p></div>}
      {acao.evidencia_esperada&&<div><b>O que registrar como evidência</b><p>{acao.evidencia_esperada}</p></div>}
      {acao.criterio_sucesso&&<div><b>Como reconhecer avanço</b><p>{acao.criterio_sucesso}</p></div>}
      {!acao.configuracao_completa&&!historico&&<div className="pdi-action-missing">Esta ação veio do PDI anterior e ainda não tem instrução completa. O Admin pode detalhá-la agora.</div>}
      {(acao.comentarios||[]).length>0&&<div className="pdi-legacy-checkins">
        <b>Check-ins preservados</b>
        {acao.comentarios.map(c=><div className="pdi-legacy-comment" key={c.id}>
          <EnvoxersShared.Avatar nome={c.autor_nome||"?"} fotoUrl={c.autor_foto||null} size="sm" envoxerId={c.autor_id} />
          <div>
            <small>{c.autor_nome||"—"} · {c.criado_em?new Date(c.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}</small>
            <p>{c.texto}</p>
          </div>
        </div>)}
      </div>}
      {onEdit&&<div className="pdi-action-admin-actions"><button className="btn btn-sm" onClick={()=>onEdit(acao)}>Editar ação</button></div>}
    </div>}
  </article>;
}

function PdiJornadaDetalhe({ jornada, onVoltar, onRefresh, envoxerId }) {
  const [modal,setModal]=React.useState(null);
  const [configs,setConfigs]=React.useState(false);
  const [historicoAberto,setHistoricoAberto]=React.useState(false);
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

  const percent=Number(jornada.jornada_pct ?? jornada.progresso_pct)||0;
  const abrirProximoPasso=()=>{
    const p=jornada.proximo_passo||{};
    if(p.tipo==="diagnostico")setModal({tipo:"diagnostico",momento:p.momento||(jornada.diagnosticos_disponiveis||[])[0]||"inicial"});
    else if(p.tipo==="acao_admin")setModal({tipo:"acao"});
    else if(p.tipo==="evidencia")setModal({tipo:"evidencia"});
    else if(p.tipo==="validacao"){
      const r=(jornada.registros||[]).find(x=>x.tipo==="evidencia"&&x.status_validacao==="pendente");
      if(r)setModal({tipo:"validar",registro:r});
    }
  };

  return <div className="pdi-jornada-page">
    <div className="pdi-top-actions">
      <button className="btn btn-sm" onClick={onVoltar}>← Voltar</button>
      <span className="pdi-pill">Ciclo {PdiDataBR(jornada.inicio)} a {PdiDataBR(jornada.fim)}</span>
      {jornada.pode_administrar&&<button className="btn btn-sm" onClick={()=>setConfigs(!configs)}>⚙ Administrar</button>}
    </div>

    <div className="pdi-hero">
      <div className="pdi-hero-info">
        <div className="pdi-eyebrow">JORNADA DE DESENVOLVIMENTO · {jornada.dias_total} DIAS</div>
        <h2>{jornada.envoxer_nome}</h2>
        <p>{jornada.nome}</p>
        <div className="pdi-hero-tags"><span>Semana {jornada.semana_atual||"—"} de {jornada.semanas_total}</span><span>{jornada.dias_passados} dias do ciclo</span><span>Gestor: {jornada.gestor_nome}</span></div>
      </div>
      <div className="pdi-hero-progress" role="img" aria-label={percent+"% da jornada"} style={{background:"conic-gradient(#7657e8 "+percent+"%, rgba(255,255,255,.13) 0)"}}>
        <div><strong>{percent}%</strong><small>jornada estruturada</small></div>
      </div>
    </div>

    {configs&&<div className="pdi-panel pdi-config">
      <div><h3>Administração da jornada</h3><p>Neste momento, o Admin configura o PDI. O Gestor continua acompanhando feedbacks e marcos.</p></div>
      <div className="pdi-config-controls"><label><input type="checkbox" checked={lembreteAtivo} onChange={e=>setLembreteAtivo(e.target.checked)} /> Ativar lembretes</label>
        <select value={lembreteDia} onChange={e=>setLembreteDia(Number(e.target.value))}>{PDI_DIAS.map((v,i)=><option value={i} key={i}>{v}-feira</option>)}</select>
        <button className="btn btn-sm btn-primary" disabled={salvandoConfig} onClick={salvarConfig}>Salvar</button>
        <button className="btn btn-sm" onClick={habilitarPush}>Ativar push neste dispositivo</button>
      </div>
      <small>Cadastro de jornada e ações: Admin. Validação de evidências e marcos: Admin ou gestor responsável.</small>
    </div>}

    <PdiEtapasGuia jornada={jornada} />

    {jornada.proximo_passo&&<section className={"pdi-next-step "+jornada.proximo_passo.tipo}>
      <div><span>PRÓXIMO PASSO</span><h3>{jornada.proximo_passo.titulo}</h3><p>{jornada.proximo_passo.texto}</p></div>
      {jornada.proximo_passo.acao&&<button className="btn btn-primary" onClick={abrirProximoPasso}>{jornada.proximo_passo.acao} →</button>}
    </section>}

    <div className="pdi-metric-grid">
      <div className="pdi-metric"><span>🧭</span><strong>{jornada.diagnostico_inicial_concluido?"OK":"—"}</strong><p>Ponto de partida</p></div>
      <div className="pdi-metric"><span>🎯</span><strong>{(jornada.acoes||[]).filter(a=>a.status!=="cancelada").length}</strong><p>Ações do ciclo</p></div>
      <div className="pdi-metric"><span>🌱</span><strong>{jornada.semanas_validadas.length}<small>/{jornada.semanas_total}</small></strong><p>Semanas validadas</p></div>
      <div className="pdi-metric"><span>🏅</span><strong>{jornada.badges.length}</strong><p>Conquistas registradas</p></div>
    </div>

    <div className="pdi-columns">
      <div className="pdi-left">
        <section className="pdi-panel">
          <div className="pdi-section-title">
            <div><span className="pdi-eyebrow">PLANO DE DESENVOLVIMENTO</span><h3>Ações: o que fazer e como fazer</h3></div>
            {jornada.pode_administrar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"acao"})}>+ Nova ação</button>}
          </div>
          <p className="pdi-help">Cada ação precisa ser concreta o suficiente para a pessoa saber o que praticar, qual evidência registrar e como reconhecer avanço.</p>
          {(jornada.acoes||[]).length===0&&<div className="pdi-empty-action">
            <strong>Nenhuma ação cadastrada neste ciclo.</strong>
            <p>{jornada.pode_administrar?"Cadastre a primeira ação para transformar o diagnóstico em prática.":"O Admin ainda está estruturando seu plano de ações."}</p>
            {jornada.pode_administrar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"acao"})}>Cadastrar primeira ação</button>}
          </div>}
          <div className="pdi-guided-actions">{(jornada.acoes||[]).map(a=><PdiActionCard key={a.id} jornada={jornada} acao={a} onEdit={jornada.pode_administrar?(acao)=>setModal({tipo:"acao",acao}):null} />)}</div>

          {(jornada.historico_acoes||[]).length>0&&<div className="pdi-history-inline">
            <button type="button" onClick={()=>setHistoricoAberto(!historicoAberto)}>↺ Histórico anterior · {jornada.historico_acoes.length} ação(ões) {historicoAberto?"▲":"▼"}</button>
            {historicoAberto&&<div className="pdi-guided-actions legacy">{jornada.historico_acoes.map(a=><PdiActionCard key={a.id} jornada={jornada} acao={a} historico />)}</div>}
          </div>}
        </section>

        <section className="pdi-panel">
          <div className="pdi-section-title"><div><span className="pdi-eyebrow">PRÁTICA SEMANAL</span><h3>Evidências da rotina</h3></div>{jornada.pode_registrar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"evidencia"})}>+ Registrar evidência</button>}</div>
          <p className="pdi-help">A evolução precisa aparecer em situações reais. Uma evidência por semana é suficiente quando ela explica contexto, decisão e aprendizado.</p>
          {!jornada.diagnostico_inicial_concluido&&<div className="pdi-alert pdi-alert-warn"><span>●</span>Primeiro responda o diagnóstico inicial. Ele é o ponto de comparação do ciclo.</div>}
          {jornada.alertas.length>0&&<div className="pdi-alert-list">{jornada.alertas.map((a,i)=><div className={"pdi-alert "+(a.nivel==="atencao"?"pdi-alert-warn":"")} key={i}><span>●</span>{a.texto}</div>)}</div>}
          <div className="pdi-week-grid" aria-label="Calendário de semanas do ciclo">
            {Array.from({length:jornada.semanas_total},(_,i)=>{const sem=i+1,valid=jornada.semanas_validadas.includes(sem),recorded=jornada.semanas_registradas.includes(sem);
              return <div key={sem} title={"Semana "+sem+(valid?": validada":recorded?": registrada":"")} className={"pdi-week "+(valid?"is-valid":recorded?"is-recorded":sem===jornada.semana_atual?"is-current":"")}><small>S{sem}</small><strong>{valid?"✓":recorded?"◌":sem===jornada.semana_atual?"●":"·"}</strong></div>})}
          </div>
          <p className="pdi-small">✓ Validada · ◌ aguardando feedback · ● semana atual. O registro é evidência de aprendizado, não controle de produtividade.</p>
        </section>

        <section className="pdi-panel">
          <div className="pdi-section-title"><div><span className="pdi-eyebrow">CONVERSAS QUE IMPORTAM</span><h3>1:1 e marcos de 30/60/90 dias</h3></div>{jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"1a1"})}>+ Registrar 1:1</button>}</div>
          <div className="pdi-milestones">
            <div className="pdi-1a1-hint">💬 Próximo 1:1: <strong>{PdiDataBR(jornada.proximo_1a1)}</strong> · use as evidências recentes como pauta.</div>
            {jornada.marcos.map((m,i)=><div key={m.dia} className={"pdi-milestone "+(m.concluido?"done":m.pendente?"due":"")}>
              <div className="pdi-milestone-symbol">{m.concluido?"✓":m.pendente?"!":i+1}</div>
              <div><strong>{m.dia} dias</strong><small>{PdiDataBR(m.data)} · {m.concluido?"Revisão registrada":m.pendente?"Revisão pendente":"Próxima revisão"} · mapa {m.diagnostico_concluido?"✓":"pendente"}</small></div>
              {m.pendente&&jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"marco",marco:m.dia})}>Avaliar</button>}
            </div>)}
          </div>
        </section>
      </div>

      <div className="pdi-right">
        <PdiEvolucaoPanel jornada={jornada} />
        <section className="pdi-panel"><span className="pdi-eyebrow">CONQUISTAS REAIS</span><h3>Meu crescimento</h3>
          {jornada.badges.length?<div className="pdi-badges">{jornada.badges.map((b,i)=><div key={b.nome+"-"+i} className="pdi-badge" title={b.texto}><span>{b.icone}</span><div><strong>{b.nome}</strong><small>{b.texto}</small></div></div>)}</div>:<div className="pdi-empty-mini">As conquistas aparecem a partir do diagnóstico, das evidências, das ações concluídas e dos marcos.</div>}
          <div className="pdi-hint"><strong>Sem ranking.</strong><p>A comparação é sempre com o próprio ponto inicial. O sistema mostra trajetória, não competição.</p></div>
        </section>

        <section className="pdi-panel"><span className="pdi-eyebrow">REGISTROS AUDITÁVEIS</span><h3>Linha do tempo</h3>
          {jornada.registros.length===0&&<div className="pdi-empty-mini">Ainda não há evidências. Depois do diagnóstico inicial e do plano de ações, registre o primeiro caso real.</div>}
          <div className="pdi-feed">{jornada.registros.map(r=><article key={r.id} className="pdi-entry">
            <div className="pdi-entry-top"><strong>{r.tipo==="marco"?"🏅 Revisão de "+r.marco_dia+" dias":"🌱 Evidência de evolução"}</strong><span className={"pdi-entry-status "+r.status_validacao}>{PDI_STATUS[r.status_validacao]}</span></div>
            <small>{r.autor_nome} · {new Date(r.criado_em).toLocaleString("pt-BR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small>
            <div className="pdi-entry-text"><strong>Situação</strong><p>{r.situacao}</p><strong>Impacto</strong><p>{r.impacto}</p><strong>Ação</strong><p>{r.proposta}</p><strong>Resultado / aprendizado</strong><p>{r.resultado}</p></div>
            {r.tipo==="marco"&&<div className="pdi-entry-note">Avaliação da liderança: {r.avaliacao}/5</div>}
            {r.feedback_gestor&&<div className="pdi-entry-note"><strong>Feedback:</strong> {r.feedback_gestor} <small>· {r.validado_por_nome}</small></div>}
            {r.tipo==="evidencia"&&r.status_validacao==="pendente"&&jornada.pode_validar&&<button className="btn btn-sm btn-primary" onClick={()=>setModal({tipo:"validar",registro:r})}>Revisar evidência</button>}
          </article>)}</div>
        </section>
      </div>
    </div>

    {modal?.tipo==="diagnostico"&&<PdiDiagnosticoForm jornada={jornada} momento={modal.momento} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="acao"&&<PdiAcaoAdminForm jornada={jornada} acao={modal.acao} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="1a1"&&<PdiConversa1a1Form jornada={jornada} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="evidencia"&&<PdiRegistroForm jornada={jornada} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="marco"&&<PdiRegistroForm jornada={jornada} marco={modal.marco} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
    {modal?.tipo==="validar"&&<PdiValidarForm jornada={jornada} registro={modal.registro} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onRefresh()}} />}
  </div>;
}

function PdiCriarJornada({ onClose, onSaved, envoxerId, permissao }) {
  const [pessoas,setPessoas]=React.useState([]);
  const [pessoa,setPessoa]=React.useState("");
  const [gestor,setGestor]=React.useState("");
  const [nome,setNome]=React.useState("Jornada de desenvolvimento · 90 dias");
  const [inicio,setInicio]=React.useState(new Date().toLocaleDateString("sv-SE"));
  const fimPadrao=(d=>{const x=new Date(d+"T12:00:00");x.setDate(x.getDate()+90);return x.toLocaleDateString("sv-SE")})(new Date().toLocaleDateString("sv-SE"));
  const [fim,setFim]=React.useState(fimPadrao);
  const [saving,setSaving]=React.useState(false);
  const toast=EnvoxersShared.useToast();

  React.useEffect(()=>{EnvoxersAPI.api("/envoxers").then(d=>setPessoas(d.filter(u=>u.ativo))).catch(e=>toast(e.message,"error"))},[]);
  const selecionarPessoa=(id)=>{
    setPessoa(id);
    const p=pessoas.find(x=>String(x.id)===String(id));
    if(p?.gestor_responsavel_id)setGestor(String(p.gestor_responsavel_id));
  };
  const mudarInicio=(v)=>{
    setInicio(v);
    const x=new Date(v+"T12:00:00");x.setDate(x.getDate()+90);setFim(x.toLocaleDateString("sv-SE"));
  };
  const add=async()=>{
    if(!pessoa||!gestor){toast("Escolha a pessoa e o gestor responsável.","error");return}
    if(nome.trim().length<4){toast("Informe um nome para a jornada.","error");return}
    setSaving(true);
    try{
      await EnvoxersAPI.api("/pdi/jornadas",{method:"POST",body:JSON.stringify({envoxer_id:Number(pessoa),gestor_id:Number(gestor),nome,inicio,fim,lembrete_dia:4})});
      toast("Jornada criada. O próximo passo é a pessoa responder o diagnóstico inicial.","success");onSaved();
    }catch(err){toast(err.message,"error")}finally{setSaving(false)}
  };
  const gestores=pessoas.filter(p=>p.permissao==="admin"||p.permissao==="gestor");
  return <PdiJornadaModal titulo="Nova jornada de desenvolvimento" onClose={onClose} largo>
    <div className="pdi-admin-note"><strong>Fluxo de início</strong><p>1. Admin cria a jornada. 2. A pessoa responde o diagnóstico inicial. 3. Admin cadastra as ações. 4. Começam evidências, 1:1 e marcos.</p></div>
    <div className="field"><label>Pessoa *</label><select value={pessoa} onChange={e=>selecionarPessoa(e.target.value)}><option value="">Selecione</option>{pessoas.filter(p=>p.id!==envoxerId||p.permissao!=="admin").map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
    <div className="field"><label>Nome da jornada *</label><input value={nome} onChange={e=>setNome(e.target.value)} /></div>
    <div className="form-row">
      <div className="field"><label>Gestor responsável *</label><select value={gestor} onChange={e=>setGestor(e.target.value)}><option value="">Selecione</option>{gestores.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
      <div className="field"><label>Início *</label><input type="date" value={inicio} onChange={e=>mudarInicio(e.target.value)} /></div>
      <div className="field"><label>Fim *</label><input type="date" value={fim} onChange={e=>setFim(e.target.value)} /></div>
    </div>
    <div className="pdi-hint"><strong>Depois de criar</strong><p>Não cadastre ações “no escuro”. Peça o diagnóstico inicial e use o ponto de partida para detalhar o plano.</p></div>
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
  if(detalheId&&detalhe)return <PdiJornadaDetalhe jornada={detalhe} envoxerId={envoxerId} onVoltar={()=>setSelecionada(null)} onRefresh={carregar}/>;

  const lista=aba==="equipe"?equipes:minhas;
  return <div className="pdi-experience">
    <div className="pdi-screen-head"><div><div className="pdi-eyebrow">F4 · DESENVOLVIMENTO DE PESSOAS</div><h2>Jornadas de desenvolvimento</h2><p>Diagnóstico → ações → prática → feedback → evolução visível.</p></div>{permissao==="admin"&&<button className="btn btn-sm btn-primary" onClick={()=>setCriando(true)}>+ Nova jornada</button>}</div>
    <div className="pdi-subnav">{isLeader&&<button className={"chip"+(aba==="equipe"?" active":"")} onClick={()=>{setAba("equipe");setSelecionada(null)}}>Minha equipe</button>}<button className={"chip"+(aba==="minha"?" active":"")} onClick={()=>{setAba("minha");setSelecionada(null)}}>Minha jornada</button></div>

    <div className="pdi-onboarding-strip">
      <div><span>1</span><strong>Diagnóstico</strong><small>registrar o ponto A</small></div>
      <i>→</i><div><span>2</span><strong>Ações</strong><small>definir o que praticar</small></div>
      <i>→</i><div><span>3</span><strong>Evidências</strong><small>aplicar na rotina</small></div>
      <i>→</i><div><span>4</span><strong>Feedback</strong><small>ajustar o caminho</small></div>
      <i>→</i><div><span>5</span><strong>Evolução</strong><small>comparar antes × agora</small></div>
    </div>

    {carregando?<div className="app-loading">Carregando jornadas...</div>:<div>
      <div className="pdi-team-grid">{lista.map(j=><button key={j.id} type="button" className="pdi-person-card" onClick={()=>setSelecionada(j.id)}>
        <div className="pdi-person-top"><div className="pdi-person-avatar">{(j.envoxer_nome||"?").trim().slice(0,1).toUpperCase()}</div><div><strong>{j.envoxer_nome}</strong><small>{j.nome} · até {PdiDataBR(j.fim)}</small></div><span>→</span></div>
        <div className="pdi-progress-title"><span>Progresso da jornada</span><strong>{j.jornada_pct??j.progresso_pct}%</strong></div><div className="pdi-progress-track"><i style={{width:(j.jornada_pct??j.progresso_pct)+"%"}} /></div>
        <div className="pdi-person-tags"><span>{j.diagnostico_inicial_concluido?"🧭 diagnóstico":"⚠ diagnóstico pendente"}</span><span>🎯 {j.acoes.length} ações</span><span>🌱 {j.semanas_validadas.length} semanas</span>{j.pendentes_validacao>0&&<span className="pdi-flag">💬 {j.pendentes_validacao} feedback(s)</span>}</div>
        {j.proximo_passo&&<div className="pdi-person-alert">{j.proximo_passo.titulo}</div>}
      </button>)}</div>
      {lista.length===0&&<div className="pdi-panel"><h3>{aba==="minha"?"Você ainda não tem uma jornada ativa.":"Nenhuma jornada sob seu acompanhamento."}</h3><p className="pdi-help">A nova jornada concentra diagnóstico, ações, histórico, evidências e evolução em um único lugar.</p></div>}
    </div>}
    {criando&&<PdiCriarJornada permissao={permissao} envoxerId={envoxerId} onClose={()=>setCriando(false)} onSaved={()=>{setCriando(false);carregar()}} />}
  </div>;
}

// Lembrete transversal do PDI — disponível no dashboard sem entrar no F4.
function PdiAvisoGlobal({ envoxerId, permissao, view, onAbrir }) {
  const [alertas,setAlertas]=React.useState([]);
  const [fechado,setFechado]=React.useState(false);
  React.useEffect(()=>{
    if(permissao==="comercial"||!envoxerId)return;
    let ativo=true;
    const carregar=async()=>{
      try{
        const [minhas,equipe]=await Promise.all([
          EnvoxersAPI.api("/pdi/jornadas"),
          permissao==="admin"||permissao==="gestor"?EnvoxersAPI.api("/pdi/jornadas/equipe"):Promise.resolve([])
        ]);
        if(!ativo)return;
        const pessoal=(minhas||[]).filter(j=>j.status==="ativa").flatMap(j=>j.alertas||[]);
        const time=(equipe||[]).filter(j=>j.status==="ativa").flatMap(j=>(j.alertas||[]).filter(a=>["validacao","marco","plano"].includes(a.tipo)));
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

// Ritual de 15 dias: cria um Feedback 1:1 no módulo nativo e atualiza a jornada.
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
    <p className="pdi-help">Use as evidências recentes: o que evoluiu, o que travou, que apoio é necessário e qual será o próximo comportamento a praticar.</p>
    <div className="field"><label>Data da conversa</label><input type="date" value={data} onChange={e=>setData(e.target.value)} /></div>
    <div className="field"><label>Pauta e observações *</label><textarea rows="4" value={pauta} onChange={e=>setPauta(e.target.value)} placeholder="Quais evidências foram discutidas? Quais desafios surgiram?" /></div>
    <div className="field"><label>Combinados e próximos passos *</label><textarea rows="4" value={combinados} onChange={e=>setCombinados(e.target.value)} placeholder="O que cada pessoa fará até a próxima conversa?" /></div>
    <div className="form-actions"><button className="btn btn-sm" onClick={onClose}>Cancelar</button><button className="btn btn-sm btn-primary" disabled={salvando} onClick={salvar}>{salvando?"Salvando...":"Registrar conversa"}</button></div>
  </PdiJornadaModal>;
}
