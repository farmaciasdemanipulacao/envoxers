/* Admin → Monitoramento de Presença. Somente dados agregados da sessão de Foco. */
const {useState: useStatePresenca, useEffect: useEffectPresenca} = React;

function presencaDuracao(segundos) {
  if (segundos == null) return "Não disponível";
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? h + "h " + String(m).padStart(2, "0") + "min" : m + "min";
}
function presencaData(data) {
  if (!data) return "—";
  const d = new Date(data);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", {dateStyle:"short", timeStyle:"short"});
}
function presencaHojeData() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function PresencaMonitoramentoScreen() {
  const toast = EnvoxersShared.useToast();
  const [aba, setAba] = useStatePresenca("agora");
  const [dados, setDados] = useStatePresenca({colaboradores:[]});
  const [opcoes, setOpcoes] = useStatePresenca([]);
  const [historico, setHistorico] = useStatePresenca([]);
  const [config, setConfig] = useStatePresenca(null);
  const [auditoria, setAuditoria] = useStatePresenca([]);
  const [erro, setErro] = useStatePresenca("");
  const [carregando, setCarregando] = useStatePresenca(true);
  const [salvando, setSalvando] = useStatePresenca(false);
  const [exportando, setExportando] = useStatePresenca(false);
  const [filtros, setFiltros] = useStatePresenca({
    envoxer_id:"",gestor_id:"",status:"",tarefa_id:"",
    inicio:presencaHojeData(),fim:presencaHojeData()
  });
  const query = (history=false) => {
    const params = new URLSearchParams();
    ["envoxer_id","gestor_id","tarefa_id"].forEach(k => {
      if(filtros[k] !== "") params.set(k, filtros[k]);
    });
    if(history) {
      if(filtros.inicio) params.set("inicio", filtros.inicio);
      if(filtros.fim) params.set("fim", filtros.fim);
    } else if(filtros.status) params.set("status", filtros.status);
    return params.toString();
  };
  const carregar = async (silencioso=false) => {
    if(!silencioso) setCarregando(true);
    try {
      const caminho = aba === "historico" ? "/presenca/admin/historico?" + query(true)
        : aba === "auditoria" ? "/presenca/admin/auditoria"
        : "/presenca/admin/dashboard?" + query();
      const resposta = await EnvoxersAPI.api(caminho);
      if(aba === "agora") setDados(resposta || {colaboradores:[]});
      if(aba === "historico") setHistorico(resposta.registros || []);
      if(aba === "auditoria") setAuditoria(resposta || []);
      setErro("");
    } catch(e) {
      setErro(e.message || "Falha ao consultar monitoramento");
    } finally { setCarregando(false); }
  };
  useEffectPresenca(() => {
    EnvoxersAPI.api("/presenca/admin/config").then(setConfig).catch(e=>setErro(e.message));
    EnvoxersAPI.api("/envoxers").then(setOpcoes).catch(()=>{});
  },[]);
  useEffectPresenca(() => {
    carregar();
    if(aba === "agora") {
      const timer = setInterval(() => {
        if(!document.hidden) carregar(true);
      }, 20000);
      return () => clearInterval(timer);
    }
  },[aba, filtros.envoxer_id, filtros.gestor_id, filtros.status, filtros.tarefa_id,
      filtros.inicio, filtros.fim]);

  const mudarFiltro = (chave, valor) => setFiltros(prev => ({...prev,[chave]:valor}));
  const pessoas = dados.colaboradores || [];
  const contagem = {
    ativos:pessoas.filter(x=>x.timer_status==="ativo").length,
    pausados:pessoas.filter(x=>x.timer_status==="pausado").length,
    atencao:pessoas.filter(x=>x.possivel_inatividade).length,
    online:pessoas.filter(x=>x.online).length
  };
  const pessoasSelecao = opcoes;
  const atualizarConfig = async () => {
    setSalvando(true);
    try {
      const payload = {
        monitoramento_ativo:!!config.monitoramento_ativo,
        inatividade_min:Number(config.inatividade_min),
        alerta_min:Number(config.alerta_min),
        retencao_dias:Number(config.retencao_dias),
        notificar_colaborador:!!config.notificar_colaborador,
      };
      setConfig(await EnvoxersAPI.api("/presenca/admin/config", {method:"PUT",body:JSON.stringify(payload)}));
      toast("Parâmetros atualizados.", "success");
      carregar(true);
    } catch(e) {toast(e.message,"error");}
    finally { setSalvando(false); }
  };
  const exportar = async () => {
    setExportando(true);
    try {
      const path = "/api/v1/presenca/admin/exportar.csv?" + query(true);
      const response = await fetch(path,{headers:{Authorization:"Bearer "+EnvoxersAPI.getToken()}});
      if(!response.ok) throw new Error("Não foi possível gerar CSV ("+response.status+")");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "envoxers-presenca.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(e) {toast(e.message,"error");}
    finally {setExportando(false);}
  };

  return (
    <div className="page presenca-admin-page">
      <EnvoxersShared.PageHeader
        title="Monitoramento de Presença"
        subtitle="Acompanhamento dos timers, com dados mínimos e auditoria administrativa."
        actions={<button className="btn" onClick={()=>carregar()} disabled={carregando}>Atualizar</button>}
      />
      <div className="presenca-notice">
        <strong>Uso responsável dos dados</strong>
        <span>Ocioso significa apenas ausência detectada de teclado ou mouse, não ausência de trabalho. Não coletamos teclas, mensagens, telas nem imagens. A câmera permanece desligada.</span>
      </div>
      <div className="presenca-tabs">
        {[["agora","Painel ao vivo"],["historico","Histórico e relatórios"],["config","Regras e privacidade"],["auditoria","Auditoria"]].map(([k,v])=>(
          <button key={k} type="button" className={"btn "+(aba===k?"btn-primary":"")} onClick={()=>setAba(k)}>{v}</button>
        ))}
      </div>
      {aba!=="config" && aba!=="auditoria" && <div className="presenca-filtros">
        <label className="field"><span>Colaborador</span>
          <select value={filtros.envoxer_id} onChange={e=>mudarFiltro("envoxer_id",e.target.value)}>
            <option value="">Todos</option>
            {pessoasSelecao.map(p=><option value={p.envoxer_id} key={p.envoxer_id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="field"><span>Responsável da equipe</span><select value={filtros.gestor_id} onChange={e=>mudarFiltro("gestor_id",e.target.value)}><option value="">Todas as equipes</option>{opcoes.filter(p=>p.permissao==="admin" || p.permissao==="gestor").map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="field"><span>ID da tarefa</span><input type="number" min="1" placeholder="Todas" value={filtros.tarefa_id} onChange={e=>mudarFiltro("tarefa_id",e.target.value)} /></label>
        {aba==="agora" ? <label className="field"><span>Status</span>
          <select value={filtros.status} onChange={e=>mudarFiltro("status",e.target.value)}>
            <option value="">Todos</option><option value="ativo">Timer ativo</option><option value="pausado">Pausado</option>
            <option value="encerrado">Encerrado</option><option value="sem_timer">Sem timer</option><option value="possivel_inatividade">Possível inatividade</option>
          </select></label> : <>
          <label className="field"><span>De</span><input type="date" value={filtros.inicio} onChange={e=>mudarFiltro("inicio",e.target.value)} /></label>
          <label className="field"><span>Até</span><input type="date" value={filtros.fim} onChange={e=>mudarFiltro("fim",e.target.value)} /></label>
        </>}
      </div>}
      {erro && aba!=="config" && <div className="presenca-error" role="alert">{erro}</div>}
      {aba==="agora" && <>
        <div className="presenca-kpis">
          {[["Pessoas listadas",pessoas.length],["Online no Envoxers",contagem.online],["Timers rodando",contagem.ativos],["Pausados",contagem.pausados],["Possível inatividade",contagem.atencao]].map(([label,value])=>
            <div className="presenca-kpi" key={label}><small>{label}</small><strong>{value}</strong></div>
          )}
        </div>
        <p className="presenca-subline">Atualização automática a cada 20 segundos. Valores de ociosidade do computador somente pelo aplicativo desktop atualizado.</p>
        <div className="presenca-grid">
          {pessoas.map(p=><article className="presenca-card" key={p.envoxer_id}>
            <div className="presenca-identidade">
              <EnvoxersShared.Avatar nome={p.nome} fotoUrl={p.foto_url} size="md" envoxerId={p.envoxer_id} />
              <div><strong>{p.nome}</strong><small>{p.cargo || "Colaborador"}</small></div>
              <span className={"presenca-online "+(p.online?"online":"offline")}>{p.online?"Online":"Offline"}</span>
            </div>
            <div className="presenca-card-main"><span className={"presenca-status status-"+p.timer_status}>{p.timer_status==="ativo"?"Timer ativo":p.timer_status==="pausado"?"Timer pausado":p.timer_status==="encerrado"?"Encerrado":"Sem timer"}</span>
              {p.possivel_inatividade && <span className="presenca-status presenca-warning">Possível inatividade</span>}
              {p.alerta && <span className="presenca-status presenca-alerta">Alerta de tempo</span>}
            </div>
            <div className="presenca-task" title={p.tarefa||""}>{p.tarefa || "Nenhuma tarefa recente"}</div>
            <dl className="presenca-metricas">
              <div><dt>Tempo contabilizado</dt><dd>{presencaDuracao(p.duracao_segundos)}</dd></div>
              <div><dt>Última interação</dt><dd>{p.ultima_interacao?presencaData(p.ultima_interacao):"Não informada"}</dd></div>
              <div><dt>Tempo sem interação</dt><dd>{p.inatividade_segundos==null?"Não disponível":presencaDuracao(p.inatividade_segundos)}</dd></div>
              <div><dt>Origem</dt><dd>{p.fonte==="desktop"?"Desktop":p.fonte==="web"?"Envoxers web":"Sem sinal"}</dd></div>
            </dl>
            <small className="presenca-disclaimer">Não é medida de produtividade nem comprovação de presença.</small>
          </article>)}
        </div>
        {!carregando && !pessoas.length && !erro && <div className="empty">Nenhum colaborador corresponde aos filtros.</div>}
      </>}
      {aba==="historico" && <>
        <div className="presenca-actions">
          <span>Registros encontrados: <strong>{historico.length}</strong> (máximo de 93 dias por consulta).</span>
          <button type="button" className="btn" onClick={exportar} disabled={exportando}>{exportando?"Preparando…":"Exportar CSV"}</button>
        </div>
        <div className="presenca-table-wrap"><table className="presenca-table"><thead><tr>
          <th>Colaborador</th><th>Tarefa</th><th>Início</th><th>Fim</th><th>Contabilizado</th><th>Pausas</th><th>Possíveis intervalos</th><th>Justificativa</th>
        </tr></thead><tbody>{historico.map(h=><tr key={h.registro_foco_id}>
          <td><strong>{h.envoxer}</strong></td><td>{h.tarefa || "—"}</td><td>{presencaData(h.inicio)}</td><td>{presencaData(h.fim)}</td>
          <td>{presencaDuracao(h.duracao_segundos)}</td><td>{presencaDuracao(h.pausas_segundos)}</td>
          <td>{h.intervalos.length} {h.alertas ? "· "+h.alertas+" alerta(s)" : ""}
            {h.intervalos.length>0 && <details><summary>Ver horários</summary>
              {h.intervalos.map((i,n)=><div key={n}>{presencaData(i.inicio)} a {presencaData(i.fim)}{i.alerta?" · Alerta":""}</div>)}
            </details>}</td>
          <td>{h.justificativa || "—"} {h.ajustes_admin?.length ? <small>({h.ajustes_admin.length} correção(ões))</small> : null}</td>
        </tr>)}</tbody></table></div>
        {!carregando && !historico.length && !erro && <div className="empty">Sem registros para o período.</div>}
      </>}
      {aba==="config" && <div className="presenca-config">
        {config ? <>
          <div className="presenca-config-card">
            <h3>Parâmetros de atividade</h3>
            <p>As mudanças não pausam, encerram ou recalculam os timers.</p>
            <div className="presenca-config-fields">
              <label className="field presenca-check"><input type="checkbox" checked={config.monitoramento_ativo} onChange={e=>setConfig({...config,monitoramento_ativo:e.target.checked})} /> Monitoramento habilitado</label>
              <label className="field"><span>Possível inatividade após (min)</span><input type="number" min="2" max="120" value={config.inatividade_min} onChange={e=>setConfig({...config,inatividade_min:e.target.value})}/></label>
              <label className="field"><span>Alertar após (min)</span><input type="number" min="2" max="240" value={config.alerta_min} onChange={e=>setConfig({...config,alerta_min:e.target.value})}/></label>
              <label className="field"><span>Retenção de intervalos (dias)</span><input type="number" min="30" max="365" value={config.retencao_dias} onChange={e=>setConfig({...config,retencao_dias:e.target.value})}/></label>
              <label className="field presenca-check"><input type="checkbox" checked={config.notificar_colaborador} onChange={e=>setConfig({...config,notificar_colaborador:e.target.checked})}/> Avisar colaborador sobre alerta, quando detectado</label>
            </div>
            <div className="form-actions"><button className="btn btn-primary" onClick={atualizarConfig} disabled={salvando}>{salvando?"Salvando…":"Salvar parâmetros"}</button></div>
          </div>
          <div className="presenca-config-card">
            <h3>Verificação por câmera</h3>
            <p>Desabilitada. O administrador não pode ligar câmera sem solicitação e autorização explícita. A transmissão segura e os controles de consentimento ainda não foram implementados; portanto, nenhuma captura ou gravação é possível por este módulo.</p>
            <span className="presenca-status status-encerrado">Desativado</span>
          </div>
        </> : <div className="empty">Carregando configurações… {erro}</div>}
      </div>}
      {aba==="auditoria" && <div className="presenca-table-wrap"><table className="presenca-table">
        <thead><tr><th>Horário</th><th>Admin ID</th><th>Ação</th><th>Colaborador ID</th></tr></thead>
        <tbody>{auditoria.map(l=><tr key={l.id}><td>{presencaData(l.criado_em)}</td><td>{l.admin_envoxer_id}</td><td>{l.acao}</td><td>{l.alvo_envoxer_id||"—"}</td></tr>)}</tbody>
      </table></div>}
    </div>
  );
}
window.PresencaMonitoramentoScreen = PresencaMonitoramentoScreen;
