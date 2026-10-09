const { useState: useStateKb, useEffect: useEffectKb, useMemo: useMemoKb, useRef: useRefKb } = React;

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

function codigoCardKb(tarefaOuId) {
  if (tarefaOuId && typeof tarefaOuId === "object" && tarefaOuId.codigo) return tarefaOuId.codigo;
  const id = typeof tarefaOuId === "object" ? tarefaOuId?.id : tarefaOuId;
  return id ? "ENV-" + String(id).padStart(6, "0") : "ENV-—";
}

function linkCompartilhavelCardKb(tarefaOuId) {
  const codigo = codigoCardKb(tarefaOuId);
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("card", codigo);
  return url.toString();
}

async function copiarLinkCardKb(tarefaOuId) {
  const link = linkCompartilhavelCardKb(tarefaOuId);
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(link);
    return link;
  }
  const area = document.createElement("textarea");
  area.value = link;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return link;
}

function formatComentarioDataHora(valor) {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", " às");
}

function KanbanScreen({ permissao, envoxerId, focoAtivo, focoElapsed, dataVersion, onAbrirTarefa, onAbrirNovaTarefa, onNavigate }) {
  // Card manual (fora do que nasce automático da cota contratada) só pode ser
  // criado por gestor/admin — mesma trava que já existe no backend (POST
  // /tarefas exige get_current_gestor_ou_admin). Escondendo o botão aqui
  // fechamos o gap de UX de mostrar uma ação que ia dar 403 pra quem não é
  // gestor/admin.
  const podeCriarCard = permissao === "admin" || permissao === "gestor";
  const [tarefas, setTarefas] = useStateKb([]);
  const [clientes, setClientes] = useStateKb([]);
  const [envoxersList, setEnvoxersList] = useStateKb([]);
  const [loading, setLoading] = useStateKb(true);
  const [busca, setBusca] = useStateKb("");
  const [filtroCliente, setFiltroCliente] = useStateKb("");
  // Colaborador sempre abre o Kanban já filtrado nele mesmo (pedido de RBAC) —
  // continua vendo o board inteiro, só o filtro já vem pré-marcado, e dá pra trocar.
  const [filtroResponsavel, setFiltroResponsavel] = useStateKb(permissao === "envoxer" && envoxerId ? String(envoxerId) : "");
  // "card" = responsavel_envoxer_id do card (como sempre foi); "tarefa" = responsável
  // de alguma Etapa/checklist pendente do card, mesmo sem ser o dono do card (D-117).
  const [filtroResponsavelModo, setFiltroResponsavelModo] = useStateKb("card");
  const [filtroStatus, setFiltroStatus] = useStateKb("");
  const [filtroAtrasadas, setFiltroAtrasadas] = useStateKb(false);
  const [ocultarFinalizadas, setOcultarFinalizadas] = useStateKb(true);
  const [kanbanFullscreen, setKanbanFullscreen] = useStateKb(false);
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

  useEffectKb(() => {
    document.body.classList.toggle("kanban-fullscreen-active", kanbanFullscreen);
    return () => document.body.classList.remove("kanban-fullscreen-active");
  }, [kanbanFullscreen]);

  useEffectKb(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && kanbanFullscreen) setKanbanFullscreen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape" && kanbanFullscreen && !document.fullscreenElement) {
        setKanbanFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [kanbanFullscreen]);

  const toggleKanbanFullscreen = async () => {
    if (kanbanFullscreen) {
      setKanbanFullscreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_) {}
      }
      return;
    }

    setKanbanFullscreen(true);
    const appEl = document.querySelector(".app");
    if (appEl && appEl.requestFullscreen) {
      try { await appEl.requestFullscreen(); } catch (_) {
        // O modo focado por CSS continua funcionando quando o navegador
        // bloqueia a Fullscreen API (ex.: alguns PWAs/iOS).
      }
    }
  };

  const filtradas = useMemoKb(() => {
    return tarefas.filter((t) => {
      if (ocultarFinalizadas && t.status === "finalizado") return false;
      if (filtroCliente && String(t.cliente_id) !== filtroCliente) return false;
      if (filtroResponsavel) {
        if (filtroResponsavelModo === "tarefa") {
          if (!(t.etapas_responsaveis_ids || []).map(String).includes(filtroResponsavel)) return false;
        } else if (String(t.responsavel_envoxer_id) !== filtroResponsavel) {
          return false;
        }
      }
      if (filtroStatus && t.status !== filtroStatus) return false;
      if (filtroAtrasadas && (t.status === "finalizado" || fmtPrazoKb(t.prazo).cls !== "atrasada")) return false;
      if (busca) {
        const q = busca.trim().toLowerCase();
        const haystack = [t.titulo, t.cliente_nome, codigoCardKb(t)].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tarefas, busca, filtroCliente, filtroResponsavel, filtroResponsavelModo, filtroStatus, filtroAtrasadas, ocultarFinalizadas]);

  const rolarKanbanHorizontal = (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    e.currentTarget.scrollLeft += delta;
  };

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
    <div className={"page kanban-page" + (kanbanFullscreen ? " kb-fullscreen" : "")} style={{ paddingBottom: 20 }}>
      <div className="page-header" style={{ marginBottom: 16, paddingBottom: 16 }}>
        <div className="page-title-block">
          <h1>Kanban</h1>
          <div className="page-sub">Fluxo de demandas. Arraste os cards entre as colunas — a listra colorida do card é o farol do cliente.</div>
        </div>
        <div className="kanban-header-actions">
          <button className="btn" onClick={toggleKanbanFullscreen}>
            {kanbanFullscreen ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
            )}
            {kanbanFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          </button>
          <button className="btn" onClick={() => onNavigate("calendario")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="10" rx="1" /><path d="M2 7h12M6 2v3M10 2v3" /></svg> Calendário
          </button>
          {podeCriarCard && (
            <button className="btn btn-envox" onClick={() => onAbrirNovaTarefa("nova")}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Nova demanda
            </button>
          )}
        </div>
      </div>

      <div className="kanban-toolbar">
        <div className="search">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <input type="text" placeholder="Buscar demanda, cliente ou ID…" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
          {filtroResponsavel && (
            <select
              className="chip"
              value={filtroResponsavelModo}
              onChange={(e) => setFiltroResponsavelModo(e.target.value)}
              title="Responsável do card inteiro, ou responsável de alguma tarefa/etapa (checklist) dentro dele"
            >
              <option value="card">responsável do Card</option>
              <option value="tarefa">responsável de Tarefa/Etapa</option>
            </select>
          )}
          <select className="chip" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
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
        {kanbanFullscreen && (
          <button className="btn kanban-toolbar-fullscreen-exit" onClick={toggleKanbanFullscreen}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" /></svg>
            Sair da tela cheia
          </button>
        )}
      </div>

      <div className="kanban-navigation-hint" role="note" aria-label="Dica de navegação horizontal">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 8h12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5" />
        </svg>
        <span>Segure <kbd>Shift</kbd> + role a roda do mouse para navegar horizontalmente</span>
      </div>

      <div className="kanban-shell">
        <div className="kanban" onWheel={rolarKanbanHorizontal}>
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
              onNovaNestaColuna={podeCriarCard ? () => onAbrirNovaTarefa(col.key) : null}
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
        {onNovaNestaColuna && (
          <button className="kb-col-add" onClick={onNovaNestaColuna} title="Nova nesta coluna">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2v8M2 6h8" /></svg>
          </button>
        )}
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
  const toast = EnvoxersShared.useToast();
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
        <span className="kb-card-client-name">{t.cliente_nome}</span>
        <button
          type="button"
          className="kb-card-share"
          title={"Copiar link do card " + codigoCardKb(t)}
          draggable="false"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await copiarLinkCardKb(t);
              toast("Link do " + codigoCardKb(t) + " copiado", "success");
            } catch (_) {
              toast("Não foi possível copiar o link", "error");
            }
          }}
        >
          <span className="kb-card-id">{codigoCardKb(t)}</span>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6.5 9.5l3-3"/><path d="M5 11H3.5a2.5 2.5 0 010-5H6"/><path d="M10 5h2.5a2.5 2.5 0 010 5H10"/>
          </svg>
        </button>
      </div>
      <div className="kb-card-title">{t.titulo}</div>
      <div className="kb-card-meta">
        {t.etiqueta && <span className={`tag tag-${t.etiqueta_cor || "cinza"}`}>{t.etiqueta}</span>}
      </div>
      {t.proxima_etapa_titulo && (
        <div className="kb-card-etapa" title={t.proxima_etapa_titulo}>
          <svg className="kb-card-foot-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h3M2 8h3M2 12h3M7 4h7M7 8h7M7 12h7" /></svg>
          <span className="kb-card-etapa-label">CRÍTICA</span>
          <span className="kb-card-etapa-titulo">{t.proxima_etapa_titulo}</span>
          {t.proxima_etapa_prazo && (
            <span className={`prazo ${fmtPrazoKb(t.proxima_etapa_prazo).cls}`}>{fmtPrazoKb(t.proxima_etapa_prazo).txt}</span>
          )}
        </div>
      )}
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
        {(t.responsavel_nome || t.proxima_etapa_responsavel_nome) && (
          <span className="kb-card-people">
            {t.responsavel_nome && (
              <span className="kb-card-person" title={"Responsável pelo card: " + t.responsavel_nome}>
                <span className="kb-card-person-label">C</span>
                <EnvoxersShared.Avatar nome={t.responsavel_nome} fotoUrl={t.responsavel_foto} size="sm" className="gray" envoxerId={t.responsavel_envoxer_id} />
              </span>
            )}
            {t.proxima_etapa_responsavel_nome && (
              <span className="kb-card-person" title={"Responsável pela etapa crítica: " + t.proxima_etapa_responsavel_nome}>
                <span className="kb-card-person-label etapa">E</span>
                <EnvoxersShared.Avatar nome={t.proxima_etapa_responsavel_nome} fotoUrl={t.proxima_etapa_responsavel_foto} size="sm" className="gray" envoxerId={t.proxima_etapa_responsavel_id} />
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// Seletor de 1+ responsáveis pelo ajuste — cria 1 Etapa "Ajustar" por pessoa
// marcada (ver POST /tarefas/{id}/aprovacao e /alteracoes no backend), por
// isso é sempre obrigatório marcar pelo menos 1 antes de pedir o ajuste.
function ResponsavelAjusteSeletor({ envoxersList, selecionados, onToggle }) {
  return (
    <div className="field">
      <label>Responsável(is) pelo ajuste <span className="req">*</span></label>
      <div className="ajuste-responsaveis-lista">
        {envoxersList.map((env) => {
          const marcado = selecionados.includes(env.id);
          return (
            <button
              type="button"
              key={env.id}
              className={"ajuste-responsavel-pill" + (marcado ? " marcado" : "")}
              onClick={() => onToggle(env.id)}
            >
              <EnvoxersShared.Avatar nome={env.nome} fotoUrl={env.foto_url} size="sm" className="gray" envoxerId={env.id} />
              {env.nome}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskModal({ tarefaId, statusInicial, permissao, envoxerId, clientes, envoxersList, focoAtivo, focoElapsed, onIniciarFoco, onPausarFoco, onFinalizarFoco, onClose, onSaved }) {
  const isEdit = !!tarefaId;
  const toast = EnvoxersShared.useToast();
  const [loading, setLoading] = useStateKb(isEdit);
  const [saving, setSaving] = useStateKb(false);
  const [tarefa, setTarefa] = useStateKb(null);
  const [servicosList, setServicosList] = useStateKb([]);

  const [clienteId, setClienteId] = useStateKb("");
  const [servicoId, setServicoId] = useStateKb("");
  const [entregas, setEntregas] = useStateKb([]);
  const [entregaLoading, setEntregaLoading] = useStateKb(false);
  const [titulo, setTitulo] = useStateKb("");
  const [responsavelId, setResponsavelId] = useStateKb("");
  const [status, setStatus] = useStateKb(statusInicial || "nova");
  const [prazo, setPrazo] = useStateKb("");
  const [etiqueta, setEtiqueta] = useStateKb("");
  const [etiquetaCor, setEtiquetaCor] = useStateKb("cinza");
  const [novoComentario, setNovoComentario] = useStateKb("");
  const [comentando, setComentando] = useStateKb(false);
  const [comentarioArquivos, setComentarioArquivos] = useStateKb([]);
  const [comentarioUploadPct, setComentarioUploadPct] = useStateKb(0);
  const comentarioArquivosRef = useRefKb([]);
  const comentarioEnviandoRef = useRefKb(false);
  const [anexoUploading, setAnexoUploading] = useStateKb(false);
  const [anexoProgresso, setAnexoProgresso] = useStateKb(0);
  const [anexoNome, setAnexoNome] = useStateKb("");
  const [anexoDragAtivo, setAnexoDragAtivo] = useStateKb(false);
  const [anexoEditandoUrl, setAnexoEditandoUrl] = useStateKb("");
  const [anexoEditNome, setAnexoEditNome] = useStateKb("");
  const [anexoAcao, setAnexoAcao] = useStateKb("");
  const [comentarioEditandoCriadoEm, setComentarioEditandoCriadoEm] = useStateKb("");
  const [comentarioEditTexto, setComentarioEditTexto] = useStateKb("");
  const [comentarioAcao, setComentarioAcao] = useStateKb("");
  const [mencaoAberta, setMencaoAberta] = useStateKb(false);
  const [mencaoQuery, setMencaoQuery] = useStateKb("");
  const [mencoesSelecionadas, setMencoesSelecionadas] = useStateKb([]);
  const comentarioTextareaRef = useRefKb(null);
  const [editandoTitulo, setEditandoTitulo] = useStateKb(false);
  const [tituloSalvando, setTituloSalvando] = useStateKb(false);

  const [aprovacoes, setAprovacoes] = useStateKb([]);
  const [alteracoesLista, setAlteracoesLista] = useStateKb([]);
  const [ajusteComentario, setAjusteComentario] = useStateKb("");
  const [ajusteResponsaveis, setAjusteResponsaveis] = useStateKb([]);
  const [alteracaoDescricao, setAlteracaoDescricao] = useStateKb("");
  const [alteracaoSolicitante, setAlteracaoSolicitante] = useStateKb("");
  const [alteracaoResponsaveis, setAlteracaoResponsaveis] = useStateKb([]);
  const [acaoLoading, setAcaoLoading] = useStateKb(false);

  const [etapas, setEtapas] = useStateKb([]);
  const [etapaLoading, setEtapaLoading] = useStateKb(false);
  const [etapaEditandoId, setEtapaEditandoId] = useStateKb(null);
  const [etapaEditTitulo, setEtapaEditTitulo] = useStateKb("");
  const [etapaEditDescricao, setEtapaEditDescricao] = useStateKb("");
  const [etapaEditResponsavel, setEtapaEditResponsavel] = useStateKb("");
  const [etapaEditPrazo, setEtapaEditPrazo] = useStateKb("");
  const [comoFazerEtapa, setComoFazerEtapa] = useStateKb(null);
  const [automacaoAbertaId, setAutomacaoAbertaId] = useStateKb(null);
  const [automacaoAcao, setAutomacaoAcao] = useStateKb("LIBERAR_PROXIMA_ETAPA");
  const [automacaoColuna, setAutomacaoColuna] = useStateKb("");

  // Resumo básico do cliente — usado só na visão bloqueada (sem Foco ativo nesta tarefa).
  const [tarefasConcluidas, setTarefasConcluidas] = useStateKb([]);
  const [tarefasProximas, setTarefasProximas] = useStateKb([]);

  useEffectKb(() => {
    comentarioArquivosRef.current = comentarioArquivos;
  }, [comentarioArquivos]);

  useEffectKb(() => () => {
    comentarioArquivosRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

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
          setResponsavelId(t.responsavel_envoxer_id ? String(t.responsavel_envoxer_id) : "");
          setStatus(t.status);
          setPrazo(t.prazo || "");
          setEtiqueta(t.etiqueta || "");
          setEtiquetaCor(t.etiqueta_cor || "cinza");

          const [aprovs, alts, tarefasCliente, etapasCarregadas] = await Promise.all([
            EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacoes`),
            EnvoxersAPI.api(`/tarefas/${tarefaId}/alteracoes`),
            EnvoxersAPI.api(`/tarefas?cliente_id=${t.cliente_id}`),
            EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas`),
          ]);
          setAprovacoes(aprovs);
          setAlteracoesLista(alts);
          setEtapas(etapasCarregadas);

          if (t.item_escopo_id) {
            setEntregas(await EnvoxersAPI.api(`/tarefas/${tarefaId}/entregas`));
          }

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

  const carregarEntregas = async () => {
    setEntregas(await EnvoxersAPI.api(`/tarefas/${tarefaId}/entregas`));
  };

  const handleMarcarEntrega = async (check) => {
    setEntregaLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/entregas/${check.id}/${check.entregue ? "desmarcar" : "marcar"}`, { method: "POST" });
      await carregarEntregas();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEntregaLoading(false);
    }
  };

  const handleRegistrarEntregaExtra = async () => {
    setEntregaLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/entregas/extra`, { method: "POST" });
      await carregarEntregas();
      toast("Entrega extra registrada", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEntregaLoading(false);
    }
  };

  const buildPayload = () => ({
    cliente_id: Number(clienteId),
    servico_id: servicoId ? Number(servicoId) : null,
    titulo,
    responsavel_envoxer_id: responsavelId ? Number(responsavelId) : null,
    status,
    prazo: prazo || null,
    etiqueta: etiqueta || null,
    etiqueta_cor: etiqueta ? etiquetaCor : null,
  });

  // true quando algum campo do formulário difere do último estado persistido
  // (`tarefa`, que é realimentado a cada PATCH/refresh que já acontece durante
  // a sessão — ex.: editar título, concluir etapa). Evita PATCH desnecessário
  // ao fechar um card que o usuário só abriu pra olhar.
  const precisaSalvar = () => {
    if (!tarefa) return true;
    const p = buildPayload();
    return (
      p.cliente_id !== tarefa.cliente_id ||
      (p.servico_id || null) !== (tarefa.servico_id || null) ||
      p.titulo !== tarefa.titulo ||
      (p.responsavel_envoxer_id || null) !== (tarefa.responsavel_envoxer_id || null) ||
      p.status !== tarefa.status ||
      (p.prazo || null) !== (tarefa.prazo || null) ||
      (p.etiqueta || null) !== (tarefa.etiqueta || null) ||
      (p.etiqueta_cor || null) !== (tarefa.etiqueta_cor || null)
    );
  };

  // Sem botão "Salvar" — fechar o card (X ou clique fora) salva sozinho se
  // algo mudou. Card novo sem Cliente/Título é descartado ao fechar (nunca
  // cria uma demanda vazia sem querer).
  const handleFecharComSalvar = async () => {
    if (saving) return;
    if (bloqueado) { onClose(); return; }

    const valido = !!clienteId && !!titulo.trim();
    if (!valido) {
      if (titulo.trim() || clienteId) toast("Cliente e título são obrigatórios — alterações não salvas", "error");
      onClose();
      return;
    }
    if (isEdit && !precisaSalvar()) { onClose(); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      } else {
        await EnvoxersAPI.api("/tarefas", { method: "POST", body: JSON.stringify(buildPayload()) });
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Título clicável no cabeçalho — salva sozinho ao sair do campo, sem fechar o card
  // (diferente de handleFecharComSalvar, que salva o resto do formulário só ao fechar).
  const handleSalvarTitulo = async () => {
    const novoTitulo = titulo.trim();
    if (!novoTitulo) {
      setTitulo(tarefa?.titulo || "");
      setEditandoTitulo(false);
      return;
    }
    if (tarefa && novoTitulo === tarefa.titulo) {
      setEditandoTitulo(false);
      return;
    }
    setTituloSalvando(true);
    try {
      const t = await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify({ ...buildPayload(), titulo: novoTitulo }) });
      setTarefa(t);
      setTitulo(t.titulo);
    } catch (err) {
      toast(err.message, "error");
      setTitulo(tarefa?.titulo || "");
    } finally {
      setTituloSalvando(false);
      setEditandoTitulo(false);
    }
  };

  const handleResponsavelChange = async (e) => {
    const valor = e.target.value;
    setResponsavelId(valor);
    if (!isEdit) return;
    const novoId = valor ? Number(valor) : null;
    const atualId = tarefa?.responsavel_envoxer_id || null;
    if (novoId === atualId) return;
    try {
      const t = await EnvoxersAPI.api("/tarefas/" + tarefaId, {
        method: "PATCH",
        body: JSON.stringify({ responsavel_envoxer_id: novoId }),
      });
      setTarefa(t);
      setResponsavelId(t.responsavel_envoxer_id ? String(t.responsavel_envoxer_id) : "");
      toast("Responsável atualizado", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
      setResponsavelId(atualId ? String(atualId) : "");
    }
  };

  const handleExcluir = async () => {
    if (!isEdit) return;
    const aviso = tarefa?.item_escopo_id
      ? `Excluir esta demanda? As ${entregas.filter((e) => e.entregue).length} entrega(s) já marcada(s) neste card serão perdidas — um card novo (zerado) nasce sozinho automaticamente. Não pode ser desfeito.`
      : "Excluir esta demanda? Não pode ser desfeito.";
    if (!confirm(aviso)) return;
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "DELETE" });
      toast("Demanda excluída", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const adicionarArquivosComentario = (files) => {
    const entrada = Array.from(files || []).filter(Boolean);
    if (!entrada.length) return;

    const disponiveis = Math.max(0, 10 - comentarioArquivos.length);
    if (disponiveis <= 0) {
      toast("Máximo de 10 arquivos por comentário", "error");
      return;
    }

    const validos = [];
    for (const file of entrada.slice(0, disponiveis)) {
      if (file.size > 250 * 1024 * 1024) {
        toast('"' + (file.name || "Arquivo") + '" passa do limite de 250 MB', "error");
        continue;
      }
      validos.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
        file,
        previewUrl: (file.type || "").startsWith("image/") ? URL.createObjectURL(file) : "",
      });
    }

    if (entrada.length > disponiveis) {
      toast("Máximo de 10 arquivos por comentário", "error");
    }
    if (validos.length) setComentarioArquivos((prev) => [...prev, ...validos]);
  };

  const removerArquivoComentario = (id) => {
    setComentarioArquivos((prev) => {
      const alvo = prev.find((x) => x.id === id);
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const limparArquivosComentario = () => {
    comentarioArquivosRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    comentarioArquivosRef.current = [];
    setComentarioArquivos([]);
    setComentarioUploadPct(0);
  };

  const handlePasteComentario = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (!files.length) return;
    e.preventDefault();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const normalizados = files.map((file, i) => {
      if (!(file.type || "").startsWith("image/")) return file;
      const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
      return new File([file], "print-" + stamp + (i ? "-" + (i + 1) : "") + "." + ext, { type: file.type });
    });
    adicionarArquivosComentario(normalizados);
    toast(files.length === 1 ? "Print anexado ao comentário" : files.length + " prints anexados", "success");
  };

  const handleSelecionarArquivoComentario = (e) => {
    adicionarArquivosComentario(e.target.files);
    e.target.value = "";
  };

  const handleComentar = async () => {
    const textoEnvio = novoComentario.trim();
    const files = comentarioArquivos.map((x) => x.file);
    if ((!textoEnvio && files.length === 0) || comentarioEnviandoRef.current) return;
    comentarioEnviandoRef.current = true;
    setComentando(true);
    setComentarioUploadPct(0);

    const idsMencionados = mencoesSelecionadas
      .filter((m) => textoEnvio.includes("@" + m.nome))
      .map((m) => m.id);

    try {
      let t;
      if (files.length > 0) {
        t = await EnvoxersAPI.uploadMultipleWithProgress(
          "/tarefas/" + tarefaId + "/comentarios-com-anexos",
          files,
          { texto: textoEnvio, mencoes: JSON.stringify(idsMencionados) },
          (pct) => setComentarioUploadPct(pct)
        );
      } else {
        t = await EnvoxersAPI.api("/tarefas/" + tarefaId + "/comentarios", {
          method: "POST",
          body: JSON.stringify({ texto: textoEnvio, mencoes: idsMencionados }),
        });
      }
      setTarefa(t);
      setNovoComentario("");
      setMencoesSelecionadas([]);
      setMencaoAberta(false);
      limparArquivosComentario();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      comentarioEnviandoRef.current = false;
      setComentando(false);
      setComentarioUploadPct(0);
    }
  };

  // Detecta "@algo" digitado logo antes do cursor (não colado no meio de outra
  // palavra) pra abrir o dropdown de menção com o texto já filtrado.
  const handleComentarioChange = (e) => {
    const val = e.target.value;
    setNovoComentario(val);
    const cursor = e.target.selectionStart;
    const match = val.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setMencaoAberta(true);
      setMencaoQuery(match[1]);
    } else {
      setMencaoAberta(false);
      setMencaoQuery("");
    }
  };

  const handleSelecionarMencao = (env) => {
    const el = comentarioTextareaRef.current;
    const cursor = el ? el.selectionStart : novoComentario.length;
    const textoAteCursor = novoComentario.slice(0, cursor);
    const atIndex = textoAteCursor.lastIndexOf("@");
    if (atIndex === -1) return;
    const antes = novoComentario.slice(0, atIndex);
    const depois = novoComentario.slice(cursor);
    const novoTexto = `${antes}@${env.nome} ${depois}`;
    setNovoComentario(novoTexto);
    setMencoesSelecionadas((prev) => (prev.some((m) => m.id === env.id) ? prev : [...prev, { id: env.id, nome: env.nome }]));
    setMencaoAberta(false);
    setMencaoQuery("");
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = antes.length + env.nome.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const mencaoOpcoes = mencaoAberta
    ? envoxersList.filter((e) => e.nome.toLowerCase().includes(mencaoQuery.toLowerCase())).slice(0, 6)
    : [];

  // Realça "@Nome" no texto já salvo do comentário, comparando com os envoxers
  // conhecidos (nomes maiores primeiro pra não bater parcial em nome comum).
  const destacarMencoes = (texto) => {
    const nomes = envoxersList.map((e) => e.nome).sort((a, b) => b.length - a.length);
    if (!texto || nomes.length === 0) return texto;
    const pattern = new RegExp("@(" + nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "g");
    const partes = [];
    let ultimo = 0;
    let m;
    while ((m = pattern.exec(texto)) !== null) {
      if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
      partes.push(<span className="comment-mencao" key={m.index}>{"@" + m[1]}</span>);
      ultimo = m.index + m[0].length;
    }
    partes.push(texto.slice(ultimo));
    return partes;
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
    if (ajusteResponsaveis.length === 0) {
      toast("Marque quem é o responsável pelo ajuste", "error");
      return;
    }
    setAcaoLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}`, { method: "PATCH", body: JSON.stringify(buildPayload()) });
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/aprovacao`, {
        method: "POST",
        body: JSON.stringify({
          etapa: "interna",
          decisao: "pediu_ajuste",
          comentario: ajusteComentario,
          responsaveis_ajuste: ajusteResponsaveis,
        }),
      });
      toast("Ajuste solicitado — foi para Ajustes", "success");
      setAjusteResponsaveis([]);
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
    if (alteracaoResponsaveis.length === 0) {
      toast("Marque quem é o responsável pelo ajuste", "error");
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
          responsaveis_ajuste: alteracaoResponsaveis,
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
      setAlteracaoResponsaveis([]);
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAcaoLoading(false);
    }
  };

  const enviarAnexoArquivo = async (file) => {
    if (!file || anexoUploading) return;
    setAnexoUploading(true);
    setAnexoProgresso(0);
    setAnexoNome(file.name || "arquivo");
    try {
      const t = await EnvoxersAPI.uploadWithProgress(
        "/tarefas/" + tarefaId + "/anexos",
        file,
        file.name,
        (pct) => setAnexoProgresso(pct)
      );
      setTarefa(t);
      toast("Anexo enviado!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoUploading(false);
      setAnexoProgresso(0);
      setAnexoNome("");
    }
  };

  const handleUploadAnexo = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await enviarAnexoArquivo(file);
    }
    e.target.value = "";
  };

  const handleDropAnexo = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAnexoDragAtivo(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      await enviarAnexoArquivo(file);
    }
  };

  const handleRenomearAnexo = async (anexo) => {
    const nome = anexoEditNome.trim();
    if (!nome || anexoAcao) return;
    setAnexoAcao(anexo.url);
    try {
      const t = await EnvoxersAPI.api("/tarefas/" + tarefaId + "/anexos", {
        method: "PATCH",
        body: JSON.stringify({ url: anexo.url, nome }),
      });
      setTarefa(t);
      setAnexoEditandoUrl("");
      setAnexoEditNome("");
      toast("Arquivo renomeado", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoAcao("");
    }
  };

  const handleExcluirAnexo = async (anexo) => {
    if (!confirm('Excluir "' + anexo.nome + '" definitivamente?')) return;
    setAnexoAcao(anexo.url);
    try {
      const t = await EnvoxersAPI.api(
        "/tarefas/" + tarefaId + "/anexos?url=" + encodeURIComponent(anexo.url),
        { method: "DELETE" }
      );
      setTarefa(t);
      toast("Arquivo excluído", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setAnexoAcao("");
    }
  };

  const focoPermiteEditarComentario =
    !!focoAtivo &&
    focoAtivo.origem !== "comercial" &&
    Number(focoAtivo.tarefa_id) === Number(tarefaId);

  const handleSalvarComentarioEditado = async (comentario) => {
    const texto = comentarioEditTexto.trim();
    if (!texto || comentarioAcao) return;
    setComentarioAcao(String(comentario.criado_em));
    try {
      const t = await EnvoxersAPI.api("/tarefas/" + tarefaId + "/comentarios", {
        method: "PATCH",
        body: JSON.stringify({ criado_em: comentario.criado_em, texto }),
      });
      setTarefa(t);
      setComentarioEditandoCriadoEm("");
      setComentarioEditTexto("");
      toast("Comentário editado", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setComentarioAcao("");
    }
  };

  const handleExcluirComentario = async (comentario) => {
    if (!confirm("Excluir este comentário?")) return;
    setComentarioAcao(String(comentario.criado_em));
    try {
      const t = await EnvoxersAPI.api("/tarefas/" + tarefaId + "/comentarios", {
        method: "DELETE",
        body: JSON.stringify({ criado_em: comentario.criado_em }),
      });
      setTarefa(t);
      if (comentarioEditandoCriadoEm === comentario.criado_em) {
        setComentarioEditandoCriadoEm("");
        setComentarioEditTexto("");
      }
      toast("Comentário excluído", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setComentarioAcao("");
    }
  };

  const carregarEtapas = async () => {
    const lista = await EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas`);
    setEtapas(lista);
    return lista;
  };

  const handleAplicarProcesso = async () => {
    setEtapaLoading(true);
    try {
      const novas = await EnvoxersAPI.api(`/tarefas/${tarefaId}/aplicar-processo`, { method: "POST" });
      await carregarEtapas();
      toast(`${novas.length} etapa(s) do processo adicionada(s)`, "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEtapaLoading(false);
    }
  };

  const handleToggleEtapa = async (etapa) => {
    setEtapaLoading(true);
    try {
      const acao = etapa.status === "concluida" ? "reabrir" : "concluir";
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas/${etapa.id}/${acao}`, { method: "POST" });
      await carregarEtapas();
      if (acao === "concluir") {
        // A automação pode ter movido a coluna ou finalizado a tarefa — recarrega o card.
        const t = await EnvoxersAPI.api(`/tarefas/${tarefaId}`);
        setTarefa(t);
        setStatus(t.status);
      }
      toast(acao === "concluir" ? "Etapa concluída" : "Etapa reaberta", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEtapaLoading(false);
    }
  };

  const handleAbrirEdicaoEtapa = (etapa) => {
    setEtapaEditandoId(etapa.id);
    setEtapaEditTitulo(etapa.titulo);
    setEtapaEditDescricao(etapa.descricao || "");
    setEtapaEditResponsavel(etapa.responsavel_id ? String(etapa.responsavel_id) : "");
    setEtapaEditPrazo(etapa.prazo || "");
  };

  const handleSalvarEdicaoEtapa = async (etapaId) => {
    if (!etapaEditTitulo.trim()) {
      toast("Título da etapa é obrigatório", "error");
      return;
    }
    setEtapaLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas/${etapaId}`, {
        method: "PATCH",
        body: JSON.stringify({
          titulo: etapaEditTitulo,
          descricao: etapaEditDescricao || null,
          responsavel_id: etapaEditResponsavel ? Number(etapaEditResponsavel) : null,
          prazo: etapaEditPrazo || null,
        }),
      });
      setEtapaEditandoId(null);
      await carregarEtapas();
      toast("Etapa atualizada", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEtapaLoading(false);
    }
  };

  const handleExcluirEtapa = async (etapa) => {
    if (!confirm(`Excluir a etapa "${etapa.titulo}" deste card?`)) return;
    setEtapaLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas/${etapa.id}`, { method: "DELETE" });
      await carregarEtapas();
      toast("Etapa excluída", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEtapaLoading(false);
    }
  };

  const handleAbrirAutomacao = (etapa) => {
    if (automacaoAbertaId === etapa.id) {
      setAutomacaoAbertaId(null);
      return;
    }
    setAutomacaoAbertaId(etapa.id);
    setAutomacaoAcao(etapa.automacao?.acao || "LIBERAR_PROXIMA_ETAPA");
    setAutomacaoColuna(etapa.automacao?.coluna_destino || "");
  };

  const handleSalvarAutomacao = async (etapaId) => {
    if (automacaoAcao === "MOVER_TAREFA_COLUNA" && !automacaoColuna) {
      toast("Selecione a coluna de destino", "error");
      return;
    }
    setEtapaLoading(true);
    try {
      await EnvoxersAPI.api(`/tarefas/${tarefaId}/etapas/${etapaId}/automacao`, {
        method: "PUT",
        body: JSON.stringify({
          acao: automacaoAcao,
          coluna_destino: automacaoAcao === "MOVER_TAREFA_COLUNA" ? automacaoColuna : null,
          ativo: true,
        }),
      });
      await carregarEtapas();
      setAutomacaoAbertaId(null);
      toast("Automação configurada", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEtapaLoading(false);
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

  // Botão fica clicável mesmo com Foco em outra tarefa — clique gera alerta explícito
  // em vez de só desabilitar silenciosamente (Gus pediu feedback visível na tentativa).
  const handleCopiarLinkCard = async () => {
    try {
      await copiarLinkCardKb(tarefa || tarefaId);
      toast("Link do " + codigoCardKb(tarefa || tarefaId) + " copiado", "success");
    } catch (_) {
      toast("Não foi possível copiar o link", "error");
    }
  };

  const handleIniciarFoco = () => {
    if (focoEmOutraTarefa) {
      toast(`Você já está com um timer aberto em "${focoAtivo.tarefa_titulo || "outra tarefa"}". Finalize-o antes de iniciar outro.`, "error");
      return;
    }
    onIniciarFoco(tarefaId);
  };

  return (
    <>
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) handleFecharComSalvar(); }}>
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
            {isEdit && (
              <button type="button" className="modal-card-link" onClick={handleCopiarLinkCard} title="Copiar link único deste card">
                <span>{codigoCardKb(tarefa || tarefaId)}</span>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6.5 9.5l3-3"/><path d="M5 11H3.5a2.5 2.5 0 010-5H6"/><path d="M10 5h2.5a2.5 2.5 0 010 5H10"/>
                </svg>
              </button>
            )}
            {isEdit && (
              <span className={`status-pill status-pill-${(STATUS_COLS.find((c) => c.key === status) || {}).phase || "entrada"}`} style={{ marginLeft: "auto" }}>
                <span className="status-pill-dot"></span>{statusLabel}
              </span>
            )}
          </div>
          {isEdit && !bloqueado && editandoTitulo ? (
            <input
              type="text"
              className="modal-title-input"
              value={titulo}
              autoFocus
              disabled={tituloSalvando}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={handleSalvarTitulo}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setTitulo(tarefa?.titulo || ""); setEditandoTitulo(false); }
              }}
            />
          ) : isEdit ? (
            <h2
              className={"modal-title" + (bloqueado ? "" : " editable")}
              onClick={() => !bloqueado && setEditandoTitulo(true)}
              title={bloqueado ? "" : "Clique para editar o título"}
            >
              {titulo || "—"}
              {!bloqueado && (
                <svg className="modal-title-edit-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 2l3 3-8 8-3.5 1 1-3.5z" />
                </svg>
              )}
            </h2>
          ) : (
            <input
              type="text"
              className="modal-title-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título da demanda…"
              autoFocus
            />
          )}
          <button className="modal-close" onClick={handleFecharComSalvar} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Carregando…</div>
        ) : (
          <div className="modal-body">
            <div className="modal-main">
              {isEdit && tarefa?.item_escopo_id && (
                <div className="modal-section" style={{ marginBottom: 14 }}>
                  <div className="modal-section-title">
                    Entregas do mês <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>
                      ({entregas.filter((e) => e.entregue).length}/{entregas.length})
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {entregas.map((e) => (
                      <label
                        key={e.id}
                        title={e.entregue ? `Entregue por ${e.entregue_por_nome || "—"}` : ""}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                          border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer",
                          color: e.excedente ? "var(--envox)" : "inherit",
                        }}
                      >
                        <input type="checkbox" checked={e.entregue} disabled={entregaLoading} onChange={() => handleMarcarEntrega(e)} />
                        {e.numero}{e.excedente ? " (extra)" : ""}
                      </label>
                    ))}
                  </div>
                  {(permissao === "admin" || permissao === "gestor") && (
                    <button className="btn btn-sm" onClick={handleRegistrarEntregaExtra} disabled={entregaLoading} style={{ marginBottom: 0 }}>
                      + Registrar entrega extra
                    </button>
                  )}
                </div>
              )}

              {bloqueado ? (
                <>
                  <div className="foco-lock-banner">
                    <div className="foco-lock-text">Ative o Foco para ver os detalhes e agir nesta tarefa</div>
                    <button className="btn btn-envox btn-sm" onClick={handleIniciarFoco}>
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
                <div className="modal-sections">

              {isEdit && (
                <div className="modal-section">
                  <div className="modal-section-title">Etapas do processo <EnvoxersShared.HelpIcon helpKey="modal_etapas" /></div>
                  <div className="etapa-list">
                    {etapas.length === 0 && (
                      <div style={{ color: "var(--ink-4)", fontSize: 13, marginBottom: 8 }}>
                        nenhuma etapa — cadastre o processo em Serviços ou selecione um serviço com processo pra puxar automaticamente
                      </div>
                    )}
                    {etapas.map((etapa) => {
                      const concluida = etapa.status === "concluida";
                      const podeConcluir =
                        permissao === "admin" ||
                        permissao === "gestor" ||
                        (etapa.responsavel_id != null && envoxerId != null && etapa.responsavel_id === envoxerId);
                      const desabilitado = etapa.bloqueada || !podeConcluir;
                      let tituloCheckbox = "";
                      if (etapa.bloqueada) tituloCheckbox = "Bloqueada até a etapa anterior ser concluída";
                      else if (!podeConcluir) tituloCheckbox = "Só o responsável da etapa (ou gestor/admin) pode concluir";

                      return (
                        <div className="etapa-item" key={etapa.id}>
                          <input
                            type="checkbox"
                            className="etapa-checkbox"
                            checked={concluida}
                            disabled={desabilitado || etapaLoading}
                            title={tituloCheckbox}
                            onChange={() => handleToggleEtapa(etapa)}
                          />
                          <div className="etapa-body">
                            {etapaEditandoId === etapa.id ? (
                              <div className="etapa-automacao-form" style={{ marginTop: 0 }}>
                                <div>
                                  <label>Título da etapa</label>
                                  <input type="text" value={etapaEditTitulo} onChange={(e) => setEtapaEditTitulo(e.target.value)} placeholder="Título" />
                                </div>
                                <div>
                                  <label>Descrição / como fazer</label>
                                  <textarea value={etapaEditDescricao} onChange={(e) => setEtapaEditDescricao(e.target.value)} placeholder="Opcional"></textarea>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <div style={{ flex: 1 }}>
                                    <label>Responsável</label>
                                    <select value={etapaEditResponsavel} onChange={(e) => setEtapaEditResponsavel(e.target.value)}>
                                      <option value="">—</option>
                                      {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                    </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <label>Prazo</label>
                                    <input type="date" value={etapaEditPrazo} onChange={(e) => setEtapaEditPrazo(e.target.value)} />
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn btn-envox btn-sm" onClick={() => handleSalvarEdicaoEtapa(etapa.id)} disabled={etapaLoading}>Salvar</button>
                                  <button className="btn btn-sm" onClick={() => setEtapaEditandoId(null)}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="etapa-row">
                                <div className="etapa-main">
                                  <div className="etapa-head">
                                    <span className={"etapa-titulo" + (concluida ? " concluida" : "")}>{etapa.titulo}</span>
                                    {etapa.bloqueada && (
                                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="etapa-icon" title="Bloqueada">
                                        <rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 0 1 6 0v2" />
                                      </svg>
                                    )}
                                    {etapa.automacao && etapa.automacao.ativo && (
                                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="etapa-icon" title="Tem automação configurada">
                                        <path d="M9 1L3 9h4l-1 6 6-8H8z" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="etapa-meta">
                                    {etapa.responsavel_nome && (
                                      <span className="etapa-meta-item">
                                        <EnvoxersShared.Avatar nome={etapa.responsavel_nome} fotoUrl={etapa.responsavel_foto} size="sm" className="gray" envoxerId={etapa.responsavel_id} /> {etapa.responsavel_nome}
                                      </span>
                                    )}
                                    {etapa.descricao && (
                                      <button className="etapa-automacao-toggle" onClick={() => setComoFazerEtapa(etapa)}>Como fazer</button>
                                    )}
                                  </div>
                                </div>
                                <div className="etapa-side">
                                  <span className={"etapa-prazo-badge " + (EnvoxersShared.corPrazoEtapa(etapa.prazo) || "neutro")}>
                                    {etapa.prazo ? fmtPrazoKb(etapa.prazo).txt : "sem prazo"}
                                  </span>
                                  <div className="etapa-actions">
                                    <button className="etapa-icon-btn" title="Editar etapa" onClick={() => handleAbrirEdicaoEtapa(etapa)}>
                                      <EnvoxersShared.IconEditar />
                                    </button>
                                    <button className="etapa-icon-btn" title={etapa.automacao ? "Editar automação" : "Configurar automação"} onClick={() => handleAbrirAutomacao(etapa)}>
                                      <EnvoxersShared.IconAutomacao />
                                    </button>
                                    <button className="etapa-icon-btn danger" title="Excluir etapa" onClick={() => handleExcluirEtapa(etapa)}>
                                      <EnvoxersShared.IconExcluir />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {automacaoAbertaId === etapa.id && (
                              <div className="etapa-automacao-form">
                                <p className="etapa-automacao-hint">Quando essa etapa for marcada como <strong>concluída</strong>, o sistema faz automaticamente:</p>
                                <select value={automacaoAcao} onChange={(e) => setAutomacaoAcao(e.target.value)}>
                                  <option value="LIBERAR_PROXIMA_ETAPA">Liberar próxima etapa (que fica bloqueada até aqui)</option>
                                  <option value="MOVER_TAREFA_COLUNA">Mover o card pra outra coluna do Kanban</option>
                                  <option value="MARCAR_TAREFA_CONCLUIDA">Marcar o card inteiro como Finalizado</option>
                                  <option value="CRIAR_ALERTA_RESPONSAVEL">Avisar o responsável da próxima etapa</option>
                                </select>
                                {automacaoAcao === "MOVER_TAREFA_COLUNA" && (
                                  <select value={automacaoColuna} onChange={(e) => setAutomacaoColuna(e.target.value)} style={{ marginTop: 6 }}>
                                    <option value="">Coluna de destino…</option>
                                    {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                                  </select>
                                )}
                                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                  <button className="btn btn-envox btn-sm" onClick={() => handleSalvarAutomacao(etapa.id)} disabled={etapaLoading}>Salvar</button>
                                  <button className="btn btn-sm" onClick={() => setAutomacaoAbertaId(null)}>Cancelar</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {servicoId && etapas.length === 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm" onClick={handleAplicarProcesso} disabled={etapaLoading} title="Puxa as etapas-modelo cadastradas no serviço desta tarefa">
                        Puxar etapas do serviço
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isEdit && (
                <div className="modal-section modal-section-comentarios">
                  <div className="modal-section-title">Comentários <EnvoxersShared.HelpIcon helpKey="modal_comentarios" /></div>
                  <div>
                    {(tarefa?.comentarios || []).map((c, i) => {
                      const meuComentario = Number(c.envoxer_id) === Number(envoxerId);
                      const podeAlterar = focoPermiteEditarComentario && meuComentario;
                      const editando = comentarioEditandoCriadoEm === c.criado_em;
                      return (
                        <div className="comment" key={(c.criado_em || "comentario") + "-" + i}>
                          <div className="avatar sm gray">{initialsKb(c.envoxer_nome)}</div>
                          <div className="comment-body">
                            <div className="comment-head">
                              <span className="comment-author">{c.envoxer_nome}</span>
                              <span className="comment-time">{formatComentarioDataHora(c.criado_em)}</span>
                              {c.editado_em && <span className="comment-edited">editado</span>}
                              {podeAlterar && !editando && (
                                <span className="comment-inline-actions">
                                  <button type="button" onClick={() => { setComentarioEditandoCriadoEm(c.criado_em); setComentarioEditTexto(c.texto); }}>Editar</button>
                                  <button type="button" className="danger" disabled={comentarioAcao === String(c.criado_em)} onClick={() => handleExcluirComentario(c)}>Excluir</button>
                                </span>
                              )}
                            </div>
                            {editando ? (
                              <div className="comment-edit-box">
                                <textarea value={comentarioEditTexto} onChange={(e) => setComentarioEditTexto(e.target.value)} autoFocus />
                                <div>
                                  <button className="btn btn-envox btn-xs" disabled={(!comentarioEditTexto.trim() && !(c.anexos || []).length) || comentarioAcao === String(c.criado_em)} onClick={() => handleSalvarComentarioEditado(c)}>Salvar</button>
                                  <button className="btn btn-xs" onClick={() => { setComentarioEditandoCriadoEm(""); setComentarioEditTexto(""); }}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {c.texto && <div className="comment-text">{destacarMencoes(c.texto)}</div>}
                                {(c.anexos || []).length > 0 && (
                                  <div className="comment-attachments">
                                    {(c.anexos || []).map((a, ai) => {
                                      const imagem = (a.mime_type || "").startsWith("image/");
                                      return imagem ? (
                                        <a className="comment-attachment-image" href={a.url} target="_blank" rel="noreferrer" key={(a.url || "img") + ai} title={a.nome}>
                                          <img src={a.url} alt={a.nome || "Imagem anexada"} />
                                          <span>{a.nome}</span>
                                        </a>
                                      ) : (
                                        <a className="comment-attachment-file" href={a.url} target="_blank" rel="noreferrer" key={(a.url || "file") + ai}>
                                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3l-7 7a3 3 0 004 4l6-6a2 2 0 00-3-3L5 11" /></svg>
                                          <span>{a.nome}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!focoPermiteEditarComentario && (tarefa?.comentarios || []).some((c) => Number(c.envoxer_id) === Number(envoxerId)) && (
                      <div className="comment-edit-rule">Para editar ou excluir seus comentários, inicie o Foco neste card.</div>
                    )}
                  </div>
                  <div className="comment-box">
                    <textarea
                      ref={comentarioTextareaRef}
                      placeholder="Comentar… use @ pra marcar alguém"
                      value={novoComentario}
                      onChange={handleComentarioChange}
                      onKeyUp={handleComentarioChange}
                      onBlur={() => setTimeout(() => setMencaoAberta(false), 150)}
                      onPaste={handlePasteComentario}
                      onKeyDown={(e) => { if (e.key === "Escape") setMencaoAberta(false); }}
                    ></textarea>
                    {comentarioArquivos.length > 0 && (
                      <div className="comment-draft-attachments">
                        {comentarioArquivos.map((item) => (
                          <div className={"comment-draft-file" + (item.previewUrl ? " image" : "")} key={item.id}>
                            {item.previewUrl ? (
                              <img src={item.previewUrl} alt={item.file.name || "Print"} />
                            ) : (
                              <div className="comment-draft-file-icon">📎</div>
                            )}
                            <div className="comment-draft-file-name" title={item.file.name}>{item.file.name}</div>
                            <button type="button" onClick={() => removerArquivoComentario(item.id)} disabled={comentando} title="Remover">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {comentando && comentarioArquivos.length > 0 && (
                      <div className="comment-upload-progress">
                        <div><span style={{ width: String(comentarioUploadPct) + "%" }}></span></div>
                        <small>Enviando anexos · {comentarioUploadPct}%</small>
                      </div>
                    )}
                    {mencaoAberta && mencaoOpcoes.length > 0 && (
                      <div className="mencao-dropdown">
                        {mencaoOpcoes.map((env) => (
                          <button
                            type="button"
                            key={env.id}
                            className="mencao-opcao"
                            onMouseDown={(e) => { e.preventDefault(); handleSelecionarMencao(env); }}
                          >
                            <EnvoxersShared.Avatar nome={env.nome} fotoUrl={env.foto_url} size="sm" className="gray" envoxerId={env.id} />
                            {env.nome}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="comment-box-actions comment-box-actions-with-attach">
                      <div className="comment-attach-actions">
                        <label className="comment-attach-btn" title="Anexar arquivo ou imagem">
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 3l-7 7a3 3 0 004 4l6-6a2 2 0 00-3-3L5 11" /></svg>
                          Anexar
                          <input type="file" multiple style={{ display: "none" }} onChange={handleSelecionarArquivoComentario} disabled={comentando} />
                        </label>
                        <span className="comment-paste-hint">ou cole um print com Ctrl+V</span>
                      </div>
                      <button className="btn btn-envox btn-sm" onClick={handleComentar} disabled={comentando || (!novoComentario.trim() && comentarioArquivos.length === 0)}>
                        {comentando ? "Enviando…" : "Comentar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isEdit && status === "revisao_interna" && (permissao === "admin" || permissao === "gestor") && (
                <div className="modal-section">
                  <div className="modal-section-title">Aprovação — Revisão interna <EnvoxersShared.HelpIcon helpKey="modal_aprovacao_int" /></div>

                  <button className="btn btn-approve" style={{ width: "100%", justifyContent: "center" }} onClick={handleAprovarInterno} disabled={acaoLoading}>
                    Aprovar internamente
                  </button>

                  <div className="aprovacao-ajuste-form">
                    <div className="aprovacao-ajuste-title">ou pedir ajuste</div>
                    <div className="field">
                      <label>O que precisa ajustar <span className="req">*</span></label>
                      <textarea
                        value={ajusteComentario}
                        onChange={(e) => setAjusteComentario(e.target.value)}
                        placeholder="Descreva o que precisa mudar antes de seguir pra aprovação do cliente"
                      ></textarea>
                    </div>
                    <ResponsavelAjusteSeletor
                      envoxersList={envoxersList}
                      selecionados={ajusteResponsaveis}
                      onToggle={(id) => setAjusteResponsaveis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                    />
                    <button className="btn btn-reject" style={{ width: "100%", justifyContent: "center" }} onClick={handlePedirAjusteInterno} disabled={acaoLoading}>
                      Pedir ajuste
                    </button>
                  </div>
                </div>
              )}

              {isEdit && status === "revisao_interna" && permissao !== "admin" && permissao !== "gestor" && (
                <div className="modal-section" style={{ color: "var(--ink-4)", fontSize: 13 }}>
                  Aguardando aprovação do gestor
                </div>
              )}

              {isEdit && status === "aprovacao_cliente" && (
                <div className="modal-section">
                  <div className="modal-section-title">Aprovação — Aprovação cliente <EnvoxersShared.HelpIcon helpKey="modal_aprovacao_cli" /></div>
                  {(() => {
                    const limite = cliente?.escopo?.limite_alteracoes;
                    const qtd = tarefa?.qtd_alteracoes || 0;
                    const noLimite = limite != null && qtd >= limite;
                    return (
                      <div className={"alt-counter" + (noLimite ? " over" : "")} style={{ marginBottom: 12 }}>
                        <span className="alt-counter-num">{qtd}{limite != null ? ` / ${limite}` : ""}</span>
                        <span>Alterações <EnvoxersShared.HelpIcon helpKey="modal_alteracoes" />{noLimite ? " — limite do escopo atingido" : ""}</span>
                      </div>
                    );
                  })()}

                  <button className="btn btn-approve" style={{ width: "100%", justifyContent: "center" }} onClick={handleAprovarCliente} disabled={acaoLoading}>
                    Aprovar
                  </button>

                  <div className="aprovacao-ajuste-form">
                    <div className="aprovacao-ajuste-title">ou registrar alteração pedida pelo cliente</div>
                    <div className="field">
                      <label>Quem solicitou <span className="hint">opcional</span></label>
                      <input
                        type="text"
                        value={alteracaoSolicitante}
                        onChange={(e) => setAlteracaoSolicitante(e.target.value)}
                        placeholder="Nome de quem pediu do lado do cliente"
                      />
                    </div>
                    <div className="field">
                      <label>Descreva a alteração <span className="req">*</span></label>
                      <textarea
                        value={alteracaoDescricao}
                        onChange={(e) => setAlteracaoDescricao(e.target.value)}
                        placeholder="O que o cliente pediu pra mudar"
                      ></textarea>
                    </div>
                    <ResponsavelAjusteSeletor
                      envoxersList={envoxersList}
                      selecionados={alteracaoResponsaveis}
                      onToggle={(id) => setAlteracaoResponsaveis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                    />
                    <button className="btn btn-reject" style={{ width: "100%", justifyContent: "center" }} onClick={handleSolicitarAlteracao} disabled={acaoLoading}>
                      Solicitar alteração
                    </button>
                  </div>
                </div>
              )}

              {isEdit && (aprovacoes.length > 0 || alteracoesLista.length > 0) && (
                <div className="modal-section">
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
                </div>
              )}
                </div>
              )}
            </div>

            <div className="modal-side">
              <div className="modal-side-block">
                <div className="modal-side-label">Status</div>
                <select className="modal-side-select" value={status} disabled={bloqueado} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Cliente <span className="req">*</span></div>
                <select className="modal-side-select" value={clienteId} disabled={bloqueado} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Selecionar…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Serviço</div>
                <select className="modal-side-select" value={servicoId} disabled={bloqueado} onChange={(e) => setServicoId(e.target.value)}>
                  <option value="">—</option>
                  {servicosList.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Responsável</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <EnvoxersShared.Avatar nome={responsavel?.nome} fotoUrl={responsavel?.foto_url} size="sm" className="gray" envoxerId={responsavel?.id} />
                  <select
                    className="modal-side-select"
                    value={responsavelId}
                    disabled={bloqueado && permissao !== "admin" && permissao !== "gestor"}
                    onChange={handleResponsavelChange}
                  >
                    <option value="">—</option>
                    {envoxersList.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Prazo</div>
                <input type="date" className="modal-side-input mono" value={prazo} disabled={bloqueado} onChange={(e) => setPrazo(e.target.value)} />
              </div>

              <div className="modal-side-block">
                <div className="modal-side-label">Etiqueta</div>
                <div className="modal-side-etiqueta">
                  <input type="text" className="modal-side-input" value={etiqueta} disabled={bloqueado} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Ex.: Urgente" />
                  {etiqueta && (
                    <select className="modal-side-select" value={etiquetaCor} disabled={bloqueado} onChange={(e) => setEtiquetaCor(e.target.value)}>
                      {ETIQUETA_CORES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {isEdit && !bloqueado && (
                <div className="modal-side-block">
                  <div className="modal-side-label">
                    Anexos <EnvoxersShared.HelpIcon helpKey="modal_anexos" /> <span style={{ fontWeight: 400, color: "var(--ink-4)", textTransform: "none", letterSpacing: 0 }}>· {tarefa?.anexos?.length || 0}</span>
                  </div>
                  <div className="attach-list attach-managed-list">
                    {(tarefa?.anexos || []).map((a, i) => {
                      const editando = anexoEditandoUrl === a.url;
                      return (
                        <div className="attach-managed-row" key={a.url || i}>
                          <svg className="attach-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 6h4M6 9h4M6 12h2" /></svg>
                          {editando ? (
                            <input className="attach-rename-input" value={anexoEditNome} onChange={(e) => setAnexoEditNome(e.target.value)} onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenomearAnexo(a);
                              if (e.key === "Escape") { setAnexoEditandoUrl(""); setAnexoEditNome(""); }
                            }} autoFocus />
                          ) : (
                            <a className="attach-managed-name" href={a.url} target="_blank" rel="noreferrer" title={a.nome}>{a.nome}</a>
                          )}
                          <div className="attach-managed-actions">
                            {editando ? (
                              <>
                                <button className="attach-action-btn" disabled={!anexoEditNome.trim() || anexoAcao === a.url} onClick={() => handleRenomearAnexo(a)}>Salvar</button>
                                <button className="attach-action-btn" onClick={() => { setAnexoEditandoUrl(""); setAnexoEditNome(""); }}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button className="attach-action-btn" onClick={() => { setAnexoEditandoUrl(a.url); setAnexoEditNome(a.nome || ""); }}>Renomear</button>
                                {(permissao === "admin" || permissao === "gestor") && (
                                  <button className="attach-action-btn danger" disabled={anexoAcao === a.url} onClick={() => handleExcluirAnexo(a)}>Excluir</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className={"attach-dropzone" + (anexoDragAtivo ? " drag-active" : "") + (anexoUploading ? " uploading" : "")}
                    onDragEnter={(e) => { e.preventDefault(); setAnexoDragAtivo(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setAnexoDragAtivo(true); }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      if (!e.currentTarget.contains(e.relatedTarget)) setAnexoDragAtivo(false);
                    }}
                    onDrop={handleDropAnexo}
                  >
                    {anexoUploading ? (
                      <>
                        <div className="attach-dropzone-title">Enviando {anexoNome}</div>
                        <div className="attach-progress-track">
                          <div className="attach-progress-bar" style={{ width: String(anexoProgresso) + "%" }}></div>
                        </div>
                        <div className="attach-progress-label">{anexoProgresso}%</div>
                      </>
                    ) : (
                      <>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4h16v-4"/></svg>
                        <div className="attach-dropzone-title">Arraste arquivos para cá</div>
                        <div className="attach-dropzone-sub">ou clique para escolher no computador · até 250 MB</div>
                        <label className="btn btn-sm attach-dropzone-button">
                          Escolher arquivo
                          <input type="file" multiple style={{ display: "none" }} onChange={handleUploadAnexo} disabled={anexoUploading} />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              )}

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
                      onClick={handleIniciarFoco}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z" /></svg>
                      Iniciar Foco
                    </button>
                  )}
                  {focoEmOutraTarefa && <div className="foco-control-sub" style={{ marginTop: 6 }}>Você já está em Foco em outra tarefa.</div>}
                </div>
              )}

              {!bloqueado && isEdit && (
                <div className="modal-side-block">
                  <div className="modal-side-label">Ações</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    <button className="btn btn-sm" style={{ width: "100%", justifyContent: "flex-start", color: "var(--farol-vermelho)", borderColor: "transparent" }} onClick={handleExcluir}>
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    {comoFazerEtapa && (
      <EnvoxersShared.ComoFazerModal
        titulo={comoFazerEtapa.titulo}
        descricao={comoFazerEtapa.descricao}
        onClose={() => setComoFazerEtapa(null)}
      />
    )}
    </>
  );
}

window.KanbanScreen = KanbanScreen;
window.KANBAN_STATUS_COLS = STATUS_COLS;
window.TaskModal = TaskModal;
