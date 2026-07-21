import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search, Truck, MapPin, PackageCheck, Car } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate, fmtNPR } from "@/lib/format";
import {
  logisticsApi,
  type LogisticsDispatch,
  type LogisticsOptions,
  type LogisticsPOD,
  type LogisticsRoute,
  type LogisticsVehicle,
} from "@/lib/logistics-api";

export const Route = createFileRoute("/logistics")({
  head: () => ({
    meta: [
      { title: "Logistics — Sunyazon BEOS" },
      {
        name: "description",
        content: "Vehicles, routes, dispatch lifecycle and proof of delivery.",
      },
    ],
  }),
  component: Logistics,
});

type Section = "overview" | "vehicles" | "routes" | "dispatch" | "pod";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "vehicles", "routes", "dispatch", "pod"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Logistics", subtitle: "logistics.vehicle · route · dispatch · pod" },
  vehicles: { title: "Vehicles", subtitle: "logistics.vehicle" },
  routes: { title: "Routes", subtitle: "logistics.route" },
  dispatch: { title: "Dispatch", subtitle: "logistics.dispatch" },
  pod: { title: "Proof of Delivery", subtitle: "logistics.pod" },
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

function Logistics() {
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
      {section === "vehicles" && <VehiclesSection onFlash={setFlash} />}
      {section === "routes" && <RoutesSection onFlash={setFlash} />}
      {section === "dispatch" && <DispatchSection onFlash={setFlash} />}
      {section === "pod" && <PodSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["logistics", "overview"],
    queryFn: logisticsApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_status?.length ? kpi.by_status : [];

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load logistics data from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Vehicles" value={kpi?.active_vehicles ?? 0} sub="fleet" />
        <Mini label="Routes" value={kpi?.routes_count ?? 0} sub="configured" />
        <Mini label="Delivered today" value={kpi?.deliveries_today ?? 0} sub={`${kpi?.deliveries_week ?? 0} this week`} />
        <Mini
          label="PODs"
          value={kpi?.pods_received ?? 0}
          sub={`${kpi?.pods_pending ?? 0} pending`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Dispatches by status</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No dispatches yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "delivered"
                            ? "var(--color-success)"
                            : s.code === "cancelled"
                              ? "var(--color-danger)"
                              : s.code === "dispatched"
                                ? "var(--color-primary)"
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
            <Truck className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Recent dispatches</div>
          </div>
          {(kpi?.recent_dispatches || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No dispatches recorded.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_dispatches || []).map((row) => (
                <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground">{row.so_no || "—"}</div>
                    <div className="text-sm font-semibold truncate">
                      {row.vehicle_number || "—"} · {row.driver_name || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.route_name || "No route"} · {row.party_name || "—"}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

/* ── Vehicles ─────────────────────────────────────────────────────────────── */

function VehiclesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LogisticsVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["logistics", "vehicles", search, page],
    queryFn: () => logisticsApi.vehicles({ search, page, page_size: 20, sort: "number" }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => logisticsApi.deleteVehicle(id),
    onSuccess: () => {
      onFlash("Vehicle deleted.");
      void qc.invalidateQueries({ queryKey: ["logistics"] });
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
      placeholder="Search vehicle number…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New vehicle
        </button>
      }
    >
      {(showForm || editing) && (
        <VehicleForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setShowForm(false);
            setEditing(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Number", "Capacity", "Insurance", "Fitness", "Tax", "Actions"]}
          rows={(q.data?.results || []).map((row: LogisticsVehicle) => [
            <span key="n" className="font-mono text-xs font-semibold flex items-center gap-2">
              <Car className="h-3.5 w-3.5 text-primary" />
              {row.number}
            </span>,
            row.capacity,
            fmtDate(row.insurance_expiry) || "—",
            fmtDate(row.fitness_expiry) || "—",
            fmtDate(row.tax_expiry) || "—",
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete vehicle ${row.number}?`)) remove.mutate(row.id);
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

function VehicleForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: LogisticsVehicle | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    number: initial?.number || "",
    capacity: String(initial?.capacity ?? ""),
    insurance_expiry: initial?.insurance_expiry?.slice(0, 10) || "",
    fitness_expiry: initial?.fitness_expiry?.slice(0, 10) || "",
    tax_expiry: initial?.tax_expiry?.slice(0, 10) || "",
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        number: form.number,
        capacity: form.capacity ? Number(form.capacity) : 0,
        insurance_expiry: form.insurance_expiry || null,
        fitness_expiry: form.fitness_expiry || null,
        tax_expiry: form.tax_expiry || null,
      };
      return initial
        ? logisticsApi.updateVehicle(initial.id, body)
        : logisticsApi.createVehicle(body);
    },
    onSuccess: () => onSaved(initial ? "Vehicle updated." : "Vehicle created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit vehicle" : "New vehicle"} onClose={onClose}>
      <Field label="Number *">
        <input className={inputCls} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
      </Field>
      <Field label="Capacity">
        <input className={inputCls} type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Insurance expiry">
          <input className={inputCls} type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
        </Field>
        <Field label="Fitness expiry">
          <input className={inputCls} type="date" value={form.fitness_expiry} onChange={(e) => setForm({ ...form, fitness_expiry: e.target.value })} />
        </Field>
        <Field label="Tax expiry">
          <input className={inputCls} type="date" value={form.tax_expiry} onChange={(e) => setForm({ ...form, tax_expiry: e.target.value })} />
        </Field>
      </div>
      <ModalActions pending={save.isPending} disabled={!form.number.trim()} onClose={onClose} onSave={() => save.mutate()} />
    </Modal>
  );
}

/* ── Routes ───────────────────────────────────────────────────────────────── */

function RoutesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LogisticsRoute | null>(null);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["logistics", "options"], queryFn: logisticsApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["logistics", "routes", search, page],
    queryFn: () => logisticsApi.routes({ search, page, page_size: 20, sort: "name" }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => logisticsApi.deleteRoute(id),
    onSuccess: () => {
      onFlash("Route deleted.");
      void qc.invalidateQueries({ queryKey: ["logistics"] });
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
      placeholder="Search route or territory…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New route
        </button>
      }
    >
      {(showForm || editing) && options.data && (
        <RouteForm
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
            void qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Name", "Territory", "Stops", "Actions"]}
          rows={(q.data?.results || []).map((row: LogisticsRoute) => [
            <span key="n" className="font-semibold flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {row.name}
            </span>,
            row.territory_name || "—",
            row.stops,
            <div key="a" className="flex gap-1">
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete route ${row.name}?`)) remove.mutate(row.id);
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

function RouteForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: LogisticsOptions;
  initial: LogisticsRoute | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    territory_id: initial?.territory_id || "",
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        territory_id: form.territory_id || null,
      };
      return initial ? logisticsApi.updateRoute(initial.id, body) : logisticsApi.createRoute(body);
    },
    onSuccess: () => onSaved(initial ? "Route updated." : "Route created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={initial ? "Edit route" : "New route"} onClose={onClose}>
      <Field label="Name *">
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Territory">
        <select className={inputCls} value={form.territory_id} onChange={(e) => setForm({ ...form, territory_id: e.target.value })}>
          <option value="">None</option>
          {options.territories.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <ModalActions pending={save.isPending} disabled={!form.name.trim()} onClose={onClose} onSave={() => save.mutate()} />
    </Modal>
  );
}

/* ── Dispatch ─────────────────────────────────────────────────────────────── */

function DispatchSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LogisticsDispatch | null>(null);
  const [podFor, setPodFor] = useState<LogisticsDispatch | null>(null);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["logistics", "options"], queryFn: logisticsApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["logistics", "dispatches", search, status, page],
    queryFn: () =>
      logisticsApi.dispatches({
        search,
        status: status || undefined,
        page,
        page_size: 20,
        sort: "-dispatched_at",
      }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({
      id,
      act,
      extra,
    }: {
      id: string;
      act: "load" | "dispatch" | "pod" | "cancel";
      extra?: Record<string, unknown>;
    }) => logisticsApi.dispatchAction(id, act, extra),
    onSuccess: (_d, vars) => {
      onFlash(`Dispatch ${vars.act} completed.`);
      void qc.invalidateQueries({ queryKey: ["logistics"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const statuses = options.data?.dispatch_statuses || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search SO, vehicle, driver, route…"
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
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New dispatch
        </button>
      }
    >
      {showForm && options.data && (
        <DispatchForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
        />
      )}
      {editing && options.data && (
        <DispatchEditForm
          options={options.data}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
        />
      )}
      {podFor && (
        <PodRecordForm
          dispatch={podFor}
          onClose={() => setPodFor(null)}
          onSaved={(msg) => {
            setPodFor(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["SO", "Vehicle", "Driver", "Route", "Party", "Dispatched", "POD", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: LogisticsDispatch) => [
            <span key="so" className="font-mono text-xs">{row.so_no || "—"}</span>,
            row.vehicle_number || "—",
            row.driver_name || "—",
            row.route_name || "—",
            row.party_name || "—",
            fmtDate(row.dispatched_at) || "—",
            row.has_pod ? (
              <span key="pod" className="text-[11px] text-muted-foreground">
                {row.pod_received_by || "Received"}
              </span>
            ) : (
              "—"
            ),
            <StatusBadge key="s" status={row.status} />,
            <div key="a" className="flex flex-wrap gap-1">
              {(row.status === "planned" || row.status === "loaded") && (
                <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              )}
              {row.status === "planned" && (
                <ActionBtn
                  label="Load"
                  disabled={action.isPending}
                  onClick={() => {
                    if (confirm("Mark this dispatch as loaded?")) action.mutate({ id: row.id, act: "load" });
                  }}
                />
              )}
              {(row.status === "planned" || row.status === "loaded") && (
                <ActionBtn
                  label="Dispatch"
                  disabled={action.isPending}
                  onClick={() => {
                    if (confirm("Dispatch this load (stock OUT)?")) action.mutate({ id: row.id, act: "dispatch" });
                  }}
                />
              )}
              {row.status === "dispatched" && !row.has_pod && (
                <ActionBtn label="Record POD" onClick={() => setPodFor(row)} />
              )}
              {row.status !== "delivered" && row.status !== "cancelled" && (
                <ActionBtn
                  label="Cancel"
                  danger
                  disabled={action.isPending}
                  onClick={() => {
                    if (confirm("Cancel this dispatch?")) action.mutate({ id: row.id, act: "cancel" });
                  }}
                />
              )}
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function DispatchForm({
  options,
  onClose,
  onSaved,
}: {
  options: LogisticsOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    sales_order_id: "",
    vehicle_id: "",
    driver_id: "",
    route_id: "",
    warehouse_id: options.warehouses[0]?.id || "",
  });
  const create = useMutation({
    mutationFn: () =>
      logisticsApi.createDispatch({
        ...form,
        route_id: form.route_id || null,
      }),
    onSuccess: () => onSaved("Dispatch created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New dispatch" onClose={onClose}>
      <Field label="Sales order *">
        <select className={inputCls} value={form.sales_order_id} onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}>
          <option value="">Select SO</option>
          {options.sales_orders.map((so) => (
            <option key={so.id} value={so.id}>
              {so.so_no} — {so.party_name || "—"} ({so.status}) · {fmtNPR(so.total)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vehicle *">
        <select className={inputCls} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
          <option value="">Select vehicle</option>
          {options.vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.number} (cap {v.capacity})</option>
          ))}
        </select>
      </Field>
      <Field label="Driver *">
        <select className={inputCls} value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
          <option value="">Select driver</option>
          {options.drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
          ))}
        </select>
      </Field>
      <Field label="Route">
        <select className={inputCls} value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}>
          <option value="">Optional</option>
          {options.routes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Warehouse *">
        <select className={inputCls} value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
          <option value="">Select warehouse</option>
          {options.warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.sales_order_id || !form.vehicle_id || !form.driver_id || !form.warehouse_id}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

function DispatchEditForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: LogisticsOptions;
  initial: LogisticsDispatch;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    vehicle_id: initial.vehicle_id || "",
    driver_id: initial.driver_id || "",
    route_id: initial.route_id || "",
  });
  const save = useMutation({
    mutationFn: () =>
      logisticsApi.updateDispatch(initial.id, {
        vehicle_id: form.vehicle_id || null,
        driver_id: form.driver_id || null,
        route_id: form.route_id || null,
      }),
    onSuccess: () => onSaved("Dispatch updated."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={`Edit dispatch · ${initial.so_no}`} onClose={onClose}>
      <Field label="Vehicle">
        <select className={inputCls} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
          {options.vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.number}</option>
          ))}
        </select>
      </Field>
      <Field label="Driver">
        <select className={inputCls} value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
          {options.drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Route">
        <select className={inputCls} value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}>
          <option value="">None</option>
          {options.routes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
      <ModalActions pending={save.isPending} onClose={onClose} onSave={() => save.mutate()} />
    </Modal>
  );
}

function PodRecordForm({
  dispatch,
  onClose,
  onSaved,
}: {
  dispatch: LogisticsDispatch;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [receivedBy, setReceivedBy] = useState("");
  const save = useMutation({
    mutationFn: () =>
      logisticsApi.dispatchAction(dispatch.id, "pod", {
        signature: "signed",
        received_by: receivedBy || "Customer",
      }),
    onSuccess: () => onSaved("POD recorded."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title={`Record POD · ${dispatch.so_no}`} onClose={onClose}>
      <div className="mb-3 text-sm text-muted-foreground">
        Vehicle {dispatch.vehicle_number} · Driver {dispatch.driver_name || "—"}
      </div>
      <Field label="Received by">
        <input
          className={inputCls}
          value={receivedBy}
          placeholder="Customer / recipient name"
          onChange={(e) => setReceivedBy(e.target.value)}
        />
      </Field>
      <ModalActions pending={save.isPending} onClose={onClose} onSave={() => save.mutate()} />
    </Modal>
  );
}

/* ── POD ──────────────────────────────────────────────────────────────────── */

function PodSection({ onFlash: _onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["logistics", "pods", search, page],
    queryFn: () => logisticsApi.pods({ search, page, page_size: 20, sort: "-delivered_at" }),
    enabled: authed,
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search SO, vehicle, recipient…"
      form={
        <div className="text-xs text-muted-foreground px-1">
          Record PODs from the Dispatch section (Record POD action).
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["SO", "Vehicle", "Driver", "Route", "Received by", "Delivered", "Status"]}
          rows={(q.data?.results || []).map((row: LogisticsPOD) => [
            <span key="so" className="font-mono text-xs">{row.so_no || "—"}</span>,
            row.vehicle_number || "—",
            row.driver_name || "—",
            row.route_name || "—",
            <span key="rb" className="flex items-center gap-2">
              <PackageCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              {row.received_by || "—"}
            </span>,
            fmtDate(row.delivered_at) || "—",
            <StatusBadge key="s" status={row.dispatch_status || "delivered"} />,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load logistics data from the database.
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
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

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No records yet.</div>;
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
