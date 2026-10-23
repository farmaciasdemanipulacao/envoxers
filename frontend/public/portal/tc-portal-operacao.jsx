/* Envoxers Portal Operacional. Não compartilha as APIs nem o estado do app interno. */
const PortalOperacao = (() => {
  const { useState, useEffect, useCallback } = React;
  const TIPOS = {
    novo_post: "Publicação / conteúdo", alteracao: "Alteração de material",
    material_extra: "Material gráfico", campanha: "Campanha", evento: "Evento"
  };
  const data = (valor) => valor ? new Date(String(valor).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "A definir";
  const dateTime = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "";
  function Status({ children }) { return <span className="po-status">{children}</span>; }
  function Empty({ text }) { return <div className="po-empty">{text}</div>; }
  function Shell() {
    const toast = EnvoxersShared.useToast();
    const [aba, setAba] = useState("inicio");
    const [config, setConfig] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [solicitacoes, setSolicitacoes] = useState([]);
    const [selecionada, setSelecionada] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [pesquisa, setPesquisa] = useState("");
    const [comentario, setComentario] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [form, setForm] = useState({
      unidade_id: "", frente_id: "", tipo: "novo_post", titulo: "", descricao: "",
      prazo_solicitado: "", apoio_envox: "", referencias: ""
    });
    const [camposExtras, setCamposExtras] = useState({});
    const [pessoas, setPessoas] = useState(null);
    const [pendencias, setPendencias] = useState(null);

    const carregar = useCallback(async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const [cfg, dash, lista] = await Promise.all([
          PortalAPI.api("/portal/operacao/configuracao"),
          PortalAPI.api("/portal/operacao/dashboard"),
          PortalAPI.api("/portal/operacao/solicitacoes")
        ]);
        setConfig(cfg); setDashboard(dash); setSolicitacoes(lista); setErro(null);
      } catch (e) {
        setErro(e.message || "Não foi possível carregar a operação.");
        if (!silencioso) toast(e.message || "Erro ao carregar portal", "error");
      } finally { if (!silencioso) setCarregando(false); }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);
    // Atualização periódica dos indicadores. NÃO simula timer/horas nem promete instantaneidade.
    useEffect(() => {
      const id = setInterval(() => { if (document.visibilityState === "visible") carregar(true); }, 30000);
      return () => clearInterval(id);
    }, [carregar]);

    const verDetalhe = async (id) => {
      try {
        const item = await PortalAPI.api("/portal/operacao/solicitacoes/" + id);
        setSelecionada(item); setAba("detalhe"); setComentario("");
      } catch (e) { toast(e.message || "Falha ao abrir solicitação", "error"); }
    };

    const enviar = async (e) => {
      e.preventDefault();
      if (!form.unidade_id && !form.frente_id) return toast("Escolha uma regional, uma frente ou ambas.", "error");
      const extras = (config?.formulario?.campos || []).filter(c => !["regional", "tipo", "titulo", "descricao", "prazo_solicitado", "apoio_envox", "referencias"].includes(c.chave));
      for (const campo of extras) {
        if (campo.obrigatorio && !String(camposExtras[campo.chave] || "").trim()) {
          toast("Preencha: " + campo.rotulo, "error"); return;
        }
      }
      setEnviando(true);
      try {
        const payload = {
          ...form, unidade_id: form.unidade_id ? Number(form.unidade_id) : null, frente_id: form.frente_id ? Number(form.frente_id) : null,
          campos_customizados: camposExtras
        };
        const item = await PortalAPI.api("/portal/operacao/solicitacoes", {method:"POST", body:JSON.stringify(payload)});
        toast("Solicitação " + item.protocolo + " recebida!", "success");
        setForm({unidade_id:"",frente_id:"",tipo:"novo_post",titulo:"",descricao:"",prazo_solicitado:"",apoio_envox:"",referencias:""});
        setCamposExtras({}); await carregar(true); await verDetalhe(item.id);
      } catch (e) { toast(e.message || "Não foi possível enviar", "error"); }
      finally { setEnviando(false); }
    };

    const postarComentario = async (e) => {
      e.preventDefault();
      if (!comentario.trim() || !selecionada) return;
      setEnviando(true);
      try {
        await PortalAPI.api("/portal/operacao/solicitacoes/" + selecionada.id + "/comentarios", {
          method:"POST", body:JSON.stringify({texto:comentario})
        });
        setComentario(""); await verDetalhe(selecionada.id);
        toast("Mensagem registrada.", "success");
      } catch (e) { toast(e.message || "Erro ao registrar mensagem", "error"); }
      finally { setEnviando(false); }
    };

    const caps = new Set(config?.capacidades || []);
    const adminSecovi = caps.has("gerenciar_usuarios");
    const perfil = adminSecovi
      ? {nome:"Administrador / Gestor SECOVI",titulo:"Visão do SECOVI",
         escopo:"Toda a organização",
         descricao:"Consulte demandas de todas as regionais e frentes, pessoas e acessos."}
      : {nome:"Solicitante",titulo:"Minhas áreas",
         escopo:"Regionais e frentes autorizadas",
         descricao:"Acompanhe demandas das regionais e frentes às quais você tem acesso, mesmo quando enviadas por outra pessoa."};
    const menu = [["inicio","Início"],["solicitacoes","Demandas"]];
    if (caps.has("solicitar")) menu.push(["nova","Nova solicitação"]);
    if (caps.has("aprovar")) menu.push(["pendencias","Em validação"]);
    if (adminSecovi) menu.push(["equipe","Pessoas e acessos"]);
    if (config?.produto?.modulos?.documentos !== false) menu.push(["documentos","Documentos"]);
    const principal = menu;
    const regionais = (config?.unidades || []).filter(u => u.tipo === "regional");
    const frentes = (config?.unidades || []).filter(u => u.tipo === "frente");
    const mostrarNova = caps.has("solicitar");
    const listaFiltrada = solicitacoes.filter(s =>
      [s.protocolo,s.titulo,s.status,s.solicitante].join(" ").toLowerCase().includes(pesquisa.toLowerCase())
    );
    const nome = localStorage.getItem("portal_nome") || "Olá";
    const organizacao = localStorage.getItem("portal_cliente_nome") || "Portal do Cliente";
    useEffect(() => {
      if (aba !== "equipe" || !caps.has("gerenciar_usuarios")) return;
      let ativo = true;
      PortalAPI.api("/portal/operacao/pessoas")
        .then(d => { if (ativo) setPessoas(d); })
        .catch(e => { if (ativo) toast(e.message || "Falha ao consultar pessoas", "error"); });
      return () => { ativo = false; };
    }, [aba, papel]);

    useEffect(() => {
      if (aba !== "pendencias" || !caps.has("aprovar")) return;
      let ativo = true;
      PortalAPI.api("/portal/operacao/pendencias")
        .then(d => { if (ativo) setPendencias(d); })
        .catch(e => { if (ativo) toast(e.message || "Falha ao consultar validações", "error"); });
      return () => { ativo = false; };
    }, [aba, papel]);

    const minhasAreas = [...regionais, ...frentes];
    const escopoVisivel = adminSecovi ? "Todas as regionais e frentes" :
      (minhasAreas.length ? minhasAreas.map(u=>u.nome).join(" · ") : "Nenhuma área vinculada");



    const campo = (id,label,tipo="text",required=true,placeholder="") =>
      <label className="po-field"><span>{label}{required ? " *" : ""}</span>
        <input name={id} type={tipo} required={required} placeholder={placeholder} value={form[id] || ""}
          onChange={e=>setForm({...form,[id]:e.target.value})}/>
      </label>;
    const textarea = (id,label,required=true,placeholder="") =>
      <label className="po-field po-wide"><span>{label}{required ? " *" : ""}</span>
        <textarea name={id} rows={4} required={required} placeholder={placeholder} value={form[id] || ""}
          onChange={e=>setForm({...form,[id]:e.target.value})}/>
      </label>;
    function CartaoSolicitacao({item}) { return (
      <button type="button" className="po-solicitacao" onClick={()=>verDetalhe(item.id)}>
        <span><strong>{item.titulo}</strong><small>{item.protocolo} · {TIPOS[item.tipo] || item.tipo} · {data(item.criado_em)}</small></span>
        <span className="po-solicitacao-end"><Status>{item.status}</Status><span aria-hidden="true">→</span></span>
      </button>
    );}

    return (
      <div className="po-layout">
        <aside className="po-sidebar">
          <div className="po-brand"><span className="po-logo"><i aria-hidden="true"/> ENVOX</span><small>PORTAL DO CLIENTE</small></div>
          <div className="po-org"><small>ORGANIZAÇÃO</small><strong>{organizacao}</strong></div>
          <nav aria-label="Navegação principal">
            {principal.map(([key,txt]) =>
              <button key={key} type="button" className={aba===key?"po-nav active":"po-nav"} onClick={()=>{setSelecionada(null);setAba(key);}}>{txt}</button>
            )}
          </nav>
          <div className="po-sidebar-footer">
            <span>{nome}</span><small>{perfil.nome} · {perfil.escopo}</small>
            <button type="button" onClick={()=>{PortalAPI.clearSession();location.reload();}}>Sair da conta</button>
          </div>
        </aside>
        <main className="po-main">
          <header className="po-top">
            <div><small>ENVOX / {organizacao.toUpperCase()}</small><h1>{
              aba==="inicio" ? perfil.titulo :
              aba==="solicitacoes" ? "Demandas" :
              aba==="nova" ? "Nova solicitação" :
              aba==="equipe" ? "Pessoas e acessos" : aba==="pendencias" ? "Em validação" :
              aba==="detalhe" ? "Acompanhar solicitação" : "Documentos"
            }</h1></div>
            <button className="po-refresh" onClick={()=>carregar()} aria-label="Atualizar dados">↻ Atualizar</button>
          </header>
          <div className="po-role-banner" aria-live="polite">
            <div><span className="po-role-label">SEU PERFIL</span>
              <strong>{perfil.nome}</strong><span className="po-role-divider" aria-hidden="true">•</span>
              <span>{escopoVisivel}</span>
            </div>
            <small>{perfil.descricao}</small>
          </div>
          {carregando ? <Empty text="Carregando dados da operação…" /> :
           erro && !config ? <Empty text={erro} /> :
           <>
            {aba==="inicio" && <section className="po-content">
              <p className="po-lead">{perfil.descricao}</p>
              <div className="po-metrics">
                {[
                  ["Solicitações",dashboard?.total||0],["Recebidas",dashboard?.recebidas||0],
                  ["Em triagem",dashboard?.triagem||0],["Em andamento",dashboard?.em_andamento||0]
                ].map(([label,valor])=><div className="po-metric" key={label}><small>{label}</small><strong>{valor}</strong></div>)}
              </div>
              <div className="po-section-head"><h2>{adminSecovi?"Pedidos da organização":"Demandas das suas áreas"}</h2><button onClick={()=>setAba("solicitacoes")}>Ver todas →</button></div>
              {!solicitacoes.length && <Empty text="Ainda não há solicitações disponíveis para o seu acesso." />}
              {solicitacoes.slice(0,6).map(item=><CartaoSolicitacao key={item.id} item={item}/>)}
              {mostrarNova && <button className="po-primary po-home-cta" onClick={()=>setAba("nova")}>+ Abrir nova solicitação</button>}
            </section>}
            {aba==="solicitacoes" && <section className="po-content">
              <p className="po-lead">{escopoVisivel}. Cada protocolo mostra apenas informações autorizadas para seu acesso.</p>
              <input className="po-search" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Buscar por título, protocolo ou status…" aria-label="Buscar solicitações"/>
              {!listaFiltrada.length && <Empty text="Nenhuma solicitação encontrada." />}
              {listaFiltrada.map(item=><CartaoSolicitacao key={item.id} item={item}/>)}
            </section>}
            {aba==="equipe" && caps.has("gerenciar_usuarios") && <section className="po-content">
              <p className="po-lead">Pessoas e áreas vinculadas ao SECOVI. A edição de acessos permanece no painel interno da Envox até sua homologação.</p>
              {!pessoas && <Empty text="Consultando acessos da instituição…"/>}
              {pessoas && <>
                <div className="po-metrics">
                  <div className="po-metric"><small>Pessoas ativas</small><strong>{pessoas.pessoas.length}</strong></div>
                  <div className="po-metric"><small>Regionais</small><strong>{pessoas.regionais.length}</strong></div>
                  <div className="po-metric"><small>Frentes</small><strong>{(pessoas.frentes||[]).length}</strong></div>
                </div>
                <article className="po-panel"><h3>Pessoas autorizadas</h3>
                  {pessoas.pessoas.map((u,i)=><div className="po-person-row" key={i}>
                    <strong>{u.nome}</strong><span>{u.papel.replace(/_/g," ")}</span>
                    <small>{(u.areas||[]).map(a => (a.tipo==="frente"?"Frente: ":"Regional: ")+a.nome).join(" · ") || "Administração institucional / sem área específica"}{u.pode_aprovar?" · Pode aprovar":""}</small>
                  </div>)}
                  {!pessoas.pessoas.length && <Empty text="Nenhum contato ativo."/>}
                </article>
              </>}
            </section>}
            {aba==="pendencias" && caps.has("aprovar") && <section className="po-content">
              <p className="po-lead">Solicitações vinculadas a demandas que estão aguardando validação no Kanban da Envox. A ação de aprovar ou pedir ajustes ainda não está disponível nesta homologação.</p>
              {!pendencias && <Empty text="Consultando demandas em validação…"/>}
              {pendencias && <>
                <div className="po-metric po-single-metric"><small>Materiais em validação</small><strong>{pendencias.length}</strong></div>
                {!pendencias.length && <Empty text="Nenhum material aguardando validação para seu acesso."/>}
                {pendencias.map(item=><CartaoSolicitacao key={item.id} item={item}/>)}
                <p className="po-footnote">Consulta somente leitura. Nenhuma aprovação será registrada aqui.</p>
              </>}
            </section>}
            {aba==="nova" && <section className="po-content po-form-area">
              {!mostrarNova ? <Empty text="Seu perfil não está autorizado a enviar solicitações."/> :
              regionais.length===0 && frentes.length===0 ? <Empty text="Seu acesso ainda não possui regionais ou frentes autorizadas. Solicite à Envox uma vinculação."/> :
              <>
                <p className="po-lead">Descreva o que precisa ser produzido. A data indicada é uma sugestão e será confirmada após a triagem.</p>
                <form onSubmit={enviar} className="po-form">
                  <label className="po-field"><span>Regional (opcional)</span><select value={form.unidade_id} onChange={e=>setForm({...form,unidade_id:e.target.value})}>
                    <option value="">Sem regional</option>{regionais.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></label>
                  <label className="po-field"><span>Frente / setor (opcional)</span><select value={form.frente_id} onChange={e=>setForm({...form,frente_id:e.target.value})}>
                    <option value="">Sem frente</option>{frentes.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></label>
                  <label className="po-field po-wide"><span>Tipo da demanda *</span><select required value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                    {Object.entries(TIPOS).map(([id,nome])=><option value={id} key={id}>{nome}</option>)}
                  </select></label>
                  {campo("titulo","Nome da demanda","text",true,"Ex.: Campanha de divulgação do evento")}
                  {campo("prazo_solicitado","Data desejada","date")}
                  {textarea("descricao","Briefing e objetivo",true,"O que precisa ser feito? Para qual público? Quais informações precisam aparecer?")}
                  {textarea("apoio_envox","Apoio necessário da Envox",true,"Ex.: criação de arte, edição de vídeo, captação…")}
                  {textarea("referencias","Referências / materiais de apoio",false,"Links e observações adicionais")}
                  {(config?.formulario?.campos || []).filter(c=>!["regional","tipo","titulo","descricao","prazo_solicitado","apoio_envox","referencias"].includes(c.chave)).map(c=>
                    <label className="po-field po-wide" key={c.chave}><span>{c.rotulo}{c.obrigatorio?" *":""}</span>
                      {c.tipo==="texto_longo"?<textarea required={!!c.obrigatorio} value={camposExtras[c.chave]||""} onChange={e=>setCamposExtras({...camposExtras,[c.chave]:e.target.value})}/>:
                      <input required={!!c.obrigatorio} type={c.tipo==="data"?"date":"text"} value={camposExtras[c.chave]||""} onChange={e=>setCamposExtras({...camposExtras,[c.chave]:e.target.value})}/>}
                    </label>
                  )}
                  <div className="po-form-actions"><p>Informe pelo menos uma regional ou frente. A data desejada ainda depende de confirmação.</p>
                    <button className="po-primary" type="submit" disabled={enviando}>{enviando?"Enviando…":"Enviar solicitação →"}</button>
                  </div>
                </form>
              </>}
            </section>}
            {aba==="detalhe" && selecionada && <section className="po-content">
              <button className="po-back" onClick={()=>setAba("solicitacoes")}>← Voltar às solicitações</button>
              <div className="po-detail-head"><div><small>{selecionada.protocolo}</small><h2>{selecionada.titulo}</h2></div><Status>{selecionada.status}</Status></div>
              <div className="po-info-grid">
                <div><small>Solicitada em</small><strong>{data(selecionada.criado_em)}</strong></div>
                <div><small>Data desejada</small><strong>{data(selecionada.prazo_solicitado)}</strong></div>
                <div><small>Prazo confirmado</small><strong>{data(selecionada.prazo_confirmado)}</strong></div>
                <div><small>Responsável pelo pedido</small><strong>{selecionada.solicitante || "Não informado"}</strong></div>
              </div>
              <article className="po-panel"><h3>Briefing</h3><p className="po-preline">{selecionada.descricao}</p>
                {selecionada.briefing?.apoio_envox && <><h4>Apoio solicitado</h4><p className="po-preline">{selecionada.briefing.apoio_envox}</p></>}
              </article>
              {!!selecionada.tarefas?.length && <article className="po-panel"><h3>Demandas vinculadas</h3>
                {selecionada.tarefas.map(t=><div className="po-linked" key={t.id}><span>{t.titulo}</span><Status>{t.status}</Status></div>)}
              </article>}
              <article className="po-panel"><h3>Linha do tempo</h3>
                {!(selecionada.eventos?.length) && <Empty text="Novas atualizações aparecerão aqui."/>}
                {(selecionada.eventos||[]).map((e,i)=><div className="po-event" key={i}><span className="po-event-dot"></span><div><strong>{e.descricao}</strong><small>{dateTime(e.criado_em)}</small></div></div>)}
              </article>
              <article className="po-panel"><h3>Conversas compartilhadas</h3>
                {!(selecionada.comentarios?.length) && <Empty text="Ainda não há mensagens compartilhadas nesta solicitação."/>}
                {(selecionada.comentarios||[]).map(c=><div className="po-message" key={c.id}><strong>{c.autor}</strong><small>{dateTime(c.criado_em)}</small><p className="po-preline">{c.texto}</p></div>)}
                {caps.has("comentar") && <form className="po-comment-form" onSubmit={postarComentario}>
                  <textarea value={comentario} onChange={e=>setComentario(e.target.value)} rows={3} placeholder="Escreva uma mensagem para a Envox…" maxLength={4000}/>
                  <button className="po-primary" disabled={enviando || !comentario.trim()}>Enviar mensagem</button>
                </form>}
              </article>
            </section>}
            {aba==="documentos" && <section className="po-documents"><PortalShell /></section>}
           </>}
        </main>
      </div>
    );
  }
  return { Shell };
})();
