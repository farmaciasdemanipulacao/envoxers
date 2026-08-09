const { useState: useStateEnv, useEffect: useEffectEnv } = React;

function formatarDataHoraEnv(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function EnvoxersScreen({ permissao }) {
  const [envoxers, setEnvoxers] = useStateEnv([]);
  const [loading, setLoading] = useStateEnv(true);
  const [editando, setEditando] = useStateEnv(null); // null = lista, {} = novo, {...} = editar
  const [filtroPermissao, setFiltroPermissao] = useStateEnv("todos");
  const [aba, setAba] = useStateEnv("lista"); // "lista" | "acessos" — aba só existe pro admin
  const toast = EnvoxersShared.useToast();
  const isAdmin = permissao === "admin";

  const [acessandoComoId, setAcessandoComoId] = useStateEnv(null);

  const handleAcessarComo = async (e, alvo) => {
    e.stopPropagation();
    if (!window.confirm(`Acessar a conta de ${alvo.nome} como se fosse ele(a)? Você pode voltar pra sua conta a qualquer momento pelo aviso no topo da tela.`)) return;
    setAcessandoComoId(alvo.id);
    try {
      const resp = await EnvoxersAPI.api(`/envoxers/${alvo.id}/impersonar`, { method: "POST" });
      EnvoxersAPI.iniciarImpersonacao(resp.access_token, resp.nome, resp.permissao, resp.id, resp.foto_url);
      window.location.reload();
    } catch (err) {
      toast(err.message, "error");
      setAcessandoComoId(null);
    }
  };

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

  const filtrados = filtroPermissao === "todos" ? envoxers : envoxers.filter((e) => e.permissao === filtroPermissao);
  const opcoesFiltro = [
    ["todos", "Todos", envoxers.length],
    ["admin", "Admin", contagem.admin],
    ["gestor", "Gestor", contagem.gestor],
    ["envoxer", "Envoxer", contagem.envoxer],
  ];

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

      {isAdmin && (
        <div className="toolbar">
          <div className="filter-group">
            <button className={"chip" + (aba === "lista" ? " active" : "")} onClick={() => setAba("lista")}>Envoxers</button>
            <button className={"chip" + (aba === "acessos" ? " active" : "")} onClick={() => setAba("acessos")}>Acessos</button>
          </div>
        </div>
      )}

      {aba === "acessos" && isAdmin ? (
        <AcessosPainel envoxers={envoxers} />
      ) : (
      <>
      <div className="toolbar">
        <div className="filter-group">
          {opcoesFiltro.map(([valor, label, qtd]) => (
            <button key={valor} className={"chip" + (filtroPermissao === valor ? " active" : "")} onClick={() => setFiltroPermissao(valor)}>
              {label} {qtd}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th className="table-mobile-hide">Cargo</th>
              <th className="table-mobile-hide">E-mail</th>
              {isAdmin && <th className="table-mobile-hide" style={{ textAlign: "right" }}>Custo/hora</th>}
              <th style={{ width: 110 }}>Permissão</th>
              {isAdmin && <th style={{ width: 140 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6">Carregando…</td></tr>}
            {!loading && filtrados.length === 0 && <tr><td colSpan="6">Nenhum envoxer neste filtro.</td></tr>}
            {filtrados.map((e) => (
              <tr key={e.id} onClick={() => isAdmin && setEditando(e)} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <EnvoxersShared.Avatar nome={e.nome} fotoUrl={e.foto_url} size="md" className={e.permissao === "admin" ? "" : "gray"} envoxerId={e.id} />
                    <span>{e.nome}{!e.ativo && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-4)" }}>(inativo)</span>}</span>
                  </div>
                </td>
                <td className="table-mobile-hide">{e.cargo}</td>
                <td className="table-mobile-hide">{e.email}</td>
                {isAdmin && <td className="table-mobile-hide mono" style={{ textAlign: "right" }}>{e.custo_hora != null ? EnvoxersShared.formatMoney(e.custo_hora) : "—"}</td>}
                <td>{e.permissao}</td>
                {isAdmin && (
                  <td>
                    {e.permissao !== "admin" && e.ativo && (
                      <button
                        className="btn btn-sm"
                        onClick={(ev) => handleAcessarComo(ev, e)}
                        disabled={acessandoComoId === e.id}
                        title={`Ver o app como ${e.nome}`}
                      >
                        {acessandoComoId === e.id ? "Acessando…" : "Acessar como"}
                      </button>
                    )}
                  </td>
                )}
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
      </>
      )}
    </div>
  );
}

// Painel do admin (D-114): status de instalação/notificação por pessoa + histórico
// de acessos (login = acesso, independente do timer de Foco — ver acesso_log.py).
function AcessosPainel({ envoxers }) {
  const [statusList, setStatusList] = useStateEnv([]);
  const [acessos, setAcessos] = useStateEnv([]);
  const [loading, setLoading] = useStateEnv(true);
  const [filtroEnvoxer, setFiltroEnvoxer] = useStateEnv("todos");
  const toast = EnvoxersShared.useToast();

  const carregar = async (envoxerId) => {
    setLoading(true);
    try {
      const params = envoxerId && envoxerId !== "todos" ? `?envoxer_id=${envoxerId}` : "";
      const [status, log] = await Promise.all([
        EnvoxersAPI.api("/admin/status-dispositivos"),
        EnvoxersAPI.api(`/admin/acessos${params}`),
      ]);
      setStatusList(status);
      setAcessos(log);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffectEnv(() => { carregar(filtroEnvoxer); }, [filtroEnvoxer]);

  return (
    <>
      <div style={{ marginTop: 8, marginBottom: 28 }}>
        <div className="form-section-title" style={{ marginBottom: 10 }}>Status de instalação e notificações</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th style={{ width: 110 }}>Permissão</th>
                <th style={{ width: 160 }}>App instalado</th>
                <th style={{ width: 170 }}>Notificações</th>
                <th style={{ width: 160 }}>Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="5">Carregando…</td></tr>}
              {!loading && statusList.length === 0 && <tr><td colSpan="5">Nenhum envoxer.</td></tr>}
              {statusList.map((s) => (
                <tr key={s.envoxer_id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <EnvoxersShared.Avatar nome={s.nome} fotoUrl={s.foto_url} size="sm" envoxerId={s.envoxer_id} />
                      <span>{s.nome}{!s.ativo && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-4)" }}>(inativo)</span>}</span>
                    </div>
                  </td>
                  <td>{s.permissao}</td>
                  <td>
                    {s.app_instalado
                      ? <span style={{ color: "var(--farol-verde)", fontWeight: 600 }}>Sim · {formatarDataHoraEnv(s.app_instalado_em)}</span>
                      : (s.permissao === "admin" ? <span style={{ color: "var(--ink-4)" }}>— (não exigido)</span> : <span style={{ color: "var(--farol-vermelho)", fontWeight: 600 }}>Não</span>)}
                  </td>
                  <td>
                    {s.notificacoes_ativas
                      ? <span style={{ color: "var(--farol-verde)", fontWeight: 600 }}>Ativas ({s.qtd_dispositivos} dispositivo{s.qtd_dispositivos !== 1 ? "s" : ""})</span>
                      : (s.permissao === "admin" ? <span style={{ color: "var(--ink-4)" }}>— (não exigido)</span> : <span style={{ color: "var(--farol-vermelho)", fontWeight: 600 }}>Inativas</span>)}
                  </td>
                  <td>{formatarDataHoraEnv(s.ultimo_acesso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div className="form-section-title" style={{ marginBottom: 0 }}>Histórico de acessos</div>
          <select value={filtroEnvoxer} onChange={(e) => setFiltroEnvoxer(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="todos">Todas as pessoas</option>
            {envoxers.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th style={{ width: 170 }}>Data/hora</th>
                <th className="table-mobile-hide" style={{ width: 130 }}>IP</th>
                <th className="table-mobile-hide">Navegador</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="4">Carregando…</td></tr>}
              {!loading && acessos.length === 0 && <tr><td colSpan="4">Nenhum acesso registrado.</td></tr>}
              {acessos.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <EnvoxersShared.Avatar nome={a.envoxer_nome || "?"} fotoUrl={a.envoxer_foto} size="sm" envoxerId={a.envoxer_id} />
                      <span>{a.envoxer_nome || "(removido)"}</span>
                    </div>
                  </td>
                  <td>{formatarDataHoraEnv(a.criado_em)}</td>
                  <td className="table-mobile-hide mono">{a.ip || "—"}</td>
                  <td className="table-mobile-hide" style={{ fontSize: 12, color: "var(--ink-3)" }}>{a.user_agent || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function EnvoxerForm({ envoxer, onCancel, onSaved }) {
  const isEdit = !!envoxer;
  const [nome, setNome] = useStateEnv(envoxer?.nome || "");
  const [email, setEmail] = useStateEnv(envoxer?.email || "");
  const [cargo, setCargo] = useStateEnv(envoxer?.cargo || "");
  const [fotoUrl, setFotoUrl] = useStateEnv(envoxer?.foto_url || "");
  const [enviandoFoto, setEnviandoFoto] = useStateEnv(false);
  const [arquivoParaRecortar, setArquivoParaRecortar] = useStateEnv(null);
  const [permissao, setPermissao] = useStateEnv(envoxer?.permissao || "envoxer");
  const [salarioMensal, setSalarioMensal] = useStateEnv(envoxer?.salario_mensal ?? "");
  const [horasMes, setHorasMes] = useStateEnv(envoxer?.horas_mes ?? 220);
  const [ativo, setAtivo] = useStateEnv(envoxer?.ativo ?? true);
  const [senha, setSenha] = useStateEnv("");
  const [saving, setSaving] = useStateEnv(false);
  const toast = EnvoxersShared.useToast();

  const handleFotoFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setArquivoParaRecortar(file);
    e.target.value = "";
  };

  const handleConfirmarRecorteFoto = async (blob) => {
    setArquivoParaRecortar(null);
    setEnviandoFoto(true);
    try {
      const resp = await EnvoxersAPI.upload(`/envoxers/${envoxer.id}/foto`, blob, "avatar.jpg");
      setFotoUrl(resp.foto_url || "");
      toast("Foto atualizada!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEnviandoFoto(false);
    }
  };

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
    <>
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
                <label>Foto <span className="hint">opcional</span></label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <EnvoxersShared.Avatar nome={nome} fotoUrl={fotoUrl} size="md" envoxerId={envoxer?.id} />
                  {isEdit ? (
                    <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                      {enviandoFoto ? "Enviando…" : "Trocar foto"}
                      <input type="file" accept="image/*" onChange={handleFotoFile} disabled={enviandoFoto} style={{ display: "none" }} />
                    </label>
                  ) : (
                    <span className="hint">salve o envoxer pra poder subir a foto</span>
                  )}
                </div>
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
    {arquivoParaRecortar && (
      <EnvoxersShared.AvatarCropModal
        file={arquivoParaRecortar}
        onCancel={() => setArquivoParaRecortar(null)}
        onConfirm={handleConfirmarRecorteFoto}
      />
    )}
    </>
  );
}

window.EnvoxersScreen = EnvoxersScreen;
