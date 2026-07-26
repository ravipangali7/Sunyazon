import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";
import { MODULES_BY_ACCOUNT_TYPE } from "@/lib/account-modules";

export const Route = createFileRoute("/super-admin/roles")({
  head: () => ({
    meta: [{ title: "Roles & Permissions — Super Admin" }],
  }),
  component: RolesPage,
});

function RolesPage() {
  const types = Object.entries(MODULES_BY_ACCOUNT_TYPE);

  return (
    <SuperAdminShell
      title="Roles & Permissions"
      subtitle="Default module catalogs by account type. Org roles further restrict features with F / R / N access."
    >
      <div className="space-y-4">
        {types.map(([type, modules]) => (
          <div key={type} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
              <h3 className="text-sm font-bold font-display capitalize">{type.replace(/_/g, " ")}</h3>
              <span className="text-[11px] text-muted-foreground ml-auto">{modules.length} modules</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {modules.map((code) => (
                <span
                  key={code}
                  className="text-[11px] font-mono rounded-md bg-secondary px-2 py-1"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SuperAdminShell>
  );
}
