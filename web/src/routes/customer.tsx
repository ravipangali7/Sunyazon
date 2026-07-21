import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useCustomer } from "@/hooks/use-domain";
import { fmtNPR } from "@/lib/format";
import { Package, MapPin, Star, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/customer")({
  head: () => ({ meta: [
    { title: "Customer Dashboard — Sunyazon BEOS" },
    { name: "description", content: "Customer self-service: orders, loyalty, addresses, chats." },
  ]}),
  component: CustomerPage,
});

function CustomerPage() {
  const { data, isLoading, isError, error } = useCustomer();
  const orders = data?.orders ?? [];
  const addresses = data?.addresses ?? [];
  const loyalty = data?.loyalty;
  const openOrders = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;

  return (
    <AppShell title="Customer Dashboard" subtitle="customer.dashboard · self-service">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl p-5 text-primary-foreground" style={{ background: "linear-gradient(135deg, var(--color-primary), #FFB347)" }}>
            <div className="text-[11px] uppercase tracking-widest opacity-80">Loyalty tier</div>
            <div className="text-3xl font-bold font-display mt-1">{loyalty?.tier || "—"}</div>
            <div className="mt-3 text-sm">Lifetime spend {fmtNPR(loyalty?.spend ?? 0)}</div>
          </div>
          <Mini label="Lifetime spend" value={fmtNPR(loyalty?.spend ?? 0)} sub={`${orders.length} recent orders`} />
          <Mini label="Open orders" value={openOrders} sub="in progress" />

          <div className="lg:col-span-2 rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Recent orders</div>
            </div>
            <div className="divide-y divide-border">
              {orders.map((o) => (
                <div key={o.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground">{o.id}</span>
                      <StatusBadge status={o.status} />
                      <span className="text-[11px] text-muted-foreground">{o.time}</span>
                    </div>
                    <div className="text-sm font-semibold mt-0.5">{o.items} items · {o.channel} · {o.customer}</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">{fmtNPR(o.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Addresses</div>
            </div>
            {addresses.map((a, i) => (
              <div key={a.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{a.label}</span>
                  {i === 0 && <Tag tone="brand">default</Tag>}
                </div>
                <div className="text-[11px] text-muted-foreground">{a.line}{a.city ? ` · ${a.city}` : ""}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Reviews</div>
            </div>
            <div className="text-sm text-muted-foreground">Leave a review on recent deliveries from your order history.</div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Support</div>
            </div>
            <button className="w-full h-10 rounded-lg text-sm font-semibold" style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}>
              Start a chat
            </button>
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
