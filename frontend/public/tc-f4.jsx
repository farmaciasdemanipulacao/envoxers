// F4 — PDI + Feedback 360° + Avaliação 180° + Feedback 1:1 + Pesquisa de Clima (D-121)
const { useState: useStateF4, useEffect: useEffectF4 } = React;

function formatarDataF4(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}
function formatarDataHoraF4(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_PDI_LABELS = { planejada: "Planejada", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
const STATUS_PDI_TAG = { planejada: "tag-cinza", em_andamento: "tag-azul", concluida: "tag-verde", cancelada: "tag-vermelho" };
const TAG_POR_COR = { verde: "tag-verde", amarelo: "tag-amarelo", vermelho: "tag-vermelho" };

// ==================== PDI ====================

function PdiAcaoFormModal({ envoxerId, acao, onClose, onSaved }) {
  const isEdit = !!acao;
  const [titulo, setTitulo] = useStateF4(acao?.titulo || "");
  const [descricao, setDescricao] = useStateF4(acao?.descricao || "");
  const [categoria, setCategoria] = useStateF4(acao?.categoria || "");
  const [prazo, setPrazo] = useStateF4(acao?.prazo || "");
  const [saving, setSaving] = useStateF4(false);
  const toast = EnvoxersShared.useToast();

  const salvar = async () => {
    if (!titulo.trim()) { toast("Informe um título", "error"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await EnvoxersAPI.api(`/pdi/${acao.id}`, {
          method: "PATCH",
          body: JSON.stringify({ titulo, descricao: descricao || null, categoria: categoria || null, prazo: prazo || null }),
        });
      } else {
        await EnvoxersAPI.api("/pdi", {
          method: "POST",
          body: JSON.stringify({ envoxer_id: envoxerId, titulo, descricao: descricao || null, categoria: categoria || null, prazo: prazo || null }),
        });
      }
      toast("Ação de PDI salva!", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow"><span>PDI</span></div>
          <h2 className="modal-title">{isEdit ? "Editar ação" : "Nova ação de PDI"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-main" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label>Título <span className="req">*</span></label>
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Fazer curso de gestão de tempo" />
            </div>
            <div className="field">
              <label>Descrição</label>
              <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhe o que precisa ser feito" />
            </div>
            <div className="form-row">
              <div className="field">
                <label>Categoria / competência</label>
                <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Comunicação" />
              </div>
              <div className="field">
                <label>Prazo</label>
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={onClose}>Cancelar</button>
              <button className="btn btn-sm btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PdiAcaoCard({ acao, onAtualizado }) {
  const [expandido, setExpandido] = useStateF4(false);
  const [editando, setEditando] = useStateF4(false);
  const [comentario, setComentario] = useStateF4("");
  const [enviando, setEnviando] = useStateF4(false);
  const toast = EnvoxersShared.useToast();
  const corPrazo = acao.prazo && acao.status !== "concluida" && acao.status !== "cancelada" ? EnvoxersShared.corPrazoEtapa(acao.prazo) : null;

  const mudarStatus = async (novoStatus) => {
    try {
      await EnvoxersAPI.api(`/pdi/${acao.id}`, { method: "PATCH", body: JSON.stringify({ status: novoStatus }) });
      onAtualizado();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const enviarComentario = async () => {
    if (!comentario.trim()) return;
    setEnviando(true);
    try {
      await EnvoxersAPI.api(`/pdi/${acao.id}/comentarios`, { method: "POST", body: JSON.stringify({ texto: comentario }) });
      setComentario("");
      onAtualizado();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10, borderLeft: corPrazo ? `3px solid var(--farol-${corPrazo})` : "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, cursor: "pointer" }} onClick={() => setExpandido(!expandido)}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{acao.titulo}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className={"tag " + STATUS_PDI_TAG[acao.status]}>{STATUS_PDI_LABELS[acao.status]}</span>
            {acao.categoria && <span className="tag tag-cinza">{acao.categoria}</span>}
            {acao.prazo && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>prazo {formatarDataF4(acao.prazo)}</span>}
            {acao.origem_tipo && acao.origem_tipo !== "manual" && <span className="tag tag-roxo">origem: {acao.origem_tipo}</span>}
          </div>
        </div>
        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>{expandido ? "▲" : "▼"}</span>
      </div>

      {expandido && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {acao.descricao && <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 10, whiteSpace: "pre-wrap" }}>{acao.descricao}</div>}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--ink-3)" }}>Status:</label>
            <select value={acao.status} onChange={(e) => mudarStatus(e.target.value)} style={{ maxWidth: 180 }} onClick={(e) => e.stopPropagation()}>
              {Object.entries(STATUS_PDI_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditando(true); }}>Editar</button>
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Progresso</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {acao.comentarios.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>nenhum check-in ainda</div>}
            {acao.comentarios.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <EnvoxersShared.Avatar nome={c.autor_nome || "?"} fotoUrl={c.autor_foto} size="sm" envoxerId={c.autor_id} />
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.autor_nome || "—"} · {formatarDataHoraF4(c.criado_em)}</div>
                  <div style={{ fontSize: 13 }}>{c.texto}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <input type="text" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Adicionar um check-in de progresso…" style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={enviarComentario} disabled={enviando}>Comentar</button>
          </div>
        </div>
      )}

      {editando && (
        <PdiAcaoFormModal envoxerId={acao.envoxer_id} acao={acao} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); onAtualizado(); }} />
      )}
    </div>
  );
}

function PdiListaPessoa({ alvoId, onVoltar }) {
  const [acoes, setAcoes] = useStateF4([]);
  const [loading, setLoading] = useStateF4(true);
  const [criando, setCriando] = useStateF4(false);
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api(`/pdi?envoxer_id=${alvoId}`);
      setAcoes(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectF4(() => { carregar(); }, [alvoId]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        {onVoltar ? <a onClick={onVoltar} style={{ cursor: "pointer", fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>← Voltar pra equipe</a> : <span />}
        <button className="btn btn-sm btn-primary" onClick={() => setCriando(true)}>+ Nova ação</button>
      </div>
      {loading && <div className="app-loading">Carregando…</div>}
      {!loading && acoes.length === 0 && <div className="hero-quote">Nenhuma ação de PDI ainda. Comece criando a primeira meta de desenvolvimento.</div>}
      {!loading && acoes.map((a) => <PdiAcaoCard key={a.id} acao={a} onAtualizado={carregar} />)}
      {criando && <PdiAcaoFormModal envoxerId={alvoId} onClose={() => setCriando(false)} onSaved={() => { setCriando(false); carregar(); }} />}
    </div>
  );
}

function PdiSection({ permissao, envoxerId }) {
  const isGestorAdmin = permissao !== "envoxer";
  const [alvoId, setAlvoId] = useStateF4(isGestorAdmin ? null : envoxerId);
  const [equipe, setEquipe] = useStateF4([]);
  const [loading, setLoading] = useStateF4(true);
  const toast = EnvoxersShared.useToast();

  const carregarEquipe = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/pdi/equipe");
      setEquipe(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectF4(() => { if (isGestorAdmin && alvoId === null) carregarEquipe(); }, [alvoId]);

  if (!isGestorAdmin || alvoId !== null) {
    return <PdiListaPessoa alvoId={alvoId} onVoltar={isGestorAdmin ? () => setAlvoId(null) : null} />;
  }

  return (
    <div>
      <div style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 14 }}>PDI da equipe — clique numa pessoa pra ver e gerenciar as ações dela.</div>
      {loading && <div className="app-loading">Carregando…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {equipe.map((p) => (
          <div key={p.envoxer_id} onClick={() => setAlvoId(p.envoxer_id)} style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <EnvoxersShared.Avatar nome={p.nome} fotoUrl={p.foto_url} envoxerId={p.envoxer_id} size="sm" />
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nome === undefined ? "" : p.nome}{p.envoxer_id === envoxerId ? " (você)" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="tag tag-cinza">{p.planejadas} planejada{p.planejadas !== 1 ? "s" : ""}</span>
              <span className="tag tag-azul">{p.em_andamento} em andamento</span>
              <span className="tag tag-verde">{p.concluidas} concluída{p.concluidas !== 1 ? "s" : ""}</span>
            </div>
            {p.proximo_prazo && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>próximo prazo: {formatarDataF4(p.proximo_prazo)}</div>}
            {p.total === 0 && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 8 }}>sem ações de PDI ainda</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== CICLOS (admin) ====================

const TIPO_CICLO_LABELS = { "360": "Feedback 360°", "180": "Avaliação 180°", clima: "Clima Organizacional" };
const STATUS_CICLO_TAG = { rascunho: "tag-cinza", aberto: "tag-verde", encerrado: "tag-vermelho" };

function PerguntasClimaEditor({ ciclo }) {
  const [perguntas, setPerguntas] = useStateF4([]);
  const [texto, setTexto] = useStateF4("");
  const [tipo, setTipo] = useStateF4("likert");
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    try {
      const data = await EnvoxersAPI.api(`/clima/perguntas?ciclo_id=${ciclo.id}`);
      setPerguntas(data);
    } catch (err) { toast(err.message, "error"); }
  };
  useEffectF4(() => { carregar(); }, [ciclo.id]);

  const adicionar = async () => {
    if (!texto.trim()) return;
    try {
      await EnvoxersAPI.api(`/clima/perguntas?ciclo_id=${ciclo.id}`, { method: "POST", body: JSON.stringify({ texto, tipo, ordem: perguntas.length + 1 }) });
      setTexto("");
      carregar();
    } catch (err) { toast(err.message, "error"); }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Perguntas do ciclo</div>
      {perguntas.map((p) => <div key={p.id} style={{ fontSize: 13, marginBottom: 4 }}>• {p.texto} <span className="tag tag-cinza">{p.tipo}</span></div>)}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nova pergunta…" style={{ flex: 1 }} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="likert">Escala 1-5</option>
          <option value="aberta">Aberta</option>
        </select>
        <button className="btn btn-sm" onClick={adicionar}>+ Adicionar</button>
      </div>
    </div>
  );
}

function CiclosSection() {
  const [ciclos, setCiclos] = useStateF4([]);
  const [loading, setLoading] = useStateF4(true);
  const [criando, setCriando] = useStateF4(false);
  const [tipo, setTipo] = useStateF4("360");
  const [nome, setNome] = useStateF4("");
  const [dataInicio, setDataInicio] = useStateF4("");
  const [dataFim, setDataFim] = useStateF4("");
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/ciclos");
      setCiclos(data);
    } catch (err) { toast(err.message, "error"); } finally { setLoading(false); }
  };
  useEffectF4(() => { carregar(); }, []);

  const criar = async () => {
    if (!nome || !dataInicio || !dataFim) { toast("Preencha nome e datas", "error"); return; }
    try {
      await EnvoxersAPI.api("/ciclos", { method: "POST", body: JSON.stringify({ tipo, nome, data_inicio: dataInicio, data_fim: dataFim }) });
      toast("Ciclo criado em rascunho!", "success");
      setCriando(false); setNome(""); setDataInicio(""); setDataFim("");
      carregar();
    } catch (err) { toast(err.message, "error"); }
  };

  const abrir = async (c) => {
    if (!window.confirm(`Abrir o ciclo "${c.nome}"? Isso gera automaticamente os pares de avaliação (ou libera as respostas, no caso de clima).`)) return;
    try {
      await EnvoxersAPI.api(`/ciclos/${c.id}/abrir`, { method: "POST" });
      toast("Ciclo aberto!", "success");
      carregar();
    } catch (err) { toast(err.message, "error"); }
  };
  const encerrar = async (c) => {
    if (!window.confirm(`Encerrar o ciclo "${c.nome}"? Ninguém mais poderá responder depois disso.`)) return;
    try {
      await EnvoxersAPI.api(`/ciclos/${c.id}/encerrar`, { method: "POST" });
      toast("Ciclo encerrado!", "success");
      carregar();
    } catch (err) { toast(err.message, "error"); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-sm btn-primary" onClick={() => setCriando(!criando)}>{criando ? "Cancelar" : "+ Novo Ciclo"}</button>
      </div>

      {criando && (
        <div className="form-panel" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="field">
              <label>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="360">Feedback 360°</option>
                <option value="180">Avaliação 180°</option>
                <option value="clima">Clima Organizacional</option>
              </select>
            </div>
            <div className="field">
              <label>Nome</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 2026-S2" />
            </div>
            <div className="field">
              <label>Início</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="field">
              <label>Fim</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-sm btn-primary" onClick={criar}>Criar ciclo (rascunho)</button>
          </div>
        </div>
      )}

      {loading && <div className="app-loading">Carregando…</div>}
      {!loading && ciclos.length === 0 && <div className="hero-quote">Nenhum ciclo criado ainda.</div>}
      {ciclos.map((c) => (
        <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{c.nome} <span className="tag tag-roxo">{TIPO_CICLO_LABELS[c.tipo]}</span></div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{formatarDataF4(c.data_inicio)} — {formatarDataF4(c.data_fim)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={"tag " + STATUS_CICLO_TAG[c.status]}>{c.status}</span>
              {c.status === "rascunho" && <button className="btn btn-sm" onClick={() => abrir(c)}>Abrir</button>}
              {c.status === "aberto" && <button className="btn btn-sm" onClick={() => encerrar(c)}>Encerrar</button>}
            </div>
          </div>
          {c.tipo === "clima" && c.status === "rascunho" && <PerguntasClimaEditor ciclo={c} />}
        </div>
      ))}
    </div>
  );
}

// ==================== FEEDBACK 360° ====================

function useCiclos(tipo) {
  const [ciclos, setCiclos] = useStateF4([]);
  const [cicloId, setCicloId] = useStateF4(null);
  useEffectF4(() => {
    EnvoxersAPI.api(`/ciclos?tipo=${tipo}`).then((data) => {
      setCiclos(data);
      const aberto = data.find((c) => c.status === "aberto");
      setCicloId((aberto || data[0])?.id || null);
    }).catch(() => {});
  }, [tipo]);
  return { ciclos, cicloId, setCicloId };
}

function SeletorCiclo({ ciclos, cicloId, setCicloId }) {
  if (ciclos.length === 0) return <div className="hero-quote">Nenhum ciclo criado ainda {"— peça pro admin criar um na aba \"Ciclos\"."}</div>;
  return (
    <select value={cicloId || ""} onChange={(e) => setCicloId(Number(e.target.value))} style={{ maxWidth: 280, marginBottom: 16 }}>
      {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.status})</option>)}
    </select>
  );
}

function Avaliacao360Form({ pendente, competencias, onEnviado }) {
  const [notas, setNotas] = useStateF4({});
  const [comentario, setComentario] = useStateF4("");
  const [enviando, setEnviando] = useStateF4(false);
  const toast = EnvoxersShared.useToast();
  const autoavaliacao = pendente.avaliador_id === pendente.avaliado_id;

  const enviar = async () => {
    if (Object.keys(notas).length < competencias.length) { toast("Dê uma nota em todas as competências", "error"); return; }
    setEnviando(true);
    try {
      await EnvoxersAPI.api(`/360/avaliacoes/${pendente.id}/responder`, { method: "POST", body: JSON.stringify({ respostas: notas, comentario: comentario || null }) });
      toast("Avaliação enviada!", "success");
      onEnviado();
    } catch (err) { toast(err.message, "error"); } finally { setEnviando(false); }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{autoavaliacao ? "Autoavaliação" : `Avalie ${pendente.avaliado_nome}`}</div>
      {competencias.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
          <span style={{ fontSize: 13 }}>{c.nome}</span>
          <select value={notas[c.id] || ""} onChange={(e) => setNotas({ ...notas, [c.id]: Number(e.target.value) })} style={{ maxWidth: 90 }}>
            <option value="">nota</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ))}
      <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentário (opcional)" style={{ marginTop: 6 }} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-sm btn-primary" onClick={enviar} disabled={enviando}>Enviar</button>
      </div>
    </div>
  );
}

function Avaliacao360Resultado({ avaliadoId, cicloId }) {
  const [resultado, setResultado] = useStateF4(null);
  const toast = EnvoxersShared.useToast();
  useEffectF4(() => {
    if (!cicloId || !avaliadoId) return;
    EnvoxersAPI.api(`/360/resultado/${avaliadoId}?ciclo_id=${cicloId}`).then(setResultado).catch((err) => toast(err.message, "error"));
  }, [avaliadoId, cicloId]);

  if (!resultado) return <div className="app-loading">Carregando…</div>;
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>{resultado.respondidas} de {resultado.total_avaliacoes} avaliações respondidas</div>
      {resultado.por_competencia.map((c) => (
        <div key={c.competencia_id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{c.competencia_nome}</span>
            <span style={{ fontWeight: 600 }}>{c.media != null ? c.media.toFixed(1) : "sem dado"}</span>
          </div>
          <div style={{ background: "var(--bg-inset)", borderRadius: 6, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${((c.media || 0) / 5) * 100}%`, background: "var(--envox)", height: "100%" }} />
          </div>
        </div>
      ))}
      {resultado.comentarios.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="form-section-title">Comentários recebidos</div>
          {resultado.comentarios.map((c, i) => <div key={i} className="note-bar" style={{ marginBottom: 8 }}>{c}</div>)}
        </div>
      )}
    </div>
  );
}

function CompetenciasAdmin() {
  const [competencias, setCompetencias] = useStateF4([]);
  const [nome, setNome] = useStateF4("");
  const toast = EnvoxersShared.useToast();
  const carregar = () => EnvoxersAPI.api("/360/competencias?apenas_ativas=false").then(setCompetencias).catch((err) => toast(err.message, "error"));
  useEffectF4(() => { carregar(); }, []);

  const adicionar = async () => {
    if (!nome.trim()) return;
    try {
      await EnvoxersAPI.api("/360/competencias", { method: "POST", body: JSON.stringify({ nome, ordem: competencias.length + 1 }) });
      setNome(""); carregar();
    } catch (err) { toast(err.message, "error"); }
  };
  const toggleAtivo = async (c) => {
    try {
      await EnvoxersAPI.api(`/360/competencias/${c.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !c.ativo }) });
      carregar();
    } catch (err) { toast(err.message, "error"); }
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div className="form-section-title">Catálogo de competências (admin)</div>
      {competencias.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
          <span style={{ opacity: c.ativo ? 1 : 0.4 }}>{c.nome}</span>
          <button className="btn btn-sm" onClick={() => toggleAtivo(c)}>{c.ativo ? "Desativar" : "Ativar"}</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1 }}>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova competência…" />
        </div>
        <button className="btn btn-sm" onClick={adicionar}>+ Adicionar</button>
      </div>
    </div>
  );
}

function Avaliacao360Section({ permissao, envoxerId }) {
  const { ciclos, cicloId, setCicloId } = useCiclos("360");
  const [aba, setAba] = useStateF4("responder");
  const [pendentes, setPendentes] = useStateF4([]);
  const [competencias, setCompetencias] = useStateF4([]);
  const [envoxersAtivos, setEnvoxersAtivos] = useStateF4([]);
  const [alvoResultado, setAlvoResultado] = useStateF4(envoxerId);
  const isGestorAdmin = permissao !== "envoxer";
  const toast = EnvoxersShared.useToast();

  useEffectF4(() => { EnvoxersAPI.api("/360/competencias").then(setCompetencias).catch(() => {}); }, []);
  useEffectF4(() => { if (isGestorAdmin) EnvoxersAPI.api("/envoxers").then((d) => setEnvoxersAtivos(d.filter((e) => e.ativo))).catch(() => {}); }, []);

  const carregarPendentes = () => {
    if (!cicloId) return;
    EnvoxersAPI.api(`/360/minhas-pendentes?ciclo_id=${cicloId}`).then(setPendentes).catch((err) => toast(err.message, "error"));
  };
  useEffectF4(() => { carregarPendentes(); }, [cicloId]);

  return (
    <div>
      <SeletorCiclo ciclos={ciclos} cicloId={cicloId} setCicloId={setCicloId} />
      {cicloId && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={"chip" + (aba === "responder" ? " active" : "")} onClick={() => setAba("responder")}>Responder ({pendentes.length})</button>
            <button className={"chip" + (aba === "resultado" ? " active" : "")} onClick={() => setAba("resultado")}>Meu resultado</button>
          </div>

          {aba === "responder" && (
            <>
              {pendentes.length === 0 && <div className="hero-quote">Nenhuma avaliação pendente pra você nesse ciclo.</div>}
              {pendentes.map((p) => <Avaliacao360Form key={p.id} pendente={p} competencias={competencias} onEnviado={carregarPendentes} />)}
            </>
          )}

          {aba === "resultado" && (
            <>
              {isGestorAdmin && (
                <select value={alvoResultado} onChange={(e) => setAlvoResultado(Number(e.target.value))} style={{ maxWidth: 260, marginBottom: 14 }}>
                  {envoxersAtivos.map((e) => <option key={e.id} value={e.id}>{e.id === envoxerId ? `${e.nome} (você)` : e.nome}</option>)}
                </select>
              )}
              <Avaliacao360Resultado avaliadoId={alvoResultado} cicloId={cicloId} />
            </>
          )}
        </>
      )}
      {permissao === "admin" && <CompetenciasAdmin />}
    </div>
  );
}

// ==================== AVALIAÇÃO 180° ====================

const DIRECAO_180_LABEL = { gestor_para_liderado: "como gestor(a)", liderado_para_gestor: "como liderado(a)" };

function Avaliacao180Form({ pendente, onEnviado }) {
  const [notaGeral, setNotaGeral] = useStateF4("");
  const [pontosFortes, setPontosFortes] = useStateF4("");
  const [pontosMelhoria, setPontosMelhoria] = useStateF4("");
  const [comentario, setComentario] = useStateF4("");
  const [enviando, setEnviando] = useStateF4(false);
  const toast = EnvoxersShared.useToast();

  const enviar = async () => {
    setEnviando(true);
    try {
      await EnvoxersAPI.api(`/180/avaliacoes/${pendente.id}/responder`, {
        method: "POST",
        body: JSON.stringify({ nota_geral: notaGeral ? Number(notaGeral) : null, pontos_fortes: pontosFortes || null, pontos_melhoria: pontosMelhoria || null, comentario: comentario || null }),
      });
      toast("Avaliação enviada!", "success");
      onEnviado();
    } catch (err) { toast(err.message, "error"); } finally { setEnviando(false); }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Avalie {pendente.avaliado_nome} <span className="tag tag-cinza">{DIRECAO_180_LABEL[pendente.direcao]}</span></div>
      <div className="form-row">
        <div className="field">
          <label>Nota geral (1-5)</label>
          <select value={notaGeral} onChange={(e) => setNotaGeral(e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Pontos fortes</label><textarea rows={2} value={pontosFortes} onChange={(e) => setPontosFortes(e.target.value)} /></div>
      <div className="field"><label>Pontos de melhoria</label><textarea rows={2} value={pontosMelhoria} onChange={(e) => setPontosMelhoria(e.target.value)} /></div>
      <div className="field"><label>Comentário livre</label><textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} /></div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-sm btn-primary" onClick={enviar} disabled={enviando}>Enviar</button>
      </div>
    </div>
  );
}

function Avaliacao180Section({ permissao, envoxerId }) {
  const { ciclos, cicloId, setCicloId } = useCiclos("180");
  const [aba, setAba] = useStateF4("responder");
  const [pendentes, setPendentes] = useStateF4([]);
  const [recebidas, setRecebidas] = useStateF4([]);
  const [envoxersAtivos, setEnvoxersAtivos] = useStateF4([]);
  const [alvoRecebidas, setAlvoRecebidas] = useStateF4(envoxerId);
  const isGestorAdmin = permissao !== "envoxer";
  const toast = EnvoxersShared.useToast();

  useEffectF4(() => { if (isGestorAdmin) EnvoxersAPI.api("/envoxers").then((d) => setEnvoxersAtivos(d.filter((e) => e.ativo))).catch(() => {}); }, []);

  const carregarPendentes = () => {
    if (!cicloId) return;
    EnvoxersAPI.api(`/180/minhas-pendentes?ciclo_id=${cicloId}`).then(setPendentes).catch((err) => toast(err.message, "error"));
  };
  useEffectF4(() => { carregarPendentes(); }, [cicloId]);

  useEffectF4(() => {
    if (!cicloId || aba !== "recebidas") return;
    EnvoxersAPI.api(`/180/recebidas/${alvoRecebidas}?ciclo_id=${cicloId}`).then(setRecebidas).catch((err) => toast(err.message, "error"));
  }, [cicloId, aba, alvoRecebidas]);

  return (
    <div>
      <SeletorCiclo ciclos={ciclos} cicloId={cicloId} setCicloId={setCicloId} />
      {cicloId && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className={"chip" + (aba === "responder" ? " active" : "")} onClick={() => setAba("responder")}>Responder ({pendentes.length})</button>
            <button className={"chip" + (aba === "recebidas" ? " active" : "")} onClick={() => setAba("recebidas")}>Recebidas</button>
          </div>

          {aba === "responder" && (
            <>
              {pendentes.length === 0 && <div className="hero-quote">Nenhuma avaliação pendente pra você nesse ciclo.</div>}
              {pendentes.map((p) => <Avaliacao180Form key={p.id} pendente={p} onEnviado={carregarPendentes} />)}
            </>
          )}

          {aba === "recebidas" && (
            <>
              {isGestorAdmin && (
                <select value={alvoRecebidas} onChange={(e) => setAlvoRecebidas(Number(e.target.value))} style={{ maxWidth: 260, marginBottom: 14 }}>
                  {envoxersAtivos.map((e) => <option key={e.id} value={e.id}>{e.id === envoxerId ? `${e.nome} (você)` : e.nome}</option>)}
                </select>
              )}
              {recebidas.length === 0 && <div className="hero-quote">Nenhuma avaliação recebida ainda nesse ciclo.</div>}
              {recebidas.map((r) => (
                <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{r.avaliador_nome} <span className="tag tag-cinza">{DIRECAO_180_LABEL[r.direcao]}</span> {r.nota_geral && <span className="tag tag-azul">nota {r.nota_geral}</span>}</div>
                  {r.pontos_fortes && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Pontos fortes:</strong> {r.pontos_fortes}</div>}
                  {r.pontos_melhoria && <div style={{ fontSize: 13, marginBottom: 4 }}><strong>Pontos de melhoria:</strong> {r.pontos_melhoria}</div>}
                  {r.comentario && <div style={{ fontSize: 13 }}>{r.comentario}</div>}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ==================== FEEDBACK 1:1 ====================

function Feedback1a1FormModal({ envoxersAtivos, gestorId, registro, onClose, onSaved }) {
  const isEdit = !!registro;
  const [liderado, setLiderado] = useStateF4(registro?.liderado_id || "");
  const [data, setData] = useStateF4(registro?.data || new Date().toISOString().slice(0, 10));
  const [pauta, setPauta] = useStateF4(registro?.pauta || "");
  const [combinados, setCombinados] = useStateF4(registro?.combinados || "");
  const [proximoSugerido, setProximoSugerido] = useStateF4(registro?.proximo_sugerido || "");
  const [saving, setSaving] = useStateF4(false);
  const toast = EnvoxersShared.useToast();

  const salvar = async () => {
    if (!isEdit && !liderado) { toast("Selecione o liderado", "error"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await EnvoxersAPI.api(`/1a1/${registro.id}`, { method: "PATCH", body: JSON.stringify({ data, pauta: pauta || null, combinados: combinados || null, proximo_sugerido: proximoSugerido || null }) });
      } else {
        await EnvoxersAPI.api("/1a1", { method: "POST", body: JSON.stringify({ liderado_id: Number(liderado), gestor_id: gestorId, data, pauta: pauta || null, combinados: combinados || null, proximo_sugerido: proximoSugerido || null }) });
      }
      toast("1:1 registrado!", "success");
      onSaved();
    } catch (err) { toast(err.message, "error"); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow"><span>1:1</span></div>
          <h2 className="modal-title">{isEdit ? "Editar 1:1" : "Registrar 1:1"}</h2>
          <button className="modal-close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
        </div>
        <div className="modal-body">
          <div className="modal-main" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!isEdit && (
              <div className="field">
                <label>Liderado <span className="req">*</span></label>
                <select value={liderado} onChange={(e) => setLiderado(e.target.value)}>
                  <option value="">selecione…</option>
                  {envoxersAtivos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="field"><label>Data</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
              <div className="field"><label>Próximo sugerido</label><input type="date" value={proximoSugerido} onChange={(e) => setProximoSugerido(e.target.value)} /></div>
            </div>
            <div className="field"><label>Pauta</label><textarea rows={3} value={pauta} onChange={(e) => setPauta(e.target.value)} /></div>
            <div className="field"><label>Combinados</label><textarea rows={3} value={combinados} onChange={(e) => setCombinados(e.target.value)} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-sm" onClick={onClose}>Cancelar</button>
              <button className="btn btn-sm btn-primary" onClick={salvar} disabled={saving}>Salvar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feedback1a1Item({ registro, envoxerId, podeEditar, onAtualizado }) {
  const [expandido, setExpandido] = useStateF4(false);
  const [editando, setEditando] = useStateF4(false);
  const [comentario, setComentario] = useStateF4(registro.comentario_liderado || "");
  const toast = EnvoxersShared.useToast();
  const souLiderado = registro.liderado_id === envoxerId;

  const enviarComentario = async () => {
    try {
      await EnvoxersAPI.api(`/1a1/${registro.id}/comentario-liderado`, { method: "POST", body: JSON.stringify({ comentario_liderado: comentario }) });
      toast("Comentário salvo!", "success");
      onAtualizado();
    } catch (err) { toast(err.message, "error"); }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpandido(!expandido)}>
        <div>
          <div style={{ fontWeight: 600 }}>{registro.gestor_nome} ↔ {registro.liderado_nome}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{formatarDataF4(registro.data)}{registro.proximo_sugerido ? ` · próximo sugerido: ${formatarDataF4(registro.proximo_sugerido)}` : ""}</div>
        </div>
        <span style={{ color: "var(--ink-4)" }}>{expandido ? "▲" : "▼"}</span>
      </div>
      {expandido && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {registro.pauta && <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Pauta:</strong> {registro.pauta}</div>}
          {registro.combinados && <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Combinados:</strong> {registro.combinados}</div>}
          {registro.comentario_liderado && <div className="note-bar" style={{ marginBottom: 8 }}><strong>Comentário do liderado:</strong> {registro.comentario_liderado}</div>}
          {podeEditar && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditando(true); }}>Editar</button>}
          {souLiderado && (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
              <input type="text" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Seu comentário sobre esse 1:1…" style={{ flex: 1 }} />
              <button className="btn btn-sm" onClick={enviarComentario}>Salvar</button>
            </div>
          )}
        </div>
      )}
      {editando && <Feedback1a1FormModal envoxersAtivos={[]} gestorId={registro.gestor_id} registro={registro} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); onAtualizado(); }} />}
    </div>
  );
}

function Feedback1a1Section({ permissao, envoxerId }) {
  const [registros, setRegistros] = useStateF4([]);
  const [loading, setLoading] = useStateF4(true);
  const [criando, setCriando] = useStateF4(false);
  const [envoxersAtivos, setEnvoxersAtivos] = useStateF4([]);
  const isGestorAdmin = permissao !== "envoxer";
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/1a1");
      setRegistros(data);
    } catch (err) { toast(err.message, "error"); } finally { setLoading(false); }
  };
  useEffectF4(() => { carregar(); }, []);
  useEffectF4(() => { if (isGestorAdmin) EnvoxersAPI.api("/envoxers").then((d) => setEnvoxersAtivos(d.filter((e) => e.ativo && e.id !== envoxerId))).catch(() => {}); }, []);

  return (
    <div>
      {isGestorAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setCriando(true)}>+ Registrar 1:1</button>
        </div>
      )}
      {loading && <div className="app-loading">Carregando…</div>}
      {!loading && registros.length === 0 && <div className="hero-quote">Nenhum 1:1 registrado ainda.</div>}
      {registros.map((r) => (
        <Feedback1a1Item key={r.id} registro={r} envoxerId={envoxerId} podeEditar={permissao === "admin" || r.gestor_id === envoxerId} onAtualizado={carregar} />
      ))}
      {criando && <Feedback1a1FormModal envoxersAtivos={envoxersAtivos} gestorId={envoxerId} onClose={() => setCriando(false)} onSaved={() => { setCriando(false); carregar(); }} />}
    </div>
  );
}

// ==================== CLIMA ORGANIZACIONAL ====================

function ClimaResponderForm({ ciclo, onEnviado }) {
  const [perguntas, setPerguntas] = useStateF4([]);
  const [minha, setMinha] = useStateF4(null);
  const [respostas, setRespostas] = useStateF4({});
  const [enviando, setEnviando] = useStateF4(false);
  const toast = EnvoxersShared.useToast();

  const carregar = async () => {
    const [p, m] = await Promise.all([
      EnvoxersAPI.api(`/clima/perguntas?ciclo_id=${ciclo.id}`),
      EnvoxersAPI.api(`/clima/minha?ciclo_id=${ciclo.id}`),
    ]);
    setPerguntas(p);
    setMinha(m);
    setRespostas(m.respostas || {});
  };
  useEffectF4(() => { carregar(); }, [ciclo.id]);

  const enviar = async () => {
    setEnviando(true);
    try {
      await EnvoxersAPI.api(`/clima/responder?ciclo_id=${ciclo.id}`, { method: "POST", body: JSON.stringify({ respostas }) });
      toast("Resposta enviada — obrigado!", "success");
      onEnviado();
      carregar();
    } catch (err) { toast(err.message, "error"); } finally { setEnviando(false); }
  };

  if (!minha) return <div className="app-loading">Carregando…</div>;

  return (
    <div className="form-panel">
      {minha.respondido && <div className="note-bar" style={{ marginBottom: 12 }}>Você já respondeu em {formatarDataHoraF4(minha.enviada_em)} — pode revisar e reenviar enquanto o ciclo estiver aberto.</div>}
      {perguntas.map((p) => (
        <div key={p.id} className="field">
          <label>{p.texto}</label>
          {p.tipo === "likert" ? (
            <select value={respostas[p.id] || ""} onChange={(e) => setRespostas({ ...respostas, [p.id]: Number(e.target.value) })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <textarea rows={2} value={respostas[p.id] || ""} onChange={(e) => setRespostas({ ...respostas, [p.id]: e.target.value })} />
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-sm btn-primary" onClick={enviar} disabled={enviando}>{minha.respondido ? "Reenviar" : "Enviar"}</button>
      </div>
    </div>
  );
}

function ClimaResultado({ ciclo }) {
  const [resultado, setResultado] = useStateF4(null);
  const toast = EnvoxersShared.useToast();
  useEffectF4(() => {
    EnvoxersAPI.api(`/clima/${ciclo.id}/resultado`).then(setResultado).catch((err) => toast(err.message, "error"));
  }, [ciclo.id]);

  if (!resultado) return <div className="app-loading">Carregando…</div>;
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>{resultado.total_respondentes} de {resultado.total_ativos} pessoas responderam</div>
      {resultado.perguntas.map((p) => (
        <div key={p.pergunta_id} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{p.texto}</div>
          {p.tipo === "likert" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
                <span>Média</span><span>{p.media != null ? p.media.toFixed(1) : "sem dado"}</span>
              </div>
              <div style={{ background: "var(--bg-inset)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${((p.media || 0) / 5) * 100}%`, background: "var(--envox)", height: "100%" }} />
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(p.respostas || []).length === 0 && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>sem respostas ainda</div>}
              {(p.respostas || []).map((r, i) => <div key={i} className="note-bar">{r}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ClimaBrutoModal({ ciclo, onClose }) {
  const [dados, setDados] = useStateF4([]);
  const toast = EnvoxersShared.useToast();
  useEffectF4(() => { EnvoxersAPI.api(`/clima/${ciclo.id}/bruto`).then(setDados).catch((err) => toast(err.message, "error")); }, [ciclo.id]);

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-eyebrow"><span>Clima — auditoria (admin)</span></div>
          <h2 className="modal-title">Respostas individuais — {ciclo.nome}</h2>
          <button className="modal-close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
        </div>
        <div className="modal-body">
          <div className="modal-main">
            <div className="note-bar" style={{ marginBottom: 12 }}>Uso excepcional de auditoria — resposta individual de pesquisa de clima nunca é exposta pra gestor, só admin.</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Pessoa</th><th>Respostas</th><th>Enviada em</th></tr></thead>
                <tbody>
                  {dados.map((d) => (
                    <tr key={d.envoxer_id}>
                      <td>{d.envoxer_nome}</td>
                      <td style={{ fontSize: 12 }}>{Object.values(d.respostas).join(" · ")}</td>
                      <td>{formatarDataHoraF4(d.enviada_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClimaSection({ permissao }) {
  const { ciclos, cicloId, setCicloId } = useCiclos("clima");
  const [aba, setAba] = useStateF4("responder");
  const [verBruto, setVerBruto] = useStateF4(false);
  const ciclo = ciclos.find((c) => c.id === cicloId);

  return (
    <div>
      <SeletorCiclo ciclos={ciclos} cicloId={cicloId} setCicloId={setCicloId} />
      {ciclo && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {ciclo.status === "aberto" && <button className={"chip" + (aba === "responder" ? " active" : "")} onClick={() => setAba("responder")}>Responder</button>}
            <button className={"chip" + (aba === "resultado" ? " active" : "")} onClick={() => setAba("resultado")}>Resultado agregado</button>
            {permissao === "admin" && <button className="chip" onClick={() => setVerBruto(true)}>Ver dado bruto (auditoria)</button>}
          </div>
          {aba === "responder" && ciclo.status === "aberto" && <ClimaResponderForm ciclo={ciclo} onEnviado={() => setAba("resultado")} />}
          {aba === "resultado" && <ClimaResultado ciclo={ciclo} />}
          {verBruto && <ClimaBrutoModal ciclo={ciclo} onClose={() => setVerBruto(false)} />}
        </>
      )}
    </div>
  );
}

// ==================== SHELL ====================

function F4Screen({ permissao, envoxerId }) {
  const [aba, setAba] = useStateF4("pdi");
  const isAdmin = permissao === "admin";

  return (
    <div className="page">
      <EnvoxersShared.PageHeader title="Desenvolvimento & Pessoas" subtitle="PDI, Feedback 360°, Avaliação 180°, 1:1 e Clima Organizacional." />
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button className={"chip" + (aba === "pdi" ? " active" : "")} onClick={() => setAba("pdi")}>PDI</button>
        <button className={"chip" + (aba === "360" ? " active" : "")} onClick={() => setAba("360")}>Feedback 360°</button>
        <button className={"chip" + (aba === "180" ? " active" : "")} onClick={() => setAba("180")}>Avaliação 180°</button>
        <button className={"chip" + (aba === "1a1" ? " active" : "")} onClick={() => setAba("1a1")}>1:1</button>
        <button className={"chip" + (aba === "clima" ? " active" : "")} onClick={() => setAba("clima")}>Clima Organizacional</button>
        {isAdmin && <button className={"chip" + (aba === "ciclos" ? " active" : "")} onClick={() => setAba("ciclos")}>Ciclos</button>}
      </div>

      {aba === "pdi" && <PdiSection permissao={permissao} envoxerId={envoxerId} />}
      {aba === "360" && <Avaliacao360Section permissao={permissao} envoxerId={envoxerId} />}
      {aba === "180" && <Avaliacao180Section permissao={permissao} envoxerId={envoxerId} />}
      {aba === "1a1" && <Feedback1a1Section permissao={permissao} envoxerId={envoxerId} />}
      {aba === "clima" && <ClimaSection permissao={permissao} envoxerId={envoxerId} />}
      {aba === "ciclos" && isAdmin && <CiclosSection />}
    </div>
  );
}

window.F4Screen = F4Screen;
