import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Factory, Beaker, Package, Cog, PieChart, AlertTriangle, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { brand } from "@/lib/colors";
import {
  productionApi,
  type BOM,
  type ProductionWorkOrder,
} from "@/lib/production-api";

export const Route = createFileRoute("/production")({
  head: () => ({
    meta: [
      { title: "Production — Sunyazon BEOS" },
      {
        name: "description",
        content: "BOM, batches, work orders, WIP, costing, damage and working reports.",
      },
    ],
  }),
  component: Production,
});

type Section = "overview" | "bom" | "batches" | "workorders" | "wip" | "costing" | "damage" | "reports";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "bom", "batches", "workorders", "wip", "costing", "damage", "reports"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Production", subtitle: "production.work_order · today’s schedule" },
  bom: { title: "BOM & Recipes", subtitle: "production.bom · bom_line" },
  batches: { title: "Batches", subtitle: "production.batch" },
  workorders: { title: "Work Orders", subtitle: "production.work_order" },
  wip: { title: "WIP Tracking", subtitle: "production.wip_tracking" },
  costing: { title: "Production Costing", subtitle: "production.production_costing" },
  damage: { title: "Damage / Expire", subtitle: "production.damage_expire" },
  reports: { title: "Working Reports", subtitle: "production.working_report" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Production() {
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
      {section === "bom" && <BomSection onFlash={setFlash} />}
      {section === "batches" && <BatchesSection onFlash={setFlash} />}
      {section === "workorders" && <WorkOrdersSection onFlash={setFlash} />}
      {section === "wip" && <WipSection onFlash={setFlash} />}
      {section === "costing" && <CostingSection onFlash={setFlash} />}
      {section === "damage" && <DamageSection onFlash={setFlash} />}
      {section === "reports" && <ReportsSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["production", "overview"],
    queryFn: productionApi.overview,
    enabled: authed,
  });
  const workOrders = useQuery({
    queryKey: ["production", "work-orders", "overview"],
    queryFn: () => productionApi.workOrders({ page_size: 20 }),
    enabled: authed,
  });

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load production data from the database.
      </div>
    );
  }

  const kpi = overview.data;
  const total = kpi?.planned_qty ?? 0;
  const produced = kpi?.produced_qty ?? 0;
  const pct = total ? ((produced / total) * 100).toFixed(0) : "—";

  return (
    <QueryState isLoading={overview.isLoading || workOrders.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Planned" value={(kpi?.planned_qty ?? 0).toLocaleString()} sub="units" />
        <Mini label="Produced" value={(kpi?.produced_qty ?? 0).toLocaleString()} sub={total ? `${pct}% of plan` : "—"} />
        <Mini label="Work Orders" value={kpi?.work_orders ?? 0} sub={`${kpi?.in_progress ?? 0} in progress`} />
        <Mini label="On Hold" value={kpi?.on_hold ?? 0} sub={`${kpi?.damage_open ?? 0} damage open`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="BOMs" value={kpi?.boms ?? 0} sub="active recipes" icon={<Beaker className="h-3.5 w-3.5" />} />
        <Mini label="Batches" value={kpi?.batches_active ?? 0} sub="planned / active" icon={<Package className="h-3.5 w-3.5" />} />
        <Mini label="WIP today" value={(kpi?.wip_closing ?? 0).toLocaleString()} sub="closing qty" icon={<Cog className="h-3.5 w-3.5" />} />
        <Mini label="Costing" value={(kpi?.costing_total ?? 0).toLocaleString()} sub="total cost" icon={<PieChart className="h-3.5 w-3.5" />} />
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Factory className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Recent work orders</div>
        </div>
        <QueryState
          isLoading={workOrders.isLoading}
          isError={workOrders.isError}
          error={workOrders.error as Error}
          empty={!workOrders.data?.results.length}
        >
          <WorkOrderTable rows={workOrders.data?.results || []} onFlash={onFlash} compact />
        </QueryState>
      </div>
    </QueryState>
  );
}

/* ── BOM ──────────────────────────────────────────────────────────────────── */

function BomSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "boms", search, status],
    queryFn: () => productionApi.boms({ search, status: status || undefined, page_size: 50 }),
    enabled: authed,
  });
  const detail = useQuery({
    queryKey: ["production", "bom", selectedId],
    queryFn: () => productionApi.bom(selectedId!),
    enabled: authed && !!selectedId,
  });

  const [form, setForm] = useState({
    code: "",
    name: "",
    finished_item_id: "",
    version: "1",
    raw_material_id: "",
    qty_per_unit: "1",
    uom: "pcs",
    scrap_pct: "",
  });

  const create = useMutation({
    mutationFn: () => {
      const lines = form.raw_material_id
        ? [
            {
              raw_material_id: form.raw_material_id,
              qty_per_unit: Number(form.qty_per_unit) || 1,
              uom: form.uom || "pcs",
              scrap_pct: form.scrap_pct ? Number(form.scrap_pct) : null,
            },
          ]
        : [];
      return productionApi.createBom({
        code: form.code,
        name: form.name,
        finished_item_id: form.finished_item_id,
        version: Number(form.version) || 1,
        lines,
      });
    },
    onSuccess: (bom) => {
      onFlash(`BOM ${bom.code} v${bom.version} created.`);
      setForm({ code: "", name: "", finished_item_id: "", version: "1", raw_material_id: "", qty_per_unit: "1", uom: "pcs", scrap_pct: "" });
      setSelectedId(bom.id);
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => productionApi.updateBom(id, { status: "approved" }),
    onSuccess: () => {
      onFlash("BOM approved.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productionApi.deleteBom(id),
    onSuccess: () => {
      onFlash("BOM removed / marked obsolete.");
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const addLine = useMutation({
    mutationFn: () =>
      productionApi.addBomLine(selectedId!, {
        raw_material_id: form.raw_material_id,
        qty_per_unit: Number(form.qty_per_unit) || 1,
        uom: form.uom || "pcs",
        scrap_pct: form.scrap_pct ? Number(form.scrap_pct) : null,
      }),
    onSuccess: () => {
      onFlash("BOM line added.");
      void qc.invalidateQueries({ queryKey: ["production", "bom", selectedId] });
      void qc.invalidateQueries({ queryKey: ["production", "boms"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search BOM code, name, finished item…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="obsolete">Obsolete</option>
        </select>
      }
      form={
        <div className="space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" /> New BOM / Recipe
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className={inputCls} placeholder="Code *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input className={inputCls} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputCls} placeholder="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            <select className={inputCls} value={form.finished_item_id} onChange={(e) => setForm({ ...form, finished_item_id: e.target.value })}>
              <option value="">Finished item *</option>
              {(options.data?.items || []).map((i) => (
                <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
              ))}
            </select>
            <select className={inputCls} value={form.raw_material_id} onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })}>
              <option value="">Raw material (optional first line)</option>
              {(options.data?.items || []).map((i) => (
                <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputCls} placeholder="Qty/unit" value={form.qty_per_unit} onChange={(e) => setForm({ ...form, qty_per_unit: e.target.value })} />
              <input className={inputCls} placeholder="UOM" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
              <input className={inputCls} placeholder="Scrap %" value={form.scrap_pct} onChange={(e) => setForm({ ...form, scrap_pct: e.target.value })} />
            </div>
            <button
              type="button"
              disabled={!form.code.trim() || !form.name.trim() || !form.finished_item_id || create.isPending}
              onClick={() => create.mutate()}
              className={btnCls}
            >
              <Plus className="h-4 w-4" /> Create BOM
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div>
          <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
            <DataTable
              headers={["Code", "Name", "Finished", "Ver", "Lines", "Status", ""]}
              rows={(q.data?.results || []).map((b: BOM) => [
                <button key="c" type="button" className="font-mono text-xs text-primary" onClick={() => setSelectedId(b.id)}>{b.code}</button>,
                b.name,
                b.finished_item_name || b.finished_item_code || "—",
                String(b.version),
                String(b.line_count),
                <StatusBadge key="s" status={b.status} />,
                <div key="a" className="flex gap-2">
                  {b.status === "draft" && (
                    <button type="button" className="text-xs text-primary" onClick={() => approve.mutate(b.id)}>Approve</button>
                  )}
                  <button type="button" className="text-xs text-destructive" onClick={() => remove.mutate(b.id)}>Delete</button>
                </div>,
              ])}
            />
            <Pager meta={q.data} />
          </QueryState>
        </div>
        <div className="p-4">
          {!selectedId && <div className="text-sm text-muted-foreground">Select a BOM to view lines.</div>}
          {selectedId && (
            <QueryState isLoading={detail.isLoading} isError={detail.isError} error={detail.error as Error}>
              {detail.data && (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">{detail.data.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {detail.data.code} v{detail.data.version} · {detail.data.finished_item_name}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select className={inputCls} value={form.raw_material_id} onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })}>
                      <option value="">Add raw material…</option>
                      {(options.data?.items || []).map((i) => (
                        <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                      ))}
                    </select>
                    <input className={inputCls} placeholder="Qty" value={form.qty_per_unit} onChange={(e) => setForm({ ...form, qty_per_unit: e.target.value })} />
                    <button type="button" className={btnCls} disabled={!form.raw_material_id || addLine.isPending} onClick={() => addLine.mutate()}>
                      Add
                    </button>
                  </div>
                  <DataTable
                    headers={["RM", "Qty/unit", "UOM", "Scrap %"]}
                    rows={(detail.data.lines || []).map((l) => [
                      `${l.raw_material_code} — ${l.raw_material_name}`,
                      String(l.qty_per_unit),
                      l.uom,
                      l.scrap_pct != null ? String(l.scrap_pct) : "—",
                    ])}
                    empty="No BOM lines yet."
                  />
                </div>
              )}
            </QueryState>
          )}
        </div>
      </div>
    </SectionLayout>
  );
}

/* ── Batches ──────────────────────────────────────────────────────────────── */

function BatchesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "batches", search, status],
    queryFn: () => productionApi.batches({ search, status: status || undefined, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    batch_no: "",
    output_item_id: "",
    work_order_id: "",
    batch_size: "",
    start_date: "",
    expire_date: "",
    supervisor_id: "",
  });

  const create = useMutation({
    mutationFn: () =>
      productionApi.createBatch({
        batch_no: form.batch_no || undefined,
        output_item_id: form.output_item_id || undefined,
        work_order_id: form.work_order_id || undefined,
        batch_size: form.batch_size ? Number(form.batch_size) : 0,
        start_date: form.start_date || undefined,
        expire_date: form.expire_date || undefined,
        supervisor_id: form.supervisor_id || undefined,
      }),
    onSuccess: (b) => {
      onFlash(`Batch ${b.batch_no} created.`);
      setForm({ batch_no: "", output_item_id: "", work_order_id: "", batch_size: "", start_date: "", expire_date: "", supervisor_id: "" });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "quarantine" | "close" | "activate" }) =>
      productionApi.batchAction(id, act),
    onSuccess: (b) => {
      onFlash(`Batch ${b.batch_no} → ${b.status}`);
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search batch no, item…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="quarantined">Quarantined</option>
        </select>
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className={inputCls} placeholder="Batch no (auto if blank)" value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
          <select className={inputCls} value={form.output_item_id} onChange={(e) => setForm({ ...form, output_item_id: e.target.value })}>
            <option value="">Output item</option>
            {(options.data?.items || []).map((i) => (
              <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
            <option value="">Work order</option>
            {(options.data?.work_orders || []).map((w) => (
              <option key={w.id} value={w.id}>{w.wo_no} — {w.title}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="Batch size" value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} />
          <input className={inputCls} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <input className={inputCls} type="date" value={form.expire_date} onChange={(e) => setForm({ ...form, expire_date: e.target.value })} />
          <select className={inputCls} value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
            <option value="">Supervisor</option>
            {(options.data?.employees || []).map((e) => (
              <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
            ))}
          </select>
          <button type="button" className={btnCls} disabled={create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> Create batch
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Batch", "Item", "WO", "Size", "Start", "Expiry", "Status", "Actions"]}
          rows={(q.data?.results || []).map((b) => [
            <span key="n" className="font-mono text-xs">{b.batch_no}</span>,
            b.output_item_name || b.product_name || "—",
            b.work_order_no || "—",
            String(b.batch_size),
            b.start_date || "—",
            b.expire_date || "—",
            <StatusBadge key="s" status={b.status} />,
            <div key="a" className="flex flex-wrap gap-2">
              {b.status === "planned" && (
                <button type="button" className="text-xs text-primary" onClick={() => action.mutate({ id: b.id, act: "activate" })}>Activate</button>
              )}
              {b.status !== "quarantined" && b.status !== "closed" && (
                <button type="button" className="text-xs text-amber-600" onClick={() => action.mutate({ id: b.id, act: "quarantine" })}>Quarantine</button>
              )}
              {b.status !== "closed" && (
                <button type="button" className="text-xs text-muted-foreground" onClick={() => action.mutate({ id: b.id, act: "close" })}>Close</button>
              )}
            </div>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Work Orders ──────────────────────────────────────────────────────────── */

function WorkOrdersSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "work-orders", search, status],
    queryFn: () => productionApi.workOrders({ search, status: status || undefined, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    title: "",
    process_definition_id: "",
    bom_id: "",
    batch_id: "",
    output_item_id: "",
    target_qty: "",
    uom: "pcs",
    priority: "medium",
    brand: "",
    line: "",
    department_id: "",
    supervisor_id: "",
  });

  const create = useMutation({
    mutationFn: () =>
      productionApi.createWorkOrder({
        title: form.title,
        process_definition_id: form.process_definition_id,
        bom_id: form.bom_id || undefined,
        batch_id: form.batch_id || undefined,
        output_item_id: form.output_item_id || undefined,
        target_qty: form.target_qty ? Number(form.target_qty) : undefined,
        uom: form.uom,
        priority: form.priority,
        brand: form.brand || undefined,
        line: form.line || undefined,
        department_id: form.department_id || undefined,
        supervisor_id: form.supervisor_id || undefined,
      }),
    onSuccess: (wo) => {
      onFlash(`Work order ${wo.wo_no} created.`);
      setForm({
        title: "",
        process_definition_id: "",
        bom_id: "",
        batch_id: "",
        output_item_id: "",
        target_qty: "",
        uom: "pcs",
        priority: "medium",
        brand: "",
        line: "",
        department_id: "",
        supervisor_id: "",
      });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search WO no, title, product, batch…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="released">Released</option>
          <option value="in_progress">In progress</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      }
      form={
        <div className="space-y-2">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Factory className="h-4 w-4 text-primary" /> New work order
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className={inputCls} placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className={inputCls} value={form.process_definition_id} onChange={(e) => setForm({ ...form, process_definition_id: e.target.value })}>
              <option value="">Process definition *</option>
              {(options.data?.definitions || []).map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
            <input className={inputCls} placeholder="Target qty" value={form.target_qty} onChange={(e) => setForm({ ...form, target_qty: e.target.value })} />
            <select className={inputCls} value={form.bom_id} onChange={(e) => setForm({ ...form, bom_id: e.target.value })}>
              <option value="">BOM (optional)</option>
              {(options.data?.boms || []).map((b) => (
                <option key={b.id} value={b.id}>{b.code} v{b.version} — {b.name}</option>
              ))}
            </select>
            <select className={inputCls} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
              <option value="">Batch (optional)</option>
              {(options.data?.batches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.batch_no}</option>
              ))}
            </select>
            <select className={inputCls} value={form.output_item_id} onChange={(e) => setForm({ ...form, output_item_id: e.target.value })}>
              <option value="">Output item</option>
              {(options.data?.items || []).map((i) => (
                <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
              ))}
            </select>
            <input className={inputCls} placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <input className={inputCls} placeholder="Line / station" value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} />
            <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select className={inputCls} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">Department</option>
              {(options.data?.departments || []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select className={inputCls} value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
              <option value="">Supervisor</option>
              {(options.data?.employees || []).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button
              type="button"
              className={btnCls}
              disabled={!form.title.trim() || !form.process_definition_id || create.isPending}
              onClick={() => create.mutate()}
            >
              <Plus className="h-4 w-4" /> Create WO
            </button>
          </div>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <WorkOrderTable rows={q.data?.results || []} onFlash={onFlash} />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

function WorkOrderTable({
  rows,
  onFlash,
  compact,
}: {
  rows: ProductionWorkOrder[];
  onFlash: (m: string | null) => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "release" | "hold" | "resume" | "start" | "complete" | "cancel" }) =>
      productionApi.workOrderAction(id, act),
    onSuccess: (r) => {
      onFlash(`Work order → ${r.status}`);
      void qc.invalidateQueries({ queryKey: ["production"] });
      void qc.invalidateQueries({ queryKey: ["work-orders"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <>
      <div className="lg:hidden space-y-3 p-3">
        {rows.map((w) => {
          const planned = w.planned_qty || w.target_qty || 0;
          const produced = w.produced_qty || w.actual_qty || 0;
          const pct = planned ? (produced / planned) * 100 : 0;
          return (
            <div key={w.id} className="rounded-2xl bg-secondary/60 p-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{w.wo_code || w.wo_no}</span>
                {w.brand && w.brand !== "—" && <Tag tone="brand">{w.brand}</Tag>}
                <StatusBadge status={w.raw_status || w.status} />
              </div>
              <div className="text-sm font-semibold">{w.title || w.product_name}</div>
              <div className="text-[11px] text-muted-foreground">
                Batch {w.batch_no} · {w.line} · QA {w.qa_status}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>{produced.toLocaleString()} / {planned.toLocaleString()} {w.uom}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: brand.primary }} />
                </div>
              </div>
              {!compact && <WoActions wo={w} busy={action.isPending} onAction={(act) => action.mutate({ id: w.id, act })} />}
            </div>
          );
        })}
      </div>

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
              <Th>WO</Th><Th>Title / Product</Th><Th>Brand</Th><Th>Batch</Th><Th>Line</Th><Th>Progress</Th><Th>Status</Th><Th>QA</Th>
              {!compact && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const planned = w.planned_qty || w.target_qty || 0;
              const produced = w.produced_qty || w.actual_qty || 0;
              const pct = planned ? (produced / planned) * 100 : 0;
              return (
                <tr key={w.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{w.wo_code || w.wo_no}</Td>
                  <Td className="font-semibold">{w.title || w.product_name}</Td>
                  <Td>{w.brand && w.brand !== "—" ? <Tag tone="brand">{w.brand}</Tag> : "—"}</Td>
                  <Td className="font-mono text-xs">{w.batch_no}</Td>
                  <Td>{w.line}</Td>
                  <Td>
                    <div className="w-44">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span className="tabular-nums">{produced.toLocaleString()} / {planned.toLocaleString()}</span>
                        <span className="tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: brand.primary }} />
                      </div>
                    </div>
                  </Td>
                  <Td><StatusBadge status={w.raw_status || w.status} /></Td>
                  <Td><StatusBadge status={w.qa_status} /></Td>
                  {!compact && (
                    <Td>
                      <WoActions wo={w} busy={action.isPending} onAction={(act) => action.mutate({ id: w.id, act })} />
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WoActions({
  wo,
  busy,
  onAction,
}: {
  wo: ProductionWorkOrder;
  busy: boolean;
  onAction: (act: "release" | "hold" | "resume" | "start" | "complete" | "cancel") => void;
}) {
  const s = wo.raw_status || wo.status;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 lg:mt-0">
      {s === "draft" && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold text-primary" onClick={() => onAction("release")}>Release</button>
      )}
      {(s === "released" || s === "on_hold") && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold text-primary" onClick={() => onAction("start")}>Start</button>
      )}
      {(s === "released" || s === "in_progress") && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold text-amber-600" onClick={() => onAction("hold")}>Hold</button>
      )}
      {s === "on_hold" && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold text-primary" onClick={() => onAction("resume")}>Resume</button>
      )}
      {(s === "in_progress" || s === "released") && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold" style={{ color: "var(--color-success)" }} onClick={() => onAction("complete")}>Complete</button>
      )}
      {s !== "completed" && s !== "cancelled" && (
        <button type="button" disabled={busy} className="text-[10px] font-semibold text-destructive" onClick={() => onAction("cancel")}>Cancel</button>
      )}
    </div>
  );
}

/* ── WIP ──────────────────────────────────────────────────────────────────── */

function WipSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "wip", search],
    queryFn: () => productionApi.wip({ search, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    process_stage_id: "",
    work_order_id: "",
    date: "",
    opening_wip: "0",
    input_qty: "0",
    output_qty: "0",
  });

  const create = useMutation({
    mutationFn: () =>
      productionApi.createWip({
        process_stage_id: form.process_stage_id,
        work_order_id: form.work_order_id || undefined,
        date: form.date || undefined,
        opening_wip: Number(form.opening_wip) || 0,
        input_qty: Number(form.input_qty) || 0,
        output_qty: Number(form.output_qty) || 0,
      }),
    onSuccess: () => {
      onFlash("WIP record saved.");
      setForm({ process_stage_id: "", work_order_id: "", date: "", opening_wip: "0", input_qty: "0", output_qty: "0" });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productionApi.deleteWip(id),
    onSuccess: () => {
      onFlash("WIP record deleted.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search WO or stage…"
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className={inputCls} value={form.process_stage_id} onChange={(e) => setForm({ ...form, process_stage_id: e.target.value })}>
            <option value="">Process stage *</option>
            {(options.data?.stages || []).map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
            <option value="">Work order</option>
            {(options.data?.work_orders || []).map((w) => (
              <option key={w.id} value={w.id}>{w.wo_no}</option>
            ))}
          </select>
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className={inputCls} placeholder="Opening WIP" value={form.opening_wip} onChange={(e) => setForm({ ...form, opening_wip: e.target.value })} />
          <input className={inputCls} placeholder="Input qty" value={form.input_qty} onChange={(e) => setForm({ ...form, input_qty: e.target.value })} />
          <input className={inputCls} placeholder="Output qty" value={form.output_qty} onChange={(e) => setForm({ ...form, output_qty: e.target.value })} />
          <button type="button" className={btnCls} disabled={!form.process_stage_id || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> Add WIP
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Date", "Stage", "WO", "Opening", "Input", "Output", "Closing", ""]}
          rows={(q.data?.results || []).map((w) => [
            w.date || "—",
            w.process_stage_name || w.process_stage_code,
            w.work_order_no || "—",
            String(w.opening_wip),
            String(w.input_qty),
            String(w.output_qty),
            String(w.closing_wip),
            <button key="d" type="button" className="text-xs text-destructive" onClick={() => remove.mutate(w.id)}>Delete</button>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Costing ──────────────────────────────────────────────────────────────── */

function CostingSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "costing", search],
    queryFn: () => productionApi.costing({ search, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    work_order_id: "",
    material_cost: "",
    labor_cost: "",
    machine_cost: "",
    overhead_cost: "",
    period_date: "",
  });

  const totals = useMemo(() => {
    const rows = q.data?.results || [];
    return {
      material: rows.reduce((s, r) => s + r.material_cost, 0),
      labor: rows.reduce((s, r) => s + r.labor_cost, 0),
      total: rows.reduce((s, r) => s + r.total_cost, 0),
    };
  }, [q.data]);

  const create = useMutation({
    mutationFn: () =>
      productionApi.createCosting({
        work_order_id: form.work_order_id,
        material_cost: Number(form.material_cost) || 0,
        labor_cost: Number(form.labor_cost) || 0,
        machine_cost: Number(form.machine_cost) || 0,
        overhead_cost: Number(form.overhead_cost) || 0,
        period_date: form.period_date || undefined,
      }),
    onSuccess: () => {
      onFlash("Costing entry created.");
      setForm({ work_order_id: "", material_cost: "", labor_cost: "", machine_cost: "", overhead_cost: "", period_date: "" });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productionApi.deleteCosting(id),
    onSuccess: () => {
      onFlash("Costing deleted.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <Mini label="Material" value={totals.material.toLocaleString()} />
        <Mini label="Labor" value={totals.labor.toLocaleString()} />
        <Mini label="Total" value={totals.total.toLocaleString()} />
      </div>
      <SectionLayout
        search={search}
        onSearch={setSearch}
        placeholder="Search WO, product, item…"
        form={
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
              <option value="">Work order *</option>
              {(options.data?.work_orders || []).map((w) => (
                <option key={w.id} value={w.id}>{w.wo_no} — {w.title}</option>
              ))}
            </select>
            <input className={inputCls} placeholder="Material cost" value={form.material_cost} onChange={(e) => setForm({ ...form, material_cost: e.target.value })} />
            <input className={inputCls} placeholder="Labor cost" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: e.target.value })} />
            <input className={inputCls} placeholder="Machine cost" value={form.machine_cost} onChange={(e) => setForm({ ...form, machine_cost: e.target.value })} />
            <input className={inputCls} placeholder="Overhead cost" value={form.overhead_cost} onChange={(e) => setForm({ ...form, overhead_cost: e.target.value })} />
            <input className={inputCls} type="date" value={form.period_date} onChange={(e) => setForm({ ...form, period_date: e.target.value })} />
            <button type="button" className={btnCls} disabled={!form.work_order_id || create.isPending} onClick={() => create.mutate()}>
              <Plus className="h-4 w-4" /> Add costing
            </button>
          </div>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
          <DataTable
            headers={["Period", "WO", "Item", "Material", "Labor", "Machine", "Overhead", "Total", "Unit", ""]}
            rows={(q.data?.results || []).map((c) => [
              c.period_date || "—",
              c.work_order_no,
              c.item_name || c.product_name || "—",
              c.material_cost.toLocaleString(),
              c.labor_cost.toLocaleString(),
              c.machine_cost.toLocaleString(),
              c.overhead_cost.toLocaleString(),
              c.total_cost.toLocaleString(),
              c.per_unit_cost != null ? c.per_unit_cost.toLocaleString() : "—",
              <button key="d" type="button" className="text-xs text-destructive" onClick={() => remove.mutate(c.id)}>Delete</button>,
            ])}
          />
          <Pager meta={q.data} />
        </QueryState>
      </SectionLayout>
    </>
  );
}

/* ── Damage / Expire ─────────────────────────────────────────────────────── */

function DamageSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "damage", search, reason],
    queryFn: () => productionApi.damage({ search, reason: reason || undefined, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    item_id: "",
    batch_id: "",
    work_order_id: "",
    qty: "",
    reason: "damage",
    date: "",
    warehouse_id: "",
  });

  const create = useMutation({
    mutationFn: () =>
      productionApi.createDamage({
        item_id: form.item_id || undefined,
        batch_id: form.batch_id || undefined,
        work_order_id: form.work_order_id || undefined,
        qty: Number(form.qty) || 0,
        reason: form.reason,
        date: form.date || undefined,
      }),
    onSuccess: () => {
      onFlash("Damage / expire entry created.");
      setForm({ item_id: "", batch_id: "", work_order_id: "", qty: "", reason: "damage", date: "", warehouse_id: form.warehouse_id });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => productionApi.approveDamage(id, form.warehouse_id || undefined),
    onSuccess: () => {
      onFlash("Damage approved and stock posted.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productionApi.deleteDamage(id),
    onSuccess: () => {
      onFlash("Entry deleted.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search item, batch, WO…"
      filters={
        <>
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">All reasons</option>
            <option value="damage">Damage</option>
            <option value="expire">Expire</option>
            <option value="scrap">Scrap</option>
            <option value="other">Other</option>
          </select>
          <select className={inputCls} value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
            <option value="">Warehouse for approve</option>
            {(options.data?.warehouses || []).map((w) => (
              <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
            ))}
          </select>
        </>
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className={inputCls} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
            <option value="">Item</option>
            {(options.data?.items || []).map((i) => (
              <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
            <option value="">Batch</option>
            {(options.data?.batches || []).map((b) => (
              <option key={b.id} value={b.id}>{b.batch_no}</option>
            ))}
          </select>
          <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
            <option value="">Work order</option>
            {(options.data?.work_orders || []).map((w) => (
              <option key={w.id} value={w.id}>{w.wo_no}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="Qty *" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <select className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            <option value="damage">Damage</option>
            <option value="expire">Expire</option>
            <option value="scrap">Scrap</option>
            <option value="other">Other</option>
          </select>
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <button type="button" className={btnCls} disabled={!form.qty || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> <AlertTriangle className="h-4 w-4" /> Record
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Date", "Item", "Batch", "WO", "Qty", "Reason", "Posted", "Actions"]}
          rows={(q.data?.results || []).map((d) => [
            d.date || "—",
            d.item_name || d.product_name || "—",
            d.batch_no || "—",
            d.work_order_no || "—",
            String(d.qty),
            <StatusBadge key="r" status={d.reason} />,
            d.is_posted ? "Yes" : "No",
            <div key="a" className="flex gap-2">
              {!d.is_posted && (
                <>
                  <button type="button" className="text-xs text-primary" onClick={() => approve.mutate(d.id)}>Approve</button>
                  <button type="button" className="text-xs text-destructive" onClick={() => remove.mutate(d.id)}>Delete</button>
                </>
              )}
            </div>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Working Reports ──────────────────────────────────────────────────────── */

function ReportsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const options = useQuery({ queryKey: ["production", "options"], queryFn: productionApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["production", "reports", search],
    queryFn: () => productionApi.workingReports({ search, page_size: 50 }),
    enabled: authed,
  });
  const [form, setForm] = useState({
    employee_id: "",
    work_order_id: "",
    date: "",
    hours: "",
    activities: "",
    remarks: "",
  });

  const create = useMutation({
    mutationFn: () =>
      productionApi.createWorkingReport({
        employee_id: form.employee_id,
        work_order_id: form.work_order_id || undefined,
        date: form.date || undefined,
        hours: Number(form.hours) || 0,
        activities_json: form.activities,
        remarks: form.remarks,
      }),
    onSuccess: () => {
      onFlash("Working report saved.");
      setForm({ employee_id: "", work_order_id: "", date: "", hours: "", activities: "", remarks: "" });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productionApi.deleteWorkingReport(id),
    onSuccess: () => {
      onFlash("Report deleted.");
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <AuthGate />;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search employee, WO, remarks…"
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Employee *</option>
            {(options.data?.employees || []).map((e) => (
              <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
            <option value="">Work order</option>
            {(options.data?.work_orders || []).map((w) => (
              <option key={w.id} value={w.id}>{w.wo_no}</option>
            ))}
          </select>
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className={inputCls} placeholder="Hours" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <input className={inputCls} placeholder="Activities (comma-separated)" value={form.activities} onChange={(e) => setForm({ ...form, activities: e.target.value })} />
          <input className={inputCls} placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          <button type="button" className={btnCls} disabled={!form.employee_id || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> <FileText className="h-4 w-4" /> Add report
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Date", "Employee", "WO", "Hours", "Activities", "Remarks", ""]}
          rows={(q.data?.results || []).map((r) => [
            r.date || "—",
            `${r.employee_code} — ${r.employee_name}`,
            r.work_order_no || "—",
            String(r.hours),
            Array.isArray(r.activities_json) ? r.activities_json.join(", ") : "—",
            r.remarks || "—",
            <button key="d" type="button" className="text-xs text-destructive" onClick={() => remove.mutate(r.id)}>Delete</button>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 text-[var(--color-primary-foreground)] bg-[var(--color-primary)]";

function AuthGate() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load production data from the database.
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
      {(onSearch || filters) && (
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
        </div>
      )}
      {form && <div className="rounded-2xl bg-card border border-border p-4">{form}</div>}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">{children}</div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty = "No records yet.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
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
              <th key={h || "empty"} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ meta }: { meta?: { page: number; total_pages: number; count: number } | null }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
      Page {meta.page} of {meta.total_pages} · {meta.count} records
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
