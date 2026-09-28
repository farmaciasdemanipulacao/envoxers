const { useState: useStateFocoAtivos, useEffect: useEffectFocoAtivos } = React;

const POLL_FOCO_ATIVOS_MS = 20000;

function fmtElapsedFocoAtivos(inicio) {
  const ms = Date.now() - new Date(inicio).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m";
}

function fmtQuandoFocoAtivos(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoje - dia) / 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDias === 0) return "hoje " + hora;
  if (diffDias === 1) return "ontem " + hora;
  if (diffDias > 1 && diffDias < 7) return diffDias + "d atrás, " + hora;
  return d.toLocaleDateString("pt-BR") + " " + hora;
}

function presencaFoco(envoxerId) {
  return window.EnvoxersPresence ? window.EnvoxersPresence.get(envoxerId) : "offline";
}

function estaOnlineFoco(envoxerId) {
  return presencaFoco(envoxerId) !== "offline";
}

function labelPresencaFoco(envoxerId) {
  const p = presencaFoco(envoxerId);
  if (p === "ativo") return "Online agora";
  if (p === "ausente") return "Online · segundo plano";
  return "Offline";
}

const FOCO_ESTADOS = {
  foco_online: {
    titulo: "Foco ligado + online",
    curto: "Foco + online",
    descricao: "Timer ativo e pessoa conectada ao Envoxers.",
    classe: "focus-online",
  },
  foco_offline: {
    titulo: "Foco ligado + offline",
    curto: "Foco + offline",
    descricao: "Timer ativo, mas sem conexão atual com o sistema.",
    classe: "focus-offline",
  },
  sem_foco_online: {
    titulo: "Online sem Foco",
    curto: "Online sem Foco",
    descricao: "Conectado ao Envoxers, mas sem timer de Foco ativo.",
    classe: "no-focus-online",
  },
  sem_foco_offline: {
    titulo: "Offline sem Foco",
    curto: "Offline sem Foco",
    descricao: "Sem timer de Foco e sem conexão atual com o sistema.",
    classe: "no-focus-offline",
  },
};

function FocoPessoaCard({ item, estado, onAbrirTarefa }) {
  const meta = FOCO_ESTADOS[estado];
  const comFoco = estado === "foco_online" || estado === "foco_offline";
  const clicavel = comFoco && !!item.tarefa_id && !!onAbrirTarefa;
  const nuncaUsou = !comFoco && !item.ultimo_tarefa_titulo && !item.ultimo_inicio;
  const tarefaAtual = (item.cliente_nome ? item.cliente_nome + " — " : "") + (item.tarefa_titulo || "Tarefa sem título");
  const ultimaTarefa = (item.ultimo_cliente_nome ? item.ultimo_cliente_nome + " — " : "") + (item.ultimo_tarefa_titulo || "Sem tarefa registrada");

  return (
    <div
      className={"foco-person-card " + meta.classe + (clicavel ? " clickable" : "")}
      onClick={() => clicavel && onAbrirTarefa(item.tarefa_id)}
    >
      <div className="foco-person-card-top">
        <EnvoxersShared.Avatar nome={item.envoxer_nome} fotoUrl={item.envoxer_foto} size="md" envoxerId={item.envoxer_id} />
        <div className="foco-person-identity">
          <strong>{item.envoxer_nome}</strong>
          <span>{labelPresencaFoco(item.envoxer_id)}</span>
        </div>
        <span className={"foco-state-pill " + meta.classe}>{comFoco ? "FOCO" : "SEM FOCO"}</span>
      </div>

      {comFoco ? (
        <>
          <div className="foco-current-line">
            <span className="foco-current-time">{item.pausado_em ? "Pausado" : fmtElapsedFocoAtivos(item.inicio)}</span>
            <span className="foco-current-task" title={tarefaAtual}>{tarefaAtual}</span>
          </div>
          {estado === "foco_offline" && (
            <div className="foco-attention-note">Timer ativo sem presença no sistema. Vale conferir se o Foco ficou ligado por engano.</div>
          )}
        </>
      ) : nuncaUsou ? (
        <div className="foco-last-activity muted">Nunca usou o Foco.</div>
      ) : (
        <div className="foco-last-activity">
          <span>Último Foco</span>
          <strong title={ultimaTarefa}>{ultimaTarefa}</strong>
          <small>{fmtQuandoFocoAtivos(item.ultimo_fim || item.ultimo_inicio) || "—"}</small>
        </div>
      )}
    </div>
  );
}

function FocoGrupo({ estado, itens, onAbrirTarefa }) {
  const meta = FOCO_ESTADOS[estado];
  return (
    <section className={"foco-state-section " + meta.classe}>
      <div className="foco-state-section-head">
        <div>
          <div className="foco-state-section-title">
            <span className={"foco-state-marker " + meta.classe}></span>
            {meta.titulo}
            <span className="foco-state-count">{itens.length}</span>
          </div>
          <p>{meta.descricao}</p>
        </div>
      </div>
      {itens.length === 0 ? (
        <div className="foco-state-empty">Ninguém neste estado agora.</div>
      ) : (
        <div className="foco-status-grid">
          {itens.map((item) => (
            <FocoPessoaCard key={item.envoxer_id} item={item} estado={estado} onAbrirTarefa={onAbrirTarefa} />
          ))}
        </div>
      )}
    </section>
  );
}

function FocoAtivosScreen({ onAbrirTarefa }) {
  const toast = EnvoxersShared.useToast();
  const [status, setStatus] = useStateFocoAtivos({ ativos: [], offline: [] });
  const [loading, setLoading] = useStateFocoAtivos(true);
  const [, forceTick] = useStateFocoAtivos(0);
  const [, forcePresenca] = useStateFocoAtivos(0);

  const carregar = async () => {
    try {
      const data = await EnvoxersAPI.api("/foco/status");
      setStatus(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectFocoAtivos(() => {
    carregar();
    const poll = setInterval(carregar, POLL_FOCO_ATIVOS_MS);
    const tick = setInterval(() => forceTick((n) => n + 1), 30000);
    const unsubscribe = window.EnvoxersPresence
      ? window.EnvoxersPresence.subscribe(() => forcePresenca((n) => n + 1))
      : () => {};
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      unsubscribe();
    };
  }, []);

  const focoOnline = status.ativos.filter((x) => estaOnlineFoco(x.envoxer_id));
  const focoOffline = status.ativos.filter((x) => !estaOnlineFoco(x.envoxer_id));
  const semFocoOnline = status.offline.filter((x) => estaOnlineFoco(x.envoxer_id));
  const semFocoOffline = status.offline.filter((x) => !estaOnlineFoco(x.envoxer_id));
  const totalTime = status.ativos.length + status.offline.length;

  const resumo = [
    ["foco_online", focoOnline.length],
    ["foco_offline", focoOffline.length],
    ["sem_foco_online", semFocoOnline.length],
    ["sem_foco_offline", semFocoOffline.length],
  ];

  return (
    <div className="page foco-monitor-page">
      <EnvoxersShared.PageHeader
        title="Foco"
        subtitle="Presença no Envoxers × status do Foco, em tempo real."
        actions={(
          <button className="btn" onClick={carregar}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 3v4h-4M2 13v-4h4" /><path d="M13 7a5 5 0 00-9-1M3 9a5 5 0 009 1" /></svg> Atualizar
          </button>
        )}
      />

      {loading && <div className="empty">Carregando…</div>}

      {!loading && (
        <>
          <div className="foco-monitor-summary">
            <div className="foco-summary-total">
              <span>Time monitorado</span>
              <strong>{totalTime}</strong>
              <small>pessoas ativas no Envoxers</small>
            </div>
            {resumo.map(([key, qtd]) => {
              const meta = FOCO_ESTADOS[key];
              return (
                <div className={"foco-summary-state " + meta.classe} key={key}>
                  <span className={"foco-state-marker " + meta.classe}></span>
                  <div><span>{meta.curto}</span><strong>{qtd}</strong></div>
                </div>
              );
            })}
          </div>

          <div className="foco-state-layout">
            <FocoGrupo estado="foco_online" itens={focoOnline} onAbrirTarefa={onAbrirTarefa} />
            <FocoGrupo estado="foco_offline" itens={focoOffline} onAbrirTarefa={onAbrirTarefa} />
            <FocoGrupo estado="sem_foco_online" itens={semFocoOnline} onAbrirTarefa={onAbrirTarefa} />
            <FocoGrupo estado="sem_foco_offline" itens={semFocoOffline} onAbrirTarefa={onAbrirTarefa} />
          </div>
        </>
      )}
    </div>
  );
}

window.FocoAtivosScreen = FocoAtivosScreen;
