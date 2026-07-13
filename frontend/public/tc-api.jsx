// Cliente HTTP simples para a API do Envoxers.
const API_BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("envoxers_token");
}

function setSession(token, nome, permissao, id) {
  localStorage.setItem("envoxers_token", token);
  localStorage.setItem("envoxers_nome", nome);
  localStorage.setItem("envoxers_permissao", permissao);
  if (id != null) localStorage.setItem("envoxers_id", String(id));
}

function clearSession() {
  localStorage.removeItem("envoxers_token");
  localStorage.removeItem("envoxers_nome");
  localStorage.removeItem("envoxers_permissao");
  localStorage.removeItem("envoxers_id");
}

function getEnvoxerId() {
  const id = localStorage.getItem("envoxers_id");
  return id ? Number(id) : null;
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
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

async function upload(path, file) {
  const token = getToken();
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("arquivo", file);

  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });

  if (res.status === 401) {
    clearSession();
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

  return res.json();
}

window.EnvoxersAPI = { api, upload, getToken, setSession, clearSession, getEnvoxerId };
