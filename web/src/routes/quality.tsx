import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search, ClipboardCheck, FlaskConical, AlertTriangle, ListChecks } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  qualityApi,
  type QualityCAPA,
  type QualityIncoming,
  type QualityIPQC,
  type QualityLab,
  type QualityMaster,
  type QualityNCR,
  type QualityOptions,
  type QualityRelease,
} from "@/lib/quality-api";

export const Route = createFileRoute("/quality")({
  head: () => ({
    meta: [
      { title: "QA / QC — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Incoming inspection, in-process QC, final release, lab reports, NCR, CAPA and quality masters.",
      },
    ],
  }),
  component: Quality,
});

type Section =
  | "overview"
  | "incoming"
  | "processqc"
  | "release"
  | "lab"
  | "ncr"
  | "capa"
  | "masters";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = [
    "overview",
    "incoming",
    "processqc",
    "release",
    "lab",
    "ncr",
    "capa",
    "masters",
  ];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "QA / QC", subtitle: "quality.incoming · ipqc · release · ncr · capa" },
  incoming: { title: "Incoming Inspection", subtitle: "quality.incoming_inspection" },
  processqc: { title: "In-Process QC", subtitle: "quality.in_process_qc" },
  release: { title: "Final QA Release", subtitle: "quality.final_qa_release" },
  lab: { title: "Lab Reports", subtitle: "quality.lab_report" },
  ncr: { title: "NCR", subtitle: "quality.ncr" },
  capa: { title: "CAPA", subtitle: "quality.capa" },
  masters: { title: "Quality Masters", subtitle: "quality.quality_master" },
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

function Quality() {
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
      {section === "incoming" && <IncomingSection onFlash={setFlash} />}
      {section === "processqc" && <IpqcSection onFlash={setFlash} />}
      {section === "release" && <ReleaseSection onFlash={setFlash} />}
      {section === "lab" && <LabSection onFlash={setFlash} />}
      {section === "ncr" && <NcrSection onFlash={setFlash} />}
      {section === "capa" && <CapaSection onFlash={setFlash} />}
      {section === "masters" && <MastersSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["quality", "overview"],
    queryFn: qualityApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_status?.length ? kpi.by_status : [];

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load quality data from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Pass" value={kpi?.pass_count ?? 0} sub="inspections / lab" style={{ color: "var(--color-success)" }} />
        <Mini label="Fail" value={kpi?.fail_count ?? 0} sub="inspections / lab" style={{ color: "var(--color-danger)" }} />
        <Mini label="Hold" value={kpi?.hold_count ?? 0} sub="pending QC" style={{ color: "var(--color-warning)" }} />
        <Mini label="Released" value={kpi?.released_count ?? 0} sub={`${kpi?.held_releases ?? 0} held`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Incoming" value={kpi?.pending_incoming ?? 0} sub="awaiting result" />
        <Mini label="IPQC" value={kpi?.pending_ipqc ?? 0} sub="in-process holds" />
        <Mini label="Open NCRs" value={kpi?.open_ncrs ?? 0} sub="non-conformance" />
        <Mini label="Open CAPAs" value={kpi?.open_capas ?? 0} sub={`${kpi?.lab_fails ?? 0} lab fails`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">QC status mix</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No inspection results yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "pass"
                            ? "var(--color-success)"
                            : s.code === "fail"
                              ? "var(--color-danger)"
                              : chartSeries[i % chartSeries.length]
                        }
                      />
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
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">QC inbox</div>
          </div>
          {(kpi?.inbox || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No pending inspections or held releases.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.inbox || []).map((row) => (
                <div key={`${row.type}-${row.id}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground">{row.ref}</div>
                    <div className="text-sm font-semibold truncate">{row.title}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {row.type} · {fmtDate(row.date)}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Recent NCRs">
          {(kpi?.recent_ncrs || []).length === 0 ? (
            <Empty>No NCRs recorded.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_ncrs || []).map((n) => (
                <div key={n.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{n.ncr_no}</span>
                    <StatusBadge status={n.status} />
                  </div>
                  <div className="mt-1 text-sm font-semibold line-clamp-2">{n.issue}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {n.department_name || "—"} · {fmtDate(n.date)} · {n.capa_count} CAPA
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Recent batch releases">
          {(kpi?.recent_releases || []).length === 0 ? (
            <Empty>No releases yet.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_releases || []).map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {r.brand ? <Tag tone="brand">{r.brand}</Tag> : null}
                      <span className="text-[10px] font-mono text-muted-foreground">{r.batch_no || "—"}</span>
                    </div>
                    <StatusBadge status={r.release_status} />
                  </div>
                  <div className="mt-1 text-sm font-semibold">{r.product_name || "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    QA: {r.approved_by_name || "—"} · {fmtDate(r.inspection_date)} · qty {r.quantity}
                  </div>
                  {r.release_status === "held" && (
                    <div className="mt-2 flex gap-2">
                      <ActionBtn
                        label="Release"
                        onClick={() =>
                          qualityApi
                            .updateRelease(r.id, { release_status: "released" })
                            .then(() => {
                              onFlash("Batch released.");
                              void qc.invalidateQueries({ queryKey: ["quality"] });
                            })
                            .catch((e: Error) => onFlash(e.message))
                        }
                      />
                      <ActionBtn
                        label="Reject"
                        danger
                        onClick={() =>
                          qualityApi
                            .updateRelease(r.id, { release_status: "rejected" })
                            .then(() => {
                              onFlash("Batch rejected.");
                              void qc.invalidateQueries({ queryKey: ["quality"] });
                            })
                            .catch((e: Error) => onFlash(e.message))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </QueryState>
  );
}

/* ── Incoming ─────────────────────────────────────────────────────────────── */

function IncomingSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "incoming", search, status, page],
    queryFn: () => qualityApi.incoming({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({ id, status: st }: { id: string; status: string }) =>
      qualityApi.updateIncoming(id, { status: st }),
    onSuccess: () => {
      onFlash("Inspection updated.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search inspection, material, supplier…"
      filters={
        <select
          className={inputCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="hold">Hold</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New inspection
        </button>
      }
    >
      {showForm && options.data && (
        <IncomingForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["No.", "Date", "Supplier", "Material", "Parameter", "Result", "Inspector", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityIncoming) => [
            <span key="n" className="font-mono text-xs">{row.inspection_no}</span>,
            fmtDate(row.date),
            row.supplier_name || "—",
            <div key="m">
              <div className="font-semibold">{row.material_name || "—"}</div>
              <div className="text-[11px] text-muted-foreground">{row.material_code || row.batch_no}</div>
            </div>,
            row.parameter || "—",
            row.result || "—",
            row.inspector_name || "—",
            <StatusBadge key="s" status={row.status} />,
            row.status === "hold" ? (
              <div key="a" className="flex gap-1">
                <ActionBtn label="Pass" onClick={() => action.mutate({ id: row.id, status: "pass" })} disabled={action.isPending} />
                <ActionBtn label="Fail" danger onClick={() => action.mutate({ id: row.id, status: "fail" })} disabled={action.isPending} />
              </div>
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function IncomingForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    supplier_id: "",
    material_id: "",
    inspector_id: "",
    parameter: "",
    result: "",
    batch_no: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const create = useMutation({
    mutationFn: () => qualityApi.createIncoming(form),
    onSuccess: () => onSaved("Incoming inspection created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New incoming inspection" onClose={onClose}>
      <Field label="Supplier *">
        <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
          <option value="">Select supplier</option>
          {options.vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Material *">
        <select className={inputCls} value={form.material_id} onChange={(e) => setForm({ ...form, material_id: e.target.value })}>
          <option value="">Select material</option>
          {options.materials.map((m) => (
            <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Inspector *">
        <select className={inputCls} value={form.inspector_id} onChange={(e) => setForm({ ...form, inspector_id: e.target.value })}>
          <option value="">Select inspector</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date">
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Batch no">
          <input className={inputCls} value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
        </Field>
      </div>
      <Field label="Parameter">
        <input className={inputCls} value={form.parameter} onChange={(e) => setForm({ ...form, parameter: e.target.value })} />
      </Field>
      <Field label="Result">
        <input className={inputCls} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.supplier_id || !form.material_id || !form.inspector_id}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── In-Process QC ────────────────────────────────────────────────────────── */

function IpqcSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "ipqc", search, status, page],
    queryFn: () => qualityApi.ipqc({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const action = useMutation({
    mutationFn: ({ id, status: st }: { id: string; status: string }) => qualityApi.updateIpqc(id, { status: st }),
    onSuccess: () => {
      onFlash("IPQC updated.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search parameter, batch, WO…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="hold">Hold</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New IPQC
        </button>
      }
    >
      {showForm && options.data && (
        <IpqcForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Date", "Product / Stage", "Batch", "Parameter", "Standard", "Actual", "Inspector", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityIPQC) => [
            fmtDate(row.date),
            <div key="p">
              <div className="font-semibold">{row.product_name || row.process_step || "—"}</div>
              <div className="text-[11px] text-muted-foreground">{row.work_order_no || row.process_step}</div>
            </div>,
            row.batch_no || "—",
            row.parameter || "—",
            row.standard || "—",
            row.actual || "—",
            row.inspector_name || "—",
            <StatusBadge key="s" status={row.status} />,
            row.status === "hold" ? (
              <div key="a" className="flex gap-1">
                <ActionBtn label="Pass" onClick={() => action.mutate({ id: row.id, status: "pass" })} disabled={action.isPending} />
                <ActionBtn label="Fail" danger onClick={() => action.mutate({ id: row.id, status: "fail" })} disabled={action.isPending} />
                <ActionBtn label="Hold" onClick={() => action.mutate({ id: row.id, status: "hold" })} disabled={action.isPending} />
              </div>
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function IpqcForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    inspector_id: "",
    product_id: "",
    work_order_id: "",
    process_stage_id: "",
    parameter: "",
    standard: "",
    actual: "",
    batch_no: "",
    process_step: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const create = useMutation({
    mutationFn: () => qualityApi.createIpqc(form),
    onSuccess: () => onSaved("In-process QC created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New in-process QC" onClose={onClose}>
      <Field label="Inspector *">
        <select className={inputCls} value={form.inspector_id} onChange={(e) => setForm({ ...form, inspector_id: e.target.value })}>
          <option value="">Select inspector</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Product">
        <select className={inputCls} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
          <option value="">Optional</option>
          {options.products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Work order">
        <select className={inputCls} value={form.work_order_id} onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}>
          <option value="">Optional</option>
          {options.work_orders.map((w) => (
            <option key={w.id} value={w.id}>{w.wo_no} — {w.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Process stage">
        <select className={inputCls} value={form.process_stage_id} onChange={(e) => setForm({ ...form, process_stage_id: e.target.value })}>
          <option value="">Optional</option>
          {options.process_stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Parameter">
          <input className={inputCls} value={form.parameter} onChange={(e) => setForm({ ...form, parameter: e.target.value })} />
        </Field>
        <Field label="Batch no">
          <input className={inputCls} value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Standard">
          <input className={inputCls} value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value })} />
        </Field>
        <Field label="Actual">
          <input className={inputCls} value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} />
        </Field>
      </div>
      <ModalActions pending={create.isPending} disabled={!form.inspector_id} onClose={onClose} onSave={() => create.mutate()} />
    </Modal>
  );
}

/* ── Final Release ────────────────────────────────────────────────────────── */

function ReleaseSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "releases", search, status, page],
    queryFn: () =>
      qualityApi.releases({
        search,
        release_status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });
  const action = useMutation({
    mutationFn: ({ id, release_status }: { id: string; release_status: string }) =>
      qualityApi.updateRelease(id, { release_status }),
    onSuccess: () => {
      onFlash("Release updated.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search batch, product, WO…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All release statuses</option>
          <option value="held">Held</option>
          <option value="released">Released</option>
          <option value="rejected">Rejected</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New release
        </button>
      }
    >
      {showForm && options.data && (
        <ReleaseForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Batch", "Product", "Date", "Qty", "Quality", "Approved by", "Release", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityRelease) => [
            <span key="b" className="font-mono text-xs">{row.batch_no || "—"}</span>,
            <div key="p">
              <div className="font-semibold">{row.product_name || "—"}</div>
              {row.brand ? <Tag tone="brand">{row.brand}</Tag> : null}
            </div>,
            fmtDate(row.inspection_date),
            String(row.quantity),
            <StatusBadge key="q" status={row.quality_status} />,
            row.approved_by_name || "—",
            <StatusBadge key="r" status={row.release_status} />,
            row.release_status === "held" ? (
              <div key="a" className="flex gap-1">
                <ActionBtn label="Release" onClick={() => action.mutate({ id: row.id, release_status: "released" })} disabled={action.isPending} />
                <ActionBtn label="Hold" onClick={() => action.mutate({ id: row.id, release_status: "held" })} disabled={action.isPending} />
                <ActionBtn label="Reject" danger onClick={() => action.mutate({ id: row.id, release_status: "rejected" })} disabled={action.isPending} />
              </div>
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function ReleaseForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    approved_by_id: "",
    product_id: "",
    work_order_id: "",
    batch_id: "",
    batch_no: "",
    quantity: "0",
    quality_status: "hold",
    inspection_date: new Date().toISOString().slice(0, 10),
  });
  const create = useMutation({
    mutationFn: () =>
      qualityApi.createRelease({
        ...form,
        quantity: Number(form.quantity) || 0,
      }),
    onSuccess: () => onSaved("Final QA release created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New final QA release" onClose={onClose}>
      <Field label="Approved by *">
        <select className={inputCls} value={form.approved_by_id} onChange={(e) => setForm({ ...form, approved_by_id: e.target.value })}>
          <option value="">Select QA manager</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Product">
        <select className={inputCls} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
          <option value="">Optional</option>
          {options.products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Batch">
          <select className={inputCls} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
            <option value="">Optional</option>
            {options.batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_no}</option>
            ))}
          </select>
        </Field>
        <Field label="Batch no">
          <input className={inputCls} value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Quantity">
          <input className={inputCls} type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
        <Field label="Inspection date">
          <input className={inputCls} type="date" value={form.inspection_date} onChange={(e) => setForm({ ...form, inspection_date: e.target.value })} />
        </Field>
      </div>
      <Field label="Quality status">
        <select className={inputCls} value={form.quality_status} onChange={(e) => setForm({ ...form, quality_status: e.target.value })}>
          <option value="hold">Hold</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      </Field>
      <ModalActions pending={create.isPending} disabled={!form.approved_by_id} onClose={onClose} onSave={() => create.mutate()} />
    </Modal>
  );
}

/* ── Lab ──────────────────────────────────────────────────────────────────── */

function LabSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "lab", search, status, page],
    queryFn: () => qualityApi.lab({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const action = useMutation({
    mutationFn: ({ id, status: st }: { id: string; status: string }) => qualityApi.updateLab(id, { status: st }),
    onSuccess: () => {
      onFlash("Lab report updated.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search test no, sample, parameter…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="hold">Hold</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <FlaskConical className="h-4 w-4" /> New lab report
        </button>
      }
    >
      {showForm && options.data && (
        <LabForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Test no", "Sample", "Parameter", "Method", "Spec", "Result", "Unit", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityLab) => [
            <span key="t" className="font-mono text-xs">{row.test_no}</span>,
            row.sample || "—",
            row.test_parameter || "—",
            row.method || "—",
            row.specification || "—",
            <span key="r" className="font-semibold">{row.result || "—"}</span>,
            row.unit || "—",
            <StatusBadge key="s" status={row.status} />,
            row.status === "hold" ? (
              <div key="a" className="flex gap-1">
                <ActionBtn label="Pass" onClick={() => action.mutate({ id: row.id, status: "pass" })} disabled={action.isPending} />
                <ActionBtn label="Fail" danger onClick={() => action.mutate({ id: row.id, status: "fail" })} disabled={action.isPending} />
              </div>
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function LabForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    sample: "",
    test_parameter: "",
    method: "",
    specification: "",
    result: "",
    unit: "",
    batch_id: "",
    work_order_id: "",
  });
  const create = useMutation({
    mutationFn: () => qualityApi.createLab(form),
    onSuccess: () => onSaved("Lab report created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New lab report" onClose={onClose}>
      <Field label="Sample">
        <input className={inputCls} value={form.sample} onChange={(e) => setForm({ ...form, sample: e.target.value })} />
      </Field>
      <Field label="Test parameter">
        <input className={inputCls} value={form.test_parameter} onChange={(e) => setForm({ ...form, test_parameter: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Method">
          <input className={inputCls} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
        </Field>
        <Field label="Unit">
          <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Specification">
          <input className={inputCls} value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} />
        </Field>
        <Field label="Result">
          <input className={inputCls} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
        </Field>
      </div>
      <Field label="Batch">
        <select className={inputCls} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
          <option value="">Optional</option>
          {options.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.batch_no}</option>
          ))}
        </select>
      </Field>
      <ModalActions pending={create.isPending} onClose={onClose} onSave={() => create.mutate()} />
    </Modal>
  );
}

/* ── NCR ──────────────────────────────────────────────────────────────────── */

function NcrSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "ncrs", search, status, page],
    queryFn: () => qualityApi.ncrs({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => qualityApi.updateNcr(id, body),
    onSuccess: () => {
      onFlash("NCR updated.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search NCR, issue, root cause…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="corrected">Corrected</option>
          <option value="closed">Closed</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <AlertTriangle className="h-4 w-4" /> Open NCR
        </button>
      }
    >
      {showForm && options.data && (
        <NcrForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["NCR", "Date", "Issue", "Department", "Root cause", "CAPAs", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityNCR) => [
            <span key="n" className="font-mono text-xs">{row.ncr_no}</span>,
            fmtDate(row.date),
            <div key="i" className="max-w-xs line-clamp-2">{row.issue}</div>,
            row.department_name || "—",
            <div key="r" className="max-w-xs line-clamp-2 text-muted-foreground">{row.root_cause || "—"}</div>,
            String(row.capa_count),
            <StatusBadge key="s" status={row.status} />,
            row.status !== "closed" ? (
              <div key="a" className="flex gap-1">
                {row.status === "open" && (
                  <ActionBtn label="Investigate" onClick={() => update.mutate({ id: row.id, body: { status: "investigating" } })} disabled={update.isPending} />
                )}
                {row.status === "investigating" && (
                  <ActionBtn label="Corrected" onClick={() => update.mutate({ id: row.id, body: { status: "corrected" } })} disabled={update.isPending} />
                )}
                <ActionBtn label="Close" onClick={() => update.mutate({ id: row.id, body: { status: "closed" } })} disabled={update.isPending} />
              </div>
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function NcrForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    issue: "",
    department_id: "",
    work_order_id: "",
    root_cause: "",
    correction: "",
    create_capa: false,
    owner_id: "",
  });
  const create = useMutation({
    mutationFn: () => qualityApi.createNcr(form),
    onSuccess: () => onSaved("NCR opened."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="Open NCR" onClose={onClose}>
      <Field label="Issue *">
        <textarea
          className={`${inputCls} h-24 py-2`}
          value={form.issue}
          onChange={(e) => setForm({ ...form, issue: e.target.value })}
        />
      </Field>
      <Field label="Department">
        <select className={inputCls} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
          <option value="">Optional</option>
          {options.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Root cause">
        <textarea className={`${inputCls} h-20 py-2`} value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} />
      </Field>
      <Field label="Correction">
        <textarea className={`${inputCls} h-20 py-2`} value={form.correction} onChange={(e) => setForm({ ...form, correction: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={form.create_capa}
          onChange={(e) => setForm({ ...form, create_capa: e.target.checked })}
        />
        Also create CAPA
      </label>
      {form.create_capa && (
        <Field label="CAPA owner *">
          <select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
            <option value="">Select owner</option>
            {options.employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </Field>
      )}
      <ModalActions
        pending={create.isPending}
        disabled={!form.issue.trim() || (form.create_capa && !form.owner_id)}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── CAPA ─────────────────────────────────────────────────────────────────── */

function CapaSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "capas", search, status, page],
    queryFn: () => qualityApi.capas({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const closeMut = useMutation({
    mutationFn: (id: string) => qualityApi.updateCapa(id, { action: "close" }),
    onSuccess: () => {
      onFlash("CAPA closed.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search CAPA, problem, NCR…"
      filters={
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <ListChecks className="h-4 w-4" /> New CAPA
        </button>
      }
    >
      {showForm && options.data && (
        <CapaForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["CAPA", "Problem", "NCR", "Owner", "Due", "Corrective", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityCAPA) => [
            <span key="c" className="font-mono text-xs">{row.capa_no}</span>,
            <div key="p" className="max-w-xs line-clamp-2 font-semibold">{row.problem}</div>,
            row.ncr_no || "—",
            row.owner_name || "—",
            fmtDate(row.due_date) || "—",
            <div key="ca" className="max-w-xs line-clamp-2 text-muted-foreground">{row.corrective_action || "—"}</div>,
            <StatusBadge key="s" status={row.status} />,
            row.status === "open" ? (
              <ActionBtn key="a" label="Close" onClick={() => closeMut.mutate(row.id)} disabled={closeMut.isPending} />
            ) : (
              "—"
            ),
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function CapaForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    owner_id: "",
    ncr_id: "",
    problem: "",
    root_cause: "",
    corrective_action: "",
    preventive_action: "",
    due_date: "",
  });
  const create = useMutation({
    mutationFn: () => qualityApi.createCapa(form),
    onSuccess: () => onSaved("CAPA created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New CAPA" onClose={onClose}>
      <Field label="Owner *">
        <select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
          <option value="">Select owner</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Linked NCR">
        <select className={inputCls} value={form.ncr_id} onChange={(e) => setForm({ ...form, ncr_id: e.target.value })}>
          <option value="">Optional</option>
          {options.ncrs.map((n) => (
            <option key={n.id} value={n.id}>{n.ncr_no}</option>
          ))}
        </select>
      </Field>
      <Field label="Problem *">
        <textarea className={`${inputCls} h-20 py-2`} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
      </Field>
      <Field label="Root cause">
        <textarea className={`${inputCls} h-16 py-2`} value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} />
      </Field>
      <Field label="Corrective action">
        <textarea className={`${inputCls} h-16 py-2`} value={form.corrective_action} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} />
      </Field>
      <Field label="Preventive action">
        <textarea className={`${inputCls} h-16 py-2`} value={form.preventive_action} onChange={(e) => setForm({ ...form, preventive_action: e.target.value })} />
      </Field>
      <Field label="Due date">
        <input className={inputCls} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      </Field>
      <ModalActions pending={create.isPending} disabled={!form.owner_id || !form.problem.trim()} onClose={onClose} onSave={() => create.mutate()} />
    </Modal>
  );
}

/* ── Masters ──────────────────────────────────────────────────────────────── */

function MastersSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["quality", "options"], queryFn: qualityApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["quality", "masters", search, page],
    queryFn: () => qualityApi.masters({ search, page, page_size: 20 }),
    enabled: authed,
  });
  const remove = useMutation({
    mutationFn: (id: string) => qualityApi.deleteMaster(id),
    onSuccess: () => {
      onFlash("Master deleted.");
      void qc.invalidateQueries({ queryKey: ["quality"] });
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
      placeholder="Search parameter, spec, product…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add master
        </button>
      }
    >
      {showForm && options.data && (
        <MasterForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["quality"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Parameter", "Specification", "Tolerance", "Frequency", "Product", "Stage", "Actions"]}
          rows={(q.data?.results || []).map((row: QualityMaster) => [
            <span key="p" className="font-semibold">{row.quality_parameter}</span>,
            row.specification || "—",
            row.tolerance || "—",
            row.testing_frequency || "—",
            row.product_name || "—",
            row.process_stage_name || row.process_definition_name || "—",
            <button
              key="d"
              type="button"
              className="text-xs"
              style={{ color: "var(--color-danger)" }}
              onClick={() => remove.mutate(row.id)}
            >
              Delete
            </button>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function MasterForm({
  options,
  onClose,
  onSaved,
}: {
  options: QualityOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    quality_parameter: "",
    specification: "",
    tolerance: "",
    testing_frequency: "",
    product_id: "",
    process_definition_id: "",
    process_stage_id: "",
  });
  const stages = useMemo(
    () =>
      form.process_definition_id
        ? options.process_stages.filter((s) => s.process_definition_id === form.process_definition_id)
        : options.process_stages,
    [form.process_definition_id, options.process_stages],
  );
  const create = useMutation({
    mutationFn: () => qualityApi.createMaster(form),
    onSuccess: () => onSaved("Quality master created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="Add quality master" onClose={onClose}>
      <Field label="Quality parameter *">
        <input className={inputCls} value={form.quality_parameter} onChange={(e) => setForm({ ...form, quality_parameter: e.target.value })} />
      </Field>
      <Field label="Specification">
        <input className={inputCls} value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tolerance">
          <input className={inputCls} value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
        </Field>
        <Field label="Testing frequency">
          <input className={inputCls} value={form.testing_frequency} onChange={(e) => setForm({ ...form, testing_frequency: e.target.value })} />
        </Field>
      </div>
      <Field label="Product">
        <select className={inputCls} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
          <option value="">Optional</option>
          {options.products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Process definition">
        <select
          className={inputCls}
          value={form.process_definition_id}
          onChange={(e) => setForm({ ...form, process_definition_id: e.target.value, process_stage_id: "" })}
        >
          <option value="">Optional</option>
          {options.process_definitions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Process stage">
        <select className={inputCls} value={form.process_stage_id} onChange={(e) => setForm({ ...form, process_stage_id: e.target.value })}>
          <option value="">Optional</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <ModalActions pending={create.isPending} disabled={!form.quality_parameter.trim()} onClose={onClose} onSave={() => create.mutate()} />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load quality data from the database.
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
  value: string | number;
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="p-4 lg:p-5 border-b border-border">
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{children}</div>;
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
              <th key={h} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-middle">{cell}</td>
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
