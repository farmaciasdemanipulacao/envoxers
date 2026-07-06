const { useState: useStateIcp, useEffect: useEffectIcp } = React;

const ICP_DIMENSOES = [
  { key: "segmento", label: "Segmento" },
  { key: "canal_aquisicao", label: "Canal de aquisição" },
  { key: "maturidade_digital", label: "Maturidade digital" },
  { key: "perfil", label: "Perfil comportamental" },
];

const ICP_PERFIL_LABELS = { facil: "Fácil", neutro: "Neutro", dificil: "Difícil" };

function IcpBarraDistribuicao({ distribuicao, corBase }) {
  const entradas = Object.entries(distribuicao).sort((a, b) => b[1].pct - a[1].pct);
  if (entradas.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--ink-4)" }}>sem dados</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {entradas.map(([chave, v]) => (
        <div key={chave}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
            <span>{ICP_PERFIL_LABELS[chave] || chave}</span>
            <span style={{ color: "var(--ink-3)" }}>{v.pct}% ({v.quantidade})</span>
          </div>
          <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${v.pct}%`, height: "100%", background: corBase }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IcpGrupoCard({ titulo, corBase, grupo }) {
  return (
    <div className="modal-side-block" style={{ background: "var(--bg-inset)", padding: 16, borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: corBase }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{grupo.quantidade} cliente(s)</div>
      </div>

      {grupo.quantidade === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Nenhum cliente neste grupo ainda.</div>
      ) : (
        <>
          <div className="form-row three" style={{ marginBottom: 16 }}>
            <div>
              <div className="modal-side-label">Ticket médio</div>
              <div className="modal-side-value">{grupo.ticket_medio != null ? EnvoxersShared.formatMoney(grupo.ticket_medio) : "—"}</div>
            </div>
            <div>
              <div className="modal-side-label">Margem média</div>
              <div className="modal-side-value">{grupo.margem_media != null ? `${grupo.margem_media}%` : "sem dado"}</div>
            </div>
            <div>
              <div className="modal-side-label">Meses de casa</div>
              <div className="modal-side-value">{grupo.meses_de_casa_medio != null ? grupo.meses_de_casa_medio : "—"}</div>
            </div>
          </div>

          {ICP_DIMENSOES.map((d) => (
            <div key={d.key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", marginBottom: 6 }}>{d.label}</div>
              <IcpBarraDistribuicao distribuicao={grupo.distribuicao[d.key]} corBase={corBase} />
            </div>
          ))}
        </>
      )}
    </div>
  );
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
          {dados.destaques.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="form-section-title">Diferenças mais relevantes</div>
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

          {(dados.retidos.quantidade === 0 || dados.perdidos.quantidade === 0) && (
            <div className="hero-quote" style={{ marginBottom: 24 }}>
              Ainda não há dado suficiente em um dos dois grupos pra comparar — o comparativo fica mais confiável conforme a base de clientes retidos e cancelados crescer.
            </div>
          )}

          <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr", gap: 20, display: "grid" }}>
            <IcpGrupoCard titulo="Retidos" corBase="var(--farol-verde)" grupo={dados.retidos} />
            <IcpGrupoCard titulo="Perdidos" corBase="var(--farol-vermelho)" grupo={dados.perdidos} />
          </div>
        </>
      )}
    </div>
  );
}

window.IcpScreen = IcpScreen;
