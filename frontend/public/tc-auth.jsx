const { useState: useStateAuth } = React;

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useStateAuth("");
  const [senha, setSenha] = useStateAuth("");
  const [erro, setErro] = useStateAuth("");
  const [loading, setLoading] = useStateAuth(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });
      EnvoxersAPI.setSession(data.access_token, data.nome, data.permissao);
      onLoggedIn();
    } catch (err) {
      setErro(err.message || "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="brand" style={{ paddingBottom: 20, justifyContent: "center" }}>
          <span className="brand-mark">envox<span className="brand-dot"></span></span>
          <span className="brand-sub">Cockpit</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@envox.com.br" required autoFocus />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Senha</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" required />
          </div>
          {erro && <div className="login-error">{erro}</div>}
          <button className="btn btn-envox" type="submit" disabled={loading} style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
