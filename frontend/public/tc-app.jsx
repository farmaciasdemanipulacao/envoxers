const { useState: useStateApp, useEffect: useEffectApp } = React;

function AppShell() {
  const [view, setView] = useStateApp("clientes");
  const nome = localStorage.getItem("envoxers_nome") || "";
  const permissao = localStorage.getItem("envoxers_permissao") || "envoxer";
  const toast = EnvoxersShared.useToast();

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
  };

  return (
    <div className="app">
      <EnvoxersShared.Sidebar view={view} onNavigate={setView} nome={nome} permissao={permissao} />
      <main className="main" style={focoAtivo ? { paddingBottom: 60 } : undefined}>
        <EnvoxersShared.Topbar crumb={crumbs[view]} onLogout={handleLogout} />
        {view === "clientes" && <ClientesScreen permissao={permissao} />}
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
          />
        )}
        {view === "dashboard" && (
          <DashboardScreen
            permissao={permissao}
            dataVersion={dataVersion}
            onAbrirTarefa={abrirTarefa}
          />
        )}
        {view === "solicitacoes" && <SolicitacoesScreen onAbrirTarefa={abrirTarefa} />}
        {view === "calendario" && <CalendarioScreen />}
        {view === "relatorio" && <RelatorioScreen />}
        {view === "farol" && <FarolScreen />}
        {view === "alertas" && <AlertasScreen />}
        {view === "icp" && <IcpScreen />}
        {view === "faturamento" && <FaturamentoScreen />}
        {view === "churn" && <ChurnListaScreen />}
      </main>
      <FocoBar
        focoAtivo={focoAtivo}
        focoElapsed={focoElapsed}
        onPausarFoco={pausarRetomarFoco}
        onFinalizarFoco={() => setConfirmandoFinalizar(true)}
        onAbrirTarefa={() => focoAtivo && abrirTarefa(focoAtivo.tarefa_id)}
      />
      <FocoQuickStart focoAtivo={focoAtivo} onIniciarFoco={iniciarFoco} />
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
