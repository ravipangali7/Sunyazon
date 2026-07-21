/** API client for Sunyazon BEOS backend — JWT access + refresh tokens. */

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  "http://127.0.0.1:8000/api";

const TOKEN_KEY = "beos_token";
const REFRESH_KEY = "beos_refresh";
const REMEMBER_KEY = "beos_remember";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY);
}

export function isRemembered(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REMEMBER_KEY) === "1";
}

function storageForRemember(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

export function setTokens(
  access: string | null,
  refresh: string | null = null,
  remember?: boolean,
) {
  if (typeof window === "undefined") return;
  const rem = remember ?? isRemembered();
  // Clear both stores first
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);

  if (!access) {
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  const store = storageForRemember(rem);
  store.setItem(TOKEN_KEY, access);
  if (refresh) store.setItem(REFRESH_KEY, refresh);
  if (rem) localStorage.setItem(REMEMBER_KEY, "1");
  else localStorage.removeItem(REMEMBER_KEY);
}

/** @deprecated use setTokens */
export function setToken(token: string | null) {
  if (!token) setTokens(null);
  else setTokens(token, getRefreshToken(), isRemembered());
}

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    code?: string,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      setTokens(null);
      return false;
    }
    const data = (await res.json()) as {
      token?: string;
      access_token?: string;
      refresh_token?: string;
    };
    const access = data.access_token || data.token;
    if (!access) {
      setTokens(null);
      return false;
    }
    setTokens(access, data.refresh_token || refresh, isRemembered());
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && options.body && !isForm) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !_retried && !path.includes("/auth/login") && !path.includes("/auth/refresh")) {
    if (!refreshPromise) refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
    const ok = await refreshPromise;
    if (ok) return apiFetch<T>(path, options, true);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const body = data as {
      detail?: string | string[];
      code?: string;
      errors?: Record<string, string[]>;
    } | null;
    const detail = Array.isArray(body?.detail)
      ? body.detail.join(" ")
      : body?.detail;
    throw new ApiError(
      detail || res.statusText || "Request failed",
      res.status,
      body?.code,
      body?.errors,
    );
  }
  return data as T;
}

export { API_BASE };
