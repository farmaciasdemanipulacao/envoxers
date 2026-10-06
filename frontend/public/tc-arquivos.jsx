const { useState: useStateArquivos, useEffect: useEffectArquivos } = React;

function fmtArquivoData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtArquivoTamanho(kb) {
  if (kb == null) return "—";
  if (kb < 1024) return kb + " KB";
  return (kb / 1024).toFixed(kb > 10240 ? 0 : 1) + " MB";
}

function ArquivosScreen({ permissao, onAbrirTarefa }) {
  const toast = EnvoxersShared.useToast();
  const [arquivos, setArquivos] = useStateArquivos(null);
  const [busca, setBusca] = useStateArquivos("");
  const [pastasAbertas, setPastasAbertas] = useStateArquivos({});
  const podeExcluir = permissao === "admin" || permissao === "gestor";

  const carregar = async () => {
    try {
      const q = busca.trim() ? "?q=" + encodeURIComponent(busca.trim()) : "";
      setArquivos(await EnvoxersAPI.api("/arquivos" + q));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectArquivos(() => { carregar(); }, []);

  const renomear = async (a) => {
    const nome = window.prompt("Novo nome do arquivo", a.nome || "");
    if (!nome || nome.trim() === a.nome) return;
    try {
      await EnvoxersAPI.api("/tarefas/" + a.card_id + "/anexos", {
        method: "PATCH",
        body: JSON.stringify({ url: a.url, nome: nome.trim() }),
      });
      toast("Arquivo renomeado", "success");
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const excluir = async (a) => {
    if (!podeExcluir) return;
    if (!confirm('Excluir "' + a.nome + '" definitivamente?')) return;
    try {
      await EnvoxersAPI.api("/tarefas/" + a.card_id + "/anexos?url=" + encodeURIComponent(a.url), { method: "DELETE" });
      toast("Arquivo excluído", "success");
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (arquivos === null) return <div className="page"><div className="empty">Carregando arquivos…</div></div>;

  const grupos = {};
  arquivos.forEach((a) => {
    const ctx = a.contexto_nome || "Sem contexto";
    if (!grupos[ctx]) grupos[ctx] = {};
    const cardKey = String(a.card_id);
    if (!grupos[ctx][cardKey]) grupos[ctx][cardKey] = { titulo: a.card_titulo, servico: a.servico_nome, arquivos: [] };
    grupos[ctx][cardKey].arquivos.push(a);
  });

  const totalPastas = Object.keys(grupos).length;

  return (
    <div className="page files-page">
      <EnvoxersShared.PageHeader
        title="Arquivos"
        subtitle="Todos os anexos dos cards, organizados por cliente e demanda."
      />

      <div className="files-toolbar">
        <div className="search">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && carregar()}
            placeholder="Buscar arquivo, cliente, card ou serviço…"
          />
        </div>
        <button className="btn" onClick={carregar}>Buscar</button>
        <span className="files-summary">{arquivos.length} arquivo(s) · {totalPastas} pasta(s)</span>
      </div>

      {arquivos.length === 0 ? (
        <div className="empty">Nenhum arquivo encontrado.</div>
      ) : (
        <div className="files-context-list">
          {Object.entries(grupos).map(([contexto, cards]) => {
            const aberta = pastasAbertas[contexto] !== false;
            const qtd = Object.values(cards).reduce((n, c) => n + c.arquivos.length, 0);
            return (
              <section className="files-context" key={contexto}>
                <button className="files-context-head" onClick={() => setPastasAbertas((p) => ({ ...p, [contexto]: !aberta }))}>
                  <span className="files-folder-icon">▰</span>
                  <span><strong>{contexto}</strong><small>{qtd} arquivo(s)</small></span>
                  <span className={"files-chevron" + (aberta ? " open" : "")}>›</span>
                </button>
                {aberta && (
                  <div className="files-card-folders">
                    {Object.entries(cards).map(([cardId, card]) => (
                      <div className="files-card-folder" key={cardId}>
                        <div className="files-card-folder-head">
                          <div>
                            <strong>{card.titulo}</strong>
                            <span>{card.servico || "Sem serviço"} · {card.arquivos.length} arquivo(s)</span>
                          </div>
                          <button className="btn btn-xs" onClick={() => onAbrirTarefa && onAbrirTarefa(Number(cardId))}>Abrir card</button>
                        </div>
                        <div className="files-list">
                          {card.arquivos.map((a) => (
                            <div className="files-row" key={a.url}>
                              <div className="files-row-icon">↗</div>
                              <div className="files-row-main">
                                <a href={a.url} target="_blank" rel="noreferrer">{a.nome}</a>
                                <span>{fmtArquivoTamanho(a.tamanho_kb)} · {fmtArquivoData(a.criado_em)}{a.enviado_por_nome ? " · " + a.enviado_por_nome : ""}</span>
                              </div>
                              <div className="files-row-actions">
                                <button className="btn btn-xs" onClick={() => renomear(a)}>Renomear</button>
                                <a className="btn btn-xs" href={a.url} target="_blank" rel="noreferrer">Abrir</a>
                                {podeExcluir && <button className="btn btn-xs danger-ghost" onClick={() => excluir(a)}>Excluir</button>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.ArquivosScreen = ArquivosScreen;
