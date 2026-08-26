// D-124 (revisado) — a 1ª tentativa era lista vertical fixa de 220px à esquerda,
// mas isso roubava largura horizontal das telas de tabela (confirmado: cortava a
// coluna de Ações da tabela de Envoxers, 100px de overflow real medido). Virou
// barra horizontal de 1 nível só (reaproveita .nav a, mesma linguagem visual da
// sidebar principal) — não tira espaço nenhum do conteúdo abaixo.
function ConfiguracoesScreen({
  item, onItemChange,
  permissao, nome, fotoUrl, envoxerId, onFotoAtualizada,
  clienteParaAbrir, onClienteAberto,
}) {
  const linkItem = (key, label, icon) => (
    <a
      className={item === key ? "active" : ""}
      onClick={() => onItemChange(key)}
      style={{ cursor: "pointer" }}
    >
      {icon}
      <span className="nav-label">{label}</span>
    </a>
  );

  return (
    <>
      <div className="config-topnav">
        <nav className="nav">
          {linkItem(
            "clientes",
            "Clientes",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2.5" /><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" /></svg>
          )}
          {linkItem(
            "envoxers",
            "Envoxers",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2" /><circle cx="11" cy="7" r="1.5" /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M10 13c0-1.7 1.3-3 3-3" /></svg>
          )}
          {linkItem(
            "servicos",
            "Serviços",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
          )}
        </nav>
        <span className="config-topnav-sep" />
        <nav className="nav">
          {linkItem(
            "perfil",
            "Meu Perfil",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="2" /><circle cx="6" cy="7" r="1.4" /><path d="M4 11c0-1.2 .9-2 2-2s2 .8 2 2" /><path d="M9.5 6.2h3M9.5 9h2" /></svg>
          )}
        </nav>
        <a className="disabled config-topnav-future" style={{ cursor: "default" }} title="Mais opções chegam aqui em breve">
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
          <span className="nav-label">Em breve</span>
        </a>
      </div>

      {item === "clientes" && (
        <ClientesScreen permissao={permissao} abrirClienteId={clienteParaAbrir} onClienteAberto={onClienteAberto} />
      )}
      {item === "envoxers" && <EnvoxersScreen permissao={permissao} />}
      {item === "servicos" && <ServicosScreen permissao={permissao} />}
      {item === "perfil" && (
        <MeuPerfilScreen nome={nome} permissao={permissao} fotoUrl={fotoUrl} envoxerId={envoxerId} onFotoAtualizada={onFotoAtualizada} />
      )}
    </>
  );
}

window.ConfiguracoesScreen = ConfiguracoesScreen;
