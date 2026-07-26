import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  Building2,
  Users,
  KeyRound,
  Settings,
  ShieldCheck,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/super-admin", label: "Overview", exact: true },
  { to: "/super-admin/companies", label: "Companies", icon: Building2 },
  { to: "/super-admin/users", label: "Users", icon: Users },
  { to: "/super-admin/roles", label: "Roles", icon: KeyRound },
  { to: "/super-admin/settings", label: "Settings", icon: Settings },
] as const;

export function SuperAdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { user, loading, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    if (!isSuperAdmin) {
      void navigate({ to: user.portal.redirect_to || "/apps" });
    }
  }, [user, loading, isSuperAdmin, navigate]);

  if (loading || !user || !isSuperAdmin) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link
            to="/super-admin"
            className="h-8 w-8 rounded-lg grid place-items-center font-black text-sm"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          >
            S
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" style={{ color: "var(--color-primary)" }} />
              Super Admin
            </div>
            <div className="text-sm font-bold font-display truncate">{title}</div>
          </div>
          <button
            onClick={async () => {
              await logout();
              void navigate({ to: "/login" });
            }}
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto pb-2 no-scrollbar">
          {NAV.map((n) => {
            const active =
              "exact" in n && n.exact
                ? path === n.to
                : path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center ${
                  active ? "text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                }`}
                style={active ? { backgroundColor: "var(--color-primary)" } : undefined}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
        {path !== "/super-admin" && (
          <Link
            to="/super-admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
