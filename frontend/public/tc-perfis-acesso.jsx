const { useState: useStatePerf, useEffect: useEffectPerf } = React;

const PERF_MODULOS = [
  ["chat", "Chat"],
  ["comercial", "Comercial"],
  ["operacao", "Operação"],
  ["entregas", "Entregas"],
  ["farol", "Farol"],
  ["icp", "ICP"],
  ["desenvolvimento", "Desenvolvimento"],
  ["admin", "Admin"],
  ["configuracoes", "Configurações"],
];

const PERF_MAX = {
  admin: new Set(PERF_MODULOS.map((x) => x[0])),
  gestor: new Set(["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","admin","configuracoes"]),
  envoxer: new Set(["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","configuracoes"]),
  comercial: new Set(["chat","comercial","operacao"]),
};

function PerfilAcessoModal({ perfil, onClose, onSaved }) {
  const toast = EnvoxersShared.useToast();
  const editando = !!perfil;
  const sistema = !!perfil?.sistema;
  const [nome, setNome] = useStatePerf(perfil?.nome || "");
  const [nivelBase, setNivelBase] = useStatePerf(perfil?.nivel_base || "envoxer");
  const [modulos, setModulos] = useStatePerf(() => new Set(perfil?.modulos || ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","configuracoes"]));
  const [saving, setSaving] = useStatePerf(false);

  const permitidos = PERF_MAX[nivelBase] || PERF_MAX.envoxer;
  const obrigatorios = nivelBase === "admin" ? new Set(["configuracoes"]) : new Set();

  const trocarNivel = (novo) => {
    setNivelBase(novo);
    setModulos((prev) => {
      const next = new Set([...prev].filter((x) => (PERF_MAX[novo] || new Set()).has(x)));
      if (novo === "admin") next.add("configuracoes");
      return next;
    });
  };

  const toggle = (key) => {
    if (!permitidos.has(key) || obrigatorios.has(key)) return;
    setModulos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const salvar = async () => {
    if (!nome.trim() || saving) return;
    if (modulos.size === 0) {
      toast("Selecione pelo menos um módulo", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(sistema ? {} : { nome: nome.trim(), nivel_base: nivelBase }),
        modulos: PERF_MODULOS.map((x) => x[0]).filter((x) => modulos.has(x)),
      };
      await EnvoxersAPI.api(editando ? "/perfis-acesso/" + perfil.id : "/perfis-acesso", {
        method: editando ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast(editando ? "Perfil atualizado" : "Perfil criado", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal access-profile-modal">
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Admin / Perfis de acesso</div>
            <h2 className="modal-title">{editando ? "Editar perfil" : "Novo perfil"}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="access-profile-modal-body">
          <div className="form-grid">
            <div className="field">
              <label>Nome do perfil</label>
              <input value={nome} disabled={sistema} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Atendimento" />
              {sistema && <div className="field-help">Perfil padrão do sistema: nome e nível-base ficam protegidos.</div>}
            </div>
            <div className="field">
              <label>Nível-base de segurança</label>
              <select value={nivelBase} disabled={sistema} onChange={(e) => trocarNivel(e.target.value)}>
                <option value="envoxer">Envoxer</option>
                <option value="gestor">Gestor</option>
                <option value="comercial">Comercial</option>
                <option value="admin">Admin</option>
              </select>
              <div className="field-help">Define o teto de permissões. Os módulos abaixo só organizam o acesso ao menu.</div>
            </div>
          </div>

          <div className="access-profile-modules">
            <div className="form-section-title">Módulos do menu principal</div>
            <div className="access-module-grid">
              {PERF_MODULOS.map(([key,label]) => {
                const permitido = permitidos.has(key);
                return (
                  <button
                    type="button"
                    key={key}
                    className={"access-module-option" + (modulos.has(key) ? " active" : "") + (!permitido || obrigatorios.has(key) ? " disabled" : "")}
                    disabled={!permitido || obrigatorios.has(key)}
                    onClick={() => toggle(key)}
                  >
                    <span className="access-module-check">{modulos.has(key) ? "✓" : ""}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-envox" onClick={salvar} disabled={saving || !nome.trim()}>{saving ? "Salvando…" : "Salvar perfil"}</button>
        </div>
      </div>
    </div>
  );
}

function PerfisAcessoScreen() {
  const toast = EnvoxersShared.useToast();
  const [perfis, setPerfis] = useStatePerf(null);
  const [modal, setModal] = useStatePerf(null);

  const carregar = async () => {
    try {
      setPerfis(await EnvoxersAPI.api("/perfis-acesso"));
    } catch (err) {
      toast(err.message, "error");
    }
  };
  useEffectPerf(() => { carregar(); }, []);

  const excluir = async (perfil) => {
    if (perfil.sistema) return;
    if (!confirm('Excluir o perfil "' + perfil.nome + '"?')) return;
    try {
      await EnvoxersAPI.api("/perfis-acesso/" + perfil.id, { method: "DELETE" });
      toast("Perfil excluído", "success");
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="page access-profiles-page">
      <EnvoxersShared.PageHeader
        title="Perfis de acesso"
        subtitle="Defina quais módulos do menu cada tipo de usuário enxerga, sem ultrapassar o nível-base de segurança."
        actions={<button className="btn btn-envox" onClick={() => setModal({})}>+ Novo perfil</button>}
      />

      {perfis === null ? <div className="empty">Carregando perfis…</div> : (
        <div className="access-profile-grid">
          {perfis.map((p) => (
            <article className="access-profile-card" key={p.id}>
              <div className="access-profile-card-head">
                <div>
                  <div className="access-profile-title-row">
                    <h3>{p.nome}</h3>
                    {p.sistema && <span className="chip">PADRÃO</span>}
                  </div>
                  <div className="access-profile-meta">Base: <strong>{p.nivel_base}</strong> · {p.usuarios_count} usuário(s)</div>
                </div>
                <button className="btn btn-sm" onClick={() => setModal(p)}>Editar</button>
              </div>
              <div className="access-profile-module-tags">
                {PERF_MODULOS.filter(([key]) => (p.modulos || []).includes(key)).map(([key,label]) => <span key={key}>{label}</span>)}
              </div>
              {!p.sistema && (
                <div className="access-profile-card-footer">
                  <button className="btn btn-xs danger-ghost" disabled={p.usuarios_count > 0} onClick={() => excluir(p)}>
                    Excluir
                  </button>
                  {p.usuarios_count > 0 && <small>Remova os usuários deste perfil antes de excluir.</small>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {modal && <PerfilAcessoModal perfil={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
    </div>
  );
}

window.PerfisAcessoScreen = PerfisAcessoScreen;
