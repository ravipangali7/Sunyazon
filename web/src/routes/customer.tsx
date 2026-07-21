import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, Package, Plus, Search, UserCircle, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import {
  customerApi,
  type CustomerAddress,
  type CustomerOrder,
  type CustomerOptions,
} from "@/lib/customer-api";
import { fmtDate, fmtNPR } from "@/lib/format";

export const Route = createFileRoute("/customer")({
  head: () => ({
    meta: [
      { title: "Customer Dashboard — Sunyazon BEOS" },
      {
        name: "description",
        content: "Customer self-service: orders, loyalty, addresses, nearest shops.",
      },
    ],
  }),
  component: CustomerPage,
});

type Section = "overview" | "profile" | "orders" | "nearest";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "profile", "orders", "nearest"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Customer Dashboard", subtitle: "customer.dashboard · self-service" },
  profile: { title: "My Profile", subtitle: "customer.profile · addresses" },
  orders: { title: "My Orders", subtitle: "customer.orders" },
  nearest: { title: "Nearest Shops", subtitle: "customer.nearest_shop" },
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

function CustomerPage() {
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
      {section === "profile" && <ProfileSection onFlash={setFlash} />}
      {section === "orders" && <OrdersSection />}
      {section === "nearest" && <NearestSection />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["customer", "overview"],
    queryFn: customerApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div
          className="rounded-2xl p-5 text-primary-foreground"
          style={{ background: "linear-gradient(135deg, var(--color-primary), #FFB347)" }}
        >
          <div className="text-[11px] uppercase tracking-widest opacity-80">Loyalty tier</div>
          <div className="text-3xl font-bold font-display mt-1">{kpi?.loyalty?.tier || "—"}</div>
          <div className="mt-3 text-sm">Lifetime spend {fmtNPR(kpi?.loyalty?.spend ?? 0)}</div>
        </div>
        <Mini label="Lifetime spend" value={fmtNPR(kpi?.total_spend ?? 0)} sub={`${kpi?.order_count ?? 0} orders`} />
        <Mini
          label="Open orders"
          value={kpi?.open_orders ?? 0}
          sub={`${kpi?.address_count ?? 0} addresses · ${kpi?.nearest_shops_count ?? 0} shops`}
        />
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <div className="font-semibold text-sm">Recent orders</div>
        </div>
        {(kpi?.recent_orders || []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No orders yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {(kpi?.recent_orders || []).map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </div>
        )}
      </div>
    </QueryState>
  );
}

/* ── Profile + addresses ──────────────────────────────────────────────────── */

function ProfileSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", phone: "", email: "" });
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [showForm, setShowForm] = useState(false);

  const profile = useQuery({
    queryKey: ["customer", "profile"],
    queryFn: customerApi.profile,
    enabled: authed,
  });
  const options = useQuery({
    queryKey: ["customer", "options"],
    queryFn: customerApi.options,
    enabled: authed,
  });
  const addresses = useQuery({
    queryKey: ["customer", "addresses"],
    queryFn: () => customerApi.addresses({ page_size: 50 }),
    enabled: authed,
  });

  useEffect(() => {
    if (profile.data) {
      setForm({
        full_name: profile.data.full_name || "",
        phone: profile.data.phone || "",
        email: profile.data.email || "",
      });
    }
  }, [profile.data]);

  const saveProfile = useMutation({
    mutationFn: () => customerApi.updateProfile(form),
    onSuccess: () => {
      onFlash("Profile updated.");
      void qc.invalidateQueries({ queryKey: ["customer", "profile"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => customerApi.deleteAddress(id),
    onSuccess: () => {
      onFlash("Address deleted.");
      void qc.invalidateQueries({ queryKey: ["customer"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <div className="space-y-5">
      <QueryState isLoading={profile.isLoading} isError={profile.isError} error={profile.error as Error}>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCircle className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Account</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="Full name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              className={`${inputCls} sm:col-span-2`}
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <button
            type="button"
            className={`${btnCls} mt-3`}
            style={btnPrimary}
            disabled={saveProfile.isPending}
            onClick={() => saveProfile.mutate()}
          >
            Save profile
          </button>
        </div>
      </QueryState>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Addresses</div>
          </div>
          <button
            type="button"
            className={btnCls}
            style={btnPrimary}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> New address
          </button>
        </div>

        {(showForm || editing) && options.data && (
          <AddressForm
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
              void qc.invalidateQueries({ queryKey: ["customer"] });
            }}
          />
        )}

        <QueryState
          isLoading={addresses.isLoading}
          isError={addresses.isError}
          error={addresses.error as Error}
          empty={!addresses.data?.results?.length}
          emptyLabel="No addresses saved."
        >
          <div className="divide-y divide-border">
            {(addresses.data?.results || []).map((a) => (
              <div key={a.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{a.type_label || a.type}</span>
                    {a.is_default && <Tag tone="brand">default</Tag>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {[a.street, a.ward && `Ward ${a.ward}`, a.municipality, a.district, a.country]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    className="text-xs text-primary"
                    onClick={() => {
                      setEditing(a);
                      setShowForm(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this address?")) remove.mutate(a.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </QueryState>
      </div>
    </div>
  );
}

function AddressForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CustomerOptions;
  initial: CustomerAddress | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    type: initial?.type || options.address_types[0]?.value || "home",
    country: initial?.country || "",
    district: initial?.district || "",
    municipality: initial?.municipality || "",
    ward: initial?.ward || "",
    street: initial?.street || "",
    lat: initial?.lat != null ? String(initial.lat) : "",
    lng: initial?.lng != null ? String(initial.lng) : "",
    is_default: initial?.is_default || false,
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        type: form.type,
        country: form.country,
        district: form.district,
        municipality: form.municipality,
        ward: form.ward,
        street: form.street,
        is_default: form.is_default,
        lat: form.lat === "" ? null : form.lat,
        lng: form.lng === "" ? null : form.lng,
      };
      return initial
        ? customerApi.updateAddress(initial.id, body)
        : customerApi.createAddress(body);
    },
    onSuccess: () => onSaved(initial ? "Address updated." : "Address created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <div className="p-4 border-b border-border bg-secondary/30">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{initial ? "Edit address" : "New address"}</div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className={inputCls}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {options.address_types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm px-1">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
          />
          Default address
        </label>
        <input
          className={inputCls}
          placeholder="Street"
          value={form.street}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Ward"
          value={form.ward}
          onChange={(e) => setForm({ ...form, ward: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Municipality"
          value={form.municipality}
          onChange={(e) => setForm({ ...form, municipality: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="District"
          value={form.district}
          onChange={(e) => setForm({ ...form, district: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="Country"
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputCls}
            placeholder="Lat"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Lng"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
          />
        </div>
      </div>
      <button
        type="button"
        className={`${btnCls} mt-3`}
        style={btnPrimary}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {initial ? "Update" : "Create"}
      </button>
    </div>
  );
}

/* ── Orders ───────────────────────────────────────────────────────────────── */

function OrdersSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["customer", "options"],
    queryFn: customerApi.options,
    enabled: authed,
  });
  const orders = useQuery({
    queryKey: ["customer", "orders", search, status, page],
    queryFn: () =>
      customerApi.orders({ search, order_status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const detail = useQuery({
    queryKey: ["customer", "order", selected],
    queryFn: () => customerApi.order(selected!),
    enabled: authed && !!selected,
  });

  if (!authed) return <SignInHint />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search order no…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className={`${inputCls} w-auto min-w-[140px]`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {(options.data?.order_statuses || []).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <QueryState isLoading={orders.isLoading} isError={orders.isError} error={orders.error as Error}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          {(orders.data?.results || []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No orders found.</div>
          ) : (
            <div className="divide-y divide-border">
              {(orders.data?.results || []).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="w-full text-left hover:bg-secondary/40 transition-colors"
                  onClick={() => setSelected(o.id === selected ? null : o.id)}
                >
                  <OrderRow order={o} />
                </button>
              ))}
            </div>
          )}
        </div>

        {(orders.data?.total_pages || 1) > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-primary disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-muted-foreground">
              Page {orders.data?.page} / {orders.data?.total_pages}
            </span>
            <button
              type="button"
              className="text-primary disabled:opacity-40"
              disabled={page >= (orders.data?.total_pages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </QueryState>

      {selected && (
        <QueryState isLoading={detail.isLoading} isError={detail.isError} error={detail.error as Error}>
          {detail.data && (
            <div className="rounded-2xl bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">Order {detail.data.order_no}</div>
                <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground mb-3 flex items-center gap-2 flex-wrap">
                <span>
                  {detail.data.seller_org_name} · {fmtDate(detail.data.created_at)}
                </span>
                <StatusBadge status={detail.data.payment_status} />
              </div>
              <div className="divide-y divide-border">
                {(detail.data.items || []).map((it) => (
                  <div key={it.id} className="py-2 flex justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold">{it.product_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {it.qty} × {fmtNPR(it.unit_price)}
                        {it.sku ? ` · ${it.sku}` : ""}
                      </div>
                    </div>
                    <div className="tabular-nums font-semibold">{fmtNPR(it.amount)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums">{fmtNPR(detail.data.total)}</span>
              </div>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}

/* ── Nearest shops ────────────────────────────────────────────────────────── */

function NearestSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const shops = useQuery({
    queryKey: ["customer", "nearest", search, page],
    queryFn: () => customerApi.nearest({ search, page, page_size: 20 }),
    enabled: authed,
  });

  if (!authed) return <SignInHint />;

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className={`${inputCls} pl-9`}
          placeholder="Search shop name or address…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <QueryState isLoading={shops.isLoading} isError={shops.isError} error={shops.error as Error}>
        {(shops.data?.results || []).length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-sm text-muted-foreground">
            No shops found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(shops.data?.results || []).map((s) => (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{s.name}</div>
                    {s.org_name && (
                      <div className="text-[11px] text-muted-foreground">{s.org_name}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.address || `${s.lat}, ${s.lng}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(shops.data?.total_pages || 1) > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-primary disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-muted-foreground">
              Page {shops.data?.page} / {shops.data?.total_pages}
            </span>
            <button
              type="button"
              className="text-primary disabled:opacity-40"
              disabled={page >= (shops.data?.total_pages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </QueryState>
    </div>
  );
}

/* ── Shared ───────────────────────────────────────────────────────────────── */

function OrderRow({ order }: { order: CustomerOrder }) {
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-muted-foreground">{order.order_no}</span>
          <StatusBadge status={order.order_status} />
          <span className="text-[11px] text-muted-foreground">{fmtDate(order.created_at)}</span>
        </div>
        <div className="text-sm font-semibold mt-0.5 truncate">
          {order.items_summary || `${order.item_count} items`}
          {order.seller_org_name ? ` · ${order.seller_org_name}` : ""}
        </div>
      </div>
      <div className="text-sm font-bold tabular-nums">{fmtNPR(order.total)}</div>
    </div>
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

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load customer data from the database.
    </div>
  );
}
