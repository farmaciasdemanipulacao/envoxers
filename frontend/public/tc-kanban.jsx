const { useState: useStateKb, useEffect: useEffectKb, useMemo: useMemoKb } = React;

const STATUS_COLS = [
  { key: "nova", label: "Nova demanda", phase: "entrada", helpKey: "kanban_col_nova" },
  { key: "planejamento", label: "Planejamento", phase: "entrada", helpKey: "kanban_col_planejamento" },
  { key: "producao", label: "Produção", phase: "producao", helpKey: "kanban_col_producao" },
  { key: "revisao_interna", label: "Revisão interna", phase: "producao", helpKey: "kanban_col_revisao_interna" },
  { key: "aprovacao_cliente", label: "Aprovação cliente", phase: "aprovacao", helpKey: "kanban_col_aprovacao_cliente" },
  { key: "ajustes", label: "Ajustes", phase: "aprovacao", helpKey: "kanban_col_ajustes" },
  { key: "programado", label: "Programado", phase: "saida", helpKey: "kanban_col_programado" },
  { key: "finalizado", label: "Finalizado", phase: "saida", helpKey: "kanban_col_finalizado" },
];

const TIPOS_TAREFA = [
  "Post estático", "Carrossel", "Reels", "Story", "Campanha de tráfego",
  "Criativo (arte)", "Vídeo curto", "Vídeo longo", "E-mail marketing",
  "Landing page", "Roteiro", "Legenda", "Cronograma editorial", "Relatório mensal",
];

const ETIQUETA_CORES = ["azul", "amarelo", "vermelho", "verde", "roxo", "cinza"];

function fmtPrazoKb(prazo) {
  if (!prazo) return { txt: "sem prazo", cls: "" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + "T00:00:00");
  const dias = Math.round((d - hoje) / 86400000);
  if (dias < 0) return { txt: `${Math.abs(dias)}d atrasado`, cls: "atrasada" };
  if (dias === 0) return { txt: "hoje", cls: "hoje" };
  if (dias === 1) return { txt: "amanhã", cls: "" };
  return { txt: d.toLocaleDateString("pt-BR"), cls: "" };
}

function initialsKb(nome) {
  if (!nome) return "—";
  return nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function fmtHMS(totalSegundos) {
  const s = Math.max(0, Math.floor(totalSegundos || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function KanbanScreen({ focoAtivo, focoElapsed, dataVersion, onAbrirTarefa, onAbrirNovaTarefa }) {
  const [tarefas, setTarefas] = useStateKb([]);
  const [clientes, setClientes] = useStateKb([]);
  const [envoxersList, setEnvoxersList] = useStateKb([]);
  const [loading, setLoading] = useStateKb(true);
  const [busca, setBusca] = useStateKb("");
  const [filtroCliente, setFiltroCliente] = useStateKb("");
  const [filtroResponsavel, setFiltroResponsavel] = useStateKb("");
  const [filtroStatus, setFiltroStatus] = useStateKb("");
  const [filtroTipo, setFiltroTipo] = useStateKb("");
  const [filtroAtrasadas, setFiltroAtrasadas] = useStateKb(false);
  const [ocultarFinalizadas, setOcultarFinalizadas] = useStateKb(true);
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const [ts, cs, es] = await Promise.all([
        EnvoxersAPI.api("/tarefas"),
        EnvoxersAPI.api("/clientes"),
        EnvoxersAPI.api("/envoxers"),
      ]);
      setTarefas(ts);
      setClientes(cs);
      setEnvoxersList(es.filter((e) => e.ativo));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectKb(() => { carregar(); }, [dataVersion]);

  const filtradas = useMemoKb(() => {
    return tarefas.filter((t) => {
      if (ocultarFinalizadas && t.status === "finalizado") return false;
      if (filtroCliente && String(t.cliente_id) !== filtroCliente) return false;
      if (filtroResponsavel && String(t.responsavel_envoxer_id) !== filtroResponsavel) return false;
      if (filtroStatus && t.status !== filtroStatus) return false;
      if (filtroTipo && (t.tipo_tarefa || "") !== filtroTipo) return false;
      if (filtroAtrasadas && (t.status === "finalizado" || fmtPrazoKb(t.prazo).cls !== "atrasada")) return false;
      if (busca && !t.titulo.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [tarefas, busca, filtroCliente, filtroResponsavel, filtroStatus, filtroTipo, filtroAtrasadas, ocultarFinalizadas]);

  const tiposDisponiveis = useMemoKb(() => {
    return [...new Set(tarefas.map((t) => t.tipo_tarefa).filter(Boolean))].sort();
  }, [tarefas]);

  const moverCard = async (tarefaId, novoStatus) => {
    setTarefas((prev) => prev.map((t) => (t.id === tarefaId ? { ...t, status: novoStatus } : t)));
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify({ status: novoStatus }) });
    } catch (err) {
      toast(err.message, "error");
      carregar();
    }
  };

  return (
    <div className="page" style={{ paddingBottom: 20 }}>
      <div className="page-header" style={{ marginBottom: 16, paddingBottom: 16 }}>
        <div className="page-title-block">
          <h1>Kanban</h1>
          <div className="page-sub">Fluxo de demandas. Arraste os cards entre as colunas — a listra colorida do card é o farol do cliente.</div>
        </div>
        <button className="btn btn-envox" onClick={() => onAbrirNovaTarefa("nova")}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Nova demanda
        </button>
      </div>

      <div className="kanban-toolbar">
        <div className="search">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <input type="text" placeholder="Buscar demanda…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="filter-group">
          <select className="chip" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos os clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className="chip" value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <select className="chip" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select className="chip" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposDisponiveis.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={filtroAtrasadas} onChange={(e) => setFiltroAtrasadas(e.target.checked)} style={{ marginRight: 6 }} />
            Só atrasadas
          </label>
          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={ocultarFinalizadas} onChange={(e) => setOcultarFinalizadas(e.target.checked)} style={{ marginRight: 6 }} />
            Ocultar finalizadas
          </label>
        </div>
      </div>

      <div className="kanban-shell">
        <div className="kanban">
          {loading && <div style={{ padding: 20, color: "var(--ink-3)" }}>Carregando…</div>}
          {!loading && STATUS_COLS.map((col) => (
            <KanbanColuna
              key={col.key}
              col={col}
              tarefas={filtradas.filter((t) => t.status === col.key)}
              focoAtivo={focoAtivo}
              focoElapsed={focoElapsed}
              onDropTarefa={moverCard}
              onAbrirTarefa={onAbrirTarefa}
              onNovaNestaColuna={() => onAbrirNovaTarefa(col.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanColuna({ col, tarefas, focoAtivo, focoElapsed, onDropTarefa, onAbrirTarefa, onNovaNestaColuna }) {
  const [dragOver, setDragOver] = useStateKb(false);

  return (
    <div
      className={"kb-col" + (dragOver ? " drag-over" : "")}
      data-status={col.key}
      data-phase={col.phase}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (id) onDropTarefa(id, col.key);
      }}
    >
      <div className="kb-col-head">
        <span className="kb-col-name">{col.label} <EnvoxersShared.HelpIcon helpKey={col.helpKey} /></span>
        <span className="kb-col-count">{tarefas.length}</span>
        <button className="kb-col-add" onClick={onNovaNestaColuna} title="Nova nesta coluna">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2v8M2 6h8" /></svg>
        </button>
      </div>
      <div className="kb-col-body">
        {tarefas.length === 0 && <div className="kb-empty">— sem demandas —</div>}
        {tarefas.map((t) => (
          <TaskCard
            key={t.id}
            tarefa={t}
            onClick={() => onAbrirTarefa(t.id)}
            focoAtivo={focoAtivo && focoAtivo.tarefa_id === t.id ? focoAtivo : null}
            focoElapsed={focoElapsed}
          />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ tarefa: t, onClick, focoAtivo, focoElapsed }) {
  const farol = t.cliente_farol || "verde";
  const p = fmtPrazoKb(t.prazo);
  return (
    <div
      className={`kb-card farol-${farol}`}
      draggable="true"
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); e.currentTarget.classList.add("dragging"); }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
      onClick={onClick}
    >
      <div className="kb-card-client">
        <span className="dot"></span>
        <span>{t.cliente_nome}</span>
      </div>
      <div className="kb-card-title">{t.titulo}</div>
      <div className="kb-card-meta">
        {t.tipo_tarefa && <span className="pill">{t.tipo_tarefa}</span>}
        {t.etiqueta && <span className={`tag tag-${t.etiqueta_cor || "cinza"}`}>{t.etiqueta}</span>}
      </div>
      <div className="kb-card-foot">
        <span className="kb-card-foot-item">
          <svg className="kb-card-foot-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="10" rx="1" /><path d="M2 7h12M6 2v3M10 2v3" /></svg>
          <span className={`prazo ${p.cls}`}>{p.txt}</span>
        </span>
        {focoAtivo && (
          <span className="kb-card-foot-item" style={{ color: "var(--envox)", fontWeight: 600 }} title="Foco ativo nesta tarefa">
            <svg className="kb-card-foot-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--envox)" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>
            {fmtHMS(focoElapsed)}
          </span>
        )}
        {t.qtd_comentarios > 0 && (
          <span className="kb-card-foot-item">
            <svg className="kb-card-foot-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v8H6l-4 3z" /></svg> {t.qtd_comentarios}
          </span>
        )}
        {t.qtd_anexos > 0 && (
          <span className="kb-card-foot-item">
            <svg className="kb-card-foot-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3l-7 7a3 3 0 004 4l6-6a2 2 0 00-3-3L5 11" /></svg> {t.qtd_anexos}
          </span>
        )}
        {t.responsavel_nome && (
          <span className="assignee" title={t.responsavel_nome}>
            <div className="avatar sm gray">{initialsKb(t.responsavel_nome)}</div>
          </span>
        )}
      </div>
    </div>
  );
}

function TaskModal({ tarefaId, statusInicial, permissao, clientes, envoxersList, focoAtivo, focoElapsed, onIniciarFoco, onPausarFoco, onFinalizarFoco, onClose, onSaved }) {
  const isEdit = !!tarefaId;
  const toast = EnvoxersShared.useToast();
  const [loading, setLoading] = useStateKb(isEdit);
  const [saving, setSaving] = useStateKb(false);
  const [tarefa, setTarefa] = useStateKb(null);
  const [servicosList, setServicosList] = useStateKb([]);

  const [clienteId, setClienteId] = useStateKb("");
  const [servicoId, setServicoId] = useStateKb("");
  const [titulo, setTitulo] = useStateKb("");
  const [tipoTarefa, setTipoTarefa] = useStateKb("");
  const [responsavelId, setResponsavelId] = useStateKb("");
  const [status, setStatus] = useStateKb(statusInicial || "nova");
  const [prazo, setPrazo] = useStateKb("");
  const [etiqueta, setEtiqueta] = useStateKb("");
  const [etiquetaCor, setEtiquetaCor] = useStateKb("cinza");
  const [legenda, setLegenda] = useStateKb("");
  const [novoComentario, setNovoComentario] = useStateKb("");

  const [aprovacoes, setAprovacoes] = useStateKb([]);
  const [alteracoesLista, setAlteracoesLista] = useStateKb([]);
  const [ajusteComentario, setAjusteComentario] = useStateKb("");
  const [alteracaoDescricao, setAlteracaoDescricao] = useStateKb("");
  const [alteracaoSolicitante, setAlteracaoSolicitante] = useStateKb("");
  const [acaoLoading, setAcaoLoading] = useStateKb(false);

  // Resumo básico do cliente — usado só na visão bloqueada (sem Foco ativo nesta tarefa).
  const [tarefasConcluidas, setTarefasConcluidas] = useStateKb([]);
  const [tarefasProximas, setTarefasProximas] = useStateKb([]);

  useEffectKb(() => {
    (async () => {
      try {
        const servs = await EnvoxersAPI.api("/servicos");
        setServicosList(servs.filter((s) => s.ativo));

        if (isEdit) {
          const t = await EnvoxersAPI.api(`/tarefas/${tarefaId}`);
          setTarefa(t);
          setClienteId(String(t.cliente_id));
          setServicoId(t.servico_id ? String(t.servico_id) : "");
          setTitulo(t.titulo);
          setTipoTarefa(t.tipo_tarefa || "");
          setResponsavelId(t.responsavel_envoxer_id ? String(t.responsavel_envoxer_id) : "");
          setStatus(t.status);
          setPrazo(t.prazo || "");
          setEtiqueta(t.etiqueta || "");
          setEtiquetaCor(t.etiqueta_cor || "cinza");
          setLegenda(t.legenda || "");

          const [aprovs, alts, tarefasCliente] = await Promise.all([
            EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacoes`),
            EnvoxersAPI.api(`/tarefas/${tarefaId}/alteracoes`),
            EnvoxersAPI.api(`/tarefas?cliente_id=${t.cliente_id}`),
          ]);
          setAprovacoes(aprovs);
          setAlteracoesLista(alts);

          const outras = tarefasCliente.filter((x) => x.id !== tarefaId);
          setTarefasConcluidas(
            outras
              .filter((x) => x.status === "finalizado" && x.finalizada_em)
              .sort((a, b) => new Date(b.finalizada_em) - new Date(a.finalizada_em))
              .slice(0, 3)
          );
          setTarefasProximas(
            outras
              .filter((x) => x.status !== "finalizado")
              .sort((a, b) => {
                if (!a.prazo) return 1;
                if (!b.prazo) return -1;
                return new Date(a.prazo) - new Date(b.prazo);
              })
              .slice(0, 3)
          );
        }
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [tarefaId]);

  const buildPayload = () => ({
    cliente_id: Number(clienteId),
    servico_id: servicoId ? Number(servicoId) : null,
    titulo,
    tipo_tarefa: tipoTarefa || null,
    responsavel_envoxer_id: responsavelId ? Number(responsavelId) : null,
    status,
    prazo: prazo || null,
    etiqueta: etiqueta || null,
    etiqueta_cor: etiqueta ? etiquetaCor : null,
    legenda: legenda || null,
  });

  const handleSave = async () => {
    if (!clienteId || !titulo) {
      toast("Cliente e título são obrigatórios", "error");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      } else {
        await EnvoxersAPI.api("/tarefas", { method: "POST", body: JSON.stringify(buildPayload()) });
      }
      toast("Demanda salva!", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async () => {
    if (!isEdit) return;
    if (!confirm("Excluir esta demanda? Não pode ser desfeito.")) return;
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "DELETE" });
      toast("Demanda excluída", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleComentar = async () => {
    if (!novoComentario.trim()) return;
    try {
      const t = await EnvoxersAPI.api(`/tarefas/${tarefaId}/comentarios`, {
        method: "POST",
        body: JSON.stringify({ texto: novoComentario }),
      });
      setTarefa(t);
      setNovoComentario("");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleUploadCriativo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const t = await EnvoxersAPI.upload(`/tarefas/${tarefaId}/criativo`, file);
      setTarefa(t);
      toast("Criativo enviado!", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  // As 4 ações abaixo (decisão de aprovação/alteração) validam o STATUS PERSISTIDO no banco,
  // mas o painel que as exibe usa o `status` local do <select> — se o usuário mudou o dropdown
  // sem clicar em "Salvar" antes, o backend rejeita com 400 sem o usuário entender por quê.
  // Fix: salvar o formulário atual (via buildPayload) numa única ação, antes da decisão em si.
  const handleAprovarInterno = async () => {
    setAcaoLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacao`, {
        method: "POST",
        body: JSON.stringify({ etapa: "interna", decisao: "aprovada" }),
      });
      toast("Aprovado internamente — foi para Aprovação cliente", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAcaoLoading(false);
    }
  };

  const handlePedirAjusteInterno = async () => {
    if (!ajusteComentario.trim()) {
      toast("Escreva o que precisa ajustar", "error");
      return;
    }
    setAcaoLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacao`, {
        method: "POST",
        body: JSON.stringify({ etapa: "interna", decisao: "pediu_ajuste", comentario: ajusteComentario }),
      });
      toast("Ajuste solicitado — foi para Ajustes", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAcaoLoading(false);
    }
  };

  const handleAprovarCliente = async () => {
    setAcaoLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacao`, {
        method: "POST",
        body: JSON.stringify({ etapa: "cliente", decisao: "aprovada" }),
      });
      toast("Aprovado pelo cliente — foi para Programado", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAcaoLoading(false);
    }
  };

  const handleSolicitarAlteracao = async () => {
    if (!alteracaoDescricao.trim()) {
      toast("Descreva a alteração pedida pelo cliente", "error");
      return;
    }
    setAcaoLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      const resp = await EnvoxersAPI.api(`/tarefas/${tarefaId}/alteracoes`, {
        method: "POST",
        body: JSON.stringify({
          descricao: alteracaoDescricao,
          solicitante_cliente_nome: alteracaoSolicitante || null,
        }),
      });
      if (resp.ultrapassou_limite) {
        toast(
          `Atenção: limite de alterações ultrapassado (${resp.alteracao.numero}/${resp.limite_alteracoes})`,
          "error"
        );
      } else {
        toast(`Alteração nº ${resp.alteracao.numero} registrada — foi para Ajustes`, "success");
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAcaoLoading(false);
    }
  };

  const handleUploadAnexo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const t = await EnvoxersAPI.upload(`/tarefas/${tarefaId}/anexos`, file);
      setTarefa(t);
      toast("Anexo enviado!", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  const responsavel = envoxersList.find((e) => String(e.id) === responsavelId);
  const focoNestaTarefa = focoAtivo && isEdit && focoAtivo.tarefa_id === tarefaId;
  const focoEmOutraTarefa = focoAtivo && isEdit && focoAtivo.tarefa_id !== tarefaId;
  // Foco "ativo de verdade" (não pausado) nesta tarefa é o que desbloqueia o conteúdo —
  // pausar volta a ocultar, igual finalizar.
  const desbloqueado = !isEdit || (focoNestaTarefa && !focoAtivo.pausado_em);
  const bloqueado = isEdit && !desbloqueado;
  const statusLabel = (STATUS_COLS.find((c) => c.key === status) || {}).label || status;

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow">
            <span>{cliente ? cliente.nome : "Selecione o cliente"}</span>
            {servicosList.find((s) => String(s.id) === servicoId) && (
              <>
                <span style={{ color: "var(--ink-4)" }}>·</span>
                <span>{servicosList.find((s) => String(s.id) === servicoId).nome}</span>
              </>
            )}
            {tipoTarefa && <><span style={{ color: "var(--ink-4)" }}>·</span><span className="pill">{tipoTarefa}</span></>}
          </div>
          <h2 className="modal-title">{isEdit ? titulo || "—" : "Nova demanda"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Carregando…</div>
        ) : (
          <div className="modal-body">
            <div className="modal-main">
              {bloqueado ? (
                <>
                  <div className="foco-lock-banner">
                    <div className="foco-lock-text">Ative o Foco para ver os detalhes e agir nesta tarefa</div>
                    <button className="btn btn-envox btn-sm" onClick={() => onIniciarFoco(tarefaId)} disabled={!!focoEmOutraTarefa}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z" /></svg>
                      Iniciar Foco
                    </button>
                    {focoEmOutraTarefa && <div className="foco-control-sub" style={{ marginTop: 6 }}>Você já está em Foco em outra tarefa.</div>}
                  </div>

                  <div className="modal-section-title">Status atual</div>
                  <div className="pill">{statusLabel}</div>

                  <div className="modal-section-title" style={{ marginTop: 16 }}>Histórico — últimas concluídas do cliente</div>
                  {tarefasConcluidas.length === 0 ? (
                    <div style={{ color: "var(--ink-4)", fontSize: 13 }}>nenhuma tarefa concluída ainda</div>
                  ) : (
                    <div>
                      {tarefasConcluidas.map((t) => (
                        <div className="comment" key={"hist-" + t.id}>
                          <div className="comment-body">
                            <div className="comment-head"><span className="comment-author">{t.titulo}</span></div>
                            <div className="comment-text">
                              Concluída em {t.finalizada_em ? new Date(t.finalizada_em).toLocaleDateString("pt-BR") : "—"}
                              {t.responsavel_nome ? ` · ${t.responsavel_nome}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-section-title" style={{ marginTop: 16 }}>Próximas do cliente</div>
                  {tarefasProximas.length === 0 ? (
                    <div style={{ color: "var(--ink-4)", fontSize: 13 }}>nenhuma outra tarefa em andamento</div>
                  ) : (
                    <div>
                      {tarefasProximas.map((t) => (
                        <div className="comment" key={"prox-" + t.id}>
                          <div className="comment-body">
                            <div className="comment-head"><span className="comment-author">{t.titulo}</span></div>
                            <div className="comment-text">
                              {(STATUS_COLS.find((c) => c.key === t.status) || {}).label || t.status}
                              {t.prazo ? ` · prazo ${fmtPrazoKb(t.prazo)}` : ""}
                              {t.responsavel_nome ? ` · ${t.responsavel_nome}` : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>

              <div className="modal-section-title">Campos</div>
              <div className="form-row">
                <div className="field span-2">
                  <label>Título <span className="req">*</span></label>
                  <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Carrossel — lançamento linha verão" />
                </div>
                <div className="field">
                  <label>Cliente <span className="req">*</span></label>
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                    <option value="">Selecionar…</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Serviço</label>
                  <select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
                    <option value="">—</option>
                    {servicosList.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Tipo de tarefa</label>
                  <select value={tipoTarefa} onChange={(e) => setTipoTarefa(e.target.value)}>
                    <option value="">—</option>
                    {TIPOS_TAREFA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Prazo</label>
                  <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                </div>
                <div className="field">
                  <label>Responsável</label>
                  <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
                    <option value="">—</option>
                    {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Etiqueta</label>
                  <input type="text" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ex.: Urgente" />
                </div>
                {etiqueta && (
                  <div className="field">
                    <label>Cor da etiqueta</label>
                    <select value={etiquetaCor} onChange={(e) => setEtiquetaCor(e.target.value)}>
                      {ETIQUETA_CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {isEdit && (
                <>
                  <div className="modal-section-title">Criativo <EnvoxersShared.HelpIcon helpKey="modal_criativo" /></div>
                  {tarefa?.criativo ? (
                    <div className="creative-preview">
                      <a href={tarefa.criativo} target="_blank" rel="noreferrer">{tarefa.criativo.split("/").pop()}</a>
                    </div>
                  ) : (
                    <div className="creative-preview">nenhum criativo enviado</div>
                  )}
                  <label className="btn btn-sm" style={{ marginTop: 8, display: "inline-flex", cursor: "pointer" }}>
                    Enviar criativo
                    <input type="file" style={{ display: "none" }} onChange={handleUploadCriativo} />
                  </label>
                </>
              )}

              <div className="modal-section-title">Legenda <EnvoxersShared.HelpIcon helpKey="modal_legenda" /></div>
              <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Texto que acompanha o criativo" style={{ width: "100%", minHeight: 70 }}></textarea>

              {isEdit && status === "revisao_interna" && (permissao === "admin" || permissao === "gestor") && (
                <>
                  <div className="modal-section-title">Aprovação — Revisão interna <EnvoxersShared.HelpIcon helpKey="modal_aprovacao_int" /></div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button className="btn btn-envox btn-sm" onClick={handleAprovarInterno} disabled={acaoLoading}>
                      Aprovar interno
                    </button>
                  </div>
                  <textarea
                    value={ajusteComentario}
                    onChange={(e) => setAjusteComentario(e.target.value)}
                    placeholder="Comentário do ajuste pedido (obrigatório para pedir ajuste)"
                    style={{ width: "100%", minHeight: 50 }}
                  ></textarea>
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 6, color: "var(--farol-amarelo)" }}
                    onClick={handlePedirAjusteInterno}
                    disabled={acaoLoading}
                  >
                    Pedir ajuste
                  </button>
                </>
              )}

              {isEdit && status === "revisao_interna" && permissao !== "admin" && permissao !== "gestor" && (
                <div className="modal-section-title" style={{ color: "var(--ink-4)" }}>
                  Aguardando aprovação do gestor
                </div>
              )}

              {isEdit && status === "aprovacao_cliente" && (
                <>
                  <div className="modal-section-title">Aprovação — Aprovação cliente <EnvoxersShared.HelpIcon helpKey="modal_aprovacao_cli" /></div>
                  {(() => {
                    const limite = cliente?.escopo?.limite_alteracoes;
                    const qtd = tarefa?.qtd_alteracoes || 0;
                    const noLimite = limite != null && qtd >= limite;
                    return (
                      <div className="pill" style={{ marginBottom: 8, color: noLimite ? "var(--farol-vermelho)" : "inherit" }}>
                        Alterações <EnvoxersShared.HelpIcon helpKey="modal_alteracoes" />: {qtd}{limite != null ? ` / ${limite}` : ""}
                        {noLimite ? " — limite do escopo atingido" : ""}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button className="btn btn-envox btn-sm" onClick={handleAprovarCliente} disabled={acaoLoading}>
                      Aprovar
                    </button>
                  </div>
                  <input
                    type="text"
                    value={alteracaoSolicitante}
                    onChange={(e) => setAlteracaoSolicitante(e.target.value)}
                    placeholder="Nome de quem solicitou do lado do cliente (opcional)"
                    style={{ width: "100%", marginBottom: 6 }}
                  />
                  <textarea
                    value={alteracaoDescricao}
                    onChange={(e) => setAlteracaoDescricao(e.target.value)}
                    placeholder="Descreva a alteração solicitada pelo cliente"
                    style={{ width: "100%", minHeight: 50 }}
                  ></textarea>
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 6, color: "var(--farol-amarelo)" }}
                    onClick={handleSolicitarAlteracao}
                    disabled={acaoLoading}
                  >
                    Solicitar alteração
                  </button>
                </>
              )}

              {isEdit && (aprovacoes.length > 0 || alteracoesLista.length > 0) && (
                <>
                  <div className="modal-section-title">Histórico de aprovações</div>
                  <div>
                    {aprovacoes.map((a) => (
                      <div className="comment" key={"apr-" + a.id}>
                        <div className="comment-body">
                          <div className="comment-head">
                            <span className="comment-author">
                              {a.etapa === "interna" ? "Revisão interna" : "Cliente"} · {a.decisao === "aprovada" ? "Aprovada" : "Pediu ajuste"}
                            </span>
                          </div>
                          {a.comentario && <div className="comment-text">{a.comentario}</div>}
                        </div>
                      </div>
                    ))}
                    {alteracoesLista.map((al) => (
                      <div className="comment" key={"alt-" + al.id}>
                        <div className="comment-body">
                          <div className="comment-head">
                            <span className="comment-author">
                              Alteração nº {al.numero} · {al.status}
                              {al.solicitante_cliente_nome ? ` · ${al.solicitante_cliente_nome}` : ""}
                            </span>
                          </div>
                          <div className="comment-text">{al.descricao}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {isEdit && (
                <>
                  <div className="modal-section-title">
                    Anexos <EnvoxersShared.HelpIcon helpKey="modal_anexos" /> <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>· {tarefa?.anexos?.length || 0} arquivo(s)</span>
                  </div>
                  <div className="attach-list">
                    {(tarefa?.anexos || []).map((a, i) => (
                      <a key={i} className="attach" href={a.url} target="_blank" rel="noreferrer">
                        <svg className="attach-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 6h4M6 9h4M6 12h2" /></svg> {a.nome}
                      </a>
                    ))}
                    <label className="attach" style={{ borderStyle: "dashed", color: "var(--ink-3)", cursor: "pointer" }}>
                      + Anexar
                      <input type="file" style={{ display: "none" }} onChange={handleUploadAnexo} />
                    </label>
                  </div>

                  <div className="modal-section-title">Comentários <EnvoxersShared.HelpIcon helpKey="modal_comentarios" /></div>
                  <div>
                    {(tarefa?.comentarios || []).map((c, i) => (
                      <div className="comment" key={i}>
                        <div className="avatar sm gray">{initialsKb(c.envoxer_nome)}</div>
                        <div className="comment-body">
                          <div className="comment-head"><span className="comment-author">{c.envoxer_nome}</span></div>
                          <div className="comment-text">{c.texto}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="comment-box">
                    <textarea placeholder="Comentar…" value={novoComentario} onChange={(e) => setNovoComentario(e.target.value)}></textarea>
                    <div className="comment-box-actions">
                      <button className="btn btn-envox btn-sm" onClick={handleComentar}>Comentar</button>
                    </div>
                  </div>
                </>
              )}
                </>
              )}
            </div>

            <div className="modal-side">
              <div className="modal-side-block">
                <div className="modal-side-label">Responsável</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <div className="avatar sm gray">{initialsKb(responsavel?.nome)}</div>
                  <span className="modal-side-value">{responsavel?.nome || "—"}</span>
                </div>
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Prazo</div>
                <div className="modal-side-value mono">{prazo || "—"}</div>
              </div>

              {isEdit && (
                <div className="modal-side-block">
                  <div className="modal-side-label">Foco na tarefa <EnvoxersShared.HelpIcon helpKey="modal_foco" /></div>
                  {focoNestaTarefa ? (
                    <div className={"foco-control active" + (focoAtivo.pausado_em ? " paused" : "")}>
                      <div className="foco-control-time">{fmtHMS(focoElapsed)}</div>
                      <div className="foco-control-sub">{focoAtivo.pausado_em ? "Pausado" : "Em foco agora"}</div>
                      <div className="foco-control-actions">
                        <button className="btn btn-sm" onClick={onPausarFoco}>{focoAtivo.pausado_em ? "Retomar" : "Pausar"}</button>
                        <button className="btn btn-sm stop" onClick={onFinalizarFoco}>Finalizar</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-envox btn-sm"
                      style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
                      onClick={() => onIniciarFoco(tarefaId)}
                      disabled={!!focoEmOutraTarefa}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z" /></svg>
                      Iniciar Foco
                    </button>
                  )}
                  {focoEmOutraTarefa && <div className="foco-control-sub" style={{ marginTop: 6 }}>Você já está em Foco em outra tarefa.</div>}
                </div>
              )}

              {!bloqueado && (
                <div className="modal-side-block">
                  <div className="modal-side-label">Ações</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={handleSave} disabled={saving}>
                      {saving ? "Salvando…" : "Salvar alterações"}
                    </button>
                    {isEdit && (
                      <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start", color: "var(--farol-vermelho)", borderColor: "transparent" }} onClick={handleExcluir}>
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.KanbanScreen = KanbanScreen;
window.KANBAN_STATUS_COLS = STATUS_COLS;
window.TaskModal = TaskModal;
