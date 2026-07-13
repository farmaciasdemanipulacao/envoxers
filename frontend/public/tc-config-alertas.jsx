const { useState: useStateCfgAlertas, useEffect: useEffectCfgAlertas } = React;

const CFG_ALERTAS_PAPEIS = [
  { valor: "admin", label: "Admin" },
  { valor: "gestor", label: "Gestor" },
  { valor: "envoxer", label: "Envoxer" },
];

const CFG_ALERTAS_GRUPO_LABEL = { farol: "Farol", chat: "Chat" };

function ConfigAlertasScreen({ permissao }) {
  const [configs, setConfigs] = useStateCfgAlertas([]);
  const [loading, setLoading] = useStateCfgAlertas(true);
  const [salvandoId, setSalvandoId] = useStateCfgAlertas(null);
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/admin/alertas-config");
      setConfigs(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectCfgAlertas(() => { if (isAdmin) carregar(); }, []);

  const salvar = async (id, patch) => {
    setSalvandoId(id);
    try {
      const atualizado = await EnvoxersAPI.api(`/admin/alertas-config/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setConfigs((prev) => prev.map((c) => (c.id === id ? atualizado : c)));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvandoId(null);
    }
  };

  const toggleAtivo = (config) => salvar(config.id, { ativo: !config.ativo });

  const togglePapel = (config, papel) => {
    const papeis = config.papeis || [];
    const novosPapeis = papeis.includes(papel) ? papeis.filter((p) => p !== papel) : [...papeis, papel];
    salvar(config.id, { papeis: novosPapeis });
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <EnvoxersShared.PageHeader title="Configuração de Alertas" />
        <p className="td-muted">Apenas admin pode configurar alertas.</p>
      </div>
    );
  }

  const grupos = configs.reduce((acc, c) => {
    (acc[c.grupo] = acc[c.grupo] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Configuração de Alertas"
        subtitle="Liga/desliga quais eventos disparam notificação push e escolhe quem recebe cada um."
      />

      {loading && <p className="td-muted">Carregando…</p>}

      {Object.keys(grupos).map((grupo) => (
        <div key={grupo} className="dash-card full" style={{ marginBottom: 16 }}>
          <div className="dash-card-head">
            <div className="dash-card-title">{CFG_ALERTAS_GRUPO_LABEL[grupo] || grupo}</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Alerta</th>
                  <th className="table-mobile-hide">Descrição</th>
                  <th style={{ width: 90 }}>Ativo</th>
                  <th style={{ width: 220 }}>Destinatários</th>
                </tr>
              </thead>
              <tbody>
                {grupos[grupo].map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td className="table-mobile-hide td-muted">{c.descricao}</td>
                    <td>
                      <button
                        className="chip"
                        onClick={() => toggleAtivo(c)}
                        disabled={salvandoId === c.id}
                        style={{ cursor: "pointer" }}
                      >
                        {c.ativo ? "Sim" : "Não"}
                      </button>
                    </td>
                    <td>
                      {c.papeis === null ? (
                        <span className="td-muted">Fixo (quem recebeu o evento)</span>
                      ) : (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {CFG_ALERTAS_PAPEIS.map((p) => (
                            <label key={p.valor} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={(c.papeis || []).includes(p.valor)}
                                disabled={salvandoId === c.id}
                                onChange={() => togglePapel(c, p.valor)}
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

window.ConfigAlertasScreen = ConfigAlertasScreen;
