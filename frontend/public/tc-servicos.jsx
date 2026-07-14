const { useState: useStateSrv, useEffect: useEffectSrv } = React;

function EtapasTemplateModal({ servico, onClose }) {
  const [templates, setTemplates] = useStateSrv([]);
  const [loading, setLoading] = useStateSrv(true);
  const [salvando, setSalvando] = useStateSrv(false);
  const [novaAberta, setNovaAberta] = useStateSrv(false);
  const [novoTitulo, setNovoTitulo] = useStateSrv("");
  const [novaDescricao, setNovaDescricao] = useStateSrv("");
  const [novoPrazoDias, setNovoPrazoDias] = useStateSrv("");
  const [automacaoAbertaId, setAutomacaoAbertaId] = useStateSrv(null);
  const [automacaoAcao, setAutomacaoAcao] = useStateSrv("LIBERAR_PROXIMA_ETAPA");
  const [automacaoColuna, setAutomacaoColuna] = useStateSrv("");
  const toast = EnvoxersShared.useToast();
  const STATUS_COLS = window.KANBAN_STATUS_COLS || [];

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template`);
      setTemplates(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectSrv(() => { carregar(); }, []);

  const handleCriar = async () => {
    if (!novoTitulo.trim()) {
      toast("Título da etapa é obrigatório", "error");
      return;
    }
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template`, {
        method: "POST",
        body: JSON.stringify({
          titulo: novoTitulo,
          descricao: novaDescricao || null,
          prazo_dias: novoPrazoDias ? Number(novoPrazoDias) : null,
        }),
      });
      await carregar();
      setNovoTitulo("");
      setNovaDescricao("");
      setNovoPrazoDias("");
      setNovaAberta(false);
      toast("Etapa-modelo criada", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (template) => {
    if (!confirm(`Excluir a etapa-modelo "${template.titulo}"? Não afeta tarefas já criadas.`)) return;
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template/${template.id}`, { method: "DELETE" });
      await carregar();
      toast("Etapa-modelo excluída", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const handleAbrirAutomacao = (template) => {
    if (automacaoAbertaId === template.id) {
      setAutomacaoAbertaId(null);
      return;
    }
    setAutomacaoAbertaId(template.id);
    setAutomacaoAcao(template.automacao?.acao || "LIBERAR_PROXIMA_ETAPA");
    setAutomacaoColuna(template.automacao?.coluna_destino || "");
  };

  const handleSalvarAutomacao = async (templateId) => {
    if (automacaoAcao === "MOVER_TAREFA_COLUNA" && !automacaoColuna) {
      toast("Selecione a coluna de destino", "error");
      return;
    }
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template/${templateId}/automacao`, {
        method: "PUT",
        body: JSON.stringify({
          acao: automacaoAcao,
          coluna_destino: automacaoAcao === "MOVER_TAREFA_COLUNA" ? automacaoColuna : null,
          ativo: true,
        }),
      });
      await carregar();
      setAutomacaoAbertaId(null);
      toast("Automação configurada", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow"><span>Serviços</span></div>
          <h2 className="modal-title">Etapas do processo — {servico.nome}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 12 }}>
              Esse é o modelo de processo do serviço. Ao abrir um card de Tarefa desse serviço, dá pra puxar essas etapas de uma vez em vez de criar uma por uma.
            </div>

            {loading ? (
              <div style={{ color: "var(--ink-4)" }}>Carregando…</div>
            ) : (
              <div className="etapa-list">
                {templates.length === 0 && (
                  <div style={{ color: "var(--ink-4)", fontSize: 13, marginBottom: 8 }}>nenhuma etapa-modelo cadastrada</div>
                )}
                {templates.map((template) => (
                  <div className="etapa-item" key={template.id}>
                    <div className="etapa-body">
                      <div className="etapa-head">
                        <span className="etapa-titulo">{template.titulo}</span>
                        {template.automacao && template.automacao.ativo && (
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="etapa-icon" title="Tem automação configurada">
                            <path d="M9 1L3 9h4l-1 6 6-8H8z" />
                          </svg>
                        )}
                      </div>
                      {template.descricao && <div className="etapa-desc">{template.descricao}</div>}
                      <div className="etapa-meta">
                        {template.prazo_dias != null && (
                          <span className="etapa-meta-item">prazo: {template.prazo_dias} dia(s) após aplicar</span>
                        )}
                        <button className="etapa-automacao-toggle" onClick={() => handleAbrirAutomacao(template)}>
                          {template.automacao ? "Editar automação" : "+ Configurar automação"}
                        </button>
                        <button className="etapa-automacao-toggle" onClick={() => handleExcluir(template)}>Excluir</button>
                      </div>
                      {automacaoAbertaId === template.id && (
                        <div className="etapa-automacao-form">
                          <select value={automacaoAcao} onChange={(e) => setAutomacaoAcao(e.target.value)}>
                            <option value="LIBERAR_PROXIMA_ETAPA">Liberar próxima etapa</option>
                            <option value="MOVER_TAREFA_COLUNA">Mover tarefa de coluna</option>
                            <option value="MARCAR_TAREFA_CONCLUIDA">Marcar tarefa como Finalizado</option>
                            <option value="CRIAR_ALERTA_RESPONSAVEL">Criar alerta para o responsável</option>
                          </select>
                          {automacaoAcao === "MOVER_TAREFA_COLUNA" && (
                            <select value={automacaoColuna} onChange={(e) => setAutomacaoColuna(e.target.value)} style={{ marginTop: 6 }}>
                              <option value="">Coluna de destino…</option>
                              {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button className="btn btn-envox btn-sm" onClick={() => handleSalvarAutomacao(template.id)} disabled={salvando}>Salvar</button>
                            <button className="btn btn-sm" onClick={() => setAutomacaoAbertaId(null)}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {novaAberta ? (
              <div className="comment-box" style={{ marginTop: 8 }}>
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <input type="text" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Título da etapa" />
                  <textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Descrição (opcional)" style={{ minHeight: 50 }}></textarea>
                  <input
                    type="number"
                    min="0"
                    value={novoPrazoDias}
                    onChange={(e) => setNovoPrazoDias(e.target.value)}
                    placeholder="Prazo em dias após aplicar o processo (opcional)"
                  />
                </div>
                <div className="comment-box-actions" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setNovaAberta(false)}>Cancelar</button>
                  <button className="btn btn-envox btn-sm" onClick={handleCriar} disabled={salvando}>Adicionar etapa</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setNovaAberta(true)}>+ Nova etapa-modelo</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ServicosScreen({ permissao }) {
  const [servicos, setServicos] = useStateSrv([]);
  const [loading, setLoading] = useStateSrv(true);
  const [modalServico, setModalServico] = useStateSrv(null);
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/servicos");
      setServicos(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectSrv(() => { carregar(); }, []);

  const toggleAtivo = async (s) => {
    if (!isAdmin) return;
    try {
      await EnvoxersAPI.api(`/servicos/${s.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !s.ativo }) });
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Serviços"
        subtitle="Catálogo fixo do que a Envox oferece. Editável só por admin — mexer aqui reflete em contratos históricos."
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th className="table-mobile-hide">Slug (interno)</th>
              <th className="table-mobile-hide">Descrição</th>
              <th style={{ width: 80 }}>Ativo</th>
              <th style={{ width: 160 }}>Processo</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5">Carregando…</td></tr>}
            {servicos.map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td>
                <td className="table-mobile-hide"><code>{s.slug}</code></td>
                <td className="table-mobile-hide">{s.descricao}</td>
                <td>
                  <button className="chip" onClick={() => toggleAtivo(s)} disabled={!isAdmin} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {s.ativo ? "Sim" : "Não"}
                  </button>
                </td>
                <td>
                  {isAdmin ? (
                    <button className="btn btn-sm" onClick={() => setModalServico(s)}>Etapas do processo</button>
                  ) : (
                    <span style={{ color: "var(--ink-4)", fontSize: 12 }}>só admin edita</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalServico && <EtapasTemplateModal servico={modalServico} onClose={() => setModalServico(null)} />}
    </div>
  );
}

window.ServicosScreen = ServicosScreen;
