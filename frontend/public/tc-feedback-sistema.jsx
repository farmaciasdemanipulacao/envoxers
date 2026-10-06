const { useState: useStateFeedbackPage, useEffect: useEffectFeedbackPage } = React;

function FeedbackSistemaScreen() {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateFeedbackPage(null);
  const [filtro, setFiltro] = useStateFeedbackPage("");

  const carregar = async () => {
    try {
      const q = filtro ? "?status=" + encodeURIComponent(filtro) : "";
      setItens(await EnvoxersAPI.api("/feedback-sistema" + q));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectFeedbackPage(() => { carregar(); }, [filtro]);

  const atualizarStatus = async (id, status) => {
    try {
      const atualizado = await EnvoxersAPI.api("/feedback-sistema/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: status }),
      });
      setItens((prev) => (prev || []).map((x) => x.id === id ? atualizado : x));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="page feedback-admin-page">
      <EnvoxersShared.PageHeader title="Erros e ideias" subtitle="Solicitações enviadas pelo time dentro do Envoxers." />
      <div className="feedback-admin-toolbar">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="novo">Novos</option>
          <option value="em_analise">Em análise</option>
          <option value="feito">Feitos</option>
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
                  <span className={"feedback-type " + item.tipo}>{item.tipo === "erro" ? "ERRO" : "IDEIA"}</span>
                  <h3>{item.titulo}</h3>
                </div>
                <select value={item.status} onChange={(e) => atualizarStatus(item.id, e.target.value)}>
                  <option value="novo">Novo</option>
                  <option value="em_analise">Em análise</option>
                  <option value="feito">Feito</option>
                  <option value="descartado">Descartado</option>
                </select>
              </div>
              <div className="feedback-admin-meta">
                {item.criado_por_nome} · {new Date(item.created_at).toLocaleString("pt-BR")}
                {item.pagina ? " · " + item.pagina : ""}
              </div>
              <p>{item.descricao}</p>
              {item.screenshot_url && (
                <a className="feedback-admin-shot" href={item.screenshot_url} target="_blank" rel="noreferrer">
                  <img src={item.screenshot_url} alt={"Captura de " + item.titulo} />
                  <span>Abrir captura em tamanho real</span>
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

window.FeedbackSistemaScreen = FeedbackSistemaScreen;
