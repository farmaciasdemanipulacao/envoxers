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

// O canal "geral" some da UI como "Geral" (redundante com o título da seção) — vira "Todos".
function nomeCanalExibicao(canal) {
  return canal.tipo === "geral" ? "Todos" : canal.nome;
}

function agruparCanaisChat(canais) {
  return {
    geral: canais.filter((c) => c.tipo === "geral"),
    clientes: canais.filter((c) => c.tipo === "cliente"),
    dms: canais.filter((c) => c.tipo === "dm"),
  };
}

function lerAcordeaoSalvo(chave, padrao) {
  const v = localStorage.getItem(chave);
  return v === null ? padrao : v === "1";
}

function ChatCanalItem({ canal, ativo, onClick }) {
  return (
    <div className={"chat-canal-item" + (ativo ? " active" : "")} onClick={onClick}>
      <span className="chat-canal-nome">{nomeCanalExibicao(canal)}</span>
      {canal.nao_lidas > 0 && <span className="chat-canal-badge">{canal.nao_lidas}</span>}
    </div>
  );
}

// Acordeão simples — abre/fecha com transição via CSS grid-template-rows (sem medir altura em JS).
function ChatAccordionSection({ titulo, aberto, onToggle, children }) {
  return (
    <div className="chat-accordion">
      <button type="button" className="chat-accordion-header" onClick={onToggle}>
        <svg className={"chat-accordion-chevron" + (aberto ? "" : " closed")} width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6l4 4 4-4" />
        </svg>
        <span>{titulo}</span>
      </button>
      <div className={"chat-accordion-body" + (aberto ? "" : " closed")}>
        <div>{children}</div>
      </div>
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
  const [diretasAberto, setDiretasAberto] = useStateChat(() => lerAcordeaoSalvo("envoxers_chat_acc_diretas", true));
  const [clientesAberto, setClientesAberto] = useStateChat(() => lerAcordeaoSalvo("envoxers_chat_acc_clientes", false));
  const mensagensRef = useRefChat(null);
  const canalAtivoRef = useRefChat(null);
  canalAtivoRef.current = canalAtivoId;
  const canaisRef = useRefChat([]);
  canaisRef.current = canais;

  const toggleDiretas = () => setDiretasAberto((prev) => {
    const next = !prev;
    localStorage.setItem("envoxers_chat_acc_diretas", next ? "1" : "0");
    return next;
  });
  const toggleClientes = () => setClientesAberto((prev) => {
    const next = !prev;
    localStorage.setItem("envoxers_chat_acc_clientes", next ? "1" : "0");
    return next;
  });

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
    } else if (canaisRef.current.some((c) => c.id === canal_id)) {
      setCanais((prev) => prev.map((c) => (c.id === canal_id ? { ...c, nao_lidas: (c.nao_lidas || 0) + 1 } : c)));
    } else {
      // Conversa nova pra mim (ex.: alguém abriu uma DM comigo pela 1ª vez) — ainda não
      // existe na minha lista local, então recarrega do servidor pra ela aparecer sozinha,
      // sem precisar eu clicar em "+ Nova conversa" e procurar a pessoa manualmente.
      carregarCanais();
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
        {grupos.geral.map((c) => (
          <div
            key={c.id}
            className={"chat-canal-todos" + (c.id === canalAtivoId ? " active" : "")}
            onClick={() => setCanalAtivoId(c.id)}
          >
            <span className="chat-canal-nome">Todos</span>
            {c.nao_lidas > 0 && <span className="chat-canal-badge">{c.nao_lidas}</span>}
          </div>
        ))}

        <ChatAccordionSection titulo="Diretas" aberto={diretasAberto} onToggle={toggleDiretas}>
          {grupos.dms.map((c) => (
            <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
          ))}
          <div className="chat-canal-item chat-canal-nova" onClick={() => setNovoDmAberto(true)}>
            <span className="chat-canal-nome">+ Nova conversa</span>
          </div>
        </ChatAccordionSection>

        <ChatAccordionSection titulo="Clientes" aberto={clientesAberto} onToggle={toggleClientes}>
          {grupos.clientes.map((c) => (
            <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
          ))}
        </ChatAccordionSection>
      </aside>

      <section className="chat-main">
        <div className="chat-header">{canalAtivo ? nomeCanalExibicao(canalAtivo) : "Selecione um canal"}</div>
        <div className="chat-messages" ref={mensagensRef}>
          {mensagens.map((m) => {
            const propria = m.autor_envoxer_id === meuId;
            return (
              <div className={"chat-msg" + (propria ? " own" : "")} key={m.id}>
                {!propria && <div className="avatar sm">{EnvoxersShared.initials(m.autor_nome)}</div>}
                <div className="chat-msg-body">
                  <div className="chat-msg-meta">
                    {!propria && <span className="chat-msg-autor">{m.autor_nome}</span>}
                    <span className="chat-msg-hora">{fmtHoraChat(m.created_at)}</span>
                  </div>
                  {m.texto && <div className="chat-msg-texto">{m.texto}</div>}
                </div>
              </div>
            );
          })}
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
