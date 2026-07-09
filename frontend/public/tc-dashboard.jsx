const { useState: useStateDash, useEffect: useEffectDash } = React;

function fmtHorasMinDash(totalMin) {
  const min = Math.max(0, Math.floor(totalMin || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

const TAG_EVENTO_DASH = {
  reuniao: { label: "Reunião", cor: "roxo" },
  captacao: { label: "Captação", cor: "amarelo" },
  live: { label: "Live", cor: "vermelho" },
  evento_externo: { label: "Evento externo", cor: "verde" },
  outro: { label: "Outro", cor: "azul" },
};

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

const FAROL_LABELS_DASH = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };
const FAROL_CORES_DASH = { verde: "var(--farol-verde)", amarelo: "var(--farol-amarelo)", vermelho: "var(--farol-vermelho)" };

function DashboardScreen({ dataVersion, onAbrirTarefa, onNavigate }) {
  const [loading, setLoading] = useStateDash(true);
  const [dados, setDados] = useStateDash(null);
  const [resumoFoco, setResumoFoco] = useStateDash(null);
  const [farolWidget, setFarolWidget] = useStateDash([]);
  const [eventosHoje, setEventosHoje] = useStateDash([]);
  const [relatorioRapido, setRelatorioRapido] = useStateDash([]);
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      const [dash, resumo, farol, calendario, relatorio] = await Promise.all([
        EnvoxersAPI.api("/tarefas/dashboard-dia"),
        EnvoxersAPI.api("/foco/resumo"),
        EnvoxersAPI.api("/farol"),
        EnvoxersAPI.api(`/calendario?ano=${hoje.getFullYear()}&mes=${hoje.getMonth() + 1}`),
        EnvoxersAPI.api("/relatorio/tempo-custo?agrupar=cliente&periodo=mes"),
      ]);
      setDados(dash);
      setResumoFoco(resumo);
      setFarolWidget(farol.filter((f) => f.farol !== "verde").slice(0, 5));
      const hojeStr = hoje.toISOString().slice(0, 10);
      setEventosHoje(calendario.filter((ev) => ev.data === hojeStr && ev.tipo !== "tarefa"));
      setRelatorioRapido(relatorio.itens.filter((i) => i.margem_pct != null).slice(0, 4));
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
            <div className="dash-card-title">Em andamento <EnvoxersShared.HelpIcon helpKey="dash_progress" /></div>
            <div className="dash-card-count">{dados.em_andamento.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.em_andamento)}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-vermelho)" }}>Atrasadas <EnvoxersShared.HelpIcon helpKey="dash_late" /></div>
            <div className="dash-card-count" style={{ color: "var(--farol-vermelho)" }}>{dados.atrasadas.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.atrasadas, { atrasada: true })}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-amarelo)" }}>Aprovações pendentes <EnvoxersShared.HelpIcon helpKey="dash_approvals" /></div>
            <div className="dash-card-count" style={{ color: "var(--farol-amarelo)" }}>{dados.aprovacoes_pendentes.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.aprovacoes_pendentes)}</div>
        </div>

        <div className="dash-card full" style={{ gridColumn: "span 12", borderLeft: "3px solid var(--farol-vermelho)" }}>
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-vermelho)" }}>Farol — o que precisa da sua atenção esta semana <EnvoxersShared.HelpIcon helpKey="dash_farol_widget" /></div>
            <a onClick={() => onNavigate("farol")} className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>Ver Farol completo →</a>
          </div>
          {farolWidget.length === 0 ? (
            <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>Nenhum cliente em amarelo/vermelho — tudo saudável.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Cliente</th>
                    <th style={{ width: 90 }}>Score</th>
                    <th className="table-mobile-hide">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {farolWidget.map((f) => (
                    <tr key={f.cliente_id} onClick={() => onNavigate("farol")} style={{ cursor: "pointer" }}>
                      <td><span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: FAROL_CORES_DASH[f.farol] }}></span></td>
                      <td>{f.cliente_nome}</td>
                      <td>{f.health_score}</td>
                      <td className="table-mobile-hide">{f.motivo_texto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="dash-card wide" style={{ gridColumn: "span 12" }}>
          <div className="dash-card-head">
            <div className="dash-card-title">Meu Foco <EnvoxersShared.HelpIcon helpKey="dash_meu_foco" /></div>
          </div>
          <div className="foco-widget">
            <div className="foco-widget-cell">
              <div className="label">Hoje <EnvoxersShared.HelpIcon helpKey="foco_hoje" /></div>
              <div className="value">{fmtHorasMinDash(resumoFoco.hoje_min)}</div>
              <div className="hint">{resumoFoco.hoje_sessoes} sessão(ões) · <span className="mono">{EnvoxersShared.formatMoney(resumoFoco.hoje_custo)}</span> gerados</div>
            </div>
            <div className="foco-widget-cell">
              <div className="label">Esta semana <EnvoxersShared.HelpIcon helpKey="foco_semana" /></div>
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
            <div className="dash-card-title">Vencem nos próximos 3 dias <EnvoxersShared.HelpIcon helpKey="dash_next3" /></div>
            <div className="dash-card-count">{dados.proximas_entregas.length}</div>
          </div>
          <div className="dash-list">{renderLista(dados.proximas_entregas)}</div>
        </div>

        <div className="dash-card wide">
          <div className="dash-card-head">
            <div className="dash-card-title">Captações & eventos de hoje <EnvoxersShared.HelpIcon helpKey="dash_hoje_eventos" /></div>
            <div className="dash-card-count">{eventosHoje.length}</div>
          </div>
          <div className="dash-list">
            {eventosHoje.length === 0 ? (
              <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>— nada agendado pra hoje —</div>
            ) : eventosHoje.map((ev) => {
              const tag = TAG_EVENTO_DASH[ev.tipo] || TAG_EVENTO_DASH.outro;
              return (
                <div key={ev.id} className="dash-item" style={{ cursor: "default" }}>
                  <span className={`tag tag-${tag.cor}`}>{tag.label}</span>
                  <div className="dash-item-title">{ev.cliente_nome ? `${ev.cliente_nome} — ${ev.titulo}` : ev.titulo}</div>
                  <span className="dash-item-meta">{ev.hora || "dia inteiro"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-card full">
          <div className="dash-card-head">
            <div className="dash-card-title">Relatório rápido — Tempo × Custo (últimos 30 dias) <EnvoxersShared.HelpIcon helpKey="dash_rel_rapido" /></div>
            <a onClick={() => onNavigate("relatorio")} className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>Ver relatório completo →</a>
          </div>
          {relatorioRapido.length === 0 ? (
            <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>Sem registros de Foco no período.</div>
          ) : (
            <div className="table-wrap">
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ textAlign: "right" }}>Horas</th>
                    <th style={{ textAlign: "right" }}>Custo horas</th>
                    <th style={{ textAlign: "right" }}>Contrato</th>
                    <th style={{ textAlign: "right" }}>Margem</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorioRapido.map((r) => {
                    const cor = r.margem_pct < 10 ? "vermelho" : r.margem_pct < 20 ? "amarelo" : "verde";
                    const situacao = cor === "vermelho" ? "Crítico" : cor === "amarelo" ? "Atenção" : "Saudável";
                    return (
                      <tr key={r.cliente_id}>
                        <td className="td-primary">{r.cliente_nome}</td>
                        <td className="td-num" style={{ textAlign: "right" }}>{r.horas.toFixed(1)}h</td>
                        <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(r.custo_horas)}</td>
                        <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(r.valor_contrato)}</td>
                        <td className="td-num" style={{ textAlign: "right", color: `var(--farol-${cor})`, fontWeight: 600 }}>{r.margem_pct}%</td>
                        <td><span className={`farol farol-${cor}`}><span className="farol-dot"></span> {situacao}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
