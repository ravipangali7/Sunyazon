import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries, brand } from "@/lib/colors";
import { fmtDate, fmtNPR } from "@/lib/format";
import {
  salesApi,
  type SalesASMOrder,
  type SalesDealerOrder,
  type SalesOptions,
  type SalesOrderLine,
  type SalesParty,
  type SalesRetailOrder,
  type SalesReturn,
  type SalesScheme,
  type SalesTerritory,
} from "@/lib/sales-api";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Distribution — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Parties, territories, ASM/dealer/retail orders, returns and promotion schemes.",
      },
    ],
  }),
  component: Sales,
});

type Section =
  | "overview"
  | "parties"
  | "territories"
  | "asm"
  | "dealer"
  | "retail"
  | "returns"
  | "schemes";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = [
    "overview",
    "parties",
    "territories",
    "asm",
    "dealer",
    "retail",
    "returns",
    "schemes",
  ];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Sales", subtitle: "sales.party · territory · orders & schemes" },
  parties: { title: "Parties", subtitle: "sales.party" },
  territories: { title: "Territories", subtitle: "sales.territory" },
  asm: { title: "ASM Orders", subtitle: "sales.asm_order" },
  dealer: { title: "Dealer Orders", subtitle: "sales.dealer_sales_order" },
  retail: { title: "Retail Orders", subtitle: "sales.retail_sales_order" },
  returns: { title: "Returns", subtitle: "sales.return_order" },
  schemes: { title: "Promotion Schemes", subtitle: "sales.promotion_scheme" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Sales() {
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
      {section === "parties" && <PartiesSection onFlash={setFlash} />}
      {section === "territories" && <TerritoriesSection onFlash={setFlash} />}
      {section === "asm" && <AsmSection onFlash={setFlash} />}
      {section === "dealer" && <DealerSection onFlash={setFlash} />}
      {section === "retail" && <RetailSection onFlash={setFlash} />}
      {section === "returns" && <ReturnsSection onFlash={setFlash} />}
      {section === "schemes" && <SchemesSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["sales", "overview"],
    queryFn: salesApi.overview,
    enabled: authed,
  });

  if (!authed) return <SignInHint />;

  const d = overview.data;
  const byRegion = (d?.by_region || []).map((r) => ({
    region: r.region || r.territory,
    value: Number((r.value / 1_000_000).toFixed(2)),
    raw: r.value,
  }));
  const byType = d?.by_party_type || [];
  const byStatus = d?.by_status || [];

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Today Sales" value={fmtNPR(d?.today_sales ?? 0)} sub={`${(d?.asm_orders_today ?? 0) + (d?.dealer_orders_today ?? 0) + (d?.retail_orders_today ?? 0)} orders`} />
        <Mini label="Open" value={d?.open_orders ?? 0} sub="draft to confirm" />
        <Mini label="Approved" value={d?.approved_orders ?? 0} sub="ready to post" />
        <Mini label="Active Parties" value={d?.active_parties ?? 0} sub={`${d?.territory_count ?? 0} territories`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Returns Open" value={d?.returns_open ?? 0} sub="draft RMAs" />
        <Mini label="Active Schemes" value={d?.active_schemes ?? 0} sub="promotion schemes" />
        <Mini label="Finance SO" value={fmtNPR(d?.finance_so_total ?? 0)} sub={`${d?.finance_so_count ?? 0} docs`} />
        <Mini label="Parties" value={d?.party_count ?? 0} sub="all types" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-1">Regional Sales</div>
          <div className="text-xs text-muted-foreground mb-3">NPR by territory / area</div>
          {byRegion.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No regional sales yet</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRegion} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="region" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const raw = (item?.payload as { raw?: number })?.raw;
                      return [raw != null ? fmtNPR(raw) : `Rs ${v}M`, "Revenue"];
                    }}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="value" fill={brand.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-3">Order Status</div>
          {byStatus.length === 0 ? (
            <div className="text-sm text-muted-foreground">No orders yet</div>
          ) : (
            <div className="space-y-3 mb-4">
              {byStatus.map((s, i) => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{s.status}</span>
                  <span className="font-semibold tabular-nums" style={{ color: chartSeries[i % chartSeries.length] }}>
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-sm font-semibold mb-2">Party Mix</div>
          {byType.length === 0 ? (
            <div className="text-xs text-muted-foreground">No parties</div>
          ) : (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" innerRadius={28} outerRadius={52} paddingAngle={3}>
                    {byType.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} stroke="var(--color-card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RecentCard title="Recent ASM Orders" subtitle="sales.asm_order" empty={!d?.recent_asm?.length}>
          {(d?.recent_asm || []).map((o) => (
            <div key={o.id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold truncate">{o.party_name}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {o.product_name} · {o.qty} {o.unit || "pcs"} · {fmtNPR(o.amount)}
              </div>
            </div>
          ))}
        </RecentCard>
        <RecentCard title="Recent Dealer Orders" subtitle="sales.dealer_sales_order" empty={!d?.recent_dealer?.length}>
          {(d?.recent_dealer || []).map((o) => (
            <div key={o.id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold truncate">{o.party_name}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {o.dsm_name} · {o.line_count} lines · {fmtNPR(o.total)}
              </div>
            </div>
          ))}
        </RecentCard>
        <RecentCard title="Recent Retail Orders" subtitle="sales.retail_sales_order" empty={!d?.recent_retail?.length}>
          {(d?.recent_retail || []).map((o) => (
            <div key={o.id} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold truncate">{o.party_name}</div>
                <StatusBadge status={o.status} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {o.rsm_name} · {o.line_count} lines · {fmtNPR(o.total)}
              </div>
            </div>
          ))}
        </RecentCard>
      </div>
    </QueryState>
  );
}

function RecentCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mb-3">{subtitle}</div>
      {empty ? <div className="text-sm text-muted-foreground">No records yet</div> : children}
    </div>
  );
}

/* ── Parties ──────────────────────────────────────────────────────────────── */

function PartiesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [partyType, setPartyType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesParty | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "parties", search, partyType, status, page],
    queryFn: () =>
      salesApi.parties({
        search: search || undefined,
        party_type: partyType || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateParty(editing.id, payload) : salesApi.createParty(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Party updated." : "Party created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteParty(id),
    onSuccess: () => {
      onFlash("Party deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search party, area, ASM…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Party"
        filters={
          <>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={partyType}
              onChange={(e) => {
                setPartyType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {(options.data?.party_types || []).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All status</option>
              {(options.data?.party_statuses || []).map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </>
        }
      />

      {(showForm || editing) && (
        <PartyForm
          initial={editing}
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Area</Th>
                <Th>ASM</Th>
                <Th>Credit</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{p.name}</Td>
                  <Td>
                    <Tag>{p.party_type_label || p.party_type}</Tag>
                  </Td>
                  <Td>{p.area || "—"}</Td>
                  <Td>{p.asm_name || "—"}</Td>
                  <Td className="tabular-nums">{fmtNPR(p.credit_limit)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <RowActions
                      onEdit={() => {
                        setEditing(p);
                        setShowForm(true);
                      }}
                      onDelete={() => {
                        if (confirm(`Delete party “${p.name}”?`)) del.mutate(p.id);
                      }}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function PartyForm({
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  initial: SalesParty | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [partyType, setPartyType] = useState(initial?.party_type || "dealer");
  const [area, setArea] = useState(initial?.area || "");
  const [asmId, setAsmId] = useState(initial?.asm_id || "");
  const [credit, setCredit] = useState(String(initial?.credit_limit ?? 0));
  const [status, setStatus] = useState(initial?.status || "active");

  return (
    <Modal title={initial ? "Edit party" : "New party"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={partyType} onChange={(e) => setPartyType(e.target.value)}>
          {(options?.party_types || [
            { value: "dealer", label: "Dealer" },
            { value: "retailer", label: "Retailer" },
            { value: "institutional", label: "Institutional" },
            { value: "consumer_b2b", label: "Consumer B2B" },
          ]).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Area">
        <input className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} />
      </Field>
      <Field label="ASM">
        <select className={inputCls} value={asmId} onChange={(e) => setAsmId(e.target.value)}>
          <option value="">— None —</option>
          {(options?.employees || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name} ({e.employee_code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Credit limit">
        <input className={inputCls} type="number" value={credit} onChange={(e) => setCredit(e.target.value)} />
      </Field>
      <Field label="Status">
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          {(options?.party_statuses || [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!name.trim()}
        onClose={onClose}
        onSave={() =>
          onSave({
            name,
            party_type: partyType,
            area,
            asm_id: asmId || null,
            credit_limit: Number(credit) || 0,
            status,
          })
        }
      />
    </Modal>
  );
}

/* ── Territories ──────────────────────────────────────────────────────────── */

function TerritoriesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesTerritory | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "territories", search, page],
    queryFn: () => salesApi.territories({ search: search || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateTerritory(editing.id, payload) : salesApi.createTerritory(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Territory updated." : "Territory created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteTerritory(id),
    onSuccess: () => {
      onFlash("Territory deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search territory or region…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Territory"
      />

      {(showForm || editing) && (
        <TerritoryForm
          initial={editing}
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {rows.map((t) => (
            <div key={t.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.region || "No region"}</div>
                </div>
                <Tag tone="brand">{t.party_count} outlets</Tag>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                ASM: {t.asm_name || "—"} · Routes: {t.route_count}
              </div>
              <RowActions
                onEdit={() => {
                  setEditing(t);
                  setShowForm(true);
                }}
                onDelete={() => {
                  if (confirm(`Delete territory “${t.name}”?`)) del.mutate(t.id);
                }}
              />
            </div>
          ))}
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function TerritoryForm({
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  initial: SalesTerritory | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [region, setRegion] = useState(initial?.region || "");
  const [asmId, setAsmId] = useState(initial?.asm_id || "");

  return (
    <Modal title={initial ? "Edit territory" : "New territory"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kathmandu Valley" />
      </Field>
      <Field label="Region">
        <input className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Bagmati" />
      </Field>
      <Field label="ASM">
        <select className={inputCls} value={asmId} onChange={(e) => setAsmId(e.target.value)}>
          <option value="">— None —</option>
          {(options?.employees || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!name.trim()}
        onClose={onClose}
        onSave={() => onSave({ name, region, asm_id: asmId || null })}
      />
    </Modal>
  );
}

/* ── ASM Orders ───────────────────────────────────────────────────────────── */

function AsmSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesASMOrder | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "asm", search, status, page],
    queryFn: () =>
      salesApi.asmOrders({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateAsmOrder(editing.id, payload) : salesApi.createAsmOrder(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "ASM order updated." : "ASM order created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "post" | "cancel" }) =>
      salesApi.asmOrderAction(id, act),
    onSuccess: () => {
      onFlash("Order updated.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteAsmOrder(id),
    onSuccess: () => {
      onFlash("ASM order deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];
  const total = rows.reduce((s, o) => s + o.amount, 0);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Mini label="Orders" value={q.data?.count ?? 0} />
        <Mini label="Page Total" value={fmtNPR(total)} />
        <Mini label="Draft" value={rows.filter((o) => o.status === "draft").length} />
        <Mini label="Approved" value={rows.filter((o) => o.status === "approved").length} />
      </div>

      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search party, product, ASM…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New ASM Order"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All status</option>
            {(options.data?.doc_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
      />

      {(showForm || editing) && (
        <AsmForm
          initial={editing}
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Date</Th>
                <Th>Party</Th>
                <Th>Product</Th>
                <Th>ASM</Th>
                <Th>Qty</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="text-muted-foreground">{fmtDate(o.date)}</Td>
                  <Td className="font-semibold">{o.party_name}</Td>
                  <Td>
                    {o.product_name}
                    <div className="text-[11px] text-muted-foreground">
                      {o.qty} {o.unit || "pcs"} @ {fmtNPR(o.price)}
                    </div>
                  </Td>
                  <Td>{o.asm_name}</Td>
                  <Td className="tabular-nums">{o.qty.toLocaleString()}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(o.amount)}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 items-center">
                      {o.status === "draft" && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: o.id, act: "approve" })}
                        >
                          Approve
                        </button>
                      )}
                      <RowActions
                        onEdit={() => {
                          setEditing(o);
                          setShowForm(true);
                        }}
                        onDelete={() => {
                          if (confirm("Delete this ASM order?")) del.mutate(o.id);
                        }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function AsmForm({
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  initial: SalesASMOrder | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [partyId, setPartyId] = useState(initial?.party_id || "");
  const [asmId, setAsmId] = useState(initial?.asm_id || "");
  const [productId, setProductId] = useState(initial?.product_id || "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [unit, setUnit] = useState(initial?.unit || "pcs");
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [price, setPrice] = useState(String(initial?.price ?? 0));

  const amount = (Number(qty) || 0) * (Number(price) || 0);

  return (
    <Modal title={initial ? "Edit ASM order" : "New ASM order"} onClose={onClose}>
      <Field label="Party">
        <select className={inputCls} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">Select party…</option>
          {(options?.parties || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.party_type})
            </option>
          ))}
        </select>
      </Field>
      <Field label="ASM">
        <select className={inputCls} value={asmId} onChange={(e) => setAsmId(e.target.value)}>
          <option value="">Select ASM…</option>
          {(options?.employees || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Product">
        <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select product…</option>
          {(options?.products || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.brand_name ? ` · ${p.brand_name}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Unit">
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Qty">
          <input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Price">
          <input className={inputCls} type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <div className="text-sm mb-3">
        Amount: <span className="font-semibold tabular-nums">{fmtNPR(amount)}</span>
      </div>
      <ModalActions
        pending={pending}
        disabled={!partyId || !asmId || !productId}
        onClose={onClose}
        onSave={() =>
          onSave({
            party_id: partyId,
            asm_id: asmId,
            product_id: productId,
            date,
            unit,
            qty: Number(qty) || 0,
            price: Number(price) || 0,
            amount,
          })
        }
      />
    </Modal>
  );
}

/* ── Dealer Orders ────────────────────────────────────────────────────────── */

function DealerSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesDealerOrder | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "dealer", search, status, page],
    queryFn: () =>
      salesApi.dealerOrders({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
        include_lines: true,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateDealerOrder(editing.id, payload) : salesApi.createDealerOrder(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Dealer order updated." : "Dealer order created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "post" | "cancel" }) =>
      salesApi.dealerOrderAction(id, act),
    onSuccess: () => {
      onFlash("Order updated.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteDealerOrder(id),
    onSuccess: () => {
      onFlash("Dealer order deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search dealer or DSM…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Dealer SO"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All status</option>
            {(options.data?.doc_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
      />

      {(showForm || editing) && (
        <LinedOrderForm
          title={editing ? "Edit dealer order" : "New dealer order"}
          managerLabel="DSM"
          initial={
            editing
              ? {
                  party_id: editing.party_id,
                  manager_id: editing.dsm_id,
                  date: editing.date?.slice(0, 10) || "",
                  discount: editing.discount,
                  lines: editing.lines || [],
                }
              : null
          }
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) =>
            save.mutate({
              party_id: payload.party_id,
              dsm_id: payload.manager_id,
              date: payload.date,
              discount: payload.discount,
              lines: payload.lines,
            })
          }
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Date</Th>
                <Th>Dealer</Th>
                <Th>DSM</Th>
                <Th>Lines</Th>
                <Th>Discount</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="text-muted-foreground">{fmtDate(o.date)}</Td>
                  <Td className="font-semibold">{o.party_name}</Td>
                  <Td>{o.dsm_name}</Td>
                  <Td className="tabular-nums">{o.line_count}</Td>
                  <Td className="tabular-nums">{fmtNPR(o.discount)}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(o.total)}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 items-center">
                      {o.status === "draft" && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: o.id, act: "approve" })}
                        >
                          Approve
                        </button>
                      )}
                      <RowActions
                        onEdit={() => {
                          setEditing(o);
                          setShowForm(true);
                        }}
                        onDelete={() => {
                          if (confirm("Delete this dealer order?")) del.mutate(o.id);
                        }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

/* ── Retail Orders ────────────────────────────────────────────────────────── */

function RetailSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesRetailOrder | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "retail", search, status, page],
    queryFn: () =>
      salesApi.retailOrders({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
        include_lines: true,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateRetailOrder(editing.id, payload) : salesApi.createRetailOrder(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Retail order updated." : "Retail order created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "post" | "cancel" }) =>
      salesApi.retailOrderAction(id, act),
    onSuccess: () => {
      onFlash("Order updated.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteRetailOrder(id),
    onSuccess: () => {
      onFlash("Retail order deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search retailer or RSM…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Retail SO"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All status</option>
            {(options.data?.doc_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
      />

      {(showForm || editing) && (
        <LinedOrderForm
          title={editing ? "Edit retail order" : "New retail order"}
          managerLabel="RSM"
          showDealerLink
          initial={
            editing
              ? {
                  party_id: editing.party_id,
                  manager_id: editing.rsm_id,
                  date: editing.date?.slice(0, 10) || "",
                  discount: editing.discount,
                  dealer_order_id: editing.dealer_order_id || "",
                  lines: editing.lines || [],
                }
              : null
          }
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) =>
            save.mutate({
              party_id: payload.party_id,
              rsm_id: payload.manager_id,
              date: payload.date,
              discount: payload.discount,
              dealer_order_id: payload.dealer_order_id || null,
              lines: payload.lines,
            })
          }
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Date</Th>
                <Th>Retailer</Th>
                <Th>RSM</Th>
                <Th>Dealer SO</Th>
                <Th>Lines</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="text-muted-foreground">{fmtDate(o.date)}</Td>
                  <Td className="font-semibold">{o.party_name}</Td>
                  <Td>{o.rsm_name}</Td>
                  <Td className="text-xs">{o.dealer_order_label || "—"}</Td>
                  <Td className="tabular-nums">{o.line_count}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(o.total)}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 items-center">
                      {o.status === "draft" && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: o.id, act: "approve" })}
                        >
                          Approve
                        </button>
                      )}
                      <RowActions
                        onEdit={() => {
                          setEditing(o);
                          setShowForm(true);
                        }}
                        onDelete={() => {
                          if (confirm("Delete this retail order?")) del.mutate(o.id);
                        }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function LinedOrderForm({
  title,
  managerLabel,
  showDealerLink,
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  title: string;
  managerLabel: string;
  showDealerLink?: boolean;
  initial: {
    party_id: string;
    manager_id: string;
    date: string;
    discount: number;
    dealer_order_id?: string;
    lines: SalesOrderLine[];
  } | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: {
    party_id: string;
    manager_id: string;
    date: string;
    discount: number;
    dealer_order_id?: string;
    lines: SalesOrderLine[];
  }) => void;
}) {
  const [partyId, setPartyId] = useState(initial?.party_id || "");
  const [managerId, setManagerId] = useState(initial?.manager_id || "");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState(String(initial?.discount ?? 0));
  const [dealerOrderId, setDealerOrderId] = useState(initial?.dealer_order_id || "");
  const [lines, setLines] = useState<SalesOrderLine[]>(
    initial?.lines?.length
      ? initial.lines
      : [{ product_id: "", barcode: "", unit: "pcs", qty: 1, price: 0, amount: 0, discount: 0 }],
  );

  const lineTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0) - (Number(l.discount) || 0), 0);
  const orderTotal = Math.max(0, lineTotal - (Number(discount) || 0));

  const updateLine = (idx: number, patch: Partial<SalesOrderLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        next.amount = (Number(next.qty) || 0) * (Number(next.price) || 0) - (Number(next.discount) || 0);
        return next;
      }),
    );
  };

  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Party">
        <select className={inputCls} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">Select party…</option>
          {(options?.parties || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={managerLabel}>
        <select className={inputCls} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">Select…</option>
          {(options?.employees || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
            </option>
          ))}
        </select>
      </Field>
      {showDealerLink && (
        <Field label="Dealer order (optional)">
          <select className={inputCls} value={dealerOrderId} onChange={(e) => setDealerOrderId(e.target.value)}>
            <option value="">— None —</option>
            {(options?.dealer_orders || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Order discount">
          <input className={inputCls} type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
      </div>

      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Lines</div>
      <div className="space-y-3 mb-3">
        {lines.map((l, idx) => (
          <div key={idx} className="rounded-xl border border-border p-3 space-y-2">
            <select
              className={inputCls}
              value={l.product_id}
              onChange={(e) => updateLine(idx, { product_id: e.target.value })}
            >
              <option value="">Product…</option>
              {(options?.products || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                placeholder="Barcode"
                value={l.barcode}
                onChange={(e) => updateLine(idx, { barcode: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Unit"
                value={l.unit}
                onChange={(e) => updateLine(idx, { unit: e.target.value })}
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Qty"
                value={l.qty}
                onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Price"
                value={l.price}
                onChange={(e) => updateLine(idx, { price: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums">Line: {fmtNPR(l.amount)}</span>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-danger"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mb-3 text-xs font-semibold text-primary"
        onClick={() =>
          setLines((prev) => [
            ...prev,
            { product_id: "", barcode: "", unit: "pcs", qty: 1, price: 0, amount: 0, discount: 0 },
          ])
        }
      >
        + Add line
      </button>
      <div className="text-sm mb-3">
        Total: <span className="font-semibold tabular-nums">{fmtNPR(orderTotal)}</span>
      </div>
      <ModalActions
        pending={pending}
        disabled={!partyId || !managerId || !lines.some((l) => l.product_id)}
        onClose={onClose}
        onSave={() =>
          onSave({
            party_id: partyId,
            manager_id: managerId,
            date,
            discount: Number(discount) || 0,
            dealer_order_id: dealerOrderId || undefined,
            lines: lines.filter((l) => l.product_id),
          })
        }
      />
    </Modal>
  );
}

/* ── Returns ──────────────────────────────────────────────────────────────── */

function ReturnsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesReturn | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "returns", search, status, page],
    queryFn: () =>
      salesApi.returns({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateReturn(editing.id, payload) : salesApi.createReturn(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Return updated." : "Return created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "post" | "cancel" }) =>
      salesApi.returnAction(id, act),
    onSuccess: () => {
      onFlash("Return updated.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteReturn(id),
    onSuccess: () => {
      onFlash("Return deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search party or reason…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Return"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All status</option>
            {(options.data?.doc_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
      />

      {(showForm || editing) && (
        <ReturnForm
          initial={editing}
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Party</Th>
                <Th>Reason</Th>
                <Th>Original</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{r.party_name}</Td>
                  <Td className="max-w-[240px] truncate">{r.reason || "—"}</Td>
                  <Td className="font-mono text-xs">{r.original_order_id ? r.original_order_id.slice(0, 8) : "—"}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(r.total)}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1 items-center">
                      {r.status === "draft" && (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: r.id, act: "approve" })}
                        >
                          Approve
                        </button>
                      )}
                      <RowActions
                        onEdit={() => {
                          setEditing(r);
                          setShowForm(true);
                        }}
                        onDelete={() => {
                          if (confirm("Delete this return?")) del.mutate(r.id);
                        }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function ReturnForm({
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  initial: SalesReturn | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [partyId, setPartyId] = useState(initial?.party_id || "");
  const [reason, setReason] = useState(initial?.reason || "");
  const [total, setTotal] = useState(String(initial?.total ?? 0));
  const [original, setOriginal] = useState(initial?.original_order_id || "");

  return (
    <Modal title={initial ? "Edit return" : "New return"} onClose={onClose}>
      <Field label="Party">
        <select className={inputCls} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">Select party…</option>
          {(options?.parties || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Original order ID (optional UUID)">
        <input className={inputCls} value={original} onChange={(e) => setOriginal(e.target.value)} />
      </Field>
      <Field label="Reason">
        <textarea className={inputCls + " h-20"} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Total">
        <input className={inputCls} type="number" value={total} onChange={(e) => setTotal(e.target.value)} />
      </Field>
      <ModalActions
        pending={pending}
        disabled={!partyId}
        onClose={onClose}
        onSave={() =>
          onSave({
            party_id: partyId,
            reason,
            total: Number(total) || 0,
            original_order_id: original || null,
          })
        }
      />
    </Modal>
  );
}

/* ── Schemes ──────────────────────────────────────────────────────────────── */

function SchemesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesScheme | null>(null);

  const options = useQuery({ queryKey: ["sales", "options"], queryFn: salesApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["sales", "schemes", search, status, page],
    queryFn: () =>
      salesApi.schemes({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? salesApi.updateScheme(editing.id, payload) : salesApi.createScheme(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Scheme updated." : "Scheme created.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => salesApi.deleteScheme(id),
    onSuccess: () => {
      onFlash("Scheme deleted.");
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;
  const rows = q.data?.results || [];

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search scheme name or code…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Scheme"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All status</option>
            {(options.data?.scheme_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
      />

      {(showForm || editing) && (
        <SchemeForm
          initial={editing}
          options={options.data}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {rows.map((s) => (
            <div key={s.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground">{s.code}</div>
                  <div className="text-sm font-semibold">{s.name}</div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
              </div>
              <div className="text-lg font-bold font-display tabular-nums mb-3">{fmtNPR(s.budget)}</div>
              <RowActions
                onEdit={() => {
                  setEditing(s);
                  setShowForm(true);
                }}
                onDelete={() => {
                  if (confirm(`Delete scheme “${s.name}”?`)) del.mutate(s.id);
                }}
              />
            </div>
          ))}
        </div>
        <Pager
          page={q.data?.page || 1}
          totalPages={q.data?.total_pages || 1}
          count={q.data?.count || 0}
          onPage={setPage}
        />
      </QueryState>
    </>
  );
}

function SchemeForm({
  initial,
  options,
  pending,
  onClose,
  onSave,
}: {
  initial: SalesScheme | null;
  options?: SalesOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [code, setCode] = useState(initial?.code || "");
  const [budget, setBudget] = useState(String(initial?.budget ?? 0));
  const [start, setStart] = useState(initial?.start_date?.slice(0, 10) || "");
  const [end, setEnd] = useState(initial?.end_date?.slice(0, 10) || "");
  const [status, setStatus] = useState(initial?.status || "draft");

  return (
    <Modal title={initial ? "Edit scheme" : "New promotion scheme"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Code">
        <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field label="Budget">
        <input className={inputCls} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End">
          <input className={inputCls} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Status">
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          {(options?.scheme_statuses || [
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!name.trim() || !code.trim()}
        onClose={onClose}
        onSave={() =>
          onSave({
            name,
            code,
            budget: Number(budget) || 0,
            start_date: start || null,
            end_date: end || null,
            status,
          })
        }
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load sales data from the database.
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
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
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
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
    return count ? <div className="mt-3 text-[11px] text-muted-foreground">{count} record(s)</div> : null;
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">{label}</div>
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
      <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-sm border border-border">
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

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} className="text-[10px] font-semibold text-primary">
        Edit
      </button>
      <button type="button" onClick={onDelete} className="text-[10px] font-semibold" style={{ color: "var(--color-danger)" }}>
        Delete
      </button>
    </div>
  );
}
