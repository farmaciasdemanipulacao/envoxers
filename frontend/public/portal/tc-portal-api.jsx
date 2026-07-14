// Cliente HTTP do Portal do Cliente — separado do tc-api.jsx interno de propósito:
// mesma origem (envoxers.envox.com.br), então localStorage é compartilhado por path;
// chaves próprias (portal_*) evitam qualquer colisão com a sessão de Envoxer.
const PORTAL_API_BASE = "/api/v1";

function portalGetToken() {
  return localStorage.getItem("portal_token");
}

function portalSetSession(token, id, nome, clienteId, clienteNome) {
  localStorage.setItem("portal_token", token);
  localStorage.setItem("portal_contato_id", String(id));
  localStorage.setItem("portal_nome", nome);
  localStorage.setItem("portal_cliente_id", String(clienteId));
  localStorage.setItem("portal_cliente_nome", clienteNome);
}

function portalClearSession() {
  localStorage.removeItem("portal_token");
  localStorage.removeItem("portal_contato_id");
  localStorage.removeItem("portal_nome");
  localStorage.removeItem("portal_cliente_id");
  localStorage.removeItem("portal_cliente_nome");
}

async function portalApi(path, options = {}) {
  const token = portalGetToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${PORTAL_API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    portalClearSession();
    window.location.reload();
    throw new Error("Sessão expirada");
  }

  if (!res.ok) {
    let detail = `Erro ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (e) {}
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

window.PortalAPI = { api: portalApi, getToken: portalGetToken, setSession: portalSetSession, clearSession: portalClearSession };
