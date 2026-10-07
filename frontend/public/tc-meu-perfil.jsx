// D-090 — self-service: qualquer envoxer logado troca a própria foto (upload de
// verdade, não mais o campo de URL antigo que nunca aparecia em avatar nenhum).
const { useState: useStateMeuPerfil, useRef: useRefMeuPerfil } = React;

function MeuPerfilScreen({ nome, permissao, fotoUrl, envoxerId, onFotoAtualizada }) {
  const toast = EnvoxersShared.useToast();
  const [enviando, setEnviando] = useStateMeuPerfil(false);
  const [arquivoParaRecortar, setArquivoParaRecortar] = useStateMeuPerfil(null);
  const inputRef = useRefMeuPerfil(null);
  const [senhaAtual, setSenhaAtual] = useStateMeuPerfil("");
  const [novaSenha, setNovaSenha] = useStateMeuPerfil("");
  const [confirmarSenha, setConfirmarSenha] = useStateMeuPerfil("");
  const [salvandoSenha, setSalvandoSenha] = useStateMeuPerfil(false);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setArquivoParaRecortar(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleConfirmarRecorte = async (blob) => {
    setArquivoParaRecortar(null);
    setEnviando(true);
    try {
      const resp = await EnvoxersAPI.upload("/envoxers/me/foto", blob, "avatar.jpg");
      onFotoAtualizada(resp.foto_url);
      toast("Foto atualizada!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const handleAlterarSenha = async (e) => {
    e.preventDefault();
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      toast("Preencha os três campos de senha", "error");
      return;
    }
    if (novaSenha.length < 8) {
      toast("A nova senha precisa ter pelo menos 8 caracteres", "error");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast("A confirmação não confere com a nova senha", "error");
      return;
    }
    setSalvandoSenha(true);
    try {
      await EnvoxersAPI.api("/envoxers/me/senha", {
        method: "POST",
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      toast("Senha alterada com sucesso", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSalvandoSenha(false);
    }
  };

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Meu Perfil"
        subtitle="Sua foto aparece no menu lateral, em Envoxers e em qualquer lista onde você é o responsável."
      />
      <div className="form-section" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <EnvoxersShared.Avatar nome={nome} fotoUrl={fotoUrl} size="lg" envoxerId={envoxerId} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{nome}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "capitalize" }}>{permissao}</div>
          </div>
        </div>
        <label className="btn btn-envox" style={{ cursor: "pointer", display: "inline-flex" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v9M4 7l4-4 4 4" /><path d="M2 13h12" /></svg>
          {enviando ? "Enviando…" : "Trocar foto"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={enviando}
            style={{ display: "none" }}
          />
        </label>
        <div className="hint" style={{ marginTop: 8 }}>PNG ou JPG — você escolhe o enquadramento antes de enviar.</div>
      </div>

      <div className="form-section profile-password-section" style={{ maxWidth: 520, marginTop: 18 }}>
        <div className="form-section-title">Segurança</div>
        <div className="profile-password-intro">Altere sua senha informando primeiro a senha atual.</div>
        <form onSubmit={handleAlterarSenha} className="profile-password-form">
          <div className="field">
            <label>Senha atual</label>
            <input type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Nova senha</label>
              <input type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="mínimo 8 caracteres" />
            </div>
            <div className="field">
              <label>Confirmar nova senha</label>
              <input type="password" autoComplete="new-password" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-envox" type="submit" disabled={salvandoSenha}>
            {salvandoSenha ? "Alterando…" : "Alterar senha"}
          </button>
        </form>
      </div>

      {arquivoParaRecortar && (
        <EnvoxersShared.AvatarCropModal
          file={arquivoParaRecortar}
          onCancel={() => setArquivoParaRecortar(null)}
          onConfirm={handleConfirmarRecorte}
        />
      )}
    </div>
  );
}

window.MeuPerfilScreen = MeuPerfilScreen;
