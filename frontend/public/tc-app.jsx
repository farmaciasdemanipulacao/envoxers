const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

// Banner de ativação de push — pede permissão do navegador e cria a subscription
// (window.pushHelpers, definido em index.html). Só aparece se o navegador suporta
// e a permissão ainda está em "default" (nunca perguntado/negado).
function PushPermissionBanner({ onDismiss }) {
  const [loading, setLoading] = useStateApp(false);
  const toast = EnvoxersShared.useToast();
  const ph = window.pushHelpers;

  if (!ph || !ph.isSupported() || ph.getPermission() !== "default") return null;

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await ph.subscribe();
      toast(result ? "Notificações ativadas!" : "Permissão negada ou não suportada.", result ? "success" : "warning");
    } catch (err) {
      toast("Erro ao ativar notificações.", "error");
    } finally {
      setLoading(false);
      onDismiss();
    }
  };

  return (
    <div className="install-banner">
      <div className="install-banner-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a3 3 0 0 0-3 3v1.5c0 1.6-.5 2.6-1.5 3.5h9c-1-.9-1.5-1.9-1.5-3.5V5a3 3 0 0 0-3-3z" /><path d="M6.3 12.3a1.8 1.8 0 0 0 3.4 0" /></svg>
      </div>
      <div className="install-banner-text">
        <div className="install-banner-title">Ativar notificações</div>
        <div className="install-banner-desc">Receba alertas de farol em risco e mensagens do chat mesmo com o app fechado.</div>
      </div>
      <div className="install-banner-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleEnable} disabled={loading}>
          {loading ? "..." : "Ativar"}
        </button>
        <button type="button" className="install-banner-close" onClick={onDismiss} aria-label="Fechar aviso">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
    </div>
  );
}

// Banner de instalação PWA — mesmo mecanismo do ATENX: Android/desktop Chrome
// dispara "beforeinstallprompt" (capturado em index.html, guardado em
// window._installPrompt) e o botão "Instalar" só re-exibe o prompt nativo. iOS
// (Safari/WebKit) nunca dispara esse evento, então mostramos instrução manual
// (Compartilhar > Adicionar à Tela de Início) ancorada embaixo, apontando pro
// ícone de compartilhar da barra do navegador.
function InstallBanner({ onDismiss, ios }) {
  const [loading, setLoading] = useStateApp(false);

  const handleInstall = async () => {
    const prompt = window._installPrompt;
    if (!prompt) return;
    setLoading(true);
    prompt.prompt();
    await prompt.userChoice;
    window._installPrompt = null;
    setLoading(false);
    onDismiss();
  };

  const closeBtn = (
    <button type="button" className="install-banner-close" onClick={onDismiss} aria-label="Fechar aviso">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  );

  if (ios) {
    return (
      <div className="install-banner-ios-wrap">
        <div className="install-banner">
          <div className="install-banner-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1v7M5 4l3-3 3 3" /><path d="M3 8v5a1 1 0 001 1h8a1 1 0 001-1V8" /></svg>
          </div>
          <div className="install-banner-text">
            <div className="install-banner-title">Instalar app (iPhone/iPad)</div>
            <div className="install-banner-desc">
              Toque no ícone de <strong>Compartilhar</strong> do Safari, na barra embaixo da tela, depois em <strong>"Adicionar à Tela de Início"</strong>.
            </div>
          </div>
          <div className="install-banner-actions">{closeBtn}</div>
        </div>
        <svg className="install-banner-chevron" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6l4 4 4-4" /></svg>
      </div>
    );
  }

  return (
    <div className="install-banner">
      <div className="install-banner-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v7M5 6l3 3 3-3" /><path d="M3 12h10" /></svg>
      </div>
      <div className="install-banner-text">
        <div className="install-banner-title">Instalar app</div>
        <div className="install-banner-desc">Adicione o Envoxers à tela inicial para acesso rápido em tela cheia.</div>
      </div>
      <div className="install-banner-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall} disabled={loading}>
          {loading ? "..." : "Instalar"}
        </button>
        {closeBtn}
      </div>
    </div>
  );
}

function AppShell() {
  const [view, setView] = useStateApp("clientes");
  const nome = localStorage.getItem("envoxers_nome") || "";
  const permissao = localStorage.getItem("envoxers_permissao") || "envoxer";
  const envoxerId = EnvoxersAPI.getEnvoxerId();
  const toast = EnvoxersShared.useToast();

  // Estado do menu (expandido/recolhido) persiste em localStorage — não em memória —
  // pra sobreviver a um reload de página, não só a troca de tela dentro da sessão.
  const [sidebarCollapsed, setSidebarCollapsed] = useStateApp(
    () => localStorage.getItem("envoxers_sidebar_collapsed") === "1"
  );
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("envoxers_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  // Menu mobile: aberto via botão hamburger no Topbar, fechado ao navegar ou
  // clicar no overlay. Não persiste em localStorage — sempre começa fechado.
  const [mobileMenuOpen, setMobileMenuOpen] = useStateApp(false);
  const navegarEFecharMenu = (v) => { setView(v); setMobileMenuOpen(false); };

  // Banner de instalação PWA — dismiss vale só pra sessão (sessionStorage), não
  // pra sempre, senão quem clica sem querer nunca mais vê a opção.
  const [installBanner, setInstallBanner] = useStateApp(false);
  const [installIOS, setInstallIOS] = useStateApp(false);

  useEffectApp(() => {
    if (sessionStorage.getItem("envoxers_install_banner_dismissed")) return;

    if (window._isIOS && window._isIOS() && !(window._isStandalone && window._isStandalone())) {
      setInstallIOS(true);
      setInstallBanner(true);
      return;
    }

    // Evento beforeinstallprompt pode ter chegado antes do React montar
    if (window._installPrompt) { setInstallBanner(true); return; }
    window._onInstallPromptReady = () => {
      if (!sessionStorage.getItem("envoxers_install_banner_dismissed")) setInstallBanner(true);
    };
    return () => { window._onInstallPromptReady = null; };
  }, []);

  const handleInstallDismiss = () => {
    sessionStorage.setItem("envoxers_install_banner_dismissed", "1");
    setInstallBanner(false);
  };

  // Banner de push some 3s após login pra não competir com o de instalação (só um
  // aviso de cada vez) — dismiss também vale só pra sessão.
  const [pushBanner, setPushBanner] = useStateApp(false);
  useEffectApp(() => {
    const ph = window.pushHelpers;
    if (!ph || !ph.isSupported()) return;
    if (ph.getPermission() === "default" && !sessionStorage.getItem("envoxers_push_banner_dismissed")) {
      const t = setTimeout(() => setPushBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const handlePushDismiss = () => {
    sessionStorage.setItem("envoxers_push_banner_dismissed", "1");
    setPushBanner(false);
  };

  // isMobile segue o mesmo breakpoint do CSS (envox-tokens.css, 900px) — usado
  // pra diferenciar o botão do topo da sidebar: no mobile ele fecha a gaveta
  // (X), no desktop ele recolhe pra ícones (seta). São dois comportamentos
  // distintos que não podem compartilhar o mesmo botão.
  const [isMobile, setIsMobile] = useStateApp(() => window.matchMedia("(max-width: 900px)").matches);
  useEffectApp(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Estado do Foco vive na raiz — Kanban e Dashboard abrem o mesmo TaskModal
  // e precisam do mesmo Foco ativo/contador, sobrevivendo à troca de tela.
  const [focoAtivo, setFocoAtivo] = useStateApp(null);
  const [focoElapsed, setFocoElapsed] = useStateApp(0);

  // O modal de tarefa também vive na raiz: a barra de Foco precisa poder abrir
  // o modal a partir de QUALQUER tela (ex.: Clientes, Serviços), não só Kanban/Dashboard.
  const [tarefaAberta, setTarefaAberta] = useStateApp(null); // null = fechado, {} = nova, {id} = editar/ver
  const [novaStatusInicial, setNovaStatusInicial] = useStateApp("nova");
  const [clientes, setClientes] = useStateApp([]);
  const [envoxersList, setEnvoxersList] = useStateApp([]);
  const [dataVersion, setDataVersion] = useStateApp(0); // incrementa a cada save — Kanban/Dashboard refazem fetch

  // "Abrir ficha" do Farol/Alertas navega pra tela Clientes já com o form aberto
  // (não existe view-cliente-ficha separada — decisão já tomada no D-063).
  const [clienteParaAbrir, setClienteParaAbrir] = useStateApp(null);
  const abrirCliente = (id) => { setClienteParaAbrir(id); setView("clientes"); };

  // Chat interno — WS vive na raiz pra badge de não lidas funcionar em qualquer tela,
  // não só dentro da tela de Chat. Envio de mensagem continua sendo POST REST (ver tc-chat.jsx);
  // o WS aqui só recebe o evento "mensagem_nova" e repassa pra ChatScreen via wsEvent.
  const [chatWsEvent, setChatWsEvent] = useStateApp(null);
  const [chatBadgeTotal, setChatBadgeTotal] = useStateApp(0);
  const chatBadgeTimeoutRef = useRefApp(null);

  const carregarChatBadge = async () => {
    try {
      const canaisChat = await EnvoxersAPI.api("/chat/canais");
      setChatBadgeTotal(canaisChat.reduce((acc, c) => acc + (c.nao_lidas || 0), 0));
    } catch (err) { /* silencioso — badge não é crítico */ }
  };

  // Pequeno debounce: várias mensagens chegando juntas não devem disparar uma rajada de GETs.
  // Também dá tempo da ChatScreen marcar como lido (se o canal estiver aberto) antes do recálculo.
  const agendarRecalculoBadge = () => {
    clearTimeout(chatBadgeTimeoutRef.current);
    chatBadgeTimeoutRef.current = setTimeout(carregarChatBadge, 400);
  };

  useEffectApp(() => { carregarChatBadge(); }, []);

  useEffectApp(() => {
    const token = EnvoxersAPI.getToken();
    if (!token) return;
    const protocolo = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocolo}://${window.location.host}/api/v1/chat/ws?token=${encodeURIComponent(token)}`);

    // Avisa o servidor se a aba está em primeiro plano — é isso que decide se
    // uma mensagem nova de chat vira push (ver chat_ws_manager.py::esta_visivel).
    const enviarVisibilidade = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: "visibilidade", visivel: document.visibilityState === "visible" }));
      }
    };
    ws.onopen = enviarVisibilidade;
    document.addEventListener("visibilitychange", enviarVisibilidade);

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.tipo === "mensagem_nova") {
          setChatWsEvent(data);
          agendarRecalculoBadge();
        }
      } catch (err) { /* ignora frame que não é JSON */ }
    };
    return () => {
      document.removeEventListener("visibilitychange", enviarVisibilidade);
      ws.close();
    };
  }, []);

  const carregarListasBase = async () => {
    try {
      const [cs, es] = await Promise.all([EnvoxersAPI.api("/clientes"), EnvoxersAPI.api("/envoxers")]);
      setClientes(cs);
      setEnvoxersList(es.filter((e) => e.ativo));
    } catch (err) { /* silencioso — telas que precisam desses dados têm seu próprio fetch/erro */ }
  };

  useEffectApp(() => { carregarListasBase(); }, []);

  const abrirTarefa = (id) => setTarefaAberta({ id });
  const abrirNovaTarefa = (statusInicial) => {
    setNovaStatusInicial(statusInicial || "nova");
    carregarListasBase(); // garante dropdown de Cliente/Responsável atualizado, não só após salvar
    setTarefaAberta({});
  };

  const carregarFocoAtivo = async () => {
    try {
      const f = await EnvoxersAPI.api("/foco/ativo");
      setFocoAtivo(f);
    } catch (err) { /* silencioso — não é crítico pra tela */ }
  };

  useEffectApp(() => { carregarFocoAtivo(); }, []);

  // Contador = tempo decorrido − tempo pausado total. Se pausado_em está setado,
  // congela usando pausado_em como referência (não usa Date.now(), então não precisa de interval).
  useEffectApp(() => {
    if (!focoAtivo) { setFocoElapsed(0); return; }
    const pausadoMinAcumulado = focoAtivo.duracao_pausada_min || 0;

    if (focoAtivo.pausado_em) {
      const congelado = Math.floor((new Date(focoAtivo.pausado_em).getTime() - new Date(focoAtivo.inicio).getTime()) / 1000) - pausadoMinAcumulado * 60;
      setFocoElapsed(Math.max(0, congelado));
      return;
    }

    const calcular = () => {
      const decorrido = Math.floor((Date.now() - new Date(focoAtivo.inicio).getTime()) / 1000) - pausadoMinAcumulado * 60;
      setFocoElapsed(Math.max(0, decorrido));
    };
    calcular();
    const intervalId = setInterval(calcular, 1000);
    return () => clearInterval(intervalId);
  }, [focoAtivo]);

  // Sem toast de sucesso aqui de propósito — a barra/botão já confirmam visualmente
  // (contador aparece/roda/congela/some). Toast só pra erro, que não tem outro sinal visual.
  const [confirmandoFinalizar, setConfirmandoFinalizar] = useStateApp(false);

  const iniciarFoco = async (tarefaId) => {
    try {
      const registro = await EnvoxersAPI.api("/foco/iniciar", { method: "POST", body: JSON.stringify({ tarefa_id: tarefaId }) });
      setFocoAtivo(registro);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const pausarRetomarFoco = async () => {
    if (!focoAtivo) return;
    try {
      const registro = await EnvoxersAPI.api(`/foco/${focoAtivo.id}/pausar`, { method: "POST" });
      setFocoAtivo(registro);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const finalizarFoco = async (comentario) => {
    if (!focoAtivo) return;
    try {
      await EnvoxersAPI.api(`/foco/${focoAtivo.id}/finalizar`, {
        method: "POST",
        body: JSON.stringify({ comentario: comentario || null }),
      });
      setFocoAtivo(null);
      setConfirmandoFinalizar(false);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleLogout = () => {
    EnvoxersAPI.clearSession();
    window.location.reload();
  };

  // Exposto pro Service Worker chamar quando o usuário clica numa notificação
  // push (ver mensagem NAVIGATE em index.html / notificationclick em sw.js).
  window.envoxersNavigate = (view) => { if (view) setView(view); };

  const crumbs = {
    clientes: "Cadastros / Clientes",
    envoxers: "Cadastros / Envoxers",
    servicos: "Cadastros / Serviços",
    kanban: "Operação / Kanban",
    dashboard: "Operação / Dashboard do dia",
    calendario: "Operação / Calendário",
    relatorio: "Operação / Relatório de custo",
    solicitacoes: "Farol / Solicitações do cliente",
    farol: "Farol / Farol Inteligente",
    alertas: "Farol / Alertas",
    entregaveis: "Entregáveis / Controle de Entregáveis",
    icp: "ICP / ICP Builder",
    faturamento: "Faturamento / Painel de faturamento",
    churn: "ICP / Cancelamentos",
    chat: "Chat interno",
    "config-alertas": "Admin / Configuração de Alertas",
  };

  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      <EnvoxersShared.Sidebar
        view={view}
        onNavigate={navegarEFecharMenu}
        nome={nome}
        permissao={permissao}
        chatNaoLidas={chatBadgeTotal}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        isMobile={isMobile}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div
        className={"mobile-overlay" + (mobileMenuOpen ? " open" : "")}
        onClick={() => setMobileMenuOpen(false)}
      />
      <main
        className={"main" + (view === "chat" ? " main-chat" : "")}
        style={focoAtivo ? { paddingBottom: 60 } : undefined}
      >
        <EnvoxersShared.Topbar crumb={crumbs[view]} onLogout={handleLogout} onMenuClick={() => setMobileMenuOpen(true)} />
        {view === "clientes" && (
          <ClientesScreen
            permissao={permissao}
            abrirClienteId={clienteParaAbrir}
            onClienteAberto={() => setClienteParaAbrir(null)}
          />
        )}
        {view === "envoxers" && <EnvoxersScreen permissao={permissao} />}
        {view === "servicos" && <ServicosScreen permissao={permissao} />}
        {view === "kanban" && (
          <KanbanScreen
            permissao={permissao}
            focoAtivo={focoAtivo}
            focoElapsed={focoElapsed}
            dataVersion={dataVersion}
            onAbrirTarefa={abrirTarefa}
            onAbrirNovaTarefa={abrirNovaTarefa}
            onNavigate={setView}
          />
        )}
        {view === "dashboard" && (
          <DashboardScreen
            permissao={permissao}
            dataVersion={dataVersion}
            onAbrirTarefa={abrirTarefa}
            onNavigate={setView}
          />
        )}
        {view === "solicitacoes" && <SolicitacoesScreen onAbrirTarefa={abrirTarefa} />}
        {view === "calendario" && <CalendarioScreen />}
        {view === "relatorio" && <RelatorioScreen />}
        {view === "farol" && <FarolScreen />}
        {view === "alertas" && <AlertasScreen onAbrirCliente={abrirCliente} />}
        {view === "entregaveis" && <EntregaveisScreen onAbrirCliente={abrirCliente} />}
        {view === "icp" && <IcpScreen />}
        {view === "faturamento" && <FaturamentoScreen />}
        {view === "churn" && <ChurnListaScreen />}
        {view === "config-alertas" && <ConfigAlertasScreen permissao={permissao} />}
        {view === "chat" && (
          <ChatScreen envoxersList={envoxersList} wsEvent={chatWsEvent} onLeituraAtualizada={agendarRecalculoBadge} />
        )}
      </main>
      <FocoBar
        focoAtivo={focoAtivo}
        focoElapsed={focoElapsed}
        onPausarFoco={pausarRetomarFoco}
        onFinalizarFoco={() => setConfirmandoFinalizar(true)}
        onAbrirTarefa={() => focoAtivo && abrirTarefa(focoAtivo.tarefa_id)}
      />
      {installBanner && <InstallBanner onDismiss={handleInstallDismiss} ios={installIOS} />}
      {pushBanner && !installBanner && <PushPermissionBanner onDismiss={handlePushDismiss} />}
      <FocoFinalizarModal
        aberto={confirmandoFinalizar}
        focoAtivo={focoAtivo}
        focoElapsed={focoElapsed}
        onCancelar={() => setConfirmandoFinalizar(false)}
        onConfirmar={finalizarFoco}
      />

      {tarefaAberta !== null && (
        <TaskModal
          tarefaId={tarefaAberta.id || null}
          statusInicial={novaStatusInicial}
          permissao={permissao}
          envoxerId={envoxerId}
          clientes={clientes}
          envoxersList={envoxersList}
          focoAtivo={focoAtivo}
          focoElapsed={focoElapsed}
          onIniciarFoco={iniciarFoco}
          onPausarFoco={pausarRetomarFoco}
          onFinalizarFoco={() => setConfirmandoFinalizar(true)}
          onClose={() => setTarefaAberta(null)}
          onSaved={() => { setTarefaAberta(null); setDataVersion((v) => v + 1); carregarListasBase(); }}
        />
      )}
    </div>
  );
}

function Root() {
  const [logged, setLogged] = useStateApp(!!EnvoxersAPI.getToken());

  if (!logged) {
    return (
      <EnvoxersShared.ToastProvider>
        <LoginScreen onLoggedIn={() => setLogged(true)} />
      </EnvoxersShared.ToastProvider>
    );
  }

  return (
    <EnvoxersShared.ToastProvider>
      <AppShell />
    </EnvoxersShared.ToastProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Root />);
