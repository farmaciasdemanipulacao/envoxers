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

function fmtBytesStorage(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return n + " B";
  const units = ["KB","MB","GB","TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + " " + units[i];
}

function FolderIcon({ small=false }) {
  return (
    <svg className={"windows-folder-icon" + (small ? " small" : "")} viewBox="0 0 64 50" aria-hidden="true">
      <path d="M4 11.5h21l5 6H60v26.5H4z" fill="currentColor" opacity=".92"/>
      <path d="M4 11.5V7h21l5 5H60v5.5H30l-5-6z" fill="currentColor" opacity=".62"/>
      <path d="M7 21h50" stroke="white" strokeOpacity=".24"/>
    </svg>
  );
}

function FileGlyph({ mime }) {
  const video = (mime || "").startsWith("video/");
  const image = (mime || "").startsWith("image/");
  return (
    <div className={"windows-file-glyph" + (video ? " video" : image ? " image" : "")}>
      {video ? "▶" : image ? "▧" : "↗"}
    </div>
  );
}

function ArquivosScreen({ permissao, onAbrirTarefa }) {
  const toast = EnvoxersShared.useToast();
  const [arquivos, setArquivos] = useStateArquivos(null);
  const [busca, setBusca] = useStateArquivos("");
  const [contexto, setContexto] = useStateArquivos("");
  const [cardId, setCardId] = useStateArquivos(null);
  const [storage, setStorage] = useStateArquivos(null);
  const podeExcluir = permissao === "admin" || permissao === "gestor";

  const carregar = async () => {
    try {
      const req = [EnvoxersAPI.api("/arquivos")];
      if (podeExcluir) req.push(EnvoxersAPI.api("/arquivos/storage-status"));
      const res = await Promise.all(req);
      setArquivos(res[0]);
      if (podeExcluir) setStorage(res[1]);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffectArquivos(() => { carregar(); }, []);

  const renomear = async (a) => {
    const nome = window.prompt("Novo nome do arquivo", a.nome || "");
    if (!nome || nome.trim() === a.nome) return;
    try {
      const base = a.card_tipo === "demanda_avulsa" ? "/demandas-avulsas/" : "/tarefas/";
      await EnvoxersAPI.api(base + a.card_id + "/anexos", {
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
      const base = a.card_tipo === "demanda_avulsa" ? "/demandas-avulsas/" : "/tarefas/";
      await EnvoxersAPI.api(base + a.card_id + "/anexos?url=" + encodeURIComponent(a.url), { method: "DELETE" });
      toast("Arquivo excluído", "success");
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (arquivos === null) return <div className="page"><div className="empty">Carregando arquivos…</div></div>;

  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? arquivos.filter((a) => {
    const hay = [a.contexto_nome, a.card_titulo, a.servico_nome, a.nome, a.enviado_por_nome].join(" ").toLowerCase();
    return hay.includes(termo);
  }) : arquivos;

  const contextos = {};
  arquivos.forEach((a) => {
    const key = a.contexto_nome || "Sem contexto";
    if (!contextos[key]) contextos[key] = { arquivos: 0, cards: {} };
    contextos[key].arquivos += 1;
    const cardKey = a.card_chave || ((a.card_tipo || "tarefa") + ":" + a.card_id);
    if (!contextos[key].cards[cardKey]) {
      contextos[key].cards[cardKey] = {
        key: cardKey,
        id: a.card_id,
        tipo: a.card_tipo || "tarefa",
        titulo: a.card_titulo,
        servico: a.servico_nome,
        arquivos: [],
      };
    }
    contextos[key].cards[cardKey].arquivos.push(a);
  });

  const cardAtual = contexto && cardId && contextos[contexto] ? contextos[contexto].cards[cardId] : null;
  const mostrarResultados = !!termo;

  const voltarRaiz = () => { setContexto(""); setCardId(null); };
  const voltarContexto = () => { setCardId(null); };

  const FileTile = ({ a }) => (
    <div className="windows-file-tile">
      <a className="windows-file-open" href={a.url} target="_blank" rel="noreferrer">
        <FileGlyph mime={a.mime_type} />
        <strong title={a.nome}>{a.nome}</strong>
      </a>
      <div className="windows-file-meta">{fmtArquivoTamanho(a.tamanho_kb)} · {fmtArquivoData(a.criado_em)}</div>
      {a.enviado_por_nome && <div className="windows-file-meta">{a.enviado_por_nome}</div>}
      <div className="windows-file-actions">
        <button onClick={() => renomear(a)}>Renomear</button>
        {podeExcluir && <button className="danger" onClick={() => excluir(a)}>Excluir</button>}
      </div>
    </div>
  );

  return (
    <div className="page files-page">
      <EnvoxersShared.PageHeader title="Arquivos" subtitle="Navegue por cliente, card e arquivos como em pastas." />

      {podeExcluir && storage && (
        <div className={"storage-health-card level-" + storage.level}>
          <div className="storage-health-main">
            <div className="storage-health-title">
              <span>Armazenamento do servidor</span>
              <strong>{storage.used_percent}% usado</strong>
            </div>
            <div className="storage-health-track"><span style={{ width: Math.min(100, storage.used_percent) + "%" }}></span></div>
            <div className="storage-health-meta">
              <span>{fmtBytesStorage(storage.used_bytes)} usados de {fmtBytesStorage(storage.total_bytes)}</span>
              <span>{fmtBytesStorage(storage.free_bytes)} livres</span>
              <span>Arquivos Envoxers: {fmtBytesStorage(storage.uploads_bytes)}</span>
            </div>
          </div>
          {storage.level === "warning" && <div className="storage-health-warning">Atenção: o disco passou de {storage.warning_percent}%. Programe aumento de espaço.</div>}
          {storage.level === "critical" && <div className="storage-health-warning critical">Crítico: o disco passou de {storage.critical_percent}%. Aumente o espaço antes de novos uploads.</div>}
        </div>
      )}

      <div className="files-explorer-toolbar">
        <div className="files-breadcrumbs">
          <button className={!contexto ? "active" : ""} onClick={voltarRaiz}>Arquivos</button>
          {contexto && <><span>›</span><button className={!cardId ? "active" : ""} onClick={voltarContexto}>{contexto}</button></>}
          {cardAtual && <><span>›</span><button className="active">{cardAtual.titulo}</button></>}
        </div>
        <div className="search files-search">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar em todos os arquivos…" />
        </div>
      </div>

      {mostrarResultados ? (
        <>
          <div className="files-explorer-caption">Resultados para “{busca}” · {filtrados.length} arquivo(s)</div>
          {filtrados.length ? <div className="windows-files-grid">{filtrados.map((a) => <FileTile a={a} key={a.url} />)}</div> : <div className="empty">Nenhum arquivo encontrado.</div>}
        </>
      ) : !contexto ? (
        <>
          <div className="files-explorer-caption">{Object.keys(contextos).length} pasta(s) de cliente/contexto</div>
          <div className="windows-folder-grid">
            {Object.entries(contextos).sort(([a],[b]) => a.localeCompare(b)).map(([nome, info]) => (
              <button className="windows-folder-tile" key={nome} onClick={() => { setContexto(nome); setCardId(null); }}>
                <FolderIcon />
                <strong>{nome}</strong>
                <span>{Object.keys(info.cards).length} card(s) · {info.arquivos} arquivo(s)</span>
              </button>
            ))}
          </div>
        </>
      ) : !cardAtual ? (
        <>
          <div className="files-explorer-caption">{Object.keys(contextos[contexto].cards).length} pasta(s) dentro de {contexto}</div>
          <div className="windows-folder-grid">
            {Object.values(contextos[contexto].cards).sort((a,b) => a.titulo.localeCompare(b.titulo)).map((card) => (
              <button className="windows-folder-tile" key={card.key} onClick={() => setCardId(card.key)}>
                <FolderIcon />
                <strong>{card.titulo}</strong>
                <span>{card.servico || "Sem serviço"} · {card.arquivos.length} arquivo(s)</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="files-card-actions-bar">
            <div className="files-explorer-caption">{cardAtual.arquivos.length} arquivo(s)</div>
            {cardAtual.tipo === "tarefa" ? (
              <button className="btn btn-sm" onClick={() => onAbrirTarefa && onAbrirTarefa(Number(cardAtual.id))}>Abrir card</button>
            ) : (
              <button className="btn btn-sm" onClick={() => window.envoxersNavigate && window.envoxersNavigate("demandas-avulsas")}>Ir para Demandas Avulsas</button>
            )}
          </div>
          <div className="windows-files-grid">{cardAtual.arquivos.map((a) => <FileTile a={a} key={a.url} />)}</div>
        </>
      )}
    </div>
  );
}

window.ArquivosScreen = ArquivosScreen;
