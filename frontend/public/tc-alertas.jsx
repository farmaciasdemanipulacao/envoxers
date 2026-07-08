const { useState: useStateAlert, useEffect: useEffectAlert } = React;

const STATUS_ALERTA_LABELS = { aberto: "Aberto", reconhecido: "Reconhecido", resolvido: "Resolvido", ignorado: "Ignorado" };
const STATUS_ALERTA_CORES = {
  aberto: "var(--farol-vermelho)", reconhecido: "var(--farol-amarelo)",
  resolvido: "var(--farol-verde)", ignorado: "var(--ink-4)",
};
const FAROL_LABELS_ALERT = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };
const FAROL_CORES_ALERT = { verde: "var(--farol-verde)", amarelo: "var(--farol-amarelo)", vermelho: "var(--farol-vermelho)" };
const SINAL_LABELS_ALERT = {
  entrega: "Entrega no prazo",
  atrasadas: "Tarefas atrasadas",
  alteracoes: "Alterações acima do limite",
  aprovacoes: "Aprovações paradas",
  pulso: "Pulso de satisfação",
  margem: "Margem",
  silencio: "Silêncio do cliente",
  whatsapp: "Termômetro WhatsApp",
};

function fmtDataAlerta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AlertasScreen({ onAbrirCliente }) {
  const toast = EnvoxersShared.useToast();
  const [alertas, setAlertas] = useStateAlert([]);
  const [loading, setLoading] = useStateAlert(true);
  const [filtro, setFiltro] = useStateAlert("aberto");
  const [abrindoId, setAbrindoId] = useStateAlert(null);
  const [reconhecendoId, setReconhecendoId] = useStateAlert(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const params = filtro !== "todos" ? `?status=${filtro}` : "";
      const data = await EnvoxersAPI.api(`/alertas${params}`);
      setAlertas(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectAlert(() => { carregar(); }, [filtro]);

  const reconhecerInline = async (e, alerta) => {
    e.stopPropagation();
    setReconhecendoId(alerta.id);
    try {
      await EnvoxersAPI.api(`/alertas/${alerta.id}`, { method: "PATCH", body: JSON.stringify({ status: "reconhecido" }) });
      toast("Alerta reconhecido!", "success");
      carregar();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setReconhecendoId(null);
    }
  };

  const abrirFichaInline = (e, alerta) => {
    e.stopPropagation();
    onAbrirCliente(alerta.cliente_id);
  };

  const statusOptions = ["todos", "aberto", "reconhecido", "resolvido", "ignorado"];
  const alertaAberto = alertas.find((a) => a.id === abrindoId) || null;

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Alertas do Farol"
        subtitle="Nascem automaticamente quando o farol calculado de um cliente muda de cor."
      />

      <div className="toolbar">
        <div className="filter-group">
          {statusOptions.map((s) => (
            <button key={s} className={"chip" + (filtro === s ? " active" : "")} onClick={() => setFiltro(s)}>
              {s === "todos" ? "Todos" : STATUS_ALERTA_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="alert-list">
        {loading && <div className="empty">Carregando…</div>}
        {!loading && alertas.length === 0 && <div className="empty">Nenhum alerta neste filtro.</div>}
        {!loading && alertas.map((a) => {
          const score = a.motivo_json?.health_score;
          return (
            <div key={a.id} className={"alert-item " + a.farol_para + (a.status === "resolvido" ? " resolvido" : "")} onClick={() => setAbrindoId(a.id)} style={{ cursor: "pointer" }}>
              <div className="alert-item-icon">
                {a.farol_para === "vermelho" ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2l6 11H2z" /><path d="M8 6v3M8 11v.5" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 11v.5" /></svg>
                )}
              </div>
              <div className="alert-item-body">
                <div className="alert-item-title">
                  {a.cliente_nome}
                  <span style={{ fontWeight: 400, color: "var(--ink-3)", fontSize: 11, marginLeft: 6 }}>
                    <span style={{ color: FAROL_CORES_ALERT[a.farol_de] }}>{FAROL_LABELS_ALERT[a.farol_de]}</span>
                    {" → "}
                    <span style={{ color: FAROL_CORES_ALERT[a.farol_para] }}>{FAROL_LABELS_ALERT[a.farol_para]}</span>
                  </span>
                  {score !== undefined && score !== null && (
                    <span className={"health-orb " + a.farol_para} style={{ width: 22, height: 22, fontSize: 10, borderWidth: 1.5, marginLeft: 8, verticalAlign: "middle" }}>{score}</span>
                  )}
                  <span className="pill" style={{ color: STATUS_ALERTA_CORES[a.status], marginLeft: 8 }}>{STATUS_ALERTA_LABELS[a.status]}</span>
                </div>
                <div className="alert-item-motivo">{a.motivo_texto}</div>
                {a.sugestao_acao && (
                  <div className="alert-item-suggestion">{a.sugestao_acao} <EnvoxersShared.HelpIcon helpKey="alerta_sugestao" /></div>
                )}
              </div>
              <div className="alert-item-actions">
                <span className="alert-item-time">{fmtDataAlerta(a.created_at)}</span>
                {a.status === "aberto" && (
                  <>
                    <button className="btn btn-sm" onClick={(e) => reconhecerInline(e, a)} disabled={reconhecendoId === a.id}>Reconhecer</button>
                    <button className="btn btn-envox btn-sm" onClick={(e) => abrirFichaInline(e, a)}>Abrir ficha</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {alertaAberto && (
        <AlertaModal
          alerta={alertaAberto}
          onClose={() => setAbrindoId(null)}
          onAtualizado={() => carregar()}
        />
      )}
    </div>
  );
}

function AlertaModal({ alerta, onClose, onAtualizado }) {
  const toast = EnvoxersShared.useToast();
  const [saving, setSaving] = useStateAlert(false);
  const [resolucaoNota, setResolucaoNota] = useStateAlert(alerta.resolucao_nota || "");

  const atualizarStatus = async (novoStatus, extra) => {
    setSaving(true);
    try {
      await EnvoxersAPI.api(`/alertas/${alerta.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: novoStatus, ...extra }),
      });
      toast("Alerta atualizado!", "success");
      onAtualizado();
      onClose();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResolver = () => {
    if (!resolucaoNota.trim()) {
      toast("Descreva o que foi feito para resolver o alerta", "error");
      return;
    }
    atualizarStatus("resolvido", { resolucao_nota: resolucaoNota });
  };

  const sinaisVermelhos = alerta.motivo_json?.sinais_vermelhos || [];
  const sinaisAmarelos = alerta.motivo_json?.sinais_amarelos || [];

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">
            <span style={{ color: FAROL_CORES_ALERT[alerta.farol_de] }}>{FAROL_LABELS_ALERT[alerta.farol_de]}</span>
            {" → "}
            <span style={{ color: FAROL_CORES_ALERT[alerta.farol_para] }}>{FAROL_LABELS_ALERT[alerta.farol_para]}</span>
          </div>
          <h2 className="modal-title">{alerta.cliente_nome}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-section-title">Motivo</div>
            <div>{alerta.motivo_texto}</div>

            {sinaisVermelhos.length > 0 && (
              <>
                <div className="modal-section-title">Sinais críticos</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {sinaisVermelhos.map((s) => (
                    <span key={s} className="pill" style={{ color: "var(--farol-vermelho)" }}>{SINAL_LABELS_ALERT[s] || s}</span>
                  ))}
                </div>
              </>
            )}
            {sinaisAmarelos.length > 0 && (
              <>
                <div className="modal-section-title">Sinais de atenção</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {sinaisAmarelos.map((s) => (
                    <span key={s} className="pill" style={{ color: "var(--farol-amarelo)" }}>{SINAL_LABELS_ALERT[s] || s}</span>
                  ))}
                </div>
              </>
            )}

            {alerta.sugestao_acao && (
              <>
                <div className="modal-section-title">Sugestão de ação <EnvoxersShared.HelpIcon helpKey="alerta_sugestao" /></div>
                <div>{alerta.sugestao_acao}</div>
              </>
            )}

            {(alerta.status === "reconhecido" || alerta.status === "aberto") && (
              <>
                <div className="modal-section-title">Nota de resolução <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>(obrigatória para resolver)</span></div>
                <textarea value={resolucaoNota} onChange={(e) => setResolucaoNota(e.target.value)} placeholder="O que foi feito para resolver este alerta…" style={{ width: "100%", minHeight: 70 }}></textarea>
              </>
            )}

            {alerta.status === "resolvido" && alerta.resolucao_nota && (
              <>
                <div className="modal-section-title">Nota de resolução</div>
                <div>{alerta.resolucao_nota}</div>
              </>
            )}
          </div>

          <div className="modal-side">
            <div className="modal-side-block">
              <div className="modal-side-label">Status <EnvoxersShared.HelpIcon helpKey="alerta_status" /></div>
              <div className="modal-side-value" style={{ color: STATUS_ALERTA_CORES[alerta.status] }}>
                {STATUS_ALERTA_LABELS[alerta.status]}
              </div>
            </div>
            {alerta.reconhecido_por_nome && (
              <div className="modal-side-block">
                <div className="modal-side-label">Reconhecido por</div>
                <div className="modal-side-value">{alerta.reconhecido_por_nome}</div>
              </div>
            )}
            <div className="modal-side-block">
              <div className="modal-side-label">Ações</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {alerta.status === "aberto" && (
                  <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => atualizarStatus("reconhecido")} disabled={saving}>
                    Reconhecer
                  </button>
                )}
                {(alerta.status === "aberto" || alerta.status === "reconhecido") && (
                  <>
                    <button className="btn btn-envox btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={handleResolver} disabled={saving}>
                      {saving ? "Salvando…" : "Marcar como resolvido"}
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ width: "100%", justifyContent: "flex-start", color: "var(--ink-4)" }}
                      onClick={() => atualizarStatus("ignorado")}
                      disabled={saving}
                    >
                      Ignorar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AlertasScreen = AlertasScreen;
