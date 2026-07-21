import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AlertTriangle, Info, CheckCircle2, X } from "lucide-react";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useDomainMutations, useNotifications } from "@/hooks/use-domain";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Alerts & Notifications — Sunyazon BEOS" },
      {
        name: "description",
        content: "Notification inbox for workflow, quality, stock, finance and system alerts.",
      },
    ],
  }),
  component: NotificationsPage,
});

const ICONS = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
} as const;

const COLORS: Record<string, string> = {
  critical: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
  success: "var(--color-success)",
};

function NotificationsPage() {
  const { data: alerts = [], isLoading, isError, error } = useNotifications();
  const { notificationRead } = useDomainMutations();

  return (
    <AppShell title="Alerts & Notifications" subtitle="notification.notification · unified inbox">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!alerts.length}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="Unread" value={alerts.filter((i) => !i.is_read).length} sub="require attention" />
          <Mini
            label="Critical"
            value={alerts.filter((i) => i.severity === "critical").length}
            sub="P1 severity"
          />
          <Mini
            label="Warnings"
            value={alerts.filter((i) => i.severity === "warning").length}
            sub="advisory"
          />
          <Mini label="Total" value={alerts.length} sub="inbox" />
        </div>
        <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
          {alerts.map((n) => {
            const sev = n.severity in ICONS ? n.severity : "info";
            const Icon = ICONS[sev as keyof typeof ICONS] ?? Info;
            const color = COLORS[sev] ?? COLORS.info;
            return (
              <div key={n.id} className={`flex items-start gap-3 p-4 ${!n.is_read ? "bg-secondary/30" : ""}`}>
                <div
                  className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{n.title}</span>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-primary)" }} />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {n.meta}
                    {n.created_at ? ` · ${n.created_at}` : ""}
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    aria-label="Mark read"
                    disabled={notificationRead.isPending}
                    onClick={() => notificationRead.mutate(n.id)}
                    className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </QueryState>
    </AppShell>
  );
}

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
