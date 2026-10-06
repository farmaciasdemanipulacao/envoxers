const { useState: useStateFocoAj, useEffect: useEffectFocoAj } = React;

function focoAjInputDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function focoAjFmt(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
}

function focoAjDuracao(inicio, fim) {
  if (!inicio || !fim) return "—";
  const min = Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + "h " + String(m).padStart(2,"0") + "min" : m + "min";
}

function FocoAjusteModal({ recentes, opcoes, onClose, onDone }) {
  const toast = EnvoxersShared.useToast();
  const [modo, setModo] = useStateFocoAj("corrigir");
  const [registroId, setRegistroId] = useStateFocoAj("");
  const [opcao, setOpcao] = useStateFocoAj("");
  const [inicio, setInicio] = useStateFocoAj("");
  const [fim, setFim] = useStateFocoAj("");
  const [motivo, setMotivo] = useStateFocoAj("");
  const [busy, setBusy] = useStateFocoAj(false);

  const escolherRegistro = (id) => {
    setRegistroId(id);
    const r = recentes.find((x) => String(x.id) === String(id));
    if (!r) return;
    setInicio(focoAjInputDate(r.inicio));
    setFim(focoAjInputDate(r.fim || new Date().toISOString()));
  };

  const enviar = async () => {
    if (!inicio || !fim || !motivo.trim() || busy) return;
    if (modo === "corrigir" && !registroId) return;
    if (modo === "adicionar" && !opcao) return;
    const payload = {
      inicio_solicitado: new Date(inicio).toISOString(),
      fim_solicitado: new Date(fim).toISOString(),
      motivo: motivo.trim(),
    };
    if (modo === "corrigir") {
      payload.registro_foco_id = Number(registroId);
    } else {
      const [tipo,id] = opcao.split(":");
      if (tipo === "operacao") payload.tarefa_id = Number(id);
      if (tipo === "comercial") payload.comercial_task_id = Number(id);
      if (tipo === "avulsa") payload.demanda_avulsa_id = Number(id);
    }
    setBusy(true);
    try {
      await EnvoxersAPI.api("/foco/ajustes", { method:"POST", body:JSON.stringify(payload) });
      toast("Ajuste enviado para aprovação", "success");
      onDone();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const selecionado = recentes.find((x) => String(x.id) === String(registroId));
  const duracao = inicio && fim ? focoAjDuracao(new Date(inicio).toISOString(), new Date(fim).toISOString()) : "—";

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal foco-ajuste-modal">
        <div className="modal-head">
          <div><div className="modal-eyebrow">Foco / ajuste de horas</div><h2 className="modal-title">Ajustar ou apontar tempo</h2></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="foco-ajuste-modal-body">
          <div className="foco-ajuste-mode">
            <button className={modo === "corrigir" ? "active" : ""} onClick={() => setModo("corrigir")}>Corrigir Foco existente</button>
            <button className={modo === "adicionar" ? "active" : ""} onClick={() => setModo("adicionar")}>Apontar tempo esquecido</button>
          </div>

          {modo === "corrigir" ? (
            <div className="field">
              <label>Qual Foco precisa ser corrigido?</label>
              <select value={registroId} onChange={(e) => escolherRegistro(e.target.value)}>
                <option value="">Selecione…</option>
                {recentes.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.ativo ? "[ATIVO] " : ""}{r.label} · {focoAjFmt(r.inicio)}
                  </option>
                ))}
              </select>
              {selecionado && selecionado.ativo && <div className="field-hint warning">Este timer está ligado agora. Ao enviar, ele será liberado e ficará fora dos relatórios até um gestor/admin aprovar o horário corrigido.</div>}
            </div>
          ) : (
            <div className="field">
              <label>Onde esse tempo foi trabalhado?</label>
              <select value={opcao} onChange={(e) => setOpcao(e.target.value)}>
                <option value="">Selecione um card, tarefa comercial ou demanda avulsa…</option>
                {opcoes.map((o) => (
                  <option value={o.tipo + ":" + o.id} key={o.tipo + ":" + o.id}>
                    {o.tipo === "operacao" ? "Operação" : o.tipo === "comercial" ? "Comercial" : "Avulsa"} · {o.contexto ? o.contexto + " · " : ""}{o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-grid">
            <div className="field"><label>Início correto</label><input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="field"><label>Fim correto</label><input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="foco-ajuste-duration">Tempo solicitado: <strong>{duracao}</strong></div>
          <div className="field">
            <label>Por que precisa deste ajuste?</label>
            <textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: esqueci o timer ligado depois da reunião; trabalhei sem iniciar o Foco…" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-envox" onClick={enviar} disabled={busy || !inicio || !fim || !motivo.trim() || (modo === "corrigir" ? !registroId : !opcao)}>
            {busy ? "Enviando…" : "Enviar para aprovação"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FocoAjustesScreen({ permissao, envoxerId, onFocoRefresh }) {
  const toast = EnvoxersShared.useToast();
  const manager = permissao === "admin" || permissao === "gestor";
  const [minhas, setMinhas] = useStateFocoAj(null);
  const [pendentes, setPendentes] = useStateFocoAj([]);
  const [recentes, setRecentes] = useStateFocoAj([]);
  const [opcoes, setOpcoes] = useStateFocoAj([]);
  const [modal, setModal] = useStateFocoAj(false);

  const carregar = async () => {
    try {
      const reqs = [
        EnvoxersAPI.api("/foco/ajustes/minhas"),
        EnvoxersAPI.api("/foco/ajustes/recentes"),
        EnvoxersAPI.api("/foco/ajustes/opcoes"),
      ];
      if (manager) reqs.push(EnvoxersAPI.api("/foco/ajustes/pendentes"));
      const res = await Promise.all(reqs);
      setMinhas(res[0]);
      setRecentes(res[1]);
      setOpcoes(res[2]);
      setPendentes(manager ? res[3] : []);
    } catch (err) {
      toast(err.message, "error");
    }
  };
  useEffectFocoAj(() => { carregar(); }, []);

  const decidir = async (item, decisao) => {
    let obs = "";
    if (decisao === "rejeitar") {
      obs = window.prompt("Motivo da rejeição (opcional)") || "";
      if (!confirm("Rejeitar este ajuste de horas?")) return;
    } else if (!confirm("Aprovar e validar este período de Foco?")) return;
    try {
      await EnvoxersAPI.api("/foco/ajustes/" + item.id + "/decidir", {
        method:"POST",
        body:JSON.stringify({ decisao: decisao, observacao_gestor: obs || null }),
      });
      toast(decisao === "aprovar" ? "Tempo aprovado e validado" : "Ajuste rejeitado", "success");
      await carregar();
      if (onFocoRefresh) onFocoRefresh();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const statusLabel = (s) => s === "pendente" ? "Pendente" : s === "aprovado" ? "Aprovado" : "Rejeitado";

  return (
    <div className="page foco-ajustes-page">
      <EnvoxersShared.PageHeader
        title="Ajustes de Foco"
        subtitle="Corrija timers esquecidos ou aponte tempo que não foi iniciado. O período só vale após aprovação."
        actions={<button className="btn btn-envox" onClick={() => setModal(true)}>+ Ajustar / apontar tempo</button>}
      />

      {manager && (
        <section className="foco-ajuste-section">
          <div className="foco-ajuste-section-head"><h2>Aguardando aprovação</h2><span>{pendentes.length}</span></div>
          {pendentes.length === 0 ? <div className="empty compact">Nenhum ajuste pendente.</div> : (
            <div className="foco-ajuste-list">
              {pendentes.map((x) => {
                const proprioGestor = permissao === "gestor" && Number(x.envoxer_id) === Number(envoxerId);
                return (
                  <article className="foco-ajuste-card pending" key={x.id}>
                    <div className="foco-ajuste-card-main">
                      <div className="foco-ajuste-card-title"><strong>{x.envoxer_nome}</strong><span>{x.contexto_label}</span></div>
                      <div className="foco-ajuste-card-period">{focoAjFmt(x.inicio_solicitado)} → {focoAjFmt(x.fim_solicitado)} <b>{focoAjDuracao(x.inicio_solicitado, x.fim_solicitado)}</b></div>
                      <p>{x.motivo}</p>
                      {x.era_ativo && <span className="foco-ajuste-active-note">Timer estava ativo e foi liberado; período aguarda validação.</span>}
                    </div>
                    <div className="foco-ajuste-card-actions">
                      {proprioGestor ? <span className="muted">Precisa de aprovação de admin</span> : (
                        <>
                          <button className="btn btn-sm btn-envox" onClick={() => decidir(x,"aprovar")}>Aprovar</button>
                          <button className="btn btn-sm danger-ghost" onClick={() => decidir(x,"rejeitar")}>Rejeitar</button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="foco-ajuste-section">
        <div className="foco-ajuste-section-head"><h2>Minhas solicitações</h2><span>{minhas ? minhas.length : "…"}</span></div>
        {minhas === null ? <div className="empty compact">Carregando…</div> : minhas.length === 0 ? <div className="empty compact">Você ainda não solicitou ajustes.</div> : (
          <div className="foco-ajuste-list">
            {minhas.map((x) => (
              <article className={"foco-ajuste-card status-" + x.status} key={x.id}>
                <div className="foco-ajuste-card-main">
                  <div className="foco-ajuste-card-title"><strong>{x.contexto_label}</strong><span className={"status-chip " + x.status}>{statusLabel(x.status)}</span></div>
                  <div className="foco-ajuste-card-period">{focoAjFmt(x.inicio_solicitado)} → {focoAjFmt(x.fim_solicitado)} <b>{focoAjDuracao(x.inicio_solicitado, x.fim_solicitado)}</b></div>
                  <p>{x.motivo}</p>
                  {x.observacao_gestor && <div className="foco-ajuste-manager-note">Gestão: {x.observacao_gestor}</div>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <FocoAjusteModal
          recentes={recentes}
          opcoes={opcoes}
          onClose={() => setModal(false)}
          onDone={async () => { setModal(false); await carregar(); if (onFocoRefresh) onFocoRefresh(); }}
        />
      )}
    </div>
  );
}

window.FocoAjustesScreen = FocoAjustesScreen;
