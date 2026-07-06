const { useState: useStateDash, useEffect: useEffectDash } = React;

function fmtHorasMinDash(totalMin) {
  const min = Math.max(0, Math.floor(totalMin || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function fmtPrazoDash(prazo) {
  if (!prazo) return "sem prazo";
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + "T00:00:00");
  const dias = Math.round((d - hoje) / 86400000);
  if (dias < 0) return `${Math.abs(dias)}d atrasado`;
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return d.toLocaleDateString("pt-BR");
}

function DashboardScreen({ dataVersion, onAbrirTarefa }) {
  const [loading, setLoading] = useStateDash(true);
  const [dados, setDados] = useStateDash(null);
  const [resumoFoco, setResumoFoco] = useStateDash(null);
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const [dash, resumo] = await Promise.all([
        EnvoxersAPI.api("/tarefas/dashboard-dia"),
        EnvoxersAPI.api("/foco/resumo"),
      ]);
      setDados(dash);
      setResumoFoco(resumo);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectDash(() => { carregar(); }, [dataVersion]);

  const hoje = new Date();
  const dataHoje = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const renderLista = (itens, { atrasada } = {}) => {
    if (!itens || itens.length === 0) {
      return <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>— nada por aqui —</div>;
    }
    return itens.map((item) => (
      <div key={item.id} className={"dash-item" + (atrasada ? " atrasada" : "")} onClick={() => onAbrirTarefa(item.id)}>
        <div className="dash-item-title">{item.cliente_nome} — {item.titulo}</div>
        <span className="dash-item-meta">{fmtPrazoDash(item.prazo)}</span>
      </div>
    ));
  };

  if (loading) {
    return <div className="page"><div className="app-loading">Carregando…</div></div>;
  }

  const semanaPct = resumoFoco && resumoFoco.semana_meta_min > 0
    ? Math.round((resumoFoco.semana_min / resumoFoco.semana_meta_min) * 100)
    : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Dashboard do dia</h1>
          <div className="page-sub">O que precisa acontecer hoje — atrasos, aprovações e o que vence nos próximos 3 dias.</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 500 }}>
          {dataHoje}
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Em andamento</div>
            <div className="dash-card-count">{dados.em_andamento.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.em_andamento)}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-vermelho)" }}>Atrasadas</div>
            <div className="dash-card-count" style={{ color: "var(--farol-vermelho)" }}>{dados.atrasadas.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.atrasadas, { atrasada: true })}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-amarelo)" }}>Aprovações pendentes</div>
            <div className="dash-card-count" style={{ color: "var(--farol-amarelo)" }}>{dados.aprovacoes_pendentes.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.aprovacoes_pendentes)}</div>
        </div>

        <div className="dash-card wide" style={{ gridColumn: "span 12" }}>
          <div className="dash-card-head">
            <div className="dash-card-title">Meu Foco</div>
          </div>
          <div className="foco-widget">
            <div className="foco-widget-cell">
              <div className="label">Hoje</div>
              <div className="value">{fmtHorasMinDash(resumoFoco.hoje_min)}</div>
              <div className="hint">{resumoFoco.hoje_sessoes} sessão(ões) · {EnvoxersShared.formatMoney(resumoFoco.hoje_custo)} gerados</div>
            </div>
            <div className="foco-widget-cell">
              <div className="label">Esta semana</div>
              <div className="value">{fmtHorasMinDash(resumoFoco.semana_min)}</div>
              <div className="hint">meta {fmtHorasMinDash(resumoFoco.semana_meta_min)} · <span style={{ color: semanaPct >= 100 ? "var(--farol-verde)" : "var(--farol-amarelo)", fontWeight: 600 }}>{semanaPct}%</span></div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, fontStyle: "italic", padding: "6px 2px" }}>
            Registre seu Foco para entregarmos melhor e cobrarmos o preço justo.
          </div>
        </div>

        <div className="dash-card wide">
          <div className="dash-card-head">
            <div className="dash-card-title">Vencem nos próximos 3 dias</div>
            <div className="dash-card-count">{dados.proximas_entregas.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.proximas_entregas)}</div>
        </div>
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
