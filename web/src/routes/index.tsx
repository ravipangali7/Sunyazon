import { createFileRoute } from "@tanstack/react-router";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info, ArrowUpRight,
  Activity, Package, Users, ClipboardCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, PriorityBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useDashboard, useTasks } from "@/hooks/use-domain";
import { useEnterpriseDashboard, useTodayMission } from "@/hooks/use-enterprise";
import { useAuth } from "@/lib/auth";
import { chartSeries, brand } from "@/lib/colors";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard — Sunyazon BEOS" },
      { name: "description", content: "Sunyazon Business OS — mission-driven executive dashboard with production, sales, HR and workflow KPIs." },
      { property: "og:title", content: "Sunyazon BEOS — Executive Dashboard" },
      { property: "og:description", content: "Live operations for Sunyazon FMCG: revenue, production, workflows, alerts." },
    ],
  }),
  component: Dashboard,
});

function fmtNPR(n: number) {
  if (n >= 1_000_000) return `Rs ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `Rs ${(n / 1_000).toFixed(1)}K`;
  return `Rs ${n}`;
}

function Dashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading, isError, error } = useDashboard();
  const { data: enterpriseDash } = useEnterpriseDashboard();
  const { data: todayMission } = useTodayMission();
  const { data: tasks = [] } = useTasks();

  const kpi = dashboard?.kpi;
  const cards = enterpriseDash?.cards;
  const revenueTrend = dashboard?.revenue_trend ?? [];
  const brandMix = dashboard?.brand_mix ?? [];
  const productionByLine = dashboard?.production_by_line ?? [];
  const alerts = dashboard?.alerts ?? [];
  const mission = dashboard?.mission;

  const delta =
    kpi && kpi.revenue_yesterday
      ? ((kpi.revenue_today - kpi.revenue_yesterday) / kpi.revenue_yesterday) * 100
      : 0;
  const criticalTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "closed").slice(0, 4);

  const role = user?.membership?.role_name || user?.membership?.designation || user?.portal?.role_kind || "";
  const org = user?.portal?.organization_name || user?.membership?.organization_name || "";
  const subtitle = ["Today", user?.full_name, role, org].filter(Boolean).join(" · ");

  const dueToday = (todayMission?.due_today as unknown[] | undefined)?.length ?? 0;
  const overdue = (todayMission?.overdue as unknown[] | undefined)?.length ?? 0;
  const pendingApprovals = (todayMission?.approvals as unknown[] | undefined)?.length ?? 0;

  return (
    <AppShell title="My Work Center" subtitle={subtitle || "Today"}>
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!dashboard && !enterpriseDash}>
        {/* Mission card */}
        <section className="rounded-2xl p-5 lg:p-6 mb-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.accent} 100%)`, color: "#111" }}
        >
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-70">Today’s Mission</div>
          <div className="mt-1 text-xl lg:text-2xl font-bold font-display">
            {dueToday > 0 ? `${dueToday} due today` : (mission?.title || "No mission assigned")}
          </div>
          <div className="mt-1 text-sm opacity-80">
            {overdue > 0 || pendingApprovals > 0
              ? `${overdue} overdue · ${pendingApprovals} approvals`
              : (mission?.subtitle || "Check your task inbox for pending work")}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/tasks" className="h-9 px-4 rounded-lg bg-black/85 text-white text-sm font-semibold inline-flex items-center">
              Open Work
            </a>
          </div>
          <Activity className="absolute -right-6 -bottom-6 h-40 w-40 opacity-15" />
        </section>

        {cards && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
            <KpiCard label="Total Tasks" value={String(cards.total_tasks)} icon={ClipboardCheck} />
            <KpiCard label="In Progress" value={String(cards.in_progress)} sub={`${cards.pending} pending`} icon={Activity} />
            <KpiCard label="Overdue" value={String(cards.overdue)} sub={`${cards.today_tasks} due today`} icon={AlertTriangle} />
            <KpiCard label="Employees" value={String(cards.total_employees)} sub={`${cards.notifications} alerts`} icon={Users} />
          </section>
        )}

        {/* KPI grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <KpiCard label="Revenue Today" value={fmtNPR(kpi?.revenue_today ?? 0)} deltaPct={delta} icon={TrendingUp} />
          <KpiCard label="Units Produced" value={(kpi?.units_produced_today ?? 0).toLocaleString()} sub={`${kpi?.orders_open ?? 0} open orders`} icon={Package} />
          <KpiCard label="OTIF" value={`${kpi?.otif_pct ?? 0}%`} icon={ClipboardCheck} />
          <KpiCard label="Attendance" value={`${kpi?.attendance_pct ?? 0}%`} sub={`${kpi?.pending_approvals ?? 0} approvals`} icon={Users} />
        </section>

        {/* Charts row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-sm font-semibold">Revenue — last 7 days</div>
                <div className="text-xs text-muted-foreground">NPR millions · analytics.kpi_daily</div>
              </div>
              <Tag tone="brand">This week</Tag>
            </div>
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.primary} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={brand.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke={brand.primary} strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
            <div className="text-sm font-semibold">Brand Mix</div>
            <div className="text-xs text-muted-foreground">Share of units · today</div>
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={brandMix} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3}>
                    {brandMix.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} stroke="var(--color-card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {brandMix.map((b, i) => (
                <div key={b.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartSeries[i % chartSeries.length] }} />
                  <span className="text-muted-foreground">{b.name}</span>
                  <span className="ml-auto font-semibold">{b.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Production + alerts */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-sm font-semibold">Production — planned vs actual</div>
                <div className="text-xs text-muted-foreground">production.work_order · today</div>
              </div>
            </div>
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionByLine} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="line" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis width={44} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="planned" fill={chartSeries[1]} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="actual" fill={brand.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Alerts</div>
              <span className="text-[11px] text-muted-foreground">{alerts.length} live</span>
            </div>
            <ul className="space-y-2">
              {alerts.map((a) => {
                const Icon = a.severity === "critical" ? AlertTriangle : a.severity === "warning" ? AlertTriangle : Info;
                const color = a.severity === "critical" ? "var(--color-danger)" : a.severity === "warning" ? "var(--color-warning)" : "var(--color-info)";
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-xl p-3 bg-secondary/60">
                    <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${color}22`, color }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{a.meta}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Task inbox preview */}
        <section className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">Pending Work</div>
              <div className="text-xs text-muted-foreground">core.task · assignee = you</div>
            </div>
            <a href="/tasks" className="text-xs font-semibold text-primary inline-flex items-center gap-1">Open all <ArrowUpRight className="h-3 w-3" /></a>
          </div>
          <ul className="space-y-2">
            {criticalTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-secondary/60 transition-colors">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{t.module} · {t.id} · due {fmtDateTime(t.due_at)}</div>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </QueryState>
    </AppShell>
  );
}

function KpiCard({
  label, value, deltaPct, sub, icon: Icon,
}: {
  label: string; value: string; deltaPct?: number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</span>
        <span className="h-8 w-8 grid place-items-center rounded-lg" style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl lg:text-3xl font-bold font-display tabular-nums">{value}</div>
      {typeof deltaPct === "number" ? (
        <div className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: up ? "var(--color-success)" : "var(--color-danger)" }}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {up ? "+" : ""}{deltaPct.toFixed(1)}% vs yesterday
        </div>
      ) : sub ? (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}
