/* Atualizador nativo Envoxers Desktop: consulta periódica, consentimento e progresso. */
(() => {
  "use strict";
  if (!window.envoxersDesktop?.active || !window.__TAURI__?.core?.invoke) return;
  const core = window.__TAURI__.core;
  const state = {
    status: "aguardando", version: null, notes: "", lastCheckedAt: null, error: null,
    installing: false, progress: ""
  };
  let checking = null, banner, supportsUpdater;
  async function supportsNativeUpdater() {
    if (supportsUpdater !== undefined) return supportsUpdater;
    try {
      const native = await core.invoke("native_status");
      const parts = String(native.version || "").split(".").map(Number);
      supportsUpdater = parts[0] > 0 || (parts[0] === 0 && parts[1] >= 3);
    } catch { supportsUpdater = false; }
    return supportsUpdater;
  }
  const notify = () => window.dispatchEvent(new Event("envoxers:updater-status"));
  const text = (value) => String(value || "");

  function renderBanner() {
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "envoxers-update-banner";
      banner.setAttribute("aria-label", "Atualização do Envoxers Desktop");
      Object.assign(banner.style, {
        position:"fixed", left:"16px", bottom:"18px", zIndex:"2147483642",
        width:"min(380px,calc(100vw - 32px))", background:"#fff", color:"#243150",
        border:"1px solid #cdd6f2", borderRadius:"14px", padding:"15px",
        boxShadow:"0 12px 40px #101a4d44", boxSizing:"border-box",
        font:"13px/1.5 system-ui,sans-serif"
      });
      banner.innerHTML = '<strong style="font-size:15px">🚀 Nova versão do Envoxers</strong><p id="envoxers-update-message" style="margin:9px 0"></p><div style="display:flex;gap:8px"><button type="button" id="envoxers-update-install" style="background:#2547e8;color:white;border:0;border-radius:8px;padding:9px 12px;cursor:pointer;font-weight:700">Atualizar agora</button><button type="button" id="envoxers-update-later" style="background:#f0f2f8;border:1px solid #d0d8e9;border-radius:8px;padding:9px 12px;cursor:pointer">Depois</button></div>';
      document.body.appendChild(banner);
      banner.querySelector("#envoxers-update-install").addEventListener("click", install);
      banner.querySelector("#envoxers-update-later").addEventListener("click", () => {
        if (state.version) sessionStorage.setItem("envoxers-update-later-" + state.version, "1");
        banner.remove(); banner = null;
      });
    }
    const msg = banner.querySelector("#envoxers-update-message");
    msg.textContent = state.installing ? (state.progress || "Baixando atualização…") :
      "Versão " + state.version + " disponível. Salve seu trabalho antes de atualizar. O aplicativo será reiniciado.";
    banner.querySelector("#envoxers-update-install").disabled = state.installing;
    banner.querySelector("#envoxers-update-later").disabled = state.installing;
  }

  async function check(manual = false) {
    if (checking) return checking;
    state.status = "verificando";
    state.error = null;
    notify();
    checking = (async () => {
      try {
        if (!await supportsNativeUpdater()) {
          state.status = "instalador_antigo";
          state.lastCheckedAt = new Date().toLocaleString("pt-BR");
          return {...state};
        }
        const update = await core.invoke("native_check_update");
        state.lastCheckedAt = new Date().toLocaleString("pt-BR");
        if (update?.version) {
          state.status = "disponivel";
          state.version = text(update.version);
          state.notes = text(update.notes);
          if (manual || !sessionStorage.getItem("envoxers-update-later-" + state.version)) renderBanner();
        } else {
          state.status = "atualizado";
          state.version = null;
          state.notes = "";
          if (banner) { banner.remove(); banner = null; }
        }
      } catch (err) {
        state.status = "erro";
        state.error = String(err);
        if (manual) console.warn("Envoxers: falha ao verificar atualização", err);
      } finally {
        checking = null;
        notify();
      }
      return {...state};
    })();
    return checking;
  }

  async function install() {
    if (state.installing || state.status !== "disponivel") return false;
    state.installing = true;
    state.progress = "Preparando download seguro…";
    renderBanner();
    notify();
    try {
      await core.invoke("native_install_update");
      state.progress = "Instalação iniciada. O Envoxers será reiniciado.";
      renderBanner();
      notify();
      return true;
    } catch (err) {
      state.error = String(err);
      state.status = "erro";
      state.installing = false;
      state.progress = "";
      if (banner) { banner.remove(); banner = null; }
      notify();
      window.alert("Não foi possível atualizar o Envoxers: " + String(err));
      return false;
    }
  }

  window.envoxersDesktopUpdater = {state, check, install};
  if (core.event?.listen) {
    core.event.listen("envoxers:update-progress", (event) => {
      state.progress = text(event.payload);
      if (banner) renderBanner();
      notify();
    }).catch(() => {});
  }
  // Não interromper login, chamadas de Chat nem uma tarefa em andamento.
  setTimeout(() => check(false), 15000);
  setInterval(() => { if (!state.installing) check(false); }, 6 * 60 * 60 * 1000);
})();
