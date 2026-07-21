import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { fmtDate, fmtNPR } from "@/lib/format";
import {
  crmApi,
  type CrmActivity,
  type CrmComplaint,
  type CrmDeal,
  type CrmOptions,
} from "@/lib/crm-api";

export const Route = createFileRoute("/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Sunyazon BEOS" },
      {
        name: "description",
        content: "Sales pipeline, complaints and customer activities.",
      },
    ],
  }),
  component: Crm,
});

type Section = "overview" | "pipeline" | "complaints" | "activities";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "pipeline", "complaints", "activities"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "CRM", subtitle: "crm.pipeline · complaints · activities" },
  pipeline: { title: "Sales Pipeline", subtitle: "crm.pipeline_deal" },
  complaints: { title: "Complaints", subtitle: "crm.complaint" },
  activities: { title: "Customer Activities", subtitle: "crm.customer_activity" },
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

function Crm() {
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
      {section === "pipeline" && <PipelineSection onFlash={setFlash} />}
      {section === "complaints" && <ComplaintsSection onFlash={setFlash} />}
      {section === "activities" && <ActivitiesSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["crm", "overview"],
    queryFn: crmApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const chartData = (kpi?.deals_by_stage || []).map((s) => ({
    stage: s.name,
    count: s.count,
    value: s.value,
    code: s.code,
  }));

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Open Deals" value={kpi?.open_deals ?? 0} sub="active pipeline" />
        <Mini label="Pipeline Value" value={fmtNPR(kpi?.pipeline_value ?? 0)} sub="open stages" />
        <Mini label="Won" value={fmtNPR(kpi?.won_value ?? 0)} sub="closed revenue" />
        <Mini
          label="Conversion"
          value={kpi ? `${kpi.conversion_pct}%` : "—"}
          sub={`${kpi?.open_complaints ?? 0} open complaints`}
        />
      </div>

      <div className="rounded-2xl bg-card border border-border p-4 lg:p-5 mb-5">
        <div className="text-sm font-semibold mb-1">Pipeline by stage</div>
        <div className="text-xs text-muted-foreground mb-4">crm.pipeline_deal</div>
        {chartData.every((s) => !s.count) ? (
          <div className="text-xs text-muted-foreground py-8 text-center">No deals yet.</div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "var(--color-secondary)" }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [v.toLocaleString(), "Count"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((s) => (
                    <Cell
                      key={s.code}
                      fill={
                        s.code === "lost"
                          ? "var(--color-danger)"
                          : s.code === "won"
                            ? "var(--color-success)"
                            : "var(--color-primary)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-border">
            <div className="text-sm font-semibold">Complaints by status</div>
          </div>
          {(kpi?.complaints_by_status || []).every((s) => !s.value) ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No complaints yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.complaints_by_status || []).map((s) => (
                <div key={s.code} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <Tag>{s.value}</Tag>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-border">
            <div className="text-sm font-semibold">Recent activities</div>
          </div>
          {(kpi?.recent_activities || []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No activities yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_activities || []).map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.party_name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.activity_type} · {a.performed_by_name || "—"} · {fmtDate(a.performed_at)}
                    </div>
                  </div>
                  <StatusBadge status={a.activity_type} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

/* ── Pipeline ─────────────────────────────────────────────────────────────── */

function PipelineSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState("-expected_close");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmDeal | null>(null);

  const options = useQuery({ queryKey: ["crm", "options"], queryFn: crmApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["crm", "deals", search, stage, sort, page],
    queryFn: () =>
      crmApi.deals({
        search: search || undefined,
        stage: stage || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["crm"] });

  const dealAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "won" | "lost" }) =>
      crmApi.dealAction(id, action),
    onSuccess: (_, v) => {
      onFlash(v.action === "won" ? "Deal marked won." : "Deal marked lost.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => crmApi.deleteDeal(id),
    onSuccess: () => {
      onFlash("Deal deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : `-${field}`));
    setPage(1);
  };

  if (!authed) return <SignInHint />;

  const stages = options.data?.deal_stages || [];
  const rows = q.data?.results || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search title, party, owner…"
      filters={
        <select
          className={inputCls}
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      }
      form={
        <button
          type="button"
          className={btnCls}
          style={btnPrimary}
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Deal
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <DealForm
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
            invalidate();
          }}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="lg:hidden divide-y divide-border">
          {rows.map((d) => (
            <div key={d.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold truncate">{d.title}</span>
                <StatusBadge status={d.stage} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {d.party_name} · {d.owner_name}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-semibold tabular-nums text-sm">{fmtNPR(d.value)}</span>
                <span className="text-[11px] text-muted-foreground">{fmtDate(d.expected_close)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-[10px] font-semibold text-primary"
                  onClick={() => {
                    setEditing(d);
                    setShowForm(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => del.mutate(d.id)}
                >
                  Delete
                </button>
                {d.stage !== "won" && d.stage !== "lost" && (
                  <>
                    <button
                      type="button"
                      disabled={dealAction.isPending}
                      onClick={() => dealAction.mutate({ id: d.id, action: "won" })}
                      className="text-[10px] font-semibold"
                      style={{ color: "var(--color-success)" }}
                    >
                      Won
                    </button>
                    <button
                      type="button"
                      disabled={dealAction.isPending}
                      onClick={() => dealAction.mutate({ id: d.id, action: "lost" })}
                      className="text-[10px] font-semibold"
                      style={{ color: "var(--color-danger)" }}
                    >
                      Lost
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <SortTh label="Title" field="title" sort={sort} onSort={toggleSort} />
                <Th>Party</Th>
                <Th>Owner</Th>
                <SortTh label="Value" field="value" sort={sort} onSort={toggleSort} />
                <SortTh label="Stage" field="stage" sort={sort} onSort={toggleSort} />
                <SortTh label="Expected close" field="expected_close" sort={sort} onSort={toggleSort} />
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{d.title}</Td>
                  <Td>{d.party_name || "—"}</Td>
                  <Td>{d.owner_name || "—"}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(d.value)}</Td>
                  <Td>
                    <StatusBadge status={d.stage} />
                  </Td>
                  <Td className="text-muted-foreground">{fmtDate(d.expected_close)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(d);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(d.id)}
                      >
                        Delete
                      </button>
                      {d.stage !== "won" && d.stage !== "lost" && (
                        <>
                          <button
                            type="button"
                            disabled={dealAction.isPending}
                            onClick={() => dealAction.mutate({ id: d.id, action: "won" })}
                            className="text-[10px] font-semibold"
                            style={{ color: "var(--color-success)" }}
                          >
                            Won
                          </button>
                          <button
                            type="button"
                            disabled={dealAction.isPending}
                            onClick={() => dealAction.mutate({ id: d.id, action: "lost" })}
                            className="text-[10px] font-semibold"
                            style={{ color: "var(--color-danger)" }}
                          >
                            Lost
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function DealForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CrmOptions;
  initial: CrmDeal | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    party_id: initial?.party_id || "",
    owner_id: initial?.owner_id || "",
    value: initial ? String(initial.value) : "",
    stage: initial?.stage || options.deal_stages[0]?.value || "lead",
    expected_close: initial?.expected_close?.slice(0, 10) || "",
    work_order_id: initial?.work_order_id || "",
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        value: form.value ? Number(form.value) : 0,
        work_order_id: form.work_order_id || null,
        expected_close: form.expected_close || null,
      };
      return initial ? crmApi.updateDeal(initial.id, body) : crmApi.createDeal(body);
    },
    onSuccess: () => onSaved(initial ? "Deal updated." : "Deal created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit deal" : "New deal"} onClose={onClose}>
      <Field label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Party *">
        <select
          className={inputCls}
          value={form.party_id}
          onChange={(e) => setForm({ ...form, party_id: e.target.value })}
        >
          <option value="">Select party</option>
          {options.parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner *">
        <select
          className={inputCls}
          value={form.owner_id}
          onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
        >
          <option value="">Select owner</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Value">
          <input
            className={inputCls}
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </Field>
        <Field label="Expected close">
          <input
            className={inputCls}
            type="date"
            value={form.expected_close}
            onChange={(e) => setForm({ ...form, expected_close: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Stage">
        <select
          className={inputCls}
          value={form.stage}
          onChange={(e) => setForm({ ...form, stage: e.target.value })}
        >
          {options.deal_stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Work order">
        <select
          className={inputCls}
          value={form.work_order_id}
          onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}
        >
          <option value="">Optional</option>
          {options.work_orders.map((w) => (
            <option key={w.id} value={w.id}>
              {w.wo_no}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.title.trim() || !form.party_id || !form.owner_id}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Complaints ───────────────────────────────────────────────────────────── */

function ComplaintsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-registered_at");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmComplaint | null>(null);

  const options = useQuery({ queryKey: ["crm", "options"], queryFn: crmApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["crm", "complaints", search, status, sort, page],
    queryFn: () =>
      crmApi.complaints({
        search: search || undefined,
        status: status || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["crm"] });

  const advance = useMutation({
    mutationFn: (id: string) => crmApi.complaintAction(id, { action: "advance" }),
    onSuccess: () => {
      onFlash("Complaint advanced.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => crmApi.deleteComplaint(id),
    onSuccess: () => {
      onFlash("Complaint deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : `-${field}`));
    setPage(1);
  };

  if (!authed) return <SignInHint />;

  const statuses = options.data?.complaint_statuses || [];
  const rows = q.data?.results || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search description, customer, product…"
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
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      }
      form={
        <button
          type="button"
          className={btnCls}
          style={btnPrimary}
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Complaint
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <ComplaintForm
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
            invalidate();
          }}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="lg:hidden divide-y divide-border">
          {rows.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold truncate">{c.customer_name || "Customer"}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-2">{c.description}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {c.product_name || "No product"} · SLA {c.sla_hours}h · {fmtDate(c.registered_at)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-[10px] font-semibold text-primary"
                  onClick={() => {
                    setEditing(c);
                    setShowForm(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => del.mutate(c.id)}
                >
                  Delete
                </button>
                {c.status !== "closed" && (
                  <button
                    type="button"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate(c.id)}
                    className="text-[10px] font-semibold text-primary"
                  >
                    Advance
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Customer</Th>
                <Th>Product</Th>
                <Th>Description</Th>
                <SortTh label="Status" field="status" sort={sort} onSort={toggleSort} />
                <SortTh label="SLA" field="sla_hours" sort={sort} onSort={toggleSort} />
                <SortTh label="Registered" field="registered_at" sort={sort} onSort={toggleSort} />
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{c.customer_name || "—"}</Td>
                  <Td>{c.product_name || "—"}</Td>
                  <Td className="max-w-[240px] truncate">{c.description}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td className="tabular-nums">{c.sla_hours}h</Td>
                  <Td className="text-muted-foreground">{fmtDate(c.registered_at)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(c);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(c.id)}
                      >
                        Delete
                      </button>
                      {c.status !== "closed" && (
                        <button
                          type="button"
                          disabled={advance.isPending}
                          onClick={() => advance.mutate(c.id)}
                          className="text-[10px] font-semibold text-primary"
                        >
                          Advance
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function ComplaintForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CrmOptions;
  initial: CrmComplaint | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    customer_id: initial?.customer_id || "",
    product_id: initial?.product_id || "",
    description: initial?.description || "",
    sla_hours: String(initial?.sla_hours ?? 48),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        customer_id: form.customer_id || undefined,
        product_id: form.product_id || null,
        description: form.description,
        sla_hours: Number(form.sla_hours) || 48,
      };
      return initial ? crmApi.updateComplaint(initial.id, body) : crmApi.createComplaint(body);
    },
    onSuccess: () => onSaved(initial ? "Complaint updated." : "Complaint registered."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit complaint" : "New complaint"} onClose={onClose}>
      <Field label="Customer *">
        <select
          className={inputCls}
          value={form.customer_id}
          onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
        >
          <option value="">Select customer</option>
          {options.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
          <option value="">Optional</option>
          {options.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description *">
        <textarea
          className={`${inputCls} h-24 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="SLA hours">
        <input
          className={inputCls}
          type="number"
          value={form.sla_hours}
          onChange={(e) => setForm({ ...form, sla_hours: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.description.trim() || (!initial && !form.customer_id)}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Activities ───────────────────────────────────────────────────────────── */

function ActivitiesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activityType, setActivityType] = useState("");
  const [sort, setSort] = useState("-performed_at");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmActivity | null>(null);

  const options = useQuery({ queryKey: ["crm", "options"], queryFn: crmApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["crm", "activities", search, activityType, sort, page],
    queryFn: () =>
      crmApi.activities({
        search: search || undefined,
        activity_type: activityType || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["crm"] });

  const del = useMutation({
    mutationFn: (id: string) => crmApi.deleteActivity(id),
    onSuccess: () => {
      onFlash("Activity deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : `-${field}`));
    setPage(1);
  };

  if (!authed) return <SignInHint />;

  const types = options.data?.activity_types || [];
  const rows = q.data?.results || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search party, notes, performer…"
      filters={
        <select
          className={inputCls}
          value={activityType}
          onChange={(e) => {
            setActivityType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      }
      form={
        <button
          type="button"
          className={btnCls}
          style={btnPrimary}
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Activity
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <ActivityForm
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
            invalidate();
          }}
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <div className="lg:hidden divide-y divide-border">
          {rows.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold truncate">{a.party_name || "—"}</span>
                <StatusBadge status={a.activity_type} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {a.performed_by_name} · {fmtDate(a.performed_at)}
              </div>
              {a.notes && <div className="mt-1 text-sm line-clamp-2">{a.notes}</div>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-[10px] font-semibold text-primary"
                  onClick={() => {
                    setEditing(a);
                    setShowForm(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => del.mutate(a.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Party</Th>
                <SortTh label="Type" field="activity_type" sort={sort} onSort={toggleSort} />
                <Th>Performed by</Th>
                <Th>Notes</Th>
                <SortTh label="When" field="performed_at" sort={sort} onSort={toggleSort} />
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{a.party_name || "—"}</Td>
                  <Td>
                    <StatusBadge status={a.activity_type} />
                  </Td>
                  <Td>{a.performed_by_name || "—"}</Td>
                  <Td className="max-w-[240px] truncate">{a.notes || "—"}</Td>
                  <Td className="text-muted-foreground">{fmtDate(a.performed_at)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(a);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(a.id)}
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
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function ActivityForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CrmOptions;
  initial: CrmActivity | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const toLocalInput = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [form, setForm] = useState({
    party_id: initial?.party_id || "",
    performed_by_id: initial?.performed_by_id || "",
    activity_type: initial?.activity_type || options.activity_types[0]?.value || "call",
    notes: initial?.notes || "",
    performed_at: toLocalInput(initial?.performed_at || "") || toLocalInput(new Date().toISOString()),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        performed_at: form.performed_at ? new Date(form.performed_at).toISOString() : undefined,
      };
      return initial ? crmApi.updateActivity(initial.id, body) : crmApi.createActivity(body);
    },
    onSuccess: () => onSaved(initial ? "Activity updated." : "Activity logged."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit activity" : "New activity"} onClose={onClose}>
      <Field label="Party *">
        <select
          className={inputCls}
          value={form.party_id}
          onChange={(e) => setForm({ ...form, party_id: e.target.value })}
        >
          <option value="">Select party</option>
          {options.parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Performed by *">
        <select
          className={inputCls}
          value={form.performed_by_id}
          onChange={(e) => setForm({ ...form, performed_by_id: e.target.value })}
        >
          <option value="">Select employee</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Activity type *">
        <select
          className={inputCls}
          value={form.activity_type}
          onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
        >
          {options.activity_types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Performed at">
        <input
          className={inputCls}
          type="datetime-local"
          value={form.performed_at}
          onChange={(e) => setForm({ ...form, performed_at: e.target.value })}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className={`${inputCls} h-24 py-2`}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.party_id || !form.performed_by_id || !form.activity_type}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load CRM data from the database.
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

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function SortTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: string;
  onSort: (field: string) => void;
}) {
  const active = sort === field || sort === `-${field}`;
  const dir = sort === field ? "↑" : sort === `-${field}` ? "↓" : "";
  return (
    <th className="px-4 py-3 font-semibold">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(field)}>
        {label}
        {active && <span className="text-[10px]">{dir}</span>}
      </button>
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
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
      <div className="p-3 text-[11px] text-muted-foreground border-t border-border">{meta.count} records</div>
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
