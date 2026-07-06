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
  const [filtroStatus, setFiltroStatus] = useStateSol("todas");
  const [abrindoNova, setAbrindoNova] = useStateSol(false);
  const [abrindoId, setAbrindoId] = useStateSol(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const params = filtroStatus !== "todas" ? `?status=${filtroStatus}` : "";
      const data = await EnvoxersAPI.api(`/solicitacoes${params}`);
      setSolicitacoes(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectSol(() => { carregar(); }, [filtroStatus]);

  const statusOptions = ["todas", "nova", "em_analise", "virou_demanda", "recusada"];

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Solicitações do cliente"
        subtitle="Pedidos que o atendimento registra em nome do cliente — vira demanda no Kanban quando aprovado."
        actions={(
          <button className="btn btn-envox" onClick={() => setAbrindoNova(true)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Nova solicitação
          </button>
        )}
      />

      <div className="toolbar">
        <div className="filter-group">
          {statusOptions.map((s) => (
            <button
              key={s}
              className={"chip" + (filtroStatus === s ? " active" : "")}
              onClick={() => setFiltroStatus(s)}
            >
              {s === "todas" ? "Todas" : STATUS_SOLICITACAO_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Título</th>
              <th className="table-mobile-hide">Tipo</th>
              <th style={{ width: 120 }}>Status</th>
              <th className="table-mobile-hide" style={{ width: 100 }}>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5">Carregando…</td></tr>}
            {!loading && solicitacoes.length === 0 && <tr><td colSpan="5">Nenhuma solicitação encontrada.</td></tr>}
            {solicitacoes.map((s) => (
              <tr key={s.id} onClick={() => setAbrindoId(s.id)} style={{ cursor: "pointer" }}>
                <td>{s.cliente_nome || "—"}</td>
                <td>{s.titulo}</td>
                <td className="table-mobile-hide">{TIPO_SOLICITACAO_LABELS[s.tipo] || s.tipo}</td>
                <td>
                  <span className="pill" style={{ color: STATUS_SOLICITACAO_CORES[s.status] }}>
                    {STATUS_SOLICITACAO_LABELS[s.status] || s.status}
                  </span>
                </td>
                <td className="table-mobile-hide">{fmtDataSol(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abrindoNova && (
        <SolicitacaoModal
          solicitacaoId={null}
          onClose={() => setAbrindoNova(false)}
          onSaved={(novaId) => { setAbrindoNova(false); setAbrindoId(novaId); carregar(); }}
          onAbrirTarefa={onAbrirTarefa}
        />
      )}
      {abrindoId !== null && (
        <SolicitacaoModal
          solicitacaoId={abrindoId}
          onClose={() => { setAbrindoId(null); carregar(); }}
          onSaved={() => { setAbrindoId(null); carregar(); }}
          onListChanged={carregar}
          onAbrirTarefa={onAbrirTarefa}
        />
      )}
    </div>
  );
}

function SolicitacaoModal({ solicitacaoId, onClose, onSaved, onListChanged, onAbrirTarefa }) {
  const isEdit = !!solicitacaoId;
  const toast = EnvoxersShared.useToast();
  const [loading, setLoading] = useStateSol(isEdit);
  const [saving, setSaving] = useStateSol(false);
  const [solicitacao, setSolicitacao] = useStateSol(null);
  const [clientes, setClientes] = useStateSol([]);

  const [clienteId, setClienteId] = useStateSol("");
  const [tipo, setTipo] = useStateSol("novo_post");
  const [titulo, setTitulo] = useStateSol("");
  const [descricao, setDescricao] = useStateSol("");
  const [solicitanteNome, setSolicitanteNome] = useStateSol("");
  const [motivoRecusa, setMotivoRecusa] = useStateSol("");

  useEffectSol(() => {
    (async () => {
      try {
        const cl = await EnvoxersAPI.api("/clientes");
        setClientes(cl);
        if (isEdit) {
          const s = await EnvoxersAPI.api(`/solicitacoes/${solicitacaoId}`);
          setSolicitacao(s);
          setClienteId(String(s.cliente_id));
          setTipo(s.tipo);
          setTitulo(s.titulo);
          setDescricao(s.descricao || "");
          setSolicitanteNome(s.solicitante_nome || "");
        }
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [solicitacaoId]);

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

  const handleEmAnalise = async () => {
    setSaving(true);
    try {
      const s = await EnvoxersAPI.api(`/solicitacoes/${solicitacaoId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "em_analise" }),
      });
      setSolicitacao(s);
      toast("Marcada como em análise", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRecusar = async () => {
    if (!motivoRecusa.trim()) {
      toast("Descreva o motivo da recusa", "error");
      return;
    }
    setSaving(true);
    try {
      const s = await EnvoxersAPI.api(`/solicitacoes/${solicitacaoId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "recusada", motivo_recusa: motivoRecusa }),
      });
      setSolicitacao(s);
      toast("Solicitação recusada", "success");
      onListChanged && onListChanged();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleVirarDemanda = async () => {
    if (!confirm("Criar uma demanda no Kanban a partir desta solicitação?")) return;
    setSaving(true);
    try {
      const s = await EnvoxersAPI.api(`/solicitacoes/${solicitacaoId}/virar-demanda`, { method: "POST" });
      setSolicitacao(s);
      toast("Demanda criada no Kanban!", "success");
      onListChanged && onListChanged();
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
      const s = await EnvoxersAPI.upload(`/solicitacoes/${solicitacaoId}/anexos`, file);
      setSolicitacao(s);
      toast("Anexo enviado!", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">
            <span>{clientes.find((c) => String(c.id) === clienteId)?.nome || "Selecione o cliente"}</span>
          </div>
          <h2 className="modal-title">{isEdit ? (solicitacao?.titulo || "—") : "Nova solicitação"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Carregando…</div>
        ) : (
          <div className="modal-body">
            <div className="modal-main">
              {!isEdit && (
                <>
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
                </>
              )}

              {isEdit && (
                <>
                  <div className="modal-section-title">Tipo</div>
                  <div className="pill">{TIPO_SOLICITACAO_LABELS[solicitacao.tipo] || solicitacao.tipo}</div>

                  <div className="modal-section-title">Descrição</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{solicitacao.descricao || "sem descrição"}</div>

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
                      <button className="btn btn-sm" onClick={() => { onAbrirTarefa && onAbrirTarefa(solicitacao.tarefa_id_gerada); onClose(); }}>
                        Abrir no Kanban →
                      </button>
                    </>
                  )}

                  {(solicitacao.status === "nova" || solicitacao.status === "em_analise") && (
                    <>
                      <div className="modal-section-title">Recusar</div>
                      <textarea value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Motivo da recusa (obrigatório para recusar)" style={{ width: "100%", minHeight: 50 }}></textarea>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="modal-side">
              {isEdit && (
                <div className="modal-side-block">
                  <div className="modal-side-label">Status</div>
                  <div className="modal-side-value" style={{ color: STATUS_SOLICITACAO_CORES[solicitacao.status] }}>
                    {STATUS_SOLICITACAO_LABELS[solicitacao.status]}
                  </div>
                </div>
              )}

              {isEdit && solicitacao.solicitante_nome && (
                <div className="modal-side-block">
                  <div className="modal-side-label">Solicitado por</div>
                  <div className="modal-side-value">{solicitacao.solicitante_nome}</div>
                </div>
              )}

              <div className="modal-side-block">
                <div className="modal-side-label">Ações</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {!isEdit && (
                    <button className="btn btn-envox btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={handleCriar} disabled={saving}>
                      {saving ? "Salvando…" : "Registrar solicitação"}
                    </button>
                  )}
                  {isEdit && solicitacao.status === "nova" && (
                    <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={handleEmAnalise} disabled={saving}>
                      Marcar em análise
                    </button>
                  )}
                  {isEdit && (solicitacao.status === "nova" || solicitacao.status === "em_analise") && (
                    <>
                      <button className="btn btn-envox btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={handleVirarDemanda} disabled={saving}>
                        Virar demanda
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ width: "100%", justifyContent: "flex-start", color: "var(--farol-vermelho)" }}
                        onClick={handleRecusar}
                        disabled={saving}
                      >
                        Recusar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.SolicitacoesScreen = SolicitacoesScreen;
