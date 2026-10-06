const { useState: useStateAv, useEffect: useEffectAv } = React;

const AV_STATUS = [
  ["nova", "Nova"],
  ["em_andamento", "Em andamento"],
  ["aguardando_terceiro", "Aguardando terceiro"],
  ["concluida", "Concluída"],
];

function avFmtDate(v) {
  if (!v) return "Sem prazo";
  return new Date(v + "T12:00:00").toLocaleDateString("pt-BR");
}

function avFmtTimer(seg) {
  const s = Math.max(0, Math.floor(seg || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h,m,ss].map((x) => String(x).padStart(2,"0")).join(":");
}

function DemandaAvulsaModal({ item, pessoas, contextos, permissao, envoxerId, onClose, onSaved }) {
  const toast = EnvoxersShared.useToast();
  const manager = permissao === "admin" || permissao === "gestor";
  const [contexto, setContexto] = useStateAv(item?.contexto || "");
  const [titulo, setTitulo] = useStateAv(item?.titulo || "");
  const [descricao, setDescricao] = useStateAv(item?.descricao || "");
  const [responsavel, setResponsavel] = useStateAv(item?.responsavel_envoxer_id ? String(item.responsavel_envoxer_id) : String(envoxerId || ""));
  const [prazo, setPrazo] = useStateAv(item?.prazo || "");
  const [prioridade, setPrioridade] = useStateAv(item?.prioridade || "media");
  const [status, setStatus] = useStateAv(item?.status || "nova");
  const [busy, setBusy] = useStateAv(false);
  const editando = !!item;

  const salvar = async () => {
    if (!contexto.trim() || !titulo.trim() || busy) return;
    setBusy(true);
    try {
      const body = editando && !manager ? { status: status } : {
        contexto: contexto.trim(),
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        responsavel_envoxer_id: responsavel ? Number(responsavel) : null,
        prazo: prazo || null,
        prioridade: prioridade,
        ...(editando ? { status: status } : {}),
      };
      await EnvoxersAPI.api(editando ? "/demandas-avulsas/" + item.id : "/demandas-avulsas", {
        method: editando ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      toast(editando ? "Demanda atualizada" : "Demanda criada", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const excluir = async () => {
    if (!item || !manager || !confirm("Excluir esta demanda avulsa?")) return;
    try {
      await EnvoxersAPI.api("/demandas-avulsas/" + item.id, { method: "DELETE" });
      toast("Demanda excluída", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal avulsa-modal">
        <div className="modal-head">
          <div><div className="modal-eyebrow">Operação / Demanda avulsa</div><h2 className="modal-title">{editando ? "Editar demanda" : "Nova demanda avulsa"}</h2></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="avulsa-modal-body">
          <div className="form-grid">
            <div className="field">
              <label>Contexto <span className="req">*</span></label>
              <input list="avulsa-contextos" value={contexto} disabled={editando && !manager} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: Secovi, Hyven, Envox, Jurídico…" />
              <datalist id="avulsa-contextos">{contextos.map((x) => <option value={x} key={x} />)}</datalist>
            </div>
            <div className="field">
              <label>Prioridade</label>
              <select value={prioridade} disabled={editando && !manager} onChange={(e) => setPrioridade(e.target.value)}>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Demanda <span className="req">*</span></label>
            <input value={titulo} disabled={editando && !manager} onChange={(e) => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>
          <div className="field">
            <label>Descrição</label>
            <textarea value={descricao} disabled={editando && !manager} onChange={(e) => setDescricao(e.target.value)} rows={4} placeholder="Detalhes importantes, links, resultado esperado…" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Responsável</label>
              {manager ? (
                <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {pessoas.map((x) => <option value={x.id} key={x.id}>{x.nome}</option>)}
                </select>
              ) : <input value={(pessoas.find((x) => String(x.id) === String(responsavel)) || {}).nome || "Você"} disabled />}
            </div>
            <div className="field">
              <label>Prazo</label>
              <input type="date" value={prazo} disabled={editando && !manager} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
          {editando && (
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {AV_STATUS.map(([k,l]) => <option value={k} key={k}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {editando && manager && <button className="btn danger-ghost" onClick={excluir}>Excluir</button>}
          <div style={{ flex: 1 }}></div>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-envox" onClick={salvar} disabled={busy || !contexto.trim() || !titulo.trim()}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

function DemandasAvulsasScreen({ permissao, envoxerId, focoAtivo, focoElapsed, onIniciarFoco, onPausarFoco, onFinalizarFoco }) {
  const toast = EnvoxersShared.useToast();
  const [itens, setItens] = useStateAv(null);
  const [pessoas, setPessoas] = useStateAv([]);
  const [modal, setModal] = useStateAv(null);
  const [dragId, setDragId] = useStateAv(null);
  const manager = permissao === "admin" || permissao === "gestor";

  const carregar = async () => {
    try {
      const [ds, es] = await Promise.all([EnvoxersAPI.api("/demandas-avulsas"), EnvoxersAPI.api("/envoxers")]);
      setItens(ds);
      setPessoas(es.filter((x) => x.ativo));
    } catch (err) {
      toast(err.message, "error");
    }
  };
  useEffectAv(() => { carregar(); }, []);

  const mudarStatus = async (id, status) => {
    try {
      await EnvoxersAPI.api("/demandas-avulsas/" + id, { method: "PATCH", body: JSON.stringify({ status: status }) });
      await carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const drop = async (status) => {
    if (!dragId) return;
    const item = (itens || []).find((x) => x.id === dragId);
    const pode = manager || Number(item?.responsavel_envoxer_id) === Number(envoxerId);
    setDragId(null);
    if (!item || !pode || item.status === status) return;
    await mudarStatus(item.id, status);
  };

  if (itens === null) return <div className="page"><div className="empty">Carregando demandas avulsas…</div></div>;
  const contextos = Array.from(new Set(itens.map((x) => x.contexto))).sort();

  return (
    <div className="page avulsa-page">
      <EnvoxersShared.PageHeader
        title="Demandas avulsas"
        subtitle="Trabalho fora do escopo recorrente, sem contaminar Entregas ou Farol."
        actions={<button className="btn btn-envox" onClick={() => setModal({})}>+ Nova demanda</button>}
      />
      <div className="avulsa-kanban">
        {AV_STATUS.map(([statusKey, label]) => {
          const coluna = itens.filter((x) => x.status === statusKey);
          return (
            <section className={"avulsa-column status-" + statusKey} key={statusKey} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(statusKey)}>
              <div className="avulsa-column-head"><strong>{label}</strong><span>{coluna.length}</span></div>
              <div className="avulsa-column-body">
                {coluna.map((item) => {
                  const focoAqui = focoAtivo && focoAtivo.origem === "avulsa" && Number(focoAtivo.demanda_avulsa_id) === Number(item.id);
                  const outroFoco = focoAtivo && !focoAqui;
                  const podeStatus = manager || Number(item.responsavel_envoxer_id) === Number(envoxerId);
                  return (
                    <article
                      className={"avulsa-card prioridade-" + item.prioridade}
                      key={item.id}
                      draggable={podeStatus}
                      onDragStart={() => setDragId(item.id)}
                      onClick={() => setModal(item)}
                    >
                      <div className="avulsa-card-top">
                        <span className="avulsa-contexto">{item.contexto}</span>
                        <span className={"avulsa-prioridade " + item.prioridade}>{item.prioridade}</span>
                      </div>
                      <h3>{item.titulo}</h3>
                      {item.descricao && <p>{item.descricao}</p>}
                      <div className="avulsa-card-meta">
                        <span>{item.responsavel_nome || "Sem responsável"}</span>
                        <span>{avFmtDate(item.prazo)}</span>
                      </div>
                      <div className="avulsa-card-footer" onClick={(e) => e.stopPropagation()}>
                        {focoAqui ? (
                          <div className="avulsa-focus-live">
                            <strong>{avFmtTimer(focoElapsed)}</strong>
                            <button className="btn btn-xs" onClick={onPausarFoco}>{focoAtivo.pausado_em ? "Retomar" : "Pausar"}</button>
                            <button className="btn btn-xs stop" onClick={onFinalizarFoco}>Finalizar</button>
                          </div>
                        ) : (
                          <button className="btn btn-xs" disabled={statusKey === "concluida" || !!outroFoco} onClick={() => onIniciarFoco(item.id)}>▶ Foco</button>
                        )}
                        {statusKey === "aguardando_terceiro" && <span className="avulsa-third-party">aguardando terceiro</span>}
                      </div>
                    </article>
                  );
                })}
                {coluna.length === 0 && <div className="avulsa-empty">Sem demandas</div>}
              </div>
            </section>
          );
        })}
      </div>
      {modal && (
        <DemandaAvulsaModal
          item={modal.id ? modal : null}
          pessoas={pessoas}
          contextos={contextos}
          permissao={permissao}
          envoxerId={envoxerId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

window.DemandasAvulsasScreen = DemandasAvulsasScreen;
