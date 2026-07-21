import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useCommerce } from "@/hooks/use-domain";
import { fmtNPR } from "@/lib/format";
import { Store, TrendingUp, ShoppingBag, Star } from "lucide-react";

export const Route = createFileRoute("/commerce")({
  head: () => ({ meta: [
    { title: "Commerce — Sunyazon BEOS" },
    { name: "description", content: "Seller Centre: products, orders and storefront metrics." },
  ]}),
  component: CommercePage,
});

function CommercePage() {
  const { data, isLoading, isError, error } = useCommerce();
  const products = data?.products ?? [];
  const orders = data?.orders ?? [];
  const kpi = data?.kpi;

  return (
    <AppShell title="Commerce · Seller Centre" subtitle="ecommerce.product · ecommerce.order">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="GMV (30d)" value={fmtNPR(kpi?.gmv_30d ?? 0)} sub="live" />
          <Mini label="Orders (30d)" value={(kpi?.orders_30d ?? 0).toLocaleString()} sub="fulfilled" />
          <Mini label="AOV" value={fmtNPR(kpi?.aov ?? 0)} sub="average" />
          <Mini label="Rating" value={`${kpi?.rating ?? 0}★`} sub="store rating" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Products</div>
            </div>
            <div className="divide-y divide-border">
              {products.map((p) => (
                <div key={p.id} className="p-4 flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg grid place-items-center text-2xl shrink-0" style={{ backgroundColor: "var(--color-secondary)" }}>🫙</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      <Tag tone="brand">{p.brand}</Tag>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">{p.sku} · stock {p.stock.toLocaleString()} · sold {p.sold_30d.toLocaleString()}/30d</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">{fmtNPR(p.price)}</div>
                    <div className="text-[11px] flex items-center justify-end gap-0.5 text-muted-foreground"><Star className="h-3 w-3" fill="currentColor" />{p.rating}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Live orders</div>
            </div>
            <div className="divide-y divide-border">
              {orders.map((o) => (
                <div key={o.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{o.id}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-sm font-semibold">{o.customer}</div>
                  <div className="text-[11px] text-muted-foreground">{o.items} items · {o.channel} · {o.time}</div>
                  <div className="mt-1 text-sm font-bold tabular-nums">{fmtNPR(o.total)}</div>
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
