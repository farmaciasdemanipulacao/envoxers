const { useState: useStateCli, useEffect: useEffectCli, useMemo: useMemoCli, useRef: useRefCli } = React;

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

const PERFIL_CLIENTE_LABELS = { facil: "Fácil", neutro: "Neutro", dificil: "Difícil" };
const PERFIL_CLIENTE_COLOR = { facil: "var(--farol-verde)", neutro: "var(--farol-amarelo)", dificil: "var(--farol-vermelho)" };

const STATUS_DOCUMENTO_LABELS = { aguardando_confirmacoes: "Aguardando confirmações", vigente: "Vigente", cancelado: "Cancelado" };
const STATUS_DOCUMENTO_CORES = { aguardando_confirmacoes: "var(--farol-amarelo)", vigente: "var(--farol-verde)", cancelado: "var(--ink-4)" };

const TIPO_ITEM_ESCOPO_SUGESTOES = ["post_social", "post_blog", "post_gmn", "foto", "video", "campanha", "reuniao", "outro"];
const STATUS_RECONCILIACAO_LABELS = { completo: "Completo", parcial: "Parcial", nao_entregue: "Não entregue", excedente: "Excedente", em_andamento: "Em andamento" };
const STATUS_RECONCILIACAO_CORES = {
  completo: "var(--farol-verde)", excedente: "var(--farol-verde)", parcial: "var(--farol-amarelo)",
  nao_entregue: "var(--farol-vermelho)", em_andamento: "var(--ink-3)",
};

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

function ClientesScreen({ permissao, abrirClienteId, onClienteAberto }) {
  const [clientes, setClientes] = useStateCli([]);
  const [loading, setLoading] = useStateCli(true);
  const [busca, setBusca] = useStateCli("");
  const [filtroFarol, setFiltroFarol] = useStateCli("todos");
  const [filtroTipo, setFiltroTipo] = useStateCli("todos");
  const [editando, setEditando] = useStateCli(null); // null = lista, {} = novo, {id} = editar
  const toast = EnvoxersShared.useToast();
  const podeEditar = permissao === "admin" || permissao === "gestor";

  useEffectCli(() => {
    if (abrirClienteId) {
      setEditando({ id: abrirClienteId });
      if (onClienteAberto) onClienteAberto();
    }
  }, [abrirClienteId]);

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
      if (filtroTipo !== "todos" && c.tipo_receita !== filtroTipo) return false;
      if (busca && !(`${c.nome} ${c.segmento || ""}`.toLowerCase().includes(busca.toLowerCase()))) return false;
      return true;
    });
  }, [clientes, busca, filtroFarol, filtroTipo]);

  const kpis = useMemoCli(() => {
    const ativos = clientes.filter((c) => c.ativo);
    const recorrentes = ativos.filter((c) => c.tipo_receita === "recorrente").length;
    const pontuais = ativos.filter((c) => c.tipo_receita === "pontual").length;
    const mrr = ativos.filter((c) => c.tipo_receita === "recorrente").reduce((s, c) => s + c.valor_contrato, 0);
    const vermelhos = clientes.filter((c) => c.status_farol === "vermelho").length;
    const ha30dias = new Date(); ha30dias.setDate(ha30dias.getDate() - 30);
    const novos = ativos.filter((c) => c.data_inicio_contrato && new Date(c.data_inicio_contrato + "T00:00:00") >= ha30dias).length;

    const comData = clientes.filter((c) => c.data_inicio_contrato);
    let mediaHistoricaNovos = null;
    if (comData.length > 0) {
      const datas = comData.map((c) => new Date(c.data_inicio_contrato + "T00:00:00").getTime());
      const maisAntiga = new Date(Math.min(...datas));
      const hoje = new Date();
      const mesesTotal = Math.max(1, (hoje.getFullYear() - maisAntiga.getFullYear()) * 12 + (hoje.getMonth() - maisAntiga.getMonth()) + 1);
      mediaHistoricaNovos = comData.length / mesesTotal;
    }

    return { ativos: ativos.length, recorrentes, pontuais, mrr, vermelhos, novos, mediaHistoricaNovos };
  }, [clientes]);

  const exportarCsv = () => {
    const linhas = [
      ["Cliente", "Segmento", "Responsável", "Meses", "Contrato/mês", "Tipo", "Farol"],
      ...filtrados.map((c) => [c.nome, c.segmento || "", c.responsavel_nome || "", c.meses_de_casa ?? "", c.valor_contrato, c.tipo_receita, c.status_farol]),
    ];
    const csv = linhas.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "clientes.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (editando !== null) {
    return (
      <ClienteForm
        clienteId={editando.id || null}
        permissao={permissao}
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
        actions={(
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={exportarCsv}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8l3 3 7-7" /></svg> Exportar CSV
            </button>
            {podeEditar && (
              <button className="btn btn-envox" onClick={() => setEditando({})}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Novo cliente
              </button>
            )}
          </div>
        )}
      />

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Ativos <EnvoxersShared.HelpIcon helpKey="cli_kpi_ativos" /></div>
          <div className="kpi-value">{kpis.ativos}</div>
          <div className="kpi-hint">{kpis.recorrentes} recorrentes · {kpis.pontuais} pontuais</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">MRR contratado <EnvoxersShared.HelpIcon helpKey="cli_kpi_mrr" /></div>
          <div className="kpi-value mono"><span className="unit">R$</span> {kpis.mrr.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
          <div className="kpi-hint">soma de contratos recorrentes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Farol vermelho <EnvoxersShared.HelpIcon helpKey="cli_kpi_verm" /></div>
          <div className="kpi-value" style={{ color: "var(--farol-vermelho)" }}>{kpis.vermelhos}</div>
          <div className="kpi-hint">cálculo real em F2</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Novos (30d) <EnvoxersShared.HelpIcon helpKey="cli_kpi_novos" /></div>
          <div className="kpi-value">{kpis.novos}</div>
          {kpis.mediaHistoricaNovos !== null && (
            <div className="kpi-hint">média histórica: {kpis.mediaHistoricaNovos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/mês</div>
          )}
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
          <button className={"chip" + (filtroTipo === "recorrente" ? " active" : "")} onClick={() => setFiltroTipo(filtroTipo === "recorrente" ? "todos" : "recorrente")}>
            Recorrente
          </button>
          <button className={"chip" + (filtroTipo === "pontual" ? " active" : "")} onClick={() => setFiltroTipo(filtroTipo === "pontual" ? "todos" : "pontual")}>
            Pontual
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
              <th className="table-mobile-hide">Início</th>
              <th className="table-mobile-hide">Meses</th>
              <th style={{ textAlign: "right" }}>Contrato/mês</th>
              <th style={{ width: 80 }} className="table-mobile-hide">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="8">Carregando…</td></tr>}
            {!loading && filtrados.length === 0 && <tr><td colSpan="8">Nenhum cliente encontrado.</td></tr>}
            {filtrados.map((c) => (
              <tr key={c.id} onClick={() => podeEditar && setEditando({ id: c.id })} style={{ cursor: podeEditar ? "pointer" : "default" }}>
                <td><span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: `var(--farol-${c.status_farol})` }}></span></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar sm gray">{EnvoxersShared.initials(c.nome)}</div>
                    <span>{c.nome}</span>
                  </div>
                </td>
                <td className="table-mobile-hide">{c.segmento || "—"}</td>
                <td className="table-mobile-hide">
                  {c.responsavel_nome ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="avatar sm">{EnvoxersShared.initials(c.responsavel_nome)}</div>
                      <span>{c.responsavel_nome.split(" ")[0]}</span>
                    </div>
                  ) : "—"}
                </td>
                <td className="table-mobile-hide">{formatDataCurta(c.data_inicio_contrato)}</td>
                <td className="table-mobile-hide">{c.meses_de_casa ?? "—"}</td>
                <td className="mono" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(c.valor_contrato)}</td>
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

function ClienteForm({ clienteId, permissao, onCancel, onSaved }) {
  const isEdit = !!clienteId;
  const toast = EnvoxersShared.useToast();
  const [loading, setLoading] = useStateCli(isEdit);
  const [saving, setSaving] = useStateCli(false);
  const [secaoAtiva, setSecaoAtiva] = useStateCli(0);
  const secaoRefs = useRefCli([]);
  const fimRef = useRefCli(null);
  const suprimirObserverRef = useRefCli(false);
  const suprimirTimeoutRef = useRefCli(null);

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
  const [limiteAlteracoes, setLimiteAlteracoes] = useStateCli(2);

  const [itensEscopoList, setItensEscopoList] = useStateCli([]);
  const [savingItemEscopo, setSavingItemEscopo] = useStateCli(false);
  const [itemTipo, setItemTipo] = useStateCli("");
  const [itemDescricao, setItemDescricao] = useStateCli("");
  const [itemCadencia, setItemCadencia] = useStateCli("mensal");
  const [itemQuantidade, setItemQuantidade] = useStateCli(0);
  const [reconciliacao, setReconciliacao] = useStateCli([]);
  const [loadingReconciliacao, setLoadingReconciliacao] = useStateCli(false);
  const [entregaItemId, setEntregaItemId] = useStateCli("");
  const [entregaAnoMes, setEntregaAnoMes] = useStateCli(anoMesAtual());
  const [entregaQuantidade, setEntregaQuantidade] = useStateCli(1);
  const [entregaObs, setEntregaObs] = useStateCli("");
  const [savingEntrega, setSavingEntrega] = useStateCli(false);

  const carregarItensEscopo = async () => {
    if (!isEdit) return;
    try {
      const itens = await EnvoxersAPI.api(`/clientes/${clienteId}/itens-escopo`);
      setItensEscopoList(itens);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const carregarReconciliacao = async () => {
    if (!isEdit) return;
    setLoadingReconciliacao(true);
    try {
      const meses = await EnvoxersAPI.api(`/clientes/${clienteId}/reconciliacao?meses=6`);
      setReconciliacao(meses);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoadingReconciliacao(false);
    }
  };
  const [instagram, setInstagram] = useStateCli("");
  const [facebook, setFacebook] = useStateCli("");
  const [site, setSite] = useStateCli("");
  const [observacoes, setObservacoes] = useStateCli("");

  const [perfil, setPerfil] = useStateCli(null);
  const [churn, setChurn] = useStateCli(null);
  const [motivosChurnList, setMotivosChurnList] = useStateCli([]);
  const [cancelando, setCancelando] = useStateCli(false);
  const [motivoCodigo, setMotivoCodigo] = useStateCli("");
  const [motivoDetalhe, setMotivoDetalhe] = useStateCli("");
  const [savingCancelamento, setSavingCancelamento] = useStateCli(false);
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

  const [contatosList, setContatosList] = useStateCli([]);
  const [savingContato, setSavingContato] = useStateCli(false);
  const [contatoNome, setContatoNome] = useStateCli("");
  const [contatoCargo, setContatoCargo] = useStateCli("");
  const [contatoEmail, setContatoEmail] = useStateCli("");
  const [linkGerado, setLinkGerado] = useStateCli(null); // { contatoId, url }

  const [documentosList, setDocumentosList] = useStateCli([]);
  const [savingDocumento, setSavingDocumento] = useStateCli(false);
  const [docMotivo, setDocMotivo] = useStateCli("");
  const [docItensSelecionados, setDocItensSelecionados] = useStateCli({}); // { item_id: nova_quantidade }
  const [docEnvoxerIds, setDocEnvoxerIds] = useStateCli({}); // { envoxer_id: true }
  const [docContatoIds, setDocContatoIds] = useStateCli({}); // { contato_id: true }

  const carregarDocumentos = async () => {
    if (!isEdit) return;
    try {
      const docs = await EnvoxersAPI.api(`/clientes/${clienteId}/documentos-acordo`);
      setDocumentosList(docs);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const carregarContatos = async () => {
    if (!isEdit) return;
    try {
      const contatos = await EnvoxersAPI.api(`/clientes/${clienteId}/contatos`);
      setContatosList(contatos);
    } catch (err) {
      toast(err.message, "error");
    }
  };

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
        const [envs, servs, motivos] = await Promise.all([
          EnvoxersAPI.api("/envoxers"),
          EnvoxersAPI.api("/servicos"),
          EnvoxersAPI.api("/motivos-churn"),
        ]);
        setEnvoxersList(envs.filter((e) => e.ativo));
        setServicosList(servs.filter((s) => s.ativo));
        setMotivosChurnList(motivos);

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
          setPerfil(c.perfil || null);
          setChurn(c.churn || null);
          setLimiteAlteracoes(c.limite_alteracoes ?? 2);
          if (Array.isArray(c.servicos)) {
            const sel = {};
            c.servicos.forEach((cs) => { sel[cs.servico_id] = { valor_mensal: cs.valor_mensal }; });
            setServicosSelecionados(sel);
          }
          if (c.links_redes) {
            setInstagram(c.links_redes.instagram || "");
            setFacebook(c.links_redes.facebook || "");
            setSite(c.links_redes.site || "");
          }
          await carregarPulsoCheckin();
          await carregarContatos();
          await carregarItensEscopo();
          await carregarReconciliacao();
          await carregarDocumentos();
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
          limite_alteracoes: Number(limiteAlteracoes) || 0,
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

  const handleCancelarContrato = async () => {
    if (!motivoCodigo) {
      toast("Selecione o motivo do cancelamento", "error");
      return;
    }
    if (!confirm("Cancelar o contrato deste cliente? Essa ação não pode ser desfeita.")) return;
    setSavingCancelamento(true);
    try {
      const resp = await EnvoxersAPI.api(`/clientes/${clienteId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ motivo_codigo: motivoCodigo, motivo_detalhe: motivoDetalhe || null }),
      });
      setChurn(resp);
      setCancelando(false);
      toast("Contrato cancelado", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingCancelamento(false);
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

  const handleCriarContato = async () => {
    if (!contatoNome || !contatoEmail) {
      toast("Nome e e-mail são obrigatórios", "error");
      return;
    }
    setSavingContato(true);
    try {
      const resp = await EnvoxersAPI.api(`/clientes/${clienteId}/contatos`, {
        method: "POST",
        body: JSON.stringify({ nome: contatoNome, cargo: contatoCargo || null, email: contatoEmail }),
      });
      toast("Contato criado! Copie o link de definição de senha abaixo.", "success");
      setContatoNome("");
      setContatoCargo("");
      setContatoEmail("");
      setLinkGerado({ contatoId: resp.id, url: `${window.location.origin}${resp.link_definicao_senha}` });
      await carregarContatos();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingContato(false);
    }
  };

  const handleReenviarLink = async (contatoId) => {
    try {
      const resp = await EnvoxersAPI.api(`/clientes/${clienteId}/contatos/${contatoId}/reenviar-link`, { method: "POST" });
      setLinkGerado({ contatoId: resp.id, url: `${window.location.origin}${resp.link_definicao_senha}` });
      toast("Novo link gerado — copie e envie ao contato.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleToggleAtivoContato = async (contato) => {
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/contatos/${contato.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !contato.ativo }),
      });
      await carregarContatos();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleCopiarLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copiado!", "success");
    } catch (err) {
      toast("Não foi possível copiar — selecione o link manualmente", "error");
    }
  };

  const handleCriarItemEscopo = async () => {
    if (!itemTipo) {
      toast("Informe o tipo do item", "error");
      return;
    }
    setSavingItemEscopo(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/itens-escopo`, {
        method: "POST",
        body: JSON.stringify({
          tipo: itemTipo, descricao: itemDescricao || null, cadencia: itemCadencia,
          quantidade: Number(itemQuantidade) || 0,
        }),
      });
      toast("Item de escopo criado!", "success");
      setItemTipo("");
      setItemDescricao("");
      setItemQuantidade(0);
      await carregarItensEscopo();
      await carregarReconciliacao();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingItemEscopo(false);
    }
  };

  const handleAtualizarQuantidadeItem = async (item) => {
    const novaStr = window.prompt(`Nova quantidade contratada para "${item.tipo}" (atual: ${item.quantidade}):`, item.quantidade);
    if (novaStr === null) return;
    const nova = Number(novaStr);
    if (Number.isNaN(nova) || nova < 0) {
      toast("Quantidade inválida", "error");
      return;
    }
    if (nova === item.quantidade) return;
    const motivo = window.prompt("Motivo da mudança (obrigatório):", "");
    if (!motivo) {
      toast("Motivo é obrigatório para mudar a quantidade", "error");
      return;
    }
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/itens-escopo/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantidade: nova, motivo }),
      });
      toast("Quantidade atualizada!", "success");
      await carregarItensEscopo();
      await carregarReconciliacao();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleToggleAtivoItem = async (item) => {
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/itens-escopo/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      await carregarItensEscopo();
      await carregarReconciliacao();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleLancarEntregaManual = async () => {
    if (!entregaItemId) {
      toast("Selecione o item", "error");
      return;
    }
    setSavingEntrega(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/itens-escopo/${entregaItemId}/lancar-entrega`, {
        method: "POST",
        body: JSON.stringify({ ano_mes: entregaAnoMes, quantidade: Number(entregaQuantidade) || 0, observacao: entregaObs || null }),
      });
      toast("Entrega lançada!", "success");
      setEntregaObs("");
      await carregarReconciliacao();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingEntrega(false);
    }
  };

  const toggleItemDocumento = (item) => {
    setDocItensSelecionados((prev) => {
      const next = { ...prev };
      if (item.id in next) {
        delete next[item.id];
      } else {
        next[item.id] = item.quantidade;
      }
      return next;
    });
  };

  const toggleEnvoxerDocumento = (envoxerId) => {
    setDocEnvoxerIds((prev) => ({ ...prev, [envoxerId]: !prev[envoxerId] }));
  };

  const toggleContatoDocumento = (contatoId) => {
    setDocContatoIds((prev) => ({ ...prev, [contatoId]: !prev[contatoId] }));
  };

  const handleCriarDocumentoAcordo = async () => {
    const itens = Object.entries(docItensSelecionados).map(([item_escopo_id, quantidade_nova]) => ({
      item_escopo_id: Number(item_escopo_id), quantidade_nova: Number(quantidade_nova),
    }));
    const envoxerIds = Object.entries(docEnvoxerIds).filter(([, v]) => v).map(([id]) => Number(id));
    const contatoIds = Object.entries(docContatoIds).filter(([, v]) => v).map(([id]) => Number(id));

    if (!docMotivo) {
      toast("Descreva o motivo da alteração", "error");
      return;
    }
    if (itens.length === 0) {
      toast("Selecione ao menos 1 item de escopo pra alterar", "error");
      return;
    }
    if (envoxerIds.length === 0 && contatoIds.length === 0) {
      toast("Selecione ao menos 1 pessoa pra confirmar (interno ou contato do cliente)", "error");
      return;
    }
    setSavingDocumento(true);
    try {
      await EnvoxersAPI.api(`/clientes/${clienteId}/documentos-acordo`, {
        method: "POST",
        body: JSON.stringify({ motivo: docMotivo, itens, envoxer_ids: envoxerIds, cliente_contato_ids: contatoIds }),
      });
      toast("Documento de acordo criado! Aguardando confirmações.", "success");
      setDocMotivo("");
      setDocItensSelecionados({});
      setDocEnvoxerIds({});
      setDocContatoIds({});
      await carregarDocumentos();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingDocumento(false);
    }
  };

  const handleConfirmarDocumento = async (doc) => {
    try {
      await EnvoxersAPI.api(`/documentos-acordo/${doc.id}/confirmar`, { method: "POST" });
      toast("Confirmado!", "success");
      await carregarDocumentos();
      await carregarItensEscopo();
      await carregarReconciliacao();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleCancelarDocumento = async (doc) => {
    if (!confirm("Cancelar este documento de acordo?")) return;
    try {
      await EnvoxersAPI.api(`/documentos-acordo/${doc.id}/cancelar`, { method: "POST" });
      toast("Documento cancelado", "success");
      await carregarDocumentos();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const irParaSecao = (i) => {
    setSecaoAtiva(i);
    suprimirObserverRef.current = true;
    secaoRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

    const liberar = () => { suprimirObserverRef.current = false; };
    if (suprimirTimeoutRef.current) clearTimeout(suprimirTimeoutRef.current);
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", liberar, { once: true });
    } else {
      suprimirTimeoutRef.current = setTimeout(liberar, 700);
    }
  };

  useEffectCli(() => {
    if (loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (suprimirObserverRef.current) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = secaoRefs.current.indexOf(entry.target);
          if (idx !== -1) setSecaoAtiva(idx);
        }
      });
    }, { root: null, rootMargin: "-35% 0px -55% 0px", threshold: 0 });
    secaoRefs.current.forEach((el) => { if (el) observer.observe(el); });

    // A última seção pode ser curta demais pra nunca cruzar sozinha a faixa de 35-45%
    // (não sobra espaço abaixo dela pra rolar) — sentinela no fim da página, com um
    // observer próprio (rootMargin cheio, não a faixa estreita), força o destaque nesse
    // caso. Criado depois do observer das seções pra ser notificado depois e ter a
    // palavra final, sem depender de listener de scroll manual (que teria timing
    // imprevisível em relação ao callback assíncrono do IntersectionObserver).
    const observerFim = new IntersectionObserver((entries) => {
      if (suprimirObserverRef.current) return;
      if (entries[0]?.isIntersecting) setSecaoAtiva(secaoRefs.current.length - 1);
    }, { root: null, threshold: 0 });
    if (fimRef.current) observerFim.observe(fimRef.current);

    return () => { observer.disconnect(); observerFim.disconnect(); };
  }, [loading]);

  if (loading) {
    return <div className="page"><div className="app-loading">Carregando cliente…</div></div>;
  }

  const secoes = ["Identidade", "Contrato", "ICP", "Serviços", "Escopo mensal", "Links & obs.", "Pulso & Check-in", "Perfil Comportamental", "Contatos do Portal", "Documentos de Acordo"];

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
              <li key={s} className={secaoAtiva === i ? "active" : ""} onClick={() => irParaSecao(i)} style={{ cursor: "pointer" }}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span> {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="form-panel">

          <div className="form-section" id="secao-identidade" ref={(el) => (secaoRefs.current[0] = el)}>
            <div className="form-section-title">01 · Identidade <EnvoxersShared.HelpIcon helpKey="form_cli_ident" /></div>
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

          <div className="form-section" id="secao-contrato" ref={(el) => (secaoRefs.current[1] = el)}>
            <div className="form-section-title">02 · Contrato <EnvoxersShared.HelpIcon helpKey="form_cli_contrato" /></div>
            <div className="form-section-hint">O que decide MRR, projeção 90d e retenção.</div>
            <div className="form-row three">
              <div className="field">
                <label>Valor do contrato/mês <span className="req">*</span></label>
                <EnvoxersShared.MoneyInput value={valorContrato} onChange={setValorContrato} />
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

            {isEdit && churn && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--bg-inset)", borderRadius: "var(--r-md)", borderLeft: "3px solid var(--farol-vermelho)" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--farol-vermelho)", marginBottom: 4 }}>Contrato cancelado</div>
                <div style={{ fontSize: 13 }}>
                  <strong>{churn.motivo_nome || churn.motivo_codigo}</strong> · {formatDataCurta(churn.data_cancelamento)} · {churn.meses_de_casa} mês(es) de casa
                </div>
                {churn.motivo_detalhe && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{churn.motivo_detalhe}</div>}
              </div>
            )}

            {isEdit && !churn && (
              <div style={{ marginTop: 16 }}>
                {!cancelando ? (
                  <button className="btn btn-sm" style={{ color: "var(--farol-vermelho)" }} onClick={() => setCancelando(true)}>
                    Cancelar contrato
                  </button>
                ) : (
                  <div style={{ padding: "12px 14px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Cancelar contrato</div>
                    <div className="form-row">
                      <div className="field span-2">
                        <label>Motivo <span className="req">*</span></label>
                        <select id="cancelar-motivo-select" value={motivoCodigo} onChange={(e) => setMotivoCodigo(e.target.value)}>
                          <option value="">Selecionar…</option>
                          {motivosChurnList.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label>Detalhe <span className="hint">opcional</span></label>
                      <textarea value={motivoDetalhe} onChange={(e) => setMotivoDetalhe(e.target.value)} placeholder="Contexto adicional do cancelamento…"></textarea>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button className="btn btn-sm" style={{ color: "var(--farol-vermelho)" }} onClick={handleCancelarContrato} disabled={savingCancelamento}>
                        {savingCancelamento ? "Cancelando…" : "Confirmar cancelamento"}
                      </button>
                      <button className="btn btn-sm" onClick={() => setCancelando(false)}>Voltar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-section" id="secao-icp" ref={(el) => (secaoRefs.current[2] = el)}>
            <div className="form-section-title">03 · ICP <EnvoxersShared.HelpIcon helpKey="form_cli_icp" /></div>
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
                <EnvoxersShared.MoneyInput value={ticket} onChange={setTicket} />
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

          <div className="form-section" id="secao-servicos" ref={(el) => (secaoRefs.current[3] = el)}>
            <div className="form-section-title">04 · Serviços contratados <EnvoxersShared.HelpIcon helpKey="form_cli_servicos" /></div>
            <div className="form-section-hint">Marque o que este cliente contratou e o valor por serviço.</div>
            <div className="service-grid">
              {servicosList.map((s) => {
                const sel = servicosSelecionados[s.id];
                return (
                  <div
                    key={s.id}
                    className={`service-card${sel ? " checked" : ""}`}
                    onClick={() => toggleServico(s.id)}
                    role="checkbox"
                    aria-checked={!!sel}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleServico(s.id); } }}
                  >
                    <div className="service-card-head">
                      <span className="service-card-name">{s.nome}</span>
                      <span className="service-card-check">
                        {!!sel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>}
                      </span>
                    </div>
                    {s.descricao && <div className="service-card-desc">{s.descricao}</div>}
                    <div className="service-card-value" onClick={(e) => e.stopPropagation()}>
                      <EnvoxersShared.MoneyInput value={sel ? sel.valor_mensal : 0} onChange={(v) => setValorServico(s.id, v)} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
              <span>Soma dos serviços marcados</span>
              <strong className="mono" style={{ color: "var(--ink)" }}>{EnvoxersShared.formatMoney(somaServicos)}</strong>
            </div>
          </div>

          <div className="form-section" id="secao-escopo" ref={(el) => (secaoRefs.current[4] = el)}>
            <div className="form-section-title">05 · Escopo & Entregáveis <EnvoxersShared.HelpIcon helpKey="form_cli_escopo" /></div>
            <div className="form-section-hint">Itens contratados (posts, vídeos, fotos, GMN…) com quantidade e cadência — controle de entregáveis. O <em>limite de alterações</em> vira sinal do Farol em F2.</div>

            <div className="field span-2" style={{ maxWidth: 320 }}>
              <label>Limite de alterações por peça</label>
              <input type="number" min="0" value={limiteAlteracoes} onChange={(e) => setLimiteAlteracoes(e.target.value)} />
              <div className="field-help">Padrão 2. Passar disso gera alerta em F2.</div>
            </div>

            {!isEdit && (
              <div style={{ marginTop: 16, fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para cadastrar itens de escopo.
              </div>
            )}

            {isEdit && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, margin: "20px 0 8px" }}>Itens contratados</div>
                <div className="form-row three">
                  <div className="field">
                    <label>Tipo <span className="req">*</span></label>
                    <input type="text" value={itemTipo} onChange={(e) => setItemTipo(e.target.value)} placeholder="Ex.: post_social" list="tipos-item-escopo" />
                    <datalist id="tipos-item-escopo">
                      {TIPO_ITEM_ESCOPO_SUGESTOES.map((t) => <option key={t}>{t}</option>)}
                    </datalist>
                  </div>
                  <div className="field">
                    <label>Descrição <span className="hint">opcional</span></label>
                    <input type="text" value={itemDescricao} onChange={(e) => setItemDescricao(e.target.value)} placeholder="Ex.: sessão de fotos mensal" />
                  </div>
                  <div className="field">
                    <label>Cadência</label>
                    <div className="seg">
                      <input type="radio" name="cadencia" id="cad-mensal" checked={itemCadencia === "mensal"} onChange={() => setItemCadencia("mensal")} /><label htmlFor="cad-mensal">Mensal</label>
                      <input type="radio" name="cadencia" id="cad-pontual" checked={itemCadencia === "pontual"} onChange={() => setItemCadencia("pontual")} /><label htmlFor="cad-pontual">Pontual</label>
                    </div>
                  </div>
                  <div className="field">
                    <label>Quantidade</label>
                    <input type="number" min="0" value={itemQuantidade} onChange={(e) => setItemQuantidade(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-envox" onClick={handleCriarItemEscopo} disabled={savingItemEscopo}>
                    {savingItemEscopo ? "Adicionando…" : "Adicionar item"}
                  </button>
                </div>

                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th className="table-mobile-hide">Descrição</th>
                        <th>Cadência</th>
                        <th>Quantidade</th>
                        <th>Ativo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensEscopoList.length === 0 && <tr><td colSpan="6">Nenhum item de escopo cadastrado ainda.</td></tr>}
                      {itensEscopoList.map((item) => (
                        <tr key={item.id}>
                          <td>{item.tipo}</td>
                          <td className="table-mobile-hide">{item.descricao || "—"}</td>
                          <td>{item.cadencia === "mensal" ? "Mensal" : "Pontual"}</td>
                          <td>
                            <a onClick={() => handleAtualizarQuantidadeItem(item)} style={{ cursor: "pointer", textDecoration: "underline" }}>{item.quantidade}</a>
                          </td>
                          <td>
                            <button className="btn btn-sm" onClick={() => handleToggleAtivoItem(item)}>{item.ativo ? "Desativar" : "Ativar"}</button>
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, margin: "24px 0 8px" }}>Lançar entrega retroativa <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0, fontSize: 12 }}>(entregue fora do Kanban — ex.: direto por WhatsApp)</span></div>
                <div className="form-row three">
                  <div className="field">
                    <label>Item</label>
                    <select value={entregaItemId} onChange={(e) => setEntregaItemId(e.target.value)}>
                      <option value="">Selecionar…</option>
                      {itensEscopoList.map((i) => <option key={i.id} value={i.id}>{i.tipo}{i.descricao ? ` — ${i.descricao}` : ""}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Mês</label>
                    <input type="month" value={entregaAnoMes} onChange={(e) => setEntregaAnoMes(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Quantidade</label>
                    <input type="number" min="1" value={entregaQuantidade} onChange={(e) => setEntregaQuantidade(e.target.value)} />
                  </div>
                  <div className="field span-2">
                    <label>Observação <span className="hint">opcional</span></label>
                    <input type="text" value={entregaObs} onChange={(e) => setEntregaObs(e.target.value)} placeholder="Contexto de como foi entregue" />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-envox" onClick={handleLancarEntregaManual} disabled={savingEntrega}>
                    {savingEntrega ? "Lançando…" : "Lançar entrega"}
                  </button>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, margin: "24px 0 8px" }}>Reconciliação — contratado × entregue (últimos 6 meses)</div>
                {loadingReconciliacao && <div className="empty">Carregando…</div>}
                {!loadingReconciliacao && reconciliacao.map((mes) => (
                  <div key={mes.ano_mes} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
                      {mes.ano_mes} {!mes.fechado && <span className="pill" style={{ marginLeft: 6 }}>em andamento</span>}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Contratado</th>
                            <th>Entregue</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mes.itens.length === 0 && <tr><td colSpan="4">Sem itens ativos.</td></tr>}
                          {mes.itens.map((item) => (
                            <tr key={item.item_escopo_id}>
                              <td>{item.tipo}{item.descricao ? ` — ${item.descricao}` : ""}</td>
                              <td>{item.quantidade_contratada}</td>
                              <td>{item.quantidade_entregue}</td>
                              <td><span className="pill" style={{ color: STATUS_RECONCILIACAO_CORES[item.status] }}>{STATUS_RECONCILIACAO_LABELS[item.status] || item.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="form-section" id="secao-links" ref={(el) => (secaoRefs.current[5] = el)}>
            <div className="form-section-title">06 · Links & observações <EnvoxersShared.HelpIcon helpKey="form_cli_links" /></div>
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

          <div className="form-section" id="secao-pulso" ref={(el) => (secaoRefs.current[6] = el)}>
            <div className="form-section-title">07 · Pulso & Check-in <EnvoxersShared.HelpIcon helpKey="cli_cadencia" /></div>
            <div className="form-section-hint">Nota mensal de satisfação e registro de contatos com o cliente.</div>

            {!isEdit && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para registrar pulso e check-in.
              </div>
            )}

            {isEdit && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Pulso de satisfação <EnvoxersShared.HelpIcon helpKey="cli_pulso_hist" /></div>
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

                <div style={{ fontWeight: 600, fontSize: 13, margin: "24px 0 8px" }}>Check-in <EnvoxersShared.HelpIcon helpKey="cli_checkins" /></div>

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

          <div className="form-section" id="secao-perfil" ref={(el) => (secaoRefs.current[7] = el)}>
            <div className="form-section-title">08 · Perfil Comportamental <EnvoxersShared.HelpIcon helpKey="cli_perfil" /></div>
            <div className="form-section-hint">Calculado automaticamente a partir do histórico de aprovações e alterações — base do ICP Builder (F3).</div>

            {!isEdit && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para calcular o perfil.
              </div>
            )}

            {isEdit && perfil && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span
                    className="pill"
                    style={{ color: PERFIL_CLIENTE_COLOR[perfil.perfil], fontWeight: 700, fontSize: 14 }}
                  >
                    {PERFIL_CLIENTE_LABELS[perfil.perfil] || perfil.perfil}
                  </span>
                  <span style={{ color: "var(--ink-3)", fontSize: 12 }}>score {perfil.score}/100</span>
                </div>
                <div className="form-row three">
                  <div className="modal-side-block">
                    <div className="modal-side-label">Velocidade de aprovação</div>
                    <div className="modal-side-value">
                      {perfil.velocidade_aprovacao_dias != null ? `${perfil.velocidade_aprovacao_dias} dia(s)` : "sem dado"}
                    </div>
                  </div>
                  <div className="modal-side-block">
                    <div className="modal-side-label">Alterações por tarefa</div>
                    <div className="modal-side-value">
                      {perfil.alteracoes_media_por_tarefa != null ? perfil.alteracoes_media_por_tarefa : "sem dado"}
                    </div>
                  </div>
                  <div className="modal-side-block">
                    <div className="modal-side-label">Atrasos causados pelo cliente</div>
                    <div className="modal-side-value">{perfil.atrasos_causados_pelo_cliente}</div>
                  </div>
                </div>
                <div className="field-help" style={{ marginTop: 12 }}>
                  Baseado em {perfil.tarefas_avaliadas} tarefa(s) avaliada(s). Recalculado a cada vez que a ficha é aberta.
                </div>
              </>
            )}
          </div>

          <div className="form-section" id="secao-contatos-portal" ref={(el) => (secaoRefs.current[8] = el)}>
            <div className="form-section-title">09 · Contatos do Portal</div>
            <div className="form-section-hint">Pessoas do lado do cliente com login no Portal do Cliente — confirmam documentos de aditivo e (em breve) acompanham entregáveis.</div>

            {!isEdit && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para cadastrar contatos do portal.
              </div>
            )}

            {isEdit && (
              <>
                <div className="form-row three">
                  <div className="field">
                    <label>Nome <span className="req">*</span></label>
                    <input type="text" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Ex.: Marcos Silva" />
                  </div>
                  <div className="field">
                    <label>Cargo <span className="hint">opcional</span></label>
                    <input type="text" value={contatoCargo} onChange={(e) => setContatoCargo(e.target.value)} placeholder="Ex.: Sócio, Marketing…" />
                  </div>
                  <div className="field">
                    <label>E-mail <span className="req">*</span></label>
                    <input type="email" value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} placeholder="contato@cliente.com.br" />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-envox" onClick={handleCriarContato} disabled={savingContato}>
                    {savingContato ? "Criando…" : "Criar contato"}
                  </button>
                </div>

                {linkGerado && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Link de definição de senha (envie por WhatsApp/e-mail):</span>
                    <code style={{ fontSize: 12, wordBreak: "break-all" }}>{linkGerado.url}</code>
                    <button className="btn btn-sm" onClick={() => handleCopiarLink(linkGerado.url)}>Copiar</button>
                  </div>
                )}

                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="table-mobile-hide">Cargo</th>
                        <th className="table-mobile-hide">E-mail</th>
                        <th>Senha definida</th>
                        <th>Ativo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contatosList.length === 0 && <tr><td colSpan="6">Nenhum contato cadastrado ainda.</td></tr>}
                      {contatosList.map((c) => (
                        <tr key={c.id}>
                          <td>{c.nome}</td>
                          <td className="table-mobile-hide">{c.cargo || "—"}</td>
                          <td className="table-mobile-hide">{c.email}</td>
                          <td>{c.senha_definida ? "Sim" : "Não"}</td>
                          <td>
                            <button className="btn btn-sm" onClick={() => handleToggleAtivoContato(c)}>
                              {c.ativo ? "Desativar" : "Ativar"}
                            </button>
                          </td>
                          <td>
                            <button className="btn btn-sm" onClick={() => handleReenviarLink(c.id)}>
                              {c.senha_definida ? "Gerar novo link" : "Reenviar link"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="form-section" id="secao-documentos-acordo" ref={(el) => (secaoRefs.current[9] = el)}>
            <div className="form-section-title">10 · Documentos de Acordo</div>
            <div className="form-section-hint">Aditivo de escopo — quando a quantidade de um item contratado muda por acordo com o cliente. Só vira vigente (e só aí atualiza o item de verdade) quando <strong>todo mundo selecionado</strong> confirmar.</div>

            {!isEdit && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 12px", background: "var(--bg-inset)", borderRadius: "var(--r-md)" }}>
                Salve o cadastro do cliente primeiro para criar documentos de acordo.
              </div>
            )}

            {isEdit && (
              <>
                <div className="field">
                  <label>Motivo da alteração <span className="req">*</span></label>
                  <textarea value={docMotivo} onChange={(e) => setDocMotivo(e.target.value)} placeholder="Ex.: cliente pediu redução de posts a partir de agosto por corte de orçamento"></textarea>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, margin: "16px 0 8px" }}>Itens que mudam</div>
                {itensEscopoList.length === 0 && <div className="field-help">Cadastre itens de escopo na seção 05 primeiro.</div>}
                {itensEscopoList.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <input type="checkbox" checked={!!(item.id in docItensSelecionados)} onChange={() => toggleItemDocumento(item)} id={`doc-item-${item.id}`} />
                    <label htmlFor={`doc-item-${item.id}`} style={{ minWidth: 200 }}>{item.tipo}{item.descricao ? ` — ${item.descricao}` : ""} <span style={{ color: "var(--ink-3)" }}>(atual: {item.quantidade})</span></label>
                    {item.id in docItensSelecionados && (
                      <input
                        type="number" min="0" style={{ width: 90 }}
                        value={docItensSelecionados[item.id]}
                        onChange={(e) => setDocItensSelecionados((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}

                <div style={{ fontWeight: 600, fontSize: 13, margin: "16px 0 8px" }}>Internos que precisam confirmar</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {envoxersList.map((e) => (
                    <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={!!docEnvoxerIds[e.id]} onChange={() => toggleEnvoxerDocumento(e.id)} /> {e.nome}
                    </label>
                  ))}
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, margin: "16px 0 8px" }}>Contato(s) do cliente que precisam confirmar</div>
                {contatosList.filter((c) => c.ativo).length === 0 && <div className="field-help">Cadastre um contato do portal na seção 09 primeiro.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {contatosList.filter((c) => c.ativo).map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={!!docContatoIds[c.id]} onChange={() => toggleContatoDocumento(c.id)} /> {c.nome}
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-envox" onClick={handleCriarDocumentoAcordo} disabled={savingDocumento}>
                    {savingDocumento ? "Criando…" : "Criar documento e enviar para confirmação"}
                  </button>
                </div>

                <div className="table-wrap" style={{ marginTop: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Motivo</th>
                        <th className="table-mobile-hide">Itens</th>
                        <th>Status</th>
                        <th>Confirmações</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentosList.length === 0 && <tr><td colSpan="5">Nenhum documento de acordo ainda.</td></tr>}
                      {documentosList.map((doc) => {
                        const confirmadas = doc.confirmacoes.filter((c) => c.confirmado_em).length;
                        const meuId = EnvoxersAPI.getEnvoxerId();
                        const minhaConfirmacao = doc.confirmacoes.find((c) => c.tipo_confirmante === "envoxer" && c.envoxer_id === meuId);
                        const possoConfirmar = doc.status === "aguardando_confirmacoes" && minhaConfirmacao && !minhaConfirmacao.confirmado_em;
                        const possoCancelar = doc.status === "aguardando_confirmacoes" && (permissao === "admin" || permissao === "gestor");
                        return (
                          <tr key={doc.id}>
                            <td>{doc.motivo}</td>
                            <td className="table-mobile-hide">{doc.itens_alterados.map((i) => `${i.tipo} (${i.quantidade_anterior}→${i.quantidade_nova})`).join(", ")}</td>
                            <td><span className="pill" style={{ color: STATUS_DOCUMENTO_CORES[doc.status] }}>{STATUS_DOCUMENTO_LABELS[doc.status] || doc.status}</span></td>
                            <td>{confirmadas}/{doc.confirmacoes.length}</td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                {possoConfirmar && (
                                  <button className="btn btn-sm" onClick={() => handleConfirmarDocumento(doc)}>Confirmar (eu)</button>
                                )}
                                {possoCancelar && (
                                  <button className="btn btn-sm" style={{ color: "var(--farol-vermelho)" }} onClick={() => handleCancelarDocumento(doc)}>Cancelar</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="form-footer">
            <span className="save-hint">Confira as 10 seções antes de salvar.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={onCancel}>Cancelar</button>
              <button className="btn btn-envox" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar cliente"}</button>
            </div>
          </div>
          <div ref={fimRef} style={{ height: 1 }} aria-hidden="true" />

        </div>
      </div>
    </div>
  );
}

window.ClientesScreen = ClientesScreen;
