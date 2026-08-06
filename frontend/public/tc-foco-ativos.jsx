// D-090 — "Quem está em Foco agora": visível a qualquer envoxer logado (todos os
// papéis), sem valor monetário nenhum. Refinamento D-092 (a pedido do Gus): status
// sinalizado com verde (online, timer ligado) / vermelho (offline), cards
// consistentes nas duas seções em vez de tabela pra offline.
const { useState: useStateFocoAtivos, useEffect: useEffectFocoAtivos } = React;

const POLL_FOCO_ATIVOS_MS = 20000;

function fmtElapsedFocoAtivos(inicio) {
  const ms = Date.now() - new Date(inicio).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function fmtQuandoFocoAtivos(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoje - dia) / 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDias === 0) return `hoje ${hora}`;
  if (diffDias === 1) return `ontem ${hora}`;
  if (diffDias > 1 && diffDias < 7) return `${diffDias}d atrás, ${hora}`;
  return `${d.toLocaleDateString("pt-BR")} ${hora}`;
}

function FocoOnlineCard({ item, onAbrirTarefa }) {
  return (
    <div
      className="foco-status-card online clickable"
      onClick={() => onAbrirTarefa && onAbrirTarefa(item.tarefa_id)}
    >
      <div className="foco-status-avatar">
        <EnvoxersShared.Avatar nome={item.envoxer_nome} fotoUrl={item.envoxer_foto} size="md" />
        <span className="foco-status-dot online"></span>
      </div>
      <div className="foco-status-body">
        <div className="foco-status-name">{item.envoxer_nome}</div>
        <span className={"tag " + (item.pausado_em ? "tag-amarelo" : "tag-verde")}>
          {item.pausado_em ? "Pausado" : fmtElapsedFocoAtivos(item.inicio)}
        </span>
        <div className="foco-status-detail" title={`${item.cliente_nome ? item.cliente_nome + " — " : ""}${item.tarefa_titulo || "tarefa sem título"}`}>
          {item.cliente_nome ? `${item.cliente_nome} — ` : ""}{item.tarefa_titulo || "tarefa sem título"}
        </div>
      </div>
    </div>
  );
}

function FocoOfflineCard({ item }) {
  const nuncaUsou = !item.ultimo_tarefa_titulo && !item.ultimo_inicio;
  return (
    <div className="foco-status-card offline">
      <div className="foco-status-avatar">
        <EnvoxersShared.Avatar nome={item.envoxer_nome} fotoUrl={item.envoxer_foto} size="md" />
        <span className="foco-status-dot offline"></span>
      </div>
      <div className="foco-status-body">
        <div className="foco-status-name">{item.envoxer_nome}</div>
        <span className="tag tag-vermelho">Offline</span>
        {nuncaUsou ? (
          <div className="foco-status-detail muted">nunca usou o Foco</div>
        ) : (
          <>
            <div className="foco-status-detail" title={`${item.ultimo_cliente_nome ? item.ultimo_cliente_nome + " — " : ""}${item.ultimo_tarefa_titulo || ""}`}>
              {item.ultimo_cliente_nome ? `${item.ultimo_cliente_nome} — ` : ""}{item.ultimo_tarefa_titulo}
            </div>
            <div className="foco-status-timestamps">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4z" /></svg>
                {fmtQuandoFocoAtivos(item.ultimo_inicio) || "—"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" /></svg>
                {fmtQuandoFocoAtivos(item.ultimo_fim) || "—"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FocoAtivosScreen({ onAbrirTarefa }) {
  const toast = EnvoxersShared.useToast();
  const [status, setStatus] = useStateFocoAtivos({ ativos: [], offline: [] });
  const [loading, setLoading] = useStateFocoAtivos(true);
  const [, forceTick] = useStateFocoAtivos(0);

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
    // Poll (sem WebSocket dedicado ainda) + tick separado só pra re-renderizar o
    // tempo decorrido de cada card sem precisar rebuscar do servidor toda hora.
    const poll = setInterval(carregar, POLL_FOCO_ATIVOS_MS);
    const tick = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const { ativos, offline } = status;
  const totalTime = ativos.length + offline.length;

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Quem está em Foco agora"
        subtitle="Timer ligado e tarefa de cada pessoa, em tempo real — visível pra qualquer um logado."
        actions={(
          <button className="btn" onClick={carregar}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 3v4h-4M2 13v-4h4" /><path d="M13 7a5 5 0 00-9-1M3 9a5 5 0 009 1" /></svg> Atualizar
          </button>
        )}
      />

      {loading && <div className="empty">Carregando…</div>}

      {!loading && (
        <>
          <div className="foco-status-summary">
            <div className="kpi">
              <div className="kpi-label">Time</div>
              <div className="kpi-value">{totalTime}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Com Foco ligado</div>
              <div className="kpi-value" style={{ color: "var(--farol-verde)" }}>{ativos.length}</div>
              <div className="kpi-hint">
                <span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: "var(--farol-verde)" }}></span> ao vivo agora
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Offline</div>
              <div className="kpi-value" style={{ color: "var(--farol-vermelho)" }}>{offline.length}</div>
              <div className="kpi-hint">
                <span className="farol-dot" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: "var(--farol-vermelho)" }}></span> sem timer ligado
              </div>
            </div>
          </div>

          <div className="form-section-title" style={{ marginTop: 0 }}>
            Com o Foco ligado <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>({ativos.length})</span>
          </div>
          {ativos.length === 0 ? (
            <div className="empty" style={{ marginBottom: 28 }}>Ninguém com o Foco ligado agora.</div>
          ) : (
            <div className="foco-status-grid">
              {ativos.map((item) => (
                <FocoOnlineCard key={item.envoxer_id} item={item} onAbrirTarefa={onAbrirTarefa} />
              ))}
            </div>
          )}

          <div className="form-section-title">
            Offline <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>({offline.length})</span>
          </div>
          {offline.length === 0 ? (
            <div className="empty">Todo mundo está com o Foco ligado.</div>
          ) : (
            <div className="foco-status-grid">
              {offline.map((item) => (
                <FocoOfflineCard key={item.envoxer_id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

window.FocoAtivosScreen = FocoAtivosScreen;
