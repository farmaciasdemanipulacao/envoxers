// Cliente HTTP simples para a API do Envoxers.
const API_BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("envoxers_token");
}

function setSession(token, nome, permissao, id, fotoUrl) {
  localStorage.setItem("envoxers_token", token);
  localStorage.setItem("envoxers_nome", nome);
  localStorage.setItem("envoxers_permissao", permissao);
  if (id != null) localStorage.setItem("envoxers_id", String(id));
  localStorage.setItem("envoxers_foto_url", fotoUrl || "");
}

function clearSession() {
  // Some limpa a tela salva desse envoxer (sessionStorage, ver AppShell) — assim um
  // login novo na mesma aba, logo após logout, também cai no Dashboard do dia em vez
  // de reabrir a última tela de uma sessão anterior.
  const idAnterior = localStorage.getItem("envoxers_id");
  if (idAnterior) sessionStorage.removeItem(`envoxers_view_${idAnterior}`);

  localStorage.removeItem("envoxers_token");
  localStorage.removeItem("envoxers_nome");
  localStorage.removeItem("envoxers_permissao");
  localStorage.removeItem("envoxers_id");
  localStorage.removeItem("envoxers_foto_url");
  _limparBackupAdmin();
}

function getEnvoxerId() {
  const id = localStorage.getItem("envoxers_id");
  return id ? Number(id) : null;
}

function _limparBackupAdmin() {
  localStorage.removeItem("envoxers_admin_token");
  localStorage.removeItem("envoxers_admin_nome");
  localStorage.removeItem("envoxers_admin_permissao");
  localStorage.removeItem("envoxers_admin_id");
  localStorage.removeItem("envoxers_admin_foto_url");
}

// "Acessar como" (admin): guarda a sessão real do admin pra poder voltar sem
// relogar, e assume a sessão da conta acessada. `token`/`nome`/`permissao`/`id`/
// `fotoUrl` vêm da resposta de POST /envoxers/{id}/impersonar.
function iniciarImpersonacao(token, nome, permissao, id, fotoUrl) {
  localStorage.setItem("envoxers_admin_token", getToken());
  localStorage.setItem("envoxers_admin_nome", localStorage.getItem("envoxers_nome") || "");
  localStorage.setItem("envoxers_admin_permissao", localStorage.getItem("envoxers_permissao") || "");
  localStorage.setItem("envoxers_admin_id", localStorage.getItem("envoxers_id") || "");
  localStorage.setItem("envoxers_admin_foto_url", localStorage.getItem("envoxers_foto_url") || "");
  setSession(token, nome, permissao, id, fotoUrl);
}

function estaImpersonando() {
  return !!localStorage.getItem("envoxers_admin_token");
}

// Volta pra sessão real do admin usando o token guardado — sem precisar logar de novo.
function encerrarImpersonacao() {
  const token = localStorage.getItem("envoxers_admin_token");
  if (!token) return false;
  const id = localStorage.getItem("envoxers_admin_id");
  setSession(
    token,
    localStorage.getItem("envoxers_admin_nome") || "",
    localStorage.getItem("envoxers_admin_permissao") || "admin",
    id ? Number(id) : null,
    localStorage.getItem("envoxers_admin_foto_url") || ""
  );
  _limparBackupAdmin();
  return true;
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

async function upload(path, file, nomeArquivo) {
  const token = getToken();
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  // `file` pode ser um Blob sem nome (ex.: canvas.toBlob() do recorte de foto,
  // ver AvatarCropModal) — sem o 3º argumento aqui o FormData manda "blob" sem
  // extensão, então deixamos explícito.
  formData.append("arquivo", file, nomeArquivo || file.name || "arquivo.jpg");

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


async function uploadWithFields(path, file, nomeArquivo, fields = {}) {
  const token = getToken();
  const headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;

  const formData = new FormData();
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value != null) formData.append(key, String(value));
  });
  formData.append("arquivo", file, nomeArquivo || file.name || "arquivo.jpg");

  const res = await fetch(API_BASE + path, { method: "POST", headers, body: formData });

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new Error("Sessão expirada");
  }

  if (!res.ok) {
    let detail = "Erro " + res.status;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (e) {}
    throw new Error(detail);
  }

  return res.json();
}


function uploadMultipleWithProgress(path, files, fields = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + path);
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || !onProgress) return;
      onProgress(Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100))));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearSession();
        window.location.reload();
        reject(new Error("Sessão expirada"));
        return;
      }
      let body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error((body && body.detail) || ("Erro " + xhr.status)));
        return;
      }
      if (onProgress) onProgress(100);
      resolve(body);
    };

    xhr.onerror = () => reject(new Error("Falha de rede durante o upload"));
    xhr.onabort = () => reject(new Error("Upload cancelado"));

    const formData = new FormData();
    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value != null) formData.append(key, String(value));
    });
    (files || []).forEach((file) => {
      formData.append("arquivos", file, file.name || "arquivo");
    });
    xhr.send(formData);
  });
}


function uploadWithProgress(path, file, nomeArquivo, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + path);
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable || !onProgress) return;
      onProgress(Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100))));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearSession();
        window.location.reload();
        reject(new Error("Sessão expirada"));
        return;
      }
      let body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error((body && body.detail) || ("Erro " + xhr.status)));
        return;
      }
      if (onProgress) onProgress(100);
      resolve(body);
    };

    xhr.onerror = () => reject(new Error("Falha de rede durante o upload"));
    xhr.onabort = () => reject(new Error("Upload cancelado"));

    const formData = new FormData();
    formData.append("arquivo", file, nomeArquivo || file.name || "arquivo");
    xhr.send(formData);
  });
}

window.EnvoxersAPI = {
  api, upload, uploadWithFields, uploadWithProgress, uploadMultipleWithProgress, getToken, setSession, clearSession, getEnvoxerId,
  iniciarImpersonacao, estaImpersonando, encerrarImpersonacao,
};
