import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useAudit } from "@/hooks/use-domain";
import { fmtDateTime } from "@/lib/format";
import { ScrollText, User, Server } from "lucide-react";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [
    { title: "Audit Log — Sunyazon BEOS" },
    { name: "description", content: "Immutable audit trail: who did what, when, from where." },
  ]}),
  component: AuditPage,
});

function AuditPage() {
  const { data: events = [], isLoading, isError, error } = useAudit();

  return (
    <AppShell title="Audit Log" subtitle="audit.audit_log · immutable trail">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!events.length}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <Mini icon={ScrollText} label="Events" value={events.length} />
          <Mini icon={User} label="Actors" value={new Set(events.map((e) => e.actor)).size} />
          <Mini icon={Server} label="Objects" value={new Set(events.map((e) => e.object)).size} />
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/40">
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-4 py-2 font-semibold">Actor</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Object</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-2 font-mono text-xs">{e.id}</td>
                    <td className="px-4 py-2 tabular-nums text-xs">{fmtDateTime(e.created_at)}</td>
                    <td className="px-4 py-2 font-semibold">{e.actor}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.object}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}

function Mini({ icon: Icon, label, value }: { icon: typeof User; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      </div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
    </div>
  );
}
