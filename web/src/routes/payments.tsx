import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CreditCard, Plus, Search, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate, fmtDateTime, fmtNPR } from "@/lib/format";
import {
  paymentsApi,
  type PaymentCampaign,
  type PaymentsOptions,
  type PaymentTxn,
} from "@/lib/payments-api";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments & Ads — Sunyazon BEOS" },
      {
        name: "description",
        content: "Payment gateway settlements, refunds and ad campaign performance.",
      },
    ],
  }),
  component: PaymentsPage,
});

type Section = "overview" | "txns" | "ads";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "txns", "ads"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Payments & Ads", subtitle: "payment.txn · ads.campaign" },
  txns: { title: "Transactions", subtitle: "payment.transaction" },
  ads: { title: "Ad Campaigns", subtitle: "ads.campaign" },
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

function PaymentsPage() {
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
      {section === "txns" && <TxnsSection onFlash={setFlash} />}
      {section === "ads" && <AdsSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["payments", "overview"],
    queryFn: paymentsApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_status?.length ? kpi.by_status : [];

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Settled" value={fmtNPR(kpi?.settled_amount ?? 0)} sub="success" />
        <Mini label="Pending" value={fmtNPR(kpi?.pending_amount ?? 0)} sub="in flight" />
        <Mini label="Refunded" value={fmtNPR(kpi?.refunded_amount ?? 0)} sub="returned" />
        <Mini label="Txn count" value={kpi?.txn_count ?? 0} sub="all statuses" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <Mini label="Active campaigns" value={kpi?.active_campaigns ?? 0} sub="running" />
        <Mini label="Campaign budget" value={fmtNPR(kpi?.campaign_budget ?? 0)} sub="active plans" />
        <Mini label="Campaign spent" value={fmtNPR(kpi?.campaign_spent ?? 0)} sub="vs budget" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Txn status mix</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "success"
                            ? "var(--color-success)"
                            : s.code === "failed"
                              ? "var(--color-danger)"
                              : s.code === "pending"
                                ? "var(--color-warning)"
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

        <div className="rounded-2xl bg-card border border-border overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Recent transactions</div>
          </div>
          {(kpi?.recent_txns || []).length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">No recent transactions.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_txns || []).map((t) => (
                <div key={t.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground">{t.ref}</span>
                      {t.gateway_code ? <Tag>{t.gateway_code}</Tag> : null}
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{fmtDateTime(t.created_at)}</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">{fmtNPR(t.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

/* ── Transactions ─────────────────────────────────────────────────────────── */

function TxnsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["payments", "options"],
    queryFn: paymentsApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["payments", "transactions", search, status, page],
    queryFn: () => paymentsApi.transactions({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "mark_success" | "mark_failed" | "refund" }) =>
      paymentsApi.txnAction(id, act),
    onSuccess: (_d, vars) => {
      onFlash(
        vars.act === "mark_success"
          ? "Marked success."
          : vars.act === "mark_failed"
            ? "Marked failed."
            : "Refunded.",
      );
      void qc.invalidateQueries({ queryKey: ["payments"] });
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
      placeholder="Search external txn id or gateway…"
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
          {(options.data?.txn_statuses || [
            { value: "pending", label: "Pending" },
            { value: "success", label: "Success" },
            { value: "failed", label: "Failed" },
            { value: "refunded", label: "Refunded" },
          ]).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          columns={["Ref", "Gateway", "Amount", "Status", "Created", "Actions"]}
          footer={q.data ? <Pager meta={q.data} onPage={setPage} /> : null}
        >
          {(q.data?.results || []).map((t: PaymentTxn) => (
            <tr key={t.id} className="border-t border-border">
              <td className="px-3 py-2.5">
                <div className="text-[10px] font-mono text-muted-foreground">{t.ref}</div>
                {t.ad_campaign_title ? (
                  <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{t.ad_campaign_title}</div>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                {t.gateway_code ? <Tag>{t.gateway_code}</Tag> : "—"}
              </td>
              <td className="px-3 py-2.5 font-semibold tabular-nums">{fmtNPR(t.amount)}</td>
              <td className="px-3 py-2.5">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{fmtDateTime(t.created_at)}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {t.status === "pending" && (
                    <>
                      <ActionBtn
                        label="Mark Success"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: t.id, act: "mark_success" })}
                      />
                      <ActionBtn
                        label="Mark Failed"
                        danger
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: t.id, act: "mark_failed" })}
                      />
                    </>
                  )}
                  {t.status === "success" && (
                    <ActionBtn
                      label="Refund"
                      danger
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: t.id, act: "refund" })}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </QueryState>
    </SectionLayout>
  );
}

/* ── Ad Campaigns ─────────────────────────────────────────────────────────── */

function AdsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<PaymentCampaign | null>(null);
  const qc = useQueryClient();
  const options = useQuery({
    queryKey: ["payments", "options"],
    queryFn: paymentsApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["payments", "campaigns", search, status, page],
    queryFn: () => paymentsApi.campaigns({ search, status: status || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "activate" | "pause" | "complete" }) =>
      paymentsApi.campaignAction(id, act),
    onSuccess: (_d, vars) => {
      onFlash(
        vars.act === "activate"
          ? "Campaign activated."
          : vars.act === "pause"
            ? "Campaign paused."
            : "Campaign completed.",
      );
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => paymentsApi.deleteCampaign(id),
    onSuccess: () => {
      onFlash("Campaign deleted.");
      void qc.invalidateQueries({ queryKey: ["payments"] });
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
      placeholder="Search campaign title…"
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
          {(options.data?.campaign_statuses || [
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
          ]).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      }
    >
      {(showForm || editRow) && options.data && (
        <CampaignForm
          options={options.data}
          initial={editRow}
          onClose={() => {
            setShowForm(false);
            setEditRow(null);
          }}
          onSaved={(msg) => {
            setShowForm(false);
            setEditRow(null);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["payments"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          columns={["Campaign", "Plan", "Budget / Spent", "Status", "Window", "Actions"]}
          footer={q.data ? <Pager meta={q.data} onPage={setPage} /> : null}
        >
          {(q.data?.results || []).map((c: PaymentCampaign) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-3 py-2.5">
                <div className="text-sm font-semibold">{c.title}</div>
              </td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                {c.plan_name || c.plan_code || "—"}
              </td>
              <td className="px-3 py-2.5">
                <div className="text-sm font-semibold tabular-nums">{fmtNPR(c.budget)}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">spent {fmtNPR(c.spent)}</div>
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                {fmtDate(c.start_at)} → {fmtDate(c.end_at)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {(c.status === "draft" || c.status === "paused") && (
                    <ActionBtn
                      label="Activate"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: c.id, act: "activate" })}
                    />
                  )}
                  {c.status === "active" && (
                    <ActionBtn
                      label="Pause"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: c.id, act: "pause" })}
                    />
                  )}
                  {c.status !== "completed" && (
                    <ActionBtn
                      label="Complete"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: c.id, act: "complete" })}
                    />
                  )}
                  <ActionBtn label="Edit" onClick={() => setEditRow(c)} />
                  <ActionBtn
                    label="Delete"
                    danger
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete campaign "${c.title}"?`)) remove.mutate(c.id);
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </QueryState>
    </SectionLayout>
  );
}

function CampaignForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: PaymentsOptions;
  initial?: PaymentCampaign | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [planId, setPlanId] = useState(initial?.plan_id || options.ad_plans[0]?.id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [budget, setBudget] = useState(initial ? String(initial.budget) : "");
  const [startAt, setStartAt] = useState(toLocalInput(initial?.start_at));
  const [endAt, setEndAt] = useState(toLocalInput(initial?.end_at));

  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        plan_id: planId,
        title: title.trim(),
        budget: Number(budget),
        start_at: startAt ? new Date(startAt).toISOString() : "",
        end_at: endAt ? new Date(endAt).toISOString() : "",
      };
      if (initial) return paymentsApi.updateCampaign(initial.id, body);
      return paymentsApi.createCampaign(body);
    },
    onSuccess: () => onSaved(initial ? "Campaign updated." : "Campaign created."),
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <Modal title={initial ? "Edit campaign" : "New campaign"} onClose={onClose}>
      {formError && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {formError}
        </div>
      )}
      <Field label="Ad plan">
        <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Select plan…</option>
          {options.ad_plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({fmtNPR(p.price)} · {p.duration_days}d)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Budget (NPR)">
        <input
          className={inputCls}
          type="number"
          min={0}
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input
            className={inputCls}
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </Field>
        <Field label="End">
          <input
            className={inputCls}
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </Field>
      </div>
      <ModalActions
        pending={save.isPending}
        disabled={!planId || !title.trim() || !budget || !startAt || !endAt}
        onClose={onClose}
        onSave={() => {
          setFormError(null);
          save.mutate();
        }}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load payments data from the database.
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {sub}
        </div>
      )}
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
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  filters?: React.ReactNode;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
          />
        </div>
        {filters}
        {form}
      </div>
      {children}
    </div>
  );
}

function DataTable({
  columns,
  children,
  footer,
}: {
  columns: string[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              {columns.map((c) => (
                <th key={c} className="px-3 py-2.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

function Pager({
  meta,
  onPage,
}: {
  meta: { page: number; total_pages: number; count: number };
  onPage: (p: number) => void;
}) {
  return (
    <div className="p-3 text-[11px] text-muted-foreground border-t border-border flex items-center justify-between gap-2">
      <span>
        Page {meta.page} of {meta.total_pages} · {meta.count} records
      </span>
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
