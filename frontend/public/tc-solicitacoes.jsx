const { useState: useStateSol, useEffect: useEffectSol, useMemo: useMemoSol } = React;

const TIPO_SOLICITACAO_LABELS = {
  novo_post: "Novo post",
  alteracao: "Alteração",
  material_extra: "Material extra",
  campanha: "Campanha",
  evento: "Evento",
};

const STATUS_SOLICITACAO_LABELS = {
  nova: "Nova",
  em_analise: "Em análise",
  virou_demanda: "Virou demanda",
  recusada: "Recusada",
};

const STATUS_SOLICITACAO_CORES = {
  nova: "var(--farol-amarelo)",
  em_analise: "var(--accent)",
  virou_demanda: "var(--farol-verde)",
  recusada: "var(--farol-vermelho)",
};

function fmtDataSol(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function SolicitacoesScreen({ onAbrirTarefa }) {
  const toast = EnvoxersShared.useToast();
  const [solicitacoes, setSolicitacoes] = useStateSol([]);
  const [loading, setLoading] = useStateSol(true);
  const [tab, setTab] = useStateSol("nova"); // nova | em_analise | todas
  const [selecionadaId, setSelecionadaId] = useStateSol(null);
  const [abrindoNova, setAbrindoNova] = useStateSol(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/solicitacoes");
      setSolicitacoes(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectSol(() => { carregar(); }, []);

  const contagem = useMemoSol(() => ({
    nova: solicitacoes.filter((s) => s.status === "nova").length,
    em_analise: solicitacoes.filter((s) => s.status === "em_analise").length,
  }), [solicitacoes]);

  const listaFiltrada = useMemoSol(() => {
    if (tab === "todas") return solicitacoes;
    return solicitacoes.filter((s) => s.status === tab);
  }, [solicitacoes, tab]);

  const selecionada = solicitacoes.find((s) => s.id === selecionadaId) || null;

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Solicitações do cliente"
        subtitle="Inbox de pedidos do cliente. Triar, aprovar/recusar, virar demanda."
        actions={(
          <button className="btn btn-envox" onClick={() => setAbrindoNova(true)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Nova solicitação
          </button>
        )}
      />

      <div className="solic-grid">
        <div className="solic-list">
          <div className="solic-list-tabs">
            <button className={tab === "nova" ? "active" : ""} onClick={() => setTab("nova")}>
              Novas <span className="count">{contagem.nova}</span>
            </button>
            <button className={tab === "em_analise" ? "active" : ""} onClick={() => setTab("em_analise")}>
              Análise <span className="count">{contagem.em_analise}</span>
            </button>
            <button className={tab === "todas" ? "active" : ""} onClick={() => setTab("todas")}>
              Todas
            </button>
            <EnvoxersShared.HelpIcon helpKey="solic_tab_novas" />
          </div>

          {loading && <div className="empty" style={{ border: "none", padding: "40px 12px" }}>Carregando…</div>}
          {!loading && listaFiltrada.length === 0 && <div className="empty" style={{ border: "none", padding: "40px 12px" }}>— vazio —</div>}
          {!loading && listaFiltrada.map((s) => (
            <div
              key={s.id}
              className={"solic-item" + (s.status === "nova" ? " nova" : "") + (selecionadaId === s.id ? " active" : "")}
              onClick={() => setSelecionadaId(s.id)}
            >
              <div className="solic-item-head">
                <span className="solic-item-cliente">{s.cliente_nome || "—"}</span>
                <span className="solic-item-time">{fmtDataSol(s.created_at)}</span>
              </div>
              <div className="solic-item-title">{s.titulo}</div>
              <div className="solic-item-tags">
                <span className="pill">{TIPO_SOLICITACAO_LABELS[s.tipo] || s.tipo}</span>
                {s.status === "em_analise" && <span className="pill" style={{ color: "var(--farol-amarelo)" }}>Em análise</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="solic-detail">
          {!selecionada && (
            <div className="empty" style={{ border: "none", padding: "60px 20px" }}>
              <h3>Selecione uma solicitação</h3>
              <div>Clique numa solicitação na lista ao lado para ver os detalhes.</div>
            </div>
          )}
          {selecionada && (
            <SolicitacaoDetalhe
              key={selecionada.id}
              solicitacao={selecionada}
              onAbrirTarefa={onAbrirTarefa}
              onAtualizada={carregar}
            />
          )}
        </div>
      </div>

      {abrindoNova && (
        <NovaSolicitacaoModal
          onClose={() => setAbrindoNova(false)}
          onSaved={(novaId) => { setAbrindoNova(false); carregar(); setSelecionadaId(novaId); }}
        />
      )}
    </div>
  );
}

function SolicitacaoDetalhe({ solicitacao, onAbrirTarefa, onAtualizada }) {
  const toast = EnvoxersShared.useToast();
  const [saving, setSaving] = useStateSol(false);
  const [motivoRecusa, setMotivoRecusa] = useStateSol("");

  const atualizarStatus = async (payload) => {
    setSaving(true);
    try {
      await EnvoxersAPI.api(`/solicitacoes/${solicitacao.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      onAtualizada();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEmAnalise = () => atualizarStatus({ status: "em_analise" });

  const handleRecusar = () => {
    if (!motivoRecusa.trim()) {
      toast("Descreva o motivo da recusa", "error");
      return;
    }
    atualizarStatus({ status: "recusada", motivo_recusa: motivoRecusa });
  };

  const handleVirarDemanda = async () => {
    if (!confirm("Criar uma demanda no Kanban a partir desta solicitação?")) return;
    setSaving(true);
    try {
      await EnvoxersAPI.api(`/solicitacoes/${solicitacao.id}/virar-demanda`, { method: "POST" });
      toast("Demanda criada no Kanban!", "success");
      onAtualizada();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAnexo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await EnvoxersAPI.upload(`/solicitacoes/${solicitacao.id}/anexos`, file);
      toast("Anexo enviado!", "success");
      onAtualizada();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <>
      <div className="solic-detail-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-3)", fontWeight: 500, marginBottom: 6 }}>
            {solicitacao.cliente_nome || "—"}
            <span style={{ color: "var(--ink-4)" }}> · </span>
            <span className="pill">{TIPO_SOLICITACAO_LABELS[solicitacao.tipo] || solicitacao.tipo}</span>
          </div>
          <div className="solic-detail-title">{solicitacao.titulo}</div>
          <div className="solic-detail-meta">
            {solicitacao.solicitante_nome && <span><strong>{solicitacao.solicitante_nome}</strong></span>}
            <span>· {fmtDataSol(solicitacao.created_at)}</span>
            <span style={{ color: STATUS_SOLICITACAO_CORES[solicitacao.status], fontWeight: 600 }}>
              · {STATUS_SOLICITACAO_LABELS[solicitacao.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="modal-section-title">Descrição do cliente</div>
      <div className="modal-desc" style={{ whiteSpace: "pre-wrap" }}>{solicitacao.descricao || "sem descrição"}</div>

      <div className="modal-section-title">
        Anexos <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>· {solicitacao.anexos?.length || 0} arquivo(s)</span>
      </div>
      <div className="attach-list">
        {(solicitacao.anexos || []).map((a, i) => (
          <a key={i} className="attach" href={a.url} target="_blank" rel="noreferrer">
            <svg className="attach-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 6h4M6 9h4M6 12h2" /></svg> {a.nome}
          </a>
        ))}
        {solicitacao.status !== "recusada" && (
          <label className="attach" style={{ borderStyle: "dashed", color: "var(--ink-3)", cursor: "pointer" }}>
            + Anexar
            <input type="file" style={{ display: "none" }} onChange={handleUploadAnexo} />
          </label>
        )}
      </div>

      {solicitacao.status === "recusada" && (
        <>
          <div className="modal-section-title">Motivo da recusa</div>
          <div>{solicitacao.motivo_recusa}</div>
        </>
      )}

      {solicitacao.status === "virou_demanda" && (
        <>
          <div className="modal-section-title">Demanda gerada</div>
          <button className="btn btn-sm" onClick={() => onAbrirTarefa && onAbrirTarefa(solicitacao.tarefa_id_gerada)}>
            Abrir no Kanban →
          </button>
        </>
      )}

      {(solicitacao.status === "nova" || solicitacao.status === "em_analise") && (
        <>
          <div className="modal-section-title">Recusar</div>
          <textarea value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Motivo da recusa (obrigatório para recusar)" style={{ width: "100%", minHeight: 50 }}></textarea>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 20, marginBottom: -4 }}>
            <EnvoxersShared.HelpIcon helpKey="solic_acao" />
          </div>
          <div className="solic-detail-actions">
            <button className="btn btn-envox" onClick={handleVirarDemanda} disabled={saving}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l3 3 7-7" /></svg>
              Virar demanda
            </button>
            {solicitacao.status === "nova" && (
              <button className="btn" onClick={handleEmAnalise} disabled={saving}>
                Marcar como em análise
              </button>
            )}
            <button className="btn" style={{ color: "var(--farol-vermelho)" }} onClick={handleRecusar} disabled={saving}>
              Recusar
            </button>
          </div>
        </>
      )}
    </>
  );
}

function NovaSolicitacaoModal({ onClose, onSaved }) {
  const toast = EnvoxersShared.useToast();
  const [saving, setSaving] = useStateSol(false);
  const [clientes, setClientes] = useStateSol([]);

  const [clienteId, setClienteId] = useStateSol("");
  const [tipo, setTipo] = useStateSol("novo_post");
  const [titulo, setTitulo] = useStateSol("");
  const [descricao, setDescricao] = useStateSol("");
  const [solicitanteNome, setSolicitanteNome] = useStateSol("");

  useEffectSol(() => {
    (async () => {
      try {
        setClientes(await EnvoxersAPI.api("/clientes"));
      } catch (err) {
        toast(err.message, "error");
      }
    })();
  }, []);

  const handleCriar = async () => {
    if (!clienteId || !titulo.trim()) {
      toast("Cliente e título são obrigatórios", "error");
      return;
    }
    setSaving(true);
    try {
      const nova = await EnvoxersAPI.api("/solicitacoes", {
        method: "POST",
        body: JSON.stringify({
          cliente_id: Number(clienteId),
          tipo,
          titulo,
          descricao: descricao || null,
          solicitante_nome: solicitanteNome || null,
        }),
      });
      toast("Solicitação registrada!", "success");
      onSaved(nova.id);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">
            <span>{clientes.find((c) => String(c.id) === clienteId)?.nome || "Selecione o cliente"}</span>
          </div>
          <h2 className="modal-title">Nova solicitação</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-section-title">Dados da solicitação</div>
            <div className="form-row">
              <div className="field span-2">
                <label>Título <span className="req">*</span></label>
                <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Campanha para o Dia das Mães" />
              </div>
              <div className="field">
                <label>Cliente <span className="req">*</span></label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Selecionar…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {Object.entries(TIPO_SOLICITACAO_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label>Solicitado por (contato do cliente)</label>
                <input type="text" value={solicitanteNome} onChange={(e) => setSolicitanteNome(e.target.value)} placeholder="Nome de quem pediu" />
              </div>
            </div>
            <div className="modal-section-title">Descrição</div>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que o cliente pediu, em detalhes" style={{ width: "100%", minHeight: 90 }}></textarea>
          </div>

          <div className="modal-side">
            <div className="modal-side-block">
              <div className="modal-side-label">Ações</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <button className="btn btn-envox btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={handleCriar} disabled={saving}>
                  {saving ? "Salvando…" : "Registrar solicitação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.SolicitacoesScreen = SolicitacoesScreen;
