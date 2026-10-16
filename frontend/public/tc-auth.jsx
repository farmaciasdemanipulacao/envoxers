const { useState: useStateAuth, useEffect: useEffectAuth, useRef: useRefAuth } = React;

function LoginScreen({ onLoggedIn }) {
  const [modo, setModo] = useStateAuth("normal");
  const [email, setEmail] = useStateAuth("");
  const [senha, setSenha] = useStateAuth("");
  const [minutos, setMinutos] = useStateAuth(120);
  const [erro, setErro] = useStateAuth("");
  const [loading, setLoading] = useStateAuth(false);
  const [qr, setQr] = useStateAuth(null);
  const qrRef = useRefAuth(null);
  const link = qr ? (window.location.origin + "/?pair=" + encodeURIComponent(qr.id)) : "";

  function entrar(dados) {
    EnvoxersAPI.setSession(dados.access_token, dados.nome, dados.permissao, dados.id, dados.foto_url, dados.modo || "rapido");
    onLoggedIn();
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setErro(""); setLoading(true);
    try {
      const path = modo === "normal" ? "/auth/login" : "/acesso-rapido/login";
      const dados = await EnvoxersAPI.api(path, {
        method: "POST",
        body: JSON.stringify(modo === "normal" ? { email, senha } : { email, senha, modo, minutos })
      });
      if (modo === "normal") dados.modo = "normal";
      entrar(dados);
    } catch (err) { setErro(err.message || "Falha no acesso"); }
    finally { setLoading(false); }
  };

  const iniciarQR = async () => {
    setErro(""); setLoading(true);
    try {
      const dados = await EnvoxersAPI.api("/acesso-rapido/qr/iniciar", {
        method: "POST", body: JSON.stringify({ minutos })
      });
      setQr(dados);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  };

  useEffectAuth(() => {
    if (!qr || !qrRef.current) return;
    qrRef.current.textContent = "";
    if (window.QRCode) {
      new window.QRCode(qrRef.current, {
        text: link, width: 176, height: 176, colorDark: "#171c34", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    }
  }, [qr && qr.id]);

  useEffectAuth(() => {
    if (!qr) return;
    let ativo = true;
    const timeout = setTimeout(() => { if (ativo) { setQr(null); setErro("QR expirado. Gere um novo."); } }, 121000);
    const intervalo = setInterval(async () => {
      try {
        const data = await EnvoxersAPI.api("/acesso-rapido/qr/" + encodeURIComponent(qr.id) + "/consultar", {
          method: "POST", body: JSON.stringify({ segredo: qr.segredo })
        });
        if (ativo && data.status === "autorizado") {
          clearTimeout(timeout); clearInterval(intervalo);
          entrar(data);
        }
      } catch (err) {
        if (ativo) { clearInterval(intervalo); clearTimeout(timeout); setQr(null); setErro(err.message); }
      }
    }, 2800);
    return () => { ativo = false; clearInterval(intervalo); clearTimeout(timeout); };
  }, [qr && qr.id]);

  const opcoes = [
    ["normal", "Meu computador", "App instalado, notificações e sessão habitual"],
    ["web", "Entrar pelo navegador", "Acesso completo sem instalar"],
    ["rapido", "Acesso rápido", "Máquina emprestada ou compartilhada"]
  ];

  return <div className="login-screen">
    <div className="login-box login-box-access">
      <div className="brand" style={{ paddingBottom: 10, justifyContent: "center" }}>
        <span className="brand-mark">envox<span className="brand-dot"></span></span>
        <span className="brand-sub">Cockpit</span>
      </div>
      <div className="access-headline">Como você quer entrar?</div>
      <div className="access-tabs">
        {opcoes.map(([key, title, subtitle]) => (
          <button type="button" key={key} className={"access-tab" + (modo === key ? " active" : "")}
            onClick={() => { setModo(key); setQr(null); setErro(""); }}>
            <strong>{title}</strong><small>{subtitle}</small>
          </button>
        ))}
      </div>
      {modo === "rapido" && <div className="access-safety">
        <strong>Computador compartilhado</strong>
        <span>Sem instalação nem notificações. Login temporário, encerrado por inatividade e revogável a qualquer momento.</span>
      </div>}
      {modo === "rapido" && <div className="field access-duration">
        <label>Duração máxima da sessão</label>
        <select value={minutos} onChange={e => { setMinutos(Number(e.target.value)); setQr(null); }}>
          <option value={30}>30 minutos</option>
          <option value={120}>2 horas</option>
          <option value={480}>Até 8 horas</option>
        </select>
      </div>}
      {!qr ? <form onSubmit={handleSubmit}>
        <div className="field"><label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@envox.com.br" autoComplete="username" required autoFocus /></div>
        <div className="field" style={{ marginTop: 12 }}><label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Sua senha" autoComplete={modo === "rapido" ? "off" : "current-password"} required /></div>
        {erro && <div className="login-error" role="alert">{erro}</div>}
        <button className="btn btn-envox" type="submit" disabled={loading}
          style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
          {loading ? "Entrando…" : modo === "rapido" ? "Entrar temporariamente" : "Entrar"}
        </button>
      </form> : <>
        <div className="access-qr" ref={qrRef}></div>
        <div className="access-qr-desc">Escaneie com um navegador autenticado ou abra o Envoxers instalado no celular, vá em Meu Perfil e autorize usando o código abaixo.</div>
        <div className="access-pair-code">{qr.codigo}</div>
        <div className="access-qr-desc">O código expira em 2 minutos. Não o compartilhe com terceiros.</div>
        {!window.QRCode && <a href={link} rel="noopener noreferrer">{link}</a>}
        <button type="button" className="btn access-back" onClick={() => setQr(null)}>Voltar ao login</button>
        {erro && <div className="login-error">{erro}</div>}
      </>}
      {modo === "rapido" && !qr && <>
        <div className="access-divider">ou</div>
        <button type="button" className="btn access-qr-button" onClick={iniciarQR} disabled={loading}>
          Entrar com QR Code pelo celular
        </button>
      </>}
      {new URLSearchParams(window.location.search).has("card") &&
        <div className="access-deeplink">Após entrar, abriremos o card compartilhado automaticamente.</div>}
    </div>
  </div>;
}

function PareamentoAprovacao() {
  const pedido = new URLSearchParams(window.location.search).get("pair");
  const [info, setInfo] = useStateAuth(null);
  const [erro, setErro] = useStateAuth("");
  const [loading, setLoading] = useStateAuth(false);
  const [aberto, setAberto] = useStateAuth(!!pedido);
  useEffectAuth(() => {
    if (!pedido) return;
    EnvoxersAPI.api("/acesso-rapido/qr/" + encodeURIComponent(pedido))
      .then(setInfo).catch(e => setErro(e.message));
  }, [pedido]);
  if (!aberto || !pedido) return null;
  const fechar = () => {
    setAberto(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("pair");
    window.history.replaceState(window.history.state, "", url.toString());
  };
  const aprovar = async () => {
    setErro(""); setLoading(true);
    try {
      await EnvoxersAPI.api("/acesso-rapido/qr/" + encodeURIComponent(pedido) + "/autorizar", { method:"POST" });
      fechar();
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };
  return <div className="access-approval-overlay">
    <div className="access-approval-card" role="dialog" aria-modal="true" aria-label="Autorizar acesso rápido">
      <h3>Autorizar acesso em outro computador?</h3>
      <p>Uma nova sessão temporária do Envoxers será aberta no dispositivo abaixo, com as suas permissões.</p>
      <div className="access-safety">{info ? info.navegador : "Verificando dispositivo…"}</div>
      {erro && <div className="login-error">{erro}</div>}
      <div className="access-approval-actions">
        <button type="button" className="btn" onClick={fechar}>Não autorizar</button>
        <button type="button" className="btn btn-envox" disabled={!info || loading || !!erro} onClick={aprovar}>
          {loading ? "Autorizando…" : "Sim, autorizar"}
        </button>
      </div>
    </div>
  </div>;
}
window.LoginScreen = LoginScreen;
window.PareamentoAprovacao = PareamentoAprovacao;
