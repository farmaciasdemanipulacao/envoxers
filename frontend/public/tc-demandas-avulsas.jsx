const { useState: useStateAv, useEffect: useEffectAv } = React;

const AV_STATUS = [
  ["nova", "Nova"],
  ["em_andamento", "Em andamento"],
  ["aguardando_terceiro", "Aguardando terceiro"],
  ["concluida", "Concluída"],
];

const AV_PRIORIDADE_LABEL = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

function avFmtDate(v) {
  if (!v) return "Sem data";
  const raw = String(v).slice(0, 10);
  return new Date(raw + "T12:00:00").toLocaleDateString("pt-BR");
}

function avFmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).replace(",", " às");
}

function avFmtFileSize(kb) {
  if (kb == null) return "—";
  if (kb < 1024) return kb + " KB";
  return (kb / 1024).toFixed(kb > 10240 ? 0 : 1) + " MB";
}

function avFmtTimer(seg) {
  const s = Math.max(0, Math.floor(seg || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h,m,ss].map((x) => String(x).padStart(2,"0")).join(":");
}

function avPrazoInfo(item) {
  if (!item?.prazo) return { cls: "neutro", label: "Sem data de entrega" };
  const prazo = new Date(item.prazo + "T12:00:00");
  const hoje = new Date();
  hoje.setHours(12,0,0,0);

  if (item.status === "concluida" && item.concluida_em) {
    const fim = new Date(item.concluida_em);
    fim.setHours(12,0,0,0);
    if (fim > prazo) return { cls: "vermelho", label: "Concluída após o prazo" };
    return { cls: "verde", label: "Concluída no prazo" };
  }

  const dias = Math.round((prazo - hoje) / 86400000);
  if (dias < 0) return { cls: "vermelho", label: Math.abs(dias) + "d atrasado" };
  if (dias === 0) return { cls: "amarelo", label: "Entrega hoje" };
  if (dias === 1) return { cls: "amarelo", label: "Entrega amanhã" };
  if (dias <= 3) return { cls: "amarelo", label: "Entrega em " + dias + " dias" };
  return { cls: "verde", label: dias + " dias de folga" };
}

function avStatusLabel(status) {
  return (AV_STATUS.find(([k]) => k === status) || [null, status])[1];
}

function NovaDemandaAvulsaModal({ pessoas, contextos, permissao, envoxerId, onClose, onSaved }) {
  const toast = EnvoxersShared.useToast();
  const manager = permissao === "admin" || permissao === "gestor";
  const [contexto, setContexto] = useStateAv("");
  const [titulo, setTitulo] = useStateAv("");
  const [descricao, setDescricao] = useStateAv("");
  const [responsavel, setResponsavel] = useStateAv(String(envoxerId || ""));
  const [prazo, setPrazo] = useStateAv("");
  const [prioridade, setPrioridade] = useStateAv("media");
  const [busy, setBusy] = useStateAv(false);

  const salvar = async () => {
    if (!contexto.trim() || !titulo.trim() || busy) return;
    setBusy(true);
    try {
      await EnvoxersAPI.api("/demandas-avulsas", {
        method: "POST",
        body: JSON.stringify({
          contexto: contexto.trim(),
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          responsavel_envoxer_id: responsavel ? Number(responsavel) : null,
          prazo: prazo || null,
          prioridade,
        }),
      });
      toast("Demanda criada", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal avulsa-create-modal">
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Operação / Demandas avulsas</div>
            <h2 className="modal-title">Nova demanda avulsa</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="avulsa-create-body">
          <div className="avulsa-form-intro">
            Cadastre só o essencial. Comentários, checklist, histórico e execução ficam na ficha da demanda depois de criada.
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Contexto <span className="req">*</span></label>
              <input list="avulsa-contextos" value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: Secovi, Hyven, Envox, Jurídico…" />
              <datalist id="avulsa-contextos">{contextos.map((x) => <option value={x} key={x} />)}</datalist>
            </div>
            <div className="field">
              <label>Prioridade</label>
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Título <span className="req">*</span></label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>

          <div className="field">
            <label>Descrição</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} placeholder="Detalhes, links, resultado esperado…" />
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Responsável</label>
              {manager ? (
                <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {pessoas.map((x) => <option value={x.id} key={x.id}>{x.nome}</option>)}
                </select>
              ) : (
                <input value={(pessoas.find((x) => String(x.id) === String(responsavel)) || {}).nome || "Você"} disabled />
              )}
            </div>
            <div className="field">
              <label>Data de entrega</label>
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1 }}></div>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-envox" onClick={salvar} disabled={busy || !contexto.trim() || !titulo.trim()}>
            {busy ? "Criando…" : "Criar demanda"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DemandaAvulsaDetalheModal({
  item,
  pessoas,
  permissao,
  envoxerId,
  focoAtivo,
  focoElapsed,
  onIniciarFoco,
  onPausarFoco,
  onFinalizarFoco,
  onClose,
  onChanged,
}) {
  const toast = EnvoxersShared.useToast();
  const manager = permissao === "admin" || permissao === "gestor";
  const [detalhe, setDetalhe] = useStateAv(item);
  const [loading, setLoading] = useStateAv(true);
  const [comentario, setComentario] = useStateAv("");
  const [novoCheck, setNovoCheck] = useStateAv("");
  const [busy, setBusy] = useStateAv(false);
  const [editando, setEditando] = useStateAv(false);
  const [form, setForm] = useStateAv({});
  const [anexoUploading, setAnexoUploading] = useStateAv(false);
  const [anexoProgresso, setAnexoProgresso] = useStateAv(0);
  const [anexoNome, setAnexoNome] = useStateAv("");
  const [anexoDragAtivo, setAnexoDragAtivo] = useStateAv(false);
  const [anexoEditandoUrl, setAnexoEditandoUrl] = useStateAv("");
  const [anexoEditNome, setAnexoEditNome] = useStateAv("");
  const [anexoAcao, setAnexoAcao] = useStateAv("");

  const focoAqui =
    focoAtivo &&
    focoAtivo.origem === "avulsa" &&
    Number(focoAtivo.demanda_avulsa_id) === Number(item.id);
  const outroFoco = focoAtivo && !focoAqui;
  const expandido = detalhe?.status === "concluida" || !!focoAqui;
  const podeStatus = manager || Number(detalhe?.responsavel_envoxer_id) === Number(envoxerId);

  const aplicarDetalhe = (d) => {
    setDetalhe(d);
    setForm({
      contexto: d.contexto || "",
      titulo: d.titulo || "",
      descricao: d.descricao || "",
      responsavel_envoxer_id: d.responsavel_envoxer_id ? String(d.responsavel_envoxer_id) : "",
      prazo: d.prazo || "",
      prioridade: d.prioridade || "media",
      status: d.status || "nova",
    });
  };

  const carregar = async () => {
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id);
      aplicarDetalhe(d);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectAv(() => { carregar(); }, [item.id]);

  const iniciarFoco = async () => {
    if (outroFoco) {
      toast("Finalize o Foco atual antes de iniciar esta demanda.", "error");
      return;
    }
    try {
      await onIniciarFoco(item.id);
    } catch (_) {}
  };

  const atualizar = async (body, success) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      aplicarDetalhe(d);
      if (success) toast(success, "success");
      if (onChanged) onChanged(d);
      return d;
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const salvarEdicao = async () => {
    if (!manager || !form.contexto.trim() || !form.titulo.trim()) return;
    const d = await atualizar({
      contexto: form.contexto.trim(),
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      responsavel_envoxer_id: form.responsavel_envoxer_id ? Number(form.responsavel_envoxer_id) : null,
      prazo: form.prazo || null,
      prioridade: form.prioridade,
      status: form.status,
    }, "Demanda atualizada");
    if (d) setEditando(false);
  };

  const mudarStatus = async (status) => {
    if (!podeStatus || status === detalhe.status) return;
    await atualizar({ status }, "Status atualizado");
  };

  const adicionarComentario = async () => {
    if (!comentario.trim() || busy) return;
    setBusy(true);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id + "/comentarios", {
        method: "POST",
        body: JSON.stringify({ texto: comentario.trim() }),
      });
      aplicarDetalhe(d);
      setComentario("");
      if (onChanged) onChanged(d);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const adicionarCheck = async () => {
    if (!novoCheck.trim() || busy) return;
    setBusy(true);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id + "/checklist", {
        method: "POST",
        body: JSON.stringify({ titulo: novoCheck.trim() }),
      });
      aplicarDetalhe(d);
      setNovoCheck("");
      if (onChanged) onChanged(d);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleCheck = async (check) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id + "/checklist/" + check.id, {
        method: "PATCH",
        body: JSON.stringify({ concluido: !check.concluido }),
      });
      aplicarDetalhe(d);
      if (onChanged) onChanged(d);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const excluirCheck = async (check) => {
    if (!confirm('Excluir "' + check.titulo + '" do checklist?') || busy) return;
    setBusy(true);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id + "/checklist/" + check.id, { method: "DELETE" });
      aplicarDetalhe(d);
      if (onChanged) onChanged(d);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const enviarAnexoArquivo = async (file) => {
    if (!file || anexoUploading) return;
    setAnexoUploading(true);
    setAnexoProgresso(0);
    setAnexoNome(file.name || "arquivo");
    try {
      const d = await EnvoxersAPI.uploadWithProgress(
        "/demandas-avulsas/" + item.id + "/anexos",
        file,
        file.name,
        (pct) => setAnexoProgresso(pct)
      );
      aplicarDetalhe(d);
      if (onChanged) onChanged(d);
      toast("Arquivo anexado!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoUploading(false);
      setAnexoProgresso(0);
      setAnexoNome("");
    }
  };

  const handleUploadAnexo = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await enviarAnexoArquivo(file);
    e.target.value = "";
  };

  const handleDropAnexo = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAnexoDragAtivo(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) await enviarAnexoArquivo(file);
  };

  const renomearAnexo = async (anexo) => {
    const nome = anexoEditNome.trim();
    if (!nome || anexoAcao) return;
    setAnexoAcao(anexo.url);
    try {
      const d = await EnvoxersAPI.api("/demandas-avulsas/" + item.id + "/anexos", {
        method: "PATCH",
        body: JSON.stringify({ url: anexo.url, nome }),
      });
      aplicarDetalhe(d);
      setAnexoEditandoUrl("");
      setAnexoEditNome("");
      if (onChanged) onChanged(d);
      toast("Arquivo renomeado", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoAcao("");
    }
  };

  const excluirAnexo = async (anexo) => {
    if (!manager || !confirm('Excluir "' + anexo.nome + '" definitivamente?')) return;
    setAnexoAcao(anexo.url);
    try {
      const d = await EnvoxersAPI.api(
        "/demandas-avulsas/" + item.id + "/anexos?url=" + encodeURIComponent(anexo.url),
        { method: "DELETE" }
      );
      aplicarDetalhe(d);
      if (onChanged) onChanged(d);
      toast("Arquivo excluído", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoAcao("");
    }
  };

  const excluirDemanda = async () => {
    if (!manager || !confirm("Excluir esta demanda avulsa definitivamente?")) return;
    try {
      await EnvoxersAPI.api("/demandas-avulsas/" + item.id, { method: "DELETE" });
      toast("Demanda excluída", "success");
      onChanged(null, true);
      onClose();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (!detalhe) return null;
  const prazoInfo = avPrazoInfo(detalhe);
  const checksConcluidos = (detalhe.checklist || []).filter((x) => x.concluido).length;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal avulsa-detail-modal">
        <div className="modal-head avulsa-detail-head">
          <div>
            <div className="modal-eyebrow">
              <span>Operação / Demanda avulsa</span>
              <span className={"avulsa-prioridade " + detalhe.prioridade}>{AV_PRIORIDADE_LABEL[detalhe.prioridade]}</span>
              {detalhe.alerta_alteracoes && (
                <span className="avulsa-change-alert">Prazo alterado {detalhe.qtd_alteracoes_prazo}x</span>
              )}
            </div>
            <h2 className="modal-title">{detalhe.titulo}</h2>
            <div className="avulsa-detail-context">{detalhe.contexto}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="avulsa-detail-body">
          {loading ? (
            <div className="empty">Carregando demanda…</div>
          ) : (
            <>
              <section className={"avulsa-summary prazo-" + prazoInfo.cls}>
                <div className="avulsa-summary-grid">
                  <div><span>Contexto</span><strong>{detalhe.contexto}</strong></div>
                  <div><span>Prioridade</span><strong>{AV_PRIORIDADE_LABEL[detalhe.prioridade]}</strong></div>
                  <div><span>Responsável</span><strong>{detalhe.responsavel_nome || "Sem responsável"}</strong></div>
                  <div><span>Cadastro</span><strong>{avFmtDate(detalhe.created_at)}</strong></div>
                  <div><span>Entrega</span><strong>{avFmtDate(detalhe.prazo)}</strong></div>
                  <div><span>Status</span><strong>{avStatusLabel(detalhe.status)}</strong></div>
                </div>
                <div className={"avulsa-deadline-badge " + prazoInfo.cls}>{prazoInfo.label}</div>
              </section>

              {detalhe.alerta_alteracoes && (
                <div className="avulsa-audit-alert">
                  <strong>Atenção de auditoria</strong>
                  O prazo desta demanda já foi alterado <b>{detalhe.qtd_alteracoes_prazo} vezes</b>. Todas as mudanças estão registradas no histórico abaixo.
                </div>
              )}

              <section className={"avulsa-focus-gate" + (focoAqui ? " active" : "")}>
                {detalhe.status === "concluida" ? (
                  <div>
                    <strong>Demanda concluída</strong>
                    <span>Os detalhes permanecem disponíveis para consulta e auditoria.</span>
                  </div>
                ) : focoAqui ? (
                  <>
                    <div>
                      <strong>Foco ativo</strong>
                      <span className="avulsa-focus-time">{avFmtTimer(focoElapsed)}</span>
                    </div>
                    <div className="avulsa-focus-actions">
                      <button className="btn btn-sm" onClick={onPausarFoco}>{focoAtivo.pausado_em ? "Retomar" : "Pausar"}</button>
                      <button className="btn btn-sm stop" onClick={onFinalizarFoco}>Finalizar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>Ative o Foco para trabalhar nesta demanda</strong>
                      <span>Descrição, checklist, comentários e histórico operacional são liberados com o timer ativo.</span>
                    </div>
                    <button className="btn btn-envox" onClick={iniciarFoco} disabled={!!outroFoco}>
                      ▶ Iniciar foco e abrir
                    </button>
                  </>
                )}
              </section>

              {expandido && (
                <div className="avulsa-workspace">
                  <section className="avulsa-work-block">
                    <div className="avulsa-work-head">
                      <div><h3>Descrição</h3><p>Contexto completo para execução.</p></div>
                      {manager && !editando && <button className="btn btn-sm" onClick={() => setEditando(true)}>Editar dados</button>}
                    </div>

                    {editando ? (
                      <div className="avulsa-edit-panel">
                        <div className="form-grid">
                          <div className="field">
                            <label>Contexto</label>
                            <input value={form.contexto} onChange={(e) => setForm({...form, contexto:e.target.value})} />
                          </div>
                          <div className="field">
                            <label>Prioridade</label>
                            <select value={form.prioridade} onChange={(e) => setForm({...form, prioridade:e.target.value})}>
                              <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
                            </select>
                          </div>
                        </div>
                        <div className="field">
                          <label>Título</label>
                          <input value={form.titulo} onChange={(e) => setForm({...form, titulo:e.target.value})} />
                        </div>
                        <div className="field">
                          <label>Descrição</label>
                          <textarea rows={4} value={form.descricao} onChange={(e) => setForm({...form, descricao:e.target.value})} />
                        </div>
                        <div className="form-grid">
                          <div className="field">
                            <label>Responsável</label>
                            <select value={form.responsavel_envoxer_id} onChange={(e) => setForm({...form, responsavel_envoxer_id:e.target.value})}>
                              <option value="">Sem responsável</option>
                              {pessoas.map((x) => <option value={x.id} key={x.id}>{x.nome}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Data de entrega</label>
                            <input type="date" value={form.prazo} onChange={(e) => setForm({...form, prazo:e.target.value})} />
                          </div>
                        </div>
                        <div className="field">
                          <label>Status</label>
                          <select value={form.status} onChange={(e) => setForm({...form, status:e.target.value})}>
                            {AV_STATUS.map(([k,l]) => <option value={k} key={k}>{l}</option>)}
                          </select>
                        </div>
                        <div className="avulsa-edit-actions">
                          <button className="btn" onClick={() => { setEditando(false); aplicarDetalhe(detalhe); }}>Cancelar</button>
                          <button className="btn btn-envox" onClick={salvarEdicao} disabled={busy}>Salvar alterações</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="avulsa-description">{detalhe.descricao || "Sem descrição adicional."}</div>
                        {!manager && podeStatus && (
                          <div className="avulsa-status-inline">
                            <label>Status</label>
                            <select value={detalhe.status} onChange={(e) => mudarStatus(e.target.value)} disabled={busy}>
                              {AV_STATUS.map(([k,l]) => <option value={k} key={k}>{l}</option>)}
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="avulsa-work-block">
                    <div className="avulsa-work-head">
                      <div>
                        <h3>Arquivos</h3>
                        <p>{(detalhe.anexos || []).length} arquivo(s) anexado(s) · até 250 MB por arquivo</p>
                      </div>
                    </div>

                    {(detalhe.anexos || []).length > 0 && (
                      <div className="attach-managed-list avulsa-attach-list">
                        {(detalhe.anexos || []).map((a) => {
                          const editandoAnexo = anexoEditandoUrl === a.url;
                          return (
                            <div className="attach-managed-row" key={a.url}>
                              <div className="avulsa-attach-icon">↗</div>
                              <div className="avulsa-attach-main">
                                {editandoAnexo ? (
                                  <input
                                    className="attach-rename-input"
                                    value={anexoEditNome}
                                    onChange={(e) => setAnexoEditNome(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && renomearAnexo(a)}
                                    autoFocus
                                  />
                                ) : (
                                  <a className="attach-managed-name" href={a.url} target="_blank" rel="noreferrer">{a.nome}</a>
                                )}
                                <div className="avulsa-attach-meta">
                                  <span>{avFmtFileSize(a.tamanho_kb)}</span>
                                  <span>{avFmtDateTime(a.criado_em)}</span>
                                  {a.enviado_por_nome && <span>{a.enviado_por_nome}</span>}
                                </div>
                              </div>
                              <div className="attach-managed-actions">
                                {editandoAnexo ? (
                                  <>
                                    <button className="attach-action-btn" disabled={!anexoEditNome.trim() || anexoAcao === a.url} onClick={() => renomearAnexo(a)}>Salvar</button>
                                    <button className="attach-action-btn" onClick={() => { setAnexoEditandoUrl(""); setAnexoEditNome(""); }}>Cancelar</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="attach-action-btn" onClick={() => { setAnexoEditandoUrl(a.url); setAnexoEditNome(a.nome || ""); }}>Renomear</button>
                                    {manager && <button className="attach-action-btn danger" disabled={anexoAcao === a.url} onClick={() => excluirAnexo(a)}>Excluir</button>}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      className={"attach-dropzone avulsa-attach-dropzone" + (anexoDragAtivo ? " drag-active" : "") + (anexoUploading ? " uploading" : "")}
                      onDragEnter={(e) => { e.preventDefault(); setAnexoDragAtivo(true); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setAnexoDragAtivo(true); }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        if (!e.currentTarget.contains(e.relatedTarget)) setAnexoDragAtivo(false);
                      }}
                      onDrop={handleDropAnexo}
                    >
                      {anexoUploading ? (
                        <>
                          <div className="attach-dropzone-title">Enviando {anexoNome}</div>
                          <div className="attach-progress-track">
                            <div className="attach-progress-bar" style={{ width: String(anexoProgresso) + "%" }}></div>
                          </div>
                          <div className="attach-progress-label">{anexoProgresso}%</div>
                        </>
                      ) : (
                        <>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4h16v-4"/></svg>
                          <div className="attach-dropzone-title">Arraste arquivos para cá</div>
                          <div className="attach-dropzone-sub">ou clique para escolher · múltiplos arquivos · até 250 MB cada</div>
                          <label className="btn btn-sm attach-dropzone-button">
                            Escolher arquivos
                            <input type="file" multiple style={{ display: "none" }} onChange={handleUploadAnexo} disabled={anexoUploading} />
                          </label>
                        </>
                      )}
                    </div>
                  </section>

                  <section className="avulsa-work-block">
                    <div className="avulsa-work-head">
                      <div>
                        <h3>Checklist</h3>
                        <p>{checksConcluidos}/{(detalhe.checklist || []).length} concluídos</p>
                      </div>
                    </div>
                    <div className="avulsa-check-add">
                      <input value={novoCheck} onChange={(e) => setNovoCheck(e.target.value)} placeholder="Adicionar etapa rápida…" onKeyDown={(e) => e.key === "Enter" && adicionarCheck()} />
                      <button className="btn btn-sm" onClick={adicionarCheck} disabled={busy || !novoCheck.trim()}>+ Adicionar</button>
                    </div>
                    <div className="avulsa-check-list">
                      {(detalhe.checklist || []).map((check) => (
                        <div className={"avulsa-check-item" + (check.concluido ? " done" : "")} key={check.id}>
                          <input type="checkbox" checked={!!check.concluido} onChange={() => toggleCheck(check)} disabled={busy} />
                          <div>
                            <strong>{check.titulo}</strong>
                            <span>{check.concluido ? "Concluído por " + (check.concluido_por_nome || "—") : "Pendente"}</span>
                          </div>
                          <button className="avulsa-check-delete" onClick={() => excluirCheck(check)} title="Excluir">×</button>
                        </div>
                      ))}
                      {(detalhe.checklist || []).length === 0 && <div className="avulsa-inline-empty">Nenhum item no checklist.</div>}
                    </div>
                  </section>

                  <section className="avulsa-work-block">
                    <div className="avulsa-work-head">
                      <div><h3>Comentários</h3><p>Registro da conversa operacional desta demanda.</p></div>
                    </div>
                    <div className="avulsa-comment-add">
                      <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escreva um comentário…" />
                      <button className="btn btn-envox btn-sm" onClick={adicionarComentario} disabled={busy || !comentario.trim()}>Comentar</button>
                    </div>
                    <div className="avulsa-comments">
                      {(detalhe.comentarios || []).map((c) => (
                        <div className="avulsa-comment" key={c.id}>
                          <div className="avulsa-comment-head">
                            <strong>{c.envoxer_nome}</strong>
                            <span>{avFmtDateTime(c.criado_em)}</span>
                          </div>
                          <p>{c.texto}</p>
                        </div>
                      ))}
                      {(detalhe.comentarios || []).length === 0 && <div className="avulsa-inline-empty">Nenhum comentário ainda.</div>}
                    </div>
                  </section>

                  <section className="avulsa-work-block avulsa-history-block">
                    <div className="avulsa-work-head">
                      <div><h3>Histórico de mudanças</h3><p>Registro permanente para revisão e auditoria.</p></div>
                    </div>
                    <div className="avulsa-history">
                      {(detalhe.historico || []).map((h) => (
                        <div className="avulsa-history-item" key={h.id}>
                          <div className="avulsa-history-dot"></div>
                          <div className="avulsa-history-main">
                            <div className="avulsa-history-head">
                              <strong>{h.descricao}</strong>
                              <span>{avFmtDateTime(h.criado_em)}</span>
                            </div>
                            <div className="avulsa-history-author">{h.autor_nome || "Sistema"}</div>
                            {(h.alteracoes || []).map((a, i) => (
                              <div className={"avulsa-history-change" + (a.campo === "prazo" ? " deadline" : "")} key={i}>
                                <b>{a.label}</b>
                                <span>{a.de}</span>
                                <span className="avulsa-history-arrow">→</span>
                                <span>{a.para}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {(detalhe.historico || []).length === 0 && <div className="avulsa-inline-empty">O histórico detalhado começa a partir desta atualização do sistema.</div>}
                    </div>
                  </section>

                  {manager && (
                    <section className="avulsa-danger-zone">
                      <button className="btn danger-ghost" onClick={excluirDemanda}>Excluir demanda</button>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DemandasAvulsasScreen({ permissao, envoxerId, focoAtivo, focoElapsed, onIniciarFoco, onPausarFoco, onFinalizarFoco }) {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateAv(null);
  const [pessoas, setPessoas] = useStateAv([]);
  const [novaAberta, setNovaAberta] = useStateAv(false);
  const [aberta, setAberta] = useStateAv(null);
  const [dragId, setDragId] = useStateAv(null);
  const manager = permissao === "admin" || permissao === "gestor";

  const carregar = async () => {
    try {
      const [ds, es] = await Promise.all([
        EnvoxersAPI.api("/demandas-avulsas"),
        EnvoxersAPI.api("/envoxers"),
      ]);
      setItens(ds);
      setPessoas(es.filter((x) => x.ativo));
      if (aberta) {
        const atualizada = ds.find((x) => x.id === aberta.id);
        if (atualizada) setAberta(atualizada);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectAv(() => { carregar(); }, []);

  const mudarStatus = async (id, status) => {
    try {
      await EnvoxersAPI.api("/demandas-avulsas/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const drop = async (status) => {
    if (!dragId) return;
    const item = (itens || []).find((x) => x.id === dragId);
    const pode = manager || Number(item?.responsavel_envoxer_id) === Number(envoxerId);
    setDragId(null);
    if (!item || !pode || item.status === status) return;
    await mudarStatus(item.id, status);
  };

  const itemChanged = async (d, removido = false) => {
    if (removido) setAberta(null);
    else if (d) setAberta(d);
    await carregar();
  };

  if (itens === null) return <div className="page"><div className="empty">Carregando demandas avulsas…</div></div>;
  const contextos = Array.from(new Set(itens.map((x) => x.contexto))).sort();
  const comAlerta = itens.filter((x) => x.alerta_alteracoes && x.status !== "concluida");

  return (
    <div className="page avulsa-page">
      <EnvoxersShared.PageHeader
        title="Demandas avulsas"
        subtitle="Trabalho fora do escopo recorrente, com Foco, checklist e trilha completa de auditoria."
        actions={<button className="btn btn-envox" onClick={() => setNovaAberta(true)}>+ Nova demanda</button>}
      />

      {comAlerta.length > 0 && (
        <div className="avulsa-page-alert">
          <div className="avulsa-page-alert-icon">!</div>
          <div>
            <strong>{comAlerta.length} {comAlerta.length === 1 ? "demanda está" : "demandas estão"} com reincidência de alteração de prazo</strong>
            <span>O sistema sinaliza automaticamente quando a data de entrega foi alterada mais de 2 vezes.</span>
          </div>
        </div>
      )}

      <div className="avulsa-kanban">
        {AV_STATUS.map(([statusKey, label]) => {
          const coluna = itens.filter((x) => x.status === statusKey);
          return (
            <section className={"avulsa-column status-" + statusKey} key={statusKey} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(statusKey)}>
              <div className="avulsa-column-head"><strong>{label}</strong><span>{coluna.length}</span></div>
              <div className="avulsa-column-body">
                {coluna.map((item) => {
                  const focoAqui = focoAtivo && focoAtivo.origem === "avulsa" && Number(focoAtivo.demanda_avulsa_id) === Number(item.id);
                  const podeStatus = manager || Number(item.responsavel_envoxer_id) === Number(envoxerId);
                  const prazoInfo = avPrazoInfo(item);
                  return (
                    <article
                      className={"avulsa-card prazo-" + prazoInfo.cls}
                      key={item.id}
                      draggable={podeStatus}
                      onDragStart={() => setDragId(item.id)}
                      onClick={() => setAberta(item)}
                    >
                      <div className="avulsa-card-top">
                        <span className="avulsa-contexto">{item.contexto}</span>
                        <span className={"avulsa-prioridade " + item.prioridade}>{AV_PRIORIDADE_LABEL[item.prioridade]}</span>
                      </div>

                      <h3>{item.titulo}</h3>

                      <div className="avulsa-card-info">
                        <div><span>Responsável</span><strong>{item.responsavel_nome || "Sem responsável"}</strong></div>
                        <div><span>Cadastro</span><strong>{avFmtDate(item.created_at)}</strong></div>
                        <div><span>Entrega</span><strong>{avFmtDate(item.prazo)}</strong></div>
                      </div>

                      <div className={"avulsa-card-deadline " + prazoInfo.cls}>{prazoInfo.label}</div>

                      {item.alerta_alteracoes && (
                        <div className="avulsa-card-change-warning">⚠ Prazo alterado {item.qtd_alteracoes_prazo}x</div>
                      )}

                      <div className="avulsa-card-footer">
                        <span>{(item.checklist || []).filter((x) => x.concluido).length}/{(item.checklist || []).length} checklist</span>
                        <span>{(item.comentarios || []).length} comentários</span>
                        {(item.anexos || []).length > 0 && <span>📎 {(item.anexos || []).length}</span>}
                        {focoAqui && <strong className="avulsa-card-focus-live">● {avFmtTimer(focoElapsed)}</strong>}
                      </div>
                    </article>
                  );
                })}
                {coluna.length === 0 && <div className="avulsa-empty">Sem demandas</div>}
              </div>
            </section>
          );
        })}
      </div>

      {novaAberta && (
        <NovaDemandaAvulsaModal
          pessoas={pessoas}
          contextos={contextos}
          permissao={permissao}
          envoxerId={envoxerId}
          onClose={() => setNovaAberta(false)}
          onSaved={() => { setNovaAberta(false); carregar(); }}
        />
      )}

      {aberta && (
        <DemandaAvulsaDetalheModal
          item={aberta}
          pessoas={pessoas}
          permissao={permissao}
          envoxerId={envoxerId}
          focoAtivo={focoAtivo}
          focoElapsed={focoElapsed}
          onIniciarFoco={onIniciarFoco}
          onPausarFoco={onPausarFoco}
          onFinalizarFoco={onFinalizarFoco}
          onClose={() => setAberta(null)}
          onChanged={itemChanged}
        />
      )}
    </div>
  );
}

window.DemandasAvulsasScreen = DemandasAvulsasScreen;
