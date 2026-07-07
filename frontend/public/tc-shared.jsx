const { useState, useEffect, useCallback, createContext, useContext } = React;

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

// ==================== SIDEBAR ====================
function Sidebar({ view, onNavigate, nome, permissao }) {
  const iniciais = (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const item = (key, label, icon) => (
    <a className={view === key ? "active" : ""} onClick={() => onNavigate(key)} style={{ cursor: "pointer" }}>
      {icon}
      {label}
    </a>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">envox<span className="brand-dot"></span></span>
        <span className="brand-sub">Cockpit</span>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Cadastros</div>
        <nav className="nav">
          {item(
            "clientes",
            "Clientes",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2.5" /><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" /></svg>
          )}
          {item(
            "envoxers",
            "Envoxers",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2" /><circle cx="11" cy="7" r="1.5" /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M10 13c0-1.7 1.3-3 3-3" /></svg>
          )}
          {item(
            "servicos",
            "Serviços",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
          )}
        </nav>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">F1 · Operação</div>
        <nav className="nav">
          {item(
            "kanban",
            "Kanban",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="3.5" height="12" rx="0.5" /><rect x="6.3" y="2" width="3.5" height="8" rx="0.5" /><rect x="10.6" y="2" width="3.5" height="10" rx="0.5" /></svg>
          )}
          {item(
            "dashboard",
            "Dashboard do dia",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 7h12M7 2v12" /></svg>
          )}
        </nav>
      </div>

      <div className="nav-section" style={{ marginTop: "auto" }}>
        <div className="nav-section-title">F2 · Farol</div>
        <nav className="nav">
          {item(
            "solicitacoes",
            "Solicitações",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2.5" y="2" width="11" height="12" rx="1" /><path d="M5 6h6M5 9h6M5 12h3" /></svg>
          )}
          {item(
            "farol",
            "Farol",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.2" /></svg>
          )}
          {item(
            "alertas",
            "Alertas",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l6.5 11H1.5z" /><path d="M8 6.5v3.2" /><circle cx="8" cy="11.8" r="0.4" fill="currentColor" /></svg>
          )}
        </nav>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">F3 · ICP</div>
        <nav className="nav">
          {item(
            "icp",
            "ICP Builder",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="5" r="2.2" /><circle cx="11" cy="5" r="2.2" /><path d="M2.8 13c0-2 1-3.5 2.2-3.5S7.2 11 7.2 13" /><path d="M8.8 13c0-2 1-3.5 2.2-3.5s2.2 1.5 2.2 3.5" /></svg>
          )}
          {item(
            "faturamento",
            "Painel de faturamento",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13l4-6 3 3 5-7" /><path d="M9 3h5v5" /></svg>
          )}
        </nav>
      </div>

      <div className="sidebar-user">
        <div className="avatar">{iniciais}</div>
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

// ==================== TOPBAR ====================
function Topbar({ crumb, onLogout }) {
  return (
    <div className="topbar">
      <div className="topbar-crumb">{crumb}</div>
      <div className="topbar-actions">
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sair</button>
      </div>
    </div>
  );
}

window.EnvoxersShared = { formatMoney, parseMoneyInput, MoneyInput, ToastProvider, useToast, Sidebar, PageHeader, Topbar };
