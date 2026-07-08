const { useState: useStateRep, useEffect: useEffectRep, useMemo: useMemoRep } = React;

const REP_TABS = [
  { key: "cliente", label: "Por cliente", helpKey: "rep_tab_cliente" },
  { key: "servico", label: "Por serviço", helpKey: "rep_tab_servico" },
  { key: "tipo", label: "Por tipo de tarefa", helpKey: "rep_tab_tipo" },
  { key: "envoxer", label: "Por Envoxer", helpKey: "rep_tab_env" },
];

function margemClasse(pct) {
  if (pct == null) return "";
  if (pct < 0) return "negative";
  if (pct < 10) return "neg";
  if (pct < 20) return "mid";
  return "pos";
}

function baixarCsv(nomeArquivo, linhas) {
  const csv = linhas.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function RelatorioScreen() {
  const toast = EnvoxersShared.useToast();
  const [aba, setAba] = useStateRep("cliente");
  const [periodo, setPeriodo] = useStateRep("mes");
  const [tipoReceita, setTipoReceita] = useStateRep("");
  const [loading, setLoading] = useStateRep(true);
  const [dados, setDados] = useStateRep({ cliente: [], servico: [], tipo: [], envoxer: [] });

  const carregar = async () => {
    setLoading(true);
    try {
      const params = (agrupar) => {
        const p = new URLSearchParams({ agrupar, periodo });
        if (tipoReceita && agrupar === "cliente") p.set("tipo_receita", tipoReceita);
        return p.toString();
      };
      const [cliente, servico, tipo, envoxer] = await Promise.all([
        EnvoxersAPI.api(`/relatorio/tempo-custo?${params("cliente")}`),
        EnvoxersAPI.api(`/relatorio/tempo-custo?${params("servico")}`),
        EnvoxersAPI.api(`/relatorio/tempo-custo?${params("tipo")}`),
        EnvoxersAPI.api(`/relatorio/tempo-custo?${params("envoxer")}`),
      ]);
      setDados({ cliente: cliente.itens, servico: servico.itens, tipo: tipo.itens, envoxer: envoxer.itens });
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectRep(() => { carregar(); }, [periodo, tipoReceita]);

  const kpis = useMemoRep(() => {
    const cs = dados.cliente;
    const horas = cs.reduce((s, c) => s + c.horas, 0);
    const custo = cs.reduce((s, c) => s + c.custo_horas, 0);
    const receita = cs.reduce((s, c) => s + c.valor_contrato, 0);
    const margemPct = receita > 0 ? ((receita - custo) / receita) * 100 : null;
    return {
      horas: horas.toFixed(1), custo, receita,
      margemPct: margemPct != null ? margemPct.toFixed(1) : "—",
      margemReais: receita - custo,
      qtdClientes: cs.length,
      qtdEnvoxers: dados.envoxer.length,
    };
  }, [dados]);

  const insights = useMemoRep(() => {
    const lista = [];
    const apertados = dados.cliente.filter((c) => c.margem_pct != null && c.margem_pct < 20);
    if (apertados.length > 0) {
      const nomes = apertados.slice(0, 2).map((c) => `${c.cliente_nome} (${c.margem_pct}%)`).join(" e ");
      lista.push({
        titulo: "Sinal — margem apertada",
        destaque: `${apertados.length} cliente(s) operam abaixo de 20% de margem.`,
        texto: nomes,
      });
    }
    if (dados.servico.length > 0) {
      const top = dados.servico[0];
      const segundo = dados.servico[1];
      lista.push({
        titulo: "Sinal — concentração de horas",
        destaque: `${top.servico_nome} consome ${top.pct_custo_total}% do custo do time.`,
        texto: segundo ? `Segundo lugar: ${segundo.servico_nome} (${segundo.pct_custo_total}%).` : "",
      });
    }
    return lista;
  }, [dados]);

  const exportarCsv = () => {
    const linhas = {
      cliente: [["Cliente", "Segmento", "Horas", "Custo horas", "Contrato", "Margem R$", "Margem %"],
        ...dados.cliente.map((c) => [c.cliente_nome, c.segmento, c.horas, c.custo_horas, c.valor_contrato, c.margem_reais, c.margem_pct])],
      servico: [["Serviço", "Horas", "Custo horas", "% do custo total"],
        ...dados.servico.map((s) => [s.servico_nome, s.horas, s.custo_horas, s.pct_custo_total])],
      tipo: [["Tipo de tarefa", "Qtd.", "Horas", "Custo horas", "Custo médio/tarefa"],
        ...dados.tipo.map((t) => [t.tipo_tarefa, t.qtd_tarefas, t.horas, t.custo_horas, t.custo_medio_tarefa])],
      envoxer: [["Envoxer", "Cargo", "Horas de Foco", "Custo/hora", "Custo gerado", "Utilização %"],
        ...dados.envoxer.map((e) => [e.envoxer_nome, e.cargo, e.horas, e.custo_hora, e.custo_gerado, e.utilizacao_pct])],
    };
    baixarCsv(`relatorio-${aba}-${periodo}.csv`, linhas[aba]);
  };

  const abaAtual = REP_TABS.find((t) => t.key === aba);

  return (
    <div className="rep-shell">
      <EnvoxersShared.PageHeader
        title="Relatório de custo"
        subtitle="Horas de Foco × custo do time × contrato. Onde a agência está ganhando dinheiro — e onde está perdendo."
        actions={(
          <button className="btn" onClick={exportarCsv}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8l3 3 7-7" /></svg> Exportar CSV
          </button>
        )}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div className="rep-tabs">
            {REP_TABS.map((t) => (
              <button key={t.key} className={aba === t.key ? "active" : ""} onClick={() => setAba(t.key)}>{t.label}</button>
            ))}
          </div>
          <EnvoxersShared.HelpIcon helpKey={abaAtual.helpKey} />
          <select className="chip" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ marginLeft: 12 }}>
            <option value="semana">Últimos 7 dias</option>
            <option value="mes">Últimos 30 dias</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={"chip" + (tipoReceita === "" ? " active" : "")} onClick={() => setTipoReceita("")}>Todos</button>
          <button className={"chip" + (tipoReceita === "recorrente" ? " active" : "")} onClick={() => setTipoReceita("recorrente")}>Recorrente</button>
          <button className={"chip" + (tipoReceita === "pontual" ? " active" : "")} onClick={() => setTipoReceita("pontual")}>Pontual</button>
        </div>
      </div>

      <div className="kpis" style={{ marginTop: 20, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Horas registradas <EnvoxersShared.HelpIcon helpKey="rep_horas" /></div>
          <div className="kpi-value">{kpis.horas}<span className="unit">h</span></div>
          <div className="kpi-hint">{kpis.qtdEnvoxers} envoxer(s) com Foco no período</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Custo do time <EnvoxersShared.HelpIcon helpKey="rep_custo" /></div>
          <div className="kpi-value">{EnvoxersShared.formatMoney(kpis.custo)}</div>
          <div className="kpi-hint">soma custo/hora × horas</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Receita do período <EnvoxersShared.HelpIcon helpKey="rep_receita" /></div>
          <div className="kpi-value">{EnvoxersShared.formatMoney(kpis.receita)}</div>
          <div className="kpi-hint">{kpis.qtdClientes} cliente(s) com horas registradas</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margem bruta <EnvoxersShared.HelpIcon helpKey="rep_margem" /></div>
          <div className="kpi-value" style={{ color: kpis.margemPct !== "—" && Number(kpis.margemPct) < 20 ? "var(--farol-amarelo)" : "var(--farol-verde)" }}>{kpis.margemPct}<span className="unit">%</span></div>
          <div className="kpi-hint">{EnvoxersShared.formatMoney(kpis.margemReais)} · antes de overhead</div>
        </div>
      </div>

      <div className="note-bar">
        <strong>Este relatório mostra realidade, não recomenda ação.</strong> Margens abaixo de 20% ficam <span style={{ color: "var(--farol-amarelo)", fontWeight: 600 }}>amareladas</span>; negativas ou &lt;10% ficam <span style={{ color: "var(--farol-vermelho)", fontWeight: 600 }}>vermelhas</span>. A decisão de renegociar, reescopar ou encerrar contrato é sua — mas comece pelas linhas de baixo.
      </div>

      {loading && <div className="app-loading">Calculando…</div>}

      {!loading && aba === "cliente" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="table-mobile-hide">Segmento</th>
                <th style={{ textAlign: "right" }}>Horas</th>
                <th style={{ textAlign: "right" }} className="table-mobile-hide">Custo horas</th>
                <th style={{ textAlign: "right" }}>Contrato</th>
                <th style={{ textAlign: "right" }}>Margem R$</th>
                <th style={{ width: 200 }}>Margem %</th>
              </tr>
            </thead>
            <tbody>
              {dados.cliente.length === 0 && <tr><td colSpan="7">Nenhum registro de Foco no período.</td></tr>}
              {dados.cliente.map((c) => (
                <tr key={c.cliente_id}>
                  <td className="td-primary">{c.cliente_nome}</td>
                  <td className="table-mobile-hide">{c.segmento || "—"}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{c.horas.toFixed(1)}h</td>
                  <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(c.custo_horas)}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(c.valor_contrato)}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(c.margem_reais)}</td>
                  <td>
                    {c.margem_pct != null ? (
                      <div className="margin-cell">
                        <div className="margin-bar"><div className={`margin-bar-fill ${margemClasse(c.margem_pct)}`} style={{ width: `${Math.max(0, Math.min(100, c.margem_pct))}%` }}></div></div>
                        <div className={`margin-cell-value ${margemClasse(c.margem_pct)}`}>{c.margem_pct}%</div>
                      </div>
                    ) : "sem contrato"}
                  </td>
                </tr>
              ))}
            </tbody>
            {dados.cliente.length > 0 && (
              <tfoot>
                <tr className="rep-total-row">
                  <td>Total ({kpis.qtdClientes} cliente{kpis.qtdClientes === 1 ? "" : "s"})</td>
                  <td className="table-mobile-hide"></td>
                  <td className="td-num" style={{ textAlign: "right" }}>{kpis.horas}h</td>
                  <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(kpis.custo)}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(kpis.receita)}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(kpis.margemReais)}</td>
                  <td>
                    <div className="margin-cell">
                      <div className="margin-bar"><div className={`margin-bar-fill ${margemClasse(Number(kpis.margemPct))}`} style={{ width: `${Math.max(0, Math.min(100, Number(kpis.margemPct) || 0))}%` }}></div></div>
                      <div className={`margin-cell-value ${margemClasse(Number(kpis.margemPct))}`}>{kpis.margemPct}%</div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!loading && aba === "servico" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th style={{ textAlign: "right" }}>Horas</th>
                <th style={{ textAlign: "right" }} className="table-mobile-hide">Custo horas</th>
                <th style={{ textAlign: "right" }}>% do custo total</th>
              </tr>
            </thead>
            <tbody>
              {dados.servico.length === 0 && <tr><td colSpan="4">Nenhum registro de Foco no período.</td></tr>}
              {dados.servico.map((s) => (
                <tr key={s.servico_id ?? "sem-servico"}>
                  <td className="td-primary">{s.servico_nome}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{s.horas.toFixed(1)}h</td>
                  <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(s.custo_horas)}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{s.pct_custo_total}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && aba === "tipo" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo de tarefa</th>
                <th style={{ textAlign: "right" }}>Qtd.</th>
                <th style={{ textAlign: "right" }}>Horas</th>
                <th style={{ textAlign: "right" }} className="table-mobile-hide">Custo horas</th>
                <th style={{ textAlign: "right" }} className="table-mobile-hide">Custo médio/tarefa</th>
              </tr>
            </thead>
            <tbody>
              {dados.tipo.length === 0 && <tr><td colSpan="5">Nenhum registro de Foco no período.</td></tr>}
              {dados.tipo.map((t) => (
                <tr key={t.tipo_tarefa}>
                  <td className="td-primary">{t.tipo_tarefa}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{t.qtd_tarefas}</td>
                  <td className="td-num" style={{ textAlign: "right" }}>{t.horas.toFixed(1)}h</td>
                  <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(t.custo_horas)}</td>
                  <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(t.custo_medio_tarefa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && aba === "envoxer" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Envoxer</th>
                <th className="table-mobile-hide">Cargo</th>
                <th style={{ textAlign: "right" }}>Horas de Foco</th>
                <th style={{ textAlign: "right" }} className="table-mobile-hide">Custo/hora</th>
                <th style={{ textAlign: "right" }}>Custo gerado</th>
                <th style={{ width: 200 }}>Utilização</th>
              </tr>
            </thead>
            <tbody>
              {dados.envoxer.length === 0 && <tr><td colSpan="6">Nenhum registro de Foco no período.</td></tr>}
              {dados.envoxer.map((e) => {
                const util = e.utilizacao_pct;
                const cls = util == null ? "" : util > 90 ? "mid" : util < 60 ? "neg" : "pos";
                return (
                  <tr key={e.envoxer_id}>
                    <td className="td-primary">{e.envoxer_nome}</td>
                    <td className="table-mobile-hide">{e.cargo}</td>
                    <td className="td-num" style={{ textAlign: "right" }}>{e.horas.toFixed(1)}h</td>
                    <td className="td-num table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(e.custo_hora)}</td>
                    <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(e.custo_gerado)}</td>
                    <td>
                      {util != null ? (
                        <div className="margin-cell">
                          <div className="margin-bar"><div className={`margin-bar-fill ${cls}`} style={{ width: `${Math.max(0, Math.min(100, util))}%` }}></div></div>
                          <div className={`margin-cell-value ${cls}`}>{util}%</div>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && insights.length > 0 && (
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ padding: 20, border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--bg-elev)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-3)", fontWeight: 600, marginBottom: 12 }}>{ins.titulo}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, lineHeight: 1.3, color: "var(--ink)", marginBottom: 10 }}><em>{ins.destaque}</em></div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55 }}>{ins.texto}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

window.RelatorioScreen = RelatorioScreen;
