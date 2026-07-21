import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Plus, Search, Package, Tags, Star, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate, fmtNPR } from "@/lib/format";
import {
  commerceApi,
  type CommerceCategory,
  type CommerceOptions,
  type CommerceOrder,
  type CommerceProduct,
  type OrderAction,
} from "@/lib/commerce-api";

export const Route = createFileRoute("/commerce")({
  head: () => ({
    meta: [
      { title: "Commerce — Sunyazon BEOS" },
      {
        name: "description",
        content: "Seller Centre: products, orders, catalog and storefront metrics.",
      },
    ],
  }),
  component: Commerce,
});

type Section = "overview" | "products" | "orders" | "catalog";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "products", "orders", "catalog"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Commerce · Seller Centre", subtitle: "ecommerce.product · ecommerce.order" },
  products: { title: "Products", subtitle: "ecommerce.product" },
  orders: { title: "Orders", subtitle: "ecommerce.order" },
  catalog: { title: "Catalog", subtitle: "ecommerce.category" },
};

const inputCls =
  "h-10 w-full rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50";
const btnPrimary = {
  backgroundColor: "var(--color-primary)",
  color: "var(--color-primary-foreground)",
} as const;

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Commerce() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{flash}</div>
      )}
      {section === "overview" && <OverviewSection />}
      {section === "products" && <ProductsSection onFlash={setFlash} />}
      {section === "orders" && <OrdersSection onFlash={setFlash} />}
      {section === "catalog" && <CatalogSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["commerce", "overview"],
    queryFn: commerceApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.orders_by_status?.length ? kpi.orders_by_status : [];
  const trend = kpi?.revenue_trend?.length ? kpi.revenue_trend : [];

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load commerce data from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="GMV (30d)" value={fmtNPR(kpi?.gmv_30d ?? 0)} sub="gross merchandise" />
        <Mini label="Orders (30d)" value={(kpi?.orders_30d ?? 0).toLocaleString()} sub="placed" />
        <Mini label="AOV" value={fmtNPR(kpi?.aov ?? 0)} sub="average order" />
        <Mini
          label="Rating"
          value={`${kpi?.avg_rating ?? 0}★`}
          sub={`${kpi?.low_stock_count ?? 0} low stock`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Orders by status</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No orders yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell key={s.code} fill={chartSeries[i % chartSeries.length]} />
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
            <TrendingUp className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Revenue trend (7d)</div>
          </div>
          {trend.every((d) => !d.revenue) ? (
            <div className="text-xs text-muted-foreground">No revenue in the last 7 days.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => String(v).slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <Tooltip formatter={(v) => fmtNPR(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {(kpi?.products_by_status || []).map((s) => (
          <div key={s.code} className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{s.name}</div>
              <div className="text-xl font-bold tabular-nums mt-0.5">{s.value}</div>
            </div>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </QueryState>
  );
}

/* ── Products ─────────────────────────────────────────────────────────────── */

function ProductsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommerceProduct | null>(null);
  const qc = useQueryClient();

  const options = useQuery({
    queryKey: ["commerce", "options"],
    queryFn: commerceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["commerce", "products", search, status, category, sort, page],
    queryFn: () =>
      commerceApi.products({
        search,
        status: status || undefined,
        category: category || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      commerceApi.updateProduct(id, body),
    onSuccess: () => {
      onFlash("Product updated.");
      void qc.invalidateQueries({ queryKey: ["commerce"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => commerceApi.deleteProduct(id),
    onSuccess: () => {
      onFlash("Product deleted.");
      void qc.invalidateQueries({ queryKey: ["commerce"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const statuses = options.data?.product_statuses || [];
  const categories = options.data?.categories || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search name, SKU, brand…"
      filters={
        <>
          <select
            className={inputCls}
            style={{ width: "auto", minWidth: 140 }}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            style={{ width: "auto", minWidth: 160 }}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New product
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <ProductForm
          options={options.data}
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setShowForm(false);
            setEditing(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["commerce"] });
          }}
        />
      )}
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            { key: "name", label: "Product", sort: "name" },
            { key: "sku", label: "SKU", sort: "sku" },
            { key: "brand", label: "Brand", sort: "brand_name" },
            { key: "price", label: "Price", sort: "price" },
            { key: "stock", label: "Stock", sort: "stock_qty" },
            { key: "status", label: "Status", sort: "status" },
            { key: "actions", label: "Actions" },
          ]}
          sort={sort}
          onSort={(field) => {
            setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
            setPage(1);
          }}
          rows={(q.data?.results || []).map((row: CommerceProduct) => [
            <div key="n">
              <div className="font-semibold">{row.name}</div>
              <div className="text-[11px] text-muted-foreground">{row.category_name || "Uncategorized"}</div>
            </div>,
            <span key="s" className="font-mono text-xs">
              {row.sku || "—"}
            </span>,
            row.brand_name ? <Tag key="b" tone="brand">{row.brand_name}</Tag> : "—",
            <span key="p" className="tabular-nums font-semibold">
              {fmtNPR(row.price)}
            </span>,
            <span key="st" className="tabular-nums">
              {row.stock_qty.toLocaleString()}
            </span>,
            <StatusBadge key="sb" status={row.status} />,
            <div key="a" className="flex flex-wrap gap-1">
              {row.status === "draft" && (
                <ActionBtn
                  label="Publish"
                  onClick={() => patchMut.mutate({ id: row.id, body: { status: "published" } })}
                  disabled={patchMut.isPending}
                />
              )}
              {row.status === "published" && (
                <ActionBtn
                  label="Archive"
                  onClick={() => patchMut.mutate({ id: row.id, body: { status: "archived" } })}
                  disabled={patchMut.isPending}
                />
              )}
              {row.status === "archived" && (
                <ActionBtn
                  label="Draft"
                  onClick={() => patchMut.mutate({ id: row.id, body: { status: "draft" } })}
                  disabled={patchMut.isPending}
                />
              )}
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                onClick={() => {
                  if (confirm(`Delete product “${row.name}”?`)) deleteMut.mutate(row.id);
                }}
                disabled={deleteMut.isPending}
              />
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function ProductForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CommerceOptions;
  initial: CommerceProduct | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    sku: initial?.sku || "",
    brand_name: initial?.brand_name || "",
    price: initial ? String(initial.price) : "",
    stock_qty: initial ? String(initial.stock_qty) : "0",
    category_id: initial?.category_id || "",
    status: initial?.status || "draft",
    description: initial?.description || "",
  });
  const create = useMutation({
    mutationFn: () =>
      initial
        ? commerceApi.updateProduct(initial.id, {
            ...form,
            price: Number(form.price) || 0,
            stock_qty: Number(form.stock_qty) || 0,
            category_id: form.category_id || null,
          })
        : commerceApi.createProduct({
            ...form,
            price: Number(form.price) || 0,
            stock_qty: Number(form.stock_qty) || 0,
            category_id: form.category_id || null,
          }),
    onSuccess: () => onSaved(initial ? "Product updated." : "Product created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit product" : "New product"} onClose={onClose}>
      <Field label="Name *">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="SKU">
          <input
            className={inputCls}
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </Field>
        <Field label="Brand">
          <input
            className={inputCls}
            value={form.brand_name}
            onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
            list="commerce-brands"
          />
          <datalist id="commerce-brands">
            {options.brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Price (NPR)">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </Field>
        <Field label="Stock">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="1"
            value={form.stock_qty}
            onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select
            className={inputCls}
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">None</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={inputCls}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {options.product_statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-24 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.name.trim()}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── Orders ───────────────────────────────────────────────────────────────── */

const NEXT_ACTION: Record<string, OrderAction | null> = {
  placed: "confirm",
  confirmed: "pack",
  packed: "ship",
  shipped: "deliver",
  delivered: null,
  cancelled: null,
  returned: null,
};

const ACTION_LABEL: Record<OrderAction, string> = {
  confirm: "Confirm",
  pack: "Pack",
  ship: "Ship",
  deliver: "Deliver",
  cancel: "Cancel",
};

function OrdersSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CommerceOrder | null>(null);
  const qc = useQueryClient();

  const options = useQuery({
    queryKey: ["commerce", "options"],
    queryFn: commerceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["commerce", "orders", search, orderStatus, paymentStatus, sort, page],
    queryFn: () =>
      commerceApi.orders({
        search,
        order_status: orderStatus || undefined,
        payment_status: paymentStatus || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: OrderAction }) =>
      commerceApi.orderAction(id, action),
    onSuccess: (order) => {
      onFlash(`Order ${order.order_no} → ${order.order_status}`);
      setDetail(order);
      void qc.invalidateQueries({ queryKey: ["commerce"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const runAction = (order: CommerceOrder, action: OrderAction) => {
    const label = ACTION_LABEL[action];
    if (!confirm(`${label} order ${order.order_no}?`)) return;
    actionMut.mutate({ id: order.id, action });
  };

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search order no, buyer…"
      filters={
        <>
          <select
            className={inputCls}
            style={{ width: "auto", minWidth: 150 }}
            value={orderStatus}
            onChange={(e) => {
              setOrderStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All order statuses</option>
            {(options.data?.order_statuses || []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            style={{ width: "auto", minWidth: 150 }}
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All payment</option>
            {(options.data?.payment_statuses || []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      }
    >
      {detail && (
        <OrderDetailModal
          order={detail}
          pending={actionMut.isPending}
          onClose={() => setDetail(null)}
          onAction={(action) => runAction(detail, action)}
        />
      )}
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            { key: "order", label: "Order", sort: "order_no" },
            { key: "buyer", label: "Buyer" },
            { key: "total", label: "Total", sort: "total" },
            { key: "payment", label: "Payment", sort: "payment_status" },
            { key: "status", label: "Status", sort: "order_status" },
            { key: "date", label: "Date", sort: "created_at" },
            { key: "actions", label: "Actions" },
          ]}
          sort={sort}
          onSort={(field) => {
            setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
            setPage(1);
          }}
          rows={(q.data?.results || []).map((row: CommerceOrder) => {
            const next = NEXT_ACTION[row.order_status] || null;
            const canCancel = !["delivered", "cancelled", "returned"].includes(row.order_status);
            return [
              <button
                key="o"
                type="button"
                className="text-left"
                onClick={() => setDetail(row)}
              >
                <div className="font-mono text-xs text-primary font-semibold">{row.order_no}</div>
                <div className="text-[11px] text-muted-foreground">{row.item_count} items</div>
              </button>,
              row.buyer_name || "—",
              <span key="t" className="tabular-nums font-semibold">
                {fmtNPR(row.total)}
              </span>,
              <StatusBadge key="p" status={row.payment_status} />,
              <StatusBadge key="s" status={row.order_status} />,
              fmtDate(row.created_at),
              <div key="a" className="flex flex-wrap gap-1">
                <ActionBtn label="View" onClick={() => setDetail(row)} />
                {next && (
                  <ActionBtn
                    label={ACTION_LABEL[next]}
                    onClick={() => runAction(row, next)}
                    disabled={actionMut.isPending}
                  />
                )}
                {canCancel && (
                  <ActionBtn
                    label="Cancel"
                    danger
                    onClick={() => runAction(row, "cancel")}
                    disabled={actionMut.isPending}
                  />
                )}
              </div>,
            ];
          })}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function OrderDetailModal({
  order,
  pending,
  onClose,
  onAction,
}: {
  order: CommerceOrder;
  pending: boolean;
  onClose: () => void;
  onAction: (action: OrderAction) => void;
}) {
  const next = NEXT_ACTION[order.order_status] || null;
  const canCancel = !["delivered", "cancelled", "returned"].includes(order.order_status);

  return (
    <Modal title={`Order ${order.order_no}`} onClose={onClose}>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <StatusBadge status={order.order_status} />
        <StatusBadge status={order.payment_status} />
        <span className="text-xs text-muted-foreground">{fmtDate(order.created_at)}</span>
      </div>
      <div className="mb-3 text-sm">
        <span className="text-muted-foreground">Buyer:</span>{" "}
        <span className="font-semibold">{order.buyer_name || "—"}</span>
      </div>
      <div className="rounded-xl border border-border overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-semibold">{item.product_name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">{item.sku || "—"}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">{item.qty}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNPR(item.unit_price)}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{fmtNPR(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm mb-4">
        <span className="text-muted-foreground">Total</span>
        <span className="font-bold tabular-nums">{fmtNPR(order.total)}</span>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm border border-border">
          Close
        </button>
        {canCancel && (
          <ActionBtn label="Cancel" danger onClick={() => onAction("cancel")} disabled={pending} />
        )}
        {next && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(next)}
            className="h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={btnPrimary}
          >
            {pending ? "Working…" : ACTION_LABEL[next]}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ── Catalog (categories) ─────────────────────────────────────────────────── */

function CatalogSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CommerceCategory | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["commerce", "categories", search, page],
    queryFn: () => commerceApi.categories({ search, page, page_size: 20 }),
    enabled: authed,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => commerceApi.deleteCategory(id),
    onSuccess: () => {
      onFlash("Category deleted.");
      void qc.invalidateQueries({ queryKey: ["commerce"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search categories…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New category
        </button>
      }
    >
      {(showForm || editing) && (
        <CategoryForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setShowForm(false);
            setEditing(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["commerce"] });
          }}
        />
      )}
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            { key: "name", label: "Category" },
            { key: "slug", label: "Slug" },
            { key: "products", label: "Products" },
            { key: "order", label: "Sort" },
            { key: "active", label: "Active" },
            { key: "actions", label: "Actions" },
          ]}
          rows={(q.data?.results || []).map((row: CommerceCategory) => [
            <div key="n" className="flex items-center gap-2">
              <Tags className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{row.name}</span>
            </div>,
            <span key="s" className="font-mono text-xs">
              {row.slug}
            </span>,
            <span key="p" className="tabular-nums">
              {row.product_count}
            </span>,
            row.sort_order,
            row.is_active ? (
              <StatusBadge key="a" status="active" />
            ) : (
              <StatusBadge key="i" status="inactive" />
            ),
            <div key="act" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                onClick={() => {
                  if (confirm(`Delete category “${row.name}”?`)) deleteMut.mutate(row.id);
                }}
                disabled={deleteMut.isPending}
              />
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function CategoryForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: CommerceCategory | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    sort_order: initial ? String(initial.sort_order) : "0",
    is_active: initial?.is_active ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      initial
        ? commerceApi.updateCategory(initial.id, {
            name: form.name,
            sort_order: Number(form.sort_order) || 0,
            is_active: form.is_active,
          })
        : commerceApi.createCategory({
            name: form.name,
            sort_order: Number(form.sort_order) || 0,
            is_active: form.is_active,
          }),
    onSuccess: () => onSaved(initial ? "Category updated." : "Category created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onClose}>
      <Field label="Name *">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Sort order">
        <input
          className={inputCls}
          type="number"
          value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2 mb-3 text-sm">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        Active
      </label>
      <ModalActions
        pending={save.isPending}
        disabled={!form.name.trim()}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
          <Star className="h-3 w-3" />
          {sub}
        </div>
      )}
    </div>
  );
}

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load commerce data from the database.
    </div>
  );
}

function SectionLayout({
  search,
  onSearch,
  placeholder,
  filters,
  form,
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  filters?: React.ReactNode;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {(onSearch || filters || form) && (
        <div className="flex flex-wrap gap-2 items-center">
          {onSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className={`${inputCls} pl-9`}
                placeholder={placeholder || "Search…"}
                value={search || ""}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
          {filters}
          {form}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">{children}</div>
    </div>
  );
}

type HeaderCell = { key: string; label: string; sort?: string };

function DataTable({
  headers,
  rows,
  sort,
  onSort,
  empty = "No records yet.",
}: {
  headers: HeaderCell[];
  rows: React.ReactNode[][];
  sort?: string;
  onSort?: (field: string) => void;
  empty?: string;
}) {
  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
            {headers.map((h) => (
              <th key={h.key} className="px-4 py-3 font-semibold">
                {h.sort && onSort ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => onSort(h.sort!)}
                  >
                    {h.label}
                    {sort === h.sort ? " ↑" : sort === `-${h.sort}` ? " ↓" : ""}
                  </button>
                ) : (
                  h.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  meta,
  onPage,
}: {
  meta?: { page: number; total_pages: number; count: number } | null;
  onPage?: (page: number) => void;
}) {
  if (!meta || meta.total_pages <= 1) {
    return meta ? (
      <div className="p-3 text-[11px] text-muted-foreground border-t border-border">
        {meta.count} records
      </div>
    ) : null;
  }
  return (
    <div className="p-3 text-[11px] text-muted-foreground border-t border-border flex items-center justify-between gap-2">
      <span>
        Page {meta.page} of {meta.total_pages} · {meta.count} records
      </span>
      {onPage && (
        <div className="flex gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page >= meta.total_pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Next
          </button>
        </div>
      )}
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
        style={btnPrimary}
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
