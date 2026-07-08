const { useState: useStateIcp, useEffect: useEffectIcp } = React;

const ICP_DIMENSOES = [
  { key: "segmento", label: "Segmento", sub: "de negócio do cliente", helpKey: "icp_dim_segmento" },
  { key: "canal_aquisicao", label: "Canal de aquisição", sub: "como o cliente chegou até nós", helpKey: "icp_dim_canal" },
  { key: "maturidade_digital", label: "Maturidade digital", sub: "quão pronto para marketing", helpKey: "icp_dim_matur" },
  { key: "perfil", label: "Perfil comportamental", sub: "calculado pelo sistema", helpKey: "icp_dim_perfil" },
];

const ICP_PERFIL_LABELS = { facil: "Fácil", neutro: "Neutro", dificil: "Difícil" };

function IcpDimensaoBlock({ dimensao, distribuicaoRetidos, distribuicaoPerdidos }) {
  const chaves = [...new Set([...Object.keys(distribuicaoRetidos), ...Object.keys(distribuicaoPerdidos)])].sort();

  return (
    <div className="icp-dim">
      <div className="icp-dim-head">
        <div>
          <div className="icp-dim-title">{dimensao.label} <EnvoxersShared.HelpIcon helpKey={dimensao.helpKey} /></div>
          <div className="icp-dim-sub" style={{ marginTop: 4, fontFamily: "var(--font-ui)", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--ink-3)" }}>{dimensao.sub}</div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, alignItems: "center" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--farol-verde)", borderRadius: 2, verticalAlign: "middle", marginRight: 6 }}></span>Retidos</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--farol-vermelho)", borderRadius: 2, verticalAlign: "middle", marginRight: 6 }}></span>Perdidos</span>
        </div>
      </div>
      <div className="icp-dim-body">
        {chaves.length === 0 && <div className="icp-row" style={{ color: "var(--ink-4)" }}>sem dados</div>}
        {chaves.map((chave) => {
          const r = distribuicaoRetidos[chave]?.pct || 0;
          const p = distribuicaoPerdidos[chave]?.pct || 0;
          const diff = round1(r - p);
          const cls = diff > 15 ? "pos" : diff < -15 ? "neg" : "neutral";
          const labelDiff = (diff > 0 ? "+" : "") + diff.toFixed(0) + "pp";
          const rotulo = chave === "facil" || chave === "neutro" || chave === "dificil" ? ICP_PERFIL_LABELS[chave] : chave;
          return (
            <div key={chave} className="icp-row">
              <div className="icp-row-label">{rotulo}</div>
              <div className="icp-row-bar" title={`${distribuicaoRetidos[chave]?.quantidade || 0} retidos`}>
                <div className="icp-bar-fill retidos" style={{ width: `${r}%` }}>{r > 0 ? `${r.toFixed(0)}%` : ""}</div>
              </div>
              <div className="icp-row-bar" title={`${distribuicaoPerdidos[chave]?.quantidade || 0} perdidos`}>
                <div className="icp-bar-fill perdidos" style={{ width: `${p}%` }}>{p > 0 ? `${p.toFixed(0)}%` : ""}</div>
              </div>
              <div className={"icp-row-diff " + cls}>{labelDiff}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function IcpScreen() {
  const toast = EnvoxersShared.useToast();
  const [dados, setDados] = useStateIcp(null);
  const [loading, setLoading] = useStateIcp(true);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/icp/comparativo");
      setDados(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectIcp(() => { carregar(); }, []);

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="ICP Builder"
        subtitle="Retidos (ativos há 12+ meses) vs. Perdidos (cancelados com menos de 6 meses de casa) — recalculado a cada visita a esta tela."
      />

      {loading && <div className="app-loading">Calculando comparativo…</div>}

      {!loading && dados && (
        <>
          <div className="icp-header-cards">
            <div className="icp-pop-card retidos">
              <div className="icp-pop-label">Retidos <EnvoxersShared.HelpIcon helpKey="icp_retidos" /></div>
              <div className="icp-pop-count">{dados.retidos.quantidade}<span className="unit">clientes</span></div>
              <div className="icp-pop-desc">Ativos há mais de 12 meses. Estes têm ICP fit provado — quem se parece com eles, provavelmente fica.</div>
            </div>
            <div className="icp-pop-card perdidos">
              <div className="icp-pop-label">Perdidos cedo <EnvoxersShared.HelpIcon helpKey="icp_perdidos" /></div>
              <div className="icp-pop-count">{dados.perdidos.quantidade}<span className="unit">clientes</span></div>
              <div className="icp-pop-desc">Cancelaram com menos de 6 meses de casa. Estes revelam o anti-ICP — quem se parece com eles, evite.</div>
            </div>
          </div>

          <div className="note-bar">
            <strong>Como ler <EnvoxersShared.HelpIcon helpKey="icp_como_ler" />:</strong> a barra verde é % do grupo Retidos que tem aquela característica; a vermelha é % do grupo Perdidos. Quando as barras são muito diferentes, aquela característica é <strong>preditiva de retenção</strong>. A coluna <em>Δ</em> mostra o gap em pontos percentuais.
          </div>

          {(dados.retidos.quantidade === 0 || dados.perdidos.quantidade === 0) && (
            <div className="hero-quote" style={{ marginBottom: 24 }}>
              Ainda não há dado suficiente em um dos dois grupos pra comparar — o comparativo fica mais confiável conforme a base de clientes retidos e cancelados crescer.
            </div>
          )}

          <div className="form-row three" style={{ marginBottom: 10 }}>
            <div>
              <div className="modal-side-label">Ticket médio (retidos) <EnvoxersShared.HelpIcon helpKey="icp_dim_ticket" /></div>
              <div className="modal-side-value">{dados.retidos.ticket_medio != null ? EnvoxersShared.formatMoney(dados.retidos.ticket_medio) : "—"}</div>
            </div>
            <div>
              <div className="modal-side-label">Margem média (retidos)</div>
              <div className="modal-side-value">{dados.retidos.margem_media != null ? `${dados.retidos.margem_media}%` : "sem dado"}</div>
            </div>
            <div>
              <div className="modal-side-label">Meses de casa (retidos)</div>
              <div className="modal-side-value">{dados.retidos.meses_de_casa_medio != null ? dados.retidos.meses_de_casa_medio : "—"}</div>
            </div>
          </div>
          <div className="form-row three" style={{ marginBottom: 20 }}>
            <div>
              <div className="modal-side-label">Ticket médio (perdidos)</div>
              <div className="modal-side-value">{dados.perdidos.ticket_medio != null ? EnvoxersShared.formatMoney(dados.perdidos.ticket_medio) : "—"}</div>
            </div>
            <div>
              <div className="modal-side-label">Margem média (perdidos)</div>
              <div className="modal-side-value">{dados.perdidos.margem_media != null ? `${dados.perdidos.margem_media}%` : "sem dado"}</div>
            </div>
            <div>
              <div className="modal-side-label">Meses de casa (perdidos)</div>
              <div className="modal-side-value">{dados.perdidos.meses_de_casa_medio != null ? dados.perdidos.meses_de_casa_medio : "—"}</div>
            </div>
          </div>

          {ICP_DIMENSOES.map((dim) => (
            <IcpDimensaoBlock
              key={dim.key}
              dimensao={dim}
              distribuicaoRetidos={dados.retidos.distribuicao[dim.key]}
              distribuicaoPerdidos={dados.perdidos.distribuicao[dim.key]}
            />
          ))}

          {dados.destaques.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="form-section-title">Diferenças mais relevantes <EnvoxersShared.HelpIcon helpKey="icp_insights" /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dados.destaques.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--bg-inset)",
                      borderLeft: `3px solid ${d.gap > 0 ? "var(--farol-vermelho)" : "var(--farol-verde)"}`, fontSize: 13,
                    }}
                  >
                    {d.texto}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

window.IcpScreen = IcpScreen;
