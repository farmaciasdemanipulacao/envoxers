const { useState: useStateFarol, useEffect: useEffectFarol, useMemo: useMemoFarol } = React;

const FAROL_LABELS = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho" };
const FAROL_CORES = { verde: "var(--farol-verde)", amarelo: "var(--farol-amarelo)", vermelho: "var(--farol-vermelho)" };

const SINAL_LABELS = {
  entrega: "Entrega no prazo",
  atrasadas: "Tarefas atrasadas",
  alteracoes: "Alterações acima do limite",
  aprovacoes: "Aprovações paradas",
  pulso: "Pulso de satisfação",
  margem: "Margem",
  silencio: "Silêncio do cliente",
  whatsapp: "Termômetro WhatsApp",
};
const SINAL_ORDEM = ["entrega", "atrasadas", "alteracoes", "aprovacoes", "pulso", "margem", "silencio", "whatsapp"];

function FarolDot({ cor, sem_dado }) {
  if (sem_dado) {
    return <span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: "var(--ink-4)", boxShadow: "none" }}></span>;
  }
  return <span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: FAROL_CORES[cor] }}></span>;
}

function FarolScreen() {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateFarol([]);
  const [loading, setLoading] = useStateFarol(true);
  const [filtro, setFiltro] = useStateFarol("todos");
  const [detalhe, setDetalhe] = useStateFarol(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/farol");
      setItens(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectFarol(() => { carregar(); }, []);

  const filtrados = useMemoFarol(() => {
    if (filtro === "todos") return itens;
    return itens.filter((i) => i.farol === filtro);
  }, [itens, filtro]);

  const kpis = useMemoFarol(() => ({
    total: itens.length,
    vermelhos: itens.filter((i) => i.farol === "vermelho").length,
    amarelos: itens.filter((i) => i.farol === "amarelo").length,
    verdes: itens.filter((i) => i.farol === "verde").length,
  }), [itens]);

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Farol Inteligente"
        subtitle="Saúde de cada cliente calculada a partir de 8 sinais — recalculado a cada visita a esta tela."
      />

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Clientes ativos</div>
          <div className="kpi-value">{kpis.total}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Vermelho</div>
          <div className="kpi-value" style={{ color: "var(--farol-vermelho)" }}>{kpis.vermelhos}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Amarelo</div>
          <div className="kpi-value" style={{ color: "var(--farol-amarelo)" }}>{kpis.amarelos}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Verde</div>
          <div className="kpi-value" style={{ color: "var(--farol-verde)" }}>{kpis.verdes}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-group">
          {["todos", "vermelho", "amarelo", "verde"].map((f) => (
            <button key={f} className={"chip" + (filtro === f ? " active" : "")} onClick={() => setFiltro(f)}>
              {f === "todos" ? "Todos" : (
                <><FarolDot cor={f} /> {FAROL_LABELS[f]}</>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Cliente</th>
              <th className="table-mobile-hide">Responsável</th>
              <th style={{ width: 90 }}>Score</th>
              <th className="table-mobile-hide">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5">Calculando farol…</td></tr>}
            {!loading && filtrados.length === 0 && <tr><td colSpan="5">Nenhum cliente neste filtro.</td></tr>}
            {filtrados.map((i) => (
              <tr key={i.cliente_id} onClick={() => setDetalhe(i)} style={{ cursor: "pointer" }}>
                <td><FarolDot cor={i.farol} /></td>
                <td>{i.cliente_nome}</td>
                <td className="table-mobile-hide">{i.responsavel_nome || "—"}</td>
                <td>{i.health_score}</td>
                <td className="table-mobile-hide">{i.motivo_texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setDetalhe(null); }}>
          <div className="modal">
            <div className="modal-head">
              <div className="modal-eyebrow"><span>{detalhe.responsavel_nome || "Sem responsável"}</span></div>
              <h2 className="modal-title">{detalhe.cliente_nome}</h2>
              <button className="modal-close" onClick={() => setDetalhe(null)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-main">
                <div className="modal-section-title">Os 8 sinais</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SINAL_ORDEM.map((nome) => {
                    const s = detalhe.sinais[nome];
                    const semDado = s.cor === "sem_dado";
                    return (
                      <div key={nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <FarolDot cor={s.cor} sem_dado={semDado} /> {SINAL_LABELS[nome]}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          {semDado ? "sem dado" : (s.valor === null || s.valor === undefined ? "—" : String(s.valor))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="modal-section-title">Motivo</div>
                <div>{detalhe.motivo_texto}</div>

                {detalhe.sugestao_acao && (
                  <>
                    <div className="modal-section-title">Sugestão de ação</div>
                    <div>{detalhe.sugestao_acao}</div>
                  </>
                )}
              </div>

              <div className="modal-side">
                <div className="modal-side-block">
                  <div className="modal-side-label">Farol</div>
                  <div className="modal-side-value" style={{ color: FAROL_CORES[detalhe.farol] }}>{FAROL_LABELS[detalhe.farol]}</div>
                </div>
                <div className="modal-side-block">
                  <div className="modal-side-label">Health score</div>
                  <div className="modal-side-value">{detalhe.health_score}/100</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.FarolScreen = FarolScreen;
