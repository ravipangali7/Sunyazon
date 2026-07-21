import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Headphones, KeyRound, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  itApi,
  type ItOptions,
  type ItTicket,
  type TicketAction,
} from "@/lib/it-api";

export const Route = createFileRoute("/it")({
  head: () => ({
    meta: [
      { title: "IT & Digital Transformation — Sunyazon BEOS" },
      {
        name: "description",
        content: "Helpdesk tickets, assignment workflow, and active access sessions.",
      },
    ],
  }),
  component: ItPage,
});

type Section = "overview" | "helpdesk" | "access";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "helpdesk", "access"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "IT & DT", subtitle: "it.help_ticket · session" },
  helpdesk: { title: "Helpdesk", subtitle: "it.help_ticket" },
  access: { title: "Access & Sessions", subtitle: "it.session" },
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

function ItPage() {
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
      {section === "helpdesk" && <HelpdeskSection onFlash={setFlash} />}
      {section === "access" && <AccessSection />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["it", "overview"],
    queryFn: itApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_status?.length ? kpi.by_status : [];

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Open tickets" value={kpi?.open_tickets ?? 0} sub="open + in progress" style={{ color: "var(--color-warning)" }} />
        <Mini label="Avg open age" value={`${kpi?.avg_open_age_days ?? 0}d`} sub="days open" />
        <Mini label="Active sessions" value={kpi?.active_sessions ?? 0} sub="not expired" />
        <Mini
          label="Resolved"
          value={statusData.find((s) => s.code === "resolved")?.value ?? 0}
          sub={`${statusData.find((s) => s.code === "closed")?.value ?? 0} closed`}
          style={{ color: "var(--color-success)" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Tickets by status</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No tickets yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "open"
                            ? "var(--color-warning)"
                            : s.code === "in_progress"
                              ? "var(--color-primary)"
                              : s.code === "resolved"
                                ? "var(--color-success)"
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
            <Headphones className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Recent tickets</div>
          </div>
          {(kpi?.recent_tickets || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No recent tickets.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_tickets || []).map((row) => (
                <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{row.subject}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.category || "General"} · {row.user_name || "—"} · {fmtDate(row.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(kpi?.by_category || []).length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Tickets by category</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {(kpi?.by_category || []).map((c) => (
              <div key={c.name} className="rounded-xl bg-secondary/60 px-3 py-2">
                <div className="text-[11px] text-muted-foreground truncate">{c.name}</div>
                <div className="text-lg font-bold tabular-nums">{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </QueryState>
  );
}

/* ── Helpdesk ─────────────────────────────────────────────────────────────── */

function HelpdeskSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("-created_at");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ItTicket | null>(null);
  const [assigning, setAssigning] = useState<ItTicket | null>(null);
  const qc = useQueryClient();

  const options = useQuery({
    queryKey: ["it", "options"],
    queryFn: itApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["it", "tickets", search, status, category, sort, page],
    queryFn: () =>
      itApi.tickets({
        search,
        status: status || undefined,
        category: category || undefined,
        sort,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["it"] });
  };

  const actionMut = useMutation({
    mutationFn: ({
      id,
      action,
      extra,
    }: {
      id: string;
      action: TicketAction;
      extra?: Record<string, unknown>;
    }) => itApi.ticketAction(id, action, extra),
    onSuccess: (_d, vars) => {
      onFlash(`Ticket ${vars.action}d.`);
      invalidate();
      setAssigning(null);
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => itApi.deleteTicket(id),
    onSuccess: () => {
      onFlash("Ticket deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const toggleSort = (field: string) => {
    setSort((prev) => (prev === field ? `-${field}` : prev === `-${field}` ? field : `-${field}`));
    setPage(1);
  };

  if (!authed) return <SignInHint />;

  const statuses = options.data?.statuses || [];
  const categories = options.data?.categories || [];

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search subject, description, requester…"
      filters={
        <>
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
          <select
            className={inputCls}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New ticket
        </button>
      }
    >
      {showForm && options.data && (
        <TicketForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      {editing && options.data && (
        <TicketForm
          options={options.data}
          ticket={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      {assigning && options.data && (
        <AssignModal
          ticket={assigning}
          options={options.data}
          pending={actionMut.isPending}
          onClose={() => setAssigning(null)}
          onAssign={(assigned_to_id) =>
            actionMut.mutate({ id: assigning.id, action: "assign", extra: { assigned_to_id } })
          }
        />
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <SortTh label="Subject" field="subject" sort={sort} onSort={toggleSort} />
                <SortTh label="Category" field="category" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3 font-semibold">Requester</th>
                <th className="px-4 py-3 font-semibold">Assignee</th>
                <SortTh label="Status" field="status" sort={sort} onSort={toggleSort} />
                <SortTh label="Created" field="created_at" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.subject}</div>
                    {row.description ? (
                      <div className="text-[11px] text-muted-foreground line-clamp-1">{row.description}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.category || "—"}</td>
                  <td className="px-4 py-3">{row.user_name || "—"}</td>
                  <td className="px-4 py-3">{row.assigned_to_name || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{fmtDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.status !== "closed" && (
                        <ActionBtn label="Assign" onClick={() => setAssigning(row)} disabled={actionMut.isPending} />
                      )}
                      {row.status === "open" && (
                        <ActionBtn
                          label="Start"
                          onClick={() => actionMut.mutate({ id: row.id, action: "start" })}
                          disabled={actionMut.isPending}
                        />
                      )}
                      {(row.status === "open" || row.status === "in_progress") && (
                        <ActionBtn
                          label="Resolve"
                          onClick={() => actionMut.mutate({ id: row.id, action: "resolve" })}
                          disabled={actionMut.isPending}
                        />
                      )}
                      {row.status !== "closed" && (
                        <ActionBtn
                          label="Close"
                          onClick={() => actionMut.mutate({ id: row.id, action: "close" })}
                          disabled={actionMut.isPending}
                        />
                      )}
                      <ActionBtn label="Edit" onClick={() => setEditing(row)} />
                      <ActionBtn
                        label="Delete"
                        danger
                        onClick={() => {
                          if (window.confirm("Delete this ticket?")) deleteMut.mutate(row.id);
                        }}
                        disabled={deleteMut.isPending}
                      />
                    </div>
                  </td>
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

function TicketForm({
  options,
  ticket,
  onClose,
  onSaved,
}: {
  options: ItOptions;
  ticket?: ItTicket;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    subject: ticket?.subject || "",
    category: ticket?.category || "",
    description: ticket?.description || "",
    assigned_to_id: ticket?.assigned_to_id || "",
  });

  const create = useMutation({
    mutationFn: () =>
      ticket
        ? itApi.updateTicket(ticket.id, {
            subject: form.subject,
            category: form.category,
            description: form.description,
            assigned_to_id: form.assigned_to_id || null,
          })
        : itApi.createTicket({
            subject: form.subject,
            category: form.category,
            description: form.description,
            assigned_to_id: form.assigned_to_id || undefined,
          }),
    onSuccess: () => onSaved(ticket ? "Ticket updated." : "Ticket created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={ticket ? "Edit ticket" : "New ticket"} onClose={onClose}>
      <Field label="Subject *">
        <input
          className={inputCls}
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
      </Field>
      <Field label="Category">
        <input
          className={inputCls}
          list="it-categories"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="e.g. Hardware, Access, Software"
        />
        <datalist id="it-categories">
          {options.categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-24 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Assignee (optional)">
        <select
          className={inputCls}
          value={form.assigned_to_id}
          onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}
        >
          <option value="">Unassigned</option>
          {options.assignable_users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.subject.trim()}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

function AssignModal({
  ticket,
  options,
  pending,
  onClose,
  onAssign,
}: {
  ticket: ItTicket;
  options: ItOptions;
  pending: boolean;
  onClose: () => void;
  onAssign: (assigned_to_id: string) => void;
}) {
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to_id || "");
  return (
    <Modal title={`Assign: ${ticket.subject}`} onClose={onClose}>
      <Field label="Assignee *">
        <select className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Select user</option>
          {options.assignable_users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!assignedTo}
        onClose={onClose}
        onSave={() => onAssign(assignedTo)}
        saveLabel="Assign"
      />
    </Modal>
  );
}

/* ── Access & Sessions ────────────────────────────────────────────────────── */

function AccessSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["it", "sessions", search, page],
    queryFn: () => itApi.sessions({ search, page, page_size: 20 }),
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
      placeholder="Search user, device, IP…"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" />
        Active and historical login sessions for org members (read-only).
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Device</th>
                <th className="px-4 py-3 font-semibold">IP</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 font-semibold">{row.user_name || "—"}</td>
                  <td className="px-4 py-3 text-[12px]">{row.device_info || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.ip || "—"}</td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{fmtDateTime(row.expires_at)}</td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{fmtDateTime(row.created_at)}</td>
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

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load IT data from the database.
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
  saveLabel = "Save",
}: {
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
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
        {pending ? "Saving…" : saveLabel}
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
