const { useState: useStateSrv, useEffect: useEffectSrv } = React;

function ServicosScreen({ permissao }) {
  const [servicos, setServicos] = useStateSrv([]);
  const [loading, setLoading] = useStateSrv(true);
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/servicos");
      setServicos(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectSrv(() => { carregar(); }, []);

  const toggleAtivo = async (s) => {
    if (!isAdmin) return;
    try {
      await EnvoxersAPI.api(`/servicos/${s.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !s.ativo }) });
      carregar();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Serviços"
        subtitle="Catálogo fixo do que a Envox oferece. Editável só por admin — mexer aqui reflete em contratos históricos."
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th className="table-mobile-hide">Slug (interno)</th>
              <th className="table-mobile-hide">Descrição</th>
              <th style={{ width: 80 }}>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="4">Carregando…</td></tr>}
            {servicos.map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td>
                <td className="table-mobile-hide"><code>{s.slug}</code></td>
                <td className="table-mobile-hide">{s.descricao}</td>
                <td>
                  <button className="chip" onClick={() => toggleAtivo(s)} disabled={!isAdmin} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {s.ativo ? "Sim" : "Não"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.ServicosScreen = ServicosScreen;
