const { useState, useEffect, useCallback, useRef, createContext, useContext } = React;

function formatMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Extrai só os dígitos do que foi digitado e trata como centavos (mesmo
// comportamento de máscara monetária dos apps de banco: "300000" -> 3000,00)
function parseMoneyInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}

// Input de dinheiro com máscara em tempo real. `value` é number, `onChange`
// recebe number. Reusa formatMoney como única fonte de formatação (só tira
// o prefixo "R$" porque o "R$" já vem do ::before de .money-input no CSS).
function MoneyInput({ value, onChange, placeholder = "0,00", disabled = false, readOnly = false, className = "", style }) {
  const display = value || value === 0 ? formatMoney(value).replace(/^R\$\s?/, "") : "";
  return (
    <div className={`money-input ${className}`.trim()} style={style}>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => { if (!readOnly && !disabled && onChange) onChange(parseMoneyInput(e.target.value)); }}
      />
    </div>
  );
}

// ==================== TOAST ====================
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 999 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--r-md)",
              background: t.type === "error" ? "var(--farol-vermelho)" : t.type === "success" ? "var(--farol-verde)" : "var(--ink)",
              color: "#fff",
              fontSize: 13,
              boxShadow: "var(--shadow-2)",
              maxWidth: 320,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  return useContext(ToastContext);
}

function initials(nome) {
  return (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// Avatar com foto de verdade quando existe `fotoUrl` (D-090 — upload de imagem do
// usuário), cai pras iniciais quando não há. `size`/`className` seguem o mesmo
// padrão de classes já usado em todo o app ("avatar sm", "avatar md gray" etc.).
// Presença (ativo/ausente/offline) — store global simples (pub/sub manual, sem
// Context) porque o Avatar é chamado de telas muito distantes umas das outras
// (Chat, Kanban, Envoxers, Serviços, Clientes...) e cada uma teria que receber
// o mapa via prop só pra repassar pro Avatar. tc-app.jsx é o único que escreve
// (snapshot inicial via GET /chat/presenca + eventos "presenca" do WS global);
// aqui só se lê. Ver chat_ws_manager.py (backend) pra definição de cada status.
window.EnvoxersPresence = {
  _status: {},
  _listeners: new Set(),
  get(envoxerId) {
    return this._status[envoxerId] || "offline";
  },
  setAll(mapa) {
    this._status = { ...mapa };
    this._listeners.forEach((fn) => fn());
  },
  set(envoxerId, status) {
    this._status = { ...this._status, [envoxerId]: status };
    this._listeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },
};

function usePresenca(envoxerId) {
  const [, forcarRerender] = useState(0);
  useEffect(() => {
    if (envoxerId == null) return undefined;
    return window.EnvoxersPresence.subscribe(() => forcarRerender((n) => n + 1));
  }, [envoxerId]);
  return envoxerId == null ? null : window.EnvoxersPresence.get(envoxerId);
}

const PRESENCA_LABEL = { ativo: "Ativo agora", ausente: "Ausente — sem o app em primeiro plano", offline: "Offline" };

// `envoxerId` é opcional — só passe quando `fotoUrl`/`nome` forem de um Envoxer
// (pessoa da equipe) de verdade. Cliente (logo) não tem presença, não passar.
function Avatar({ nome, fotoUrl, size = "", className = "", envoxerId = null }) {
  const status = usePresenca(envoxerId);
  const classes = ["avatar", size, className].filter(Boolean).join(" ");
  const imagem = fotoUrl
    ? <img src={fotoUrl} alt={nome || ""} className={classes} style={{ objectFit: "cover" }} />
    : <div className={classes}>{initials(nome)}</div>;
  if (envoxerId == null) return imagem;
  return (
    <span className={"avatar-wrap " + size}>
      {imagem}
      <span className={"avatar-status avatar-status-" + status} title={PRESENCA_LABEL[status]} />
    </span>
  );
}

// Ícones discretos reaproveitados nas ações de item de lista (Etapas do processo
// e Etapas-modelo do Serviço) — mesmo estilo stroke-based já usado no resto do app.
function IconEditar(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M11 2l3 3-8 8-3.5 1 1-3.5z" />
    </svg>
  );
}
function IconAutomacao(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M9 1L3 9h4l-1 6 6-8H8z" />
    </svg>
  );
}
function IconExcluir(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M3 4h10M6.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4.5 4l.6 9a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-9" />
    </svg>
  );
}
function IconArrastar(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
      <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
      <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
    </svg>
  );
}

// Modal "Como fazer" — descrição/passo-a-passo de uma etapa, separado do card
// pra não bagunçar a lista quando a instrução é longa (D-100).
function ComoFazerModal({ titulo, descricao, onClose }) {
  return (
    <div className="modal-overlay open como-fazer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <div className="modal-eyebrow"><span>Como fazer</span></div>
          <h2 className="modal-title">{titulo}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            {descricao ? (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{descricao}</div>
            ) : (
              <div style={{ color: "var(--ink-4)", fontSize: 13 }}>Nenhuma instrução cadastrada pra essa etapa ainda.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Cor de urgência do prazo de uma etapa — verde (mais de 1 semana), amarelo
// (dentro dos próximos 7 dias), vermelho (atrasado). `null` quando não há prazo.
function corPrazoEtapa(prazo) {
  if (!prazo) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + "T00:00:00");
  const dias = Math.round((d - hoje) / 86400000);
  if (dias < 0) return "vermelho";
  if (dias <= 7) return "amarelo";
  return "verde";
}

// Recorte de foto de perfil (D-102) — antes o servidor cortava sempre o CENTRO
// geométrico da imagem, então qualquer foto vertical (corpo inteiro) ou muito
// larga cortava metade do rosto fora. Agora quem envia arrasta/dá zoom pra
// escolher o enquadramento antes do upload; o resultado já sai quadrado, então
// o backend (core/uploads.py::salvar_foto_avatar) só reprocessa/reencodifica,
// sem precisar mais adivinhar onde está o rosto.
function AvatarCropModal({ file, onCancel, onConfirm }) {
  const VIEWPORT = 260;
  const SAIDA_PX = 480;
  const [imgUrl] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState(null); // { w, h }
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [salvando, setSalvando] = useState(false);
  const imgElRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  const clamp = (ox, oy, s, size) => {
    if (!size) return { x: ox, y: oy };
    const dw = size.w * s, dh = size.h * s;
    return {
      x: Math.min(0, Math.max(VIEWPORT - dw, ox)),
      y: Math.min(0, Math.max(VIEWPORT - dh, oy)),
    };
  };

  const handleImgLoad = (e) => {
    const size = { w: e.target.naturalWidth, h: e.target.naturalHeight };
    const cover = Math.max(VIEWPORT / size.w, VIEWPORT / size.h);
    setNatural(size);
    setMinScale(cover);
    setScale(cover);
    setOffset({ x: (VIEWPORT - size.w * cover) / 2, y: (VIEWPORT - size.h * cover) / 2 });
  };

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    if (e.touches) e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragRef.current.startX;
    const dy = p.clientY - dragRef.current.startY;
    setOffset((prev) => clamp(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy, dragRef.current.scale, dragRef.current.natural));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", handlePointerMove);
    window.removeEventListener("mouseup", handlePointerUp);
    window.removeEventListener("touchmove", handlePointerMove);
    window.removeEventListener("touchend", handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (e) => {
    if (!natural) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    dragRef.current = { startX: p.clientX, startY: p.clientY, startOffset: offset, scale, natural };
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);
  };

  const handleZoom = (e) => {
    const novaEscala = Number(e.target.value);
    if (!natural) { setScale(novaEscala); return; }
    // Mantém o ponto que está no centro do viewport ancorado ao dar zoom,
    // em vez de recentralizar do zero (perderia o enquadramento escolhido).
    const cxImg = (VIEWPORT / 2 - offset.x) / scale;
    const cyImg = (VIEWPORT / 2 - offset.y) / scale;
    setOffset(clamp(VIEWPORT / 2 - cxImg * novaEscala, VIEWPORT / 2 - cyImg * novaEscala, novaEscala, natural));
    setScale(novaEscala);
  };

  const handleConfirmar = () => {
    if (!natural || !imgElRef.current) return;
    setSalvando(true);
    const canvas = document.createElement("canvas");
    canvas.width = SAIDA_PX; canvas.height = SAIDA_PX;
    const ctx = canvas.getContext("2d");
    const sx = (0 - offset.x) / scale;
    const sy = (0 - offset.y) / scale;
    const sSize = VIEWPORT / scale;
    ctx.drawImage(imgElRef.current, sx, sy, sSize, sSize, 0, 0, SAIDA_PX, SAIDA_PX);
    canvas.toBlob((blob) => { setSalvando(false); onConfirm(blob); }, "image/jpeg", 0.92);
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-head">
          <div className="modal-eyebrow"><span>Foto de perfil</span></div>
          <h2 className="modal-title">Ajustar foto</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-main" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div
              className="avatar-crop-viewport"
              style={{ width: VIEWPORT, height: VIEWPORT }}
              onMouseDown={handlePointerDown}
              onTouchStart={handlePointerDown}
            >
              <img
                ref={imgElRef}
                src={imgUrl}
                onLoad={handleImgLoad}
                draggable={false}
                alt="Pré-visualização da foto"
                style={{
                  position: "absolute",
                  left: offset.x, top: offset.y,
                  width: natural ? natural.w * scale : "auto",
                  height: natural ? natural.h * scale : "auto",
                  maxWidth: "none",
                  userSelect: "none",
                }}
              />
              <div className="avatar-crop-mask" />
            </div>
            <input
              className="avatar-crop-zoom"
              type="range"
              min={minScale}
              max={minScale * 3}
              step={((minScale * 3 - minScale) || 0.01) / 100}
              value={scale}
              onChange={handleZoom}
              style={{ width: VIEWPORT }}
              disabled={!natural}
            />
            <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center" }}>
              Arraste a foto e use o zoom pra centralizar o rosto no círculo.
            </div>
          </div>
        </div>
        <div className="comment-box-actions" style={{ gap: 8, borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-sm" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-envox btn-sm" onClick={handleConfirmar} disabled={!natural || salvando}>
            {salvando ? "Salvando…" : "Usar essa foto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== SIDEBAR ====================
function Sidebar({ view, onNavigate, nome, permissao, fotoUrl, envoxerId, chatNaoLidas = 0, collapsed = false, onToggleCollapse, mobileOpen = false, isMobile = false, onCloseMobile, modulosAcesso = null }) {
  const temModulo = (key) => !Array.isArray(modulosAcesso) || modulosAcesso.includes(key);

  // title=label dá o tooltip nativo do navegador — é o que mostra o nome da seção
  // quando o menu está recolhido e o texto (.nav-label) some.
  const item = (key, label, icon, helpKey, badge) => (
    <a className={view === key ? "active" : ""} onClick={() => onNavigate(key)} style={{ cursor: "pointer" }} title={label}>
      {icon}
      <span className="nav-label">{label}</span>
      {!!badge && <span className="nav-badge">{badge}</span>}
      {helpKey && <HelpIcon helpKey={helpKey} />}
    </a>
  );

  // Estado dos grupos do menu é individual por usuário e persiste em localStorage.
  // Não é apagado no logout: ao entrar novamente no mesmo navegador, cada pessoa
  // recupera exatamente os pais que deixou abertos/fechados.
  const sectionDefaults = {
    comercial: true,
    operacao: true,
    entregaveis: true,
    farol: true,
    icp: true,
    desenvolvimento: true,
    admin: true,
  };
  const sectionStorageKey = envoxerId ? `envoxers_sidebar_sections_${envoxerId}` : null;
  const readSectionState = () => {
    if (!sectionStorageKey) return sectionDefaults;
    try {
      const saved = JSON.parse(localStorage.getItem(sectionStorageKey) || "{}");
      return { ...sectionDefaults, ...saved };
    } catch (err) {
      return sectionDefaults;
    }
  };
  const [sectionOpen, setSectionOpen] = useState(readSectionState);
  useEffect(() => {
    setSectionOpen(readSectionState());
  }, [envoxerId]);

  const toggleSection = (key) => {
    setSectionOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (sectionStorageKey) localStorage.setItem(sectionStorageKey, JSON.stringify(next));
      return next;
    });
  };
  const sectionHasActive = (key) => ({
    comercial: view.startsWith("comercial-"),
    operacao: ["kanban", "dashboard", "calendario", "foco-ativos", "foco-ajustes", "demandas-avulsas", "arquivos"].includes(view),
    entregaveis: view === "entregaveis",
    farol: ["solicitacoes", "farol", "alertas"].includes(view),
    icp: ["icp", "churn"].includes(view),
    desenvolvimento: view === "f4",
    admin: ["config-alertas", "relatorio", "faturamento", "feedback-sistema"].includes(view),
  }[key] || false);
  const sectionClass = (key) =>
    `nav-section nav-section-collapsible ${sectionOpen[key] ? "open" : "closed"}${sectionHasActive(key) ? " has-active" : ""}`;
  const sectionIcon = (key) => {
    const common = { className: "nav-section-parent-icon", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5" };
    if (key === "comercial") return <svg {...common}><path d="M2 13V8h3v5M6.5 13V4h3v9M11 13V6h3v7" /></svg>;
    if (key === "operacao") return <svg {...common}><path d="M3 3h10v10H3z"/><path d="M6 3v10M3 7h3M9 7h4"/></svg>;
    if (key === "entregaveis") return <svg {...common}><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 8l2 2 4-4"/></svg>;
    if (key === "farol") return <svg {...common}><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/></svg>;
    if (key === "icp") return <svg {...common}><circle cx="6" cy="6" r="2.5"/><path d="M2.5 13c.5-2.5 1.7-3.8 3.5-3.8S9 10.5 9.5 13M11 4h3M12.5 2.5v3"/></svg>;
    if (key === "desenvolvimento") return <svg {...common}><path d="M8 2l1.6 3.3 3.7.5-2.7 2.6.7 3.7L8 10.3 4.7 12l.7-3.6-2.7-2.6 3.7-.5z"/></svg>;
    return <svg {...common}><circle cx="8" cy="8" r="5.5"/><path d="M8 5v6M5 8h6"/></svg>;
  };
  const sectionTitle = (key, label) => (
    <button
      type="button"
      className="nav-section-title nav-section-toggle"
      onClick={() => toggleSection(key)}
      aria-expanded={!!sectionOpen[key]}
      title={sectionOpen[key] ? `Recolher ${label}` : `Expandir ${label}`}
    >
      <span className="nav-section-title-main">{sectionIcon(key)}<span>{label}</span></span>
      <svg className="nav-section-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 2.5L7.5 6 4 9.5" />
      </svg>
    </button>
  );

  return (
    <aside className={"sidebar" + (collapsed && !isMobile ? " collapsed" : "") + (mobileOpen ? " open" : "")}>
      <div className="brand">
        <div className="brand-title">
          <span className="brand-mark">envoxers<span className="brand-dot"></span></span>
        </div>
        {/* No mobile o botão fecha a gaveta (X) — recolher-pra-ícones é um
            conceito só de desktop e não faz sentido dentro da gaveta deslizante. */}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={isMobile ? onCloseMobile : onToggleCollapse}
          title={isMobile ? "Fechar menu" : (collapsed ? "Expandir" : "Recolher")}
          aria-label={isMobile ? "Fechar menu" : (collapsed ? "Expandir menu" : "Recolher menu")}
        >
          {isMobile ? (
            <svg className="sidebar-collapse-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          ) : (
            <svg className="sidebar-collapse-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 3L4 8l5 5" />
              <path d="M13 3L8 8l5 5" />
            </svg>
          )}
        </button>
      </div>

      <div className={sectionClass("comercial")} style={{ display: temModulo("comercial") ? undefined : "none" }}>
        {sectionTitle("comercial", "Comercial")}
        <nav className="nav">
          {item("comercial-dashboard", "Dashboard", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V7h3v6M6.5 13V3h3v10M11 13V5h3v8" /></svg>)}
          {item("comercial-hoje", "Prospecções de Hoje", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>)}
          {item("comercial-leads", "Leads", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M2 13c.4-2.6 1.8-4 4-4s3.6 1.4 4 4M11 5h3M12.5 3.5v3"/></svg>)}
          {item("comercial-pipeline", "Pipeline", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="3" height="10" rx="1"/><rect x="6.5" y="3" width="3" height="10" rx="1"/><rect x="11" y="3" width="3" height="10" rx="1"/></svg>)}
          {item("comercial-conversas", "Conversas", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v7H5l-3 3z"/><path d="M5 6h6M5 8h4"/></svg>)}
          {item("comercial-cadencias", "Cadências", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3h8M3 8h6M3 13h10"/><path d="M12 2l2 2-2 2"/></svg>)}
          {item("comercial-tarefas", "Tarefas", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8l2 2 4-4"/></svg>)}
          {permissao === "comercial" && temModulo("operacao") && item("foco-ajustes", "Ajustes de Foco", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5v4l2.5 1.5M12.5 2.5l1 1-2 2"/></svg>)}
          {item("comercial-oportunidades", "Oportunidades", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 4v8M5 7h6"/></svg>)}
          {item("comercial-relatorios", "Relatórios", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V3M2 13h12"/><path d="M5 10V7M8 10V5M11 10V8"/></svg>)}
          {item("comercial-config", "Configurações", <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1"/></svg>)}
        </nav>
      </div>

      {permissao === "comercial" && temModulo("operacao") && (
        <div className="nav-items">
          {item(
            "arquivos",
            "Arquivos",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h5l1.2 1.5H14v7.5H2z"/><path d="M2 4V2.8h5l1.2 1.2"/></svg>
          )}
        </div>
      )}

      {permissao !== "comercial" && <>
      <div className={sectionClass("operacao")} style={{ display: temModulo("operacao") ? undefined : "none" }}>
        {sectionTitle("operacao", "Operação")}
        <nav className="nav">
          {item(
            "kanban",
            "Kanban",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="3" height="10" rx="1" /><rect x="6.5" y="3" width="3" height="7" rx="1" /><rect x="11" y="3" width="3" height="4" rx="1" /></svg>,
            "nav_kanban"
          )}
          {item(
            "dashboard",
            "Dash do dia",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="6" rx="1" /></svg>,
            "nav_dashboard"
          )}
          {item(
            "calendario",
            "Calendário",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="10" rx="1" /><path d="M2 7h12M6 2v3M10 2v3" /></svg>,
            "nav_calendario"
          )}
          {item(
            "foco-ativos",
            "Foco",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>,
            "nav_foco_ativos"
          )}
          {item(
            "foco-ajustes",
            "Ajustes de Foco",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5v4l2.5 1.5M12.5 2.5l1 1-2 2"/></svg>
          )}
          {item(
            "demandas-avulsas",
            "Demandas avulsas",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5 6h6M5 9h4"/></svg>
          )}
          {item(
            "arquivos",
            "Arquivos",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h5l1.2 1.5H14v7.5H2z"/><path d="M2 4V2.8h5l1.2 1.2"/></svg>
          )}
        </nav>
      </div>

      <div className={sectionClass("entregaveis")} style={{ display: temModulo("entregas") ? undefined : "none" }}>
        {sectionTitle("entregaveis", "Entregas")}
        <nav className="nav">
          {item(
            "entregaveis",
            "Controle",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8l3 3 7-7" /><rect x="2" y="2" width="12" height="12" rx="2" /></svg>,
            "nav_entregaveis"
          )}
        </nav>
      </div>

      <div className={sectionClass("farol")} style={{ display: temModulo("farol") ? undefined : "none" }}>
        {sectionTitle("farol", "Farol")}
        <nav className="nav">
          {item(
            "solicitacoes",
            "Solicitações",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12v8l-3-2H2z" /><path d="M5 7h6M5 9h4" /></svg>,
            "nav_solic"
          )}
          {item(
            "farol",
            "Farol",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>,
            "nav_farol"
          )}
          {item(
            "alertas",
            "Alertas",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l6 11H2z" /><path d="M8 6v3M8 11v.5" /></svg>,
            "nav_alertas"
          )}
        </nav>
      </div>

      <div className={sectionClass("icp")} style={{ display: temModulo("icp") ? undefined : "none" }}>
        {sectionTitle("icp", "ICP")}
        <nav className="nav">
          {permissao !== "envoxer" && item(
            "icp",
            "ICP Builder",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12l4-4 3 3 5-5" /></svg>,
            "nav_icp"
          )}
          {item(
            "churn",
            "Cancelamentos",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>,
            "nav_churn"
          )}
        </nav>
      </div>

      <div className={sectionClass("desenvolvimento")} style={{ display: temModulo("desenvolvimento") ? undefined : "none" }}>
        {sectionTitle("desenvolvimento", "Desenvolvimento")}
        <nav className="nav">
          {item(
            "f4",
            "PDI & Feedback",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.3 4.4 13.3l.7-4.1-3-2.9 4.1-.6z" /></svg>
          )}
        </nav>
      </div>

      {(permissao === "admin" || permissao === "gestor" || permissao === "tecnico") && (
        <div className={sectionClass("admin")} style={{ display: temModulo("admin") ? undefined : "none" }}>
          {sectionTitle("admin", "Admin")}
          <nav className="nav">
            {permissao === "admin" && item(
              "foco-relatorio",
              "Focos",
              <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 4.5v4l2.5 1.5"/><path d="M11.5 2.5l1.2 1.2"/></svg>
            )}
            {permissao === "admin" && item(
              "relatorio",
              "Custos",
              <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V3M2 13h12" /><path d="M5 10V7M8 10V5M11 10V8" /></svg>,
              "nav_relatorio"
            )}
            {permissao === "admin" && item(
              "faturamento",
              "Painel de Faturamento",
              <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13l4-6 3 3 5-7" /><path d="M9 3h5v5" /></svg>,
              "nav_faturamento"
            )}
            {permissao !== "tecnico" && item(
              "config-alertas",
              "Configuração de Alertas",
              <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l6 11H2z" /><circle cx="8" cy="9" r="1.3" fill="currentColor" /></svg>
            )}
            {(permissao === "admin" || permissao === "tecnico") && item(
              "feedback-sistema",
              "Erros e Sugestões",
              <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v8H8l-4 3v-3H2z"/><path d="M5 6h6M5 8h4"/></svg>
            )}
          </nav>
        </div>
      )}

      </>}

      <div className="sidebar-user"
        onClick={permissao === "comercial" || !temModulo("configuracoes") ? undefined : () => onNavigate("configuracoes")}
        style={{ cursor: permissao === "comercial" || !temModulo("configuracoes") ? "default" : "pointer" }}
        title={temModulo("configuracoes") && permissao !== "comercial" ? "Configurações" : "Perfil"}
      >
        <Avatar nome={nome} fotoUrl={fotoUrl} envoxerId={envoxerId} />
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{nome}</div>
          <div className="sidebar-user-role">{permissao}</div>
        </div>
      </div>
    </aside>
  );
}

// ==================== PAGE HEADER ====================
function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-title-block">
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

// ==================== NOTIFICAÇÕES (push) ====================
// Ponto de acesso persistente pro sistema de push (window.pushHelpers, definido
// em index.html) — sem isso, a única forma de ativar era o banner que aparece
// uma vez 3s após login e nunca mais volta se for dispensado.
function NotificacoesButton() {
  const [aberto, setAberto] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [checando, setChecando] = useState(true);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const ph = window.pushHelpers;

  const atualizarStatus = () => {
    if (!ph || !ph.isSupported()) { setChecando(false); return; }
    setChecando(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false))
      .finally(() => setChecando(false));
  };

  useEffect(() => { atualizarStatus(); }, []);

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    const onKey = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", fechar);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  if (!ph || !ph.isSupported()) return null;

  const permissao = ph.getPermission();
  const bloqueado = permissao === "denied";

  const handleAtivar = async () => {
    setLoading(true);
    try {
      const result = await ph.subscribe();
      if (result) {
        toast("Notificações ativadas!", "success");
        setSubscribed(true);
      } else {
        toast("Permissão negada ou não suportada.", "warning");
      }
    } catch (err) {
      toast("Erro ao ativar notificações.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDesativar = async () => {
    setLoading(true);
    try {
      await ph.unsubscribe();
      setSubscribed(false);
      toast("Notificações desativadas.", "info");
    } catch (err) {
      toast("Erro ao desativar notificações.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestar = async () => {
    setLoading(true);
    try {
      await EnvoxersAPI.api("/push/test", { method: "POST" });
      toast("Notificação de teste enviada!", "success");
    } catch (err) {
      toast(err.message || "Erro ao enviar teste.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className={"btn btn-ghost btn-sm" + (subscribed ? " notif-btn-active" : "")}
        title="Notificações"
        aria-label="Notificações"
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2a3 3 0 0 0-3 3v1.5c0 1.6-.5 2.6-1.5 3.5h9c-1-.9-1.5-1.9-1.5-3.5V5a3 3 0 0 0-3-3z" /><path d="M6.3 12.3a1.8 1.8 0 0 0 3.4 0" /></svg>
      </button>

      {aberto && (
        <div className="notif-popover" onClick={(e) => e.stopPropagation()}>
          {checando ? (
            <div className="notif-popover-text">Verificando...</div>
          ) : bloqueado ? (
            <>
              <div className="notif-popover-title">Bloqueado pelo navegador</div>
              <div className="notif-popover-text">
                Você negou a permissão antes. Pra reativar, abra as configurações do site no navegador (ícone "aA"/cadeado na barra de endereço, ou Ajustes do iOS &gt; Safari &gt; este site) e libere Notificações.
              </div>
            </>
          ) : subscribed ? (
            <>
              <div className="notif-popover-title">Notificações ativas</div>
              <div className="notif-popover-text">Você vai receber alertas de farol em risco e mensagens do chat mesmo com o app fechado.</div>
              <div className="notif-popover-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleTestar} disabled={loading}>Enviar teste</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleDesativar} disabled={loading}>Desativar</button>
              </div>
            </>
          ) : (
            <>
              <div className="notif-popover-title">Ativar notificações</div>
              <div className="notif-popover-text">Receba alertas de farol em risco e mensagens do chat mesmo com o app fechado.</div>
              <div className="notif-popover-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAtivar} disabled={loading}>
                  {loading ? "..." : "Ativar"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackSistemaDock({ permissao }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState("enviar");
  const [tipo, setTipo] = useState("erro");
  const [prioridade, setPrioridade] = useState("media");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [capturaBlob, setCapturaBlob] = useState(null);
  const [capturaPreview, setCapturaPreview] = useState("");
  const [minhas, setMinhas] = useState([]);
  const [carregandoMinhas, setCarregandoMinhas] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [pendentesTeste, setPendentesTeste] = useState(0);
  const [validandoFalhaId, setValidandoFalhaId] = useState(null);
  const [validacaoDescricao, setValidacaoDescricao] = useState("");
  const [validacaoBlob, setValidacaoBlob] = useState(null);
  const [validacaoPreview, setValidacaoPreview] = useState("");
  const [validacaoCapturando, setValidacaoCapturando] = useState(false);
  const [validacaoEnviando, setValidacaoEnviando] = useState(false);
  const [testePendente, setTestePendente] = useState(null);
  const [testeAlertaVisivel, setTesteAlertaVisivel] = useState(false);
  const testePendenteIdRef = useRef(null);
  const testeReminderTimerRef = useRef(null);
  const toast = useToast();

  const revogarPreview = (url) => {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  useEffect(() => {
    carregarTestePendente(true);
    const timer = setInterval(() => carregarTestePendente(false), 30000);
    return () => {
      clearInterval(timer);
      if (testeReminderTimerRef.current) clearTimeout(testeReminderTimerRef.current);
    };
  }, []);

  const limparForm = () => {
    setTipo("erro");
    setPrioridade("media");
    setTitulo("");
    setDescricao("");
    setEditandoId(null);
    setCapturaBlob(null);
    revogarPreview(capturaPreview);
    setCapturaPreview("");
  };

  const limparValidacao = () => {
    setValidandoFalhaId(null);
    setValidacaoDescricao("");
    setValidacaoBlob(null);
    revogarPreview(validacaoPreview);
    setValidacaoPreview("");
  };

  async function carregarTestePendente(forcarExibicao = false) {
    try {
      const data = await EnvoxersAPI.api("/feedback-sistema/me");
      const pendentes = (data || []).filter((x) => x.status === "aguardando_teste");
      const primeiro = pendentes[0] || null;
      const idAnterior = testePendenteIdRef.current;

      setPendentesTeste(pendentes.length);
      setTestePendente(primeiro);
      testePendenteIdRef.current = primeiro ? primeiro.id : null;

      if (!primeiro) {
        setTesteAlertaVisivel(false);
        if (testeReminderTimerRef.current) {
          clearTimeout(testeReminderTimerRef.current);
          testeReminderTimerRef.current = null;
        }
        return;
      }

      if (forcarExibicao || idAnterior !== primeiro.id) {
        setTesteAlertaVisivel(true);
      }
    } catch (_) {}
  }

  const adiarAlertaTeste = () => {
    setTesteAlertaVisivel(false);
    if (testeReminderTimerRef.current) clearTimeout(testeReminderTimerRef.current);
    testeReminderTimerRef.current = setTimeout(() => {
      carregarTestePendente(true);
    }, 5 * 60 * 1000);
  };

  const abrirTestePendente = async () => {
    adiarAlertaTeste();
    limparForm();
    limparValidacao();
    setAberto(true);
    setAba("acompanhar");
    await carregarMinhas();
  };

  const carregarMinhas = async () => {
    setCarregandoMinhas(true);
    try {
      const data = await EnvoxersAPI.api("/feedback-sistema/me");
      setMinhas(data);
      setPendentesTeste(data.filter((x) => x.status === "aguardando_teste").length);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setCarregandoMinhas(false);
    }
  };

  const capturarTela = async (destino = "solicitacao") => {
    if (!window.html2canvas) return;
    const validacao = destino === "validacao";
    validacao ? setValidacaoCapturando(true) : setCapturando(true);
    try {
      const canvas = await window.html2canvas(document.body, {
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        ignoreElements: (el) => el && el.dataset && el.dataset.feedbackUi === "true",
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
      if (validacao) {
        revogarPreview(validacaoPreview);
        setValidacaoBlob(blob);
        setValidacaoPreview(blob ? URL.createObjectURL(blob) : "");
      } else {
        revogarPreview(capturaPreview);
        setCapturaBlob(blob);
        setCapturaPreview(blob ? URL.createObjectURL(blob) : "");
      }
    } catch (_) {
      if (validacao) {
        setValidacaoBlob(null);
        revogarPreview(validacaoPreview);
        setValidacaoPreview("");
      } else {
        setCapturaBlob(null);
        revogarPreview(capturaPreview);
        setCapturaPreview("");
      }
    } finally {
      validacao ? setValidacaoCapturando(false) : setCapturando(false);
    }
  };

  const abrir = async () => {
    limparForm();
    limparValidacao();
    setAberto(true);
    if (pendentesTeste > 0) {
      setAba("acompanhar");
      await carregarMinhas();
      return;
    }
    setAba("enviar");
    await capturarTela("solicitacao");
  };

  const abrirAcompanhar = async () => {
    limparValidacao();
    setAba("acompanhar");
    await carregarMinhas();
  };

  const editarItem = (item) => {
    setEditandoId(item.id);
    setTipo(item.tipo);
    setPrioridade(item.prioridade || "media");
    setTitulo(item.titulo);
    setDescricao(item.descricao);
    setCapturaBlob(null);
    setCapturaPreview(item.screenshot_url || "");
    setAba("enviar");
  };

  const enviar = async () => {
    if (!titulo.trim() || !descricao.trim() || enviando) return;
    setEnviando(true);
    try {
      let item;
      if (editandoId) {
        item = await EnvoxersAPI.api("/feedback-sistema/me/" + editandoId, {
          method: "PATCH",
          body: JSON.stringify({
            tipo,
            prioridade,
            titulo: titulo.trim(),
            descricao: descricao.trim(),
          }),
        });
      } else {
        const contexto =
          (document.querySelector(".topbar-crumb") && document.querySelector(".topbar-crumb").textContent.trim()) ||
          (document.querySelector(".page-title-block h1") && document.querySelector(".page-title-block h1").textContent.trim()) ||
          window.location.pathname;
        item = await EnvoxersAPI.api("/feedback-sistema", {
          method: "POST",
          body: JSON.stringify({
            tipo,
            prioridade,
            titulo: titulo.trim(),
            descricao: descricao.trim(),
            pagina: contexto,
          }),
        });
      }

      if (capturaBlob) {
        await EnvoxersAPI.upload(
          "/feedback-sistema/" + item.id + "/screenshot",
          capturaBlob,
          "captura-envoxers-" + item.id + ".png"
        );
      }

      toast(editandoId ? "Solicitação atualizada." : "Solicitação enviada. Obrigado!", "success");
      limparForm();
      setAba("acompanhar");
      await carregarMinhas();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (item) => {
    if (item.status !== "novo") return;
    if (!confirm('Excluir a solicitação "' + item.titulo + '"?')) return;
    try {
      await EnvoxersAPI.api("/feedback-sistema/me/" + item.id, { method: "DELETE" });
      toast("Solicitação excluída", "success");
      await carregarMinhas();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const confirmarFuncionou = async (item) => {
    if (!confirm("Confirma que você testou e agora está funcionando corretamente?")) return;
    try {
      await EnvoxersAPI.api("/feedback-sistema/me/" + item.id + "/confirmar-teste", { method: "POST" });
      toast("Teste confirmado. Ticket concluído!", "success");
      limparValidacao();
      if (testeReminderTimerRef.current) {
        clearTimeout(testeReminderTimerRef.current);
        testeReminderTimerRef.current = null;
      }
      await carregarMinhas();
      await carregarTestePendente(true);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const abrirFalha = async (item) => {
    limparValidacao();
    setValidandoFalhaId(item.id);
    await capturarTela("validacao");
  };

  const reportarFalha = async (item) => {
    if (validacaoDescricao.trim().length < 5) {
      toast("Explique o que ainda não funcionou", "error");
      return;
    }
    if (!validacaoBlob) {
      toast("Atualize ou gere o print antes de enviar", "error");
      return;
    }
    setValidacaoEnviando(true);
    try {
      await EnvoxersAPI.uploadWithFields(
        "/feedback-sistema/me/" + item.id + "/reportar-falha",
        validacaoBlob,
        "teste-nao-funcionou-" + item.id + ".png",
        { descricao: validacaoDescricao.trim() }
      );
      toast("Retorno enviado. O ticket voltou para análise.", "success");
      limparValidacao();
      if (testeReminderTimerRef.current) {
        clearTimeout(testeReminderTimerRef.current);
        testeReminderTimerRef.current = null;
      }
      await carregarMinhas();
      await carregarTestePendente(true);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setValidacaoEnviando(false);
    }
  };

  const statusLabel = (status) => ({
    novo: "Recebida",
    em_analise: "Em análise",
    aguardando_teste: "Aguardando seu teste",
    concluido: "Concluída",
    descartado: "Descartada",
  }[status] || status);

  const prioridadeLabel = (p) => ({ alta: "Alta", media: "Média", baixa: "Baixa" }[p] || p);

  const interacaoLabel = (tipoInteracao, autor) => ({
    admin_enviou_teste: "Ajuste enviado para teste por " + autor,
    usuario_aprovou: "Teste aprovado por " + autor,
    usuario_reprovou: "Teste reprovado por " + autor,
  }[tipoInteracao] || autor);

  const drawer = aberto ? (
    <>
      <div className="feedback-side-backdrop" data-feedback-ui="true" onClick={() => setAberto(false)}></div>
      <aside className="feedback-side-drawer" data-feedback-ui="true">
        <div className="feedback-side-head">
          <div>
            <span className="feedback-system-eyebrow">Envoxers</span>
            <h2>Erros e Sugestões</h2>
          </div>
          <button className="modal-close" onClick={() => setAberto(false)} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>

        <div className="feedback-user-tabs">
          <button className={aba === "enviar" ? "active" : ""} onClick={() => { limparValidacao(); setAba("enviar"); }}>
            {editandoId ? "Editando" : "Enviar"}
          </button>
          <button className={aba === "acompanhar" ? "active" : ""} onClick={abrirAcompanhar}>
            Status {pendentesTeste > 0 ? "(" + pendentesTeste + ")" : ""}
          </button>
        </div>

        {aba === "enviar" ? (
          <>
            <div className="feedback-side-body">
              {editandoId && (
                <div className="feedback-edit-notice">
                  Você está editando uma solicitação ainda não analisada.
                  <button type="button" onClick={() => { limparForm(); capturarTela("solicitacao"); }}>Cancelar edição</button>
                </div>
              )}
              <div className="feedback-form-row">
                <div className="field">
                  <label>Tipo</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    <option value="erro">Encontrei um erro</option>
                    <option value="funcionalidade">Quero fazer uma sugestão</option>
                  </select>
                </div>
                <div className="field">
                  <label>Prioridade</label>
                  <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Título</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={180} placeholder="Resuma em uma frase" />
              </div>
              <div className="field">
                <label>Explique o que aconteceu ou o que você precisa</label>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={7} placeholder="Conte o que aconteceu, o que esperava e qualquer detalhe útil." />
              </div>

              <div className="feedback-capture-card">
                <div className="feedback-capture-head">
                  <div>
                    <strong>Captura da tela</strong>
                    <span>{capturando ? "Capturando a tela atual…" : capturaPreview ? (editandoId && !capturaBlob ? "Captura atual da solicitação." : "A captura será enviada junto.") : "Não foi possível capturar automaticamente."}</span>
                  </div>
                  <button className="btn btn-xs" onClick={() => capturarTela("solicitacao")} disabled={capturando}>{capturando ? "..." : "Atualizar"}</button>
                </div>
                {capturaPreview && <img src={capturaPreview} alt="Prévia da captura da tela" />}
              </div>
            </div>

            <div className="feedback-side-footer">
              <button className="btn" onClick={() => setAberto(false)}>Cancelar</button>
              <button className="btn btn-envox" onClick={enviar} disabled={enviando || capturando || !titulo.trim() || !descricao.trim()}>
                {enviando ? "Salvando…" : editandoId ? "Salvar alterações" : "Enviar"}
              </button>
            </div>
          </>
        ) : (
          <div className="feedback-track-body">
            <div className="feedback-track-intro">
              <strong>Suas solicitações</strong>
              <span>Quando um ajuste ficar pronto, ele aparece aqui como Aguardando seu teste. O ticket só é concluído depois da sua confirmação.</span>
            </div>
            {carregandoMinhas ? (
              <div className="empty compact">Carregando…</div>
            ) : minhas.length === 0 ? (
              <div className="empty compact">Você ainda não enviou nenhuma solicitação.</div>
            ) : (
              <div className="feedback-track-list">
                {minhas.map((item) => (
                  <article className={"feedback-track-item priority-" + (item.prioridade || "media") + " status-" + item.status + (testePendente && testePendente.id === item.id ? " forced-test-target" : "")} key={item.id}>
                    <div className="feedback-track-top">
                      <span className={"feedback-priority-chip " + (item.prioridade || "media")}>{prioridadeLabel(item.prioridade || "media")}</span>
                      <span className={"feedback-status-chip status-" + item.status}>{statusLabel(item.status)}</span>
                    </div>
                    <h3>{item.titulo}</h3>
                    <p>{item.descricao}</p>
                    <div className="feedback-track-meta">
                      <span>{item.tipo === "erro" ? "Erro" : "Sugestão"}</span>
                      <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                    </div>

                    {item.status === "aguardando_teste" && (
                      <div className="feedback-validation-box">
                        <strong>Seu teste é obrigatório para encerrar este ticket</strong>
                        {item.observacao_admin && <p><b>O que foi feito:</b> {item.observacao_admin}</p>}
                        {validandoFalhaId !== item.id ? (
                          <div className="feedback-validation-actions">
                            <button className="btn btn-xs btn-envox" onClick={() => confirmarFuncionou(item)}>✓ Testei e funcionou</button>
                            <button className="btn btn-xs" onClick={() => abrirFalha(item)}>✕ Testei e não deu certo</button>
                          </div>
                        ) : (
                          <div className="feedback-validation-fail">
                            <label>O que ainda não deu certo?</label>
                            <textarea
                              value={validacaoDescricao}
                              onChange={(e) => setValidacaoDescricao(e.target.value)}
                              rows={4}
                              placeholder="Explique o que você testou, o resultado esperado e o que aconteceu."
                            />
                            <div className="feedback-capture-card">
                              <div className="feedback-capture-head">
                                <div>
                                  <strong>Print obrigatório</strong>
                                  <span>{validacaoCapturando ? "Capturando…" : validacaoPreview ? "Print pronto para enviar." : "Gere um print mostrando o problema."}</span>
                                </div>
                                <button className="btn btn-xs" onClick={() => capturarTela("validacao")} disabled={validacaoCapturando}>
                                  {validacaoCapturando ? "..." : "Atualizar print"}
                                </button>
                              </div>
                              {validacaoPreview && <img src={validacaoPreview} alt="Print do teste que não funcionou" />}
                            </div>
                            <div className="feedback-validation-actions">
                              <button className="btn btn-xs" onClick={limparValidacao}>Cancelar</button>
                              <button
                                className="btn btn-xs btn-envox"
                                onClick={() => reportarFalha(item)}
                                disabled={validacaoEnviando || validacaoCapturando || validacaoDescricao.trim().length < 5 || !validacaoBlob}
                              >
                                {validacaoEnviando ? "Enviando…" : "Enviar teste e reabrir ticket"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {item.status === "novo" && (
                      <div className="feedback-track-actions">
                        <button className="btn btn-xs" onClick={() => editarItem(item)}>Editar</button>
                        <button className="btn btn-xs danger-ghost" onClick={() => excluir(item)}>Excluir</button>
                      </div>
                    )}

                    {Array.isArray(item.interacoes) && item.interacoes.length > 0 && (
                      <div className="feedback-history">
                        <div className="feedback-history-title">Histórico do ticket</div>
                        {item.interacoes.map((interacao) => (
                          <div className={"feedback-history-item " + interacao.tipo} key={interacao.id}>
                            <div>
                              <strong>{interacaoLabel(interacao.tipo, interacao.autor_nome)}</strong>
                              <span>{new Date(interacao.created_at).toLocaleString("pt-BR")}</span>
                            </div>
                            {interacao.descricao && <p>{interacao.descricao}</p>}
                            {interacao.screenshot_url && (
                              <a href={interacao.screenshot_url} target="_blank" rel="noreferrer">Ver print enviado</a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  ) : null;

  const testeObrigatorioAlert = testeAlertaVisivel && testePendente ? (
    <div className="feedback-test-reminder-wrap" data-feedback-ui="true" role="alert" aria-live="assertive">
      <div className="feedback-test-reminder">
        <div className="feedback-test-reminder-icon">✓?</div>
        <div className="feedback-test-reminder-copy">
          <div className="feedback-test-reminder-eyebrow">TESTE PENDENTE · AÇÃO NECESSÁRIA</div>
          <h2>Você precisa testar uma correção agora</h2>
          <p><strong>{testePendente.titulo}</strong></p>
          {testePendente.observacao_admin && (
            <span>O que foi feito: {testePendente.observacao_admin}</span>
          )}
          {pendentesTeste > 1 && <small>Você tem {pendentesTeste} solicitações aguardando seu teste.</small>}
        </div>
        <div className="feedback-test-reminder-actions">
          <button type="button" className="feedback-test-now-btn" onClick={abrirTestePendente}>
            Testar agora
          </button>
          <button type="button" className="feedback-test-later-btn" onClick={adiarAlertaTeste}>
            Fechar por 5 min
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const trigger = (
    <button
      type="button"
      className="feedback-floating-fab"
      data-feedback-ui="true"
      onClick={abrir}
      title={pendentesTeste > 0 ? "Você tem solicitação aguardando teste" : "Enviar erro ou sugestão"}
      aria-label="Erros e Sugestões"
    >
      <svg width="19" height="19" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3.5h12v8H8l-4 3v-3H3z"/>
        <path d="M6 6.5h6M6 9h4"/>
      </svg>
      {pendentesTeste > 0 && <span className="feedback-floating-badge">{pendentesTeste > 9 ? "9+" : pendentesTeste}</span>}
    </button>
  );

  return (
    <>
      {ReactDOM.createPortal(trigger, document.body)}
      {testeObrigatorioAlert && ReactDOM.createPortal(testeObrigatorioAlert, document.body)}
      {drawer && ReactDOM.createPortal(drawer, document.body)}
    </>
  );
}


function FeedbackAdminAlerts({ permissao, onOpenFeedback }) {
  const elegivel = permissao === "admin" || permissao === "tecnico";
  const [alertas, setAlertas] = useState({ erros: [], sugestoes: [] });
  const [carregandoId, setCarregandoId] = useState(null);

  const carregar = useCallback(async () => {
    if (!elegivel) return;
    try {
      const data = await EnvoxersAPI.api("/feedback-sistema/alertas-nao-vistos");
      setAlertas({
        erros: Array.isArray(data.erros) ? data.erros : [],
        sugestoes: Array.isArray(data.sugestoes) ? data.sugestoes : [],
      });
    } catch (_) {}
  }, [elegivel]);

  useEffect(() => {
    if (!elegivel) return;
    carregar();
    const timer = setInterval(carregar, 15000);
    const onViewed = (e) => {
      const id = Number(e?.detail?.id || 0);
      if (!id) return;
      setAlertas((prev) => ({
        erros: prev.erros.filter((x) => x.id !== id),
        sugestoes: prev.sugestoes.filter((x) => x.id !== id),
      }));
    };
    window.addEventListener("feedback-alert-viewed", onViewed);
    return () => {
      clearInterval(timer);
      window.removeEventListener("feedback-alert-viewed", onViewed);
    };
  }, [elegivel, carregar]);

  const visualizar = async (item) => {
    if (!item || carregandoId) return;
    setCarregandoId(item.id);
    try {
      await EnvoxersAPI.api("/feedback-sistema/" + item.id + "/visualizar-alerta", { method: "POST" });
      setAlertas((prev) => ({
        erros: prev.erros.filter((x) => x.id !== item.id),
        sugestoes: prev.sugestoes.filter((x) => x.id !== item.id),
      }));
      window.dispatchEvent(new CustomEvent("feedback-alert-viewed", { detail: { id: item.id } }));
      if (onOpenFeedback) onOpenFeedback(item.id);
    } catch (_) {
      // O polling tenta novamente; não esconder um alerta que o backend não confirmou como visto.
    } finally {
      setCarregandoId(null);
    }
  };

  if (!elegivel) return null;

  const erro = alertas.erros[0];
  const sugestao = alertas.sugestoes[0];

  return (
    <>
      {sugestao && (
        <button
          type="button"
          className="feedback-suggestion-alert-btn"
          onClick={() => visualizar(sugestao)}
          title={alertas.sugestoes.length > 1 ? alertas.sugestoes.length + " novas sugestões" : "Nova sugestão"}
        >
          <span className="feedback-suggestion-alert-dot"></span>
          <span>Sugestão</span>
          <b>{alertas.sugestoes.length}</b>
        </button>
      )}

      {erro && ReactDOM.createPortal(
        <div className="feedback-critical-alert-wrap" role="alert" aria-live="assertive">
          <div className="feedback-critical-alert">
            <div className="feedback-critical-icon">!</div>
            <div className="feedback-critical-copy">
              <div className="feedback-critical-eyebrow">
                NOVO ERRO REPORTADO
                {alertas.erros.length > 1 && <span>{alertas.erros.length} pendentes de visualização</span>}
              </div>
              <h2>{erro.titulo}</h2>
              <p>
                <strong>{erro.criado_por_nome}</strong>
                {erro.pagina ? " · " + erro.pagina : ""}
              </p>
            </div>
            <button
              type="button"
              className="feedback-critical-open"
              onClick={() => visualizar(erro)}
              disabled={carregandoId === erro.id}
            >
              {carregandoId === erro.id ? "Abrindo…" : "Visualizar erro agora"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ==================== TOPBAR ====================
function Topbar({ crumb, onLogout, onMenuClick, onChatClick, chatBadge = 0, chatActive = false, leftAction = null, permissao = "envoxer", showChat = true, onOpenFeedback = null }) {
  return (
    <div className="topbar">
      <button className="mobile-menu-btn" aria-label="Abrir menu" onClick={onMenuClick}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
      </button>
      <div className="topbar-left">
        <div className="topbar-crumb">{crumb}</div>
        {leftAction}
      </div>
      <div className="topbar-actions">
        {showChat && (
          <button type="button" className={"topbar-chat-btn" + (chatActive ? " active" : "")} onClick={onChatClick} title="Chat interno">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v7H5l-3 3z" /></svg>
            <span>Chat</span>
            {chatBadge > 0 && <span className="topbar-chat-badge">{chatBadge > 99 ? "99+" : chatBadge}</span>}
          </button>
        )}
        <FeedbackAdminAlerts permissao={permissao} onOpenFeedback={onOpenFeedback} />
        <FeedbackSistemaDock permissao={permissao} />
        <NotificacoesButton />
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sair</button>
      </div>
    </div>
  );
}

// ==================== TOOLTIPS DE AJUDA (HelpIcon) ====================
// Textos copiados literalmente do wireframe (envox-f0-f3-wireframe.html, objeto
// HELP_TEXTS) — só o subconjunto usado nas telas em escopo (Farol, Alertas, ICP,
// Faturamento, Clientes, Envoxers, Calendário, Cancelamentos, Relatório de custo).
// Extensível: Dashboard, Kanban, Solicitações ficam de fora por ora.
const HELP_TEXTS = {
  cockpit: { t: "O que é o Cockpit", b: "<p>Sistema interno da Envox. Substitui o Ummense como fonte única da verdade.</p><p><strong>Objetivo nº 1:</strong> avisar antes que o cliente saia. Não é gestor de tarefas com farol — é gestor de risco de churn com kanban embutido.</p>" },

  // --- Navegação
  nav_calendario: { t: "Calendário geral", b: "<p>Publicações programadas + reuniões + captações + eventos externos, tudo numa agenda. Filtro por cliente.</p>" },
  nav_relatorio: { t: "Custos", b: "<p>Horas de Foco × custo do time × contrato. Mostra margem por cliente/serviço/tipo/envoxer. Sinaliza margem &lt;20% em amarelo, &lt;10% em vermelho.</p>" },
  nav_dashboard: { t: "Dash do dia", b: "<p>Resumo do que precisa da sua atenção hoje: farol dos clientes em risco, atrasos, aprovações pendentes, publicações dos próximos 3 dias, e captações do dia.</p>" },
  nav_kanban: { t: "Kanban de demandas", b: "<p>Todas as tarefas de todos os clientes em 8 colunas (Nova → Finalizado). Arraste cards entre colunas. Filtre por cliente, responsável, tipo e atrasadas.</p>" },
  nav_solic: { t: "Solicitações do cliente", b: "<p>Inbox de pedidos: novo post, alteração, material extra, campanha, dúvida, evento. Triar aqui evita que pedidos virem WhatsApp perdido.</p>" },

  // --- Dashboard
  dash_farol_widget: { t: "Farol do topo do Dashboard", b: "<p>Os até 5 clientes com pior health score aparecem aqui todo dia. Se você abrir o sistema só para uma coisa, é esta.</p><p>Clique no cliente para abrir a ficha.</p>" },
  dash_meu_foco: { t: "Meu Foco", b: "<p>Tempo total que você registrou <strong>hoje</strong> e <strong>esta semana</strong>.</p><p>Use este indicador para conferir se o tempo trabalhado está sendo apontado corretamente.</p>" },
  dash_progress: { t: "Em andamento", b: "<p>Tarefas nas colunas <em>Produção</em>, <em>Revisão interna</em> e <em>Ajustes</em>. É o que o time está tocando agora mesmo.</p>" },
  dash_prioridades_cards: { t: "Prioridades de hoje — Cards", b: "<p>Cards atrasados + com prazo hoje (prazo do CARD, não das etapas dele). Ordem automática: atraso primeiro, depois cor do farol do cliente, depois prazo mais próximo.</p><p>Arraste pra reordenar manualmente — a ordem manual sempre vence a automática, e some sozinha quando o card sai da lista.</p><p><strong>Este é o número que precisa ir a zero</strong> — atraso alimenta o sinal 2 do farol.</p>" },
  dash_prioridades_etapas: { t: "Prioridades de hoje — Tarefas/Etapas", b: "<p>Mesma lógica do bloco de Cards, mas olhando o prazo de cada TAREFA/ETAPA (checklist) dentro dos cards, não o prazo do card. Um card pode estar tranquilo com uma etapa dele já atrasada.</p><p>Arraste pra reordenar manualmente.</p>" },
  dash_approvals: { t: "Aprovações pendentes", b: "<p>Tarefas em <em>Aprovação cliente</em>. Se ficarem paradas, viram sinal no farol.</p>" },
  dash_pendencias: { t: "Pendências", b: "<p>Avisos gerados pela automação \"Criar alerta para o responsável\" das Etapas do processo, e por @menções em comentários de tarefa. Clicar abre a tarefa e marca o aviso como lido.</p>" },
  dash_next3: { t: "Cards — próximos 3 dias", b: "<p>Cards com prazo nos próximos 3 dias. Ajuda a decidir o que priorizar para não atrasar a entrega.</p>" },
  dash_next3_etapas: { t: "Tarefas/Etapas — próximos 3 dias", b: "<p>Etapas (checklist) com prazo nos próximos 3 dias, independente do prazo do card onde elas estão.</p>" },
  dash_hoje_eventos: { t: "Captações e eventos de hoje", b: "<p>Reuniões, captações e eventos externos agendados para hoje. Cabe checar antes das 10h.</p>" },
  dash_rel_rapido: { t: "Relatório rápido", b: "<p>Prévia de Custos (menu Admin → Custos). Mostra os clientes com pior situação de margem para você ver antes de abrir a tela cheia.</p>" },

  // --- Foco
  foco_hoje: { t: "Foco de hoje", b: "<p>Soma de todas as sessões de Foco finalizadas hoje.</p>" },
  foco_semana: { t: "Foco da semana", b: "<p>Soma das sessões de Foco finalizadas na semana.</p>" },

  // --- Solicitações
  solic_tab_novas: { t: "Solicitações novas", b: "<p>Pedidos que ainda não foram vistos por ninguém do time. Meta: zerar em 24h.</p>" },
  solic_tab_analise: { t: "Em análise", b: "<p>Vistas, sendo avaliadas. Cliente vê \"estamos avaliando\".</p>" },
  solic_acao: { t: "Ações da solicitação", b: "<p><strong>Virar demanda</strong> cria um card no Kanban com os dados. <strong>Em análise</strong> só marca como vista. <strong>Recusar</strong> exige motivo — cliente é notificado.</p>" },
  nav_farol: { t: "Farol de clientes", b: "<p>Todos os clientes ordenados por risco (health score 0-100). Vermelho = ligação essa semana. Amarelo = próximos 15 dias. Verde = mensal.</p>" },
  nav_alertas: { t: "Central de alertas", b: "<p>Toda vez que um cliente muda de farol, um alerta é criado com motivo específico e sugestão de ação. Reconheça, resolva, ou ignore com justificativa.</p>" },
  nav_entregaveis: { t: "Controle", b: "<p>Contratado × entregue por cliente, calculado a partir dos itens de escopo e das tarefas finalizadas no Kanban. Gaps em meses fechados viram alerta automaticamente.</p>" },
  nav_icp: { t: "ICP Builder", b: "<p>Compara clientes que ficaram &gt;12 meses com os que saíram em &lt;6 meses. A diferença entre os dois grupos é o seu ICP (quem buscar) e anti-ICP (quem evitar).</p>" },
  nav_churn: { t: "Cancelamentos", b: "<p>Histórico de churn. Cada cancelamento congela snapshot dos dados do cliente (segmento, ticket, canal, perfil) — sem isso o ICP builder mente.</p>" },
  nav_faturamento: { t: "Painel de Faturamento", b: "<p>MRR real, concentração top 3, receita em risco, projeção 90 dias, curva de retenção por cohort. A previsibilidade que substitui a montanha-russa.</p>" },
  nav_clientes: { t: "Cadastro de clientes", b: "<p>Base viva de contas. Cada cliente carrega dados de contrato + dados de ICP (segmento, canal, ticket, maturidade) — capturados no cadastro para uso em F3.</p>" },
  nav_envoxers: { t: "Cadastro de Envoxers", b: "<p>Time interno, cargos, acessos e responsáveis de gestão.</p>" },
  nav_servicos: { t: "Cadastro de serviços", b: "<p>Catálogo fixo do que a Envox oferece. Editar aqui reflete em contratos históricos — mude com cuidado.</p>" },

  // --- Farol
  farol_kpi_score: { t: "Score médio", b: "<p>Média do health score de todos os clientes ativos. Passar de 80 significa base saudável.</p>" },
  farol_ordenacao: { t: "Ordenação", b: "<p>Menor health score primeiro. Entre clientes da mesma cor, o pior score sobe. Isso resolve \"qual dos 2 vermelhos ligo hoje?\".</p>" },
  farol_kpi_verm: { t: "Clientes vermelhos", b: "<p>Farol geral vermelho. Cada um representa MRR em risco imediato. Ligação em até 7 dias.</p>" },
  farol_kpi_amar: { t: "Clientes amarelos", b: "<p>Alguma coisa não está bem, mas ainda dá para reverter sem drama. Cadência de contato: 15 dias.</p>" },
  farol_kpi_verde: { t: "Clientes verdes", b: "<p>Saudáveis. Foco: manter a cadência mensal, não relaxar. Cliente verde por 12+ meses vira base do ICP.</p>" },
  farol_health_score: { t: "Health Score", b: "<p>Nota 0-100 calculada dos 8 sinais ponderados.</p><p>Regra dura: 2+ sinais vermelhos força farol geral vermelho, independente do score.</p>" },
  farol_motivo: { t: "Motivo do farol", b: "<p>Só sinais que não estão verdes aparecem. Cada um mostra o valor bruto que disparou o alerta.</p>" },

  // --- Sinais do farol
  sig_entrega: { t: "Sinal 1 · Entrega", b: "<p>Tarefas finalizadas no prazo nos últimos 90 dias. Verde ≥80%; amarelo 50-79%; vermelho &lt;50%.</p><p>Peso 15.</p>" },
  sig_atrasadas: { t: "Sinal 2 · Atrasadas", b: "<p>Tarefas com prazo interno vencido e ainda não finalizadas. Verde 0; amarelo 1-2; vermelho 3+.</p><p>Peso 15.</p>" },
  sig_alteracoes: { t: "Sinal 3 · Alterações", b: "<p>Alterações pedidas vs. limite do escopo. Verde dentro do limite; amarelo no limite; vermelho passou.</p><p>Peso 10.</p>" },
  sig_aprovacoes: { t: "Sinal 4 · Aprovações paradas", b: "<p>Tempo em Revisão interna ou Aprovação cliente. Verde nenhuma &gt;5d parada; vermelho 1+; 2+ conta ainda mais.</p><p>Peso 10.</p>" },
  sig_pulso: { t: "Sinal 5 · Pulso de satisfação", b: "<p>Nota mensal 0-10 (NPS-like) do cliente. Verde ≥8; amarelo 6-7; vermelho ≤5.</p><p>Peso 25 — <strong>o maior</strong>.</p>" },
  sig_margem: { t: "Sinal 6 · Margem", b: "<p>(Contrato − custo horas) ÷ contrato. Verde ≥40%; amarelo 20-39%; vermelho &lt;20%.</p><p>Peso 15. Margem baixa não é insatisfação do cliente, é da agência.</p>" },
  sig_silencio: { t: "Sinal 7 · Silêncio", b: "<p>Dias desde o último check-in registrado. Verde ≤15d; amarelo 16-30d; vermelho &gt;30d.</p><p>Peso 10. Silêncio é dos sinais mais fortes de churn iminente.</p>" },
  sig_whatsapp: { t: "Sinal 8 · Termômetro WhatsApp", b: "<p>Viria por webhook do WhatsApp — sem integração no Envoxers ainda, por isso sempre \"sem dado\" (peso 0, não entra na conta).</p>" },

  // --- Alertas
  alerta_status: { t: "Estado do alerta", b: "<p><strong>Aberto</strong>: ninguém viu. <strong>Reconhecido</strong>: alguém pegou para si. <strong>Resolvido</strong>: cliente voltou ao verde ou situação foi tratada.</p>" },
  alerta_sugestao: { t: "Sugestão de ação", b: "<p>Baseada na combinação específica de sinais que disparou. Alerta útil, não decorativo.</p>" },

  // --- ICP Builder
  icp_retidos: { t: "Grupo A · Retidos", b: "<p>Clientes ativos há mais de 12 meses. Estes provaram fit — quem se parece com eles provavelmente também fica.</p>" },
  icp_perdidos: { t: "Grupo B · Perdidos cedo", b: "<p>Clientes que cancelaram com menos de 6 meses. Estes revelam o anti-ICP — quem se parece com eles, evite aceitar.</p>" },
  icp_insights: { t: "Insights automáticos", b: "<p>ICP (quem buscar) e anti-ICP (quem evitar) sintetizados em texto a partir das dimensões com maior diferença. Não é recomendação — é observação do padrão.</p>" },
  icp_dim_segmento: { t: "Segmento", b: "<p>Ramo de atividade. Se o mesmo segmento aparece muito em retidos e pouco em perdidos, é um bom sinal para buscar mais desse tipo.</p>" },
  icp_dim_canal: { t: "Canal de aquisição", b: "<p>Como o cliente chegou até a Envox. Sinal anti-ICP: outbound (prospecção fria) domina os perdidos cedo em quase todos os casos.</p>" },
  icp_dim_ticket: { t: "Ticket", b: "<p>Faturamento anual declarado pelo cliente. Serve para segmentar por porte. Ticket muito baixo geralmente = churn cedo por não conseguir pagar.</p>" },
  icp_dim_matur: { t: "Maturidade digital", b: "<p>Quão pronto o cliente está para marketing digital. Baixa maturidade = espera resultado sem entender o processo = churn por frustração.</p>" },
  icp_dim_perfil: { t: "Perfil comportamental", b: "<p>Fácil / neutro / difícil — como o cliente se comporta na operação. Detectável em 60-90 dias, antes de decidir se vale continuar.</p>" },
  icp_como_ler: { t: "Como ler as barras", b: "<p>Verde = % do grupo A (retidos). Vermelho = % do grupo B (perdidos). Coluna <em>Δ</em> mostra a diferença em pontos percentuais.</p><p>Δ acima de +15pp = característica preditiva de retenção. Abaixo de −15pp = fator de churn cedo.</p>" },

  // --- Painel de faturamento
  fat_mrr: { t: "MRR", b: "<p>Monthly Recurring Revenue — soma de <code>valor_contrato</code> dos clientes com <code>tipo_receita = recorrente</code>. É o número que separa faturamento previsível de projeto pontual.</p>" },
  fat_concentr: { t: "Concentração top 3", b: "<p>% do MRR que vem dos 3 maiores clientes. Acima de 30% é zona de risco: perder 1 mexe muito na receita.</p><p>Meta saudável: nenhum cliente responde por mais de 10% sozinho.</p>" },
  fat_risco: { t: "Receita em risco", b: "<p>Soma dos contratos em farol amarelo + vermelho. É o MRR que precisa de intervenção agora para não virar churn projetado no próximo mês.</p>" },
  fat_projecao: { t: "Projeção 90 dias", b: "<p>MRR menos os clientes em vermelho (churn projetado). Método conservador — assume que amarelos são reversíveis, vermelhos não.</p>" },
  fat_tempo_casa: { t: "Tempo médio de casa", b: "<p>Média de meses que os clientes ativos têm de contrato + média dos cancelados. Meta: passar dos 12 meses.</p>" },
  fat_mrr_chart: { t: "MRR mês a mês", b: "<p>Barras coloridas: meses fechados (azul), mês atual (preto), projeção 90 dias (hachurado).</p><p>Tendência importa mais que valor absoluto — 3 meses subindo = base saudável.</p>" },
  fat_concentr_chart: { t: "Barra de concentração", b: "<p>Cada segmento é um cliente do top MRR. Quanto maior a fatia, maior o risco de perdê-lo.</p>" },
  fat_cohort: { t: "Curva de retenção (cohort)", b: "<p>Cada linha é uma turma de contratação — mostra quantos ainda estão ativos N meses depois.</p><p>Verde escuro ≥90%, verde ≥70%, amarelo ≥50%, vermelho &lt;50%. Vazio = mês ainda no futuro.</p>" },

  // --- Form do cliente
  form_cli_ident: { t: "Identidade", b: "<p>Como o cliente aparece no sistema. Nome vira o rótulo em toda tela; logo é opcional.</p>" },
  form_cli_contrato: { t: "Contrato", b: "<p>Os campos aqui alimentam o Painel de faturamento e a projeção 90 dias. <code>Tipo de receita</code> separa recorrente (MRR) de pontual (não conta no MRR).</p>" },
  form_cli_icp: { t: "Dados de ICP", b: "<p>Estes campos parecem opcionais, mas são o que faz o ICP Builder funcionar em F3.</p><p>Cadastro pobre aqui = ICP cego lá. Preencha mesmo estimando.</p>" },
  form_cli_servicos: { t: "Serviços contratados", b: "<p>Marque os serviços do cliente e o valor mensal de cada um. A soma é <em>checagem</em> contra o <code>valor_contrato</code> — divergência maior que 10% acende alerta.</p>" },
  form_cli_escopo: { t: "Escopo & Entregáveis", b: "<p>Itens contratados (posts, vídeos, fotos, GMN…) com quantidade e cadência mensal/pontual. O <code>limite de alterações</code> vira o sinal 3 do farol — passar do limite acende amarelo. A reconciliação compara contratado × entregue automaticamente a partir das tarefas finalizadas no Kanban.</p>" },
  form_cli_links: { t: "Links e observações", b: "<p>Perfis do cliente e notas internas. As observações não são vistas pelo cliente.</p>" },

  // --- KPIs de Clientes
  cli_kpi_ativos: { t: "Clientes ativos", b: "<p>Contratos ativos (recorrente + pontual). Não inclui cancelados — esses ficam em <em>Retenção → Cancelamentos</em>.</p>" },
  cli_kpi_mrr: { t: "MRR contratado", b: "<p>Soma de <code>valor_contrato</code> dos clientes com <code>tipo_receita = recorrente</code>. É o número que o Painel de faturamento acompanha mês a mês.</p>" },
  cli_kpi_verm: { t: "Farol vermelho", b: "<p>Quantidade de clientes com farol calculado vermelho. Cada um tem uma ligação pendente essa semana.</p>" },
  cli_kpi_novos: { t: "Novos no mês (30d)", b: "<p>Clientes com <code>data_inicio_contrato</code> nos últimos 30 dias. Variação alta aqui é sinal comercial, não operacional.</p>" },

  // --- Ficha do cliente (textos originalmente de uma view separada no wireframe —
  // encaixados nas seções mais próximas do ClienteForm, decisão confirmada com o Gus)
  cli_cadencia: { t: "Cadência sugerida", b: "<p>Frequência de check-in que o sistema recomenda baseado no farol. Vermelho: 7 dias. Amarelo: 15. Verde: 30.</p><p>Editável — se for exceção conhecida (cliente que só quer 1× ao mês), sobrescreva.</p>" },
  cli_perfil: { t: "Perfil comportamental", b: "<p>Calculado: <strong>fácil / neutro / difícil</strong> a partir de velocidade de aprovação (peso 40), média de alterações por tarefa (peso 40) e atrasos causados pelo cliente (peso 20).</p><p>Score 0-100 (100 = mais fácil). É uma das dimensões do ICP.</p>" },
  cli_pulso_hist: { t: "Pulso — histórico", b: "<p>Barras: verde ≥9, amarelo 7-8, vermelho ≤6. Vazias hachuradas = mês sem registro.</p><p>Ver a <em>trajetória</em> importa mais que a nota atual — trajetória descendente é o sinal.</p>" },
  cli_checkins: { t: "Histórico de check-ins", b: "<p>Todo contato registrado com o cliente: ligação, reunião, mensagem, e-mail, presencial. Humor de cada um: positivo, neutro, negativo, crítico.</p>" },

  // --- Form do Envoxer
  form_env_ident: { t: "Identidade", b: "<p>Dados básicos. A <code>permissão</code> define o que o Envoxer pode ver: <em>envoxer</em> executa; <em>gestor</em> aprova; <em>admin</em> configura.</p>" },
  form_env_custo: { t: "Custo/hora", b: "<p>Use <strong>salário + encargos</strong> (multiplicador ~1,5-1,8×) dividido por horas úteis (~160h/mês).</p><p>Salário puro deixa a margem por cliente falsamente positiva.</p>" },

  // --- Calendário
  cal_legend: { t: "Cores do calendário", b: "<p>Azul = publicação (tarefa com prazo). Roxo = reunião. Âmbar = captação. Vermelho = live. Verde = evento externo. Marcador vermelho pequeno = cliente com farol vermelho.</p>" },

  // --- Relatório de custo
  rep_horas: { t: "Horas registradas", b: "<p>Soma de todas as sessões de Foco fechadas no período. Ajuda a estimar capacidade real do time.</p>" },
  rep_custo: { t: "Custo do time", b: "<p>Custo real das horas trabalhadas: <code>horas × custo/hora</code> por Envoxer. Já usa custo+encargos.</p>" },
  rep_receita: { t: "Receita do período", b: "<p>Soma de <code>valor_contrato</code> dos clientes com horas registradas no período. É o topo de linha do período.</p>" },
  rep_margem: { t: "Margem bruta", b: "<p>(Receita − Custo do time) ÷ Receita. Ainda não desconta overhead (aluguel, ferramentas, marketing). É o teto da margem, não o piso.</p>" },
  rep_tab_cliente: { t: "Margem por cliente", b: "<p>Ordena do menos rentável ao mais rentável. Vermelho = margem &lt;10%. Amarelo = 10-20%. Verde = &gt;20%.</p><p>Cliente vermelho + farol vermelho = renegociar ou encerrar.</p>" },
  rep_tab_servico: { t: "Por serviço", b: "<p>Onde o time está gastando horas por serviço. Mostra o \"peso\" de cada oferta na operação.</p>" },
  rep_tab_env: { t: "Por Envoxer", b: "<p>Horas + custo gerado + <em>utilização</em> (horas registradas ÷ meta). Utilização &gt;90% = sobrealocado; &lt;60% = subutilizado.</p>" },

  // --- Kanban
  kanban_col_nova: { t: "Nova demanda", b: "<p>Ponto de entrada. Tarefa cadastrada mas sem responsável ou prazo ainda.</p>" },
  kanban_col_planejamento: { t: "Planejamento", b: "<p>Definindo roteiro, briefing, referências. Pré-produção.</p>" },
  kanban_col_producao: { t: "Produção", b: "<p>Executando. Arte, edição, escrita. É onde o Foco geralmente acontece.</p>" },
  kanban_col_revisao_interna: { t: "Revisão interna", b: "<p>Gestor confere antes de mostrar ao cliente. <strong>Ninguém pula essa etapa</strong> — problemas aqui custam menos que problemas na aprovação do cliente.</p>" },
  kanban_col_aprovacao_cliente: { t: "Aprovação cliente", b: "<p>Cliente recebe criativo + legenda. Aprovando, vai para Programado. Solicitando ajuste, volta para Ajustes e incrementa o contador de alterações (sinal 3 do farol).</p>" },
  kanban_col_ajustes: { t: "Ajustes", b: "<p>Cliente pediu alteração. Executar e devolver para Aprovação cliente.</p>" },
  kanban_col_programado: { t: "Programado", b: "<p>Aprovado, aguardando data de publicação.</p>" },
  kanban_col_finalizado: { t: "Finalizado", b: "<p>Publicado ou entregue. Some do quadro por padrão (toggle \"Ocultar finalizadas\" acima).</p>" },
  card_farol: { t: "Listra colorida do card", b: "<p>É o farol do <strong>cliente</strong>, não da tarefa. Verde/amarelo/vermelho.</p><p>Facilita ver cards de clientes em risco sem precisar ler o nome.</p>" },
  card_etiqueta: { t: "Etiquetas do card", b: "<p>Texto livre com cor. Use para agrupar campanhas, sinalizar urgência ou marcar contexto (ex.: \"Cliente vermelho\", \"Campanha julho\", \"Urgente\").</p>" },
  card_prazo: { t: "Prazo interno", b: "<p>Quando o <strong>time</strong> precisa terminar. Diferente de <em>data de publicação</em>, que é quando o conteúdo vai ao ar. Confundir os dois é erro clássico.</p>" },
  modal_foco: { t: "Foco", b: "<p>Cronômetro por tarefa. Só um Foco ativo por Envoxer por vez — o banco impede duas sessões simultâneas.</p><p>Registre para entregarmos melhor e cobrarmos o preço justo.</p>" },
  modal_aprovacao_int: { t: "Aprovação interna", b: "<p>Etapa 1 de aprovação: <strong>gestor</strong> confere antes de o cliente ver. Aprovado, vai para o cliente. Pedir ajuste devolve para Produção.</p>" },
  modal_aprovacao_cli: { t: "Aprovação do cliente", b: "<p>Etapa 2 de aprovação: <strong>cliente</strong> aprova ou pede alteração. Cada alteração é registrada com descrição, número sequencial e conta contra o limite do contrato.</p>" },
  modal_alteracoes: { t: "Alterações", b: "<p>Pedidos de ajuste do cliente, numerados. Comparado ao <em>limite de alterações</em> do escopo. Passar do limite gera alerta e alimenta o sinal 3 do farol.</p>" },
  modal_comentarios: { t: "Comentários internos", b: "<p>Mural da tarefa. Não é visto pelo cliente. Use para alinhar com o time.</p>" },
  modal_anexos: { t: "Anexos", b: "<p>Referências, briefings, arquivos-fonte. Diferente do criativo (que é a peça pronta), anexos são apoio.</p>" },
  modal_etapas: { t: "Etapas do processo", b: "<p>Checklist puxado automaticamente do processo cadastrado no Serviço da tarefa — cada etapa já nasce com o responsável padrão definido lá. Só o responsável da etapa (ou gestor/admin) marca como concluída.</p><p>Uma etapa pode ter uma automação: liberar a próxima, mover a tarefa de coluna, marcar a tarefa como Finalizado, ou avisar o próximo responsável.</p>" },

  // --- Cancelamentos
  churn_total: { t: "Total no histórico", b: "<p>Últimos 24 meses de cancelamentos registrados. Base de dados para o ICP builder.</p>" },
  churn_cedo: { t: "Saíram cedo (<6m)", b: "<p>Cancelamentos com menos de 6 meses de casa. Estes vão para o grupo B (anti-ICP) do ICP builder.</p>" },
  churn_media: { t: "Tempo médio de casa", b: "<p>Média de meses até o cancelamento. Se esse número subir, a montanha-russa acabou.</p>" },
  churn_top: { t: "Motivo top", b: "<p>Motivo mais frequente no histórico. Sinaliza padrão sistemático — se for \"preço\", revisar ICP de ticket. Se for \"atraso\", operação.</p>" },
  churn_motivo: { t: "Motivo do cancelamento", b: "<p>12 opções catalogadas em 6 categorias: Preço, Entrega, Encaixe, Externa, Ativa (trocou de agência), Sem resposta.</p><p>Escolha o mais próximo — este campo alimenta a análise de padrão em F5.</p>" },
  churn_snapshot: { t: "Snapshot congelado", b: "<p>No cancelamento, o sistema congela: segmento, ticket, canal, maturidade, perfil comportamental, margem média, pulso médio, farol final, meses de casa.</p><p>Editar o cliente depois não altera o snapshot — é o único jeito de o ICP builder ser honesto.</p>" },
};

function HlpPopover({ btnRect, h, arrowLeftHint }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [arrowSide, setArrowSide] = useState("top");

  useEffect(() => {
    if (!popRef.current) return;
    const popW = 320;
    const gap = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = btnRect.left + btnRect.width / 2 - 24;
    if (left + popW > vw - 12) left = vw - popW - 12;
    if (left < 12) left = 12;
    let top = btnRect.bottom + gap;
    const ph = popRef.current.getBoundingClientRect().height;
    let arrow = "top";
    if (top + ph > vh - 12) {
      top = btnRect.top - ph - gap;
      arrow = "bottom";
    }
    const arrowLeft = Math.max(8, Math.min(popW - 18, btnRect.left + btnRect.width / 2 - left - 5));
    setPos({ left, top, arrowLeft });
    setArrowSide(arrow);
  }, [btnRect]);

  return (
    <div
      className={"hlp-pop" + (pos ? " open" : "")}
      ref={popRef}
      style={pos ? { left: pos.left, top: pos.top, maxWidth: 320 } : { left: -9999, top: -9999, maxWidth: 320 }}
      onClick={(e) => e.stopPropagation()}
    >
      <h4>{h.t}</h4>
      <div dangerouslySetInnerHTML={{ __html: h.b }} />
      <div className={"hlp-pop-arrow " + arrowSide} style={pos ? { left: pos.arrowLeft } : undefined}></div>
    </div>
  );
}

function HelpIcon({ helpKey, onDark }) {
  const [aberto, setAberto] = useState(false);
  const [btnRect, setBtnRect] = useState(null);
  const btnRef = useRef(null);
  const h = HELP_TEXTS[helpKey];

  const toggle = (e) => {
    e.stopPropagation();
    if (aberto) { setAberto(false); return; }
    setBtnRect(btnRef.current.getBoundingClientRect());
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    const onKey = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("click", fechar);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  if (!h) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={"hlp" + (onDark ? " on-dark" : "") + (aberto ? " active" : "")}
        aria-label="Ajuda"
        onClick={toggle}
      >
        ?
      </button>
      {aberto && btnRect && ReactDOM.createPortal(
        <HlpPopover btnRect={btnRect} h={h} />,
        document.body
      )}
    </>
  );
}

window.EnvoxersShared = {
  formatMoney, parseMoneyInput, MoneyInput, ToastProvider, useToast, Sidebar, PageHeader, Topbar, FeedbackSistemaDock, FeedbackAdminAlerts, HelpIcon, initials, Avatar,
  IconEditar, IconAutomacao, IconExcluir, IconArrastar, ComoFazerModal, corPrazoEtapa, AvatarCropModal,
};
