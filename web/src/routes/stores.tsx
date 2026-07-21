import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  inventoryApi,
  type InvGRN,
  type InvLedgerEntry,
  type InvMaterialIssue,
  type InvStockBalance,
} from "@/lib/inventory-api";

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "Stores — Sunyazon BEOS" },
      {
        name: "description",
        content: "Material issues, GRN, stock levels and movements for Sunyazon warehouses.",
      },
    ],
  }),
  component: Stores,
});

type Section = "overview" | "issues" | "grn" | "stock" | "movements";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "issues", "grn", "stock", "movements"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Stores", subtitle: "stores · issues · grn · stock · movements" },
  issues: { title: "Material Issues", subtitle: "inventory.material_issue" },
  grn: { title: "Goods Receipt", subtitle: "inventory.grn" },
  stock: { title: "Stock Levels", subtitle: "inventory.stock_balance" },
  movements: { title: "Stock Movements", subtitle: "inventory.stock_ledger" },
};

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function invalidateStores(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["inventory"] });
  void qc.invalidateQueries({ queryKey: ["stores"] });
}

function Stores() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{flash}</div>
      )}
      {section === "overview" && <OverviewSection onFlash={setFlash} />}
      {section === "issues" && <IssuesSection onFlash={setFlash} />}
      {section === "grn" && <GrnSection onFlash={setFlash} />}
      {section === "stock" && <StockSection onFlash={setFlash} />}
      {section === "movements" && <MovementsSection />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["inventory", "overview"],
    queryFn: inventoryApi.overview,
    enabled: authed,
  });
  const lowStock = useQuery({
    queryKey: ["inventory", "stock", "low", "stores"],
    queryFn: () => inventoryApi.stock({ page_size: 20, below_reorder: true }),
    enabled: authed,
  });

  const reorder = useMutation({
    mutationFn: (itemId: string) => inventoryApi.reorderPr(itemId),
    onSuccess: () => {
      onFlash("Purchase requisition created.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const kpi = overview.data;
  const catData = kpi?.by_category?.length ? kpi.by_category : [];
  const whData = kpi?.by_warehouse_type?.length ? kpi.by_warehouse_type : [];
  const chartData = catData.length ? catData : whData;

  const low: Array<{
    id: string;
    item_id?: string;
    sku: string;
    name: string;
    on_hand: number;
    reorder_level: number;
    uom?: string;
  }> = (lowStock.data?.results?.length
    ? lowStock.data.results.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        sku: r.sku,
        name: r.name,
        on_hand: r.on_hand,
        reorder_level: r.reorder_level,
        uom: r.uom,
      }))
    : (kpi?.low_stock || []).map((r) => ({
        id: r.id,
        item_id: r.id,
        sku: r.sku,
        name: r.name,
        on_hand: r.on_hand,
        reorder_level: r.reorder_level,
        uom: r.uom,
      })));

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="SKUs" value={kpi?.sku_count ?? 0} sub="tracked items" />
        <Mini
          label="Below Reorder"
          value={kpi?.below_reorder ?? 0}
          sub="needs attention"
          style={{ color: "var(--color-danger)" }}
        />
        <Mini label="Open Issues" value={kpi?.open_issues ?? 0} sub="draft / approved" />
        <Mini label="Pending GRNs" value={kpi?.pending_grns ?? 0} sub="draft / received" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Warehouses" value={kpi?.warehouse_count ?? 0} sub="active" />
        <Mini label="Categories" value={kpi?.category_count ?? 0} sub="item groups" />
        <Mini label="Pending Audits" value={kpi?.pending_adjustments ?? 0} sub="adjustments" />
        <Mini label="Movements Today" value={kpi?.movements_today ?? 0} sub="ledger rows" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">
            {catData.length ? "Stock by category" : "By warehouse type"}
          </div>
          {chartData.length === 0 ? (
            <div className="text-xs text-muted-foreground">No breakdown yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-danger)" }} />
            <div className="text-sm font-semibold">Low stock alerts</div>
          </div>
          {low.length === 0 ? (
            <div className="text-xs text-muted-foreground">All items above reorder level.</div>
          ) : (
            <div className="divide-y divide-border">
              {low.slice(0, 8).map((row) => {
                const itemId = row.item_id || row.id;
                return (
                  <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground">{row.sku}</div>
                      <div className="text-sm font-semibold">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.on_hand.toLocaleString()} / reorder {row.reorder_level.toLocaleString()}{" "}
                        {row.uom || ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={reorder.isPending}
                      onClick={() => reorder.mutate(itemId)}
                      className="text-[10px] font-semibold text-primary disabled:opacity-50 shrink-0"
                    >
                      Create PR
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

/* ── Material Issues ──────────────────────────────────────────────────────── */

function IssuesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvMaterialIssue | null>(null);

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["stores", "issues", search, status, page],
    queryFn: () =>
      inventoryApi.materialIssues({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => inventoryApi.createMaterialIssue(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Material issue created.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      inventoryApi.updateMaterialIssue(id, payload),
    onSuccess: () => {
      setEditing(null);
      onFlash("Material issue updated.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "issue" | "cancel" }) =>
      inventoryApi.materialIssueAction(id, act),
    onSuccess: (_, vars) => {
      onFlash(`Issue ${vars.act} completed.`);
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteMaterialIssue(id),
    onSuccess: () => {
      onFlash("Draft issue deleted.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search issue / WO…"
        onNew={() => setShowForm(true)}
        newLabel="New Issue"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
           