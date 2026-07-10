const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat } = React;

function fmtHoraChat(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Sem endpoint dedicado pra "quem sou eu" no fluxo de chat — o id já está no JWT (claim "sub"),
// decodifica o payload localmente em vez de bater na API só pra isso.
function meuEnvoxerIdChat() {
  try {
    const token = EnvoxersAPI.getToken();
    const payloadB64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return parseInt(JSON.parse(atob(payloadB64)).sub, 10);
  } catch (err) {
    return null;
  }
}

function agruparCanaisChat(canais) {
  return {
    geral: canais.filter((c) => c.tipo === "geral"),
    clientes: canais.filter((c) => c.tipo === "cliente"),
    dms: canais.filter((c) => c.tipo === "dm"),
  };
}

function ChatCanalItem({ canal, ativo, onClick }) {
  return (
    <div className={"chat-canal-item" + (ativo ? " active" : "")} onClick={onClick}>
      <span className="chat-canal-nome">{canal.nome}</span>
      {canal.nao_lidas > 0 && <span className="chat-canal-badge">{canal.nao_lidas}</span>}
    </div>
  );
}

// wsEvent: último evento {canal_id, mensagem} empurrado pelo WS da raiz (tc-app.jsx) —
// a tela em si não abre conexão própria, pra badge global e badge da tela usarem a mesma fonte.
function ChatScreen({ envoxersList, wsEvent, onLeituraAtualizada }) {
  const toast = EnvoxersShared.useToast();
  const [canais, setCanais] = useStateChat([]);
  const [canalAtivoId, setCanalAtivoId] = useStateChat(null);
  const [mensagens, setMensagens] = useStateChat([]);
  const [texto, setTexto] = useStateChat("");
  const [enviando, setEnviando] = useStateChat(false);
  const [novoDmAberto, setNovoDmAberto] = useStateChat(false);
  const mensagensRef = useRefChat(null);
  const canalAtivoRef = useRefChat(null);
  canalAtivoRef.current = canalAtivoId;

  const carregarCanais = async () => {
    try {
      const data = await EnvoxersAPI.api("/chat/canais");
      setCanais(data);
      if (canalAtivoRef.current === null && data.length > 0) setCanalAtivoId(data[0].id);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectChat(() => { carregarCanais(); }, []);

  useEffectChat(() => {
    if (canalAtivoId === null) return;
    (async () => {
      try {
        const data = await EnvoxersAPI.api(`/chat/canais/${canalAtivoId}/mensagens`);
        setMensagens(data);
        await EnvoxersAPI.api(`/chat/canais/${canalAtivoId}/ler`, { method: "POST" });
        setCanais((prev) => prev.map((c) => (c.id === canalAtivoId ? { ...c, nao_lidas: 0 } : c)));
        if (onLeituraAtualizada) onLeituraAtualizada();
      } catch (err) {
        toast(err.message, "error");
      }
    })();
  }, [canalAtivoId]);

  useEffectChat(() => {
    if (!wsEvent) return;
    const { canal_id, mensagem } = wsEvent;
    if (canal_id === canalAtivoRef.current) {
      setMensagens((prev) => [...prev, mensagem]);
      EnvoxersAPI.api(`/chat/canais/${canal_id}/ler`, { method: "POST" })
        .then(() => { if (onLeituraAtualizada) onLeituraAtualizada(); })
        .catch(() => {});
    } else {
      setCanais((prev) => prev.map((c) => (c.id === canal_id ? { ...c, nao_lidas: (c.nao_lidas || 0) + 1 } : c)));
    }
  }, [wsEvent]);

  useEffectChat(() => {
    if (mensagensRef.current) mensagensRef.current.scrollTop = mensagensRef.current.scrollHeight;
  }, [mensagens]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !canalAtivoId || enviando) return;
    setEnviando(true);
    try {
      await EnvoxersAPI.api(`/chat/canais/${canalAtivoId}/mensagens`, {
        method: "POST",
        body: JSON.stringify({ texto: t }),
      });
      setTexto("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDownChat = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const abrirDm = async (outroEnvoxerId) => {
    try {
      const canal = await EnvoxersAPI.api(`/chat/dm/${outroEnvoxerId}`, { method: "POST" });
      setNovoDmAberto(false);
      await carregarCanais();
      setCanalAtivoId(canal.id);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const grupos = agruparCanaisChat(canais);
  const canalAtivo = canais.find((c) => c.id === canalAtivoId) || null;
  const meuId = meuEnvoxerIdChat();
  const dmDisponiveis = (envoxersList || []).filter(
    (e) => e.id !== meuId && !grupos.dms.some((d) => d.outro_envoxer_id === e.id)
  );

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-section-title">Geral</div>
        {grupos.geral.map((c) => (
          <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
        ))}

        <div className="chat-sidebar-section-title">Clientes</div>
        {grupos.clientes.map((c) => (
          <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
        ))}

        <div className="chat-sidebar-section-title">Diretas</div>
        {grupos.dms.map((c) => (
          <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
        ))}
        <div className="chat-canal-item" onClick={() => setNovoDmAberto(true)} style={{ color: "var(--ink-3)" }}>
          <span className="chat-canal-nome">+ Nova conversa</span>
        </div>
      </aside>

      <section className="chat-main">
        <div className="chat-header">{canalAtivo ? canalAtivo.nome : "Selecione um canal"}</div>
        <div className="chat-messages" ref={mensagensRef}>
          {mensagens.map((m) => (
            <div className="chat-msg" key={m.id}>
              <div className="avatar sm">{EnvoxersShared.initials(m.autor_nome)}</div>
              <div className="chat-msg-body">
                <div className="chat-msg-meta">
                  <span className="chat-msg-autor">{m.autor_nome}</span>
                  <span className="chat-msg-hora">{fmtHoraChat(m.created_at)}</span>
                </div>
                {m.texto && <div className="chat-msg-texto">{m.texto}</div>}
              </div>
            </div>
          ))}
          {mensagens.length === 0 && <div className="empty">Nenhuma mensagem ainda. Diga oi!</div>}
        </div>
        {canalAtivoId && (
          <div className="chat-input-bar">
            <textarea
              rows={1}
              placeholder="Escreva uma mensagem…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={onKeyDownChat}
            />
            <button className="btn btn-primary" disabled={enviando || !texto.trim()} onClick={enviar}>Enviar</button>
          </div>
        )}
      </section>

      {novoDmAberto && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setNovoDmAberto(false); }}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ fontSize: 20 }}>Nova conversa</h2>
              <button className="modal-close" onClick={() => setNovoDmAberto(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div style={{ padding: "8px 0 20px" }}>
              {dmDisponiveis.map((e) => (
                <div key={e.id} className="chat-canal-item" onClick={() => abrirDm(e.id)}>
                  <span className="chat-canal-nome">{e.nome}</span>
                </div>
              ))}
              {dmDisponiveis.length === 0 && <div className="empty">Todo mundo já tem conversa aberta com você.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
