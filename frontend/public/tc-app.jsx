const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

function AppShell() {
  const [view, setView] = useStateApp("clientes");
  const nome = localStorage.getItem("envoxers_nome") || "";
  const permissao = localStorage.getItem("envoxers_permissao") || "envoxer";
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
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.tipo === "mensagem_nova") {
          setChatWsEvent(data);
          agendarRecalculoBadge();
        }
      } catch (err) { /* ignora frame que não é JSON */ }
    };
    return () => ws.close();
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
    icp: "ICP / ICP Builder",
    faturamento: "Faturamento / Painel de faturamento",
    churn: "ICP / Cancelamentos",
    chat: "Chat interno",
  };

  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      <EnvoxersShared.Sidebar
        view={view}
        onNavigate={setView}
        nome={nome}
        permissao={permissao}
        chatNaoLidas={chatBadgeTotal}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <main className="main" style={focoAtivo ? { paddingBottom: 60 } : undefined}>
        <EnvoxersShared.Topbar crumb={crumbs[view]} onLogout={handleLogout} />
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
        {view === "icp" && <IcpScreen />}
        {view === "faturamento" && <FaturamentoScreen />}
        {view === "churn" && <ChurnListaScreen />}
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
