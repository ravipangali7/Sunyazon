import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, ChevronRight, LayoutGrid, Search } from "lucide-react";
import type { ModuleAccess } from "@/lib/auth";
import {
  type PortalFeature,
  type PortalMeta,
  type PortalModule,
} from "@/lib/portal-catalog";
import { useDashboard } from "@/hooks/use-domain";

type Props = {
  meta: PortalMeta;
  userModules?: ModuleAccess[];
  orgName?: string | null;
  userName?: string;
};

function fmtKpi(key: string, raw: number | undefined): string {
  if (raw == null || Number.isNaN(raw)) return "—";
  if (key.includes("pct")) return `${raw}%`;
  if (key.includes("revenue") || key.includes("overdue") || key.includes("ap_")) {
    if (raw >= 1_000_000) return `Rs ${(raw / 1_000_000).toFixed(2)}M`;
    if (raw >= 1_000) return `Rs ${(raw / 1_000).toFixed(1)}K`;
    return `Rs ${raw}`;
  }
  if (raw >= 1000) return raw.toLocaleString();
  return String(raw);
}

export function PortalDashboard({ meta, userModules, orgName, userName }: Props) {
  const { data: dashboard, isLoading } = useDashboard();
  const modules = meta.modules;
  const grantedSet = useMemo(
    () => new Set(userModules?.map((m) => m.code) ?? []),
    [userModules],
  );
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(modules[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules;
    return modules
      .map((mod) => {
        const featureHits = mod.features.filter(
          (f) =>
            f.label.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q),
        );
        const moduleHit =
          mod.name.toLowerCase().includes(q) ||
          mod.description.toLowerCase().includes(q);
        if (!moduleHit && featureHits.length === 0) return null;
        return { ...mod, features: moduleHit && featureHits.length === 0 ? mod.features : featureHits.length ? featureHits : mod.features };
      })
      .filter(Boolean) as PortalModule[];
  }, [modules, query]);

  const Icon = meta.icon;
  const totalFeatures = modules.reduce((n, m) => n + m.features.length, 0);
  const kpiBag = dashboard?.kpi as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${meta.accent} 0%, #FF8A3D 100%)`,
          color: "#111",
        }}
      >
        <div className="flex items-start gap-4 relative z-10">
          <div className="h-12 w-12 rounded-xl bg-black/15 grid place-items-center shrink-0">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-bold opacity-70">
              Admin portal · {meta.type}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display mt-0.5">{meta.title}</h2>
            <p className="text-sm opacity-80 mt-1">{meta.subtitle}</p>
            {(orgName || userName) && (
              <p className="text-xs opacity-70 mt-2 truncate">
                {[userName, orgName].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/apps"
                className="h-9 px-4 rounded-lg bg-black/85 text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                Module launcher <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/"
                className="h-9 px-4 rounded-lg bg-white/25 backdrop-blur text-sm font-semibold inline-flex items-center gap-1.5"
              >
                My Work Center
              </Link>
            </div>
          </div>
        </div>
        <Icon className="absolute -right-4 -bottom-4 h-36 w-36 opacity-15" />
      </section>

      {/* KPI strip — live from /dashboard/ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {meta.kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              {kpi.label}
            </div>
            <div className="mt-1 text-xl font-bold font-display tracking-tight">
              {isLoading ? "…" : fmtKpi(kpi.key, kpiBag?.[kpi.key])}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{kpi.hint}</div>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <section className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="h-4 w-4 shrink-0" style={{ color: meta.accent }} />
          <div>
            <h3 className="text-sm font-semibold leading-tight">Business modules</h3>
            <p className="text-xs text-muted-foreground">
              {modules.length} modules · {totalFeatures} features · role-scoped for {meta.type}
            </p>
          </div>
        </div>
        <div className="relative sm:ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules or features…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]/40"
          />
        </div>
      </section>

      {/* Module cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No modules match “{query}”.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((mod, i) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              accent={meta.accent}
              hasAccess={
                grantedSet.size === 0 ||
                mod.moduleCodes.some((c) => grantedSet.has(c))
              }
              expanded={expanded === mod.id}
              onToggle={() => setExpanded((cur) => (cur === mod.id ? null : mod.id))}
              style={{ animationDelay: `${i * 30}ms` }}
            />
          ))}
        </section>
      )}

      {/* Compact feature map */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Module → Feature map</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Essential ERP surfaces for this account type
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {modules.map((mod) => (
            <div key={mod.id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="sm:w-36 shrink-0 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: mod.color }}
                />
                <Link
                  to={mod.to}
                  className="text-sm font-semibold hover:underline underline-offset-2"
                >
                  {mod.name}
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {mod.features.map((f) => (
                  <Link
                    key={f.id}
                    to={f.to}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-[color:var(--color-primary)] transition-colors"
                  >
                    {f.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleCard({
  module: mod,
  accent,
  hasAccess,
  expanded,
  onToggle,
  style,
}: {
  module: PortalModule;
  accent: string;
  hasAccess: boolean;
  expanded: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  const ModIcon = mod.icon;

  return (
    <article
      className="rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 hover:border-[color:var(--color-primary)]/60 hover:shadow-md animate-in fade-in"
      style={style}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 rounded-xl grid place-items-center shrink-0"
            style={{ backgroundColor: `${mod.color}22`, color: mod.color }}
          >
            <ModIcon className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={mod.to}
                className="font-semibold text-sm leading-tight hover:underline underline-offset-2"
              >
                {mod.name}
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                {!hasAccess && (
                  <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded-md border border-border">
                    Locked
                  </span>
                )}
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: `${accent}18`, color: accent }}
                >
                  {mod.features.length}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mod.description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="mt-3 w-full h-8 rounded-lg border border-border text-xs font-medium flex items-center justify-between px-3 hover:bg-secondary transition-colors"
          aria-expanded={expanded}
        >
          <span>{expanded ? "Hide features" : "Show features"}</span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <ul className="border-t border-border divide-y divide-border bg-secondary/20">
          {mod.features.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} color={mod.color} />
          ))}
        </ul>
      )}

      <div className="border-t border-border px-4 py-3">
        <Link
          to={mod.to}
          className="text-xs font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          style={{ color: mod.color }}
        >
          Open {mod.name} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function FeatureRow({ feature, color }: { feature: PortalFeature; color: string }) {
  return (
    <li>
      <Link
        to={feature.to}
        className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors group"
      >
        <span
          className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium group-hover:underline underline-offset-2">
            {feature.label}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {feature.description}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </Link>
    </li>
  );
}
