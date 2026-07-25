import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Search, Sun, Moon, Bell, ChevronDown, X, Sparkles, Command, Building2, LayoutGrid, LogOut, ShieldCheck, ArrowLeft, LayoutDashboard } from "lucide-react";
import {
  PRIMARY_NAV, WORKSPACE_NAV, CONSUMER_NAV, ADMIN_NAV, SYSTEM_NAV, MORE_NAV, ALL_NAV,
  type NavItem,
} from "./nav-items";
import { useTheme } from "../theme-provider";
import { useAuth } from "@/lib/auth";
import { groupModules, modulesToNav, resolveModuleIcon } from "@/lib/modules";
import { resolveDepartmentScope, type DepartmentScope } from "@/lib/department-menus";
import { useMenus, useGlobalSearch } from "@/hooks/use-enterprise";

function isSuperAdminUser(user: ReturnType<typeof useAuth>["user"]) {
  return !!user && (user.account_type === "super_admin" || user.is_superuser || user.portal?.portal === "super_admin");
}

export function AppShell({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DesktopSidebar />
      <MobileTopBar title={title} onSearch={() => setPaletteOpen(true)} />
      <div className="lg:pl-64">
        <DesktopTopBar title={title} subtitle={subtitle} actions={actions} onSearch={() => setPaletteOpen(true)} />
        <main className="pb-24 lg:pb-10 pt-3 lg:pt-0">
          <div className="px-4 lg:px-8 lg:py-6 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
      <MobileBottomNav />
      <CopilotFab />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/** Split a DB menu route like "/crm#pipeline" into path + hash. */
function splitMenuRoute(route: string): { to: string; hash?: string } {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const idx = normalized.indexOf("#");
  if (idx === -1) return { to: normalized };
  return { to: normalized.slice(0, idx), hash: normalized.slice(idx + 1) || undefined };
}

function useScopedNav() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const department = resolveDepartmentScope(path);
  const { data: menuTree } = useMenus();

  return useMemo(() => {
    const superAdmin = isSuperAdminUser(user);
    const appsLauncherItem: NavItem = {
      to: "/apps",
      label: superAdmin ? "Super Admin" : "All Apps",
      icon: superAdmin ? ShieldCheck : LayoutGrid,
    };
    // Regular users reach the apps launcher via the topbar AppSwitcher, not the sidebar.
    const systemBase: NavItem[] = superAdmin ? [appsLauncherItem] : [];

    // Prefer database-driven menus when available
    const dbNav: NavItem[] = (menuTree || [])
      .filter((m) => m.route)
      .map((m) => {
        const { to, hash: itemHash } = splitMenuRoute(m.route);
        return { to, hash: itemHash, label: m.name, icon: resolveModuleIcon(m.icon) };
      });

    // Inside a department dashboard → only that department’s menus
    if (department) {
      // Prefer the DB-driven MenuItem tree (seed_menus) for this department;
      // fall back to the static catalog when the DB has no children yet.
      const dbRoot = (menuTree || []).find((m) => {
        const { to } = m.route ? splitMenuRoute(m.route) : { to: "" };
        return to === department.home && (m.children?.length || 0) > 0;
      });
      const deptNav: NavItem[] = dbRoot
        ? dbRoot.children
            .filter((c) => c.route)
            .map((c) => {
              const { to, hash: itemHash } = splitMenuRoute(c.route);
              return { to, hash: itemHash, label: c.name, icon: resolveModuleIcon(c.icon) };
            })
        : department.items.map((n) => ({
            to: n.to,
            label: n.label,
            icon: n.icon,
            hash: n.hash,
          }));
      const backHome: NavItem = {
        to: "/",
        label: "Work Center",
        icon: ArrowLeft,
      };
      const primary: NavItem[] = [
        deptNav[0],
        ...deptNav.slice(1, 3),
        { to: "/apps", label: "Apps", icon: LayoutGrid },
        { to: "/more", label: "More", icon: LayoutGrid },
      ].filter(Boolean) as NavItem[];

      return {
        workspace: deptNav,
        consumer: [] as NavItem[],
        admin: [] as NavItem[],
        system: systemBase,
        more: [...deptNav.slice(3), appsLauncherItem],
        all: [...deptNav, appsLauncherItem, backHome],
        primary,
        department,
        hash,
        groupLabel: department.groupLabel,
      };
    }

    if (dbNav.length > 0) {
      const byPath = new Set(dbNav.map((n) => n.to));
      const workspace = dbNav.filter((n) => !["/notifications", "/settings"].includes(n.to));
      const systemExtra = dbNav.filter((n) => ["/notifications", "/settings"].includes(n.to));
      const system = [...systemBase, ...systemExtra];
      const primary = [
        dbNav.find((n) => n.to === "/") || { to: "/", label: "Dashboard", icon: LayoutDashboard },
        ...dbNav.filter((n) => n.to !== "/").slice(0, 3),
        { to: "/more", label: "More", icon: LayoutGrid },
      ] as NavItem[];
      return {
        workspace: workspace.length ? workspace : dbNav,
        consumer: [] as NavItem[],
        admin: [] as NavItem[],
        system,
        more: dbNav.filter((n) => !primary.some((p) => p.to === n.to)),
        all: [...dbNav, appsLauncherItem],
        primary,
        department: null as DepartmentScope | null,
        hash,
        groupLabel: "Workspace",
        _byPath: byPath,
      };
    }

    if (!user?.portal?.modules?.length) {
      return {
        workspace: WORKSPACE_NAV,
        consumer: CONSUMER_NAV,
        admin: ADMIN_NAV,
        system: SYSTEM_NAV,
        more: MORE_NAV,
        all: ALL_NAV,
        primary: PRIMARY_NAV as unknown as NavItem[],
        department: null as DepartmentScope | null,
        hash,
        groupLabel: "Workspace",
      };
    }
    const allowed = modulesToNav(user.portal.modules);
    const byPath = new Set(allowed.map((n) => n.to));
    const filter = (items: NavItem[]) => items.filter((n) => byPath.has(n.to) || n.to === "/");
    const workspace = filter(WORKSPACE_NAV);
    const consumer = filter(CONSUMER_NAV);
    const admin = filter(ADMIN_NAV);
    const system: NavItem[] = [...systemBase, ...SYSTEM_NAV.filter((n) => byPath.has(n.to) || n.to === "/settings" || n.to === "/notifications")];
    const primaryBase = PRIMARY_NAV.map((p) => ({ ...p, icon: p.icon })) as NavItem[];
    const primary = primaryBase.filter((n) => n.to === "/more" || byPath.has(n.to) || n.to === "/");
    const more = [...workspace, ...consumer, ...admin, ...system].filter(
      (n, i, arr) => arr.findIndex((x) => x.to === n.to) === i && !primary.some((p) => p.to === n.to && p.to !== "/more"),
    );
    return {
      workspace: workspace.length ? workspace : allowed.filter((n) => n.to.startsWith("/") && !n.to.startsWith("/feed")),
      consumer,
      admin,
      system,
      more,
      all: allowed.length ? [...allowed, ...system, appsLauncherItem] : ALL_NAV,
      primary: primary.length >= 2 ? primary : ([
        { to: "/", label: "Home", icon: PRIMARY_NAV[0].icon },
        ...allowed.slice(0, 3),
        { to: "/more", label: "More", icon: LayoutGrid },
      ] as NavItem[]),
      department: null as DepartmentScope | null,
      hash,
      groupLabel: "Workspace",
    };
  }, [user, path, hash, department, menuTree]);
}

function DesktopSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useScopedNav();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const superAdmin = isSuperAdminUser(user);
  const initials = (user?.full_name || "U")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const scoped = !!nav.department;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar border-r border-sidebar-border z-30">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border shrink-0">
        <Link to="/apps" className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-black text-sm" title={superAdmin ? "Back to Super Admin dashboard" : "Apps"}>S</Link>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold leading-tight">Sunyazon</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {scoped ? nav.department!.label : superAdmin ? "Super Admin" : "BEOS"}
          </div>
        </div>
      </div>
      <OrgSwitcher department={nav.department} />
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
        {nav.workspace.length > 0 && (
          <NavGroup label={nav.groupLabel} items={nav.workspace} path={path} hash={nav.hash} />
        )}
        {!scoped && nav.consumer.length > 0 && (
          <NavGroup label="Consumer" items={nav.consumer} path={path} hash={nav.hash} />
        )}
        {!scoped && nav.admin.length > 0 && (
          <NavGroup label="Admin" items={nav.admin} path={path} hash={nav.hash} />
        )}
        {nav.system.length > 0 && (
          <NavGroup label="System" items={nav.system} path={path} hash={nav.hash} />
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 rounded-lg p-2 bg-sidebar-accent/40">
          <div className="h-9 w-9 rounded-full grid place-items-center font-semibold text-sm" style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user?.full_name || "Guest"}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {user?.membership?.designation || user?.account_type || "Preview"}
              {user?.portal.organization_name ? ` · ${user.portal.organization_name}` : ""}
            </div>
          </div>
          {user ? (
            <button
              title="Sign out"
              onClick={async () => {
                await logout();
                void navigate({ to: "/login" });
              }}
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-sidebar-accent text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Link to="/login" className="text-[11px] font-semibold text-primary px-1">Login</Link>
          )}
        </div>
      </div>
    </aside>
  );
}

function navItemKey(item: NavItem) {
  return item.hash ? `${item.to}#${item.hash}` : `${item.to}:${item.label}`;
}

function isNavActive(item: NavItem, path: string, hash: string) {
  const currentHash = (hash || "").replace(/^#/, "");
  if (path !== item.to) {
    // Nested child routes under a module home (no hash items)
    if (item.to !== "/" && path.startsWith(`${item.to}/`) && !item.hash) return true;
    return false;
  }
  if (item.hash) return currentHash === item.hash;
  return !currentHash;
}

function NavGroup({
  label,
  items,
  path,
  hash,
}: {
  label: string;
  items: NavItem[];
  path: string;
  hash: string;
}) {
  return (
    <>
      <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      {items.map((n) => (
        <NavLink key={navItemKey(n)} item={n} path={path} hash={hash} />
      ))}
    </>
  );
}

function NavLink({ item, path, hash }: { item: NavItem; path: string; hash: string }) {
  const active = isNavActive(item, path, hash);
  return (
    <Link
      to={item.to}
      hash={item.hash ?? ""}
      activeOptions={{ exact: true, includeHash: true }}
      data-status={active ? "active" : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "text-primary-foreground font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
      style={active ? { backgroundColor: "var(--color-primary)" } : undefined}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function OrgSwitcher({ department }: { department: DepartmentScope | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const superAdmin = isSuperAdminUser(user);
  const orgName = user?.portal.organization_name || user?.membership?.organization_name || "Sunyazon · Preview";
  return (
    <div className="relative px-3 py-2 border-b border-sidebar-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg bg-sidebar-accent/60 hover:bg-sidebar-accent px-2.5 py-2 text-left"
      >
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {department ? "Department" : "Organization"}
          </div>
          <div className="text-xs font-semibold truncate">
            {department ? department.groupLabel : orgName}
          </div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-40 rounded-lg bg-popover border border-border shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-xs">{orgName}</div>
          {department && (
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2 border-t border-border"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Work Center
            </Link>
          )}
          <Link
            to="/apps"
            onClick={() => setOpen(false)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2 border-t border-border"
          >
            {superAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            {superAdmin ? "Back to Super Admin dashboard" : "Open apps launcher"}
          </Link>
        </div>
      )}
    </div>
  );
}

function DesktopTopBar({ title, subtitle, actions, onSearch }: {
  title: string; subtitle?: string; actions?: ReactNode; onSearch: () => void;
}) {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const superAdmin = isSuperAdminUser(user);
  const showSuperAdminHome = superAdmin && path !== "/apps";

  return (
    <header className="hidden lg:flex sticky top-0 z-20 h-16 items-center gap-4 border-b border-border bg-background/80 backdrop-blur px-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold font-display leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {showSuperAdminHome && (
        <Link
          to="/apps"
          className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-border hover:bg-secondary shrink-0"
          title="Back to Super Admin dashboard"
        >
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--color-primary)" }} />
          Super Admin
        </Link>
      )}
      <button
        onClick={onSearch}
        className="relative w-80 h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm text-left text-muted-foreground border border-transparent hover:border-border transition-colors flex items-center"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
        <span className="flex-1">Search work, people, batches…</span>
        <kbd className="hidden xl:inline-flex items-center gap-0.5 text-[10px] font-mono border border-border rounded px-1.5 py-0.5">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>
      <AppSwitcher />
      <ThemeToggle />
      <Link to="/notifications" className="relative h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />
      </Link>
      {actions}
    </header>
  );
}

function AppSwitcher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const modules = user?.portal?.modules;

  const sections = useMemo(() => {
    if (modules?.length) {
      const groups = groupModules(modules);
      return [
        { key: "workspace", label: "Workspace" },
        { key: "consumer", label: "Consumer" },
        { key: "admin", label: "Administration" },
        { key: "system", label: "System" },
      ]
        .map((s) => ({
          label: s.label,
          items: (groups[s.key] || []).map((m) => ({
            key: m.code,
            to: m.route_path,
            label: m.name,
            icon: resolveModuleIcon(m.icon),
            color: m.color as string | undefined,
          })),
        }))
        .filter((s) => s.items.length > 0);
    }
    // Preview / no assigned modules — fall back to the static catalog
    const toItems = (items: NavItem[]) =>
      items.map((n) => ({ key: n.to, to: n.to, label: n.label, icon: n.icon, color: undefined as string | undefined }));
    return [
      { label: "Workspace", items: toItems(WORKSPACE_NAV) },
      { label: "Consumer", items: toItems(CONSUMER_NAV) },
      { label: "Administration", items: toItems(ADMIN_NAV) },
    ];
  }, [modules]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="All Apps"
        aria-label="All Apps"
        aria-expanded={open}
        className={`h-9 w-9 grid place-items-center rounded-lg transition-colors ${
          open ? "bg-secondary" : "hover:bg-secondary"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[22rem] rounded-xl bg-popover border border-border shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-border">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">All Apps</span>
              <Link
                to="/apps"
                onClick={() => setOpen(false)}
                className="text-[11px] font-semibold hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                Open launcher
              </Link>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {sections.map((s) => (
                <div key={s.label} className="mb-3 last:mb-0">
                  <div className="px-1 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {s.label}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {s.items.map((it) => (
                      <Link
                        key={it.key}
                        to={it.to}
                        onClick={() => setOpen(false)}
                        className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 hover:bg-secondary transition-colors"
                      >
                        <span
                          className="h-9 w-9 rounded-lg grid place-items-center"
                          style={
                            it.color
                              ? { backgroundColor: `${it.color}22`, color: it.color }
                              : { backgroundColor: "var(--color-secondary)" }
                          }
                        >
                          <it.icon className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <span className="text-[11px] font-medium text-center leading-tight truncate w-full">
                          {it.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MobileTopBar({ title, onSearch }: { title: string; onSearch: () => void }) {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showSuperAdminHome = isSuperAdminUser(user) && path !== "/apps";

  return (
    <header className="lg:hidden sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
      <div className="flex items-center h-14 px-4 gap-3">
        <Link
          to={showSuperAdminHome ? "/apps" : "/"}
          className="h-8 w-8 rounded-lg grid place-items-center font-black text-sm shrink-0"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          title={showSuperAdminHome ? "Back to Super Admin dashboard" : undefined}
        >
          S
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground leading-none">
            {showSuperAdminHome ? "Super Admin" : "Sunyazon"}
          </div>
          <div className="text-base font-bold font-display leading-tight truncate">{title}</div>
        </div>
        {showSuperAdminHome && (
          <Link
            to="/apps"
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary"
            aria-label="Back to Super Admin dashboard"
            title="Back to Super Admin dashboard"
          >
            <ShieldCheck className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
          </Link>
        )}
        <button onClick={onSearch} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary" aria-label="Search">
          <Search className="h-4 w-4" />
        </button>
        <Link to="/apps" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary" aria-label="All Apps" title="All Apps">
          <LayoutGrid className="h-4 w-4" />
        </Link>
        <ThemeToggle />
        <Link to="/notifications" className="relative h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />
        </Link>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const [openMore, setOpenMore] = useState(false);
  const nav = useScopedNav();
  const primary = nav.primary.slice(0, 5);
  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5 h-16">
          {primary.map((n) => {
            const isMore = n.to === "/more" || n.label === "More";
            const active = isMore ? false : isNavActive(n, path, hash);
            const color = active ? "var(--color-primary)" : "var(--color-muted-foreground)";
            return (
              <Link
                key={navItemKey(n)}
                to={isMore ? "/" : n.to}
                hash={isMore ? undefined : n.hash}
                onClick={(e) => {
                  if (isMore) {
                    e.preventDefault();
                    setOpenMore(true);
                  }
                }}
                className="flex flex-col items-center justify-center gap-1 relative"
              >
                <n.icon className="h-5 w-5" style={{ color }} strokeWidth={active ? 2.4 : 1.8} />
                <span className="text-[10px] font-medium" style={{ color }}>{n.label}</span>
                {active && (<span className="absolute top-1 h-1 w-6 rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />)}
              </Link>
            );
          })}
        </div>
      </nav>
      {openMore && <MoreSheet onClose={() => setOpenMore(false)} />}
    </>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const nav = useScopedNav();
  const scoped = !!nav.department;
  const groups: Array<{ label: string; items: NavItem[] }> = [
    { label: nav.groupLabel, items: nav.workspace },
    ...(!scoped
      ? [
          { label: "Consumer", items: nav.consumer },
          { label: "Admin", items: nav.admin },
        ]
      : []),
    { label: "System", items: nav.system },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 rounded-t-2xl bg-card border-t border-x border-border p-4 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold font-display">
            {scoped ? nav.department!.label : "Modules"}
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.label} className="mb-4 last:mb-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{g.label}</div>
            <div className="grid grid-cols-3 gap-3">
              {g.items.map((n) => {
                const active = isNavActive(n, path, hash);
                return (
                  <Link
                    key={navItemKey(n)}
                    to={n.to}
                    hash={n.hash}
                    onClick={onClose}
                    className="flex flex-col items-center gap-2 rounded-xl p-3 transition-colors"
                    style={active
                      ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }
                      : { backgroundColor: "var(--color-secondary)", color: "var(--color-foreground)" }}
                  >
                    <n.icon className="h-5 w-5" strokeWidth={2.2} />
                    <span className="text-[11px] font-medium text-center">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const scoped = useScopedNav();
  const { data: searchData } = useGlobalSearch(q);
  const navResults = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return scoped.all.slice(0, 8);
    return scoped.all.filter((n) => n.label.toLowerCase().includes(s) || n.to.includes(s)).slice(0, 10);
  }, [q, scoped.all]);
  const recordResults = searchData?.results || [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-2xl bg-popover border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks, users, projects, menus…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {navResults.length === 0 && recordResults.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            <>
              {navResults.map((n) => (
                <button
                  key={navItemKey(n)}
                  onClick={() => { nav({ to: n.to, hash: n.hash }); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left hover:bg-secondary"
                >
                  <n.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{n.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {n.hash ? `${n.to}#${n.hash}` : n.to}
                  </span>
                </button>
              ))}
              {recordResults.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { nav({ to: r.route || "/tasks" }); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left hover:bg-secondary"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.type} · {r.subtitle}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CopilotFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="AI Copilot"
        className="fixed z-30 h-12 w-12 rounded-full grid place-items-center shadow-xl transition-transform hover:scale-105"
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom))",
          right: "1rem",
          background: "linear-gradient(135deg, var(--color-primary), #FFB347)",
          color: "var(--color-primary-foreground)",
        }}
      >
        <Sparkles className="h-5 w-5" />
      </button>
      {open && <CopilotSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function CopilotSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const firstName = user?.full_name?.split(" ")[0] || "there";
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl bg-card border border-border p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-full grid place-items-center" style={{ background: "linear-gradient(135deg, var(--color-primary), #FFB347)", color: "var(--color-primary-foreground)" }}>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="font-display font-bold">BEOS Copilot</div>
            <div className="text-[11px] text-muted-foreground">Ask about work, KPIs, batches, people.</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-xl bg-secondary/60 p-3 text-sm mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Copilot</div>
          Hi {firstName} — connect an AI endpoint to triage tasks and summarize live KPIs. Local typing only until then.
        </div>
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground mb-4 text-center">
          Connect AI endpoint
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Ask Copilot…"
            className="flex-1 h-10 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
          />
          <button className="h-10 px-4 rounded-lg text-sm font-semibold" style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}>Ask</button>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="grid place-items-center rounded-lg hover:bg-secondary transition-colors h-9 w-9"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
