import { createFileRoute, useRouterState, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search, Beaker, FlaskConical, Sparkles, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  rndApi,
  type DomainPaginated,
  type RndBatch,
  type RndOptions,
  type RndProject,
  type StandardPaginated,
} from "@/lib/rnd-api";

export const Route = createFileRoute("/rnd")({
  head: () => ({
    meta: [
      { title: "R&D — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Research & Development: projects, trial batches, and process definitions.",
      },
    ],
  }),
  component: RndPage,
});

type Section = "overview" | "projects" | "trials" | "definitions";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "projects", "trials", "definitions"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "R&D", subtitle: "rnd.project · trial batches · process definitions" },
  projects: { title: "Projects", subtitle: "core.project" },
  trials: { title: "Trial Batches", subtitle: "production.batch" },
  definitions: { title: "Process Definitions", subtitle: "production.process_definition" },
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

function RndPage() {
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
      {section === "projects" && <ProjectsSection onFlash={setFlash} />}
      {section === "trials" && <TrialsSection onFlash={setFlash} />}
      {section === "definitions" && <DefinitionsSection />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["rnd", "overview"],
    queryFn: rndApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_batch_status?.length ? kpi.by_batch_status : [];

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Active projects" value={kpi?.active_projects ?? 0} sub={`${kpi?.total_projects ?? 0} total`} />
        <Mini label="Trial batches" value={kpi?.trial_batches ?? 0} sub="all statuses" />
        <Mini label="Definitions" value={kpi?.definitions_count ?? 0} sub="process engine" />
        <Mini
          label="Upcoming ends"
          value={kpi?.upcoming_ends?.length ?? 0}
          sub="projects with end date"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Batches by status</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No trial batches yet.</div>
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
            <Beaker className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Recent trial batches</div>
          </div>
          {(kpi?.recent_batches || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No batches recorded.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_batches || []).map((b) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground">{b.batch_no}</div>
                    <div className="text-sm font-semibold truncate">
                      {b.output_item_name || b.product_name || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Mfg {fmtDate(b.manufacture_date) || "—"} · Exp {fmtDate(b.expire_date) || "—"}
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Upcoming project end dates">
          {(kpi?.upcoming_ends || []).length === 0 ? (
            <Empty>No upcoming end dates.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.upcoming_ends || []).map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground">{p.code}</div>
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.department_name || "—"} · ends {fmtDate(p.end_date)}
                    </div>
                  </div>
                  <StatusBadge status={p.is_active ? "active" : "inactive"} />
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Projects by department">
          {(kpi?.by_department || []).length === 0 ? (
            <Empty>No active projects by department.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.by_department || []).map((d) => (
                <div key={d.code} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{d.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{d.code}</div>
                  </div>
                  <div className="text-lg font-bold font-display tabular-nums">{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </QueryState>
  );
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

function ProjectsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RndProject | null>(null);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["rnd", "options"], queryFn: rndApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["rnd", "projects", search, page],
    queryFn: () => rndApi.projects({ search, page, page_size: 20 }),
    enabled: authed,
  });

  const deptName = useMemo(() => {
    const map = new Map<string, string>();
    (options.data?.departments || []).forEach((d) => map.set(d.id, d.name));
    return (id: string | null) => (id ? map.get(id) || "—" : "—");
  }, [options.data]);

  const mgrName = useMemo(() => {
    const map = new Map<string, string>();
    (options.data?.managers || []).forEach((m) => map.set(m.id, m.name));
    return (id: string | null) => (id ? map.get(id) || "—" : "—");
  }, [options.data]);

  const remove = useMutation({
    mutationFn: (id: string) => rndApi.deleteProject(id),
    onSuccess: () => {
      onFlash("Project deleted.");
      void qc.invalidateQueries({ queryKey: ["rnd"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const results = q.data?.results || [];
  const pagerMeta = standardPagerMeta(q.data, page, 20);

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search project name or code…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New project
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <ProjectForm
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
            void qc.invalidateQueries({ queryKey: ["rnd"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!results.length}>
        <DataTable
          headers={["Code", "Name", "Department", "Manager", "Dates", "Status", "Actions"]}
          rows={results.map((row) => [
            <span key="c" className="font-mono text-xs">{row.code}</span>,
            <div key="n">
              <div className="font-semibold">{row.name}</div>
              {row.description ? (
                <div className="text-[11px] text-muted-foreground line-clamp-1">{row.description}</div>
              ) : null}
            </div>,
            deptName(row.department),
            mgrName(row.manager),
            <span key="d" className="text-xs text-muted-foreground whitespace-nowrap">
              {fmtDate(row.start_date) || "—"} → {fmtDate(row.end_date) || "—"}
            </span>,
            <StatusBadge key="s" status={row.is_active ? "active" : "inactive"} />,
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (typeof window !== "undefined" && window.confirm(`Delete project ${row.code}?`)) {
                    remove.mutate(row.id);
                  }
                }}
              />
            </div>,
          ])}
        />
        <Pager meta={pagerMeta} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function ProjectForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: RndOptions;
  initial: RndProject | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    code: initial?.code || "",
    description: initial?.description || "",
    department: initial?.department || "",
    manager: initial?.manager || "",
    start_date: (initial?.start_date || "").slice(0, 10),
    end_date: (initial?.end_date || "").slice(0, 10),
    is_active: initial?.is_active ?? true,
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description,
        department: form.department || null,
        manager: form.manager || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
      };
      if (!initial && options.organization_id) {
        body.organization = options.organization_id;
      }
      return initial ? rndApi.updateProject(initial.id, body) : rndApi.createProject(body);
    },
    onSuccess: () => onSaved(initial ? "Project updated." : "Project created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit project" : "New project"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Code *">
          <input
            className={inputCls}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            disabled={!!initial}
          />
        </Field>
        <Field label="Name *">
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-20 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Department">
          <select
            className={inputCls}
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          >
            <option value="">—</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manager">
          <select
            className={inputCls}
            value={form.manager}
            onChange={(e) => setForm({ ...form, manager: e.target.value })}
          >
            <option value="">—</option>
            {options.managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <input
            className={inputCls}
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <input
            className={inputCls}
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </Field>
      </div>
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
        disabled={!form.name.trim() || !form.code.trim()}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Trial batches ────────────────────────────────────────────────────────── */

function TrialsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RndBatch | null>(null);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["rnd", "options"], queryFn: rndApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["rnd", "batches", search, status, page],
    queryFn: () =>
      rndApi.batches({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => rndApi.deleteBatch(id),
    onSuccess: () => {
      onFlash("Batch deleted.");
      void qc.invalidateQueries({ queryKey: ["rnd"] });
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
      placeholder="Search batch no, product, item…"
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
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="quarantined">Quarantined</option>
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New batch
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <BatchForm
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
            void qc.invalidateQueries({ queryKey: ["rnd"] });
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
          headers={["Batch no", "Product / Item", "Mfg", "Expiry", "Size", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row) => [
            <span key="n" className="font-mono text-xs">{row.batch_no}</span>,
            <div key="p">
              <div className="font-semibold">{row.output_item_name || row.product_name || "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {row.output_item_code || row.product_name || ""}
              </div>
            </div>,
            fmtDate(row.manufacture_date) || "—",
            fmtDate(row.expire_date) || "—",
            <span key="sz" className="tabular-nums">
              {row.batch_size}
            </span>,
            <StatusBadge key="s" status={row.status} />,
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (typeof window !== "undefined" && window.confirm(`Delete batch ${row.batch_no}?`)) {
                    remove.mutate(row.id);
                  }
                }}
              />
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function BatchForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: RndOptions;
  initial: RndBatch | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    batch_no: initial?.batch_no || "",
    product_id: initial?.product_id || "",
    output_item_id: initial?.output_item_id || "",
    batch_size: String(initial?.batch_size ?? ""),
    manufacture_date: (initial?.manufacture_date || "").slice(0, 10),
    expire_date: (initial?.expire_date || "").slice(0, 10),
    start_date: (initial?.start_date || "").slice(0, 10),
    supervisor_id: initial?.supervisor_id || "",
    status: initial?.status || "planned",
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        batch_no: form.batch_no.trim() || undefined,
        product_id: form.product_id || null,
        output_item_id: form.output_item_id || null,
        batch_size: form.batch_size || "0",
        manufacture_date: form.manufacture_date || null,
        expire_date: form.expire_date || null,
        start_date: form.start_date || null,
        supervisor_id: form.supervisor_id || null,
        status: form.status,
      };
      return initial ? rndApi.updateBatch(initial.id, body) : rndApi.createBatch(body);
    },
    onSuccess: () => onSaved(initial ? "Batch updated." : "Batch created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit trial batch" : "New trial batch"} onClose={onClose}>
      <Field label="Batch no">
        <input
          className={inputCls}
          value={form.batch_no}
          onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
          placeholder="Auto-generated if blank"
          disabled={!!initial}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Output item">
          <select
            className={inputCls}
            value={form.output_item_id}
            onChange={(e) => setForm({ ...form, output_item_id: e.target.value })}
          >
            <option value="">—</option>
            {options.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} — {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product">
          <select
            className={inputCls}
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
          >
            <option value="">—</option>
            {options.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.brand ? ` (${p.brand})` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Manufacture date">
          <input
            className={inputCls}
            type="date"
            value={form.manufacture_date}
            onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })}
          />
        </Field>
        <Field label="Expiry date">
          <input
            className={inputCls}
            type="date"
            value={form.expire_date}
            onChange={(e) => setForm({ ...form, expire_date: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <input
            className={inputCls}
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </Field>
        <Field label="Batch size">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.001"
            value={form.batch_size}
            onChange={(e) => setForm({ ...form, batch_size: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Supervisor">
          <select
            className={inputCls}
            value={form.supervisor_id}
            onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
          >
            <option value="">—</option>
            {options.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
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
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="quarantined">Quarantined</option>
          </select>
        </Field>
      </div>
      <ModalActions pending={save.isPending} onClose={onClose} onSave={() => save.mutate()} />
    </Modal>
  );
}

/* ── Definitions (read-only) ──────────────────────────────────────────────── */

function DefinitionsSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["rnd", "overview"],
    queryFn: rndApi.overview,
    enabled: authed,
  });
  const defs = overview.data?.definitions || [];

  if (!authed) return <SignInHint />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary shrink-0" />
        <span>Process definitions are managed in the Process Engine.</span>
        <Link to="/process" className="inline-flex items-center gap-1 text-primary font-semibold">
          Open /process <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <QueryState
          isLoading={overview.isLoading}
          isError={overview.isError}
          error={overview.error as Error}
          empty={!defs.length}
        >
          <DataTable
            headers={["Code", "Name", "Status", "Stages", "Output type"]}
            rows={defs.map((d) => [
              <span key="c" className="font-mono text-xs">{d.code}</span>,
              <span key="n" className="font-semibold">
                {d.name}
              </span>,
              <StatusBadge key="s" status={d.status} />,
              <span key="st" className="tabular-nums">
                {d.stage_count}
              </span>,
              d.output_type || "—",
            ])}
          />
        </QueryState>
      </div>
    </div>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function standardPagerMeta(
  data: StandardPaginated<unknown> | undefined,
  page: number,
  pageSize: number,
): DomainPaginated<unknown> | null {
  if (!data) return null;
  const count = data.count ?? 0;
  const total_pages = Math.max(1, Math.ceil(count / pageSize));
  return {
    results: data.results,
    count,
    page,
    page_size: pageSize,
    total_pages,
  };
}

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load R&D data from the database.
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
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
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
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
      className={`px-2 py-1 rounded text-xs font-semibold border disabled:opacity-50 ${
        danger ? "border-danger/40 text-danger" : "border-border"
      }`}
    >
      {label}
    </button>
  );
}
