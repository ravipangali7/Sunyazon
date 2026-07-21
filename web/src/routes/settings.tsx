import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { Moon, Sun, Monitor, Globe, Bell, Shield, User } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Settings — Sunyazon BEOS" },
    { name: "description", content: "Profile, appearance, language and notification preferences." },
  ]}),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const role = user?.membership?.role_name || user?.membership?.designation || user?.portal?.role_kind || "—";
  const org = user?.portal?.organization_name || user?.membership?.organization_name || "—";
  const email = user?.email || user?.username || "—";

  return (
    <AppShell title="Settings" subtitle="user preferences · workspace configuration">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section icon={User} title="Profile">
          <Row k="Name" v={user?.full_name || "—"} />
          <Row k="Role" v={role} />
          <Row k="Org" v={org} />
          <Row k="Email" v={email} />
        </Section>

        <Section icon={Monitor} title="Appearance">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Theme</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { k: "light", label: "Light", Icon: Sun },
              { k: "dark", label: "Dark", Icon: Moon },
              { k: "system", label: "System", Icon: Monitor },
            ] as const).map(({ k, label, Icon }) => (
              <button
                key={k}
                onClick={() => setTheme(k)}
                className="flex flex-col items-center gap-1 rounded-lg p-3 border transition-colors"
                style={theme === k
                  ? { borderColor: "var(--color-primary)", backgroundColor: "var(--color-primary)15", color: "var(--color-primary)" }
                  : { borderColor: "var(--color-border)" }}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Globe} title="Language & Region">
          <Row k="Language" v="English (EN)" />
          <Row k="Fallback" v="नेपाली (NP)" />
          <Row k="Timezone" v="Asia/Kathmandu (+05:45)" />
          <Row k="Currency" v="NPR (Rs)" />
        </Section>

        <Section icon={Bell} title="Notifications">
          <Toggle label="Approvals" on />
          <Toggle label="QA Alerts" on />
          <Toggle label="Stock warnings" on />
          <Toggle label="Marketing digests" />
        </Section>

        <Section icon={Shield} title="Security">
          <Row k="MFA" v="Enabled · TOTP" />
          <Row k="Session" v="Active device" />
          <button className="mt-2 h-9 px-4 rounded-lg text-sm font-semibold bg-secondary">Sign out all devices</button>
        </Section>

        <Section icon={Shield} title="Danger zone">
          <button className="h-9 px-4 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: "var(--color-danger)" }}>
            Delete workspace data
          </button>
          <div className="text-[11px] text-muted-foreground mt-2">Irreversible. Admin approval required.</div>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" />
        <div className="font-semibold text-sm">{title}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <label className="flex items-center justify-between text-sm py-1.5 cursor-pointer">
      <span>{label}</span>
      <span className="relative h-5 w-9 rounded-full transition-colors" style={{ backgroundColor: on ? "var(--color-primary)" : "var(--color-secondary)" }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? "1.125rem" : "0.125rem" }} />
      </span>
    </label>
  );
}
