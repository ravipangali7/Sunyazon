import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useAdminConsole } from "@/hooks/use-domain";
import { ShieldCheck, FormInput, Workflow, KeySquare, Users } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Admin & RBAC — Sunyazon BEOS" },
    { name: "description", content: "Form designer, workflow designer, role & permission matrix." },
  ]}),
  component: AdminPage,
});

function permCell(row: { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }) {
  if (row.can_create || row.can_edit || row.can_delete) return "F";
  if (row.can_view) return "R";
  return "N";
}

function AdminPage() {
  const { data, isLoading, isError, error } = useAdminConsole();
  const roles = data?.roles ?? [];
  const modules = data?.modules ?? [];
  const matrix = data?.matrix ?? [];
  const forms = data?.forms ?? [];
  const workflows = data?.workflows ?? [];

  const roleNames = roles.map((r) => r.name);
  const moduleNames = modules.map((m) => m.name);

  return (
    <AppShell title="Admin & RBAC" subtitle="metadata designer · workflow designer · role matrix">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Card icon={Users} label="Roles" value={roles.length} sub="RBAC configured" />
          <Card icon={FormInput} label="Form templates" value={forms.length} sub="published" />
          <Card icon={Workflow} label="Workflows" value={workflows.length} sub="templates" />
          <Card icon={KeySquare} label="Modules" value={modules.length} sub="in catalog" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <FormInput className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Form templates</div>
              <button className="ml-auto h-7 px-2 rounded-md text-[11px] font-semibold bg-secondary">+ New</button>
            </div>
            <div className="divide-y divide-border">
              {forms.map((f) => (
                <div key={f.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{f.name}</div>
                    <div className="text-[11px] text-muted-foreground">{f.object_code}</div>
                  </div>
                  <button className="text-xs font-semibold text-primary">Open designer →</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Workflow designs</div>
              <button className="ml-auto h-7 px-2 rounded-md text-[11px] font-semibold bg-secondary">+ New</button>
            </div>
            <div className="divide-y divide-border">
              {workflows.map((w) => (
                <div key={w.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{w.name}</div>
                    <div className="text-[11px] text-muted-foreground">v{w.version} · <Tag>live</Tag></div>
                  </div>
                  <button className="text-xs font-semibold text-primary">Open canvas →</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Role · Module permission matrix</div>
            <div className="ml-auto text-[11px] text-muted-foreground">F = Full · R = Read · N = None</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary/40">
                  <th className="px-3 py-2 sticky left-0 bg-secondary/40">Role</th>
                  {moduleNames.map((m) => <th key={m} className="px-2 py-2 text-center font-semibold">{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {roleNames.map((r) => (
                  <tr key={r} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold sticky left-0 bg-card">{r}</td>
                    {moduleNames.map((m) => {
                      const row = matrix.find((x) => x.role === r && x.module === m);
                      const p = row ? permCell(row) : "N";
                      return (
                        <td key={m} className="px-2 py-2 text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md font-bold" style={{
                            backgroundColor: p === "F" ? "var(--color-success)22" : p === "R" ? "var(--color-info)22" : "var(--color-secondary)",
                            color: p === "F" ? "var(--color-success)" : p === "R" ? "var(--color-info)" : "var(--color-muted-foreground)",
                          }}>{p}</span>
                        </td>
                      );
                    })}
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

function Card({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      </div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
