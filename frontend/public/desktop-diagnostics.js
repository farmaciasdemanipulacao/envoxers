/* Diagnóstico nativo visível apenas no instalador Desktop. */
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("envoxers_desktop") !== "1") return;
  const style = document.createElement("style");
  style.textContent = "#evdx{position:fixed;right:16px;bottom:16px;z-index:2147483640;font:13px/1.5 system-ui,sans-serif;color:#1d2440}body:has(.chat-input-bar) #evdx{display:none!important}#evdx button{cursor:pointer;font:inherit}#evdx-toggle{background:#2547e8;color:#fff;border:0;border-radius:30px;padding:10px 15px;box-shadow:0 6px 22px #101a4d55;font-weight:700}#evdx-panel{background:#fff;border:1px solid #d5daea;border-radius:14px;box-shadow:0 10px 35px #101a4d55;width:min(370px,calc(100vw - 30px));max-height:75vh;overflow:auto;box-sizing:border-box;padding:16px;margin-bottom:10px}#evdx-panel[hidden]{display:none}#evdx-panel h3{margin:0 0 8px;font-size:16px}#evdx-panel p{margin:8px 0}#evdx-panel .actions{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}#evdx-panel .actions button{background:#f0f3fc;color:#17348b;border:1px solid #cbd4ed;border-radius:8px;padding:8px 10px;font-weight:600}#evdx-panel .actions button:disabled{opacity:.5;cursor:wait}#evdx-status{background:#f5f7fb;border-radius:9px;padding:10px;white-space:pre-line;overflow-wrap:anywhere}#evdx-panel .hint{font-size:12px;color:#5c6680}";
  document.head.appendChild(style);
  function start() {
    if (document.getElementById("evdx")) return;
    const wrapper = document.createElement("aside");
    wrapper.id = "evdx";
    wrapper.setAttribute("aria-label", "Diagnóstico do aplicativo Windows");
    wrapper.innerHTML = [
      '<section id="evdx-panel" hidden>',
      '<h3>🖥️ Diagnóstico Windows</h3>',
      '<p class="hint">Testes nativos sem depender de receber uma mensagem.</p>',
      '<div id="evdx-status" role="status">Verificando...</div>',
      '<div class="actions">',
      '<button type="button" id="evdx-alert">Testar notificação</button>',
      '<button type="button" id="evdx-badge">Testar bolinha</button>',
      '<button type="button" id="evdx-download">Testar download</button>',
      '<button type="button" id="evdx-update">Verificar atualizações</button>',
      '<button type="button" id="evdx-startup">Ativar início com Windows</button>',
      '<button type="button" id="evdx-refresh">Atualizar</button>',
      '<button type="button" id="evdx-copy">Copiar resultado</button>',
      '</div>',
      '<p class="hint" id="evdx-result" aria-live="polite"></p>',
      '<p class="hint">Se o teste for aceito mas o aviso não aparecer, verifique o Não Perturbe e as notificações do Windows.</p>',
      '</section>',
      '<button id="evdx-toggle" type="button" aria-expanded="false">🖥 Diagnóstico Windows</button>'
    ].join("");
    document.body.appendChild(wrapper);
    const el = (id) => document.getElementById(id);
    const panel = el("evdx-panel"), status = el("evdx-status"), result = el("evdx-result"), startButton = el("evdx-startup");
    let enabled = false, badgeOn = false, report = "";
    const invoke = (command, args = {}) => {
      const core = window.__TAURI__?.core;
      if (!core || typeof core.invoke !== "function") {
        throw new Error("Ponte nativa ausente: janela sem acesso ao Tauri.");
      }
      return core.invoke(command, args);
    };
    async function refresh() {
      if (!window.__TAURI__?.core?.invoke) {
        report = "Integração nativa AUSENTE. Verifique se o instalador 0.2.0 foi aberto.";
        status.textContent = report;
        startButton.disabled = true;
        return;
      }
      try {
        const s = await invoke("native_status");
        enabled = !!s.autostart_registered;
        startButton.disabled = false;
        startButton.textContent = enabled ? "Desativar início com Windows" : "Ativar início com Windows";
        report = [
          "Versão: " + s.version,
          "Ponte Tauri: conectada",
          "Windows: " + (s.windows ? "sim" : "não"),
          "Inicialização registrada: " + (enabled ? "sim" : "não"),
          "Erro do registro: " + (s.autostart_error || "nenhum"),
          "Chat em tempo real: " + (window.envoxersDesktop?.socketStatus || "aguardando"),
          "Última mensagem recebida: " + (window.envoxersDesktop?.lastMessageAt || "nenhuma nesta sessão"),
          "Último alerta nativo enviado: " + (window.envoxersDesktop?.lastAlertAt || "nenhum nesta sessão"),
          "Pasta de downloads: botão Abrir pasta no painel de transferências",
          "Último download: " + (window.envoxersDesktop?.lastDownloadAt || "nenhum nesta sessão"),
          "Último arquivo: " + (window.envoxersDesktop?.lastDownloadName || "nenhum"),
          "Atualizador: " + (window.envoxersDesktopUpdater?.state?.status || "indisponível"),
          "Nova versão: " + (window.envoxersDesktopUpdater?.state?.version || "nenhuma"),
          "Última consulta: " + (window.envoxersDesktopUpdater?.state?.lastCheckedAt || "ainda não"),
          "Erro de atualização: " + (window.envoxersDesktopUpdater?.state?.error || "nenhum"),
          "Último erro nativo: " + (window.envoxersDesktop?.lastError || "nenhum")
        ].join("\n");
        status.textContent = report;
      } catch (err) {
        report = "Ponte detectada, mas comando nativo falhou: " + String(err);
        status.textContent = report;
        startButton.disabled = true;
      }
    }
    el("evdx-toggle").addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      el("evdx-toggle").setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) await refresh();
    });
    el("evdx-refresh").addEventListener("click", refresh);
    el("evdx-alert").addEventListener("click", async () => {
      try {
        await invoke("native_alert", { title: "Envoxers Desktop: teste", body: "Se este aviso apareceu, a integração nativa está funcionando." });
        result.textContent = "Comando enviado ao Windows. Você viu o aviso na tela?";
      } catch (err) { result.textContent = "Falha na notificação: " + String(err); }
      await refresh();
    });
    el("evdx-badge").addEventListener("click", async () => {
      try {
        badgeOn = !badgeOn;
        await invoke("native_badge", { count: badgeOn ? 1 : 0 });
        result.textContent = badgeOn ? "Bolinha ativada. Confira a barra de tarefas; clique novamente para limpar." : "Bolinha removida.";
      } catch (err) { result.textContent = "Falha no indicador: " + String(err); }
    });
    el("evdx-download").addEventListener("click", async () => {
      const testFile = new Blob(["Envoxers Desktop: download nativo funcionando."], {type:"text/plain"});
      const ok = await window.envoxersDesktop.saveBlob(testFile, "envoxers-teste-download.txt");
      result.textContent = ok ? "Arquivo de teste salvo na pasta Downloads." : "Falha no download. Veja o erro acima.";
      await refresh();
    });
    el("evdx-update").addEventListener("click", async () => {
      const updater = window.envoxersDesktopUpdater;
      if (!updater) { result.textContent = "Atualizador indisponível. Instale a versão 0.3.0."; return; }
      const btn = el("evdx-update");
      btn.disabled = true;
      result.textContent = "Consultando atualizações…";
      const next = await updater.check(true);
      btn.disabled = false;
      result.textContent = next.status === "disponivel" ? "Versão " + next.version + " disponível. Veja o aviso para atualizar." :
        next.status === "atualizado" ? "Seu Envoxers Desktop está atualizado." :
        next.status === "instalador_antigo" ? "Instale a versão 0.3.0 uma última vez para ativar o atualizador." :
        "Não foi possível consultar atualizações: " + (next.error || "erro desconhecido");
      await refresh();
    });
    startButton.addEventListener("click", async () => {
      startButton.disabled = true;
      try {
        const current = await invoke("native_set_autostart", { enabled: !enabled });
        result.textContent = current ? "Início automático registrado. Reinicie o Windows para confirmar." : "Início automático desativado.";
      } catch (err) { result.textContent = "Falha na inicialização: " + String(err); }
      await refresh();
    });
    el("evdx-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(report + "\nResultado: " + result.textContent);
        result.textContent = "Diagnóstico copiado. Cole na conversa.";
      } catch { result.textContent = "Não foi possível copiar; selecione o texto do diagnóstico."; }
    });
    window.addEventListener("envoxers:desktop-diagnostic", () => { if (!panel.hidden) refresh(); });
    window.addEventListener("envoxers:updater-status", () => { if (!panel.hidden) refresh(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
