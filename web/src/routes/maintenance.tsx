import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { Plus, Search, Wrench, CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  maintenanceApi,
  type MaintenanceCalibration,
  type MaintenanceEquipment,
  type MaintenanceOptions,
  type MaintenancePMSchedule,
  type MaintenanceWorkOrder,
} from "@/lib/maintenance-api";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance — Sunyazon BEOS" },
      {
        name: "description",
        content: "Equipment register, PM schedules, work orders and calibration for Sunyazon plants.",
      },
    ],
  }),
  component: Maintenance,
});

type Section = "overview" | "equipment" | "pm" | "workorders" | "calibration";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "equipment", "pm", "workorders", "calibration"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Maintenance", subtitle: "equipment · pm · work orders · calibration" },
  equipment: { title: "Equipment", subtitle: "maintenance.equipment" },
  pm: { title: "PM Schedules", subtitle: "maintenance.pm_schedule" },
  workorders: { title: "Work Orders", subtitle: "maintenance.work_order" },
  calibration: { title: "Calibration", subtitle: "maintenance.calibration" },
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

function Maintenance() {
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
      {section === "equipment" && <EquipmentSection onFlash={setFlash} />}
      {section === "pm" && <PmSection onFlash={setFlash} />}
      {section === "workorders" && <WorkOrdersSection onFlash={setFlash} />}
      {section === "calibration" && <CalibrationSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["maintenance", "overview"],
    queryFn: maintenanceApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const healthData = kpi?.health_index?.length ? kpi.health_index : [];
  const typeData = kpi?.by_type?.length ? kpi.by_type : [];

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load maintenance data from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Equipment" value={kpi?.equipment_count ?? 0} sub="registered" />
        <Mini label="Open WOs" value={kpi?.open_wo_count ?? 0} sub="active requests" />
        <Mini
          label="PM due (7d)"
          value={kpi?.pm_due_soon_count ?? 0}
          sub="schedules"
          style={{ color: "var(--color-warning)" }}
        />
        <Mini
          label="Cal overdue"
          value={kpi?.overdue_calibrations ?? 0}
          sub="past due"
          style={{ color: "var(--color-danger)" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Health index</div>
          {healthData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No equipment yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {healthData.map((s) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "green"
                            ? "var(--color-success)"
                            : s.code === "yellow"
                              ? "var(--color-warning)"
                              : s.code === "red"
                                ? "var(--color-danger)"
                                : chartSeries[0]
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

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Open WO by type</div>
          {typeData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No open work orders.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">PM due within 7 days</div>
          </div>
          {(kpi?.pm_due_soon || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">Nothing due soon.</div>
          ) : (
            <div className="divide-y divide-border max-h-48 overflow-y-auto">
              {(kpi?.pm_due_soon || []).map((row) => (
                <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground">{row.equipment_code}</div>
                    <div className="text-sm font-semibold truncate">{row.activity}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {row.frequency} · due {fmtDate(row.next_due)}
                    </div>
                  </div>
                  <Tag>{row.equipment_name || "—"}</Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Open work orders by status</div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {(kpi?.open_work_orders || []).map((s) => (
            <Mini key={s.code} label={s.name} value={s.value} sub={s.code} />
          ))}
        </div>
      </div>
    </QueryState>
  );
}

/* ── Equipment ────────────────────────────────────────────────────────────── */

function EquipmentSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("asset_code");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceEquipment | null>(null);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["maintenance", "options"],
    queryFn: maintenanceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["maintenance", "equipment", search, health, category, sort, page],
    queryFn: () =>
      maintenanceApi.equipment({
        search,
        health_index: health || undefined,
        category: category || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteEquipment(id),
    onSuccess: () => {
      onFlash("Equipment deleted.");
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
    setPage(1);
  };

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search asset code, name, location…"
      filters={
        <>
          <select
            className={inputCls}
            value={health}
            onChange={(e) => {
              setHealth(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All health</option>
            {(options.data?.health_indexes || []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(options.data?.equipment_categories || []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </>
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
          <Plus className="h-4 w-4" /> New Equipment
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <EquipmentForm
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
            void qc.invalidateQueries({ queryKey: ["maintenance"] });
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
            { label: "Asset", field: "asset_code" },
            { label: "Name", field: "name" },
            { label: "Location", field: "location" },
            { label: "Category", field: "category" },
            { label: "Health", field: "health_index" },
            { label: "Next PM" },
            { label: "Open WOs" },
            { label: "Actions" },
          ]}
          sort={sort}
          onSort={toggleSort}
          rows={(q.data?.results || []).map((row: MaintenanceEquipment) => [
            <span key="c" className="font-mono text-xs">
              {row.asset_code}
            </span>,
            <div key="n">
              <div className="font-semibold">{row.name}</div>
              <div className="text-[11px] text-muted-foreground">{row.capacity || "—"}</div>
            </div>,
            row.location || "—",
            <Tag key="cat">{row.category}</Tag>,
            <StatusBadge key="h" status={row.health_index} />,
            fmtDate(row.next_pm_due) || "—",
            row.open_wo_count,
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete ${row.asset_code}?`)) remove.mutate(row.id);
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

function EquipmentForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: MaintenanceOptions;
  initial?: MaintenanceEquipment | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    asset_code: initial?.asset_code || "",
    name: initial?.name || "",
    location: initial?.location || "",
    capacity: initial?.capacity || "",
    category: initial?.category || options.equipment_categories[0]?.value || "B",
    health_index: initial?.health_index || options.health_indexes[0]?.value || "green",
    purchase_date: initial?.purchase_date || "",
  });
  const save = useMutation({
    mutationFn: () =>
      initial ? maintenanceApi.updateEquipment(initial.id, form) : maintenanceApi.createEquipment(form),
    onSuccess: () => onSaved(initial ? "Equipment updated." : "Equipment created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit equipment" : "New equipment"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Asset code *">
          <input
            className={inputCls}
            value={form.asset_code}
            onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
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
      <Field label="Location">
        <input
          className={inputCls}
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
      </Field>
      <Field label="Capacity">
        <input
          className={inputCls}
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select
            className={inputCls}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {options.equipment_categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Health">
          <select
            className={inputCls}
            value={form.health_index}
            onChange={(e) => setForm({ ...form, health_index: e.target.value })}
          >
            {options.health_indexes.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Purchase date">
        <input
          className={inputCls}
          type="date"
          value={form.purchase_date}
          onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.asset_code.trim() || !form.name.trim()}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Work Orders ──────────────────────────────────────────────────────────── */

function WorkOrdersSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-requested_at");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceWorkOrder | null>(null);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["maintenance", "options"],
    queryFn: maintenanceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["maintenance", "work-orders", search, status, sort, page],
    queryFn: () =>
      maintenanceApi.workOrders({
        search,
        status: status || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "approve" | "start" | "close" }) =>
      maintenanceApi.woAction(id, act),
    onSuccess: (_d, v) => {
      onFlash(`Work order ${v.act === "close" ? "closed" : v.act + "d"}.`);
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteWorkOrder(id),
    onSuccess: () => {
      onFlash("Work order deleted.");
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
    setPage(1);
  };

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search description, asset, technician…"
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
          {(options.data?.wo_statuses || []).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
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
          <Plus className="h-4 w-4" /> New WO
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <WorkOrderForm
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
            void qc.invalidateQueries({ queryKey: ["maintenance"] });
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
            { label: "Asset" },
            { label: "Type", field: "type" },
            { label: "Description" },
            { label: "Technician" },
            { label: "Requested", field: "requested_at" },
            { label: "Status", field: "status" },
            { label: "Actions" },
          ]}
          sort={sort}
          onSort={toggleSort}
          rows={(q.data?.results || []).map((row: MaintenanceWorkOrder) => [
            <div key="a">
              <div className="text-[10px] font-mono text-muted-foreground">{row.equipment_code}</div>
              <div className="font-semibold">{row.equipment_name || "—"}</div>
            </div>,
            <Tag key="t">{row.type}</Tag>,
            <span key="d" className="line-clamp-2 max-w-[220px]">
              {row.description || "—"}
            </span>,
            row.technician_name || "—",
            fmtDate(row.requested_at) || "—",
            <StatusBadge key="s" status={row.status} />,
            <div key="act" className="flex flex-wrap gap-1">
              {row.status === "requested" && (
                <ActionBtn
                  label="Approve"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id: row.id, act: "approve" })}
                />
              )}
              {row.status === "approved" && (
                <ActionBtn
                  label="Start"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id: row.id, act: "start" })}
                />
              )}
              {row.status !== "closed" && (
                <ActionBtn
                  label="Close"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id: row.id, act: "close" })}
                />
              )}
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("Delete this work order?")) remove.mutate(row.id);
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

function WorkOrderForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: MaintenanceOptions;
  initial?: MaintenanceWorkOrder | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    equipment_id: initial?.equipment_id || "",
    technician_id: initial?.technician_id || "",
    type: initial?.type || options.wo_types[0]?.value || "breakdown",
    description: initial?.description || "",
  });
  const save = useMutation({
    mutationFn: () =>
      initial ? maintenanceApi.updateWorkOrder(initial.id, form) : maintenanceApi.createWorkOrder(form),
    onSuccess: () => onSaved(initial ? "Work order updated." : "Work order created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit work order" : "New work order"} onClose={onClose}>
      <Field label="Equipment *">
        <select
          className={inputCls}
          value={form.equipment_id}
          onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
        >
          <option value="">Select equipment</option>
          {options.equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.asset_code} — {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Technician">
        <select
          className={inputCls}
          value={form.technician_id}
          onChange={(e) => setForm({ ...form, technician_id: e.target.value })}
        >
          <option value="">Unassigned</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select
          className={inputCls}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {options.wo_types.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <textarea
          className="w-full min-h-[80px] rounded-xl bg-secondary text-sm p-3 outline-none border border-transparent focus:border-primary"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.equipment_id}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── PM Schedules ─────────────────────────────────────────────────────────── */

function PmSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("next_due");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenancePMSchedule | null>(null);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["maintenance", "options"],
    queryFn: maintenanceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["maintenance", "pm", search, sort, page],
    queryFn: () => maintenanceApi.pmSchedules({ search, sort, page, page_size: 20 }),
    enabled: authed,
  });

  const generate = useMutation({
    mutationFn: () => maintenanceApi.generatePmDue(),
    onSuccess: (res) => {
      onFlash(`Generated ${res.created} preventive work order(s).`);
      void qc.invalidateQueries({ queryKey: ["maintenance", "work-orders"] });
      void qc.invalidateQueries({ queryKey: ["maintenance", "overview"] });
      void qc.invalidateQueries({ queryKey: ["maintenance", "pm"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => maintenanceApi.deletePmSchedule(id),
    onSuccess: () => {
      onFlash("PM schedule deleted.");
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
    setPage(1);
  };

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search activity or equipment…"
      form={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
            style={{ border: "1px solid var(--color-border)" }}
          >
            <CalendarCheck className="h-4 w-4" />
            {generate.isPending ? "Generating…" : "Generate due work orders"}
          </button>
          <button
            type="button"
            className={btnCls}
            style={btnPrimary}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> New PM
          </button>
        </div>
      }
    >
      {(showForm || editing) && options.data && (
        <PmForm
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
            void qc.invalidateQueries({ queryKey: ["maintenance"] });
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
            { label: "Equipment" },
            { label: "Activity", field: "activity" },
            { label: "Frequency", field: "frequency" },
            { label: "Next due", field: "next_due" },
            { label: "Last done", field: "last_done" },
            { label: "Actions" },
          ]}
          sort={sort}
          onSort={toggleSort}
          rows={(q.data?.results || []).map((row: MaintenancePMSchedule) => [
            <div key="e">
              <div className="text-[10px] font-mono text-muted-foreground">{row.equipment_code}</div>
              <div className="font-semibold">{row.equipment_name || "—"}</div>
            </div>,
            row.activity,
            <Tag key="f">{row.frequency}</Tag>,
            fmtDate(row.next_due) || "—",
            fmtDate(row.last_done) || "—",
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("Delete this PM schedule?")) remove.mutate(row.id);
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

function PmForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: MaintenanceOptions;
  initial?: MaintenancePMSchedule | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    equipment_id: initial?.equipment_id || "",
    frequency: initial?.frequency || options.pm_frequencies[0]?.value || "monthly",
    activity: initial?.activity || "",
    next_due: initial?.next_due || new Date().toISOString().slice(0, 10),
  });
  const save = useMutation({
    mutationFn: () =>
      initial
        ? maintenanceApi.updatePmSchedule(initial.id, form)
        : maintenanceApi.createPmSchedule(form),
    onSuccess: () => onSaved(initial ? "PM schedule updated." : "PM schedule created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit PM schedule" : "New PM schedule"} onClose={onClose}>
      <Field label="Equipment *">
        <select
          className={inputCls}
          value={form.equipment_id}
          onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
        >
          <option value="">Select equipment</option>
          {options.equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.asset_code} — {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Frequency">
        <select
          className={inputCls}
          value={form.frequency}
          onChange={(e) => setForm({ ...form, frequency: e.target.value })}
        >
          {options.pm_frequencies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Activity *">
        <input
          className={inputCls}
          value={form.activity}
          onChange={(e) => setForm({ ...form, activity: e.target.value })}
        />
      </Field>
      <Field label="Next due *">
        <input
          className={inputCls}
          type="date"
          value={form.next_due}
          onChange={(e) => setForm({ ...form, next_due: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.equipment_id || !form.activity.trim() || !form.next_due}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Calibration ──────────────────────────────────────────────────────────── */

function CalibrationSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [sort, setSort] = useState("-calibrated_at");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceCalibration | null>(null);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["maintenance", "options"],
    queryFn: maintenanceApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["maintenance", "calibrations", search, result, sort, page],
    queryFn: () =>
      maintenanceApi.calibrations({
        search,
        result: result || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => maintenanceApi.deleteCalibration(id),
    onSuccess: () => {
      onFlash("Calibration deleted.");
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : field));
    setPage(1);
  };

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search equipment or technician…"
      filters={
        <select
          className={inputCls}
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All results</option>
          {(options.data?.calibration_results || []).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
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
          <Plus className="h-4 w-4" /> New Calibration
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <CalibrationForm
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
            void qc.invalidateQueries({ queryKey: ["maintenance"] });
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
            { label: "Equipment" },
            { label: "Calibrated", field: "calibrated_at" },
            { label: "Next due", field: "next_due" },
            { label: "Result", field: "result" },
            { label: "Performed by" },
            { label: "Actions" },
          ]}
          sort={sort}
          onSort={toggleSort}
          rows={(q.data?.results || []).map((row: MaintenanceCalibration) => [
            <div key="e">
              <div className="text-[10px] font-mono text-muted-foreground">{row.equipment_code}</div>
              <div className="font-semibold">{row.equipment_name || "—"}</div>
            </div>,
            fmtDate(row.calibrated_at) || "—",
            fmtDate(row.next_due) || "—",
            <StatusBadge key="r" status={row.result} />,
            row.performed_by_name || "—",
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("Delete this calibration?")) remove.mutate(row.id);
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

function CalibrationForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: MaintenanceOptions;
  initial?: MaintenanceCalibration | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    equipment_id: initial?.equipment_id || "",
    performed_by_id: initial?.performed_by_id || "",
    calibrated_at: initial?.calibrated_at || new Date().toISOString().slice(0, 10),
    next_due: initial?.next_due || "",
    result: initial?.result || options.calibration_results[0]?.value || "pass",
  });
  const save = useMutation({
    mutationFn: () =>
      initial
        ? maintenanceApi.updateCalibration(initial.id, form)
        : maintenanceApi.createCalibration(form),
    onSuccess: () => onSaved(initial ? "Calibration updated." : "Calibration recorded."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit calibration" : "New calibration"} onClose={onClose}>
      <Field label="Equipment *">
        <select
          className={inputCls}
          value={form.equipment_id}
          onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
        >
          <option value="">Select equipment</option>
          {options.equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.asset_code} — {e.name}
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
          <option value="">Select technician</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Calibrated at">
          <input
            className={inputCls}
            type="date"
            value={form.calibrated_at}
            onChange={(e) => setForm({ ...form, calibrated_at: e.target.value })}
          />
        </Field>
        <Field label="Next due *">
          <input
            className={inputCls}
            type="date"
            value={form.next_due}
            onChange={(e) => setForm({ ...form, next_due: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Result">
        <select
          className={inputCls}
          value={form.result}
          onChange={(e) => setForm({ ...form, result: e.target.value })}
        >
          {options.calibration_results.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.equipment_id || !form.performed_by_id || !form.next_due}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

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
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="text-2xl font-semibold mt-1" style={style}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load maintenance data from the database.
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

type HeaderCell = string | { label: string; field?: string };

function DataTable({
  headers,
  rows,
  empty = "No records yet.",
  sort,
  onSort,
}: {
  headers: HeaderCell[];
  rows: React.ReactNode[][];
  empty?: string;
  sort?: string;
  onSort?: (field: string) => void;
}) {
  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
            {headers.map((h) => {
              const label = typeof h === "string" ? h : h.label;
              const field = typeof h === "string" ? undefined : h.field;
              const active = field && (sort === field || sort === `-${field}`);
              return (
                <th key={label} className="px-4 py-3 font-semibold">
                  {field && onSort ? (
                    <button
                      type="button"
                      className={`uppercase tracking-widest ${active ? "text-foreground" : ""}`}
                      onClick={() => onSort(field)}
                    >
                      {label}
                      {active ? (sort?.startsWith("-") ? " ↓" : " ↑") : ""}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
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
