const { useState: useStateFR, useEffect: useEffectFR, useMemo: useMemoFR } = React;

function focoFmtMin(min) {
  const totalSeg = Math.max(0, Math.round(Number(min || 0) * 60));
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  if (h) return h + "h" + (m ? " " + String(m).padStart(2, "0") + "min" : "");
  if (m) return m + "min" + (s ? " " + s + "s" : "");
  return s + "s";
}

function focoFmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function focoFmtDay(isoDate) {
  if (!isoDate) return "—";
  return new Date(isoDate + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
}

function focoIsoDate(d) {
  const pad=(n)=>String(n).padStart(2,"0");
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
}

function focoSplitMin(total) {
  const n = Math.max(0, Math.round(Number(total || 0)));
  return { h: Math.floor(n / 60), m: n % 60 };
}

function FocoRegistroEditarModal({ registro, onClose, onSaved }) {
  const toast = EnvoxersShared.useToast();
  const durInicial = focoSplitMin(registro.duracao_min);
  const pausaInicial = focoSplitMin(registro.duracao_pausada_min);
  const [durH, setDurH] = useStateFR(String(durInicial.h));
  const [durM, setDurM] = useStateFR(String(durInicial.m));
  const [pausaH, setPausaH] = useStateFR(String(pausaInicial.h));
  const [pausaM, setPausaM] = useStateFR(String(pausaInicial.m));
  const [motivo, setMotivo] = useStateFR("");
  const [saving, setSaving] = useStateFR(false);

  const toMin = (h, m) => {
    const hh = Math.max(0, Number(h || 0));
    const mm = Math.max(0, Math.min(59, Number(m || 0)));
    return Math.round(hh * 60 + mm);
  };

  const duracao = toMin(durH, durM);
  const pausa = toMin(pausaH, pausaM);
  const alterou =
    duracao !== Number(registro.duracao_min || 0) ||
    pausa !== Number(registro.duracao_pausada_min || 0);

  const salvar = async () => {
    if (!alterou || saving) return;
    setSaving(true);
    try {
      await EnvoxersAPI.api("/foco/admin/registros/" + registro.id, {
        method: "PATCH",
        body: JSON.stringify({
          duracao_min: duracao,
          duracao_pausada_min: pausa,
          motivo: motivo.trim() || null,
        }),
      });
      toast("Registro de Foco corrigido", "success");
      await onSaved();
      onClose();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const historico = [...(registro.ajustes_admin || [])].reverse();

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal foco-record-edit-modal">
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Admin / Focos / Registros</div>
            <h2 className="modal-title">Corrigir registro de Foco</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="foco-record-edit-body">
          <div className="foco-record-edit-summary">
            <div><span>Envoxer</span><strong>{registro.envoxer_nome}</strong></div>
            <div><span>Data / início</span><strong>{focoFmtDate(registro.inicio)}</strong></div>
            <div><span>Contexto</span><strong>{registro.contexto || "—"}</strong></div>
            <div><span>Atividade</span><strong>{registro.titulo || "—"}</strong></div>
          </div>

          {registro.comentario && (
            <div className="foco-record-observation">
              <span>Observação de encerramento</span>
              <p>{registro.comentario}</p>
            </div>
          )}

          <div className="foco-record-time-grid">
            <div className="foco-record-time-box">
              <label>Duração líquida</label>
              <div>
                <input type="number" min="0" max="24" value={durH} onChange={(e) => setDurH(e.target.value)} />
                <span>h</span>
                <input type="number" min="0" max="59" value={durM} onChange={(e) => setDurM(e.target.value)} />
                <span>min</span>
              </div>
              <small>Atual: {focoFmtMin(registro.duracao_min)}</small>
            </div>

            <div className="foco-record-time-box">
              <label>Pausa total</label>
              <div>
                <input type="number" min="0" max="24" value={pausaH} onChange={(e) => setPausaH(e.target.value)} />
                <span>h</span>
                <input type="number" min="0" max="59" value={pausaM} onChange={(e) => setPausaM(e.target.value)} />
                <span>min</span>
              </div>
              <small>Atual: {registro.duracao_pausada_min ? focoFmtMin(registro.duracao_pausada_min) : "sem pausa"}</small>
            </div>
          </div>

          <div className="field">
            <label>Motivo da correção <span className="foco-record-optional">(opcional)</span></label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: timer ficou aberto após a reunião, pausa não foi retomada…"
            />
          </div>

          {historico.length > 0 && (
            <div className="foco-record-audit">
              <div className="foco-record-audit-title">Histórico de correções administrativas</div>
              {historico.map((a, i) => (
                <div className="foco-record-audit-item" key={(a.criado_em || "ajuste") + i}>
                  <div>
                    <strong>{a.admin_nome || "Admin"}</strong>
                    <span>{focoFmtDate(a.criado_em)}</span>
                  </div>
                  <p>
                    Duração: {focoFmtMin(a.duracao_min_anterior)} → {focoFmtMin(a.duracao_min_nova)}
                    {" · "}Pausa: {focoFmtMin(a.duracao_pausada_min_anterior)} → {focoFmtMin(a.duracao_pausada_min_nova)}
                  </p>
                  {a.motivo && <small>{a.motivo}</small>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ flex:1 }}></div>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-envox" onClick={salvar} disabled={!alterou || saving}>
            {saving ? "Salvando…" : "Salvar correção"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FocoRelatorioScreen() {
  const toast = EnvoxersShared.useToast();
  const hoje = new Date();
  const ini30 = new Date(hoje);
  ini30.setDate(hoje.getDate() - 29);

  const [inicio, setInicio] = useStateFR(focoIsoDate(ini30));
  const [fim, setFim] = useStateFR(focoIsoDate(hoje));
  const [envoxerId, setEnvoxerId] = useStateFR("");
  const [origem, setOrigem] = useStateFR("");
  const [dados, setDados] = useStateFR(null);
  const [loading, setLoading] = useStateFR(true);
  const [aba, setAba] = useStateFR("equipe");
  const [registroEditando, setRegistroEditando] = useStateFR(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ inicio, fim });
      if (envoxerId) p.set("envoxer_id", envoxerId);
      if (origem) p.set("origem", origem);
      const res = await EnvoxersAPI.api("/foco/admin/relatorio?" + p.toString());
      setDados(res);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectFR(() => { carregar(); }, [inicio, fim, envoxerId, origem]);

  const preset = (tipo) => {
    const end = new Date();
    let start = new Date(end);
    if (tipo === "hoje") {
      start = new Date(end);
    } else if (tipo === "7d") {
      start.setDate(end.getDate() - 6);
    } else if (tipo === "30d") {
      start.setDate(end.getDate() - 29);
    } else if (tipo === "mes") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    }
    setInicio(focoIsoDate(start));
    setFim(focoIsoDate(end));
  };

  const exportar = () => {
    if (!dados) return;
    const linhas = [
      ["Envoxer","Cargo","Horas","Sessões","Dias com Foco","Média/dia","Média/sessão","Operação","Comercial","Avulsas","Ajustados"],
      ...dados.equipe.map((p) => [
        p.nome,p.cargo || "",(p.total_min/60).toFixed(2),p.sessoes,p.dias_com_foco,
        (p.media_dia_min/60).toFixed(2),(p.media_sessao_min/60).toFixed(2),
        (p.operacao_min/60).toFixed(2),(p.comercial_min/60).toFixed(2),(p.avulsa_min/60).toFixed(2),p.registros_ajustados
      ])
    ];
    const csv = linhas.map((l) => l.map((v) => '"' + String(v ?? "").replace(/"/g,'""') + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download="focos-time-"+inicio+"-"+fim+".csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const maxDia = useMemoFR(() => {
    if (!dados || !dados.dias.length) return 1;
    return Math.max(...dados.dias.map((d) => d.total_min), 1);
  }, [dados]);

  const maxContexto = useMemoFR(() => {
    if (!dados || !dados.contextos.length) return 1;
    return Math.max(...dados.contextos.slice(0,10).map((d) => d.total_min), 1);
  }, [dados]);

  return (
    <div className="page foco-report-page">
      <EnvoxersShared.PageHeader
        title="Focos do time"
        subtitle="Relatório administrativo do tempo apontado em Operação, Comercial e Demandas avulsas."
        actions={<button className="btn" onClick={exportar} disabled={!dados}>Exportar CSV</button>}
      />

      <div className="foco-report-filters">
        <div className="foco-report-presets">
          <button onClick={() => preset("hoje")}>Hoje</button>
          <button onClick={() => preset("7d")}>7 dias</button>
          <button onClick={() => preset("30d")}>30 dias</button>
          <button onClick={() => preset("mes")}>Este mês</button>
        </div>
        <div className="field">
          <label>De</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="field">
          <label>Até</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="field">
          <label>Pessoa</label>
          <select value={envoxerId} onChange={(e) => setEnvoxerId(e.target.value)}>
            <option value="">Todo o time</option>
            {(dados?.pessoas_opcoes || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Origem</label>
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Todas</option>
            <option value="operacao">Operação</option>
            <option value="comercial">Comercial</option>
            <option value="avulsa">Demandas avulsas</option>
          </select>
        </div>
      </div>

      {loading && <div className="app-loading">Calculando Focos…</div>}

      {!loading && dados && (
        <>
          <div className="foco-report-kpis">
            <div className="foco-report-kpi">
              <span>Total apontado</span>
              <strong>{focoFmtMin(dados.resumo.total_min)}</strong>
              <small>{dados.resumo.total_sessoes} sessão(ões)</small>
            </div>
            <div className="foco-report-kpi">
              <span>Pessoas com Foco</span>
              <strong>{dados.resumo.pessoas_com_foco}</strong>
              <small>{dados.resumo.ativos_agora} em Foco agora</small>
            </div>
            <div className="foco-report-kpi">
              <span>Média por dia registrado</span>
              <strong>{focoFmtMin(dados.resumo.media_dia_min)}</strong>
              <small>{dados.resumo.dias_com_registro} dia(s) com apontamento</small>
            </div>
            <div className="foco-report-kpi">
              <span>Média por sessão</span>
              <strong>{focoFmtMin(dados.resumo.media_sessao_min)}</strong>
              <small>tempo líquido, sem pausas</small>
            </div>
            <div className="foco-report-kpi">
              <span>Registros ajustados</span>
              <strong>{dados.resumo.registros_ajustados}</strong>
              <small>ajustes aprovados pela gestão</small>
            </div>
          </div>

          <div className="foco-report-panels">
            <section className="foco-report-panel foco-report-daily">
              <div className="foco-report-panel-head">
                <div><h2>Horas por dia</h2><p>Volume de Foco registrado no período.</p></div>
              </div>
              {dados.dias.length === 0 ? <div className="empty compact">Sem registros no período.</div> : (
                <div className="foco-day-chart">
                  {dados.dias.map((d) => (
                    <div className="foco-day-col" key={d.data} title={focoFmtDay(d.data)+" · "+focoFmtMin(d.total_min)+" · "+d.pessoas+" pessoa(s)"}>
                      <div className="foco-day-value">{focoFmtMin(d.total_min)}</div>
                      <div className="foco-day-track"><div className="foco-day-bar" style={{ height: Math.max(4, Math.round((d.total_min/maxDia)*100))+"%" }}></div></div>
                      <div className="foco-day-label">{focoFmtDay(d.data)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="foco-report-panel">
              <div className="foco-report-panel-head">
                <div><h2>Distribuição do tempo</h2><p>De onde vêm as horas apontadas.</p></div>
              </div>
              <div className="foco-origin-list">
                {dados.origens.map((o) => (
                  <div className={"foco-origin-row origin-"+o.origem} key={o.origem}>
                    <div className="foco-origin-top"><strong>{o.label}</strong><span>{focoFmtMin(o.total_min)} · {o.percentual}%</span></div>
                    <div className="foco-origin-track"><span style={{ width: Math.max(0,o.percentual)+"%" }}></span></div>
                    <small>{o.sessoes} sessão(ões)</small>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="foco-report-panel">
            <div className="foco-report-panel-head">
              <div><h2>Onde o tempo foi usado</h2><p>Principais clientes, leads e contextos de demandas avulsas.</p></div>
            </div>
            {dados.contextos.length === 0 ? <div className="empty compact">Sem contexto registrado.</div> : (
              <div className="foco-context-list">
                {dados.contextos.slice(0,10).map((c, i) => (
                  <div className="foco-context-row" key={c.origem+"-"+c.contexto}>
                    <span className="foco-context-rank">{i+1}</span>
                    <div className="foco-context-main">
                      <div><strong>{c.contexto}</strong><span>{c.origem === "operacao" ? "Operação" : c.origem === "comercial" ? "Comercial" : "Avulsa"}</span></div>
                      <div className="foco-context-track"><span style={{ width: Math.max(2,Math.round((c.total_min/maxContexto)*100))+"%" }}></span></div>
                    </div>
                    <div className="foco-context-value"><strong>{focoFmtMin(c.total_min)}</strong><span>{c.percentual}%</span></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="foco-report-tabs">
            <button className={aba === "equipe" ? "active" : ""} onClick={() => setAba("equipe")}>Equipe</button>
            <button className={aba === "registros" ? "active" : ""} onClick={() => setAba("registros")}>Registros</button>
          </div>

          {aba === "equipe" && (
            <div className="table-wrap foco-team-table">
              <table>
                <thead>
                  <tr>
                    <th>Envoxer</th>
                    <th>Total</th>
                    <th>Dias</th>
                    <th>Média/dia</th>
                    <th>Sessões</th>
                    <th>Operação</th>
                    <th>Comercial</th>
                    <th>Avulsas</th>
                    <th>Último Foco</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.equipe.length === 0 && <tr><td colSpan="9">Nenhum registro no período.</td></tr>}
                  {dados.equipe.map((p) => (
                    <tr key={p.envoxer_id}>
                      <td>
                        <button
                          type="button"
                          className="foco-person foco-person-link"
                          onClick={() => {
                            setEnvoxerId(String(p.envoxer_id));
                            setAba("registros");
                          }}
                          title={"Abrir registros de " + p.nome}
                        >
                          <EnvoxersShared.Avatar nome={p.nome} fotoUrl={p.foto_url} envoxerId={p.envoxer_id} />
                          <div><strong>{p.nome}</strong><span>{p.cargo || "—"}{p.ativo_agora ? " · Foco ativo" : ""}</span></div>
                        </button>
                      </td>
                      <td className="td-num"><strong>{focoFmtMin(p.total_min)}</strong></td>
                      <td className="td-num">{p.dias_com_foco}</td>
                      <td className="td-num">{focoFmtMin(p.media_dia_min)}</td>
                      <td className="td-num">{p.sessoes}</td>
                      <td className="td-num">{focoFmtMin(p.operacao_min)}</td>
                      <td className="td-num">{focoFmtMin(p.comercial_min)}</td>
                      <td className="td-num">{focoFmtMin(p.avulsa_min)}</td>
                      <td>{focoFmtDate(p.ultimo_inicio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aba === "registros" && (
            <div className="table-wrap foco-register-table">
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Data / início</th>
                    <th>Origem</th>
                    <th>Contexto</th>
                    <th>Atividade</th>
                    <th>Observação</th>
                    <th>Duração</th>
                    <th>Pausas</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.registros.length === 0 && <tr><td colSpan="9">Nenhum registro no período.</td></tr>}
                  {dados.registros.map((r) => (
                    <tr key={r.id}>
                      <td className="td-primary">{r.envoxer_nome}</td>
                      <td>{focoFmtDate(r.inicio)}</td>
                      <td><span className={"foco-origin-chip "+r.origem}>{r.origem === "operacao" ? "Operação" : r.origem === "comercial" ? "Comercial" : "Avulsa"}</span></td>
                      <td>{r.contexto || "—"}</td>
                      <td>{r.titulo || "—"}</td>
                      <td className="foco-register-observation" title={r.comentario || ""}>{r.comentario || "—"}</td>
                      <td className="td-num"><strong>{focoFmtMin(r.duracao_min)}</strong></td>
                      <td className="td-num">{r.duracao_pausada_min ? focoFmtMin(r.duracao_pausada_min) : "—"}</td>
                      <td>
                        <div className="foco-register-actions">
                          {r.ajustado && <span className="foco-adjusted-chip">AJUSTADO</span>}
                          <button className="btn btn-sm foco-record-edit-btn" onClick={() => setRegistroEditando(r)}>Editar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {registroEditando && (
        <FocoRegistroEditarModal
          registro={registroEditando}
          onClose={() => setRegistroEditando(null)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}

window.FocoRelatorioScreen = FocoRelatorioScreen;
