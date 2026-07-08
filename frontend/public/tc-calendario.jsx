const { useState: useStateCal, useEffect: useEffectCal, useMemo: useMemoCal } = React;

const WEEKDAYS_CAL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarioScreen() {
  const toast = EnvoxersShared.useToast();
  const [cursor, setCursor] = useStateCal(() => { const d = new Date(); d.setDate(1); return d; });
  const [itens, setItens] = useStateCal([]);
  const [clientes, setClientes] = useStateCal([]);
  const [clienteFiltro, setClienteFiltro] = useStateCal("");
  const [modalAberto, setModalAberto] = useStateCal(false);

  const [novoTitulo, setNovoTitulo] = useStateCal("");
  const [novoTipo, setNovoTipo] = useStateCal("reuniao");
  const [novoCliente, setNovoCliente] = useStateCal("");
  const [novoData, setNovoData] = useStateCal("");
  const [novoHora, setNovoHora] = useStateCal("");
  const [novoDiaInteiro, setNovoDiaInteiro] = useStateCal(false);
  const [novoLocal, setNovoLocal] = useStateCal("");
  const [novoDescricao, setNovoDescricao] = useStateCal("");
  const [salvando, setSalvando] = useStateCal(false);

  const carregar = async () => {
    try {
      const params = new URLSearchParams({ ano: cursor.getFullYear(), mes: cursor.getMonth() + 1 });
      if (clienteFiltro) params.set("cliente_id", clienteFiltro);
      const data = await EnvoxersAPI.api(`/calendario?${params.toString()}`);
      setItens(data);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectCal(() => { carregar(); }, [cursor, clienteFiltro]);

  useEffectCal(() => {
    (async () => {
      try {
        setClientes(await EnvoxersAPI.api("/clientes"));
      } catch (err) { /* silencioso — só popula o filtro */ }
    })();
  }, []);

  const itensPorDia = useMemoCal(() => {
    const map = {};
    itens.forEach((it) => { (map[it.data] = map[it.data] || []).push(it); });
    return map;
  }, [itens]);

  const nav = (dir) => {
    setCursor((prev) => {
      if (dir === 0) { const d = new Date(); d.setDate(1); return d; }
      const d = new Date(prev); d.setMonth(d.getMonth() + dir); return d;
    });
  };

  const abrirNovoEvento = () => {
    const hoje = new Date();
    setNovoTitulo(""); setNovoTipo("reuniao"); setNovoCliente("");
    setNovoData(hoje.toISOString().slice(0, 10)); setNovoHora("10:00");
    setNovoDiaInteiro(false); setNovoLocal(""); setNovoDescricao("");
    setModalAberto(true);
  };

  const salvarEvento = async () => {
    if (!novoTitulo || !novoData) {
      toast("Título e data são obrigatórios", "error");
      return;
    }
    setSalvando(true);
    try {
      const dataInicio = novoDiaInteiro ? `${novoData}T00:00:00` : `${novoData}T${novoHora || "00:00"}:00`;
      await EnvoxersAPI.api("/eventos", {
        method: "POST",
        body: JSON.stringify({
          titulo: novoTitulo, tipo: novoTipo, cliente_id: novoCliente ? Number(novoCliente) : null,
          data_inicio: dataInicio, dia_inteiro: novoDiaInteiro,
          local: novoLocal || null, descricao: novoDescricao || null,
        }),
      });
      toast("Evento criado", "success");
      setModalAberto(false);
      carregar();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const primeiroDia = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const diaSemanaInicio = primeiroDia.getDay();
  const diasNoMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const diasMesAnterior = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
  const hojeStr = new Date().toISOString().slice(0, 10);

  const celulas = [];
  for (let i = diaSemanaInicio - 1; i >= 0; i--) {
    celulas.push({ tipo: "outro", numero: diasMesAnterior - i });
  }
  for (let d = 1; d <= diasNoMes; d++) {
    const dataStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    celulas.push({ tipo: "atual", numero: d, dataStr, itens: itensPorDia[dataStr] || [] });
  }
  const totalCells = 7 + diaSemanaInicio + diasNoMes;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) celulas.push({ tipo: "outro", numero: i });

  const nomeMesAno = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="cal-shell">
      <EnvoxersShared.PageHeader
        title="Calendário"
        subtitle="Publicações previstas, reuniões, captações e eventos externos — tudo numa agenda só."
        actions={(
          <button className="btn btn-envox" onClick={abrirNovoEvento}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Novo evento
          </button>
        )}
      />

      <div className="cal-topbar">
        <div className="cal-nav">
          <button onClick={() => nav(-1)} aria-label="Anterior"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l-4 4 4 4" /></svg></button>
          <button onClick={() => nav(0)} aria-label="Hoje" style={{ width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 500 }}>Hoje</button>
          <button onClick={() => nav(1)} aria-label="Próximo"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4" /></svg></button>
        </div>
        <div className="cal-current">{nomeMesAno}</div>

        <div className="cal-view-toggle" style={{ marginLeft: "auto" }}>
          <button className="active">Mês</button>
          <button disabled title="Ainda não implementado" style={{ opacity: 0.4, cursor: "default" }}>Semana</button>
          <button disabled title="Ainda não implementado" style={{ opacity: 0.4, cursor: "default" }}>Lista</button>
        </div>

        <select className="chip" value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="cal-grid">
        {WEEKDAYS_CAL.map((d) => <div key={d} className="cal-weekhead">{d}</div>)}
        {celulas.map((cel, i) => {
          if (cel.tipo === "outro") {
            return <div key={i} className="cal-day other-month"><div className="cal-day-num">{cel.numero}</div></div>;
          }
          const isHoje = cel.dataStr === hojeStr;
          const shown = cel.itens.slice(0, 3);
          const rest = cel.itens.length - shown.length;
          return (
            <div key={i} className={"cal-day" + (isHoje ? " today" : "")}>
              <div className="cal-day-num">{cel.numero}</div>
              {shown.map((ev) => (
                <div
                  key={ev.id}
                  className={`cal-event tipo-${ev.tipo} ${ev.cliente_farol === "vermelho" ? "farol-vermelho" : ""}`}
                  title={`${ev.titulo}${ev.hora ? " · " + ev.hora : ""}${ev.cliente_nome ? " · " + ev.cliente_nome : ""}`}
                >
                  {ev.hora ? <strong>{ev.hora}</strong> : null} {ev.titulo}
                </div>
              ))}
              {rest > 0 && <div className="cal-more">+{rest} mais</div>}
            </div>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item" style={{ fontWeight: 600, color: "var(--ink-2)" }}>Legenda <EnvoxersShared.HelpIcon helpKey="cal_legend" /> ·</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: "var(--envox)" }}></span> Publicação (tarefa)</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: "#6D3EB9" }}></span> Reunião</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: "var(--farol-amarelo)" }}></span> Captação</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: "var(--farol-vermelho)" }}></span> Live</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: "var(--farol-verde)" }}></span> Evento externo</span>
        <span className="cal-legend-item"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--farol-vermelho)", display: "inline-block" }}></span> Cliente em vermelho</span>
      </div>

      {modalAberto && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setModalAberto(false); }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div className="modal-eyebrow">Calendário</div>
              <h2 className="modal-title">Novo evento</h2>
              <button className="modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div style={{ padding: "8px 28px 28px" }}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Título <span className="req">*</span></label>
                <input type="text" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex.: Reunião de kickoff" />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>Tipo</label>
                  <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
                    <option value="reuniao">Reunião</option>
                    <option value="captacao">Captação</option>
                    <option value="live">Live</option>
                    <option value="evento_externo">Evento externo</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="field">
                  <label>Cliente <span className="hint">opcional</span></label>
                  <select value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)}>
                    <option value="">Nenhum (interno)</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>Data <span className="req">*</span></label>
                  <input type="date" value={novoData} onChange={(e) => setNovoData(e.target.value)} />
                </div>
                <div className="field">
                  <label>Hora <span className="hint">opcional</span></label>
                  <input type="time" value={novoHora} onChange={(e) => setNovoHora(e.target.value)} disabled={novoDiaInteiro} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" id="cal-dia-inteiro" checked={novoDiaInteiro} onChange={(e) => setNovoDiaInteiro(e.target.checked)} style={{ width: "auto" }} />
                <label htmlFor="cal-dia-inteiro" style={{ marginBottom: 0 }}>Dia inteiro</label>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Local <span className="hint">opcional</span></label>
                <input type="text" value={novoLocal} onChange={(e) => setNovoLocal(e.target.value)} placeholder="Ex.: Escritório, Google Meet…" />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Descrição <span className="hint">opcional</span></label>
                <textarea value={novoDescricao} onChange={(e) => setNovoDescricao(e.target.value)} placeholder="Contexto do evento…"></textarea>
              </div>
            </div>
            <div className="form-footer">
              <span className="save-hint"></span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setModalAberto(false)}>Cancelar</button>
                <button className="btn btn-envox" onClick={salvarEvento} disabled={salvando}>{salvando ? "Salvando…" : "Criar evento"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.CalendarioScreen = CalendarioScreen;
