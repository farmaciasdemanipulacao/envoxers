const { useState: usePortal } = React;

function PortalDefinirSenhaScreen({ token, onDefinida }) {
  const toast = EnvoxersShared.useToast();
  const [senha, setSenha] = usePortal("");
  const [confirmacao, setConfirmacao] = usePortal("");
  const [loading, setLoading] = usePortal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (senha.length < 8) { toast("A senha precisa ter pelo menos 8 caracteres", "error"); return; }
    if (senha !== confirmacao) { toast("As senhas não coincidem", "error"); return; }
    setLoading(true);
    try {
      await PortalAPI.api("/portal/auth/definir-senha", { method: "POST", body: JSON.stringify({ token, senha }) });
      toast("Senha definida! Faça login.", "success");
      onDefinida();
    } catch (err) {
      toast(err.message || "Falha ao definir senha", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-login">
      <section className="portal-login-brand" aria-label="Portal do Cliente Envox">
        <div className="portal-login-mark"><i aria-hidden="true"></i> Envox <span>Portal</span></div>
        <div className="portal-login-copy"><h1>Seu acesso começa aqui.</h1><p>Crie uma senha para acompanhar solicitações, aprovações e entregas.</p></div>
        <div className="portal-login-footer">ENVOX · PORTAL DO CLIENTE</div>
      </section>
      <section className="portal-login-panel">
        <div className="portal-login-box">
          <div className="portal-login-kicker">PRIMEIRO ACESSO</div>
          <h2>Defina sua senha</h2>
          <p className="portal-login-sub">Use pelo menos oito caracteres.</p>
          <form onSubmit={handleSubmit}>
            <label className="portal-login-field"><span>Nova senha</span><input type="password" autoComplete="new-password" minLength={8} value={senha} onChange={e=>setSenha(e.target.value)} required autoFocus /></label>
            <label className="portal-login-field"><span>Confirmar senha</span><input type="password" autoComplete="new-password" minLength={8} value={confirmacao} onChange={e=>setConfirmacao(e.target.value)} required /></label>
            <button className="portal-login-submit" type="submit" disabled={loading}>{loading ? "Salvando…" : "Definir senha →"}</button>
          </form>
        </div>
      </section>
    </div>

  );
}

function PortalLoginScreen({ onLoggedIn }) {
  const toast = EnvoxersShared.useToast();
  const [email, setEmail] = usePortal("");
  const [senha, setSenha] = usePortal("");
  const [loading, setLoading] = usePortal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await PortalAPI.api("/portal/auth/login", { method: "POST", body: JSON.stringify({ email, senha }) });
      PortalAPI.setSession(data.access_token, data.id, data.nome, data.cliente_id, data.cliente_nome);
      onLoggedIn();
    } catch (err) {
      toast(err.message || "Falha no login", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-login">
      <section className="portal-login-brand" aria-label="Portal do Cliente Envox">
        <div className="portal-login-mark"><i aria-hidden="true"></i> Envox <span>Portal</span></div>
        <div className="portal-login-copy">
          <h1>Comunicação em um único fluxo.</h1>
          <p>Solicite, acompanhe e aprove materiais com contexto, histórico e decisões centralizados.</p>
        </div>
        <div className="portal-login-footer">ENVOX · PORTAL DO CLIENTE</div>
      </section>
      <section className="portal-login-panel">
        <div className="portal-login-box">
          <div className="portal-login-kicker">PORTAL DO CLIENTE</div>
          <h2>Acesse sua conta</h2>
          <p className="portal-login-sub">Seu espaço para acompanhar o trabalho da Envox.</p>
          <form onSubmit={handleSubmit}>
            <label className="portal-login-field"><span>E-mail</span>
              <input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@suaempresa.com.br" required autoFocus />
            </label>
            <label className="portal-login-field"><span>Senha</span>
              <input type="password" autoComplete="current-password" value={senha} onChange={e=>setSenha(e.target.value)} required />
            </label>
            <button className="portal-login-submit" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar no portal →"}</button>
          </form>
          <p className="portal-login-help">Acesso exclusivo aos contatos autorizados. Solicite seu acesso à equipe Envox.</p>
        </div>
      </section>
    </div>

  );
}

const STATUS_DOC_PORTAL_LABELS = { aguardando_confirmacoes: "Aguardando confirmações", vigente: "Vigente", cancelado: "Cancelado" };
const STATUS_DOC_PORTAL_CORES = { aguardando_confirmacoes: "var(--farol-amarelo)", vigente: "var(--farol-verde)", cancelado: "var(--ink-4)" };

function PortalShell() {
  const toast = EnvoxersShared.useToast();
  const nome = localStorage.getItem("portal_nome") || "";
  const clienteNome = localStorage.getItem("portal_cliente_nome") || "";
  const meuContatoId = Number(localStorage.getItem("portal_contato_id"));
  const [documentos, setDocumentos] = usePortal([]);
  const [loading, setLoading] = usePortal(true);
  const [confirmandoId, setConfirmandoId] = usePortal(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await PortalAPI.api("/portal/documentos");
      setDocumentos(data);
    } catch (err) {
      toast(err.message || "Erro ao carregar documentos", "error");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { carregar(); }, []);

  const handleConfirmar = async (doc) => {
    setConfirmandoId(doc.id);
    try {
      await PortalAPI.api(`/portal/documentos/${doc.id}/confirmar`, { method: "POST" });
      toast("Confirmado! Obrigado.", "success");
      await carregar();
    } catch (err) {
      toast(err.message || "Erro ao confirmar", "error");
    } finally {
      setConfirmandoId(null);
    }
  };

  const handleLogout = () => {
    PortalAPI.clearSession();
    window.location.reload();
  };

  const pendentes = documentos.filter((d) => d.status === "aguardando_confirmacoes" && d.confirmacoes.some((c) => c.cliente_contato_id === meuContatoId && !c.confirmado_em));

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
            Portal do Cliente · {clienteNome}
          </div>
          <h1>Olá, {nome.split(" ")[0]}</h1>
          <div className="page-sub">Documentos de acordo pra confirmar e histórico de alterações de escopo.</div>
        </div>
        <button className="btn btn-sm" onClick={handleLogout}>Sair</button>
      </div>

      {loading && <div className="empty">Carregando…</div>}

      {!loading && pendentes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Aguardando sua confirmação</div>
          {pendentes.map((doc) => (
            <div key={doc.id} style={{ padding: "12px 14px", background: "var(--bg-inset)", borderRadius: "var(--r-md)", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{doc.motivo}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>
                {doc.itens_alterados.map((i) => `${i.tipo}${i.descricao ? ` (${i.descricao})` : ""}: ${i.quantidade_anterior} → ${i.quantidade_nova}`).join(" · ")}
              </div>
              <button className="btn btn-envox btn-sm" onClick={() => handleConfirmar(doc)} disabled={confirmandoId === doc.id}>
                {confirmandoId === doc.id ? "Confirmando…" : "Confirmar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Todos os documentos</div>
          {documentos.length === 0 && (
            <div style={{ padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)", fontSize: 13, color: "var(--ink-3)" }}>
              Nenhum documento de acordo ainda.
            </div>
          )}
          {documentos.map((doc) => (
            <div key={doc.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div>{doc.motivo}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{doc.itens_alterados.map((i) => `${i.tipo}: ${i.quantidade_anterior}→${i.quantidade_nova}`).join(", ")}</div>
              </div>
              <span className="pill" style={{ color: STATUS_DOC_PORTAL_CORES[doc.status] }}>{STATUS_DOC_PORTAL_LABELS[doc.status] || doc.status}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PortalRoot() {
  const params = new URLSearchParams(window.location.search);
  const tokenDefinicao = params.get("token");
  const [definiuSenha, setDefiniuSenha] = usePortal(false);
  const [logged, setLogged] = usePortal(!!PortalAPI.getToken());

  if (tokenDefinicao && !definiuSenha) {
    return (
      <EnvoxersShared.ToastProvider>
        <PortalDefinirSenhaScreen token={tokenDefinicao} onDefinida={() => { window.history.replaceState({}, "", window.location.pathname); setDefiniuSenha(true); }} />
      </EnvoxersShared.ToastProvider>
    );
  }

  if (!logged) {
    return (
      <EnvoxersShared.ToastProvider>
        <PortalLoginScreen onLoggedIn={() => setLogged(true)} />
      </EnvoxersShared.ToastProvider>
    );
  }

  return (
    <EnvoxersShared.ToastProvider>
      <PortalOperacao.Shell />
    </EnvoxersShared.ToastProvider>
  );
}

const portalRoot = ReactDOM.createRoot(document.getElementById("root"));
portalRoot.render(<PortalRoot />);
