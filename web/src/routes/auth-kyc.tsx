import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useAuthKyc, useDomainMutations } from "@/hooks/use-domain";
import { fmtDateTime } from "@/lib/format";
import { KeyRound, ShieldCheck, IdCard, Fingerprint } from "lucide-react";

export const Route = createFileRoute("/auth-kyc")({
  head: () => ({ meta: [
    { title: "Auth & KYC — Sunyazon BEOS" },
    { name: "description", content: "Identity, KYC verification, consent and session management." },
  ]}),
  component: AuthKycPage,
});

function AuthKycPage() {
  const { data, isLoading, isError, error } = useAuthKyc();
  const { kycVerify } = useDomainMutations();
  const kycs = data?.kycs ?? [];
  const sessions = data?.sessions ?? [];

  return (
    <AppShell title="Auth & KYC" subtitle="identity.user · identity.kyc · session">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini icon={IdCard} label="KYC verified" value={kycs.filter((k) => k.status === "verified" || k.status === "approved").length} />
          <Mini icon={KeyRound} label="Pending review" value={kycs.filter((k) => k.status === "pending" || k.status === "pending_approval").length} />
          <Mini icon={ShieldCheck} label="Total KYC" value={kycs.length} />
          <Mini icon={Fingerprint} label="Active sessions" value={sessions.length} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <IdCard className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">KYC queue</div>
            </div>
            <div className="divide-y divide-border">
              {kycs.map((k) => (
                <div key={k.id} className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full grid place-items-center font-bold text-xs" style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}>
                    {k.user.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{k.user}</span>
                      <Tag>{k.doc_type}</Tag>
                      <StatusBadge status={k.status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground">updated {fmtDateTime(k.created_at)}</div>
                  </div>
                  {(k.status === "pending" || k.status === "pending_approval") && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={kycVerify.isPending}
                        onClick={() => kycVerify.mutate({ id: k.id, approved: true })}
                        className="text-xs font-semibold"
                        style={{ color: "var(--color-success)" }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={kycVerify.isPending}
                        onClick={() => kycVerify.mutate({ id: k.id, approved: false, reason: "Rejected" })}
                        className="text-xs font-semibold"
                        style={{ color: "var(--color-danger)" }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Active sessions</div>
            </div>
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <div key={s.id} className="p-4">
                  <div className="text-sm font-semibold">{s.device}</div>
                  <div className="text-[11px] text-muted-foreground">{s.ip}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Expires {fmtDateTime(s.expires_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}

function Mini({ icon: Icon, label, value }: { icon: typeof KeyRound; label: string; value: number | string }) {
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
