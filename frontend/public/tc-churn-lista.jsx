const { useState: useStateChurn, useEffect: useEffectChurn, useMemo: useMemoChurn } = React;

const PERFIL_LABELS_CHURN = { facil: "Fácil", neutro: "Neutro", dificil: "Difícil" };

function formatDataCurtaChurn(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

function ChurnListaScreen() {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateChurn([]);
  const [loading, setLoading] = useStateChurn(true);
  const [detalhe, setDetalhe] = useStateChurn(null);

  const [modalAberto, setModalAberto] = useStateChurn(false);
  const [clientesAtivos, setClientesAtivos] = useStateChurn([]);
  const [motivosList, setMotivosList] = useStateChurn([]);
  const [clienteSelecionado, setClienteSelecionado] = useStateChurn("");
  const [dataCancelamento, setDataCancelamento] = useStateChurn("");
  const [motivoCodigo, setMotivoCodigo] = useStateChurn("");
  const [motivoDetalhe, setMotivoDetalhe] = useStateChurn("");
  const [salvando, setSalvando] = useStateChurn(false);

  const carregar = async () => {
    setLoading(true);
    try {
      setItens(await EnvoxersAPI.api("/churn"));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectChurn(() => { carregar(); }, []);

  const kpis = useMemoChurn(() => {
    if (itens.length === 0) return { total: 0, cedo: 0, media: "0.0", topMotivo: "—", topCount: 0 };
    const total = itens.length;
    const cedo = itens.filter((c) => c.meses_de_casa < 6).length;
    const media = (itens.reduce((s, c) => s + c.meses_de_casa, 0) / total).toFixed(1);
    const bucket = {};
    itens.forEach((c) => { bucket[c.motivo_nome || c.motivo_codigo] = (bucket[c.motivo_nome || c.motivo_codigo] || 0) + 1; });
    const [topMotivo, topCount] = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0];
    return { total, cedo, media, topMotivo, topCount };
  }, [itens]);

  const abrirNovoCancelamento = async () => {
    setClienteSelecionado(""); setDataCancelamento(new Date().toISOString().slice(0, 10));
    setMotivoCodigo(""); setMotivoDetalhe("");
    try {
      const [clientes, motivos] = await Promise.all([
        EnvoxersAPI.api("/clientes"),
        EnvoxersAPI.api("/motivos-churn"),
      ]);
      setClientesAtivos(clientes.filter((c) => c.ativo));
      setMotivosList(motivos);
      setModalAberto(true);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const clienteAtivoSelecionado = clientesAtivos.find((c) => String(c.id) === String(clienteSelecionado));

  const confirmarCancelamento = async () => {
    if (!clienteSelecionado) { toast("Selecione um cliente", "error"); return; }
    if (!motivoCodigo) { toast("Selecione o motivo do cancelamento", "error"); return; }
    setSalvando(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteSelecionado}/cancelar`, {
        method: "POST",
        body: JSON.stringify({
          motivo_codigo: motivoCodigo,
          motivo_detalhe: motivoDetalhe || null,
          data_cancelamento: dataCancelamento || null,
        }),
      });
      toast("Cancelamento registrado", "success");
      setModalAberto(false);
      carregar();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="icp-shell">
      <EnvoxersShared.PageHeader
        title="Cancelamentos"
        subtitle="Histórico de churn — cada saída com motivo e snapshot congelado."
        actions={(
          <button className="btn btn-reject" onClick={abrirNovoCancelamento}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            Registrar cancelamento
          </button>
        )}
      />

      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Total no histórico <EnvoxersShared.HelpIcon helpKey="churn_total" /></div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-hint">últimos 24 meses</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Saíram cedo (&lt;6m) <EnvoxersShared.HelpIcon helpKey="churn_cedo" /></div>
          <div className="kpi-value" style={{ color: "var(--farol-vermelho)" }}>{kpis.cedo}</div>
          <div className="kpi-hint">alimentam o anti-ICP</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tempo médio de casa <EnvoxersShared.HelpIcon helpKey="churn_media" /></div>
          <div className="kpi-value">{kpis.media}<span className="unit">m</span></div>
          <div className="kpi-hint">antes do cancelamento</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Motivo top <EnvoxersShared.HelpIcon helpKey="churn_top" /></div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{kpis.topMotivo}</div>
          <div className="kpi-hint">{kpis.topCount ? `${kpis.topCount} cancelamento(s) por este motivo` : "—"}</div>
        </div>
      </div>

      {loading && <div className="app-loading">Carregando…</div>}
      {!loading && itens.length === 0 && (
        <div className="hero-quote">Nenhum cancelamento registrado nos últimos 24 meses.</div>
      )}

      <div>
        {itens.map((c) => {
          const cedo = c.meses_de_casa < 6;
          return (
            <div key={c.id} className="churn-history-item" onClick={() => setDetalhe(c)} style={{ cursor: "pointer" }}>
              <div style={{ width: 60, textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: cedo ? "var(--farol-vermelho)" : "var(--ink)" }}>{c.meses_de_casa}</div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-3)", fontWeight: 600, marginTop: 2 }}>meses</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{c.cliente_nome_snap}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                  {c.segmento_snap || "—"} · canal <strong>{c.canal_aquisicao_snap || "—"}</strong> · ticket {c.ticket_snap != null ? <span className="mono">{EnvoxersShared.formatMoney(c.ticket_snap)}</span> : "sem dado"}
                  {c.perfil_snap && <> · perfil <span className={"perfil-chip " + c.perfil_snap} style={{ padding: "1px 6px", fontSize: 9 }}>{PERFIL_LABELS_CHURN[c.perfil_snap] || c.perfil_snap}</span></>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
                  <strong>Motivo:</strong> {c.motivo_nome || c.motivo_codigo}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={"churn-history-badge " + (cedo ? "cedo" : "normal")}>{cedo ? "Saiu cedo" : "Churn normal"}</span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>{formatDataCurtaChurn(c.data_cancelamento)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {detalhe && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setDetalhe(null); }}>
          <div className="modal">
            <div className="modal-head">
              <div className="modal-eyebrow">Snapshot congelado · {formatDataCurtaChurn(detalhe.data_cancelamento)}</div>
              <h2 className="modal-title">{detalhe.cliente_nome_snap}</h2>
              <button className="modal-close" onClick={() => setDetalhe(null)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-main">
                <div className="modal-section-title">Motivo</div>
                <div>{detalhe.motivo_nome || detalhe.motivo_codigo}</div>
                {detalhe.motivo_detalhe && (
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>{detalhe.motivo_detalhe}</div>
                )}

                <div className="modal-section-title">Dados congelados no momento do cancelamento</div>
                <div className="form-row three" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="modal-side-label">Segmento</div>
                    <div className="modal-side-value">{detalhe.segmento_snap || "—"}</div>
                  </div>
                  <div>
                    <div className="modal-side-label">Canal de aquisição</div>
                    <div className="modal-side-value">{detalhe.canal_aquisicao_snap || "—"}</div>
                  </div>
                  <div>
                    <div className="modal-side-label">Maturidade digital</div>
                    <div className="modal-side-value">{detalhe.maturidade_snap || "—"}</div>
                  </div>
                </div>
                <div className="form-row three">
                  <div>
                    <div className="modal-side-label">Valor de contrato</div>
                    <div className="modal-side-value mono">{EnvoxersShared.formatMoney(detalhe.valor_contrato_snap)}</div>
                  </div>
                  <div>
                    <div className="modal-side-label">Margem média</div>
                    <div className="modal-side-value">{detalhe.margem_media_snap != null ? `${detalhe.margem_media_snap}%` : "sem dado"}</div>
                  </div>
                  <div>
                    <div className="modal-side-label">Pulso médio</div>
                    <div className="modal-side-value">{detalhe.pulso_medio_snap != null ? detalhe.pulso_medio_snap : "sem dado"}</div>
                  </div>
                </div>
              </div>

              <div className="modal-side">
                <div className="modal-side-block">
                  <div className="modal-side-label">Meses de casa</div>
                  <div className="modal-side-value">{detalhe.meses_de_casa}</div>
                </div>
                <div className="modal-side-block">
                  <div className="modal-side-label">Farol no cancelamento</div>
                  <div className="modal-side-value">{detalhe.farol_ultimo_snap || "—"}</div>
                </div>
                <div className="modal-side-block">
                  <div className="modal-side-label">Tipo de receita</div>
                  <div className="modal-side-value">{detalhe.tipo_receita_snap === "recorrente" ? "Recorrente" : "Pontual"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setModalAberto(false); }}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div className="modal-eyebrow"><span style={{ color: "var(--farol-vermelho)" }}>●</span> Cancelamento de cliente</div>
              <h2 className="modal-title">Registrar cancelamento</h2>
              <button className="modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="churn-modal-body">
              <div className="churn-warning">
                <strong>Ação sensível.</strong> Ao confirmar, o cliente é marcado como cancelado, um snapshot congelado dos dados dele é criado, e ele entra no cálculo do anti-ICP. O cliente não some — vira histórico permanente. <EnvoxersShared.HelpIcon helpKey="churn_snapshot" />
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Cliente <span className="req">*</span></label>
                <select value={clienteSelecionado} onChange={(e) => setClienteSelecionado(e.target.value)}>
                  <option value="">Selecionar…</option>
                  {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div className="form-row" style={{ marginBottom: 20 }}>
                <div className="field">
                  <label>Data do cancelamento <span className="req">*</span></label>
                  <input type="date" value={dataCancelamento} onChange={(e) => setDataCancelamento(e.target.value)} />
                </div>
                <div className="field">
                  <label>Meses de casa <span className="hint">calculado</span></label>
                  <input type="text" readOnly style={{ background: "var(--bg-inset)" }} value={clienteAtivoSelecionado?.meses_de_casa != null ? `${clienteAtivoSelecionado.meses_de_casa} meses` : "—"} />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 8 }}>
                <label>Motivo principal <span className="req">*</span> <EnvoxersShared.HelpIcon helpKey="churn_motivo" /></label>
                <div className="field-help" style={{ marginBottom: 8 }}>Selecione o motivo real, o mais próximo possível. Este é o campo que alimenta o ICP builder.</div>
              </div>
              <div className="motivo-grid">
                {motivosList.map((m) => (
                  <div
                    key={m.codigo}
                    className={"motivo-option" + (motivoCodigo === m.codigo ? " selected" : "")}
                    onClick={() => setMotivoCodigo(m.codigo)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="motivo-option-cat">{m.categoria}</div>
                      <div>{m.nome}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="field" style={{ marginTop: 20 }}>
                <label>Detalhes / motivo em texto livre</label>
                <textarea
                  value={motivoDetalhe}
                  onChange={(e) => setMotivoDetalhe(e.target.value)}
                  placeholder="Contexto que ajude a entender depois: quem disse, o que aconteceu, se havia negociação em aberto, etc."
                ></textarea>
              </div>

              <div className="form-footer">
                <span className="save-hint">Snapshot dos dados atuais será congelado ao confirmar.</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setModalAberto(false)}>Cancelar</button>
                  <button className="btn btn-reject" onClick={confirmarCancelamento} disabled={salvando}>
                    {salvando ? "Confirmando…" : "Confirmar cancelamento"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.ChurnListaScreen = ChurnListaScreen;
