import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { usePayments } from "@/hooks/use-domain";
import { fmtNPR, fmtDateTime } from "@/lib/format";
import { CreditCard, Megaphone, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [
    { title: "Payments & Ads — Sunyazon BEOS" },
    { name: "description", content: "Payment gateway settlements, refunds and ad campaign performance." },
  ]}),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data, isLoading, isError, error } = usePayments();
  const txns = data?.transactions ?? [];
  const campaigns = data?.campaigns ?? [];
  const kpi = data?.kpi;

  return (
    <AppShell title="Payments & Ads" subtitle="payment.txn · ads.campaign">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="Settled" value={fmtNPR(kpi?.settled ?? 0)} sub="settled" />
          <Mini label="Pending" value={fmtNPR(kpi?.pending ?? 0)} sub="in flight" />
          <Mini label="Txn count" value={kpi?.count ?? txns.length} sub="transactions" />
          <Mini label="Campaigns" value={campaigns.length} sub="active budget lines" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Recent transactions</div>
            </div>
            <div className="divide-y divide-border">
              {txns.map((t) => (
                <div key={t.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{t.ref || t.id}</span>
                      <Tag>{t.gateway}</Tag>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{fmtDateTime(t.created_at)}</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">{fmtNPR(t.amount)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Ad campaigns</div>
            </div>
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">Budget {fmtNPR(c.budget)}</div>
                </div>
              ))}
            </div>
          </div>
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
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" />{sub}</div>}
    </div>
  );
}
