import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="issued">Issued</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      />

      {showForm && (
        <IssueForm
          items={options.data?.items || []}
          warehouses={options.data?.warehouses || []}
          workOrders={options.data?.work_orders || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
        />
      )}

      {editing && (
        <IssueEditForm
          issue={editing}
          warehouses={options.data?.warehouses || []}
          workOrders={options.data?.work_orders || []}
          pending={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(payload) => update.mutate({ id: editing.id, payload })}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="space-y-3">
          {(q.data?.results || []).map((iss: InvMaterialIssue) => (
            <div key={iss.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{iss.issue_no}</span>
                    <StatusBadge status={iss.status} />
                  </div>
                  <div className="text-sm font-semibold mt-1">
                    {iss.warehouse_code} · {iss.work_order_no || "No WO"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(iss.date)} · {iss.line_count} line(s) · total issued {iss.total_issued}
                    {iss.issued_by_name ? ` · ${iss.issued_by_name}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(iss.status === "draft" || iss.status === "approved") && (
                    <ActionBtn label="Edit" onClick={() => setEditing(iss)} />
                  )}
                  {iss.status === "draft" && (
                    <ActionBtn
                      label="Approve"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: iss.id, act: "approve" })}
                    />
                  )}
                  {(iss.status === "draft" || iss.status === "approved") && (
                    <ActionBtn
                      label="Issue stock"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: iss.id, act: "issue" })}
                    />
                  )}
                  {iss.status !== "issued" && iss.status !== "cancelled" && (
                    <ActionBtn
                      label="Cancel"
                      danger
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: iss.id, act: "cancel" })}
                    />
                  )}
                  {iss.status === "draft" && (
                    <ActionBtn
                      label="Delete"
                      danger
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`Delete draft ${iss.issue_no}?`)) del.mutate(iss.id);
                      }}
                    />
                  )}
                </div>
              </div>
              {iss.lines?.length > 0 && (
                <div className="mt-2 rounded-xl bg-secondary/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2">Required</th>
                        <th className="px-3 py-2">Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iss.lines.map((l) => (
                        <tr key={l.id} className="border-t border-border/50">
                          <td className="px-3 py-2 font-semibold">
                            {l.material_code} · {l.material_name}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {l.required_qty} {l.uom}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {l.issued_qty} {l.uom}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function IssueForm({
  items,
  warehouses,
  workOrders,
  pending,
  onClose,
  onSave,
}: {
  items: { id: string; item_code: string; name: string; uom: string }[];
  warehouses: { id: string; code: string; name: string }[];
  workOrders: { id: string; wo_no: string; title: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [woId, setWoId] = useState("");
  const [materialId, setMaterialId] = useState(items[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Modal title="New material issue" onClose={onClose}>
      <Field label="Warehouse">
        <select className={inputCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Work order (optional)">
        <select className={inputCls} value={woId} onChange={(e) => setWoId(e.target.value)}>
          <option value="">— None —</option>
          {workOrders.map((wo) => (
            <option key={wo.id} value={wo.id}>
              {wo.wo_no} — {wo.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Material">
        <select className={inputCls} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.item_code} — {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Qty">
          <input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Date">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <ModalActions
        pending={pending}
        disabled={!warehouseId || !materialId}
        onClose={onClose}
        onSave={() =>
          onSave({
            warehouse_id: warehouseId,
            work_order_id: woId || null,
            date,
            lines: [
              {
                material_id: materialId,
                required_qty: Number(qty) || 0,
                issued_qty: Number(qty) || 0,
              },
            ],
          })
        }
      />
    </Modal>
  );
}

function IssueEditForm({
  issue,
  warehouses,
  workOrders,
  pending,
  onClose,
  onSave,
}: {
  issue: InvMaterialIssue;
  warehouses: { id: string; code: string; name: string }[];
  workOrders: { id: string; wo_no: string; title: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [warehouseId, setWarehouseId] = useState(issue.warehouse_id || warehouses[0]?.id || "");
  const [woId, setWoId] = useState(issue.work_order_id || "");
  const [date, setDate] = useState(issue.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState(
    (issue.lines || []).map((l) => ({
      id: l.id,
      required_qty: String(l.required_qty),
      issued_qty: String(l.issued_qty),
      label: `${l.material_code} · ${l.material_name}`,
    })),
  );

  return (
    <Modal title={`Edit ${issue.issue_no}`} onClose={onClose}>
      <Field label="Warehouse">
        <select className={inputCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Work order">
        <select className={inputCls} value={woId} onChange={(e) => setWoId(e.target.value)}>
          <option value="">— None —</option>
          {workOrders.map((wo) => (
            <option key={wo.id} value={wo.id}>
              {wo.wo_no} — {wo.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {lines.map((line, idx) => (
        <div key={line.id} className="grid grid-cols-2 gap-3 mb-2">
          <div className="col-span-2 text-[11px] text-muted-foreground font-semibold">{line.label}</div>
          <Field label="Required qty">
            <input
              className={inputCls}
              type="number"
              value={line.required_qty}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, required_qty: e.target.value };
                setLines(next);
              }}
            />
          </Field>
          <Field label="Issued qty">
            <input
              className={inputCls}
              type="number"
              value={line.issued_qty}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...line, issued_qty: e.target.value };
                setLines(next);
              }}
            />
          </Field>
        </div>
      ))}
      <ModalActions
        pending={pending}
        disabled={!warehouseId}
        onClose={onClose}
        onSave={() =>
          onSave({
            warehouse_id: warehouseId,
            work_order_id: woId || null,
            date,
            lines: lines.map((l) => ({
              id: l.id,
              required_qty: Number(l.required_qty) || 0,
              issued_qty: Number(l.issued_qty) || 0,
            })),
          })
        }
      />
    </Modal>
  );
}

/* ── GRN ──────────────────────────────────────────────────────────────────── */

function GrnSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["stores", "grns", search, status, page],
    queryFn: () =>
      inventoryApi.grns({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => inventoryApi.createGrn(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("GRN created.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({
      id,
      act,
      warehouseId,
      qcStatus,
    }: {
      id: string;
      act: "receive" | "post" | "cancel";
      warehouseId?: string;
      qcStatus?: string;
    }) => inventoryApi.grnAction(id, act, { warehouse_id: warehouseId, qc_status: qcStatus }),
    onSuccess: (_, vars) => {
      onFlash(`GRN ${vars.act} completed.`);
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteGrn(id),
    onSuccess: () => {
      onFlash("Draft GRN deleted.");
      invalidateStores(qc);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const defaultWh = options.data?.warehouses?.[0]?.id;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search GRN / PO / vendor…"
        onNew={() => setShowForm(true)}
        newLabel="New GRN"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="received">Received</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      />

      {showForm && (
        <GrnForm
          pos={options.data?.purchase_orders || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="space-y-3">
          {(q.data?.results || []).map((g: InvGRN) => (
            <div key={g.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{g.grn_no}</span>
                    <StatusBadge status={g.status} />
                    <Tag>QC: {g.qc_status}</Tag>
                  </div>
                  <div className="text-sm font-semibold mt-1">
                    {g.vendor} · PO {g.po_no || "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(g.date)} · {g.line_count} line(s) · {g.item} × {g.qty} {g.uom}
                    {g.received_by_name ? ` · ${g.received_by_name}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.status === "draft" && (
                    <ActionBtn
                      label="Receive"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: g.id, act: "receive" })}
                    />
                  )}
                  {g.status === "received" && (
                    <ActionBtn
                      label="Post to stock"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          id: g.id,
                          act: "post",
                          warehouseId: defaultWh,
                          qcStatus: g.qc_status === "pending" ? "pass" : undefined,
                        })
                      }
                    />
                  )}
                  {g.status !== "posted" && g.status !== "cancelled" && (
                    <ActionBtn
                      label="Cancel"
                      danger
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: g.id, act: "cancel" })}
                    />
                  )}
                  {g.status === "draft" && (
                    <ActionBtn
                      label="Delete"
                      danger
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`Delete draft ${g.grn_no}?`)) del.mutate(g.id);
                      }}
                    />
                  )}
                </div>
              </div>
              {g.lines?.length > 0 && (
                <div className="mt-2 rounded-xl bg-secondary/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Ordered</th>
                        <th className="px-3 py-2">Received</th>
                        <th className="px-3 py-2">Accepted</th>
                        <th className="px-3 py-2">Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((l) => (
                        <tr key={l.id} className="border-t border-border/50">
                          <td className="px-3 py-2 font-semibold">
                            {l.item_code} · {l.item_name}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{l.ordered_qty}</td>
                          <td className="px-3 py-2 tabular-nums">{l.received_qty}</td>
                          <td className="px-3 py-2 tabular-nums">{l.accepted_qty}</td>
                          <td className="px-3 py-2 tabular-nums">{l.rejected_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function GrnForm({
  pos,
  pending,
  onClose,
  onSave,
}: {
  pos: { id: string; po_no: string; supplier_name: string; status: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [poId, setPoId] = useState(pos[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Modal title="New GRN from PO" onClose={onClose}>
      <Field label="Purchase order">
        <select className={inputCls} value={poId} onChange={(e) => setPoId(e.target.value)}>
          <option value="">Select PO…</option>
          {pos.map((po) => (
            <option key={po.id} value={po.id}>
              {po.po_no} — {po.supplier_name} ({po.status})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="text-[11px] text-muted-foreground mb-3">
        Lines are copied from the PO. Receive → QC → Post to stock.
      </p>
      <ModalActions
        pending={pending}
        disabled={!poId}
        onClose={onClose}
        onSave={() => onSave({ po_id: poId, date })}
      />
    </Modal>
  );
}

/* ── Stock Levels ─────────────────────────────────────────────────────────── */

function StockSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [belowOnly, setBelowOnly] = useState(false);
  const [sort, setSort] = useState("sku");
  const [page, setPage] = useState(1);

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const balances = useQuery({
    queryKey: ["stores", "stock", search, warehouseId, belowOnly, page],
    queryFn: () =>
      inventoryApi.stock({
        search: search || undefined,
        warehouse_id: warehouseId || undefined,
        below_reorder: belowOnly || undefined,
        page,
        page_size: 25,
      }),
    enabled: authed,
  });

  const rows = useMemo(() => {
    const list = [...((balances.data?.results || []) as InvStockBalance[])];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "on_hand") return a.on_hand - b.on_hand;
      if (sort === "reorder_level") return a.reorder_level - b.reorder_level;
      return a.sku.localeCompare(b.sku);
    });
    return list;
  }, [balances.data?.results, sort]);

  const reorder = useMutation({
    mutationFn: (itemId: string) => inventoryApi.reorderPr(itemId),
    onSuccess: () => {
      onFlash("Purchase requisition created.");
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
        placeholder="Search SKU, name, category…"
        filters={
          <>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All warehouses</option>
              {(options.data?.warehouses || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="sku">Sort: SKU</option>
              <option value="name">Sort: Name</option>
              <option value="on_hand">Sort: On hand</option>
              <option value="reorder_level">Sort: Reorder</option>
            </select>
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={belowOnly}
                onChange={(e) => {
                  setBelowOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Below reorder
            </label>
          </>
        }
      />

      <QueryState
        isLoading={balances.isLoading}
        isError={balances.isError}
        error={balances.error as Error}
        empty={!rows.length}
      >
        <StockTable
          rows={rows}
          onReorder={(id) => reorder.mutate(id)}
          pending={reorder.isPending}
        />
        <Pager
          page={page}
          totalPages={balances.data?.total_pages ?? 1}
          onPage={setPage}
          count={balances.data?.count ?? 0}
        />
      </QueryState>
    </>
  );
}

/* ── Movements ────────────────────────────────────────────────────────────── */

const typeMeta: Record<string, { icon: typeof ArrowDownLeft; label: string; color: string }> = {
  GRN: { icon: ArrowDownLeft, label: "GRN", color: "var(--color-success)" },
  Issue: { icon: ArrowUpRight, label: "Issue", color: "var(--color-danger)" },
  Adjustment: { icon: SlidersHorizontal, label: "Adjustment", color: "var(--color-warning)" },
  Transfer: { icon: ArrowUpRight, label: "Transfer", color: "var(--color-primary)" },
};

function MovementsSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [txType, setTxType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const ledger = useQuery({
    queryKey: ["stores", "ledger", search, txType, warehouseId, page],
    queryFn: () =>
      inventoryApi.ledger({
        search: search || undefined,
        transaction_type: txType || undefined,
        warehouse_id: warehouseId || undefined,
        page,
        page_size: 25,
      }),
    enabled: authed,
  });

  if (!authed) return <SignInHint />;

  const rows = (ledger.data?.results || []) as InvLedgerEntry[];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search SKU, item, doc, reference…"
        filters={
          <>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={txType}
              onChange={(e) => {
                setTxType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              <option value="in">In / GRN</option>
              <option value="out">Out / Issue</option>
              <option value="adjust">Adjustment</option>
            </select>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All warehouses</option>
              {(options.data?.warehouses || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </>
        }
      />

      <QueryState
        isLoading={ledger.isLoading}
        isError={ledger.isError}
        error={ledger.error as Error}
        empty={!rows.length}
      >
        <div className="lg:hidden divide-y divide-border rounded-2xl bg-card border border-border overflow-hidden">
          {rows.map((m) => {
            const meta =
              typeMeta[m.type] ?? {
                icon: SlidersHorizontal,
                label: m.type,
                color: "var(--color-muted-foreground)",
              };
            const Icon = meta.icon;
            return (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground">{m.doc_no}</span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                  >
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                </div>
                <div className="text-sm font-semibold">{m.item}</div>
                <div className="text-[11px] text-muted-foreground">
                  {m.sku} · {m.warehouse}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color: m.qty < 0 ? "var(--color-danger)" : "var(--color-success)",
                    }}
                  >
                    {m.qty > 0 ? `+${m.qty}` : m.qty} {m.uom}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(m.date)} · {m.ref || m.reference_type || "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Doc No</Th>
                <Th>Type</Th>
                <Th>SKU</Th>
                <Th>Item</Th>
                <Th>Warehouse</Th>
                <Th>Qty</Th>
                <Th>Closing</Th>
                <Th>Date</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const meta =
                  typeMeta[m.type] ?? {
                    icon: SlidersHorizontal,
                    label: m.type,
                    color: "var(--color-muted-foreground)",
                  };
                const Icon = meta.icon;
                return (
                  <tr key={m.id} className="border-t border-border hover:bg-secondary/40">
                    <Td className="font-mono text-xs">{m.doc_no}</Td>
                    <Td>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                      >
                        <Icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </Td>
                    <Td className="font-mono text-xs">{m.sku}</Td>
                    <Td className="font-semibold">{m.item}</Td>
                    <Td>{m.warehouse}</Td>
                    <Td
                      className="tabular-nums font-semibold"
                      style={{
                        color: m.qty < 0 ? "var(--color-danger)" : "var(--color-success)",
                      }}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty} {m.uom}
                    </Td>
                    <Td className="tabular-nums">{m.closing_qty}</Td>
                    <Td className="text-muted-foreground">{fmtDate(m.date)}</Td>
                    <Td>
                      <Tag>{m.ref || m.reference_type || "—"}</Tag>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          totalPages={ledger.data?.total_pages ?? 1}
          onPage={setPage}
          count={ledger.data?.count ?? 0}
        />
      </QueryState>
    </>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function StockTable({
  rows,
  onReorder,
  pending,
}: {
  rows: InvStockBalance[];
  onReorder: (itemId: string) => void;
  pending?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <>
      <div className="lg:hidden space-y-3">
        {rows.map((s) => {
          const isLow = s.below_reorder ?? s.on_hand < s.reorder_level;
          const pct = Math.min(100, (s.on_hand / (s.reorder_level * 2 || 1)) * 100);
          return (
            <div
              key={s.id}
              className="rounded-2xl bg-card border border-border p-4"
              style={isLow ? { borderColor: "color-mix(in oklab, var(--color-danger) 40%, var(--color-border))" } : undefined}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{s.sku}</span>
                <Tag>{s.category}</Tag>
                {isLow && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--color-danger)22", color: "var(--color-danger)" }}
                  >
                    <AlertTriangle className="h-3 w-3" /> low
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {s.warehouse}
                {s.batch_no ? ` · batch ${s.batch_no}` : ""}
                {s.expiry_date ? ` · exp ${fmtDate(s.expiry_date)}` : ""}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>
                    {s.on_hand.toLocaleString()} {s.uom} on hand · {s.reserved} reserved
                  </span>
                  <span>reorder {s.reorder_level}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isLow ? "var(--color-danger)" : "var(--color-primary)",
                    }}
                  />
                </div>
                {isLow && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onReorder(s.item_id)}
                    className="mt-2 text-[10px] font-semibold text-primary disabled:opacity-50"
                  >
                    Create reorder PR
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden lg:block rounded-2xl bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th>On Hand</Th>
              <Th>Reserved</Th>
              <Th>Reorder</Th>
              <Th>Expiry</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isLow = s.below_reorder ?? s.on_hand < s.reorder_level;
              return (
                <tr
                  key={s.id}
                  className="border-t border-border hover:bg-secondary/40"
                  style={isLow ? { backgroundColor: "color-mix(in oklab, var(--color-danger) 6%, transparent)" } : undefined}
                >
                  <Td className="font-mono text-xs">{s.sku}</Td>
                  <Td className="font-semibold">
                    <div className="flex items-center gap-2">
                      {s.name}
                      {isLow && (
                        <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--color-danger)" }} />
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Tag>{s.category}</Tag>
                  </Td>
                  <Td>{s.warehouse}</Td>
                  <Td className="font-mono text-xs">{s.batch_no || "—"}</Td>
                  <Td
                    className="tabular-nums font-semibold"
                    style={isLow ? { color: "var(--color-danger)" } : undefined}
                  >
                    {s.on_hand.toLocaleString()} {s.uom}
                  </Td>
                  <Td className="tabular-nums">{s.reserved.toLocaleString()}</Td>
                  <Td className="tabular-nums text-muted-foreground">{s.reorder_level.toLocaleString()}</Td>
                  <Td className="text-muted-foreground">{s.expiry_date ? fmtDate(s.expiry_date) : "—"}</Td>
                  <Td>
                    {isLow && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onReorder(s.item_id)}
                        className="text-[10px] font-semibold text-primary disabled:opacity-50"
                      >
                        Create PR
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load stores data from the database.
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
  style,
}: {
  label: string;
  value: number | string;
  sub?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums" style={style}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style}>
      {children}
    </td>
  );
}

function SectionToolbar({
  search,
  onSearch,
  placeholder,
  onNew,
  newLabel,
  filters,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  onNew?: () => void;
  newLabel?: string;
  filters?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none border border-transparent focus:border-primary"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {filters}
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className="h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
        >
          <Plus className="h-4 w-4" /> {newLabel || "New"}
        </button>
      )}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
  count,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  count: number;
}) {
  if (totalPages <= 1) {
    return count ? (
      <div className="mt-3 text-[11px] text-muted-foreground">{count} record(s)</div>
    ) : null;
  }
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <div className="text-[11px] text-muted-foreground">
        Page {page} / {totalPages} · {count} total
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 px-3 rounded-md text-xs font-semibold border border-border disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="h-8 px-3 rounded-md text-xs font-semibold border border-border disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function ModalActions({
  pending,
  disabled,
  onClose,
  onSave,
}: {
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 mt-2">
      <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm border border-border">
        Cancel
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onSave}
        className="h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 px-3 rounded-md text-[11px] font-semibold border border-border disabled:opacity-50"
      style={danger ? { color: "var(--color-danger)" } : { color: "var(--color-primary)" }}
    >
      {label}
    </button>
  );
}
