// Barra global de Foco — persistente em qualquer tela enquanto há uma sessão ativa.
// Réplica do padrão visual do wireframe (.foco-bar, .foco-pulse, .foco-time, .foco-title, .foco-btn).
function focoContexto(focoAtivo) {
  const colunaLabel = (window.KANBAN_STATUS_COLS || []).find((c) => c.key === focoAtivo.tarefa_status)?.label;
  return [focoAtivo.cliente_nome, colunaLabel, focoAtivo.tarefa_titulo].filter(Boolean).join(" · ");
}

function FocoBar({ focoAtivo, focoElapsed, onPausarFoco, onFinalizarFoco, onAbrirTarefa }) {
  if (!focoAtivo) return null;
  const pausado = !!focoAtivo.pausado_em;

  return (
    <div className={"foco-bar active" + (pausado ? " paused" : "")}>
      <span className="foco-pulse"></span>
      <span className="foco-time">{fmtHMS(focoElapsed)}</span>
      <button
        className="foco-title"
        onClick={onAbrirTarefa}
        title="Abrir a tarefa"
        style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left" }}
      >
        {focoContexto(focoAtivo) || "Sessão de Foco"}
      </button>
      <button className="foco-btn" onClick={onPausarFoco} title={pausado ? "Retomar" : "Pausar"}>
        {pausado ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4z" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="3" y="2" width="2" height="8" /><rect x="7" y="2" width="2" height="8" /></svg>
        )}
      </button>
      <button className="foco-btn stop" onClick={onFinalizarFoco} title="Finalizar">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" /></svg>
      </button>
    </div>
  );
}

window.FocoBar = FocoBar;

const { useState: useStateFoco } = React;

// Botão flutuante global + mini-modal de início rápido — visível só quando NÃO há Foco ativo.
function FocoQuickStart({ focoAtivo, onIniciarFoco }) {
  const [aberto, setAberto] = useStateFoco(false);
  const [clientes, setClientes] = useStateFoco([]);
  const [tarefas, setTarefas] = useStateFoco([]);
  const [clienteId, setClienteId] = useStateFoco("");
  const [tarefaId, setTarefaId] = useStateFoco("");
  const [carregando, setCarregando] = useStateFoco(false);
  const toast = EnvoxersShared.useToast();

  if (focoAtivo) return null;

  const abrir = async () => {
    setAberto(true);
    setClienteId("");
    setTarefaId("");
    setTarefas([]);
    try {
      const cs = await EnvoxersAPI.api("/clientes");
      setClientes(cs);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const selecionarCliente = async (id) => {
    setClienteId(id);
    setTarefaId("");
    setTarefas([]);
    if (!id) return;
    try {
      const ts = await EnvoxersAPI.api(`/tarefas?cliente_id=${id}`);
      setTarefas(ts.filter((t) => t.status !== "finalizado"));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const iniciar = async () => {
    if (!tarefaId) return;
    setCarregando(true);
    // Se der certo, focoAtivo vira truthy no componente pai e este componente
    // some sozinho (return null acima) — não fecho o modal manualmente aqui,
    // assim em caso de erro (ex.: 409) o mini-modal continua aberto pro usuário tentar de novo.
    await onIniciarFoco(Number(tarefaId));
    setCarregando(false);
  };

  return (
    <>
      <button className="foco-fab" onClick={abrir}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z" /></svg>
        Iniciar Foco
      </button>

      {aberto && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setAberto(false); }}>
          <div className="modal" style={{ maxWidth: 360, marginTop: 80 }}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ fontSize: 18 }}>Iniciar Foco</h2>
              <button className="modal-close" onClick={() => setAberto(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div style={{ padding: "20px 28px 28px" }}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Cliente</label>
                <select value={clienteId} onChange={(e) => selecionarCliente(e.target.value)}>
                  <option value="">Selecionar…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 20 }}>
                <label>Tarefa</label>
                <select value={tarefaId} onChange={(e) => setTarefaId(e.target.value)} disabled={!clienteId}>
                  <option value="">{clienteId ? "Selecionar…" : "Escolha um cliente primeiro"}</option>
                  {tarefas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                </select>
              </div>
              <button
                className="btn btn-envox"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={iniciar}
                disabled={!tarefaId || carregando}
              >
                {carregando ? "Iniciando…" : "Iniciar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

window.FocoQuickStart = FocoQuickStart;

// Confirmação ao finalizar — mostra resumo (tarefa + tempo) e permite comentário opcional
// antes de encerrar o registro de verdade.
function FocoFinalizarModal({ aberto, focoAtivo, focoElapsed, onCancelar, onConfirmar }) {
  const [comentario, setComentario] = useStateFoco("");
  const [enviando, setEnviando] = useStateFoco(false);

  if (!aberto || !focoAtivo) return null;

  const confirmar = async (comComentario) => {
    setEnviando(true);
    await onConfirmar(comComentario ? comentario.trim() || null : null);
    setEnviando(false);
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="modal" style={{ maxWidth: 420, marginTop: 100 }}>
        <div className="modal-head">
          <h2 className="modal-title" style={{ fontSize: 18 }}>Finalizar Foco</h2>
          <button className="modal-close" onClick={onCancelar} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div style={{ padding: "20px 28px 28px" }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 4 }}>{focoContexto(focoAtivo)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {fmtHMS(focoElapsed)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              tempo total registrado
            </div>
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Adicionar comentário (opcional)</label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="O que foi feito nessa sessão…"
              style={{ width: "100%", minHeight: 80 }}
            ></textarea>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="btn btn-envox"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => confirmar(true)}
              disabled={enviando}
            >
              {enviando ? "Finalizando…" : "Confirmar e finalizar"}
            </button>
            <button
              className="btn btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => confirmar(false)}
              disabled={enviando}
            >
              Finalizar sem comentário
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.FocoFinalizarModal = FocoFinalizarModal;
