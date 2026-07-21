import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogOut, LayoutGrid, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { groupModules, resolveModuleIcon } from "@/lib/modules";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/apps")({
  head: () => ({
    meta: [
      { title: "Apps — Sunyazon BEOS" },
      { name: "description", content: "Odoo-style module launcher for your assigned apps." },
    ],
  }),
  component: AppsLauncher,
});

function AppsLauncher() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { resolved, setTheme } = useTheme();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    // Single-module staff should never linger on the grid
    if (!user.portal.show_module_launcher && user.portal.modules.length === 1) {
      void navigate({ to: user.portal.redirect_to });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
        Loading apps…
      </div>
    );
  }

  const groups = groupModules(user.portal.modules);
  const sections = [
    { key: "workspace", label: "Workspace" },
    { key: "consumer", label: "Consumer" },
    { key: "admin", label: "Administration" },
    { key: "system", label: "System" },
  ].filter((s) => (groups[s.key] || []).length > 0);

  const roleLabel =
    user.account_type === "super_admin"
      ? "Super Admin"
      : user.membership?.role_kind === "admin"
        ? `${titleCase(user.account_type)} Admin`
        : user.membership?.designation || titleCase(user.portal.role_kind);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(242,92,5,0.16), transparent 60%)," +
            "radial-gradient(ellipse 50% 30% at 100% 100%, rgba(255,111,31,0.08), transparent 50%)",
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
            <div className="font-display font-bold leading-tight truncate">Sunyazon Apps</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {user.full_name} · {roleLabel}
              {user.portal.organization_name ? ` · ${user.portal.organization_name}` : ""}
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
            className="h-9 px-3 rounded-lg text-sm flex items-center gap-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8 animate-in fade-in duration-500">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            <LayoutGrid className="h-3.5 w-3.5" style={{ color: "var(--color-primary)" }} />
            Module launcher
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Choose an app
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Open a dashboard for any module you have access to. Click a box to enter its workspace.
          </p>
        </div>

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No modules assigned. Ask your admin for access.
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="mb-10 last:mb-0">
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">
                {section.label}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {(groups[section.key] || []).map((mod, i) => {
                  const Icon = resolveModuleIcon(mod.icon);
                  return (
                    <Link
                      key={mod.code}
                      to={mod.route_path}
                      className="group relative rounded-2xl border border-border bg-card p-4 sm:p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[color:var(--color-primary)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
                      style={{
                        animationDelay: `${i * 40}ms`,
                      }}
                    >
                      <div
                        className="h-12 w-12 rounded-xl grid place-items-center mb-3 transition-transform duration-200 group-hover:scale-105"
                        style={{
                          backgroundColor: `${mod.color}22`,
                          color: mod.color,
                        }}
                      >
                        <Icon className="h-6 w-6" strokeWidth={2.1} />
                      </div>
                      <div className="font-semibold text-sm leading-tight pr-4">{mod.name}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                        {mod.description || mod.code}
                      </div>
                      <ChevronRight className="absolute top-4 right-3 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
