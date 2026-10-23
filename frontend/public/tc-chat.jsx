const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat } = React;

function fmtHoraChat(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function chaveDiaChat(iso) {
  return new Date(iso).toLocaleDateString("en-CA");
}

function tituloDiaChat(iso) {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (chaveDiaChat(iso) === chaveDiaChat(hoje)) return "Hoje";
  if (chaveDiaChat(iso) === chaveDiaChat(ontem)) return "Ontem";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
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
  const [respondendo, setRespondendo] = useStateChat(null);
  const [imagemAberta, setImagemAberta] = useStateChat(null);
  const [enviando, setEnviando] = useStateChat(false);
  const [anexoPendente, setAnexoPendente] = useStateChat(null);
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
  useEffectChat(() => { setRespondendo(null); setImagemAberta(null); }, [canalAtivoId]);
  useEffectChat(() => {
    if (!imagemAberta) return;
    const onEscape = (e) => { if (e.key === "Escape") setImagemAberta(null); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [imagemAberta]);
  useEffectChat(() => {
    window.__envoxersCanalAtivo = canalAtivoId;
    window.dispatchEvent(new Event('envoxers:canal-em-foco'));
    return () => {
      window.__envoxersCanalAtivo = null;
      window.dispatchEvent(new Event('envoxers:canal-em-foco'));
    };
  }, [canalAtivoId]);
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
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        carregarCanais();
        return;
      }
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
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const canal = canalAtivoRef.current;
      if (!canal) return;
      EnvoxersAPI.api(`/chat/canais/${canal}/ler`, { method: "POST" }).then(() => {
        setCanais(prev => prev.map(c => c.id === canal ? {...c, nao_lidas: 0} : c));
        if (onLeituraAtualizada) onLeituraAtualizada();
      }).catch(() => {});
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

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

  const revogarPreviewChat = (item) => {
    if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
  };

  const selecionarAnexoChat = (file) => {
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) {
      toast("Arquivo acima do limite de 250 MB", "error");
      return;
    }
    revogarPreviewChat(anexoPendente);
    setAnexoPendente({
      file,
      previewUrl: (file.type || "").startsWith("image/") ? URL.createObjectURL(file) : "",
    });
  };

  const removerAnexoChat = () => {
    revogarPreviewChat(anexoPendente);
    setAnexoPendente(null);
  };

  const onSelecionarAnexoChat = (e) => {
    selecionarAnexoChat((e.target.files || [])[0]);
    e.target.value = "";
  };

  const onPasteChat = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    const imagem = files.find((f) => (f.type || "").startsWith("image/"));
    if (!imagem) return;
    e.preventDefault();
    const ext = (imagem.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([imagem], "print-" + stamp + "." + ext, { type: imagem.type });
    selecionarAnexoChat(file);
    toast("Print anexado à mensagem", "success");
  };

  const enviar = async () => {
    const t = texto.trim();
    const anexoEnvio = anexoPendente;
    const respostaEnvio = respondendo;
    if ((!t && !anexoEnvio) || !canalAtivoId || enviando) return;

    // Limpa imediatamente para dar resposta visual instantânea. Em caso de erro,
    // restaura exatamente o que a pessoa tentou enviar.
    setTexto("");
    setAnexoPendente(null);
    setRespondendo(null);
    setEmojiAberto(false);
    setEnviando(true);
    // O textarea permanece habilitado, logo o Enter não remove o foco.
    textareaRef.current?.focus();
    requestAnimationFrame(() => ajustarAlturaComposer());

    try {
      let resposta;
      if (anexoEnvio) {
        resposta = await EnvoxersAPI.uploadWithFields(
          `/chat/canais/${canalAtivoId}/mensagens-com-anexo`,
          anexoEnvio.file,
          anexoEnvio.file.name || "arquivo",
          { texto: t, resposta_a_id: respostaEnvio?.id }
        );
      } else {
        resposta = await EnvoxersAPI.api(`/chat/canais/${canalAtivoId}/mensagens`, {
          method: "POST",
          body: JSON.stringify({ texto: t, resposta_a_id: respostaEnvio?.id || null }),
        });
      }
      setMensagens((prev) => prev.some((m) => m.id === resposta.id) ? prev : [...prev, resposta]);
      revogarPreviewChat(anexoEnvio);
    } catch (err) {
      setTexto((atual) => atual ? t + "\n" + atual : t);
      setAnexoPendente(anexoEnvio);
      setRespondendo((atual) => atual || respostaEnvio);
      toast(err.message, "error");
      requestAnimationFrame(() => ajustarAlturaComposer());
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDownChat = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      enviar();
      textareaRef.current?.focus();
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

  const selecionarResposta = (m) => {
    if (m.excluida_para_todos_em) return;
    setRespondendo({ id: m.id, autor_nome: m.autor_nome, texto: m.texto, anexo_nome: m.anexo_nome });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const irParaMensagem = (id) => {
    if (!mensagens.some((msg) => msg.id === id)) return;
    const el = mensagensRef.current?.querySelector('[data-chat-mensagem-id="' + Number(id) + '"]');
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
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
          {mensagens.map((m, indice) => {
            const separadorDia = indice === 0 || chaveDiaChat(m.created_at) !== chaveDiaChat(mensagens[indice - 1].created_at);
            const original = m.resposta_a_id ? mensagens.find((item) => item.id === m.resposta_a_id) : null;
            const citacao = original ? {
              id: original.id, autor_nome: original.autor_nome,
              texto: original.texto, anexo_nome: original.anexo_nome,
              excluida: !!original.excluida_para_todos_em,
            } : m.resposta_a;
            const propria = m.autor_envoxer_id === meuId;
            const excluida = !!m.excluida_para_todos_em;
            const dentroPrazoEdicao = !m.prazo_edicao || Date.now() <= new Date(m.prazo_edicao).getTime();
            const dentroPrazoExclusao = !m.prazo_exclusao || Date.now() <= new Date(m.prazo_exclusao).getTime();
            const podeEditar = propria && !excluida && !!m.pode_editar && dentroPrazoEdicao;
            const podeExcluir = propria && !excluida && !!m.pode_excluir && dentroPrazoExclusao;
            return (
              <React.Fragment key={m.id}>
              {separadorDia && <div className="chat-day-divider" role="separator" aria-label={tituloDiaChat(m.created_at)}><span>{tituloDiaChat(m.created_at)}</span></div>}
              <div data-chat-mensagem-id={m.id} className={"chat-msg" + (propria ? " own" : "") + (excluida ? " deleted" : "")}>
                {!propria && <EnvoxersShared.Avatar nome={m.autor_nome} fotoUrl={m.autor_foto} size="sm" envoxerId={m.autor_envoxer_id} />}
                <div className="chat-msg-body">
                  <div className="chat-msg-meta">
                    {!propria && <span className="chat-msg-autor">{m.autor_nome}</span>}
                    <span className="chat-msg-hora">{fmtHoraChat(m.created_at)}{m.editado_em && !excluida ? " · editada" : ""}</span>
                    {!excluida && editandoId !== m.id && (
                      <span className="chat-msg-actions">
                        <button type="button" onClick={() => selecionarResposta(m)} title="Responder esta mensagem">Responder</button>
                        {propria && podeEditar && <button type="button" title={m.prazo_edicao ? `Editar até ${new Date(m.prazo_edicao).toLocaleString("pt-BR")}` : "Editar"} onClick={() => iniciarEdicao(m)}>Editar</button>}
                        {propria && podeExcluir && <button type="button" className="danger" title={m.prazo_exclusao ? `Excluir para todos até ${new Date(m.prazo_exclusao).toLocaleString("pt-BR")}` : "Excluir para todos"} onClick={() => excluirParaTodos(m)}>Excluir</button>}
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
                    <>
                      {m.resposta_a_id && (
                        <button
                          type="button"
                          className="chat-quoted-msg"
                          onClick={() => irParaMensagem(m.resposta_a_id)}
                          title="Mensagem respondida"
                        >
                          <strong>↪ {citacao?.autor_nome || "Mensagem anterior"}</strong>
                          <span>{citacao?.excluida ? "Mensagem excluída" : (citacao?.texto || (citacao?.anexo_nome ? "📎 " + citacao.anexo_nome : "Mensagem original"))}</span>
                        </button>
                      )}
                      {m.texto && <div className="chat-msg-texto">{m.texto}</div>}
                      {m.anexo_url && (
                        ((m.anexo_mime_type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(m.anexo_nome || "")) ? (
                          <div className="chat-image-attachment">
                            <button type="button" className="chat-msg-image" onClick={() => setImagemAberta({ url: m.anexo_url, nome: m.anexo_nome || "Imagem" })} title="Ampliar imagem">
                              <img loading="lazy" src={m.anexo_url} alt={m.anexo_nome || "Imagem anexada"} />
                              {m.anexo_nome && <span>{m.anexo_nome}</span>}
                            </button>
                            <a className="chat-image-download" href={m.anexo_url} download={m.anexo_nome || "imagem"}>↓ Baixar imagem</a>
                          </div>
                        ) : (
                          <a className="chat-msg-file" href={m.anexo_url} target="_blank" rel="noreferrer">
                            <span className="chat-msg-file-icon">📎</span>
                            <span>
                              <strong>{m.anexo_nome || "Arquivo anexado"}</strong>
                              {m.anexo_tamanho_kb != null && <small>{m.anexo_tamanho_kb < 1024 ? m.anexo_tamanho_kb + " KB" : (m.anexo_tamanho_kb / 1024).toFixed(1) + " MB"}</small>}
                            </span>
                          </a>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
          })}
          {mensagens.length === 0 && <div className="empty">Nenhuma mensagem ainda. Diga oi!</div>}
        </div>
        {canalAtivoId && (
          <div className="chat-composer-wrap">
            {respondendo && (
              <div className="chat-reply-draft">
                <div><strong>↪ Respondendo a {respondendo.autor_nome}</strong><span>{respondendo.texto || (respondendo.anexo_nome ? "📎 " + respondendo.anexo_nome : "Mensagem")}</span></div>
                <button type="button" aria-label="Cancelar resposta" title="Cancelar resposta" onClick={() => { setRespondendo(null); textareaRef.current?.focus(); }}>×</button>
              </div>
            )}
            {anexoPendente && (
              <div className="chat-attachment-draft">
                {anexoPendente.previewUrl ? (
                  <img src={anexoPendente.previewUrl} alt="Prévia do anexo" />
                ) : (
                  <span className="chat-attachment-draft-icon">📎</span>
                )}
                <div>
                  <strong title={anexoPendente.file.name}>{anexoPendente.file.name}</strong>
                  <small>{anexoPendente.file.size < 1024 * 1024 ? Math.max(1, Math.round(anexoPendente.file.size / 1024)) + " KB" : (anexoPendente.file.size / 1024 / 1024).toFixed(1) + " MB"}</small>
                </div>
                <button type="button" onClick={removerAnexoChat} disabled={enviando} title="Remover anexo">×</button>
              </div>
            )}
            <div className="chat-input-bar">
              <div className="chat-composer-tools">
                <label className="chat-attach-btn" aria-label="Anexar arquivo" title="Anexar arquivo">
                  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.5 5.5l-6.3 6.3a2.5 2.5 0 103.5 3.5l5.4-5.4a3.5 3.5 0 00-5-5L4.5 10.5"/></svg>
                  <input type="file" style={{ display:"none" }} onChange={onSelecionarAnexoChat} disabled={enviando} />
                </label>
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
                placeholder="Escreva uma mensagem… ou cole um print"
                value={texto}
                onPaste={onPasteChat}
                onChange={(e) => { setTexto(e.target.value); ajustarAlturaComposer(e.target); }}
                onKeyDown={onKeyDownChat}
              />
              <button className="btn btn-primary chat-send-btn" disabled={enviando || (!texto.trim() && !anexoPendente)} onClick={enviar}>{enviando ? "Enviando…" : "Enviar"}</button>
            </div>
          </div>
        )}
      </section>

      {imagemAberta && (
        <div className="chat-image-overlay" role="dialog" aria-modal="true" aria-label={"Visualizar " + imagemAberta.nome} onClick={(e) => { if (e.target === e.currentTarget) setImagemAberta(null); }}>
          <div className="chat-image-dialog">
            <div className="chat-image-dialog-header">
              <strong title={imagemAberta.nome}>{imagemAberta.nome}</strong>
              <a href={imagemAberta.url} download={imagemAberta.nome}>↓ Baixar</a>
              <button type="button" onClick={() => setImagemAberta(null)} aria-label="Fechar imagem">×</button>
            </div>
            <img src={imagemAberta.url} alt={imagemAberta.nome} />
          </div>
        </div>
      )}
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
