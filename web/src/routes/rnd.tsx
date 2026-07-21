import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useRnd } from "@/hooks/use-domain";
import { FlaskConical, Beaker } from "lucide-react";

export const Route = createFileRoute("/rnd")({
  head: () => ({ meta: [
    { title: "R&D — Sunyazon BEOS" },
    { name: "description", content: "Research & Development: product trials, formulations, sensory panels." },
  ]}),
  component: RndPage,
});

function RndPage() {
  const { data: projects = [], isLoading, isError, error } = useRnd();
  const stages = Array.from(new Set(projects.map((p) => p.stage).filter(Boolean)));
  const stageCols = stages.length ? stages : ["concept", "formulation", "pilot", "sensory", "launch"];

  return (
    <AppShell title="R&D" subtitle="rnd.project · formulation · sensory">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!projects.length}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="Active projects" value={projects.length} sub="pipeline" />
          <Mini label="Stages" value={stageCols.length} sub="in use" />
          <Mini label="In progress" value={projects.filter((p) => p.status !== "completed" && p.status !== "cancelled").length} sub="open" />
          <Mini label="Completed" value={projects.filter((p) => p.status === "completed").length} sub="closed" />
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden mb-5">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Pipeline</div>
          </div>
          <div className="grid gap-2 p-3 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${Math.max(stageCols.length, 1)}, minmax(140px, 1fr))` }}>
            {stageCols.map((s) => {
              const items = projects.filter((p) => p.stage === s);
              return (
                <div key={s} className="rounded-xl bg-secondary/40 p-2 min-w-[140px]">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{s} · {items.length}</div>
                  <div className="space-y-2">
                    {items.map((p) => (
                      <div key={p.id} className="rounded-lg bg-card border border-border p-2">
                        <div className="text-[9px] font-mono text-muted-foreground">{p.id}</div>
                        <div className="text-xs font-semibold leading-tight">{p.name}</div>
                        <div className="mt-1"><StatusBadge status={p.status} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">All projects</div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/40">
                <th className="px-4 py-2 font-semibold">ID</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Stage</th>
                <th className="px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{p.id}</td>
                  <td className="px-4 py-2 font-semibold">{p.name}</td>
                  <td className="px-4 py-2"><StatusBadge status={p.stage} /></td>
                  <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
