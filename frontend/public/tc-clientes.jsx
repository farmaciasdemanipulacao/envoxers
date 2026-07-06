const { useState: useStateCli, useEffect: useEffectCli, useMemo: useMemoCli } = React;

const SEGMENTOS_SUGERIDOS = [
  "Farmácia de manipulação", "Clínica estética", "Clínica odontológica",
  "Advocacia", "Imobiliária", "E-commerce", "Restaurante",
];

const METODO_PULSO_LABELS = {
  ligacao: "Ligação", pesquisa: "Pesquisa", estimativa_interna: "Estimativa interna", conversa_avulsa: "Conversa avulsa",
};
const TIPO_CHECKIN_LABELS = {
  ligacao: "Ligação", reuniao: "Reunião", mensagem: "Mensagem", email: "E-mail", presencial: "Presencial",
};
const MOTIVO_CHECKIN_LABELS = {
  rotina: "Rotina", checkpoint_retencao: "Checkpoint de retenção", alerta_farol: "Alerta do farol",
  alteracao_escopo: "Alteração de escopo", outro: "Outro",
};
const HUMOR_CHECKIN_LABELS = { positivo: "Positivo", neutro: "Neutro", negativo: "Negativo", critico: "Crítico" };
const HUMOR_CHECKIN_COLOR = { positivo: "var(--farol-verde)", neutro: "var(--farol-amarelo)", negativo: "var(--farol-vermelho)", critico: "var(--farol-vermelho)" };

function anoMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function agoraDatetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function formatDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDataCurta(iso) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}

function ClientesScreen({ permissao }) {
  const [clientes, setClientes] = useStateCli([]);
  const [loading, setLoading] = useStateCli(true);
  const [busca, setBusca] = useStateCli("");
  const [filtroFarol, setFiltroFarol] = useStateCli("todos");
  const [editando, setEditando] = useStateCli(null); // null = lista, {} = novo, {id} = editar
  const toast = EnvoxersShared.useToast();
  const podeEditar = permissao === "admin" || permissao === "gestor";

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/clientes");
      setClientes(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectCli(() => { carregar(); }, []);

  const filtrados = useMemoCli(() => {
    return clientes.filter((c) => {
      if (filtroFarol !== "todos" && c.status_farol !== filtroFarol) return false;
      if (busca && !(`${c.nome} ${c.segmento || ""}`.toLowerCase().includes(busca.toLowerCase()))) return false;
      return true;
    });
  }, [clientes, busca, filtroFarol]);

  const kpis = useMemoCli(() => {
    const ativos = clientes.filter((c) => c.ativo);
    const mrr = ativos.filter((c) => c.tipo_receita === "recorrente").reduce((s, c) => s + c.valor_contrato, 0);
    const vermelhos = clientes.filter((c) => c.status_farol === "vermelho").length;
    return { ativos: ativos.length, mrr, vermelhos };
  }, [clientes]);

  if (editando !== null) {
    return (
      <ClienteForm
        clienteId={editando.id || null}
        onCancel={() => setEditando(null)}
        onSaved={() => { setEditando(null); carregar(); }}
      />
    );
  }

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Clientes"
        subtitle="Base viva de contas atendidas. Cada cliente carrega dados de contrato + ICP."
        actions={podeEditar && (
          <button className="btn btn-envox" onClick={() => setEditando({})}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Novo cliente
          </button>
        )}
      />

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Ativos</div>
          <div className="kpi-value">{kpis.ativos}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">MRR contratado</div>
          <div className="kpi-value"><span className="unit">R$</span> {kpis.mrr.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Farol vermelho</div>
          <div className="kpi-value" style={{ color: "var(--farol-vermelho)" }}>{kpis.vermelhos}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <input type="text" placeholder="Buscar por nome, segmento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="filter-group">
          <button className={"chip" + (filtroFarol === "todos" ? " active" : "")} onClick={() => setFiltroFarol("todos")}>Todos</button>
          <button className={"chip" + (filtroFarol === "verde" ? " active" : "")} onClick={() => setFiltroFarol("verde")}>
            <span className="farol-dot" style={{ width: 7, height: 7, background: "var(--farol-verde)", boxShadow: "none", display: "inline-block", borderRadius: "50%" }}></span> Verde
          </button>
          <button className={"chip" + (filtroFarol === "amarelo" ? " active" : "")} onClick={() => setFiltroFarol("amarelo")}>
            <span className="farol-dot" style={{ width: 7, height: 7, background: "var(--farol-amarelo)", boxShadow: "none", display: "inline-block", borderRadius: "50%" }}></span> Amarelo
          </button>
          <button className={"chip" + (filtroFarol === "vermelho" ? " active" : "")} onClick={() => setFiltroFarol("vermelho")}>
            <span className="farol-dot" style={{ width: 7, height: 7, background: "var(--farol-vermelho)", boxShadow: "none", display: "inline-block", borderRadius: "50%" }}></span> Vermelho
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>Cliente</th>
              <th className="table-mobile-hide">Segmento</th>
              <th className="table-mobile-hide">Responsável</th>
              <th className="table-mobile-hide">Meses</th>
              <th style={{ textAlign: "right" }}>Contrato/mês</th>
              <th style={{ width: 80 }} className="table-mobile-hide">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="7">Carregando…</td></tr>}
            {!loading && filtrados.length === 0 && <tr><td colSpan="7">Nenhum cliente encontrado.</td></tr>}
            {filtrados.map((c) => (
              <tr key={c.id} onClick={() => podeEditar && setEditando({ id: c.id })} style={{ cursor: podeEditar ? "pointer" : "default" }}>
                <td><span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: `var(--farol-${c.status_farol})` }}></span></td>
                <td>{c.nome}</td>
                <td className="table-mobile-hide">{c.segmento || "—"}</td>
                <td className="table-mobile-hide">{c.responsavel_nome || "—"}</td>
                <td className="table-mobile-hide">{c.meses_de_casa ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(c.valor_contrato)}</td>
                <td className="table-mobile-hide">{c.tipo_receita === "recorrente" ? "Recorrente" : "Pontual"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hero-quote" style={{ marginTop: 40 }}>
        Registrar o cliente completo agora — segmento, canal, ticket, maturidade —
        é o que faz o <em>ICP builder</em> funcionar em F3. Cadastro pobre em F0 = ICP cego em F3.
      </div>
    </div>
  );
}

function ClienteForm({ clienteId, onCancel, onSaved }) {
  const isEdit = !!clienteId;
  const toast = EnvoxersShared.useToast();
  const [loading, setLoading] = useStateCli(isEdit);
  const [saving, setSaving] = useStateCli(false);
  const [secaoAtiva, setSecaoAtiva] = useStateCli(0);

  const [envoxersList, setEnvoxersList] = useStateCli([]);
  const [servicosList, setServicosList] = useStateCli([]);

  const [nome, setNome] = useStateCli("");
  const [responsavelId, setResponsavelId] = useStateCli("");
  const [logoUrl, setLogoUrl] = useStateCli("");
  const [valorContrato, setValorContrato] = useStateCli(0);
  const [tipoReceita, setTipoReceita] = useStateCli("recorrente");
  const [dataInicio, setDataInicio] = useStateCli("");
  const [segmento, setSegmento] = useStateCli("");
  const [canalAquisicao, setCanalAquisicao] = useStateCli("");
  const [ticket, setTicket] = useStateCli("");
  const [maturidade, setMaturidade] = useStateCli("media");
  const [servicosSelecionados, setServicosSelecionados] = useStateCli({}); // { servico_id: valor_mensal }
  const [postsMes, setPostsMes] = useStateCli(0);
  const [videosMes, setVideosMes] = useStateCli(0);
  const [campanhasMes, setCampanhasMes] = useStateCli(0);
  const [limiteAlteracoes, setLimiteAlteracoes] = useStateCli(2);
  const [outrosItens, setOutrosItens] = useStateCli("");
  const [instagram, setInstagram] = useStateCli("");
  const [facebook, setFacebook] = useStateCli("");
  const [site, setSite] = useStateCli("");
  const [observacoes, setObservacoes] = useStateCli("");

  const [pulsoList, setPulsoList] = useStateCli([]);
  const [checkinList, setCheckinList] = useStateCli([]);
  const [savingPulso, setSavingPulso] = useStateCli(false);
  const [savingCheckin, setSavingCheckin] = useStateCli(false);
  const [pulsoAnoMes, setPulsoAnoMes] = useStateCli(anoMesAtual());
  const [pulsoNota, setPulsoNota] = useStateCli(8);
  const [pulsoMetodo, setPulsoMetodo] = useStateCli("ligacao");
  const [pulsoRespondente, setPulsoRespondente] = useStateCli("");
  const [pulsoComentario, setPulsoComentario] = useStateCli("");
  const [checkinData, setCheckinData] = useStateCli(agoraDatetimeLocal());
  const [checkinTipo, setCheckinTipo] = useStateCli("ligacao");
  const [checkinMotivo, setCheckinMotivo] = useStateCli("rotina");
  const [checkinHumor, setCheckinHumor] = useStateCli("");
  const [checkinObs, setCheckinObs] = useStateCli("");
  const [checkinProximo, setCheckinProximo] = useStateCli("");

  const carregarPulsoCheckin = async () => {
    if (!isEdit) return;
    try {
      const [pulsos, checkins] = await Promise.all([
        EnvoxersAPI.api(`/clientes/${clienteId}/pulso`),
        EnvoxersAPI.api(`/clientes/${clienteId}/checkins`),
      ]);
      setPulsoList(pulsos);
      setCheckinList(checkins);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectCli(() => {
    (async () => {
      try {
        const [envs, servs] = await Promise.all([
          EnvoxersAPI.api("/envoxers"),
          EnvoxersAPI.api("/servicos"),
        ]);
        setEnvoxersList(envs.filter((e) => e.ativo));
        setServicosList(servs.filter((s) => s.ativo));

        if (isEdit) {
          const c = await EnvoxersAPI.api(`/clientes/${clienteId}`);
          setNome(c.nome || "");
          setResponsavelId(c.responsavel_envoxer_id || "");
          setLogoUrl(c.logo_url || "");
          setValorContrato(c.valor_contrato || 0);
          setTipoReceita(c.tipo_receita || "recorrente");
          setDataInicio(c.data_inicio_contrato || "");
          setSegmento(c.segmento || "");
          setCanalAquisicao(c.canal_aquisicao || "");
          setTicket(c.ticket ?? "");
          setMaturidade(c.maturidade_digital || "media");
          setObservacoes(c.observacoes || "");
          if (c.links_redes) {
            setInstagram(c.links_redes.instagram || "");
            setFacebook(c.links_redes.facebook || "");
            setSite(c.links_redes.site || "");
          }
          await carregarPulsoCheckin();
        }
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [clienteId]);

  const somaServicos = useMemoCli(() => {
    return Object.values(servicosSelecionados).reduce((s, v) => s + (Number(v.valor_mensal) || 0), 0);
  }, [servicosSelecionados]);

  const toggleServico = (servicoId) => {
    setServicosSelecionados((prev) => {
      const next = { ...prev };
      if (next[servicoId]) {
        delete next[servicoId];
      } else {
        next[servicoId] = { valor_mensal: 0 };
      }
      return next;
    });
  };

  const setValorServico = (servicoId, valor) => {
    setServicosSelecionados((prev) => ({ ...prev, [servicoId]: { valor_mensal: valor } }));
  };

  const handleSave = async () => {
    if (!nome || !segmento) {
      toast("Nome e segmento são obrigatórios", "error");
      setSecaoAtiva(0);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome,
        logo_url: logoUrl || null,
        responsavel_envoxer_id: responsavelId ? Number(responsavelId) : null,
        valor_contrato: Number(valorContrato),
        tipo_receita: tipoReceita,
        data_inicio_contrato: dataInicio || null,
        segmento,
        canal_aquisicao: canalAquisicao || null,
        ticket: ticket === "" ? null : Number(ticket),
        maturidade_digital: maturidade,
        links_redes: { instagram, facebook, site },
        observacoes: observacoes || null,
        servicos: Object.entries(servicosSelecionados).map(([servico_id, v]) => ({
          servico_id: Number(servico_id),
          valor_mensal: Number(v.valor_mensal) || 0,
        })),
        escopo: {
          posts_mes: Number(postsMes) || 0,
          videos_mes: Number(videosMes) || 0,
          campanhas_mes: Number(campanhasMes) || 0,
          limite_alteracoes: Number(limiteAlteracoes) || 0,
          outros_itens: outrosItens || null,
        },
      };

      if (isEdit) {
        await EnvoxersAPI.api(`/clientes/${clienteId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await EnvoxersAPI.api("/clientes", { method: "POST", body: JSON.stringify(payload) });
      }
      toast("Cliente salvo!", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRegistrarPulso = async () => {
    if (!pulsoAnoMes) {
      toast("Selecione o mês do pulso", "error");
      return;
    }
    const nota = Number(pulsoNota);
    if (Number.isNaN(nota) || nota < 0 || nota > 10) {
      toast("Nota deve estar entre 0 e 10", "error");
      return;
    }
    setSavingPulso(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/pulso`, {
        method: "POST",
        body: JSON.stringify({
          ano_mes: pulsoAnoMes,
          nota,
          metodo: pulsoMetodo,
          respondente_cliente_nome: pulsoRespondente || null,
          comentario: pulsoComentario || null,
        }),
      });
      toast("Pulso registrado!", "success");
      setPulsoComentario("");
      setPulsoRespondente("");
      await carregarPulsoCheckin();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingPulso(false);
    }
  };

  const handleRegistrarCheckin = async () => {
    if (!checkinData) {
      toast("Informe a data do check-in", "error");
      return;
    }
    setSavingCheckin(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/checkins`, {
        method: "POST",
        body: JSON.stringify({
          data_realizado: checkinData,
          tipo: checkinTipo,
          motivo: checkinMotivo,
          humor: checkinHumor || null,
          observacao: checkinObs || null,
          proximo_sugerido: checkinProximo || null,
        }),
      });
      toast("Check-in registrado!", "success");
      setCheckinObs("");
      setCheckinProximo("");
      setCheckinData(agoraDatetimeLocal());
      await carregarPulsoCheckin();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingCheckin(false);
    }
  };

  if (loading) {
    return <div className="page"><div className="app-loading">Carregando cliente…</div></div>;
  }

  const secoes = ["Identidade", "Contrato", "ICP", "Serviços", "Escopo mensal", "Links & obs.", "Pulso & Check-in"];

  const proximoSugerido = checkinList.find((c) => c.proximo_sugerido && !c.proximo_realizado)?.proximo_sugerido;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
            <a onClick={onCancel} style={{ cursor: "pointer" }}>← Clientes</a>
          </div>
          <h1>{isEdit ? "Editar cliente" : "Novo cliente"}</h1>
          <div className="page-sub">Preencha tudo — os campos de ICP não são opcionais no espírito, mesmo que o formulário permita pular.</div>
        </div>
      </div>

      <div className="form-shell">
        <div className="form-side">
          <h3>Seções</h3>
          <ul className="form-tabs">
            {secoes.map((s, i) => (
              <li key={s} className={secaoAtiva === i ? "active" : ""} onClick={() => setSecaoAtiva(i)} style={{ cursor: "pointer" }}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span> {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="form-panel">

          <div className="form-section">
            <div className="form-section-title">01 · Identidade</div>
            <div className="form-section-hint">Como o cliente aparece no sistema.</div>
            <div className="form-row">
              <div className="field span-2">
                <label>Nome do cliente <span className="req">*</span></label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Farmácia Vitalis Manipulação" />
              </div>
              <div className="field">
                <label>Responsável (Envoxer)</label>
                <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                  <option value="">Selecionar…</option>
                  {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Logo (URL) <span className="hint">opcional</span></label>
                <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">02 · Contrato</div>
            <div className="form-section-hint">O que decide MRR, projeção 90d e retenção.</div>
            <div className="form-row three">
              <div className="field">
                <label>Valor do contrato/mês <span className="req">*</span></label>
                <div className="money-input"><input type="number" step="0.01" value={valorContrato} onChange={(e) => setValorContrato(e.target.value)} placeholder="0,00" /></div>
                <div className="field-help">Snapshot financeiro — pode diferir da soma dos serviços.</div>
              </div>
              <div className="field">
                <label>Tipo de receita <span className="req">*</span></label>
                <div className="seg">
                  <input type="radio" name="tipo" id="tipo-rec" checked={tipoReceita === "recorrente"} onChange={() => setTipoReceita("recorrente")} /><label htmlFor="tipo-rec">Recorrente</label>
                  <input type="radio" name="tipo" id="tipo-pon" checked={tipoReceita === "pontual"} onChange={() => setTipoReceita("pontual")} /><label htmlFor="tipo-pon">Pontual</label>
                </div>
              </div>
              <div className="field">
                <label>Início do contrato</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">03 · ICP</div>
            <div className="form-section-hint">Estes campos são o que permite, em F3, dizer <em>quem</em> devemos aceitar e quem não.</div>
            <div className="form-row">
              <div className="field">
                <label>Segmento <span className="req">*</span></label>
                <input type="text" value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex.: Farmácia de manipulação, clínica estética…" list="segmentos" />
                <datalist id="segmentos">
                  {SEGMENTOS_SUGERIDOS.map((s) => <option key={s}>{s}</option>)}
                </datalist>
              </div>
              <div className="field">
                <label>Canal de aquisição</label>
                <select value={canalAquisicao} onChange={(e) => setCanalAquisicao(e.target.value)}>
                  <option value="">—</option>
                  <option value="indicacao">Indicação</option>
                  <option value="inbound">Inbound (site/orgânico)</option>
                  <option value="outbound">Outbound (prospecção)</option>
                  <option value="evento">Evento</option>
                  <option value="sdr">SDR</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="field">
                <label>Ticket do cliente <span className="hint">faturamento dele</span></label>
                <div className="money-input"><input type="number" step="0.01" value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div className="field">
                <label>Maturidade digital</label>
                <div className="seg">
                  <input type="radio" name="mat" id="mat-b" checked={maturidade === "baixa"} onChange={() => setMaturidade("baixa")} /><label htmlFor="mat-b">Baixa</label>
                  <input type="radio" name="mat" id="mat-m" checked={maturidade === "media"} onChange={() => setMaturidade("media")} /><label htmlFor="mat-m">Média</label>
                  <input type="radio" name="mat" id="mat-a" checked={maturidade === "alta"} onChange={() => setMaturidade("alta")} /><label htmlFor="mat-a">Alta</label>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">04 · Serviços contratados</div>
            <div className="form-section-hint">Marque o que este cliente contratou e o valor por serviço.</div>
            <div className="service-grid">
              {servicosList.map((s) => {
                const sel = servicosSelecionados[s.id];
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
                    <input type="checkbox" checked={!!sel} onChange={() => toggleServico(s.id)} />
                    <span style={{ flex: 1, fontSize: 13 }}>{s.nome}</span>
                    {sel && (
                      <div className="money-input" style={{ width: 110 }}>
                        <input type="number" step="0.01" value={sel.valor_mensal} onChange={(e) => setValorServico(s.id, e.target.value)} placeholder="0,00" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
              <span>Soma dos serviços marcados</span>
              <strong style={{ color: "var(--ink)" }}>{EnvoxersShared.formatMoney(somaServicos)}</strong>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">05 · Escopo mensal</div>
            <div className="form-section-hint">Volumes contratados. O <em>limite de alterações</em> vira sinal do Farol em F2.</div>
            <div className="form-row three">
              <div className="field">
                <label>Posts/mês</label>
                <input type="number" min="0" value={postsMes} onChange={(e) => setPostsMes(e.target.value)} />
              </div>
              <div className="field">
                <label>Vídeos/mês</label>
                <input type="number" min="0" value={videosMes} onChange={(e) => setVideosMes(e.target.value)} />
              </div>
              <div className="field">
                <label>Campanhas/mês</label>
                <input type="number" min="0" value={campanhasMes} onChange={(e) => setCampanhasMes(e.target.value)} />
              </div>
              <div className="field span-2">
                <label>Limite de alterações por peça</label>
                <input type="number" min="0" value={limiteAlteracoes} onChange={(e) => setLimiteAlteracoes(e.target.value)} />
                <div className="field-help">Padrão 2. Passar disso gera alerta em F2.</div>
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Outros itens do escopo</label>
              <textarea value={outrosItens} onChange={(e) => setOutrosItens(e.target.value)} placeholder="Texto livre — ex.: 1 sessão de fotos/mês, 2 reuniões estratégicas."></textarea>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">06 · Links & observações</div>
            <div className="form-row">
              <div className="field">
                <label>Instagram</label>
                <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
              </div>
              <div className="field">
                <label>Facebook</label>
                <input type="text" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="/pagina" />
              </div>
              <div className="field span-2">
                <label>Site / outros</label>
                <input type="text" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" />
              </div>
              <div className="field span-2">
                <label>Observações internas</label>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Contexto que o time precisa saber (não visível ao cliente)"></textarea>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">07 · Pulso & Check-in</div>
            <div className="form-section-hint">Nota mensal de satisfação e registro de contatos com o cliente.</div>

            {!isEdit && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para registrar pulso e check-in.
              </div>
            )}

            {isEdit && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Pulso de satisfação</div>
                <div className="form-row three">
                  <div className="field">
                    <label>Mês</label>
                    <input type="month" value={pulsoAnoMes} onChange={(e) => setPulsoAnoMes(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Nota (0 a 10)</label>
                    <input type="number" min="0" max="10" value={pulsoNota} onChange={(e) => setPulsoNota(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Método</label>
                    <select value={pulsoMetodo} onChange={(e) => setPulsoMetodo(e.target.value)}>
                      {Object.entries(METODO_PULSO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field span-2">
                    <label>Respondente (nome do cliente) <span className="hint">opcional</span></label>
                    <input type="text" value={pulsoRespondente} onChange={(e) => setPulsoRespondente(e.target.value)} placeholder="Ex.: Marcos (sócio)" />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Comentário</label>
                  <textarea value={pulsoComentario} onChange={(e) => setPulsoComentario(e.target.value)} placeholder="O que o cliente disse, contexto da nota…"></textarea>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-envox" onClick={handleRegistrarPulso} disabled={savingPulso}>
                    {savingPulso ? "Salvando…" : "Registrar pulso"}
                  </button>
                  <span className="field-help" style={{ marginLeft: 8 }}>Já existe nota para o mês? Registrar de novo substitui a anterior.</span>
                </div>

                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th>Nota</th>
                        <th className="table-mobile-hide">Método</th>
                        <th className="table-mobile-hide">Comentário</th>
                        <th className="table-mobile-hide">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pulsoList.length === 0 && <tr><td colSpan="5">Nenhum pulso registrado ainda.</td></tr>}
                      {pulsoList.map((p) => (
                        <tr key={p.id}>
                          <td>{p.ano_mes}</td>
                          <td><strong>{p.nota}</strong></td>
                          <td className="table-mobile-hide">{METODO_PULSO_LABELS[p.metodo] || p.metodo}</td>
                          <td className="table-mobile-hide">{p.comentario || "—"}</td>
                          <td className="table-mobile-hide">{p.registrado_por_envoxer_nome || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, margin: "24px 0 8px" }}>Check-in</div>

                {proximoSugerido && (
                  <div style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)", marginBottom: 10 }}>
                    Próximo check-in sugerido: <strong style={{ color: "var(--ink)" }}>{formatDataCurta(proximoSugerido)}</strong>
                  </div>
                )}

                <div className="form-row three">
                  <div className="field">
                    <label>Data e hora</label>
                    <input type="datetime-local" value={checkinData} onChange={(e) => setCheckinData(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Tipo</label>
                    <select value={checkinTipo} onChange={(e) => setCheckinTipo(e.target.value)}>
                      {Object.entries(TIPO_CHECKIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Motivo</label>
                    <select value={checkinMotivo} onChange={(e) => setCheckinMotivo(e.target.value)}>
                      {Object.entries(MOTIVO_CHECKIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Humor do cliente <span className="hint">opcional</span></label>
                    <select value={checkinHumor} onChange={(e) => setCheckinHumor(e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(HUMOR_CHECKIN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Próximo check-in sugerido <span className="hint">opcional</span></label>
                    <input type="date" value={checkinProximo} onChange={(e) => setCheckinProximo(e.target.value)} />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>Observação</label>
                  <textarea value={checkinObs} onChange={(e) => setCheckinObs(e.target.value)} placeholder="O que foi tratado no contato…"></textarea>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-envox" onClick={handleRegistrarCheckin} disabled={savingCheckin}>
                    {savingCheckin ? "Salvando…" : "Registrar check-in"}
                  </button>
                </div>

                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th className="table-mobile-hide">Tipo</th>
                        <th className="table-mobile-hide">Motivo</th>
                        <th>Humor</th>
                        <th className="table-mobile-hide">Responsável</th>
                        <th className="table-mobile-hide">Próximo sugerido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkinList.length === 0 && <tr><td colSpan="6">Nenhum check-in registrado ainda.</td></tr>}
                      {checkinList.map((c) => (
                        <tr key={c.id}>
                          <td>{formatDataHora(c.data_realizado)}</td>
                          <td className="table-mobile-hide">{TIPO_CHECKIN_LABELS[c.tipo] || c.tipo}</td>
                          <td className="table-mobile-hide">{MOTIVO_CHECKIN_LABELS[c.motivo] || c.motivo}</td>
                          <td>{c.humor ? <span style={{ color: HUMOR_CHECKIN_COLOR[c.humor] }}>{HUMOR_CHECKIN_LABELS[c.humor]}</span> : "—"}</td>
                          <td className="table-mobile-hide">{c.responsavel_nome || "—"}</td>
                          <td className="table-mobile-hide">{c.proximo_sugerido ? formatDataCurta(c.proximo_sugerido) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="form-footer">
            <span className="save-hint">Confira as 7 seções antes de salvar.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={onCancel}>Cancelar</button>
              <button className="btn btn-envox" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar cliente"}</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

window.ClientesScreen = ClientesScreen;
