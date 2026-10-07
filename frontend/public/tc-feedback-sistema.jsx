const { useState: useStateFeedbackPage, useEffect: useEffectFeedbackPage } = React;

function FeedbackSistemaScreen() {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateFeedbackPage(null);
  const [aba, setAba] = useStateFeedbackPage("abertos");
  const [selecionadoId, setSelecionadoId] = useStateFeedbackPage(null);
  const [notas, setNotas] = useStateFeedbackPage({});
  const [salvandoNotaId, setSalvandoNotaId] = useStateFeedbackPage(null);

  const carregar = async () => {
    try {
      const data = await EnvoxersAPI.api("/feedback-sistema?limit=300");
      setItens(data);
      setNotas((prev) => {
        const next = { ...prev };
        data.forEach((item) => {
          if (next[item.id] == null) next[item.id] = item.observacao_admin || "";
        });
        return next;
      });
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectFeedbackPage(() => { carregar(); }, []);

  const selecionado = (itens || []).find((x) => x.id === selecionadoId) || null;

  const atualizarNaLista = (atualizado) => {
    setItens((prev) => (prev || []).map((x) => x.id === atualizado.id ? atualizado : x));
    setNotas((prev) => ({ ...prev, [atualizado.id]: atualizado.observacao_admin || "" }));
  };

  const atualizarStatus = async (item, status) => {
    const nota = (notas[item.id] || "").trim();
    if (status === "aguardando_teste" && !nota) {
      toast("Explique o que foi feito antes de enviar para teste", "error");
      return;
    }
    try {
      const atualizado = await EnvoxersAPI.api("/feedback-sistema/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status === "aguardando_teste" ? { observacao_admin: nota } : {}),
        }),
      });
      toast(status === "aguardando_teste" ? "Enviado para teste do solicitante" : "Status atualizado", "success");
      atualizarNaLista(atualizado);
    } catch (err) {
      toast(err.message, "error");
      await carregar();
    }
  };

  const atualizarPrioridade = async (id, prioridade) => {
    try {
      const atualizado = await EnvoxersAPI.api("/feedback-sistema/" + id, {
        method: "PATCH",
        body: JSON.stringify({ prioridade }),
      });
      atualizarNaLista(atualizado);
      await carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const salvarNota = async (item) => {
    setSalvandoNotaId(item.id);
    try {
      const atualizado = await EnvoxersAPI.api("/feedback-sistema/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ observacao_admin: (notas[item.id] || "").trim() || null }),
      });
      atualizarNaLista(atualizado);
      toast("Observação salva", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvandoNotaId(null);
    }
  };

  const tipoInteracao = (interacao) => ({
    admin_enviou_teste: "Enviado para teste",
    usuario_aprovou: "Teste aprovado",
    usuario_reprovou: "Teste reprovado / reaberto",
  }[interacao.tipo] || interacao.tipo);

  const statusLabel = (status) => ({
    novo: "Novo",
    em_analise: "Em análise",
    aguardando_teste: "Aguardando teste",
    concluido: "Concluído",
    descartado: "Descartado",
  }[status] || status);

  const prioridadeLabel = (p) => ({ alta: "Alta", media: "Média", baixa: "Baixa" }[p] || p);

  const abertos = (itens || []).filter((x) => ["novo", "em_analise", "aguardando_teste"].includes(x.status));
  const concluidos = (itens || []).filter((x) => x.status === "concluido");
  const descartados = (itens || []).filter((x) => x.status === "descartado");

  const listaAtual = aba === "concluidos" ? concluidos : aba === "descartados" ? descartados : abertos;

  const TicketCard = ({ item }) => (
    <button
      type="button"
      className={"feedback-compact-card priority-" + (item.prioridade || "media") + " status-" + item.status}
      onClick={() => setSelecionadoId(item.id)}
    >
      <div className="feedback-compact-top">
        <span className={"feedback-type " + item.tipo}>{item.tipo === "erro" ? "ERRO" : "SUGESTÃO"}</span>
        <span className={"feedback-priority-flag " + (item.prioridade || "media")}>{prioridadeLabel(item.prioridade || "media")}</span>
      </div>
      <h3>{item.titulo}</h3>
      <div className="feedback-compact-bottom">
        <span className={"feedback-status-mini status-" + item.status}>{statusLabel(item.status)}</span>
        <span>{item.criado_por_nome}</span>
      </div>
    </button>
  );

  return (
    <div className="page feedback-admin-page feedback-admin-compact-page">
      <EnvoxersShared.PageHeader
        title="Erros e Sugestões"
        subtitle="Acompanhe o que ainda precisa de ação. Tickets concluídos e descartados ficam separados do backlog."
      />

      <div className="feedback-board-tabs">
        <button className={aba === "abertos" ? "active" : ""} onClick={() => setAba("abertos")}>
          Em aberto <span>{abertos.length}</span>
        </button>
        <button className={aba === "concluidos" ? "active" : ""} onClick={() => setAba("concluidos")}>
          Concluídos <span>{concluidos.length}</span>
        </button>
        <button className={aba === "descartados" ? "active" : ""} onClick={() => setAba("descartados")}>
          Descartados <span>{descartados.length}</span>
        </button>
        <div className="feedback-board-tabs-spacer"></div>
        <button className="feedback-refresh-btn" onClick={carregar}>Atualizar</button>
      </div>

      {itens === null ? (
        <div className="empty">Carregando…</div>
      ) : listaAtual.length === 0 ? (
        <div className="feedback-board-empty">
          {aba === "abertos"
            ? "Nenhum ticket pendente. Tudo resolvido por aqui."
            : aba === "concluidos"
              ? "Nenhum ticket concluído."
              : "Nenhum ticket descartado."}
        </div>
      ) : (
        <div className="feedback-compact-grid">
          {listaAtual.map((item) => <TicketCard item={item} key={item.id} />)}
        </div>
      )}

      {selecionado && (
        <div className="modal-overlay open feedback-detail-overlay" onClick={(e) => e.target === e.currentTarget && setSelecionadoId(null)}>
          <div className="feedback-detail-modal">
            <div className="feedback-detail-head">
              <div className="feedback-detail-head-main">
                <div className="feedback-detail-tags">
                  <span className={"feedback-type " + selecionado.tipo}>{selecionado.tipo === "erro" ? "ERRO" : "SUGESTÃO"}</span>
                  <span className={"feedback-priority-flag " + (selecionado.prioridade || "media")}>{prioridadeLabel(selecionado.prioridade || "media")}</span>
                  <span className={"feedback-status-mini status-" + selecionado.status}>{statusLabel(selecionado.status)}</span>
                </div>
                <h2>{selecionado.titulo}</h2>
                <div className="feedback-detail-meta">
                  {selecionado.criado_por_nome} · {new Date(selecionado.created_at).toLocaleString("pt-BR")}
                  {selecionado.pagina ? " · " + selecionado.pagina : ""}
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelecionadoId(null)} aria-label="Fechar">×</button>
            </div>

            <div className="feedback-detail-body">
              <section className="feedback-detail-section">
                <h4>Solicitação</h4>
                <p>{selecionado.descricao}</p>
              </section>

              {selecionado.screenshot_url && (
                <section className="feedback-detail-section">
                  <h4>Captura enviada</h4>
                  <a className="feedback-detail-shot" href={selecionado.screenshot_url} target="_blank" rel="noreferrer">
                    <img src={selecionado.screenshot_url} alt={"Captura de " + selecionado.titulo} />
                    <span>Abrir captura original</span>
                  </a>
                </section>
              )}

              <section className="feedback-detail-section feedback-detail-controls">
                <div className="feedback-detail-control-row">
                  <div className="field">
                    <label>Prioridade</label>
                    <select
                      className={"priority-select priority-" + (selecionado.prioridade || "media")}
                      value={selecionado.prioridade || "media"}
                      onChange={(e) => atualizarPrioridade(selecionado.id, e.target.value)}
                    >
                      <option value="alta">Alta</option>
                      <option value="media">Média</option>
                      <option value="baixa">Baixa</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Status</label>
                    <select value={selecionado.status} onChange={(e) => atualizarStatus(selecionado, e.target.value)}>
                      <option value="novo">Novo</option>
                      <option value="em_analise">Em análise</option>
                      <option value="aguardando_teste">Enviar para teste</option>
                      <option value="concluido" disabled>Concluído pelo solicitante</option>
                      <option value="descartado">Descartado</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>O que foi feito / instruções para teste</label>
                  <textarea
                    rows={4}
                    value={notas[selecionado.id] || ""}
                    onChange={(e) => setNotas((prev) => ({ ...prev, [selecionado.id]: e.target.value }))}
                    placeholder="Explique o ajuste realizado e, se necessário, como o solicitante deve testar."
                  />
                </div>
                <button className="btn btn-sm" onClick={() => salvarNota(selecionado)} disabled={salvandoNotaId === selecionado.id}>
                  {salvandoNotaId === selecionado.id ? "Salvando…" : "Salvar observação"}
                </button>

                {selecionado.status === "aguardando_teste" && (
                  <div className="feedback-admin-awaiting">
                    Aguardando <strong>{selecionado.criado_por_nome}</strong> testar. O admin não pode concluir este ticket manualmente.
                  </div>
                )}
              </section>

              {Array.isArray(selecionado.interacoes) && selecionado.interacoes.length > 0 && (
                <section className="feedback-detail-section">
                  <h4>Histórico do ticket</h4>
                  <div className="feedback-history feedback-history-admin">
                    {selecionado.interacoes.map((interacao) => (
                      <div className={"feedback-history-item " + interacao.tipo} key={interacao.id}>
                        <div>
                          <strong>{tipoInteracao(interacao)} · {interacao.autor_nome}</strong>
                          <span>{new Date(interacao.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        {interacao.descricao && <p>{interacao.descricao}</p>}
                        {interacao.screenshot_url && (
                          <a href={interacao.screenshot_url} target="_blank" rel="noreferrer">Ver print enviado no teste</a>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.FeedbackSistemaScreen = FeedbackSistemaScreen;
