const { useState: useStateFat, useEffect: useEffectFat } = React;

const MESES_ABREV_FAT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function mesLabelFat(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  return MESES_ABREV_FAT[mes - 1] + "/" + String(ano).slice(2);
}

const MRR_CHART_ALTURA_PX = 180; // bate com ".mrr-bars { height: 180px }" (envox-tokens.css) —
// necessário calcular em px porque .mrr-bar-col não estica pra altura total do
// container (align-items: flex-end), então uma altura em % no filho colapsa.

function FaturamentoMrrChart({ historico }) {
  const maxVal = Math.max(1, ...historico.map((h) => h.valor));
  return (
    <div className="mrr-chart">
      <div className="mrr-chart-title">
        <span>MRR — últimos 12 meses + projeção 90d <EnvoxersShared.HelpIcon helpKey="fat_mrr_chart" /></span>
        <span>■ MRR fechado &nbsp; ■ Mês atual &nbsp; ⬚ Projeção</span>
      </div>
      <div className="mrr-bars">
        {historico.map((h, i) => {
          const h_px = Math.max((h.valor / maxVal) * MRR_CHART_ALTURA_PX, 2);
          const cls = h.tipo === "atual" ? "current" : h.tipo === "projetado" ? "projected" : "";
          const mostrarValor = h.tipo === "atual" || i === historico.length - 1;
          return (
            <div className="mrr-bar-col" key={h.ano_mes} title={`${mesLabelFat(h.ano_mes)}: ${EnvoxersShared.formatMoney(h.valor)}`}>
              <div className={`mrr-bar ${cls}`} style={{ height: `${h_px}px` }}>
                {mostrarValor && <span className="mrr-bar-value">{EnvoxersShared.formatMoney(h.valor)}</span>}
              </div>
              <div className="mrr-bar-label">{mesLabelFat(h.ano_mes)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaturamentoConcentracao({ concentracao }) {
  if (concentracao.length === 0) {
    return (
      <div className="mrr-chart">
        <div className="mrr-chart-title"><span>Concentração de MRR — quem responde pela receita <EnvoxersShared.HelpIcon helpKey="fat_concentr_chart" /></span></div>
        <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Nenhum cliente recorrente ativo ainda.</div>
      </div>
    );
  }
  const top3 = concentracao.slice(0, 3).reduce((s, c) => s + c.pct, 0);
  const top5 = concentracao.slice(0, 5).reduce((s, c) => s + c.pct, 0);
  return (
    <div className="mrr-chart">
      <div className="mrr-chart-title">
        <span>Concentração de MRR — quem responde pela receita <EnvoxersShared.HelpIcon helpKey="fat_concentr_chart" /></span>
        <span>Top 3 = {top3.toFixed(0)}% · Top 5 = {top5.toFixed(0)}%</span>
      </div>
      <div className="concentr-strip">
        {concentracao.map((c) => (
          <div key={c.nome} className="concentr-seg" style={{ background: c.cor, flex: c.pct || 0.01 }} title={`${c.nome}: ${c.pct}%`}>
            {c.pct >= 5 ? c.pct.toFixed(1) + "%" : ""}
          </div>
        ))}
      </div>
      <div className="concentr-labels">
        {concentracao.map((c) => (
          <div key={c.nome} style={{ flex: c.pct || 0.01, paddingRight: 6, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
        ))}
      </div>
    </div>
  );
}

function FaturamentoCohorts({ cohorts }) {
  if (cohorts.length === 0) {
    return (
      <div className="mrr-chart">
        <div className="mrr-chart-title"><span>Curva de retenção — % de clientes que continuam ativos por cohort <EnvoxersShared.HelpIcon helpKey="fat_cohort" /></span></div>
        <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Ainda não há cohorts (clientes recorrentes com início de contrato) nos últimos 12 meses.</div>
      </div>
    );
  }
  const classePonto = (v) => (v >= 90 ? "n100" : v >= 70 ? "n80" : v >= 50 ? "n60" : v >= 30 ? "n40" : "n20");
  return (
    <div className="mrr-chart">
      <div className="mrr-chart-title">
        <span>Curva de retenção — % de clientes que continuam ativos por cohort <EnvoxersShared.HelpIcon helpKey="fat_cohort" /></span>
        <span>Cortar clientes em vermelho muda esse gráfico</span>
      </div>
      <div className="cohort-grid">
        <div className="cohort-row">
          <div className="cohort-label"></div>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="cohort-cell empty" style={{ fontWeight: 600 }}>M{i}</div>
          ))}
        </div>
        {cohorts.map((c) => (
          <div className="cohort-row" key={c.cohort}>
            <div className="cohort-label">{mesLabelFat(c.cohort)} ({c.quantidade})</div>
            {Array.from({ length: 12 }, (_, i) => {
              const v = c.pontos[i];
              if (v === undefined) return <div key={i} className="cohort-cell empty">·</div>;
              return <div key={i} className={`cohort-cell ${classePonto(v)}`}>{v}%</div>;
            })}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12, lineHeight: 1.5 }}>
        Cada linha é uma turma que entrou no mês indicado. A cor mostra quantos ainda estavam ativos <em>N</em> meses depois — verde escuro ≥ 90%, verde claro ≥ 70%, amarelo ≥ 50%, laranja ≥ 30%, vermelho abaixo disso. Vazio = mês ainda no futuro.
      </div>
    </div>
  );
}

function FaturamentoScreen() {
  const toast = EnvoxersShared.useToast();
  const [dados, setDados] = useStateFat(null);
  const [loading, setLoading] = useStateFat(true);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/faturamento/painel");
      setDados(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectFat(() => { carregar(); }, []);

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Painel de faturamento"
        subtitle="MRR, concentração, receita em risco e projeção 90 dias — recalculado a cada visita a esta tela."
      />

      {loading && <div className="app-loading">Calculando painel…</div>}

      {!loading && dados && (
        <>
          <div className="fat-hero">
            <div className="fat-mrr-card">
              <div className="fat-mrr-label">MRR — Recorrente <EnvoxersShared.HelpIcon helpKey="fat_mrr" onDark /></div>
              <div className="fat-mrr-value">{EnvoxersShared.formatMoney(dados.mrr_atual)}</div>
              <div className={`fat-mrr-delta ${dados.mrr_delta < 0 ? "neg" : ""}`}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" style={dados.mrr_delta < 0 ? { transform: "rotate(180deg)" } : undefined}><path d="M6 2l4 4H2z" /></svg>
                {dados.mrr_delta >= 0 ? "+" : "-"}{EnvoxersShared.formatMoney(Math.abs(dados.mrr_delta))} vs. mês anterior{dados.mrr_delta_pct != null ? ` · ${dados.mrr_delta_pct >= 0 ? "+" : ""}${dados.mrr_delta_pct}%` : ""}
              </div>
              <div className="fat-mrr-sub">
                {dados.qtd_recorrentes_ativos} contrato{dados.qtd_recorrentes_ativos !== 1 ? "s" : ""} recorrente{dados.qtd_recorrentes_ativos !== 1 ? "s" : ""} ativo{dados.qtd_recorrentes_ativos !== 1 ? "s" : ""}
                {dados.ticket_medio_recorrente != null && <> · média {EnvoxersShared.formatMoney(dados.ticket_medio_recorrente)}/cliente</>}
                <br />Receita pontual: {EnvoxersShared.formatMoney(dados.receita_pontual)} ({dados.qtd_pontuais_ativos} projeto{dados.qtd_pontuais_ativos !== 1 ? "s" : ""})
              </div>
            </div>

            <div className="fat-side">
              <div className="fat-side-card">
                <div className="fat-side-label">Concentração top 3 <EnvoxersShared.HelpIcon helpKey="fat_concentr" /></div>
                <div className="fat-side-value warn">{dados.top3_pct}<span className="unit">% do MRR</span></div>
                <div className="fat-side-sub">
                  {dados.top3_nomes.length > 0
                    ? <>Perder {dados.top3_nomes.join(", ")} tira ~{EnvoxersShared.formatMoney(dados.top3_valor)} do MRR.</>
                    : "Sem clientes recorrentes suficientes ainda."}
                </div>
              </div>
              <div className="fat-side-card" style={{ borderLeft: "3px solid var(--farol-vermelho)" }}>
                <div className="fat-side-label">Receita em risco <EnvoxersShared.HelpIcon helpKey="fat_risco" /></div>
                <div className="fat-side-value danger">{EnvoxersShared.formatMoney(dados.receita_em_risco)}</div>
                <div className="fat-side-sub">{dados.qtd_em_risco} cliente{dados.qtd_em_risco !== 1 ? "s" : ""} em farol amarelo/vermelho — {dados.receita_em_risco_pct}% do MRR está em atenção.</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="fat-side-card">
              <div className="fat-side-label">Projeção 90 dias <EnvoxersShared.HelpIcon helpKey="fat_projecao" /></div>
              <div className="fat-side-value" style={{ color: "var(--envox)" }}>{EnvoxersShared.formatMoney(dados.projecao_90d)}</div>
              <div className="fat-side-sub">MRR menos os clientes em farol vermelho. Amarelos entram como incerteza, não são descontados.</div>
            </div>
            <div className="fat-side-card">
              <div className="fat-side-label">Tempo médio de casa <EnvoxersShared.HelpIcon helpKey="fat_tempo_casa" /></div>
              <div className="fat-side-value pos">{dados.tempo_medio_casa_meses != null ? dados.tempo_medio_casa_meses : "—"}<span className="unit"> meses</span></div>
              <div className="fat-side-sub">Meta é passar de 12 meses de casa em média.</div>
            </div>
          </div>

          <FaturamentoMrrChart historico={dados.historico_mrr} />
          <FaturamentoConcentracao concentracao={dados.concentracao} />
          <FaturamentoCohorts cohorts={dados.cohorts} />
        </>
      )}
    </div>
  );
}

window.FaturamentoScreen = FaturamentoScreen;
