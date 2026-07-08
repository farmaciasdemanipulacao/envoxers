const { useState: useStateEnv, useEffect: useEffectEnv } = React;

function EnvoxersScreen({ permissao }) {
  const [envoxers, setEnvoxers] = useStateEnv([]);
  const [loading, setLoading] = useStateEnv(true);
  const [editando, setEditando] = useStateEnv(null); // null = lista, {} = novo, {...} = editar
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await EnvoxersAPI.api("/envoxers");
      setEnvoxers(data);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectEnv(() => { carregar(); }, []);

  if (editando !== null) {
    return (
      <EnvoxerForm
        envoxer={editando.id ? editando : null}
        onCancel={() => setEditando(null)}
        onSaved={() => { setEditando(null); carregar(); }}
      />
    );
  }

  const contagem = { admin: 0, gestor: 0, envoxer: 0 };
  envoxers.forEach((e) => { if (contagem[e.permissao] !== undefined) contagem[e.permissao]++; });

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Envoxers"
        subtitle="Time interno. Custo/hora aqui é o que alimenta a margem por cliente em F1."
        actions={isAdmin && (
          <button className="btn btn-envox" onClick={() => setEditando({})}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg> Novo Envoxer
          </button>
        )}
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th className="table-mobile-hide">Cargo</th>
              <th className="table-mobile-hide">E-mail</th>
              <th className="table-mobile-hide" style={{ textAlign: "right" }}>Custo/hora</th>
              <th style={{ width: 110 }}>Permissão</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5">Carregando…</td></tr>}
            {!loading && envoxers.length === 0 && <tr><td colSpan="5">Nenhum envoxer cadastrado.</td></tr>}
            {envoxers.map((e) => (
              <tr key={e.id} onClick={() => isAdmin && setEditando(e)} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                <td>{e.nome}{!e.ativo && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-4)" }}>(inativo)</span>}</td>
                <td className="table-mobile-hide">{e.cargo}</td>
                <td className="table-mobile-hide">{e.email}</td>
                <td className="table-mobile-hide" style={{ textAlign: "right" }}>{EnvoxersShared.formatMoney(e.custo_hora)}</td>
                <td>{e.permissao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: "16px 20px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--bg-elev)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 6 }}>Nota</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
          Use <strong>salário + encargos</strong> (multiplicador ~1,5–1,8×) no campo <em>custo/hora</em>.
        </div>
      </div>
    </div>
  );
}

function EnvoxerForm({ envoxer, onCancel, onSaved }) {
  const isEdit = !!envoxer;
  const [nome, setNome] = useStateEnv(envoxer?.nome || "");
  const [email, setEmail] = useStateEnv(envoxer?.email || "");
  const [cargo, setCargo] = useStateEnv(envoxer?.cargo || "");
  const [fotoUrl, setFotoUrl] = useStateEnv(envoxer?.foto_url || "");
  const [permissao, setPermissao] = useStateEnv(envoxer?.permissao || "envoxer");
  const [salarioMensal, setSalarioMensal] = useStateEnv(envoxer?.salario_mensal ?? "");
  const [horasMes, setHorasMes] = useStateEnv(envoxer?.horas_mes ?? 220);
  const [ativo, setAtivo] = useStateEnv(envoxer?.ativo ?? true);
  const [senha, setSenha] = useStateEnv("");
  const [saving, setSaving] = useStateEnv(false);
  const toast = EnvoxersShared.useToast();

  const custoHoraCalculado = (Number(salarioMensal) > 0 && Number(horasMes) > 0)
    ? Number(salarioMensal) / Number(horasMes)
    : 0;

  const handleSave = async () => {
    if (!nome || !email || !cargo || !salarioMensal || (!isEdit && !senha)) {
      toast("Preencha os campos obrigatórios", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = { nome, email, cargo, foto_url: fotoUrl || null, permissao, salario_mensal: Number(salarioMensal), horas_mes: Number(horasMes), ativo };
      if (senha) payload.senha = senha;
      if (isEdit) {
        await EnvoxersAPI.api(`/envoxers/${envoxer.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await EnvoxersAPI.api("/envoxers", { method: "POST", body: JSON.stringify(payload) });
      }
      toast("Envoxer salvo!", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
            <a onClick={onCancel} style={{ cursor: "pointer" }}>← Envoxers</a>
          </div>
          <h1>{isEdit ? "Editar Envoxer" : "Novo Envoxer"}</h1>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <div className="form-panel">
          <div className="form-section">
            <div className="form-section-title">Identidade <EnvoxersShared.HelpIcon helpKey="form_env_ident" /></div>
            <div className="form-row">
              <div className="field span-2">
                <label>Nome completo <span className="req">*</span></label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana Beatriz Costa" />
              </div>
              <div className="field">
                <label>E-mail <span className="req">*</span></label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@envox.com.br" />
              </div>
              <div className="field">
                <label>Cargo <span className="req">*</span></label>
                <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Social Media Sênior" />
              </div>
              <div className="field">
                <label>Foto (URL) <span className="hint">opcional</span></label>
                <input type="text" value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="field">
                <label>Permissão <span className="req">*</span></label>
                <select value={permissao} onChange={(e) => setPermissao(e.target.value)}>
                  <option value="envoxer">Envoxer — executa e registra tempo</option>
                  <option value="gestor">Gestor — gerencia e aprova</option>
                  <option value="admin">Admin — vê e configura tudo</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Custo</div>
            <div className="form-section-hint">O custo/hora entra no cálculo de margem por cliente em F1.</div>
            <div className="form-row">
              <div className="field">
                <label>Salário mensal (R$) <span className="req">*</span></label>
                <EnvoxersShared.MoneyInput value={salarioMensal} onChange={setSalarioMensal} />
              </div>
              <div className="field">
                <label>Horas/mês <span className="req">*</span></label>
                <input type="number" step="1" value={horasMes} onChange={(e) => setHorasMes(e.target.value)} placeholder="220" />
              </div>
              <div className="field">
                <label>Custo/hora (calculado) <EnvoxersShared.HelpIcon helpKey="form_env_custo" /></label>
                <EnvoxersShared.MoneyInput value={custoHoraCalculado} readOnly disabled />
                <div className="field-help">Salário mensal ÷ horas/mês, atualizado automaticamente.</div>
              </div>
              <div className="field">
                <label>Ativo</label>
                <div className="seg">
                  <input type="radio" name="ativo" id="ativo-sim" checked={ativo === true} onChange={() => setAtivo(true)} /><label htmlFor="ativo-sim">Sim</label>
                  <input type="radio" name="ativo" id="ativo-nao" checked={ativo === false} onChange={() => setAtivo(false)} /><label htmlFor="ativo-nao">Não</label>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Senha {isEdit && <span className="hint">deixe em branco para manter</span>}</div>
            <div className="form-row">
              <div className="field">
                <label>{isEdit ? "Nova senha" : "Senha"} {!isEdit && <span className="req">*</span>}</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
          </div>

          <div className="form-footer">
            <span className="save-hint">Envoxer inativo não some — só deixa de aparecer nas seleções.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={onCancel}>Cancelar</button>
              <button className="btn btn-envox" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar Envoxer"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.EnvoxersScreen = EnvoxersScreen;
