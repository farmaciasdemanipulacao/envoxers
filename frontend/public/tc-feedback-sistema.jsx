const { useState: useStateFeedbackPage, useEffect: useEffectFeedbackPage } = React;

function FeedbackSistemaScreen() {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateFeedbackPage(null);
  const [filtro, setFiltro] = useStateFeedbackPage("");
  const [notas, setNotas] = useStateFeedbackPage({});
  const [salvandoNotaId, setSalvandoNotaId] = useStateFeedbackPage(null);

  const carregar = async () => {
    try {
      const q = filtro ? "?status=" + encodeURIComponent(filtro) : "";
      const data = await EnvoxersAPI.api("/feedback-sistema" + q);
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

  useEffectFeedbackPage(() => { carregar(); }, [filtro]);

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
      setItens((prev) => (prev || []).map((x) => x.id === item.id ? atualizado : x));
      setNotas((prev) => ({ ...prev, [item.id]: atualizado.observacao_admin || "" }));
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
      setItens((prev) => (prev || []).map((x) => x.id === id ? atualizado : x));
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
      setItens((prev) => (prev || []).map((x) => x.id === item.id ? atualizado : x));
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

  return (
    <div className="page feedback-admin-page">
      <EnvoxersShared.PageHeader
        title="Erros e Sugestões"
        subtitle="O ticket só vira Concluído depois que o solicitante testar e confirmar que funcionou."
      />

      <div className="feedback-admin-toolbar">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="novo">Novos</option>
          <option value="em_analise">Em análise</option>
          <option value="aguardando_teste">Aguardando teste</option>
          <option value="concluido">Concluídos</option>
          <option value="descartado">Descartados</option>
        </select>
        <button className="btn btn-sm" onClick={carregar}>Atualizar</button>
      </div>

      {itens === null ? <div className="empty">Carregando…</div> : itens.length === 0 ? (
        <div className="empty">Nenhuma solicitação neste filtro.</div>
      ) : (
        <div className="feedback-admin-grid">
          {itens.map((item) => (
            <article className={"feedback-admin-card status-" + item.status} key={item.id}>
              <div className="feedback-admin-card-head">
                <div>
                  <span className={"feedback-type " + item.tipo}>{item.tipo === "erro" ? "ERRO" : "SUGESTÃO"}</span>
                  <h3>{item.titulo}</h3>
                </div>
                <div className="feedback-admin-selects">
                  <select
                    className={"priority-select priority-" + (item.prioridade || "media")}
                    value={item.prioridade || "media"}
                    onChange={(e) => atualizarPrioridade(item.id, e.target.value)}
                    title="Prioridade"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                  <select value={item.status} onChange={(e) => atualizarStatus(item, e.target.value)} title="Status">
                    <option value="novo">Novo</option>
                    <option value="em_analise">Em análise</option>
                    <option value="aguardando_teste">Enviar para teste</option>
                    <option value="concluido" disabled>Concluído pelo solicitante</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>
              </div>

              <div className="feedback-admin-meta">
                {item.criado_por_nome} · {new Date(item.created_at).toLocaleString("pt-BR")}
                {item.pagina ? " · " + item.pagina : ""}
              </div>

              <p>{item.descricao}</p>

              {item.screenshot_url && (
                <a className="feedback-admin-shot" href={item.screenshot_url} target="_blank" rel="noreferrer">
                  <img src={item.screenshot_url} alt={"Captura de " + item.titulo} />
                  <span>Abrir captura original</span>
                </a>
              )}

              <div className="feedback-admin-note">
                <label>O que foi feito / instruções para teste</label>
                <textarea
                  rows={3}
                  value={notas[item.id] || ""}
                  onChange={(e) => setNotas((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Explique o ajuste realizado e, se necessário, como o solicitante deve testar."
                />
                <button className="btn btn-xs" onClick={() => salvarNota(item)} disabled={salvandoNotaId === item.id}>
                  {salvandoNotaId === item.id ? "Salvando…" : "Salvar observação"}
                </button>
              </div>

              {item.status === "aguardando_teste" && (
                <div className="feedback-admin-awaiting">
                  Aguardando <strong>{item.criado_por_nome}</strong> testar. O admin não pode concluir este ticket manualmente.
                </div>
              )}

              {Array.isArray(item.interacoes) && item.interacoes.length > 0 && (
                <div className="feedback-history feedback-history-admin">
                  <div className="feedback-history-title">Histórico do ticket</div>
                  {item.interacoes.map((interacao) => (
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
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

window.FeedbackSistemaScreen = FeedbackSistemaScreen;
