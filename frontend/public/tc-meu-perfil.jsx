// D-090 — self-service: qualquer envoxer logado troca a própria foto (upload de
// verdade, não mais o campo de URL antigo que nunca aparecia em avatar nenhum).
const { useState: useStateMeuPerfil, useRef: useRefMeuPerfil } = React;

function MeuPerfilScreen({ nome, permissao, fotoUrl, onFotoAtualizada }) {
  const toast = EnvoxersShared.useToast();
  const [enviando, setEnviando] = useStateMeuPerfil(false);
  const [arquivoParaRecortar, setArquivoParaRecortar] = useStateMeuPerfil(null);
  const inputRef = useRefMeuPerfil(null);

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

  return (
    <div className="page">
      <EnvoxersShared.PageHeader
        title="Meu Perfil"
        subtitle="Sua foto aparece no menu lateral, em Envoxers e em qualquer lista onde você é o responsável."
      />
      <div className="form-section" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <EnvoxersShared.Avatar nome={nome} fotoUrl={fotoUrl} size="lg" />
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
