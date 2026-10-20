/* Downloads Windows: progresso real, miniaturas e abrir pasta no Explorador. */
(() => {
  "use strict";
  if (!window.envoxersDesktop?.active || !window.__TAURI__?.core?.invoke) return;
  const desktop = window.envoxersDesktop, invoke = window.__TAURI__.core.invoke;
  const items = new Map();
  let serial = 0, panel = null, list = null;
  const fileType = name => {
    const ext = String(name || "").toLowerCase().split(".").pop();
    if (["png","jpg","jpeg","gif","webp","bmp","avif"].includes(ext)) return "image";
    if (["mp4","webm","mov","m4v","ogv"].includes(ext)) return "video";
    if (ext === "pdf") return "pdf";
    if (["csv","xlsx","xls"].includes(ext)) return "sheet";
    return "file";
  };
  const icons = {image:"🖼️",video:"🎬",pdf:"📕",sheet:"📊",file:"📄"};
  const readable = bytes => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" :
    bytes >= 1024 ? (bytes / 1024).toFixed(0) + " KB" : bytes + " B";
  const safeUrl = input => {
    try {
      const u = new URL(input, location.href);
      return u.origin === location.origin && /^\/api\/v1\/uploads\/[^/]+$/.test(u.pathname) &&
        !u.search && !u.hash ? u.href : null;
    } catch { return null; }
  };
  function updateDiagnostic() { window.dispatchEvent(new Event("envoxers:desktop-diagnostic")); }
  function make(tag,cls,text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function showPanel() {
    if (panel) return;
    panel = make("section",null);
    panel.id = "envox-download-panel";
    panel.setAttribute("aria-label","Downloads do Envoxers");
    const head = make("div","ev-head");
    const title = make("strong",null,"⬇️ Downloads");
    const open = make("button","ev-folder","📂 Abrir pasta");
    open.type = "button";
    open.title = "Abrir Downloads no Explorador de Arquivos";
    open.addEventListener("click",() => desktop.openDownloads());
    const toggle = make("button","ev-collapse","▾");
    toggle.type = "button";
    toggle.setAttribute("aria-label","Minimizar ou expandir downloads");
    const close = make("button","ev-close","×");
    close.type = "button";
    close.title = "Fechar painel de downloads";
    close.setAttribute("aria-label","Fechar painel de downloads");
    close.addEventListener("click",() => { panel.hidden = true; });
    head.append(title,open,toggle,close);
    list = make("div","ev-list");
    list.setAttribute("aria-live","polite");
    toggle.addEventListener("click",() => {
      list.hidden = !list.hidden;
      toggle.textContent = list.hidden ? "▴" : "▾";
    });
    panel.append(head,list);
    document.body.appendChild(panel);
  }

  // Prévia visual com imagens diretas e um frame de vídeo, se WebView2/codec permitir.
  function drawPreview(item,container) {
    const type = fileType(item.name), url = item.url && safeUrl(item.url);
    container.textContent = icons[type];
    if (!url || (type !== "image" && type !== "video")) return;
    if (type === "image") {
      const img = make("img");
      img.alt = "Miniatura de " + item.name;
      img.loading = "lazy";
      img.onload = () => { if (container.isConnected) container.replaceChildren(img); };
      img.onerror = () => {};
      img.src = url;
      return;
    }
    const video = make("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden","true");
    let cleaned = false, timeout;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timeout);
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch {}
    };
    video.addEventListener("loadedmetadata",() => {
      try { video.currentTime = Math.min(1,Math.max(0,(video.duration || 1) / 4)); }
      catch { cleanup(); }
    },{once:true});
    video.addEventListener("seeked",() => {
      if (cleaned) return;
      try {
        if (!video.videoWidth || !video.videoHeight) return cleanup();
        const canvas = make("canvas");
        canvas.width = 152; canvas.height = 112;
        canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
        const img = make("img");
        img.alt = "Quadro de prévia de " + item.name;
        img.src = canvas.toDataURL("image/jpeg",0.7);
        const play = make("span","ev-play","▶");
        if (container.isConnected) container.replaceChildren(img,play);
      } catch { /* Mantém o ícone se codec/canvas não permitir a extração. */ }
      cleanup();
    },{once:true});
    video.addEventListener("error",cleanup,{once:true});
    timeout = setTimeout(cleanup,12000);
    video.src = url + "#t=0.5";
  }

  function paint(item) {
    if (!item.node) {
      const row = make("div","ev-file"), preview = make("div","ev-preview");
      const info = make("div","ev-info");
      const name = make("div","ev-name",item.name);
      name.title = item.name;
      const caption = make("div","ev-caption");
      caption.setAttribute("role","status");
      const bar = make("progress","ev-progress");
      bar.setAttribute("aria-label","Progresso do download");
      const reveal = make("button","ev-reveal","📂 Ver na pasta");
      reveal.type = "button";
      reveal.title = "Abrir pasta Downloads no Explorador";
      reveal.hidden = true;
      reveal.addEventListener("click",() => desktop.openDownloads());
      info.append(name,caption,bar,reveal);
      row.append(preview,info);
      item.node = row; item.caption = caption; item.bar = bar; item.reveal = reveal;
      drawPreview(item,preview);
      list.prepend(row);
    }
    item.caption.className = "ev-caption";
    item.reveal.hidden = item.status !== "done";
    if (item.status === "done") {
      item.caption.textContent = "✓ Salvo em Downloads" + (item.received ? " · " + readable(item.received) : "");
      item.caption.classList.add("ev-status-ok");
      item.bar.max = 100; item.bar.value = 100;
    } else if (item.status === "error") {
      item.caption.textContent = "Falha: " + String(item.error || "não foi possível salvar").slice(0,105);
      item.caption.classList.add("ev-error");
      item.bar.removeAttribute("value");
    } else if (item.status === "saving") {
      item.caption.textContent = "Salvando arquivo no Windows…";
      item.bar.removeAttribute("value");
    } else if (item.total > 0) {
      const pct = Math.min(99,Math.floor(item.received * 100 / item.total));
      item.caption.textContent = pct + "% · " + readable(item.received) + " de " + readable(item.total);
      item.bar.max = 100; item.bar.value = pct;
    } else {
      item.caption.textContent = "Baixando… " + (item.received ? readable(item.received) : "aguardando tamanho");
      item.bar.removeAttribute("value");
    }
  }
  function add(name,url) {
    showPanel();
    panel.hidden = false;
    list.hidden = false;
    const item = {id:"dl-" + Date.now().toString(36) + "-" + (++serial),
      name:String(name || "arquivo").slice(0,220),url,status:"downloading",
      received:0,total:null,node:null};
    items.set(item.id,item);
    paint(item);
    while (items.size > 5) {
      const first = items.keys().next().value;
      items.get(first)?.node?.remove();
      items.delete(first);
    }
    return item;
  }
  function finish(item,name) {
    item.name = String(name);
    item.status = "done";
    item.node.querySelector(".ev-name").textContent = item.name;
    item.node.querySelector(".ev-name").title = item.name;
    paint(item);
    desktop.lastError = null;
    desktop.lastDownloadAt = new Date().toLocaleString("pt-BR");
    desktop.lastDownloadName = item.name;
    updateDiagnostic();
  }
  function fail(item,err) {
    item.status = "error";
    item.error = String(err);
    desktop.lastError = item.error;
    paint(item);
    updateDiagnostic();
  }
  const listen = window.__TAURI__?.event?.listen;
  if (typeof listen === "function") {
    listen("envoxers:download-progress",event => {
      const p = event.payload || {}, item = items.get(p.transferId);
      if (!item || item.status === "done" || item.status === "error") return;
      if (Number.isFinite(p.received)) item.received = Math.max(0,p.received);
      if (Number.isFinite(p.total) && p.total > 0) item.total = p.total;
      if (p.state === "complete") item.status = "saving";
      paint(item);
    }).catch(err => console.warn("Envoxers: monitor de download indisponível",err));
  }

  desktop.openDownloads = async () => {
    try {
      await invoke("native_open_downloads");
      return true;
    } catch(err) {
      const old = /not allowed by ACL|unknown command/i.test(String(err));
      const message = old ? "Atualize o Envoxers Desktop para a versão 0.3.2 para abrir a pasta."
        : "Não foi possível abrir Downloads: " + String(err);
      desktop.lastError = message;
      updateDiagnostic();
      window.alert(message);
      return false;
    }
  };

  desktop.download = async (url,filename) => {
    const trusted = safeUrl(url);
    const name = String(filename || url?.split("/").pop() || "arquivo").trim();
    const item = add(name,trusted);
    if (!trusted) { fail(item,"Link não autorizado"); return false; }
    try {
      const saved = await invoke("native_download",{
        url:trusted,filename:name,transferId:item.id
      });
      finish(item,saved);
      return true;
    } catch(err) { fail(item,err); return false; }
  };

  desktop.saveBlob = async (blob,filename) => {
    const item = add(filename || "relatorio.csv",null);
    if (blob.size > 12 * 1024 * 1024) {
      fail(item,"Relatório acima de 12 MB"); return false;
    }
    item.total = blob.size;
    try {
      const base64 = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onprogress = event => {
          if (event.lengthComputable) {
            item.received = event.loaded; item.total = event.total; paint(item);
          }
        };
        reader.onerror = () => reject(new Error("Falha ao ler relatório"));
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.readAsDataURL(blob);
      });
      item.status = "saving"; paint(item);
      const saved = await invoke("native_save_file",{filename:item.name,dataBase64:base64});
      finish(item,saved);
      return true;
    } catch(err) { fail(item,err); return false; }
  };

  document.addEventListener("click",event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    const url = safeUrl(anchor.href);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    const name = anchor.getAttribute("download") || anchor.getAttribute("title")
      || anchor.querySelector("strong")?.textContent
      || anchor.querySelector("span")?.textContent
      || anchor.textContent?.trim()
      || new URL(url).pathname.split("/").pop();
    desktop.download(url,String(name).trim());
  },true);
})();
