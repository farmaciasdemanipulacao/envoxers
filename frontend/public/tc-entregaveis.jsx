const { useState: useStateEntr, useEffect: useEffectEntr } = React;

const STATUS_ENTR_LABELS = { completo: "Completo", parcial: "Parcial", nao_entregue: "Não entregue", excedente: "Excedente", em_andamento: "Em andamento" };
const STATUS_ENTR_CORES = {
  completo: "var(--farol-verde)", excedente: "var(--farol-verde)", parcial: "var(--farol-amarelo)",
  nao_entregue: "var(--farol-vermelho)", em_andamento: "var(--ink-3)",
};
const STATUS_ALERTA_ENTR_LABELS = { aberto: "Aberto", reconhecido: "Reconhecido", resolvido: "Resolvido", ignorado: "Ignorado" };
const STATUS_ALERTA_ENTR_CORES = {
  aberto: "var(--farol-vermelho)", reconhecido: "var(--farol-amarelo)",
  resolvido: "var(--farol-verde)", ignorado: "var(--ink-4)",
};

function fmtDataEntr(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function EntregaveisScreen({ onAbrirCliente }) {
  const toast = EnvoxersShared.useToast();
  const [painel, setPainel] = useStateEntr([]);
  const [loadingPainel, setLoadingPainel] = useStateEntr(true);
  const [alertas, setAlertas] = useStateEntr([]);
  const [loadingAlertas, setLoadingAlertas] = useStateEntr(true);
  const [filtroAlerta, setFiltroAlerta] = useStateEntr("aberto");
  const [abrindoId, setAbrindoId] = useStateEntr(null);

  const carregarPainel = async () => {
    setLoadingPainel(true);
    try {
      const data = await EnvoxersAPI.api("/entregaveis/painel");
      setPainel(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingPainel(false);
    }
  };

  const carregarAlertas = async () => {
    setLoadingAlertas(true);
    try {
      const params = filtroAlerta !== "todos" ? `?status=${filtroAlerta}` : "";
      const data = await EnvoxersAPI.api(`/alertas-entrega${params}`);
      setAlertas(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingAlertas(false);
    }
  };

  useEffectEntr(() => { carregarPainel(); }, []);
  useEffectEntr(() => { carregarAlertas(); }, [filtroAlerta]);

  const statusOptions = ["todos", "aberto", "reconhecido", "resolvido", "ignorado"];
  const alertaAberto = alertas.find((a) => a.id === abrindoId) || null;
  const comGap = painel.filter((p) => p.itens_com_gap > 0);

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Controle de Entregáveis"
        subtitle="Contratado × entregue por cliente no mês corrente — pra nunca mais precisar recontar no WhatsApp."
      />

      <div style={{ fontWeight: 600, fontSize: 13, margin: "8px 0" }}>
        Clientes com gap este mês {comGap.length > 0 && <span className="pill" style={{ color: "var(--farol-vermelho)", marginLeft: 6 }}>{comGap.length}</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Mês</th>
              <th>Itens com gap</th>
              <th>Total de itens</th>
              <th>Pior status</th>
            </tr>
          </thead>
          <tbody>
            {loadingPainel && <tr><td colSpan="5">Carregando…</td></tr>}
            {!loadingPainel && painel.length === 0 && <tr><td colSpan="5">Nenhum cliente com item de escopo ativo.</td></tr>}
            {!loadingPainel && painel.map((p) => (
              <tr key={p.cliente_id} onClick={() => onAbrirCliente(p.cliente_id)} style={{ cursor: "pointer" }}>
                <td>{p.cliente_nome}</td>
                <td>{p.ano_mes}</td>
                <td>{p.itens_com_gap}</td>
                <td>{p.total_itens}</td>
                <td><span className="pill" style={{ color: STATUS_ENTR_CORES[p.pior_status] }}>{STATUS_ENTR_LABELS[p.pior_status] || p.pior_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 600, fontSize: 13, margin: "24px 0 8px" }}>Alertas de entrega</div>
      <div className="toolbar">
        <div className="filter-group">
          {statusOptions.map((s) => (
            <button key={s} className={"chip" + (filtroAlerta === s ? " active" : "")} onClick={() => setFiltroAlerta(s)}>
              {s === "todos" ? "Todos" : STATUS_ALERTA_ENTR_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="alert-list">
        {loadingAlertas && <div className="empty">Carregando…</div>}
        {!loadingAlertas && alertas.length === 0 && <div className="empty">Nenhum alerta neste filtro.</div>}
        {!loadingAlertas && alertas.map((a) => (
          <div key={a.id} className={"alert-item" + (a.status === "resolvido" ? " resolvido" : "")} onClick={() => setAbrindoId(a.id)} style={{ cursor: "pointer" }}>
            <div className="alert-item-body">
              <div className="alert-item-title">
                {a.cliente_nome}
                <span className="pill" style={{ color: STATUS_ALERTA_ENTR_CORES[a.status], marginLeft: 8 }}>{STATUS_ALERTA_ENTR_LABELS[a.status]}</span>
              </div>
              <div className="alert-item-motivo">{a.motivo_texto}</div>
            </div>
            <div className="alert-item-actions">
              <span className="alert-item-time">{fmtDataEntr(a.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {alertaAberto && (
        <AlertaEntregaModal
          alerta={alertaAberto}
          onClose={() => setAbrindoId(null)}
          onAtualizado={() => carregarAlertas()}
          onAbrirCliente={onAbrirCliente}
        />
      )}
    </div>
  );
}

function AlertaEntregaModal({ alerta, onClose, onAtualizado, onAbrirCliente }) {
  const toast = EnvoxersShared.useToast();
  const [saving, setSaving] = useStateEntr(false);
  const [resolucaoNota, setResolucaoNota] = useStateEntr(alerta.resolucao_nota || "");

  const atualizarStatus = async (novoStatus, extra) => {
    setSaving(true);
    try {
      await EnvoxersAPI.api(`/alertas-entrega/${alerta.id}`, {
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

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">{alerta.item_tipo}{alerta.item_descricao ? ` — ${alerta.item_descricao}` : ""} · {alerta.ano_mes}</div>
          <h2 className="modal-title">{alerta.cliente_nome}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-section-title">Motivo</div>
            <div>{alerta.motivo_texto}</div>

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
              <div className="modal-side-label">Contratado × entregue</div>
              <div className="modal-side-value">{alerta.quantidade_entregue} / {alerta.quantidade_contratada}</div>
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
                <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => onAbrirCliente(alerta.cliente_id)}>
                  Abrir ficha
                </button>
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

window.EntregaveisScreen = EntregaveisScreen;
