const { useState: useStateAuth, useEffect: useEffectAuth, useRef: useRefAuth } = React;

function LoginScreen({ onLoggedIn }) {
  const [modo, setModo] = useStateAuth("normal");
  const [email, setEmail] = useStateAuth("");
  const [senha, setSenha] = useStateAuth("");
  const [minutos, setMinutos] = useStateAuth(120);
  const [erro, setErro] = useStateAuth("");
  const [loading, setLoading] = useStateAuth(false);
  const [qr, setQr] = useStateAuth(null);
  const [desktopConvite, setDesktopConvite] = useStateAuth(null);
  const [desktopLink, setDesktopLink] = useStateAuth("");
  const [desktopErro, setDesktopErro] = useStateAuth("");
  const [desktopBaixando, setDesktopBaixando] = useStateAuth(false);\n  const [desktopDetectando, setDesktopDetectando] = useStateAuth(false);\n  const [desktopAberto, setDesktopAberto] = useStateAuth(false);
  const qrRef = useRefAuth(null);
  const link = qr ? (window.location.origin + "/?pair=" + encodeURIComponent(qr.id)) : "";

  function prepararInstaladorDesktop() {
    setDesktopConvite(true);
    setDesktopDetectando(false);
    setDesktopErro("");
    setDesktopLink("");
    fetch("/desktop-updates/latest.json", {cache:"no-store"})
      .then(r => { if (!r.ok) throw new Error("Atualização indisponível"); return r.json(); })
      .then(meta => {
        const raw = meta?.platforms?.["windows-x86_64"]?.url;
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/desktop-updates/") || !url.pathname.endsWith(".exe")) {
          throw new Error("Endereço do instalador não validado");
        }
        setDesktopLink(url.href);
      })
      .catch(() => setDesktopErro("Não foi possível consultar o instalador oficial agora. Você pode continuar pelo navegador."));
  }

  function detectarDesktopOuInstalar() {
    setDesktopDetectando(true);
    let finalizado = false;
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
    const marcouAbertura = () => {
      if (finalizado) return;
      finalizado = true;
      cleanup();
      setDesktopDetectando(false);
      setDesktopAberto(true);
    };
    const onVisibility = () => { if (document.hidden) marcouAbertura(); };
    const onBlur = () => marcouAbertura();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur, {once:true});
    window.location.href = "envoxers://open?source=login&check_update=1";
    window.setTimeout(() => {
      if (finalizado) return;
      finalizado = true;
      cleanup();
      prepararInstaladorDesktop();
    }, 2400);
  }

  function entrar(dados, mostrarDesktop = false) {
    EnvoxersAPI.setSession(dados.access_token, dados.nome, dados.permissao, dados.id, dados.foto_url, dados.modo || "rapido");
    if (mostrarDesktop && !window.envoxersDesktop?.active && /Windows/i.test(navigator.userAgent)) {
      detectarDesktopOuInstalar();
      return;
    }
    onLoggedIn();
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setErro(""); setLoading(true);
    try {
      const desktop = !!window.envoxersDesktop?.active && modo === "normal";
      const path = modo === "normal" && !desktop ? "/auth/login" : "/acesso-rapido/login";
      const dados = await EnvoxersAPI.api(path, {
        method: "POST",
        body: JSON.stringify(modo === "normal" && !desktop ? { email, senha } : { email, senha, modo: desktop ? "desktop" : modo, minutos })
      });
      if (modo === "normal" && !desktop) dados.modo = "normal";
      entrar(dados, modo === "normal");
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
    let ativo = true;
    const renderQR = () => {
      if (!ativo || !qrRef.current || !window.QRCode) return;
      qrRef.current.textContent = "";
      new window.QRCode(qrRef.current, {
        text: link, width: 176, height: 176, colorDark: "#171c34", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    };
    if (window.QRCode) {
      renderQR();
    } else {
      const script = document.createElement("script");
      script.src = "/vendor/qrcode-1.0.0.min.js";
      script.onload = renderQR;
      script.onerror = () => {}; // Código textual permanece disponível se o QR não carregar.
      document.body.appendChild(script);
    }
    return () => { ativo = false; };
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
    ["normal", window.envoxersDesktop?.active ? "Envoxers Desktop" : "Meu computador", window.envoxersDesktop?.active ? "Windows, alertas nativos e sessão persistente" : "App instalado, notificações e sessão habitual"],
    ["web", "Entrar pelo navegador", "Acesso completo sem instalar"],
    ["rapido", "Acesso rápido", "Máquina emprestada ou compartilhada"]
  ];

  if (desktopDetectando) {
    return <div className="login-screen">
      <div className="login-box login-box-access" style={{maxWidth:430,textAlign:"center"}}>
        <div className="brand" style={{justifyContent:"center",paddingBottom:12}}><span className="brand-mark">envox<span className="brand-dot"></span></span></div>
        <h2 style={{margin:"8px 0 10px"}}>Procurando o Envoxers Desktop…</h2>
        <p style={{lineHeight:1.6}}>Se o Windows perguntar se deseja abrir o aplicativo, confirme. Caso ele não esteja instalado, mostraremos o instalador oficial automaticamente.</p>
        <button className="btn" type="button" onClick={prepararInstaladorDesktop}
          style={{width:"100%",justifyContent:"center",marginTop:14}}>Baixar o aplicativo</button>
      </div>
    </div>;
  }

  if (desktopAberto) {
    return <div className="login-screen">
      <div className="login-box login-box-access" style={{maxWidth:430,textAlign:"center"}}>
        <div className="brand" style={{justifyContent:"center",paddingBottom:12}}><span className="brand-mark">envox<span className="brand-dot"></span></span></div>
        <h2 style={{margin:"8px 0 10px"}}>Envoxers Desktop aberto</h2>
        <p style={{lineHeight:1.6}}>Detectamos a abertura do aplicativo. Ele próprio verifica se existe uma atualização e oferece a versão mais recente quando necessário.</p>
        <button className="btn" type="button" onClick={onLoggedIn}
          style={{width:"100%",justifyContent:"center",marginTop:14}}>Continuar também no navegador</button>
      </div>
    </div>;
  }

  if (desktopConvite) {
    return <div className="login-screen">
      <div className="login-box login-box-access" role="dialog" aria-modal="true" aria-labelledby="desktop-onboarding-title" style={{maxWidth:460}}>
        <div className="brand" style={{justifyContent:"center",paddingBottom:12}}><span className="brand-mark">envox<span className="brand-dot"></span></span></div>
        <h2 id="desktop-onboarding-title" style={{textAlign:"center",margin:"8px 0 12px"}}>Envoxers no seu computador</h2>
        <p style={{textAlign:"center",lineHeight:1.6}}>Seu login foi realizado. Para receber notificações do Windows e atualizações do aplicativo, use o Envoxers Desktop.</p>
        <div className="access-safety" style={{margin:"16px 0"}}>
          <strong>Já tem o aplicativo?</strong>
          <span>Abra o Envoxers pelo menu Iniciar do Windows. Ele verifica atualizações automaticamente.</span>
        </div>
        <p style={{fontSize:13,lineHeight:1.6}}>Se ainda não instalou, baixe o instalador oficial. O Windows pedirá sua confirmação para executar a instalação.</p>
        {desktopErro && <div className="login-error" role="status">{desktopErro}</div>}
        <a className="btn btn-envox" href={desktopLink || undefined}
          download={desktopLink ? undefined : ""}
          onClick={e => { if (!desktopLink) e.preventDefault(); else setDesktopBaixando(true); }}
          style={{display:"flex",justifyContent:"center",width:"100%",marginTop:16,opacity:desktopLink?1:0.6,pointerEvents:desktopLink?"auto":"none"}}>
          {desktopBaixando ? "Instalador solicitado. Abra o arquivo baixado" : desktopLink ? "Baixar Envoxers para Windows" : "Preparando instalador…"}
        </a>
        <button className="btn" type="button" onClick={onLoggedIn}
          style={{width:"100%",justifyContent:"center",marginTop:10}}>Continuar pelo navegador</button>
        <p style={{fontSize:11,textAlign:"center",opacity:.75,marginTop:14}}>Por segurança, o navegador não consegue confirmar se o aplicativo está instalado nem executar o instalador sozinho.</p>
      </div>
    </div>;
  }

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
