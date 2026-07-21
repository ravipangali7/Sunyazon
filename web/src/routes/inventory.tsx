import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import {
  inventoryApi,
  type InvAdjustment,
  type InvGRN,
  type InvItem,
  type InvMaterialIssue,
  type InvStockBalance,
  type InvWarehouse,
} from "@/lib/inventory-api";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Sunyazon BEOS" },
      {
        name: "description",
        content: "Warehouses, item master, stock ledger, GRN, adjustments and material issues.",
      },
    ],
  }),
  component: Inventory,
});

type Section =
  | "overview"
  | "warehouses"
  | "items"
  | "stock"
  | "grn"
  | "adjust"
  | "issues";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "warehouses", "items", "stock", "grn", "adjust", "issues"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Inventory", subtitle: "inventory.stock_item · warehouses" },
  warehouses: { title: "Warehouses", subtitle: "inventory.warehouse" },
  items: { title: "Item Master", subtitle: "inventory.item_master" },
  stock: { title: "Stock Ledger", subtitle: "inventory.stock_ledger" },
  grn: { title: "Goods Receipt", subtitle: "inventory.grn" },
  adjust: { title: "Stock Adjustments", subtitle: "inventory.stock_adjustment" },
  issues: { title: "Material Issues", subtitle: "inventory.material_issue" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Inventory() {
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
      {section === "warehouses" && <WarehousesSection onFlash={setFlash} />}
      {section === "items" && <ItemsSection onFlash={setFlash} />}
      {section === "stock" && <StockSection onFlash={setFlash} />}
      {section === "grn" && <GrnSection onFlash={setFlash} />}
      {section === "adjust" && <AdjustSection onFlash={setFlash} />}
      {section === "issues" && <IssuesSection onFlash={setFlash} />}
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
  const stock = useQuery({
    queryKey: ["inventory", "stock", "overview"],
    queryFn: () => inventoryApi.stock({ page_size: 50 }),
    enabled: authed,
  });
  const lowStock = useQuery({
    queryKey: ["inventory", "stock", "low"],
    queryFn: () => inventoryApi.stock({ page_size: 20, below_reorder: true }),
    enabled: authed,
  });

  const reorder = useMutation({
    mutationFn: (itemId: string) => inventoryApi.reorderPr(itemId),
    onSuccess: () => {
      onFlash("Purchase requisition created.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const kpi = overview.data;
  const catData = kpi?.by_category?.length ? kpi.by_category : [];
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
  const tableRows = (stock.data?.results || []) as InvStockBalance[];

  if (!authed) {
    return <SignInHint />;
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="SKUs" value={kpi?.sku_count ?? 0} sub="tracked" />
        <Mini label="Below Reorder" value={kpi?.below_reorder ?? 0} sub="needs PR" />
        <Mini label="Warehouses" value={kpi?.warehouse_count ?? 0} sub="active" />
        <Mini
          label="Categories"
          value={kpi?.category_count ?? 0}
          sub={catData.map((c) => c.code.toUpperCase().slice(0, 3)).join(" · ") || "RM · PKG · FG"}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Pending GRNs" value={kpi?.pending_grns ?? 0} sub="draft / received" />
        <Mini label="Pending Audits" value={kpi?.pending_adjustments ?? 0} sub="awaiting approve" />
        <Mini label="Open Issues" value={kpi?.open_issues ?? 0} sub="draft / approved" />
        <Mini label="Movements Today" value={kpi?.movements_today ?? 0} sub="ledger rows" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5 lg:col-span-1">
          <div className="text-sm font-semibold mb-3">By category</div>
          {catData.length === 0 ? (
            <div className="text-xs text-muted-foreground">No items yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {catData.map((_, i) => (
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

      <StockTable
        rows={tableRows}
        onReorder={(id) => reorder.mutate(id)}
        pending={reorder.isPending}
      />
    </QueryState>
  );
}

/* ── Warehouses ───────────────────────────────────────────────────────────── */

function WarehousesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvWarehouse | null>(null);

  const q = useQuery({
    queryKey: ["inventory", "warehouses", search, typeFilter, page],
    queryFn: () =>
      inventoryApi.warehouses({
        search: search || undefined,
        type: typeFilter || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? inventoryApi.updateWarehouse(editing.id, payload)
        : inventoryApi.createWarehouse(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Warehouse updated." : "Warehouse created.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteWarehouse(id),
    onSuccess: () => {
      onFlash("Warehouse deleted.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
        placeholder="Search warehouses…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Warehouse"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            <option value="raw">Raw</option>
            <option value="finished">Finished</option>
            <option value="spare">Spare</option>
            <option value="packaging">Packaging</option>
          </select>
        }
      />

      {(showForm || editing) && (
        <WarehouseForm
          initial={editing}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Address</Th>
                <Th>Items</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((w) => (
                <tr key={w.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{w.code}</Td>
                  <Td className="font-semibold">{w.name}</Td>
                  <Td>
                    <Tag>{w.type_label}</Tag>
                  </Td>
                  <Td className="text-muted-foreground max-w-[240px] truncate">{w.address || "—"}</Td>
                  <Td className="tabular-nums">{w.item_count}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(w);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(w.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function WarehouseForm({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: InvWarehouse | null;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "raw");
  const [address, setAddress] = useState(initial?.address || "");
  return (
    <Modal title={initial ? "Edit warehouse" : "New warehouse"} onClose={onClose}>
      <Field label="Code">
        <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!initial} />
      </Field>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="raw">Raw</option>
          <option value="finished">Finished</option>
          <option value="spare">Spare</option>
          <option value="packaging">Packaging</option>
        </select>
      </Field>
      <Field label="Address">
        <textarea className={inputCls + " h-20"} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <ModalActions
        pending={pending}
        disabled={!code.trim() || !name.trim()}
        onClose={onClose}
        onSave={() => onSave({ code, name, type, address })}
      />
    </Modal>
  );
}

/* ── Item Master ──────────────────────────────────────────────────────────── */

function ItemsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InvItem | null>(null);

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["inventory", "items", search, category, page],
    queryFn: () =>
      inventoryApi.items({
        search: search || undefined,
        category: category || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? inventoryApi.updateItem(editing.id, payload) : inventoryApi.createItem(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Item updated." : "Item created.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteItem(id),
    onSuccess: () => {
      onFlash("Item deleted.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
        placeholder="Search SKU or name…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Item"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            <option value="raw">Raw Material</option>
            <option value="packaging">Packaging</option>
            <option value="finished">Finished Goods</option>
            <option value="spare">Spare Part</option>
          </select>
        }
      />

      {(showForm || editing) && (
        <ItemForm
          initial={editing}
          vendors={options.data?.vendors || []}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="lg:hidden space-y-3 mb-4">
          {(q.data?.results || []).map((item) => {
            const pct = item.max_stock
              ? Math.min(100, (item.on_hand / item.max_stock) * 100)
              : Math.min(100, (item.on_hand / (item.reorder_level * 2 || 1)) * 100);
            const isLow = item.on_hand <= item.reorder_level;
            return (
              <div key={item.id} className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground">{item.item_code}</span>
                  <Tag>{item.category_label}</Tag>
                </div>
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  On hand {item.on_hand.toLocaleString()} {item.uom} · reorder {item.reorder_level}
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isLow ? "var(--color-danger)" : "var(--color-primary)",
                    }}
                  />
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
                <Th>UOM</Th>
                <Th>On Hand</Th>
                <Th>Min</Th>
                <Th>Reorder</Th>
                <Th>Max</Th>
                <Th>Bin</Th>
                <Th>Supplier</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((item) => {
                const isLow = item.on_hand <= item.reorder_level;
                return (
                  <tr key={item.id} className="border-t border-border hover:bg-secondary/40">
                    <Td className="font-mono text-xs">{item.item_code}</Td>
                    <Td className="font-semibold">
                      <div className="flex items-center gap-2">
                        {item.name}
                        {isLow && (
                          <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--color-danger)" }} />
                        )}
                      </div>
                    </Td>
                    <Td>
                      <Tag>{item.category_label}</Tag>
                    </Td>
                    <Td>{item.uom}</Td>
                    <Td
                      className="tabular-nums font-semibold"
                      style={isLow ? { color: "var(--color-danger)" } : undefined}
                    >
                      {item.on_hand.toLocaleString()}
                    </Td>
                    <Td className="tabular-nums text-muted-foreground">{item.min_stock}</Td>
                    <Td className="tabular-nums text-muted-foreground">{item.reorder_level}</Td>
                    <Td className="tabular-nums text-muted-foreground">{item.max_stock}</Td>
                    <Td className="font-mono text-xs">{item.bin_location || "—"}</Td>
                    <Td className="text-muted-foreground">{item.supplier_name || "—"}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary"
                          onClick={() => {
                            setEditing(item);
                            setShowForm(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold"
                          style={{ color: "var(--color-danger)" }}
                          onClick={() => del.mutate(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function ItemForm({
  initial,
  vendors,
  pending,
  onClose,
  onSave,
}: {
  initial: InvItem | null;
  vendors: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [itemCode, setItemCode] = useState(initial?.item_code || "");
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "raw");
  const [uom, setUom] = useState(initial?.uom || "pcs");
  const [minStock, setMinStock] = useState(String(initial?.min_stock ?? 0));
  const [maxStock, setMaxStock] = useState(String(initial?.max_stock ?? 0));
  const [reorder, setReorder] = useState(String(initial?.reorder_level ?? 0));
  const [bin, setBin] = useState(initial?.bin_location || "");
  const [supplierId, setSupplierId] = useState(initial?.supplier_id || "");

  return (
    <Modal title={initial ? "Edit item" : "New item"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Item code">
          <input
            className={inputCls}
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            disabled={!!initial}
            placeholder="RM- / PM- / FG- / SP-"
          />
        </Field>
        <Field label="Category">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="raw">Raw Material</option>
            <option value="packaging">Packaging</option>
            <option value="finished">Finished Goods</option>
            <option value="spare">Spare Part</option>
          </select>
        </Field>
      </div>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="UOM">
          <input className={inputCls} value={uom} onChange={(e) => setUom(e.target.value)} />
        </Field>
        <Field label="Bin location">
          <input className={inputCls} value={bin} onChange={(e) => setBin(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Min">
          <input className={inputCls} type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </Field>
        <Field label="Reorder">
          <input className={inputCls} type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} />
        </Field>
        <Field label="Max">
          <input className={inputCls} type="number" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} />
        </Field>
      </div>
      <Field label="Supplier">
        <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— None —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!itemCode.trim() || !name.trim()}
        onClose={onClose}
        onSave={() =>
          onSave({
            item_code: itemCode,
            name,
            category,
            uom,
            min_stock: Number(minStock) || 0,
            max_stock: Number(maxStock) || 0,
            reorder_level: Number(reorder) || 0,
            bin_location: bin,
            supplier_id: supplierId || null,
          })
        }
      />
    </Modal>
  );
}

/* ── Stock Ledger ─────────────────────────────────────────────────────────── */

function StockSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [txType, setTxType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"balances" | "ledger">("ledger");

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const balances = useQuery({
    queryKey: ["inventory", "stock", search, warehouseId, page],
    queryFn: () =>
      inventoryApi.stock({
        search: search || undefined,
        warehouse_id: warehouseId || undefined,
        page,
        page_size: 25,
      }),
    enabled: authed && tab === "balances",
  });

  const ledger = useQuery({
    queryKey: ["inventory", "ledger", search, txType, warehouseId, page],
    queryFn: () =>
      inventoryApi.ledger({
        search: search || undefined,
        transaction_type: txType || undefined,
        warehouse_id: warehouseId || undefined,
        page,
        page_size: 25,
      }),
    enabled: authed && tab === "ledger",
  });

  const reorder = useMutation({
    mutationFn: (itemId: string) => inventoryApi.reorderPr(itemId),
    onSuccess: () => onFlash("Purchase requisition created."),
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const active = tab === "ledger" ? ledger : balances;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setTab("ledger");
            setPage(1);
          }}
          className={`h-9 px-3 rounded-lg text-sm font-semibold border ${tab === "ledger" ? "border-primary bg-primary/10" : "border-border"}`}
        >
          Movements
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("balances");
            setPage(1);
          }}
          className={`h-9 px-3 rounded-lg text-sm font-semibold border ${tab === "balances" ? "border-primary bg-primary/10" : "border-border"}`}
        >
          On-hand balances
        </button>
      </div>

      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search SKU, item, reference…"
        filters={
          <>
            {tab === "ledger" && (
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
            )}
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
        isLoading={active.isLoading}
        isError={active.isError}
        error={active.error as Error}
        empty={!active.data?.results.length}
      >
        {tab === "balances" ? (
          <StockTable
            rows={(balances.data?.results || []) as InvStockBalance[]}
            onReorder={(id) => reorder.mutate(id)}
            pending={reorder.isPending}
          />
        ) : (
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                  <Th>Date</Th>
                  <Th>Doc</Th>
                  <Th>Type</Th>
                  <Th>SKU</Th>
                  <Th>Item</Th>
                  <Th>Warehouse</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Closing</Th>
                  <Th>Ref</Th>
                </tr>
              </thead>
              <tbody>
                {(ledger.data?.results || []).map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-secondary/40">
                    <Td className="text-muted-foreground">{e.date}</Td>
                    <Td className="font-mono text-xs">{e.doc_no}</Td>
                    <Td>
                      <Tag>{e.type}</Tag>
                    </Td>
                    <Td className="font-mono text-xs">{e.sku}</Td>
                    <Td className="font-semibold">{e.item}</Td>
                    <Td>{e.warehouse}</Td>
                    <Td className="tabular-nums" style={{ color: "var(--color-success)" }}>
                      {e.in_qty || "—"}
                    </Td>
                    <Td className="tabular-nums" style={{ color: "var(--color-danger)" }}>
                      {e.out_qty || "—"}
                    </Td>
                    <Td className="tabular-nums font-semibold">{e.closing_qty}</Td>
                    <Td>
                      <Tag>{e.ref || e.reference_type || "—"}</Tag>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          totalPages={active.data?.total_pages ?? 1}
          onPage={setPage}
          count={active.data?.count ?? 0}
        />
      </QueryState>
    </>
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
    queryKey: ["inventory", "grns", search, status, page],
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
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
                    {g.date} · {g.line_count} line(s) · {g.item} × {g.qty} {g.uom}
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

/* ── Adjustments ──────────────────────────────────────────────────────────── */

function AdjustSection({ onFlash }: { onFlash: (m: string | null) => void }) {
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
    queryKey: ["inventory", "adjustments", search, status, page],
    queryFn: () =>
      inventoryApi.adjustments({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => inventoryApi.createAdjustment(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Adjustment created.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => inventoryApi.adjustmentAction(id, "approve"),
    onSuccess: () => {
      onFlash("Adjustment approved — ledger posted.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
        placeholder="Search item / reason…"
        onNew={() => setShowForm(true)}
        newLabel="New Adjustment"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select>
        }
      />

      {showForm && (
        <AdjustForm
          items={options.data?.items || []}
          warehouses={options.data?.warehouses || []}
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
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Date</Th>
                <Th>SKU</Th>
                <Th>Item</Th>
                <Th>Warehouse</Th>
                <Th>System</Th>
                <Th>Physical</Th>
                <Th>Variance</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((a: InvAdjustment) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="text-muted-foreground">{a.date}</Td>
                  <Td className="font-mono text-xs">{a.item_code}</Td>
                  <Td className="font-semibold">{a.item_name}</Td>
                  <Td>{a.warehouse_code}</Td>
                  <Td className="tabular-nums">{a.system_qty}</Td>
                  <Td className="tabular-nums">{a.physical_qty}</Td>
                  <Td
                    className="tabular-nums font-semibold"
                    style={{
                      color:
                        a.variance < 0
                          ? "var(--color-danger)"
                          : a.variance > 0
                            ? "var(--color-success)"
                            : undefined,
                    }}
                  >
                    {a.variance > 0 ? `+${a.variance}` : a.variance}
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                  <Td>
                    {a.status === "pending" && (
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(a.id)}
                      >
                        Approve
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function AdjustForm({
  items,
  warehouses,
  pending,
  onClose,
  onSave,
}: {
  items: { id: string; item_code: string; name: string; uom: string }[];
  warehouses: { id: string; code: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [physical, setPhysical] = useState("0");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Modal title="Physical stock audit" onClose={onClose}>
      <Field label="Item">
        <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.item_code} — {i.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Warehouse">
        <select className={inputCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Physical qty">
          <input
            className={inputCls}
            type="number"
            value={physical}
            onChange={(e) => setPhysical(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason">
        <textarea className={inputCls + " h-20"} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ModalActions
        pending={pending}
        disabled={!itemId || !warehouseId}
        onClose={onClose}
        onSave={() =>
          onSave({
            item_id: itemId,
            warehouse_id: warehouseId,
            physical_qty: Number(physical) || 0,
            reason,
            date,
          })
        }
      />
    </Modal>
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

  const options = useQuery({
    queryKey: ["inventory", "options"],
    queryFn: inventoryApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["inventory", "issues", search, status, page],
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
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "issue" | "cancel" }) =>
      inventoryApi.materialIssueAction(id, act),
    onSuccess: (_, vars) => {
      onFlash(`Issue ${vars.act} completed.`);
      void qc.invalidateQueries({ queryKey: ["inventory"] });
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
                    {iss.date} · {iss.line_count} line(s) · total issued {iss.total_issued}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
            <div key={s.id} className="rounded-2xl bg-card border border-border p-4">
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
                Batch {s.batch_no} · {s.warehouse}
                {s.expiry_date ? ` · exp ${s.expiry_date}` : ""}
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
                    Create PR
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
                <tr key={s.id} className="border-t border-border hover:bg-secondary/40">
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
                  <Td className="font-mono text-xs">{s.batch_no}</Td>
                  <Td
                    className="tabular-nums font-semibold"
                    style={isLow ? { color: "var(--color-danger)" } : undefined}
                  >
                    {s.on_hand.toLocaleString()} {s.uom}
                  </Td>
                  <Td className="tabular-nums">{s.reserved.toLocaleString()}</Td>
                  <Td className="tabular-nums text-muted-foreground">{s.reorder_level.toLocaleString()}</Td>
                  <Td className="text-muted-foreground">{s.expiry_date ?? "—"}</Td>
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

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load inventory data from the database.
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
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
