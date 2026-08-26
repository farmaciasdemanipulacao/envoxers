const { useState: useStateSrv, useEffect: useEffectSrv } = React;

function EtapasTemplateModal({ servico, onClose }) {
  const [templates, setTemplates] = useStateSrv([]);
  const [envoxersList, setEnvoxersList] = useStateSrv([]);
  const [loading, setLoading] = useStateSrv(true);
  const [salvando, setSalvando] = useStateSrv(false);
  const [novaAberta, setNovaAberta] = useStateSrv(false);
  const [novoTitulo, setNovoTitulo] = useStateSrv("");
  const [novaDescricao, setNovaDescricao] = useStateSrv("");
  const [novoPrazoDias, setNovoPrazoDias] = useStateSrv("");
  const [novoResponsavel, setNovoResponsavel] = useStateSrv("");
  const [automacaoAbertaId, setAutomacaoAbertaId] = useStateSrv(null);
  const [automacaoAcao, setAutomacaoAcao] = useStateSrv("LIBERAR_PROXIMA_ETAPA");
  const [automacaoColuna, setAutomacaoColuna] = useStateSrv("");
  const [comoFazerTemplate, setComoFazerTemplate] = useStateSrv(null);
  const [dragId, setDragId] = useStateSrv(null);
  const toast = EnvoxersShared.useToast();
  const STATUS_COLS = window.KANBAN_STATUS_COLS || [];

  const carregar = async () => {
    setLoading(true);
    try {
      const [data, envs] = await Promise.all([
        EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template`),
        EnvoxersAPI.api("/envoxers"),
      ]);
      setTemplates(data);
      setEnvoxersList(envs.filter((e) => e.ativo));
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
          responsavel_padrao_envoxer_id: novoResponsavel ? Number(novoResponsavel) : null,
        }),
      });
      await carregar();
      setNovoTitulo("");
      setNovaDescricao("");
      setNovoPrazoDias("");
      setNovoResponsavel("");
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

  const [editandoId, setEditandoId] = useStateSrv(null);
  const [editTitulo, setEditTitulo] = useStateSrv("");
  const [editDescricao, setEditDescricao] = useStateSrv("");
  const [editPrazoDias, setEditPrazoDias] = useStateSrv("");
  const [editResponsavel, setEditResponsavel] = useStateSrv("");

  const handleAbrirEdicao = (template) => {
    setEditandoId(template.id);
    setEditTitulo(template.titulo);
    setEditDescricao(template.descricao || "");
    setEditPrazoDias(template.prazo_dias != null ? String(template.prazo_dias) : "");
    setEditResponsavel(template.responsavel_padrao_envoxer_id ? String(template.responsavel_padrao_envoxer_id) : "");
  };

  const handleSalvarEdicao = async (templateId) => {
    if (!editTitulo.trim()) {
      toast("Título da etapa é obrigatório", "error");
      return;
    }
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          titulo: editTitulo,
          descricao: editDescricao || null,
          prazo_dias: editPrazoDias ? Number(editPrazoDias) : null,
          responsavel_padrao_envoxer_id: editResponsavel ? Number(editResponsavel) : null,
        }),
      });
      setEditandoId(null);
      await carregar();
      toast("Etapa-modelo atualizada", "success");
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

  const handleDragStart = (e, template) => {
    if (salvando) return;
    setDragId(template.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(template.id));
  };

  const handleDragOverItem = (e, template) => {
    e.preventDefault();
    if (dragId === null || dragId === template.id) return;
    setTemplates((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === dragId);
      const toIdx = prev.findIndex((t) => t.id === template.id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [movido] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, movido);
      return next;
    });
  };

  const handleDragEnd = async () => {
    setDragId(null);
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/servicos/${servico.id}/etapas-template/reordenar`, {
        method: "PUT",
        body: JSON.stringify({ ids_em_ordem: templates.map((t) => t.id) }),
      });
    } catch (err) {
      toast(err.message, "error");
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
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
                  <div
                    className={"etapa-item etapa-item-draggable" + (dragId === template.id ? " dragging" : "")}
                    key={template.id}
                    draggable={editandoId !== template.id}
                    onDragStart={(e) => handleDragStart(e, template)}
                    onDragOver={(e) => handleDragOverItem(e, template)}
                    onDrop={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="etapa-drag-handle" title="Arrastar para reordenar">
                      <EnvoxersShared.IconArrastar />
                    </span>
                    <div className="etapa-body">
                      {editandoId === template.id ? (
                        <div className="etapa-automacao-form" style={{ marginTop: 0 }}>
                          <div>
                            <label>Título da etapa</label>
                            <input type="text" value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} placeholder="Ex.: Criar planejamento" />
                          </div>
                          <div>
                            <label>Descrição</label>
                            <textarea value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} placeholder="Opcional"></textarea>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <label>Responsável padrão</label>
                              <select value={editResponsavel} onChange={(e) => setEditResponsavel(e.target.value)}>
                                <option value="">Sem responsável padrão</option>
                                {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label>Prazo (dias após aplicar)</label>
                              <input type="number" min="0" value={editPrazoDias} onChange={(e) => setEditPrazoDias(e.target.value)} placeholder="Opcional" />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-envox btn-sm" onClick={() => handleSalvarEdicao(template.id)} disabled={salvando}>Salvar</button>
                            <button className="btn btn-sm" onClick={() => setEditandoId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                      <div className="etapa-row">
                        <div className="etapa-main">
                          <div className="etapa-head">
                            <span className="etapa-titulo">{template.titulo}</span>
                            {template.automacao && template.automacao.ativo && (
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="etapa-icon" title="Tem automação configurada">
                                <path d="M9 1L3 9h4l-1 6 6-8H8z" />
                              </svg>
                            )}
                          </div>
                          <div className="etapa-meta">
                            {template.responsavel_padrao_nome ? (
                              <span className="etapa-meta-item">
                                <EnvoxersShared.Avatar nome={template.responsavel_padrao_nome} fotoUrl={template.responsavel_padrao_foto} size="sm" className="gray" envoxerId={template.responsavel_padrao_envoxer_id} /> {template.responsavel_padrao_nome}
                              </span>
                            ) : (
                              <span className="etapa-meta-item" style={{ color: "var(--farol-amarelo)" }}>sem responsável</span>
                            )}
                            {template.descricao && (
                              <button className="etapa-automacao-toggle" onClick={() => setComoFazerTemplate(template)}>Como fazer</button>
                            )}
                          </div>
                        </div>
                        <div className="etapa-side">
                          <span className="etapa-prazo-badge neutro">
                            {template.prazo_dias != null ? `${template.prazo_dias}d após aplicar` : "sem prazo"}
                          </span>
                          <div className="etapa-actions">
                            <button className="etapa-icon-btn" title="Editar etapa-modelo" onClick={() => handleAbrirEdicao(template)}>
                              <EnvoxersShared.IconEditar />
                            </button>
                            <button className="etapa-icon-btn" title={template.automacao ? "Editar automação" : "Configurar automação"} onClick={() => handleAbrirAutomacao(template)}>
                              <EnvoxersShared.IconAutomacao />
                            </button>
                            <button className="etapa-icon-btn danger" title="Excluir etapa-modelo" onClick={() => handleExcluir(template)}>
                              <EnvoxersShared.IconExcluir />
                            </button>
                          </div>
                        </div>
                      </div>
                      )}
                      {automacaoAbertaId === template.id && (
                        <div className="etapa-automacao-form">
                          <p className="etapa-automacao-hint">Quando essa etapa for marcada como <strong>concluída</strong> (já dentro de um card), o sistema faz automaticamente:</p>
                          <select value={automacaoAcao} onChange={(e) => setAutomacaoAcao(e.target.value)}>
                            <option value="LIBERAR_PROXIMA_ETAPA">Liberar próxima etapa (que fica bloqueada até aqui)</option>
                            <option value="MOVER_TAREFA_COLUNA">Mover o card pra outra coluna do Kanban</option>
                            <option value="MARCAR_TAREFA_CONCLUIDA">Marcar o card inteiro como Finalizado</option>
                            <option value="CRIAR_ALERTA_RESPONSAVEL">Avisar o responsável da próxima etapa</option>
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
                <div className="comment-box-form">
                  <div className="field">
                    <label>Título da etapa <span className="req">*</span></label>
                    <input type="text" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex.: Criar planejamento" />
                  </div>
                  <div className="field">
                    <label>Descrição <span className="hint">opcional</span></label>
                    <textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Como fazer essa etapa"></textarea>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Responsável padrão <span className="hint">opcional</span></label>
                      <select value={novoResponsavel} onChange={(e) => setNovoResponsavel(e.target.value)}>
                        <option value="">Sem responsável padrão</option>
                        {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Prazo <span className="hint">dias após aplicar</span></label>
                      <input type="number" min="0" value={novoPrazoDias} onChange={(e) => setNovoPrazoDias(e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
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
    {comoFazerTemplate && (
      <EnvoxersShared.ComoFazerModal
        titulo={comoFazerTemplate.titulo}
        descricao={comoFazerTemplate.descricao}
        onClose={() => setComoFazerTemplate(null)}
      />
    )}
    </>
  );
}

function slugify(nome) {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function ExcluirServicoModal({ servico, servicos, onClose, onExcluido }) {
  const [substitutoId, setSubstitutoId] = useStateSrv("");
  const [excluindo, setExcluindo] = useStateSrv(false);
  const toast = EnvoxersShared.useToast();
  const outros = servicos.filter((s) => s.id !== servico.id);

  const handleConfirmar = async () => {
    if (!substitutoId) {
      toast("Selecione pra qual serviço migrar tudo que está vinculado", "error");
      return;
    }
    setExcluindo(true);
    try {
      const resumo = await EnvoxersAPI.api(`/servicos/${servico.id}?substituir_por_id=${substitutoId}`, { method: "DELETE" });
      toast(
        `"${servico.nome}" excluído. Migrado: ${resumo.contratos_migrados} contrato(s), ${resumo.itens_escopo_migrados} item(ns) de escopo, ${resumo.tarefas_migradas} tarefa(s), ${resumo.etapas_modelo_migradas} etapa(s)-modelo.`,
        "success"
      );
      onExcluido();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <div className="modal-eyebrow"><span>Serviços</span></div>
          <h2 className="modal-title">Excluir "{servico.nome}"</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 12 }}>
              Excluir um serviço é definitivo. Pra não perder nada, tudo que está vinculado a "{servico.nome}"
              (contratos de clientes, itens de escopo, cards/tarefas e as etapas do processo) migra automaticamente
              pro serviço que você escolher abaixo.
            </p>
            <div className="field">
              <label>Migrar tudo para <span className="req">*</span></label>
              <select value={substitutoId} onChange={(e) => setSubstitutoId(e.target.value)}>
                <option value="">Selecionar…</option>
                {outros.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={onClose}>Cancelar</button>
              <button className="btn btn-sm" style={{ background: "var(--farol-vermelho)", color: "#fff", borderColor: "var(--farol-vermelho)" }} onClick={handleConfirmar} disabled={excluindo}>
                {excluindo ? "Excluindo…" : "Excluir e migrar"}
              </button>
            </div>
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
  const [excluindoServico, setExcluindoServico] = useStateSrv(null);
  const [criandoAberto, setCriandoAberto] = useStateSrv(false);
  const [novoNome, setNovoNome] = useStateSrv("");
  const [novoSlug, setNovoSlug] = useStateSrv("");
  const [slugEditadoManual, setSlugEditadoManual] = useStateSrv(false);
  const [novaDescricao, setNovaDescricao] = useStateSrv("");
  const [salvandoServico, setSalvandoServico] = useStateSrv(false);
  const [editandoServicoId, setEditandoServicoId] = useStateSrv(null);
  const [editNome, setEditNome] = useStateSrv("");
  const [editDescricao, setEditDescricao] = useStateSrv("");
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin" || permissao === "gestor";

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

  const handleCriarServico = async () => {
    if (!novoNome.trim() || !novoSlug.trim()) {
      toast("Nome e slug são obrigatórios", "error");
      return;
    }
    setSalvandoServico(true);
    try {
      await EnvoxersAPI.api("/servicos", {
        method: "POST",
        body: JSON.stringify({ nome: novoNome, slug: novoSlug, descricao: novaDescricao || null, ativo: true }),
      });
      toast("Serviço criado!", "success");
      setNovoNome(""); setNovoSlug(""); setNovaDescricao(""); setSlugEditadoManual(false); setCriandoAberto(false);
      await carregar();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvandoServico(false);
    }
  };

  const handleAbrirEdicaoServico = (s) => {
    setEditandoServicoId(s.id);
    setEditNome(s.nome);
    setEditDescricao(s.descricao || "");
  };

  const handleSalvarEdicaoServico = async (s) => {
    if (!editNome.trim()) {
      toast("Nome é obrigatório", "error");
      return;
    }
    setSalvandoServico(true);
    try {
      await EnvoxersAPI.api(`/servicos/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nome: editNome, descricao: editDescricao || null }),
      });
      setEditandoServicoId(null);
      await carregar();
      toast("Serviço atualizado!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvandoServico(false);
    }
  };

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Serviços"
        subtitle="Catálogo do que a Envox oferece. Editável por gestor e admin — mexer aqui reflete em contratos históricos."
      />

      {isAdmin && (
        criandoAberto ? (
          <div className="comment-box" style={{ marginBottom: 16, maxWidth: 640 }}>
            <div className="comment-box-form">
              <div className="field">
                <label>Nome do serviço <span className="req">*</span></label>
                <input
                  type="text" value={novoNome}
                  onChange={(e) => {
                    const nome = e.target.value;
                    setNovoNome(nome);
                    if (!slugEditadoManual) setNovoSlug(slugify(nome));
                  }}
                  placeholder="Ex.: Panfletos, Social Ads, Google Ads"
                />
              </div>
              <div className="field">
                <label>Slug (interno) <span className="req">*</span> <span className="hint">gerado do nome, editável</span></label>
                <input
                  type="text" value={novoSlug}
                  onChange={(e) => { setNovoSlug(e.target.value); setSlugEditadoManual(true); }}
                  placeholder="slug_interno"
                />
              </div>
              <div className="field">
                <label>Descrição <span className="hint">opcional</span></label>
                <textarea value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="O que esse serviço cobre"></textarea>
              </div>
            </div>
            <div className="comment-box-actions" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => { setCriandoAberto(false); setNovoNome(""); setNovoSlug(""); setSlugEditadoManual(false); }}>Cancelar</button>
              <button className="btn btn-envox btn-sm" onClick={handleCriarServico} disabled={salvandoServico}>Criar serviço</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-envox" style={{ marginBottom: 16 }} onClick={() => setCriandoAberto(true)}>+ Novo serviço</button>
        )
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th className="table-mobile-hide">Slug (interno)</th>
              <th className="table-mobile-hide">Descrição</th>
              <th style={{ width: 80 }}>Ativo</th>
              <th style={{ width: 340 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5">Carregando…</td></tr>}
            {servicos.map((s) => (
              <tr key={s.id}>
                {editandoServicoId === s.id ? (
                  <>
                    <td colSpan="3">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input className="table-edit-input" type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome" title="Nome" style={{ flex: 1 }} />
                        <input className="table-edit-input" type="text" value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} placeholder="Descrição" title="Descrição" style={{ flex: 1 }} />
                      </div>
                    </td>
                    <td></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm btn-envox" disabled={salvandoServico} onClick={() => handleSalvarEdicaoServico(s)}>Salvar</button>
                        <button className="btn btn-sm" onClick={() => setEditandoServicoId(null)}>Cancelar</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
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
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="btn btn-sm" onClick={() => setModalServico(s)}>Etapas do processo</button>
                          <button className="btn btn-sm" onClick={() => handleAbrirEdicaoServico(s)}>Editar</button>
                          <button className="btn btn-sm" onClick={() => setExcluindoServico(s)}>Excluir</button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>só gestor/admin edita</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalServico && <EtapasTemplateModal servico={modalServico} onClose={() => setModalServico(null)} />}
      {excluindoServico && (
        <ExcluirServicoModal
          servico={excluindoServico}
          servicos={servicos}
          onClose={() => setExcluindoServico(null)}
          onExcluido={() => { setExcluindoServico(null); carregar(); }}
        />
      )}
    </div>
  );
}

window.ServicosScreen = ServicosScreen;
