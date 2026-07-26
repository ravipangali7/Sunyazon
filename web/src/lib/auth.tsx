import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiFetch, getToken, setTokens, setToken } from "./api";

export type ModuleAccess = {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  route_path: string;
  category: string;
  access_level?: string;
  actions?: Record<string, boolean>;
};

export type PortalInfo = {
  portal: string;
  redirect_to: string;
  show_module_launcher: boolean;
  role_kind: string;
  account_type: string;
  organization_id?: string | null;
  organization_name?: string | null;
  modules: ModuleAccess[];
};

export type AuthUser = {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  account_type: string;
  platform_role: string;
  is_superuser: boolean;
  membership: {
    id: string;
    organization_id: string;
    organization_name: string;
    role_kind: string;
    role_name: string | null;
    designation: string;
    is_primary_admin: boolean;
  } | null;
  portal: PortalInfo;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string, remember?: boolean) => Promise<AuthUser>;
  register: (payload: {
    full_name: string;
    phone: string;
    email?: string;
    password: string;
    password_confirm: string;
    account_type?: string;
  }) => Promise<AuthUser & { needs_company_registration?: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasModule: (code: string) => boolean;
  can: (moduleCode: string, action?: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

function applyAuthTokens(res: {
  token?: string;
  access_token?: string;
  refresh_token?: string;
}, remember: boolean) {
  const access = res.access_token || res.token;
  if (access) setTokens(access, res.refresh_token || null, remember);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<AuthUser>("/auth/me/");
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setTokens(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (phone: string, password: string, remember = true) => {
    const res = await apiFetch<{
      token: string;
      access_token?: string;
      refresh_token?: string;
      user: AuthUser;
    }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ phone, password, remember }),
    });
    applyAuthTokens(res, remember);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (payload: {
      full_name: string;
      phone: string;
      email?: string;
      password: string;
      password_confirm: string;
      account_type?: string;
    }) => {
      const res = await apiFetch<{
        token: string;
        access_token?: string;
        refresh_token?: string;
        user: AuthUser;
        needs_company_registration?: boolean;
      }>("/auth/register/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      applyAuthTokens(res, true);
      setUser(res.user);
      return { ...res.user, needs_company_registration: res.needs_company_registration };
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (getToken()) await apiFetch("/auth/logout/", { method: "POST" });
    } catch {
      /* ignore */
    }
    setTokens(null);
    setToken(null);
    setUser(null);
  }, []);

  const hasModule = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.is_superuser || user.account_type === "super_admin") return true;
      if (user.membership?.role_kind === "admin" || user.membership?.is_primary_admin) return true;
      return user.portal.modules.some((m) => m.code === code);
    },
    [user],
  );

  const can = useCallback(
    (moduleCode: string, action = "view") => {
      if (!user) return false;
      if (user.is_superuser || user.account_type === "super_admin") return true;
      if (user.membership?.role_kind === "admin" || user.membership?.is_primary_admin) return true;
      const mod = user.portal.modules.find((m) => m.code === moduleCode);
      if (!mod) return false;
      if (mod.actions && action in mod.actions) return !!mod.actions[action];
      if (mod.access_level === "F") return true;
      if (mod.access_level === "R") return action === "view" || action === "export" || action === "print";
      return action === "view";
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, hasModule, can }),
    [user, loading, login, register, logout, refresh, hasModule, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
