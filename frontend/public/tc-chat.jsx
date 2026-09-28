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

function ChatCanalItem({ canal, ativo, fotoUrl, onClick }) {
  return (
    <div className={"chat-canal-item" + (ativo ? " active" : "")} onClick={onClick}>
      {canal.tipo === "dm" && <EnvoxersShared.Avatar nome={canal.nome} fotoUrl={fotoUrl} size="sm" envoxerId={canal.outro_envoxer_id} />}
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
const CHAT_EMOJIS = [
  "😀","😃","😄","😁","😂","🤣","😊","😍","🥰","😘","😎","🤩",
  "🤔","🙌","👏","👍","👎","👌","🙏","💪","🔥","✨","🎉","❤️",
  "💙","💚","💛","🚀","✅","⚠️","📌","👀","💡","🤝","☕","🍻",
];

function ChatScreen({ envoxersList, wsEvent, newConversationSignal = 0, onLeituraAtualizada }) {
  const toast = EnvoxersShared.useToast();
  const [canais, setCanais] = useStateChat([]);
  const [canalAtivoId, setCanalAtivoId] = useStateChat(null);
  const [mensagens, setMensagens] = useStateChat([]);
  const [texto, setTexto] = useStateChat("");
  const [enviando, setEnviando] = useStateChat(false);
  const [novoDmAberto, setNovoDmAberto] = useStateChat(false);
  const [emojiAberto, setEmojiAberto] = useStateChat(false);
  const [editandoId, setEditandoId] = useStateChat(null);
  const [textoEdicao, setTextoEdicao] = useStateChat("");
  const [diretasAberto, setDiretasAberto] = useStateChat(() => lerAcordeaoSalvo("envoxers_chat_acc_diretas", true));
  const [clientesAberto, setClientesAberto] = useStateChat(() => lerAcordeaoSalvo("envoxers_chat_acc_clientes", false));
  const mensagensRef = useRefChat(null);
  const textareaRef = useRefChat(null);
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
    if (newConversationSignal > 0) setNovoDmAberto(true);
  }, [newConversationSignal]);

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
    const { tipo, canal_id, mensagem } = wsEvent;
    if (tipo === "mensagem_editada" || tipo === "mensagem_excluida") {
      if (canal_id === canalAtivoRef.current && mensagem) {
        setMensagens((prev) => prev.map((m) => (m.id === mensagem.id ? mensagem : m)));
      }
      carregarCanais();
      return;
    }
    if (tipo !== "mensagem_nova" || !mensagem) return;
    if (canal_id === canalAtivoRef.current) {
      setMensagens((prev) => prev.some((m) => m.id === mensagem.id) ? prev : [...prev, mensagem]);
      EnvoxersAPI.api(`/chat/canais/${canal_id}/ler`, { method: "POST" })
        .then(() => { if (onLeituraAtualizada) onLeituraAtualizada(); })
        .catch(() => {});
    } else if (canaisRef.current.some((c) => c.id === canal_id)) {
      setCanais((prev) => prev.map((c) => (c.id === canal_id ? { ...c, nao_lidas: (c.nao_lidas || 0) + 1 } : c)));
    } else {
      carregarCanais();
    }
  }, [wsEvent]);

  useEffectChat(() => {
    if (mensagensRef.current) mensagensRef.current.scrollTop = mensagensRef.current.scrollHeight;
  }, [mensagens]);

  const ajustarAlturaComposer = (el = textareaRef.current) => {
    if (!el) return;
    const minimo = 42;
    const maximo = 84;
    el.style.height = `${minimo}px`;
    const nova = Math.min(Math.max(el.scrollHeight, minimo), maximo);
    el.style.height = `${nova}px`;
    el.style.overflowY = el.scrollHeight > maximo ? "auto" : "hidden";
  };
  useEffectChat(() => { ajustarAlturaComposer(); }, [texto]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !canalAtivoId || enviando) return;
    setEnviando(true);
    try {
      const resposta = await EnvoxersAPI.api(`/chat/canais/${canalAtivoId}/mensagens`, {
        method: "POST",
        body: JSON.stringify({ texto: t }),
      });
      setMensagens((prev) => prev.some((m) => m.id === resposta.id) ? prev : [...prev, resposta]);
      setTexto("");
      setEmojiAberto(false);
      requestAnimationFrame(() => ajustarAlturaComposer());
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

  const inserirEmoji = (emoji) => {
    const el = textareaRef.current;
    const inicio = el && Number.isInteger(el.selectionStart) ? el.selectionStart : texto.length;
    const fim = el && Number.isInteger(el.selectionEnd) ? el.selectionEnd : inicio;
    const novo = texto.slice(0, inicio) + emoji + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = inicio + emoji.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
      ajustarAlturaComposer(textareaRef.current);
    });
  };

  const iniciarEdicao = (m) => {
    setEditandoId(m.id);
    setTextoEdicao(m.texto || "");
  };
  const salvarEdicao = async (m) => {
    const t = textoEdicao.trim();
    if (!t) { toast("A mensagem não pode ficar vazia", "error"); return; }
    try {
      const atualizada = await EnvoxersAPI.api(`/chat/canais/${m.canal_id}/mensagens/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ texto: t }),
      });
      setMensagens((prev) => prev.map((x) => x.id === m.id ? atualizada : x));
      setEditandoId(null);
      setTextoEdicao("");
      carregarCanais();
    } catch (err) { toast(err.message, "error"); }
  };
  const excluirParaTodos = async (m) => {
    if (!confirm("Excluir esta mensagem para todos? Essa ação não pode ser desfeita.")) return;
    try {
      const excluida = await EnvoxersAPI.api(`/chat/canais/${m.canal_id}/mensagens/${m.id}`, { method: "DELETE" });
      setMensagens((prev) => prev.map((x) => x.id === m.id ? excluida : x));
      if (editandoId === m.id) { setEditandoId(null); setTextoEdicao(""); }
      carregarCanais();
    } catch (err) { toast(err.message, "error"); }
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
  const fotoPorEnvoxerId = {};
  (envoxersList || []).forEach((e) => { fotoPorEnvoxerId[e.id] = e.foto_url; });

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
            <ChatCanalItem
              key={c.id}
              canal={c}
              ativo={c.id === canalAtivoId}
              fotoUrl={fotoPorEnvoxerId[c.outro_envoxer_id]}
              onClick={() => setCanalAtivoId(c.id)}
            />
          ))}
          {grupos.dms.length === 0 && <div className="chat-sidebar-empty">Nenhuma conversa direta ainda.</div>}
        </ChatAccordionSection>

        <ChatAccordionSection titulo="Clientes" aberto={clientesAberto} onToggle={toggleClientes}>
          {grupos.clientes.map((c) => (
            <ChatCanalItem key={c.id} canal={c} ativo={c.id === canalAtivoId} onClick={() => setCanalAtivoId(c.id)} />
          ))}
        </ChatAccordionSection>
      </aside>

      <section className="chat-main">
        <div className="chat-header">
          {canalAtivo && canalAtivo.tipo === "dm" && (
            <EnvoxersShared.Avatar nome={canalAtivo.nome} fotoUrl={fotoPorEnvoxerId[canalAtivo.outro_envoxer_id]} size="sm" envoxerId={canalAtivo.outro_envoxer_id} />
          )}
          <span>{canalAtivo ? nomeCanalExibicao(canalAtivo) : "Selecione um canal"}</span>
        </div>
        <div className="chat-messages" ref={mensagensRef}>
          {mensagens.map((m) => {
            const propria = m.autor_envoxer_id === meuId;
            const excluida = !!m.excluida_para_todos_em;
            const dentroPrazoEdicao = !m.prazo_edicao || Date.now() <= new Date(m.prazo_edicao).getTime();
            const dentroPrazoExclusao = !m.prazo_exclusao || Date.now() <= new Date(m.prazo_exclusao).getTime();
            const podeEditar = propria && !excluida && !!m.pode_editar && dentroPrazoEdicao;
            const podeExcluir = propria && !excluida && !!m.pode_excluir && dentroPrazoExclusao;
            return (
              <div className={"chat-msg" + (propria ? " own" : "") + (excluida ? " deleted" : "")} key={m.id}>
                {!propria && <EnvoxersShared.Avatar nome={m.autor_nome} fotoUrl={m.autor_foto} size="sm" envoxerId={m.autor_envoxer_id} />}
                <div className="chat-msg-body">
                  <div className="chat-msg-meta">
                    {!propria && <span className="chat-msg-autor">{m.autor_nome}</span>}
                    <span className="chat-msg-hora">{fmtHoraChat(m.created_at)}{m.editado_em && !excluida ? " · editada" : ""}</span>
                    {propria && (podeEditar || podeExcluir) && editandoId !== m.id && (
                      <span className="chat-msg-actions">
                        {podeEditar && <button type="button" title={m.prazo_edicao ? `Editar até ${new Date(m.prazo_edicao).toLocaleString("pt-BR")}` : "Editar"} onClick={() => iniciarEdicao(m)}>Editar</button>}
                        {podeExcluir && <button type="button" className="danger" title={m.prazo_exclusao ? `Excluir para todos até ${new Date(m.prazo_exclusao).toLocaleString("pt-BR")}` : "Excluir para todos"} onClick={() => excluirParaTodos(m)}>Excluir</button>}
                      </span>
                    )}
                  </div>
                  {editandoId === m.id ? (
                    <div className="chat-msg-editor">
                      <textarea value={textoEdicao} onChange={(e) => setTextoEdicao(e.target.value)} autoFocus />
                      <div>
                        <button className="btn btn-xs" onClick={() => { setEditandoId(null); setTextoEdicao(""); }}>Cancelar</button>
                        <button className="btn btn-primary btn-xs" onClick={() => salvarEdicao(m)}>Salvar</button>
                      </div>
                    </div>
                  ) : excluida ? (
                    <div className="chat-msg-texto chat-msg-deleted">Mensagem excluída para todos</div>
                  ) : (
                    m.texto && <div className="chat-msg-texto">{m.texto}</div>
                  )}
                </div>
              </div>
            );
          })}
          {mensagens.length === 0 && <div className="empty">Nenhuma mensagem ainda. Diga oi!</div>}
        </div>
        {canalAtivoId && (
          <div className="chat-input-bar">
            <div className="chat-composer-tools">
              <button type="button" className="chat-emoji-btn" onClick={() => setEmojiAberto((v) => !v)} aria-label="Inserir emoji" title="Inserir emoji">😊</button>
              {emojiAberto && (
                <div className="chat-emoji-picker">
                  {CHAT_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => inserirEmoji(emoji)}>{emoji}</button>)}
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Escreva uma mensagem…"
              value={texto}
              onChange={(e) => { setTexto(e.target.value); ajustarAlturaComposer(e.target); }}
              onKeyDown={onKeyDownChat}
            />
            <button className="btn btn-primary chat-send-btn" disabled={enviando || !texto.trim()} onClick={enviar}>Enviar</button>
          </div>
        )}
      </section>

      {novoDmAberto && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setNovoDmAberto(false); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ fontSize: 20 }}>Nova conversa</h2>
              <button className="modal-close" onClick={() => setNovoDmAberto(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="chat-new-conversation-list">
              {dmDisponiveis.map((e) => (
                <div key={e.id} className="chat-canal-item" onClick={() => abrirDm(e.id)}>
                  <EnvoxersShared.Avatar nome={e.nome} fotoUrl={e.foto_url} size="sm" envoxerId={e.id} />
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
