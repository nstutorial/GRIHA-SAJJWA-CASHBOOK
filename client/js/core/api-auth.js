async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
  };
  let response = null;
  let lastError = null;
  for (const baseUrl of API_BASE_URLS) {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers
      });
      if (response.ok || !baseUrl || ![404, 405].includes(response.status)) break;
    } catch (error) {
      lastError = error;
      response = null;
    }
  }
  if (!response) throw lastError || new Error("API request failed.");

  if (!response.ok) {
    const error = new Error(`API request failed: ${response.status}`);
    error.status = response.status;
    try {
      error.details = await response.json();
    } catch {
      error.details = null;
    }
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      clearAuth();
      showAuthView("login");
    }
    throw error;
  }

  return response.json();
}

async function authRequest(path, body) {
  let response = null;
  let lastError = null;
  for (const baseUrl of API_BASE_URLS) {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.ok || !baseUrl || ![404, 405].includes(response.status)) break;
    } catch (error) {
      lastError = error;
      response = null;
    }
  }
  if (!response) throw lastError || new Error("Auth request failed.");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Auth request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function normalizeUsername(username) {
  return text(username).toLowerCase();
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashOfflinePassword(password, salt) {
  const input = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function rememberOfflineLogin(username, password, userInfo) {
  if (!crypto?.subtle || !crypto?.getRandomValues) return;
  const salt = randomHex();
  const passwordHash = await hashOfflinePassword(password, salt);
  localStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify({
    username: normalizeUsername(username),
    salt,
    passwordHash,
    user: userInfo || null,
    savedAt: new Date().toISOString()
  }));
}

async function offlineLogin(username, password) {
  if (!crypto?.subtle) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY) || "null");
    if (!cached || cached.username !== normalizeUsername(username)) return null;
    const passwordHash = await hashOfflinePassword(password, cached.salt);
    if (passwordHash !== cached.passwordHash) return null;
    return {
      token: `${OFFLINE_TOKEN_PREFIX}${Date.now()}`,
      user: cached.user || { username: cached.username, role: "admin" }
    };
  } catch {
    return null;
  }
}

function isOfflineToken(token = authToken) {
  return String(token || "").startsWith(OFFLINE_TOKEN_PREFIX);
}

function isNetworkAuthError(error) {
  return !error?.status;
}

function setAuth(token, userInfo) {
  authToken = token;
  authUser = userInfo || null;
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);
}

function clearAuth() {
  authToken = "";
  authUser = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function clearLocalAppData() {
  const prefixes = ["gstBill:", "paymentVoucher:", "outgoingChequeVoucher:"];
  Object.keys(localStorage).forEach(key => {
    if ([STORE_KEY, STORAGE_MODE_KEY, AUTH_TOKEN_KEY, OFFLINE_AUTH_KEY].includes(key) || prefixes.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  });
}

function clearLocalCashbookData() {
  const prefixes = ["gstBill:", "paymentVoucher:", "outgoingChequeVoucher:"];
  Object.keys(localStorage).forEach(key => {
    if (key === STORE_KEY || prefixes.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  });
}

function showAuthView(mode = "login") {
  const authView = $("#authView");
  if (!authView) return;
  document.body.classList.add("auth-required");
  authView.hidden = false;
  switchAuthMode(mode);
}

function hideAuthView() {
  const authView = $("#authView");
  document.body.classList.remove("auth-required");
  if (authView) authView.hidden = true;
}

function switchAuthMode(mode) {
  const isSignup = mode === "signup";
  $("#loginForm")?.toggleAttribute("hidden", isSignup);
  $("#signupForm")?.toggleAttribute("hidden", !isSignup);
  $$(".auth-tab").forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
  const title = $("#authTitle");
  const subtitle = $("#authSubtitle");
  if (title) title.textContent = isSignup ? "Create Account" : "Login";
  if (subtitle) subtitle.textContent = isSignup ? "Create an admin account for this cashbook." : "Login to open your cashbook.";
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = normalizeUsername(form.username.value);
  const password = form.password.value;
  try {
    const result = await authRequest("/api/auth/login", {
      username,
      password
    });
    setAuth(result.token, result.user);
    await rememberOfflineLogin(username, password, result.user);
    toast("Login successful.");
    window.location.reload();
  } catch (error) {
    if (isNetworkAuthError(error)) {
      const offline = await offlineLogin(username, password);
      if (offline) {
        setAuth(offline.token, offline.user);
        toast("Offline login successful.");
        window.location.reload();
        return;
      }
      toast("Server is not reachable. Login online once before using offline login.");
      return;
    }
    toast(error.message || "Login failed.");
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.password.value !== form.confirmPassword.value) {
    toast("Passwords do not match.");
    return;
  }
  try {
    const username = normalizeUsername(form.username.value);
    const password = form.password.value;
    const result = await authRequest("/api/auth/signup", {
      name: text(form.name.value),
      username,
      password
    });
    setAuth(result.token, result.user);
    await rememberOfflineLogin(username, password, result.user);
    toast("Account created.");
    window.location.reload();
  } catch (error) {
    toast(error.message || "Signup failed.");
  }
}

function bindAuthForms() {
  $$(".auth-tab").forEach(button => {
    button.addEventListener("click", () => switchAuthMode(button.dataset.authMode));
  });
  $("#loginForm")?.addEventListener("submit", withBusySubmit(handleLogin, "Logging in..."));
  $("#signupForm")?.addEventListener("submit", withBusySubmit(handleSignup, "Creating..."));
  $("#logoutBtn")?.addEventListener("click", () => {
    clearLocalAppData();
    window.location.reload();
  });
}

async function apiCreate(collection, record) {
  if (!apiAvailable) return null;
  return apiRequest(`/api/${collection}`, {
    method: "POST",
    body: JSON.stringify(record)
  });
}

async function apiPatch(collection, id, updates) {
  if (!apiAvailable || !id) return null;
  return apiRequest(`/api/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}

async function apiDelete(collection, id) {
  if (!apiAvailable || !id) return null;
  return apiRequest(`/api/${collection}/${id}`, { method: "DELETE" });
}

async function apiSaveSetting(key, value) {
  if (!apiAvailable) return null;
  return apiRequest(`/api/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  });
}

async function apiActionLockStatus() {
  if (!apiAvailable) return null;
  return apiRequest("/api/action-lock");
}

async function apiSaveActionLockPassword(password) {
  if (!apiAvailable) return null;
  return apiRequest("/api/action-lock", {
    method: "PUT",
    body: JSON.stringify({ password })
  });
}

async function apiVerifyActionLockPassword(password) {
  if (!apiAvailable) return null;
  return apiRequest("/api/action-lock/verify", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

async function apiListUsers() {
  if (!apiAvailable) return [];
  return apiRequest("/api/auth/users");
}

async function apiSetUserBlocked(id, blocked) {
  if (!apiAvailable || !id) return null;
  return apiRequest(`/api/auth/users/${encodeURIComponent(id)}/block`, {
    method: "PATCH",
    body: JSON.stringify({ blocked })
  });
}

async function apiSetUserPassword(id, password) {
  if (!apiAvailable || !id) return null;
  return apiRequest(`/api/auth/users/${encodeURIComponent(id)}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password })
  });
}

async function apiChangeOwnPassword(currentPassword, newPassword) {
  if (!apiAvailable) return null;
  return apiRequest("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

async function refreshAuditLogsFromServer() {
  if (!apiAvailable) return;
  try {
    seed.auditLogs = await apiRequest("/api/auditLogs?limit=1000");
    invalidateDataCache();
  } catch {
    seed.auditLogs = seed.auditLogs || [];
  }
}

function auditRecordId(collection, row = {}) {
  return text(row._id || row.id || row.memo || row.chequeNo || row.name || row.key || row.title);
}

function auditLabel(collection, row = {}) {
  if (collection === "transactions") return [row.memo, row.party].map(text).filter(Boolean).join(" - ");
  if (collection === "dues") return [row.memo, row.name].map(text).filter(Boolean).join(" - ");
  if (collection === "customers") return [row.id, row.name].map(text).filter(Boolean).join(" - ");
  if (collection === "cheques") return [row.chequeNo, row.customer].map(text).filter(Boolean).join(" - ");
  if (collection === "outgoingCheques") return [row.chequeNo, row.supplier].map(text).filter(Boolean).join(" - ");
  if (collection === "items") return text(row.name);
  if (collection === "notes") return [row.date, row.title].map(text).filter(Boolean).join(" - ");
  if (collection === "settings") return text(row.key);
  return auditRecordId(collection, row);
}

function auditTargetCollection(row = {}) {
  return text(row.targetCollection || row.collection);
}

function recordLocalAudit({ action, collection, before = null, after = null, recordId = "" }) {
  if (apiAvailable || collection === "auditLogs") return;
  user.auditLogs = user.auditLogs || [];
  user.auditLogs.unshift({
    _id: `AUDIT-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    targetCollection: collection,
    recordId: recordId || auditRecordId(collection, after || before || {}),
    label: auditLabel(collection, after || before || {}),
    username: authUser?.username || authUser?.name || "local user",
    before,
    after,
    createdAt: new Date().toISOString(),
    source: "browser"
  });
  user.auditLogs = user.auditLogs.slice(0, 1000);
}

