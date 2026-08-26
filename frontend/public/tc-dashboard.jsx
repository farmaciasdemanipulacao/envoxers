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

// Lista reorganizável (drag-and-drop) das "prioridades de hoje" — usada tanto
// pro bloco de Cards quanto pro de Tarefas/Etapas. Ordem local é otimista
// (arrastar já reflete na hora); o PATCH persiste a ordem final no drop, mesmo
// padrão de tc-servicos.jsx::EtapasTemplateModal (reordenar etapas-modelo).
function PrioridadeListaDash({ tipo, itensBase, ownerId, podeArrastar, onAbrir, toast }) {
  const [itens, setItens] = useStateDash(itensBase);
  const [dragId, setDragId] = useStateDash(null);
  const [salvando, setSalvando] = useStateDash(false);

  useEffectDash(() => { setItens(itensBase); }, [itensBase]);

  const handleDragStart = (e, item) => {
    if (!podeArrastar || salvando) return;
    setDragId(item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(item.id));
  };

  const handleDragOverItem = (e, item) => {
    if (!podeArrastar) return;
    e.preventDefault();
    if (dragId === null || dragId === item.id) return;
    setItens((prev) => {
      const fromIdx = prev.findIndex((i) => i.id === dragId);
      const toIdx = prev.findIndex((i) => i.id === item.id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [movido] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, movido);
      return next;
    });
  };

  const handleDragEnd = async () => {
    if (!podeArrastar) return;
    setDragId(null);
    setSalvando(true);
    try {
      await EnvoxersAPI.api("/tarefas/prioridades-dia", {
        method: "PATCH",
        body: JSON.stringify({ tipo, envoxer_id: Number(ownerId), ids_em_ordem: itens.map((i) => i.id) }),
      });
    } catch (err) {
      toast(err.message, "error");
      setItens(itensBase);
    } finally {
      setSalvando(false);
    }
  };

  if (itens.length === 0) {
    return <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>— nada urgente por aqui —</div>;
  }

  return (
    <div className="dash-priority-list">
      {itens.map((item) => (
        <div
          key={item.id}
          className={"dash-priority-item" + (item.cliente_farol ? " farol-" + item.cliente_farol : "") + (item.atrasada ? " atrasada" : "") + (dragId === item.id ? " dragging" : "")}
          draggable={podeArrastar}
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={(e) => handleDragOverItem(e, item)}
          onDrop={(e) => e.preventDefault()}
          onDragEnd={handleDragEnd}
          onClick={() => onAbrir(item)}
        >
          {podeArrastar && (
            <span className="dash-priority-drag-handle" title="Arrastar para reordenar" onClick={(e) => e.stopPropagation()}>
              <EnvoxersShared.IconArrastar />
            </span>
          )}
          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: item.cliente_farol ? FAROL_CORES_DASH[item.cliente_farol] : "var(--ink-4)" }}></span>
          <div className="dash-item-title">
            {item.cliente_nome} — {tipo === "etapa" ? `${item.tarefa_titulo} · ${item.titulo}` : item.titulo}
          </div>
          <span className="dash-item-meta">{fmtPrazoDash(item.prazo)}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardScreen({ permissao, envoxerId, dataVersion, onAbrirTarefa, onNavigate }) {
  const [loading, setLoading] = useStateDash(true);
  const [dados, setDados] = useStateDash(null);
  const [resumoFoco, setResumoFoco] = useStateDash(null);
  const [farolWidget, setFarolWidget] = useStateDash([]);
  const [eventosHoje, setEventosHoje] = useStateDash([]);
  const [relatorioRapido, setRelatorioRapido] = useStateDash([]);
  const [pendencias, setPendencias] = useStateDash([]);
  const [envoxersList, setEnvoxersList] = useStateDash([]);
  // Todo mundo abre o Dashboard já filtrado em si mesmo (colaborador, gestor ou
  // admin — é a tela inicial do sistema), continua vendo tudo, só troca quem quiser
  // ver outra pessoa. Esse mesmo filtro é quem define DE QUEM é a lista de
  // prioridades sendo reorganizada.
  const [filtroResponsavel, setFiltroResponsavel] = useStateDash(envoxerId ? String(envoxerId) : "");
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";
  const podeVerValores = permissao === "admin";
  const ehGestorOuAdmin = permissao === "gestor" || permissao === "admin";

  const carregar = async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      // /relatorio/tempo-custo agora é aberto a todo mundo (valores vêm redigidos
      // pra quem não é admin/gestor) — o widget "Relatório rápido" abaixo trata isso.
      const [dash, resumo, farol, calendario, relatorio, pend, envs] = await Promise.all([
        EnvoxersAPI.api("/tarefas/dashboard-dia"),
        EnvoxersAPI.api("/foco/resumo"),
        EnvoxersAPI.api("/farol"),
        EnvoxersAPI.api(`/calendario?ano=${hoje.getFullYear()}&mes=${hoje.getMonth() + 1}`),
        EnvoxersAPI.api("/relatorio/tempo-custo?agrupar=cliente&periodo=mes"),
        EnvoxersAPI.api("/pendencias"),
        EnvoxersAPI.api("/envoxers"),
      ]);
      setDados(dash);
      setResumoFoco(resumo);
      setFarolWidget(farol.filter((f) => f.farol !== "verde").slice(0, 5));
      const hojeStr = hoje.toISOString().slice(0, 10);
      setEventosHoje(calendario.filter((ev) => ev.data === hojeStr && ev.tipo !== "tarefa"));
      // margem_pct vem null pra quem não vê valor (redigido no backend) — sem dado
      // real pra ordenar por margem, mostra os de maior custo em vez de filtrar tudo.
      const relevantes = podeVerValores
        ? relatorio.itens.filter((i) => i.margem_pct != null)
        : relatorio.itens.slice().sort((a, b) => b.custo_horas - a.custo_horas);
      setRelatorioRapido(relevantes.slice(0, 4));
      setPendencias(pend);
      setEnvoxersList(envs.filter((e) => e.ativo));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirPendencia = async (pendencia) => {
    try {
      await EnvoxersAPI.api(`/pendencias/${pendencia.id}/lida`, { method: "PATCH" });
      setPendencias((prev) => prev.filter((p) => p.id !== pendencia.id));
    } catch (err) {
      // não bloqueia a navegação por causa disso
    }
    onAbrirTarefa(pendencia.tarefa_id);
  };

  useEffectDash(() => { carregar(); }, [dataVersion]);

  const hoje = new Date();
  const dataHoje = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const renderLista = (itens, { atrasada, aoAbrir } = {}) => {
    if (!itens || itens.length === 0) {
      return <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>— nada por aqui —</div>;
    }
    return itens.map((item) => (
      <div key={item.id} className={"dash-item" + (atrasada ? " atrasada" : "")} onClick={() => (aoAbrir ? aoAbrir(item) : onAbrirTarefa(item.id))}>
        <div className="dash-item-title">{item.cliente_nome} — {item.tarefa_titulo ? `${item.tarefa_titulo} · ${item.titulo}` : item.titulo}</div>
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

  const filtrar = (lista) => (filtroResponsavel ? lista.filter((t) => String(t.responsavel_envoxer_id) === filtroResponsavel) : lista);

  // Reordenar só faz sentido com UMA pessoa selecionada (a lista mistura donos
  // diferentes em "Todos") — envoxer só reorganiza a própria, gestor/admin
  // reorganizam a de qualquer um (basta escolher no filtro acima).
  const temPessoaSelecionada = !!filtroResponsavel;
  const podeArrastar = temPessoaSelecionada && (ehGestorOuAdmin || filtroResponsavel === String(envoxerId));
  const cardsPrioridades = filtrar(dados.cards.prioridades_hoje);
  const etapasPrioridades = filtrar(dados.etapas.prioridades_hoje);
  const qtdAtrasadasCards = cardsPrioridades.filter((i) => i.atrasada).length;
  const qtdAtrasadasEtapas = etapasPrioridades.filter((i) => i.atrasada).length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Dashboard do dia</h1>
          <div className="page-sub">O que precisa acontecer hoje — separado entre prazo de card e prazo de tarefa/etapa, ordenado por prioridade.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <select className="chip" value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 500 }}>
            {dataHoje}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-card dash-priority-card">
          <div className="dash-card-head">
            <div className="dash-card-title">📅 Prioridades de hoje — Cards <EnvoxersShared.HelpIcon helpKey="dash_prioridades_cards" /></div>
            <div className="dash-card-count" style={{ color: qtdAtrasadasCards > 0 ? "var(--farol-vermelho)" : "var(--ink)" }}>{cardsPrioridades.length}</div>
          </div>
          {!podeArrastar && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8, fontStyle: "italic" }}>
              {temPessoaSelecionada ? "Você só reorganiza as suas próprias prioridades." : "Selecione uma pessoa no filtro acima pra reorganizar a ordem."}
            </div>
          )}
          <PrioridadeListaDash tipo="card" itensBase={cardsPrioridades} ownerId={filtroResponsavel} podeArrastar={podeArrastar} onAbrir={(item) => onAbrirTarefa(item.id)} toast={toast} />
        </div>

        <div className="dash-card dash-priority-card">
          <div className="dash-card-head">
            <div className="dash-card-title">☑️ Prioridades de hoje — Tarefas/Etapas <EnvoxersShared.HelpIcon helpKey="dash_prioridades_etapas" /></div>
            <div className="dash-card-count" style={{ color: qtdAtrasadasEtapas > 0 ? "var(--farol-vermelho)" : "var(--ink)" }}>{etapasPrioridades.length}</div>
          </div>
          {!podeArrastar && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8, fontStyle: "italic" }}>
              {temPessoaSelecionada ? "Você só reorganiza as suas próprias prioridades." : "Selecione uma pessoa no filtro acima pra reorganizar a ordem."}
            </div>
          )}
          <PrioridadeListaDash tipo="etapa" itensBase={etapasPrioridades} ownerId={filtroResponsavel} podeArrastar={podeArrastar} onAbrir={(item) => onAbrirTarefa(item.tarefa_id)} toast={toast} />
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Em andamento <EnvoxersShared.HelpIcon helpKey="dash_progress" /></div>
            <div className="dash-card-count">{filtrar(dados.cards.em_andamento).length}</div>
          </div>
          <div className="dash-list">{renderLista(filtrar(dados.cards.em_andamento))}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title" style={{ color: "var(--farol-amarelo)" }}>Aprovações pendentes <EnvoxersShared.HelpIcon helpKey="dash_approvals" /></div>
            <div className="dash-card-count" style={{ color: "var(--farol-amarelo)" }}>{filtrar(dados.cards.aprovacoes_pendentes).length}</div>
          </div>
          <div className="dash-list">{renderLista(filtrar(dados.cards.aprovacoes_pendentes))}</div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Pendências <EnvoxersShared.HelpIcon helpKey="dash_pendencias" /></div>
            <div className="dash-card-count">{pendencias.length}</div>
          </div>
          <div className="dash-list">
            {pendencias.length === 0 ? (
              <div className="dash-item" style={{ cursor: "default", color: "var(--ink-4)" }}>— nada por aqui —</div>
            ) : pendencias.map((p) => (
              <div key={p.id} className="dash-item" onClick={() => handleAbrirPendencia(p)}>
                <div className="dash-item-title">{p.tarefa_titulo}</div>
                <span className="dash-item-meta">{p.mensagem}</span>
              </div>
            ))}
          </div>
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
              <div className="hint">
                {resumoFoco.hoje_sessoes} sessão(ões)
                {resumoFoco.hoje_custo != null && <> · <span className="mono">{EnvoxersShared.formatMoney(resumoFoco.hoje_custo)}</span> gerados</>}
              </div>
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
            <div className="dash-card-title">Cards vencendo nos próximos 3 dias <EnvoxersShared.HelpIcon helpKey="dash_next3" /></div>
            <div className="dash-card-count">{filtrar(dados.cards.proximas_entregas).length}</div>
          </div>
          <div className="dash-list">{renderLista(filtrar(dados.cards.proximas_entregas))}</div>
        </div>

        <div className="dash-card wide">
          <div className="dash-card-head">
            <div className="dash-card-title">Tarefas/Etapas vencendo nos próximos 3 dias <EnvoxersShared.HelpIcon helpKey="dash_next3_etapas" /></div>
            <div className="dash-card-count">{filtrar(dados.etapas.proximos_3_dias).length}</div>
          </div>
          <div className="dash-list">{renderLista(filtrar(dados.etapas.proximos_3_dias), { aoAbrir: (item) => onAbrirTarefa(item.tarefa_id) })}</div>
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
            {isAdmin && (
              <a onClick={() => onNavigate("relatorio")} className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>Ver relatório completo →</a>
            )}
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
                    {podeVerValores && <th style={{ textAlign: "right" }}>Contrato</th>}
                    {podeVerValores && <th style={{ textAlign: "right" }}>Margem</th>}
                    {podeVerValores && <th>Situação</th>}
                  </tr>
                </thead>
                <tbody>
                  {relatorioRapido.map((r) => {
                    const cor = podeVerValores ? (r.margem_pct < 10 ? "vermelho" : r.margem_pct < 20 ? "amarelo" : "verde") : null;
                    const situacao = cor === "vermelho" ? "Crítico" : cor === "amarelo" ? "Atenção" : "Saudável";
                    return (
                      <tr key={r.cliente_id}>
                        <td className="td-primary">{r.cliente_nome}</td>
                        <td className="td-num" style={{ textAlign: "right" }}>{r.horas.toFixed(1)}h</td>
                        <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(r.custo_horas)}</td>
                        {podeVerValores && <td className="td-num" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(r.valor_contrato)}</td>}
                        {podeVerValores && <td className="td-num" style={{ textAlign: "right", color: `var(--farol-${cor})`, fontWeight: 600 }}>{r.margem_pct}%</td>}
                        {podeVerValores && <td><span className={`farol farol-${cor}`}><span className="farol-dot"></span> {situacao}</span></td>}
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
