import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";

export const Route = createFileRoute("/super-admin/settings")({
  head: () => ({
    meta: [{ title: "System Settings — Super Admin" }],
  }),
  component: SettingsPage,
});

const SETTINGS = [
  { label: "Tenant defaults", value: "Sunyazon · NP" },
  { label: "Auth", value: "Phone + password sessions" },
  { label: "Module registry", value: "Active · seeded" },
  { label: "Capability vocabulary", value: "Aligned to Module.code" },
  { label: "Portal routing", value: "Account type + role + permissions" },
];

function SettingsPage() {
  return (
    <SuperAdminShell
      title="System Settings"
      subtitle="Platform-wide configuration. Changes here affect every organization."
    >
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Settings className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-semibold">Platform configuration</span>
        </div>
        <ul className="divide-y divide-border">
          {SETTINGS.map((s) => (
            <li key={s.label} className="px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground text-right">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </SuperAdminShell>
  );
}
