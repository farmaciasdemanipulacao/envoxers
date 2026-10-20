/* Downloads Windows: anexos por streaming nativo; relatórios CSV por IPC. */
(() => {
  "use strict";
  if (!window.envoxersDesktop?.active || !window.__TAURI__?.core?.invoke) return;
  const desktop = window.envoxersDesktop;
  const invoke = window.__TAURI__.core.invoke;
  let toastTimer;

  function feedback(message, error = false) {
    let el = document.getElementById("envoxers-download-feedback");
    if (!el) {
      el = document.createElement("div");
      el.id = "envoxers-download-feedback";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      Object.assign(el.style, {
        position:"fixed",bottom:"72px",right:"18px",zIndex:"2147483641",
        maxWidth:"min(420px,calc(100vw - 36px))",padding:"12px 16px",
        borderRadius:"12px",font:"600 13px/1.45 system-ui,sans-serif",
        boxShadow:"0 8px 26px #1b254844",color:"#fff"
      });
      document.body.appendChild(el);
    }
    el.style.background = error ? "#a5273d" : "#2646d9";
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), error ? 9000 : 5000);
  }

  function recordError(err) {
    desktop.lastError = String(err);
    window.dispatchEvent(new Event("envoxers:desktop-diagnostic"));
  }
  function saved(name) {
    desktop.lastError = null;
    desktop.lastDownloadAt = new Date().toLocaleString("pt-BR");
    desktop.lastDownloadName = name;
    window.dispatchEvent(new Event("envoxers:desktop-diagnostic"));
    feedback("✓ Arquivo salvo em Downloads: " + name);
  }

  desktop.download = async (url, filename) => {
    feedback("Baixando arquivo para a pasta Downloads…");
    try {
      const name = await invoke("native_download", {url, filename: filename || null});
      saved(name);
      return true;
    } catch (err) {
      recordError(err);
      feedback("Falha ao baixar: " + String(err), true);
      return false;
    }
  };

  desktop.saveBlob = async (blob, filename) => {
    if (blob.size > 12 * 1024 * 1024) {
      feedback("Relatório acima do limite de 12 MB", true);
      return false;
    }
    feedback("Salvando relatório em Downloads…");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Falha ao ler relatório"));
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.readAsDataURL(blob);
      });
      const name = await invoke("native_save_file", {filename, dataBase64:base64});
      saved(name);
      return true;
    } catch (err) {
      recordError(err);
      feedback("Falha ao salvar relatório: " + String(err), true);
      return false;
    }
  };

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch { return; }
    if (url.origin !== location.origin ||
        !/^\/api\/v1\/uploads\/[^/]+$/.test(url.pathname) ||
        url.search || url.hash) return;
    event.preventDefault();
    event.stopPropagation();
    const name = anchor.getAttribute("download")
      || anchor.getAttribute("title")
      || anchor.querySelector("strong")?.textContent
      || anchor.querySelector("span")?.textContent
      || anchor.textContent?.trim()
      || url.pathname.split("/").pop();
    desktop.download(url.href, name.trim());
  }, true);
})();
