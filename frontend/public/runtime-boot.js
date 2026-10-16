/* Envoxers bootstrap: exibe login antes de carregar os módulos internos. */
(() => {
  "use strict";
  const el = React.createElement;
  const root = ReactDOM.createRoot(document.getElementById("root"));
  const existing = new Map();

  window._installPrompt = null;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    window._installPrompt = event;
    if (window._onInstallPromptReady) window._onInstallPromptReady();
  });
  window.addEventListener("appinstalled", () => {
    window._installPrompt = null;
    if (window._onInstallPromptReady) window._onInstallPromptReady();
  });
  window._isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window._isStandalone = () => {
    if (navigator.standalone === true) return true;
    return !!(window.matchMedia && [
      "(display-mode: standalone)",
      "(display-mode: fullscreen)",
      "(display-mode: minimal-ui)",
      "(display-mode: window-controls-overlay)"
    ].some(query => {
      try { return window.matchMedia(query).matches; } catch (_) { return false; }
    }));
  };

  window.envoxersRegisterSW = () => {
    if (!("serviceWorker" in navigator) || EnvoxersAPI.getAccessMode() !== "normal") {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register("/sw.js").then(reg => reg).catch(err => {
      console.warn("Falha ao registrar notificações:", err);
      return null;
    });
  };
  if ("serviceWorker" in navigator) {
    // Atualiza instalações anteriores sem registrar um novo SW no computador
    // compartilhado. A versão nova não guarda respostas privadas em cache.
    navigator.serviceWorker.getRegistration()
      .then(reg => { if (reg) return reg.update(); })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type === "NAVIGATE" && window.envoxersNavigate) {
        window.envoxersNavigate(event.data.view);
      }
    });
  }
  window.pushHelpers = {
    isSupported() {
      return window.isSecureContext === true &&
        "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    },
    getPermission() { return "Notification" in window ? Notification.permission : "unsupported"; },
    _urlBase64ToUint8Array(base64String) {
      const padding = "=".repeat((4 - base64String.length % 4) % 4);
      const decoded = atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
      return Uint8Array.from(decoded, c => c.charCodeAt(0));
    },
    async subscribe() {
      if (!this.isSupported()) return null;
      // A instalação de Service Worker só ocorre quando o usuário escolhe
      // ativar notificações em um dispositivo pessoal/confiável.
      if (EnvoxersAPI.getAccessMode() !== "normal") return null;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return null;
      const registered = await window.envoxersRegisterSW();
      if (!registered) return null;
      const reg = await navigator.serviceWorker.ready;
      const vapidData = await EnvoxersAPI.api("/push/vapid-public-key");
      const existingSub = await reg.pushManager.getSubscription();
      const sub = existingSub || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(vapidData.public_key)
      });
      const json = sub.toJSON();
      const body = {
        endpoint: json.endpoint, p256dh: json.keys.p256dh,
        auth: json.keys.auth, user_agent: navigator.userAgent
      };
      await EnvoxersAPI.api("/push/subscribe", {method:"POST", body:JSON.stringify(body)});
      return body;
    },
    async unsubscribe() {
      if (!this.isSupported()) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await EnvoxersAPI.api("/push/unsubscribe", {
        method:"DELETE", body:JSON.stringify({endpoint})
      });
    }
  };

  function style(href) {
    if (existing.has(href)) return existing.get(href);
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = () => reject(new Error("Falha ao carregar estilos: " + href));
      document.head.appendChild(link);
    });
    existing.set(href, promise);
    return promise;
  }
  function script(src) {
    if (existing.has(src)) return existing.get(src);
    const promise = new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src;
      element.onload = resolve;
      element.onerror = () => reject(new Error("Falha ao carregar aplicação: " + src));
      document.body.appendChild(element);
    });
    existing.set(src, promise);
    return promise;
  }
  let loadingPromise;
  function loadApp() {
    if (!loadingPromise) {
      loadingPromise = (async () => {
        const res = await fetch("/assets-runtime/manifest.json", {cache:"no-store"});
        if (!res.ok) throw new Error("Não foi possível consultar a versão dos módulos");
        const manifest = await res.json();
        if (!manifest.app?.file) throw new Error("Versão dos módulos inválida");
        await Promise.all([
          style("/envox-tokens.css?v=20261015commentavatars1"),
          style("/envox-forms.css?v=2"),
          style("/pdi-jornada.css?v=20261015commentavatars1"),
          style("/f4-premium.css?v=20261015compact1"),
          script(manifest.app.file)
        ]);
        if (!window.AppShell || !window.EnvoxersShared) {
          throw new Error("O Envoxers não conseguiu carregar todos os módulos");
        }
        // Fontes institucionais não bloqueiam nem o login nem a abertura do app.
        style("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap").catch(() => {});
        if (EnvoxersAPI.getAccessMode() === "normal") window.envoxersRegisterSW();
      })().catch(error => { loadingPromise = null; throw error; });
    }
    return loadingPromise;
  }

  function Bootstrap() {
    const [phase, setPhase] = React.useState(() =>
      EnvoxersAPI.getToken() ? "loading" : "login");
    const [error, setError] = React.useState("");
    React.useEffect(() => {
      if (phase !== "loading") return;
      let alive = true;
      loadApp()
        .then(() => { if (alive) setPhase("ready"); })
        .catch(e => { if (alive) { setError(e.message); setPhase("error"); } });
      return () => { alive = false; };
    }, [phase]);
    if (phase === "login") {
      return el(window.LoginScreen, { onLoggedIn: () => setPhase("loading") });
    }
    if (phase === "loading") {
      return el("div", {className:"app-loading"},
        el("div", {className:"boot-loader"},
          el("span", {className:"boot-loader-mark"},"envoxers"),
          el("span", {className:"boot-loader-text"},"Abrindo seu espaço de trabalho…"),
          el("span", {className:"boot-loader-progress"})));
    }
    if (phase === "error") {
      return el("div", {className:"app-loading"},
        el("div", {className:"boot-loader"},
          el("strong", null, "Não conseguimos carregar o Envoxers"),
          el("p", null, error),
          el("button", {className:"btn btn-envox",onClick:()=>location.reload()}, "Tentar novamente")));
    }
    return el(window.EnvoxersShared.ToastProvider,null,el(window.AppShell));
  }

  root.render(el(Bootstrap));
})();
