/* Envoxers Portal Operacional. Não compartilha as APIs nem o estado do app interno. */
const PortalOperacao = (() => {
  const { useState, useEffect, useCallback } = React;
  const TIPOS = {
    novo_post: "Publicação / conteúdo", alteracao: "Alteração de material",
    material_extra: "Material gráfico", campanha: "Campanha", evento: "Evento"
  };
  const data = (valor) => valor ? new Date(String(valor).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "A definir";
  const dateTime = (valor) => valor ? new Date(valor).toLocaleString("pt-BR") : "";
  // Status públicos e das tarefas vêm da API com texto já amigável ao cliente.
  // As classes representam significado e permanecem estáveis caso a API evolua.
  const STATUS_TONS = {
    "Recebida":"recebida", "Em triagem":"triagem", "Em andamento":"andamento",
    "Não aceita":"recusada", "Em acompanhamento":"neutro",
    "Planejamento":"planejamento", "Em produção":"producao",
    "Em revisão":"revisao", "Aguardando aprovação":"aprovacao",
    "Em ajustes":"ajustes", "Programada":"programada", "Concluída":"concluida"
  };
  function Status({ children }) {
    const label = typeof children === "string" ? children.trim() : String(children || "");
    const tom = STATUS_TONS[label] || "neutro";
    return <span className={"po-status po-status--"+tom} data-status={tom}>
      {label || "Em acompanhamento"}
    </span>;
  }
  function Empty({ text }) { return <div className="po-empty">{text}</div>; }
  const ICON_PATHS = {
    inicio:<><path d="M2 7.5 8 2l6 5.5V14H9.5v-4h-3v4H2z"/></>,
    solicitacoes:<><path d="M2 3h12v9H6l-4 3z"/><path d="M5 6h6M5 9h4"/></>,
    nova:<><path d="M8 2v12M2 8h12"/></>,
    campanhas:<><path d="M2 12V5l8-3v12l-8-2z"/><path d="M10 6h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3"/></>,
    eventos:<><rect x="2" y="4" width="12" height="10" rx="2"/><path d="M5 2v4M11 2v4M2 7.5h12"/></>,
    pendencias:<><path d="M3 8l3 3 7-7"/><rect x="2" y="2" width="12" height="12" rx="2"/></>,
    equipe:<><circle cx="5.5" cy="5" r="2"/><circle cx="11" cy="6" r="1.5"/><path d="M2 14c0-2.6 1.5-4 3.5-4S9 11.4 9 14M10 11c2 0 3.5 1.5 3.5 3"/></>,
    documentos:<><path d="M4 2h6l3 3v9H4z"/><path d="M10 2v4h4M6 9h5M6 12h4"/></>,
  };
  function MenuIcon({nome}) {return <svg className="po-menu-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[nome]}</svg>;}

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
      unidade_id: "", frente_id: "", campanha_id:"", evento_id:"", tipo: "novo_post", titulo: "", descricao: "",
      prazo_solicitado: "", apoio_envox: "", referencias: ""
    });
    const [camposExtras, setCamposExtras] = useState({});
    const [pessoas, setPessoas] = useState(null);
    const [pendencias, setPendencias] = useState(null);
    const [campanhas,setCampanhas] = useState([]);
    const [eventosCatalogo,setEventosCatalogo] = useState([]);
    const [campanhaNova,setCampanhaNova] = useState("");
    const [criarCampanhaAberto,setCriarCampanhaAberto] = useState(false);
    const [eventoNovo,setEventoNovo] = useState({nome:"",data:""});
    const [criarEventoAberto,setCriarEventoAberto] = useState(false);
    const [criandoCatalogo,setCriandoCatalogo] = useState(false);
    const [filtroCatalogo,setFiltroCatalogo] = useState(null);

    const carregar = useCallback(async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const [cfg, dash, lista, campanhasApi, eventosApi] = await Promise.all([
          PortalAPI.api("/portal/operacao/configuracao"),
          PortalAPI.api("/portal/operacao/dashboard"),
          PortalAPI.api("/portal/operacao/solicitacoes"),
          PortalAPI.api("/portal/operacao/campanhas"),
          PortalAPI.api("/portal/operacao/eventos")
        ]);
        setConfig(cfg); setDashboard(dash); setSolicitacoes(lista);
        setCampanhas(campanhasApi);setEventosCatalogo(eventosApi);setErro(null);
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
      if (form.campanha_id === "" || form.evento_id === "") return toast("Indique a campanha e o evento, ou selecione Sem campanha / Sem evento.", "error");
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
          campanha_id:form.campanha_id==="none"?null:Number(form.campanha_id),
          evento_id:form.evento_id==="none"?null:Number(form.evento_id),
          campos_customizados: camposExtras
        };
        const item = await PortalAPI.api("/portal/operacao/solicitacoes", {method:"POST", body:JSON.stringify(payload)});
        toast("Solicitação " + item.protocolo + " recebida!", "success");
        setForm({unidade_id:"",frente_id:"",campanha_id:"",evento_id:"",tipo:"novo_post",titulo:"",descricao:"",prazo_solicitado:"",apoio_envox:"",referencias:""});
        setCamposExtras({}); await carregar(true); await verDetalhe(item.id);
      } catch (e) { toast(e.message || "Não foi possível enviar", "error"); }
      finally { setEnviando(false); }
    };

    const campanhaseventosDaArea = (itens) => itens.filter(c=>
      (!c.unidade_id && !c.frente_id) ||
      (String(c.unidade_id||"")===String(form.unidade_id||"") &&
       String(c.frente_id||"")===String(form.frente_id||"")));
    const selecionarArea = (campo,valor)=>setForm(prev=>({...prev,[campo]:valor,campanha_id:"",evento_id:""}));
    const criarCampanhaRapida = async (e) => {
      e.preventDefault();
      if(!campanhaNova.trim())return;
      if(!form.unidade_id&&!form.frente_id)return toast("Escolha a regional ou frente da campanha.", "error");
      setCriandoCatalogo(true);
      try {
        const criacao = await PortalAPI.api("/portal/operacao/campanhas", {method:"POST",body:JSON.stringify({
          nome:campanhaNova.trim(),unidade_id:form.unidade_id?Number(form.unidade_id):null,
          frente_id:form.frente_id?Number(form.frente_id):null
        })});
        setCampanhas(prev=>prev.some(c=>c.id===criacao.id)?prev:[criacao,...prev]);
        setForm(prev=>({...prev,campanha_id:String(criacao.id)}));
        setCampanhaNova("");setCriarCampanhaAberto(false);
        toast(criacao.ja_existia?"Campanha existente selecionada.":"Campanha criada e selecionada.","success");
      } catch(e){toast(e.message||"Não foi possível criar a campanha","error");}
      finally{setCriandoCatalogo(false);}
    };
    const criarEventoRapido = async (e) => {
      e.preventDefault();
      if(!eventoNovo.nome.trim()||!eventoNovo.data)return toast("Informe nome e data do evento.", "error");
      if(!form.unidade_id&&!form.frente_id)return toast("Escolha a regional ou frente do evento.", "error");
      setCriandoCatalogo(true);
      try {
        const criacao=await PortalAPI.api("/portal/operacao/eventos",{method:"POST",body:JSON.stringify({
          nome:eventoNovo.nome.trim(),data:eventoNovo.data,
          unidade_id:form.unidade_id?Number(form.unidade_id):null,
          frente_id:form.frente_id?Number(form.frente_id):null
        })});
        setEventosCatalogo(prev=>[criacao,...prev]);
        setForm(prev=>({...prev,evento_id:String(criacao.id)}));
        setEventoNovo({nome:"",data:""});setCriarEventoAberto(false);
        toast("Evento criado e selecionado.","success");
      } catch(e){toast(e.message||"Não foi possível criar o evento","error");}
      finally{setCriandoCatalogo(false);}
    };
    const abrirCatalogo=(abaDestino,id)=>{
      setFiltroCatalogo(id===undefined?null:{tipo:abaDestino,id});
      setAba(abaDestino==="campanhas"?"solicitacoes":abaDestino==="eventos"?"solicitacoes":abaDestino);
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
    const papel = config?.papel || "solicitante";
    const adminSecovi = caps.has("gerenciar_usuarios");
    const perfil = adminSecovi
      ? {nome:"Administrador / Gestor SECOVI",titulo:"Visão do SECOVI",
         escopo:"Toda a organização",
         descricao:"Consulte demandas de todas as regionais e frentes, pessoas e acessos."}
      : {nome:"Solicitante",titulo:"Minhas áreas",
         escopo:"Regionais e frentes autorizadas",
         descricao:"Acompanhe demandas das regionais e frentes às quais você tem acesso, mesmo quando enviadas por outra pessoa."};
    const menu = [["inicio","Início"],["solicitacoes","Demandas"],["campanhas","Campanhas"],["eventos","Eventos"]];
    if (caps.has("solicitar")) menu.push(["nova","Nova solicitação"]);
    if (caps.has("aprovar")) menu.push(["pendencias","Em validação"]);
    if (adminSecovi) menu.push(["equipe","Pessoas e acessos"]);
    if (config?.produto?.modulos?.documentos !== false) menu.push(["documentos","Documentos"]);
    const principal = menu;
    const regionais = (config?.unidades || []).filter(u => u.tipo === "regional");
    const frentes = (config?.unidades || []).filter(u => u.tipo === "frente");
    const mostrarNova = caps.has("solicitar");
    const listaFiltrada = solicitacoes.filter(s =>
      [s.protocolo,s.titulo,s.status,s.solicitante].join(" ").toLowerCase().includes(pesquisa.toLowerCase()) &&
      (!filtroCatalogo || (filtroCatalogo.tipo==="campanhas"
        ? s.campanha_id===filtroCatalogo.id : s.evento_id===filtroCatalogo.id))
    );
    const nome = localStorage.getItem("portal_nome") || "Olá";
    const organizacao = localStorage.getItem("portal_cliente_nome") || "Portal do Cliente";
    const primeiroNome = nome.trim().split(/\s+/)[0];
    const tituloPagina = aba==="inicio" ? "Visão geral" :
      aba==="solicitacoes" ? "Demandas" :
      aba==="campanhas" ? "Campanhas" :
      aba==="eventos" ? "Eventos" :
      aba==="nova" ? "Nova solicitação" :
      aba==="equipe" ? "Pessoas e acessos" :
      aba==="pendencias" ? "Em validação" :
      aba==="detalhe" ? "Acompanhar solicitação" : "Documentos";
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
        <span><strong>{item.titulo}</strong><small>{item.protocolo} · {TIPOS[item.tipo] || item.tipo} · {data(item.criado_em)}</small>
          <small className="po-request-tags">{item.campanha_id?(campanhas.find(c=>c.id===item.campanha_id)?.nome||"Campanha vinculada"):"Sem campanha"} · {item.evento_id?(eventosCatalogo.find(c=>c.id===item.evento_id)?.nome||"Evento vinculado"):"Sem evento"}</small>
        </span>
        <span className="po-solicitacao-end"><Status>{item.status}</Status><span aria-hidden="true">→</span></span>
      </button>
    );}

    return (
      <div className="po-layout">
        <aside className="po-sidebar">
          <div className="po-brand"><span className="po-logo"><i aria-hidden="true"/> ENVOX</span><small>PORTAL DO CLIENTE</small></div>
          <nav aria-label="Navegação principal">
            {principal.map(([key,txt]) =>
              <button key={key} type="button" aria-current={aba===key?"page":undefined}
                className={"po-nav"+(aba===key?" active":"")+(key==="nova"?" po-nav-new":"")}
                onClick={()=>{setSelecionada(null);setFiltroCatalogo(null);setAba(key);}}>
                <MenuIcon nome={key}/><span>{txt}</span>
              </button>
            )}
          </nav>
          <div className="po-sidebar-footer">
            <span className="po-user-name">{nome}</span>
            <small className="po-user-role" title={perfil.nome+" | "+escopoVisivel}>{perfil.nome}</small>
            <button type="button" onClick={()=>{PortalAPI.clearSession();location.reload();}}>Sair</button>
          </div>
        </aside>
        <main className="po-main">
          <header className="po-top">
            <div className="po-heading">
              <small className="po-context">{organizacao}</small>
              <h1>{tituloPagina}</h1>
            </div>
            <div className="po-top-actions">
              <small className="po-mobile-role">{perfil.nome}</small>
              <button type="button" className="po-refresh" onClick={()=>carregar()} title="Atualizar dados"
                aria-label="Atualizar dados">↻ <span>Atualizar</span></button>
            </div>
          </header>
          {carregando ? <Empty text="Carregando dados da operação…" /> :
           erro && !config ? <Empty text={erro} /> :
           <>
            {aba==="inicio" && <section className="po-content">
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
              {filtroCatalogo&&<div className="po-filter"><span>Exibindo demandas vinculadas a {filtroCatalogo.tipo==="campanhas"?"uma campanha":"um evento"}.</span><button type="button" onClick={()=>setFiltroCatalogo(null)}>Limpar filtro ×</button></div>}
              <input className="po-search" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Buscar por título, protocolo ou status…" aria-label="Buscar solicitações"/>
              {!listaFiltrada.length && <Empty text="Nenhuma solicitação encontrada." />}
              {listaFiltrada.map(item=><CartaoSolicitacao key={item.id} item={item}/>)}
            </section>}
            {aba==="campanhas" && <section className="po-content po-catalog-content">
              <div className="po-section-head po-catalog-toolbar">
                <p className="po-catalog-count">{campanhas.length} {campanhas.length===1?"campanha":"campanhas"} <span>·</span> {solicitacoes.length} demandas visíveis</p>
                {mostrarNova&&<button onClick={()=>{setAba("nova");setCriarCampanhaAberto(true);}}>+ Criar com solicitação</button>}</div>
              <div className="po-catalog-grid">
                {campanhas.map(c=><button type="button" className="po-catalog-card" key={c.id} onClick={()=>abrirCatalogo("campanhas",c.id)}>
                  <span className="po-catalog-icon campaign"><MenuIcon nome="campanhas"/></span>
                  <strong>{c.nome}</strong>
                  <small>{[...regionais,...frentes].filter(u=>u.id===c.unidade_id||u.id===c.frente_id).map(u=>u.nome).join(" · ")||"Institucional"}</small>
                  <div className="po-catalog-footer"><span>{c.total_solicitacoes||0} demandas</span><span>Ver demandas →</span></div>
                </button>)}
                <button type="button" className="po-catalog-card po-no-catalog" onClick={()=>abrirCatalogo("campanhas",null)}>
                  <span className="po-catalog-icon"><MenuIcon nome="campanhas"/></span><strong>Sem campanha</strong>
                  <small>Solicitações avulsas, não associadas a uma campanha</small>
                  <div className="po-catalog-footer"><span>{solicitacoes.filter(s=>!s.campanha_id).length} demandas</span><span>Ver demandas →</span></div>
                </button>
              </div>
            </section>}
            {aba==="eventos" && <section className="po-content po-catalog-content">
              <div className="po-section-head po-catalog-toolbar">
                <p className="po-catalog-count">{eventosCatalogo.length} {eventosCatalogo.length===1?"evento":"eventos"} <span>·</span> {solicitacoes.length} demandas visíveis</p>
                {mostrarNova&&<button onClick={()=>{setAba("nova");setCriarEventoAberto(true);}}>+ Criar com solicitação</button>}</div>
              <div className="po-catalog-grid">
                {eventosCatalogo.map(e=><button type="button" className="po-catalog-card" key={e.id} onClick={()=>abrirCatalogo("eventos",e.id)}>
                  <span className="po-catalog-icon event"><MenuIcon nome="eventos"/></span>
                  <strong>{e.nome}</strong><small>{data(e.data)} · {[...regionais,...frentes].filter(u=>u.id===e.unidade_id||u.id===e.frente_id).map(u=>u.nome).join(" · ")||"Institucional"}</small>
                  <div className="po-catalog-footer"><span>{e.total_solicitacoes||0} demandas</span><span>Ver demandas →</span></div>
                </button>)}
                <button type="button" className="po-catalog-card po-no-catalog" onClick={()=>abrirCatalogo("eventos",null)}>
                  <span className="po-catalog-icon"><MenuIcon nome="eventos"/></span><strong>Sem evento</strong>
                  <small>Demandas que não pertencem a um evento específico</small>
                  <div className="po-catalog-footer"><span>{solicitacoes.filter(s=>!s.evento_id).length} demandas</span><span>Ver demandas →</span></div>
                </button>
              </div>
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
                  <label className="po-field"><span>Regional (opcional)</span><select value={form.unidade_id} onChange={e=>selecionarArea("unidade_id",e.target.value)}>
                    <option value="">Sem regional</option>{regionais.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></label>
                  <label className="po-field"><span>Frente / setor (opcional)</span><select value={form.frente_id} onChange={e=>selecionarArea("frente_id",e.target.value)}>
                    <option value="">Sem frente</option>{frentes.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></label>
                  
                  <div className="po-wide po-relationships">
                    <div className="po-rel-head"><span className="po-form-kicker">ORGANIZAÇÃO DA DEMANDA</span>
                      <strong>Campanha e evento</strong><small>Selecione ou marque Sem campanha / Sem evento.</small>
                    </div>
                    <div className="po-rel-grid">
                      <label className="po-field"><span>Campanha *</span>
                        <select required value={form.campanha_id} onChange={e=>setForm({...form,campanha_id:e.target.value})}>
                          <option value="" disabled>Selecione uma opção</option>
                          <option value="none">Sem campanha</option>
                          {campanhaseventosDaArea(campanhas).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </label>
                      <label className="po-field"><span>Evento *</span>
                        <select required value={form.evento_id} onChange={e=>setForm({...form,evento_id:e.target.value})}>
                          <option value="" disabled>Selecione uma opção</option>
                          <option value="none">Sem evento</option>
                          {campanhaseventosDaArea(eventosCatalogo).map(e=><option key={e.id} value={e.id}>{e.nome}{e.data?" · "+data(e.data):""}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="po-inline-quick">
                      <button type="button" onClick={()=>setCriarCampanhaAberto(!criarCampanhaAberto)}>+ Nova campanha</button>
                      <button type="button" onClick={()=>setCriarEventoAberto(!criarEventoAberto)}>+ Novo evento</button>
                    </div>
                    {criarCampanhaAberto && <div className="po-quick-form">
                      <label htmlFor="campanha-rapida">Nome da nova campanha</label>
                      <div className="po-quick-row">
                        <input id="campanha-rapida" placeholder="Ex.: Outubro Rosa 2026" value={campanhaNova} maxLength={160}
                          onChange={e=>setCampanhaNova(e.target.value)} />
                        <button type="button" className="po-primary" disabled={criandoCatalogo||!campanhaNova.trim()}
                          onClick={criarCampanhaRapida}>{criandoCatalogo?"Criando…":"Criar e selecionar"}</button>
                      </div>
                      <small>Somente o nome. A campanha fica vinculada à regional ou frente selecionada acima.</small>
                    </div>}
                    {criarEventoAberto && <div className="po-quick-form">
                      <label htmlFor="evento-rapido">Novo evento</label>
                      <div className="po-quick-row">
                        <input id="evento-rapido" placeholder="Nome do evento" value={eventoNovo.nome}
                          onChange={e=>setEventoNovo({...eventoNovo,nome:e.target.value})} maxLength={200}/>
                        <input type="date" aria-label="Data do evento" value={eventoNovo.data}
                          onChange={e=>setEventoNovo({...eventoNovo,data:e.target.value})}/>
                        <button type="button" className="po-primary" disabled={criandoCatalogo||!eventoNovo.nome.trim()||!eventoNovo.data}
                          onClick={criarEventoRapido}>{criandoCatalogo?"Criando…":"Criar evento"}</button>
                      </div><small>Este evento será cadastrado no calendário existente do Envoxers.</small>
                    </div>}
                  </div>
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
              <div className="po-detail-rel">
                <span><MenuIcon nome="campanhas"/> {selecionada.campanha_id?(campanhas.find(c=>c.id===selecionada.campanha_id)?.nome||"Campanha vinculada"):"Sem campanha"}</span>
                <span><MenuIcon nome="eventos"/> {selecionada.evento_id?(eventosCatalogo.find(e=>e.id===selecionada.evento_id)?.nome||"Evento vinculado"):"Sem evento"}</span>
              </div>
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
  return { Shell, Status };
})();
