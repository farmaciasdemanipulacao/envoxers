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

// Tela cheia bloqueante (D-114) — gestor/envoxer só passam pro app depois de
// instalar de verdade (abrir pelo ícone instalado, não pela aba do navegador —
// detectado via display-mode:standalone) e habilitar notificações. Sem opção
// de pular (decisão do Gus). Live-checado via API do navegador a cada foco/
// intervalo, não confia só no flag do banco (esse só existe pro histórico do
// admin, ver POST /envoxers/me/status-instalacao).
function checarOnboarding() {
  return {
    instalado: !!(window._isStandalone && window._isStandalone()),
    notificacoes: !!(window.Notification && Notification.permission === "granted"),
    promptDisponivel: !!window._installPrompt,
  };
}

function OnboardingGate({ onCompleto, onLogout }) {
  const toast = EnvoxersShared.useToast();
  const ph = window.pushHelpers;
  const suportaPush = !!(ph && ph.isSupported());
  const ios = !!(window._isIOS && window._isIOS());

  const [status, setStatus] = useStateApp(checarOnboarding);
  const [instalando, setInstalando] = useStateApp(false);
  const [ativando, setAtivando] = useStateApp(false);
  const marcadoRef = useRefApp(false);

  useEffectApp(() => {
    const revisar = () => setStatus(checarOnboarding());
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("focus", revisar);
    const intervalId = setInterval(revisar, 1500);
    return () => {
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("focus", revisar);
      clearInterval(intervalId);
    };
  }, []);

  useEffectApp(() => {
    if (status.instalado && !marcadoRef.current) {
      marcadoRef.current = true;
      EnvoxersAPI.api("/envoxers/me/status-instalacao", { method: "POST" }).catch(() => {});
    }
    if (status.instalado && status.notificacoes) onCompleto();
  }, [status.instalado, status.notificacoes]);

  const handleInstalar = async () => {
    const prompt = window._installPrompt;
    if (!prompt) return;
    setInstalando(true);
    prompt.prompt();
    await prompt.userChoice;
    window._installPrompt = null;
    setInstalando(false);
    setStatus(checarOnboarding());
  };

  const handleAtivarNotificacoes = async () => {
    setAtivando(true);
    try {
      const resultado = await ph.subscribe();
      if (!resultado) toast("Permissão negada. Habilite nas configurações do site e clique em \"Já habilitei\".", "warning");
    } catch (err) {
      toast("Erro ao ativar notificações.", "error");
    } finally {
      setAtivando(false);
      setStatus(checarOnboarding());
    }
  };

  const permissaoNegada = suportaPush && window.Notification && Notification.permission === "denied";

  return (
    <div className="onboarding-gate">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="brand" style={{ justifyContent: "center" }}>
            <span className="brand-mark">envox<span className="brand-dot"></span></span>
          </div>
          <div className="onboarding-title">Antes de continuar</div>
          <div className="onboarding-subtitle">
            Pra garantir que você não perca prazo, alerta de farol ou mensagem importante,
            o Envoxers exige instalar o app e habilitar notificações no primeiro acesso.
          </div>
        </div>

        <div className="onboarding-steps">
          <div className={"onboarding-step" + (status.instalado ? " done" : "")}>
            <div className="onboarding-step-icon">
              {status.instalado
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l3.5 3.5L13 5" /></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v7M5 6l3 3 3-3" /><path d="M3 12h10" /></svg>}
            </div>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                1. Instalar o app
                <span className={status.instalado ? "onboarding-badge-ok" : "onboarding-badge-pendente"}>
                  {status.instalado ? "Concluído" : "Pendente"}
                </span>
              </div>
              {!status.instalado && (
                <>
                  <div className="onboarding-step-desc">
                    {ios
                      ? <>Toque no ícone de <strong>Compartilhar</strong> do Safari e depois em <strong>"Adicionar à Tela de Início"</strong>. Depois, abra o Envoxers pelo ícone novo.</>
                      : status.promptDisponivel
                        ? "Adicione o Envoxers à tela inicial/área de trabalho pra usar como app de verdade."
                        : "Seu navegador não permite instalar automaticamente."}
                  </div>
                  {!ios && status.promptDisponivel && (
                    <div className="onboarding-step-action">
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleInstalar} disabled={instalando}>
                        {instalando ? "..." : "Instalar agora"}
                      </button>
                    </div>
                  )}
                  {!ios && !status.promptDisponivel && (
                    <div className="onboarding-warning">
                      Abra o Envoxers pelo Chrome ou Edge (computador) ou pelo navegador do seu celular pra poder instalar.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={"onboarding-step" + (status.notificacoes ? " done" : "")}>
            <div className="onboarding-step-icon">
              {status.notificacoes
                ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l3.5 3.5L13 5" /></svg>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a3 3 0 0 0-3 3v1.5c0 1.6-.5 2.6-1.5 3.5h9c-1-.9-1.5-1.9-1.5-3.5V5a3 3 0 0 0-3-3z" /><path d="M6.3 12.3a1.8 1.8 0 0 0 3.4 0" /></svg>}
            </div>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                2. Habilitar notificações
                <span className={status.notificacoes ? "onboarding-badge-ok" : "onboarding-badge-pendente"}>
                  {status.notificacoes ? "Concluído" : "Pendente"}
                </span>
              </div>
              {!status.notificacoes && (
                <>
                  <div className="onboarding-step-desc">
                    Você recebe alerta de farol em risco e mensagem de chat mesmo com o app fechado.
                  </div>
                  {!suportaPush && (
                    <div className="onboarding-warning">Seu navegador não suporta notificações push.</div>
                  )}
                  {suportaPush && !permissaoNegada && (
                    <div className="onboarding-step-action">
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleAtivarNotificacoes} disabled={ativando}>
                        {ativando ? "..." : "Habilitar notificações"}
                      </button>
                    </div>
                  )}
                  {permissaoNegada && (
                    <>
                      <div className="onboarding-warning">
                        Você negou as notificações antes. Habilite manualmente no ícone de cadeado/informações
                        ao lado do endereço do site e depois clique em "Já habilitei".
                      </div>
                      <div className="onboarding-step-action">
                        <button type="button" className="btn btn-sm" onClick={() => setStatus(checarOnboarding())}>Já habilitei, verificar</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="onboarding-footer">
          <button type="button" className="btn" onClick={onLogout}>Sair</button>
        </div>
      </div>
    </div>
  );
}

// Faixa fixa sempre visível enquanto o admin está "vendo como" outra pessoa
// (ver EnvoxersScreen::handleAcessarComo) — sem ela não teria como voltar pra
// própria conta sem relogar. Fica no topo de todo `<main>`, antes até do
// bloqueio de chat, pra nunca ficar inacessível.
function ImpersonandoBar({ nomeAtual, nomeAdmin, onVoltar }) {
  return (
    <div className="impersonando-banner">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 1.5a3 3 0 013 3v1h.5A1.5 1.5 0 0113 7v5.5A1.5 1.5 0 0111.5 14h-7A1.5 1.5 0 013 12.5V7a1.5 1.5 0 011.5-1.5H5v-1a3 3 0 013-3zM6.5 5.5h3v-1a1.5 1.5 0 00-3 0v1z" /></svg>
      <span>Você (<strong>{nomeAdmin}</strong>) está vendo o Envoxers como <strong>{nomeAtual}</strong>.</span>
      <button type="button" className="btn btn-sm" onClick={onVoltar}>Voltar para minha conta</button>
    </div>
  );
}

function AppShell() {
  const nome = localStorage.getItem("envoxers_nome") || "";
  const permissao = localStorage.getItem("envoxers_permissao") || "envoxer";
  const envoxerId = EnvoxersAPI.getEnvoxerId();

  // Tela atual persiste em sessionStorage (não localStorage) por envoxer: um F5 na
  // mesma aba mantém a pessoa onde estava, mas uma aba/sessão de navegador nova
  // (login novo, ou outra pessoa no mesmo dispositivo) sempre começa no Dashboard
  // do dia — sessionStorage soma isso de graça (sobrevive a reload, não a fechar a aba).
  const viewStorageKey = envoxerId ? `envoxers_view_${envoxerId}` : null;
  const [view, setView] = useStateApp(() => {
    const salva = viewStorageKey ? sessionStorage.getItem(viewStorageKey) : null;
    return salva || "dashboard";
  });
  useEffectApp(() => {
    if (viewStorageKey) sessionStorage.setItem(viewStorageKey, view);
  }, [view, viewStorageKey]);

  const toast = EnvoxersShared.useToast();
  const impersonando = EnvoxersAPI.estaImpersonando();
  const nomeAdminReal = localStorage.getItem("envoxers_admin_nome") || "";
  const handleVoltarImpersonacao = () => {
    EnvoxersAPI.encerrarImpersonacao();
    window.location.reload();
  };
  const [fotoUrl, setFotoUrl] = useStateApp(() => localStorage.getItem("envoxers_foto_url") || "");
  const atualizarFotoUrl = (novaUrl) => {
    localStorage.setItem("envoxers_foto_url", novaUrl || "");
    setFotoUrl(novaUrl || "");
  };

  // Onboarding obrigatório (D-114) — só gestor/envoxer, e nunca durante "Acessar
  // como" (senão o admin ficaria travado explorando a conta de outra pessoa no
  // próprio dispositivo, que não é o instalado da pessoa impersonada).
  const [onboardingOk, setOnboardingOk] = useStateApp(() => {
    if (permissao === "admin" || impersonando) return true;
    const s = checarOnboarding();
    return s.instalado && s.notificacoes;
  });

  // Telas 100% financeiras (D-090) — se alguém sem ser admin cair aqui (ex.: view
  // presa de uma sessão anterior), volta pro Kanban em vez de bater no 403 da API.
  useEffectApp(() => {
    if ((view === "faturamento" || view === "relatorio") && permissao !== "admin") {
      setView("kanban");
    }
  }, [view, permissao]);

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
  // "Cadastros" (Clientes/Envoxers/Serviços) + "Meu Perfil" viraram destinos
  // dentro de "Configurações" (D-123/D-124) — abrir a ficha de um cliente a
  // partir de Farol/Alertas/Entregáveis precisa navegar pra lá E já deixar o
  // destino certo selecionado.
  const [configItem, setConfigItem] = useStateApp("clientes");
  const abrirCliente = (id) => {
    setClienteParaAbrir(id);
    setConfigItem("clientes");
    setView("configuracoes");
  };

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

  // Bloqueio "DM não lida desde antes de hoje" (pedido do Gus) — admin nunca
  // bloqueia (checado aqui de novo, além do backend, só pra nunca nem tentar
  // esconder a sidebar do próprio admin por engano).
  const [bloqueioChat, setBloqueioChat] = useStateApp({ bloqueado: false, canais: [] });
  const verificarBloqueioChat = async () => {
    if (permissao === "admin") return;
    try {
      const data = await EnvoxersAPI.api("/chat/bloqueio");
      setBloqueioChat(data);
    } catch (err) { /* silencioso */ }
  };

  // Pequeno debounce: várias mensagens chegando juntas não devem disparar uma rajada de GETs.
  // Também dá tempo da ChatScreen marcar como lido (se o canal estiver aberto) antes do recálculo.
  const agendarRecalculoBadge = () => {
    clearTimeout(chatBadgeTimeoutRef.current);
    chatBadgeTimeoutRef.current = setTimeout(() => { carregarChatBadge(); verificarBloqueioChat(); }, 400);
  };

  useEffectApp(() => { carregarChatBadge(); verificarBloqueioChat(); }, []);

  // Confere de novo periodicamente — cobre o caso de a aba ficar aberta parada
  // e a virada da meia-noite acontecer sem nenhum evento de WS novo pra disparar.
  useEffectApp(() => {
    if (permissao === "admin") return;
    const intervalId = setInterval(verificarBloqueioChat, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [permissao]);

  // Presença (ativo/ausente/offline) — snapshot inicial pra popular a bolinha do
  // Avatar em qualquer tela assim que o app abre; dali em diante só os eventos
  // "presenca" do WS abaixo mantêm isso atualizado (ver chat_ws_manager.py).
  useEffectApp(() => {
    EnvoxersAPI.api("/chat/presenca")
      .then((mapa) => window.EnvoxersPresence.setAll(mapa))
      .catch(() => {});
  }, []);

  useEffectApp(() => {
    const token = EnvoxersAPI.getToken();
    if (!token) return;
    const protocolo = window.location.protocol === "https:" ? "wss" : "ws";

    let ws = null;
    let reconectarTimeout = null;
    let desmontado = false;

    // Avisa o servidor se a pessoa está REALMENTE prestando atenção no app —
    // é isso que decide se uma mensagem nova de chat vira push (ver
    // chat_ws_manager.py::esta_visivel). Só checar visibilityState não bastava
    // (D-115): com o Envoxers aberto numa aba do Windows mas o foco em outro
    // programa (ex.: Excel), a aba continua "visible" pra Page Visibility API,
    // então também escuta focus/blur da janela — só conta como "visível" quando
    // a aba está em primeiro plano E a janela tem foco do sistema operacional.
    const enviarVisibilidade = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const visivel = document.visibilityState === "visible" && document.hasFocus();
        ws.send(JSON.stringify({ tipo: "visibilidade", visivel }));
      }
    };

    const conectar = () => {
      ws = new WebSocket(`${protocolo}://${window.location.host}/api/v1/chat/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = enviarVisibilidade;

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.tipo === "mensagem_nova") {
            setChatWsEvent(data);
            agendarRecalculoBadge();
          } else if (data.tipo === "presenca") {
            window.EnvoxersPresence.set(data.envoxer_id, data.status);
          } else if (data.tipo === "tarefa_atualizada") {
            // Uma Tarefa mudou (própria ação, ação de outro envoxer, ou automação
            // disparada por uma etapa concluída) — recarrega Kanban/Dashboard sem
            // precisar de F5. Mesmo gatilho de refetch que já existia só pro botão
            // de salvar (ver dataVersion), agora também alimentado pelo WS.
            setDataVersion((v) => v + 1);
          }
        } catch (err) { /* ignora frame que não é JSON */ }
      };

      // Reconecta sozinho depois de qualquer queda (deploy do backend, wifi
      // instável, notebook saindo de suspensão) — sem isso o realtime pararia
      // de funcionar silenciosamente até um F5, voltando ao problema que esse
      // WS existe pra resolver.
      ws.onclose = () => {
        if (desmontado) return;
        reconectarTimeout = setTimeout(conectar, 3000);
      };
    };
    conectar();

    document.addEventListener("visibilitychange", enviarVisibilidade);
    window.addEventListener("focus", enviarVisibilidade);
    window.addEventListener("blur", enviarVisibilidade);

    return () => {
      desmontado = true;
      clearTimeout(reconectarTimeout);
      document.removeEventListener("visibilitychange", enviarVisibilidade);
      window.removeEventListener("focus", enviarVisibilidade);
      window.removeEventListener("blur", enviarVisibilidade);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, []);

  // Título da aba pisca "(N) Envoxers" com mensagem não lida enquanto a janela
  // não tem foco (D-115) — reforço visual pra quem está de olho na barra de
  // tarefas/aba do Windows mesmo sem notificação do sistema (permissão negada,
  // por exemplo). Volta ao título original assim que a pessoa volta o foco.
  const tituloOriginalRef = useRefApp(typeof document !== "undefined" ? document.title : "Envoxers");
  useEffectApp(() => {
    const atualizarTitulo = () => {
      if (chatBadgeTotal > 0 && !document.hasFocus()) {
        document.title = `(${chatBadgeTotal}) ${tituloOriginalRef.current}`;
      } else {
        document.title = tituloOriginalRef.current;
      }
    };
    atualizarTitulo();
    // Precisa dos dois: "focus" volta o título ao normal, "blur" é o que liga o
    // pisca-pisca (perder o foco é o próprio gatilho, não só ganhar de volta).
    window.addEventListener("focus", atualizarTitulo);
    window.addEventListener("blur", atualizarTitulo);
    return () => {
      window.removeEventListener("focus", atualizarTitulo);
      window.removeEventListener("blur", atualizarTitulo);
    };
  }, [chatBadgeTotal]);

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

  const configLabel = { clientes: "Cadastros / Clientes", envoxers: "Cadastros / Envoxers", servicos: "Cadastros / Serviços", perfil: "Meu Perfil" }[configItem];
  const crumbs = {
    configuracoes: `Configurações / ${configLabel}`,
    "comercial-dashboard": "Comercial / Dashboard",
    "comercial-hoje": "Comercial / Prospecções de Hoje",
    "comercial-leads": "Comercial / Leads",
    "comercial-pipeline": "Comercial / Pipeline",
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
    "foco-ativos": "Operação / Quem está em Foco",
    f4: "Desenvolvimento / PDI, 360, 180, 1:1 e Clima",
  };

  // Onboarding obrigatório (D-114) vem antes de qualquer outra coisa — inclusive
  // do bloqueio de chat abaixo, já que instalar+notificar é pré-requisito pra
  // receber esse tipo de alerta em primeiro lugar.
  if (!onboardingOk) {
    return (
      <OnboardingGate
        onCompleto={() => setOnboardingOk(true)}
        onLogout={handleLogout}
      />
    );
  }

  // Bloqueio de DM não lida desde antes de hoje — some com toda a navegação,
  // só o Chat continua acessível, e Sair. Admin nunca cai aqui (checado no
  // back e de novo em verificarBloqueioChat).
  // Importante: NÃO abre a conversa pendente sozinho — abrir uma conversa já
  // marca como lida (mesmo comportamento do chat normal), então auto-abrir
  // destravaria instantaneamente, sem a pessoa realmente ter lido nada. Ela
  // precisa clicar de propósito na conversa marcada abaixo pra destravar.
  if (bloqueioChat.bloqueado && permissao !== "admin") {
    const nomesPendentes = bloqueioChat.canais.map((c) => c.outro_envoxer_nome).join(", ");
    return (
      <div className="app app-bloqueado">
        <main className="main main-chat" style={{ width: "100%" }}>
          {impersonando && <ImpersonandoBar nomeAtual={nome} nomeAdmin={nomeAdminReal} onVoltar={handleVoltarImpersonacao} />}
          <div className="chat-bloqueio-banner">
            <div className="chat-bloqueio-avatars">
              {bloqueioChat.canais.map((c) => (
                <EnvoxersShared.Avatar key={c.canal_id} nome={c.outro_envoxer_nome} fotoUrl={c.outro_envoxer_foto} size="sm" envoxerId={c.outro_envoxer_id} />
              ))}
            </div>
            <div className="chat-bloqueio-texto">
              <strong>Você tem mensagens importantes pra ler.</strong>
              <span>De {nomesPendentes} — o resto do sistema fica bloqueado até você abrir a conversa no Chat abaixo.</span>
            </div>
            <button className="btn btn-sm" onClick={handleLogout}>Sair</button>
          </div>
          <ChatScreen
            envoxersList={envoxersList}
            wsEvent={chatWsEvent}
            onLeituraAtualizada={agendarRecalculoBadge}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      <EnvoxersShared.Sidebar
        view={view}
        onNavigate={navegarEFecharMenu}
        nome={nome}
        permissao={permissao}
        fotoUrl={fotoUrl}
        envoxerId={envoxerId}
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
        {impersonando && <ImpersonandoBar nomeAtual={nome} nomeAdmin={nomeAdminReal} onVoltar={handleVoltarImpersonacao} />}
        <EnvoxersShared.Topbar crumb={crumbs[view]} onLogout={handleLogout} onMenuClick={() => setMobileMenuOpen(true)} />
        {view === "comercial-dashboard" && <ComercialScreen mode="dashboard" />}
        {view === "comercial-hoje" && <ComercialScreen mode="hoje" />}
        {view === "comercial-leads" && <ComercialScreen mode="leads" />}
        {view === "comercial-pipeline" && <ComercialScreen mode="pipeline" />}
        {view === "kanban" && (
          <KanbanScreen
            permissao={permissao}
            envoxerId={envoxerId}
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
            envoxerId={envoxerId}
            dataVersion={dataVersion}
            onAbrirTarefa={abrirTarefa}
            onNavigate={setView}
          />
        )}
        {view === "solicitacoes" && <SolicitacoesScreen onAbrirTarefa={abrirTarefa} />}
        {view === "calendario" && <CalendarioScreen />}
        {view === "relatorio" && permissao === "admin" && <RelatorioScreen />}
        {view === "farol" && <FarolScreen permissao={permissao} />}
        {view === "alertas" && <AlertasScreen permissao={permissao} onAbrirCliente={abrirCliente} />}
        {view === "entregaveis" && <EntregaveisScreen onAbrirCliente={abrirCliente} />}
        {view === "icp" && permissao !== "envoxer" && <IcpScreen />}
        {view === "faturamento" && permissao === "admin" && <FaturamentoScreen />}
        {view === "churn" && <ChurnListaScreen />}
        {view === "config-alertas" && <ConfigAlertasScreen permissao={permissao} />}
        {view === "foco-ativos" && <FocoAtivosScreen onAbrirTarefa={abrirTarefa} />}
        {view === "f4" && <F4Screen permissao={permissao} envoxerId={envoxerId} />}
        {view === "configuracoes" && (
          <ConfiguracoesScreen
            item={configItem}
            onItemChange={setConfigItem}
            permissao={permissao}
            nome={nome}
            fotoUrl={fotoUrl}
            envoxerId={envoxerId}
            onFotoAtualizada={atualizarFotoUrl}
            clienteParaAbrir={clienteParaAbrir}
            onClienteAberto={() => setClienteParaAbrir(null)}
          />
        )}
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
          // Força remontagem ao trocar de card (ex.: clicar na barra de Foco pra
          // pular pro card ativo enquanto este modal já está aberto) — sem isso
          // o componente só troca a prop `tarefaId` e o estado local (como a
          // lista de Entregas) fica "preso" do card anterior por uma fração de
          // segundo até o novo fetch terminar.
          key={tarefaAberta.id || "nova"}
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
