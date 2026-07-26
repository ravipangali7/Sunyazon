import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Building2,
  Users,
  KeyRound,
  Settings,
  Landmark,
  ShieldCheck,
  ScrollText,
  Sparkles,
  LayoutDashboard,
  LogOut,
  ArrowRight,
  Factory,
  Truck,
  Warehouse,
  Store,
  UserCircle,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { resolveModuleIcon } from "@/lib/modules";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [
      { title: "Super Admin — Sunyazon BEOS" },
      { name: "description", content: "Platform control center for all companies, users, roles and settings." },
    ],
  }),
  component: SuperAdminDashboard,
});

const MANAGEMENT = [
  {
    to: "/super-admin/companies",
    label: "Companies",
    desc: "Manufacturers, distributors, wholesalers, retailers",
    icon: Building2,
    color: "#0EA5E9",
  },
  {
    to: "/super-admin/users",
    label: "Users",
    desc: "All platform accounts across account types",
    icon: Users,
    color: "#8B5CF6",
  },
  {
    to: "/super-admin/roles",
    label: "Roles & Permissions",
    desc: "Global role matrix and module access",
    icon: KeyRound,
    color: "#10B981",
  },
  {
    to: "/super-admin/settings",
    label: "System Settings",
    desc: "Platform configuration and tenants",
    icon: Settings,
    color: "#64748B",
  },
] as const;

const ACTOR_TYPES = [
  { label: "Producers", icon: Factory, hint: "Plant & manufacture orgs" },
  { label: "Distributors", icon: Truck, hint: "Depot & dealer networks" },
  { label: "Wholesalers", icon: Warehouse, hint: "Wholesale stock & credit" },
  { label: "Retailers", icon: Store, hint: "POS & shelf operations" },
  { label: "Consumers", icon: UserCircle, hint: "Social + commerce users" },
] as const;

function SuperAdminDashboard() {
  const { user, loading, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { resolved, setTheme } = useTheme();

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
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
        Loading Super Admin…
      </div>
    );
  }

  const otherModules = user.portal.modules.filter(
    (m) => !["super_admin", "companies", "platform_users", "platform_roles", "system_settings"].includes(m.code),
  );

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(242,92,5,0.2), transparent 60%)," +
            "radial-gradient(ellipse 40% 30% at 100% 80%, rgba(14,165,233,0.08), transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-border bg-background/80 backdrop-blur sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl grid place-items-center font-black text-sm shrink-0"
            style={{ background: "linear-gradient(135deg, #F25C05, #FF8A3D)", color: "#111" }}
          >
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold leading-tight truncate flex items-center gap-2">
              Super Admin
              <ShieldCheck className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {user.full_name} · Platform control center
            </div>
          </div>
          <button
            onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary"
            aria-label="Toggle theme"
          >
            {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={async () => {
              await logout();
              void navigate({ to: "/login" });
            }}
            className="h-9 px-3 rounded-lg text-sm flex items-center gap-1.5 hover:bg-secondary text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Platform overview
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Manage the entire ecosystem
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Full access to companies, manufacturers, distributors, wholesalers, retailers, consumers,
            users, roles, permissions, and system settings.
          </p>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
          {ACTOR_TYPES.map((a) => (
            <div key={a.label} className="rounded-xl border border-border bg-card p-4">
              <a.icon className="h-5 w-5 mb-2" style={{ color: "var(--color-primary)" }} />
              <div className="text-sm font-semibold">{a.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{a.hint}</div>
            </div>
          ))}
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">
            Management
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {MANAGEMENT.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-[color:var(--color-primary)] transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-12 w-12 rounded-xl grid place-items-center shrink-0"
                    style={{ backgroundColor: `${item.color}22`, color: item.color }}
                  >
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      {item.label}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">
            Governance tools
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { to: "/governance", label: "Governance", icon: Landmark },
              { to: "/admin", label: "Admin & RBAC", icon: ShieldCheck },
              { to: "/audit", label: "Audit Log", icon: ScrollText },
              { to: "/copilot", label: "AI Copilot", icon: Sparkles },
            ].map((g) => (
              <Link
                key={g.to}
                to={g.to}
                className="rounded-xl border border-border bg-card p-4 hover:bg-secondary transition-colors flex items-center gap-3"
              >
                <g.icon className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                <span className="text-sm font-medium">{g.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {otherModules.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Platform modules
              </h2>
              <Link to="/apps" className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                Open launcher
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {otherModules.map((m) => {
                const Icon = resolveModuleIcon(m.icon);
                return (
                  <Link
                    key={m.code}
                    to={m.route_path}
                    className="rounded-xl border border-border bg-card p-4 hover:border-[color:var(--color-primary)] transition-colors"
                  >
                    <div
                      className="h-10 w-10 rounded-lg grid place-items-center mb-2"
                      style={{ backgroundColor: `${m.color}22`, color: m.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold">{m.name}</div>
                  </Link>
                );
              })}
              <Link
                to="/"
                className="rounded-xl border border-border bg-card p-4 hover:border-[color:var(--color-primary)] transition-colors"
              >
                <div
                  className="h-10 w-10 rounded-lg grid place-items-center mb-2"
                  style={{ backgroundColor: "rgba(242,92,5,0.12)", color: "var(--color-primary)" }}
                >
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div className="text-sm font-semibold">Executive view</div>
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
