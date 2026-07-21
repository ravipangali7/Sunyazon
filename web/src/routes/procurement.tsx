import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtNPR } from "@/lib/format";
import {
  procurementApi,
  type ProcGRN,
  type ProcPO,
  type ProcPR,
  type ProcRFQ,
  type ProcVendor,
} from "@/lib/procurement-api";

export const Route = createFileRoute("/procurement")({
  head: () => ({
    meta: [
      { title: "Procurement — Sunyazon BEOS" },
      {
        name: "description",
        content: "Vendors, requisitions, RFQs, purchase orders and GRN for Sunyazon supply chain.",
      },
    ],
  }),
  component: Procurement,
});

type Section = "overview" | "vendors" | "pr" | "rfq" | "po" | "grn";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "vendors", "pr", "rfq", "po", "grn"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Procurement", subtitle: "purchase.requisition → rfq → po → grn" },
  vendors: { title: "Vendors", subtitle: "purchase.vendor" },
  pr: { title: "Purchase Requisitions", subtitle: "purchase.purchase_requisition" },
  rfq: { title: "RFQ / Quotations", subtitle: "purchase.rfq" },
  po: { title: "Purchase Orders", subtitle: "finance.purchase_order" },
  grn: { title: "Goods Receipt", subtitle: "inventory.grn" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Procurement() {
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
      {section === "vendors" && <VendorsSection onFlash={setFlash} />}
      {section === "pr" && <PRSection onFlash={setFlash} />}
      {section === "rfq" && <RFQSection onFlash={setFlash} />}
      {section === "po" && <POSection onFlash={setFlash} />}
      {section === "grn" && <GRNSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["procurement", "overview"],
    queryFn: procurementApi.overview,
    enabled: authed,
  });

  const prAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      procurementApi.prAction(id, action),
    onSuccess: () => {
      onFlash("Requisition updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const poAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      procurementApi.poAction(id, action),
    onSuccess: () => {
      onFlash("Purchase order updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const grnAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      procurementApi.grnAction(id, action, action === "post" ? { qc_status: "pass" } : {}),
    onSuccess: () => {
      onFlash("GRN updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const kpi = overview.data;
  const prChart = kpi?.by_pr_status?.length ? kpi.by_pr_status : [];
  const poChart = kpi?.by_po_status?.length ? kpi.by_po_status : [];
  const busy = prAction.isPending || poAction.isPending || grnAction.isPending;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="PRs" value={kpi?.pr_count ?? 0} sub={`${kpi?.pr_pending ?? 0} pending`} />
        <Mini label="PO Value" value={fmtNPR(kpi?.po_value ?? 0)} sub={`${kpi?.po_count ?? 0} orders`} />
        <Mini label="GRNs Today" value={kpi?.grn_today ?? 0} sub={`${kpi?.grn_qc_pending ?? 0} QC pending`} />
        <Mini label="Open POs" value={kpi?.po_open ?? 0} sub="in pipeline" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Vendors" value={kpi?.vendor_count ?? 0} sub={`${kpi?.vendor_active ?? 0} active`} />
        <Mini label="RFQs" value={kpi?.rfq_count ?? 0} sub="quotations" />
        <Mini label="OTD" value={`${kpi?.otd_pct ?? 0}%`} sub="on-time delivery" />
        <Mini
          label="Cycle Days"
          value={kpi?.avg_cycle_days ?? 0}
          sub={`avg score ${kpi?.avg_vendor_score ?? 0}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">PR by status</div>
          {prChart.length === 0 ? (
            <div className="text-xs text-muted-foreground">No requisitions yet.</div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={prChart} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {prChart.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">PO by status</div>
          {poChart.length === 0 ? (
            <div className="text-xs text-muted-foreground">No purchase orders yet.</div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={poChart} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {poChart.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Top vendors (AVL)</div>
          {(kpi?.top_vendors || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No vendors yet.</div>
          ) : (
            <div className="space-y-2">
              {(kpi?.top_vendors || []).map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{v.vendor_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {v.category || "—"} · {v.po_count} POs
                    </div>
                  </div>
                  <Tag>
                    {v.grade} · {v.overall_score}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-1">Purchase Requisitions</div>
          <div className="text-xs text-muted-foreground mb-3">purchase.purchase_requisition</div>
          <div className="space-y-2">
            {(kpi?.recent_prs || []).length === 0 && (
              <div className="text-xs text-muted-foreground">No requisitions yet.</div>
            )}
            {(kpi?.recent_prs || []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl p-3 bg-secondary/60">
                <div
                  className="h-9 w-9 rounded-lg grid place-items-center text-sm font-semibold"
                  style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}
                >
                  {r.pr_no.split("-").pop()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.item}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.department || "—"} · {r.requested_by || "—"} · need by {r.need_by || "—"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.status === "draft" && (
                      <ActionBtn
                        label="Submit"
                        busy={busy}
                        onClick={() => prAction.mutate({ id: r.id, action: "submit" })}
                      />
                    )}
                    {(r.status === "submitted" || r.status === "draft") && (
                      <>
                        <ActionBtn
                          label="Approve"
                          busy={busy}
                          onClick={() => prAction.mutate({ id: r.id, action: "approve" })}
                        />
                        <ActionBtn
                          label="Reject"
                          tone="danger"
                          busy={busy}
                          onClick={() => prAction.mutate({ id: r.id, action: "reject" })}
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {r.qty} {r.uom}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-1">Purchase Orders</div>
          <div className="text-xs text-muted-foreground mb-3">finance.purchase_order</div>
          <div className="space-y-2">
            {(kpi?.recent_pos || []).length === 0 && (
              <div className="text-xs text-muted-foreground">No purchase orders yet.</div>
            )}
            {(kpi?.recent_pos || []).map((p) => (
              <div key={p.id} className="rounded-xl p-3 bg-secondary/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">{p.po_no}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-1 text-sm font-semibold">{p.item}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.vendor} · delivery {p.delivery_date || "—"}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {p.qty.toLocaleString()} {p.uom}
                  </span>
                  <span className="font-semibold tabular-nums">{fmtNPR(p.total)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.status === "draft" && (
                    <ActionBtn
                      label="Approve"
                      busy={busy}
                      onClick={() => poAction.mutate({ id: p.id, action: "approve" })}
                    />
                  )}
                  {(p.status === "approved") && (
                    <ActionBtn
                      label="Send"
                      busy={busy}
                      onClick={() => poAction.mutate({ id: p.id, action: "send" })}
                    />
                  )}
                  {p.status !== "closed" && p.status !== "cancelled" && (
                    <ActionBtn
                      label="Cancel"
                      tone="danger"
                      busy={busy}
                      onClick={() => poAction.mutate({ id: p.id, action: "cancel" })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 lg:p-5 border-b border-border">
          <div className="text-sm font-semibold">Goods Receipt Notes (GRN)</div>
          <div className="text-xs text-muted-foreground">inventory.grn</div>
        </div>
        {(kpi?.recent_grns || []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No GRNs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>GRN No</Th>
                <Th>PO No</Th>
                <Th>Vendor</Th>
                <Th>Item</Th>
                <Th>Qty</Th>
                <Th>Received</Th>
                <Th>QC</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(kpi?.recent_grns || []).map((g) => (
                <tr key={g.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{g.grn_no}</Td>
                  <Td className="font-mono text-xs">{g.po_no}</Td>
                  <Td className="font-semibold">{g.vendor}</Td>
                  <Td>{g.item}</Td>
                  <Td className="tabular-nums">
                    {g.qty.toLocaleString()} {g.uom}
                  </Td>
                  <Td>{g.received_date}</Td>
                  <Td>
                    <StatusBadge status={g.qc_status} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <ActionBtn
                        label="Receive"
                        busy={busy}
                        onClick={() => grnAction.mutate({ id: g.id, action: "receive" })}
                      />
                      <ActionBtn
                        label="Post"
                        busy={busy}
                        onClick={() => grnAction.mutate({ id: g.id, action: "post" })}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </QueryState>
  );
}

/* ── Vendors ──────────────────────────────────────────────────────────────── */

function VendorsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProcVendor | null>(null);

  const q = useQuery({
    queryKey: ["procurement", "vendors", search, status, page],
    queryFn: () =>
      procurementApi.vendors({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
        ordering: "-overall_score",
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? procurementApi.updateVendor(editing.id, payload) : procurementApi.createVendor(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Vendor updated." : "Vendor created.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => procurementApi.deleteVendor(id),
    onSuccess: () => {
      onFlash("Vendor deleted.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search vendors…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Vendor"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        }
      />

      {(showForm || editing) && (
        <VendorForm
          initial={editing}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Vendor</Th>
                <Th>Category</Th>
                <Th>Contact</Th>
                <Th>Score</Th>
                <Th>PAN/VAT</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((v) => (
                <tr key={v.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-semibold">{v.vendor_name}</Td>
                  <Td className="text-muted-foreground">{v.category || "—"}</Td>
                  <Td>{v.contact || "—"}</Td>
                  <Td>
                    <Tag>
                      {v.grade} · {v.overall_score}
                    </Tag>
                  </Td>
                  <Td className="font-mono text-xs">{v.pan_vat || "—"}</Td>
                  <Td>
                    <StatusBadge status={v.status} />
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(v);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(v.id)}
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
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function VendorForm({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: ProcVendor | null;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [vendorName, setVendorName] = useState(initial?.vendor_name || "");
  const [contact, setContact] = useState(initial?.contact || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [quality, setQuality] = useState(String(initial?.quality_rating ?? 80));
  const [delivery, setDelivery] = useState(String(initial?.delivery_rating ?? 80));
  const [panVat, setPanVat] = useState(initial?.pan_vat || "");
  const [status, setStatus] = useState(initial?.status || "active");

  return (
    <Modal title={initial ? "Edit vendor" : "New vendor"} onClose={onClose}>
      <Field label="Vendor name">
        <input className={inputCls} value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
      </Field>
      <Field label="Contact">
        <input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="Category">
        <input
          className={inputCls}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="raw_material, packaging…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quality rating">
          <input className={inputCls} type="number" min={0} max={100} value={quality} onChange={(e) => setQuality(e.target.value)} />
        </Field>
        <Field label="Delivery rating">
          <input className={inputCls} type="number" min={0} max={100} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </Field>
      </div>
      <Field label="PAN / VAT">
        <input className={inputCls} value={panVat} onChange={(e) => setPanVat(e.target.value)} />
      </Field>
      <Field label="Status">
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
      </Field>
      <ModalActions
        pending={pending}
        disabled={!vendorName.trim()}
        onClose={onClose}
        onSave={() =>
          onSave({
            vendor_name: vendorName.trim(),
            contact,
            category,
            quality_rating: Number(quality) || 0,
            delivery_rating: Number(delivery) || 0,
            pan_vat: panVat,
            status,
          })
        }
      />
    </Modal>
  );
}

/* ── Purchase Requisitions ────────────────────────────────────────────────── */

function PRSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["procurement", "options"],
    queryFn: procurementApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["procurement", "pr", search, status, page],
    queryFn: () =>
      procurementApi.requisitions({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => procurementApi.createPR(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Purchase requisition created.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => procurementApi.prAction(id, act),
    onSuccess: () => {
      onFlash("Requisition updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => procurementApi.deletePR(id),
    onSuccess: () => {
      onFlash("Requisition deleted.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search PR no or item…"
        onNew={() => setShowForm(true)}
        newLabel="New PR"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="closed">Closed</option>
          </select>
        }
      />

      {showForm && (
        <PRForm
          departments={options.data?.departments || []}
          items={options.data?.items || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(payload) => create.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>PR No</Th>
                <Th>Item</Th>
                <Th>Dept</Th>
                <Th>Qty</Th>
                <Th>Need by</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((r: ProcPR) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{r.pr_no}</Td>
                  <Td className="font-semibold">{r.item}</Td>
                  <Td className="text-muted-foreground">{r.department || "—"}</Td>
                  <Td className="tabular-nums">
                    {r.qty} {r.uom}
                  </Td>
                  <Td>{r.need_by || "—"}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.status === "draft" && (
                        <ActionBtn
                          label="Submit"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: r.id, act: "submit" })}
                        />
                      )}
                      {(r.status === "draft" || r.status === "submitted") && (
                        <>
                          <ActionBtn
                            label="Approve"
                            busy={action.isPending}
                            onClick={() => action.mutate({ id: r.id, act: "approve" })}
                          />
                          <ActionBtn
                            label="Reject"
                            tone="danger"
                            busy={action.isPending}
                            onClick={() => action.mutate({ id: r.id, act: "reject" })}
                          />
                        </>
                      )}
                      {r.status === "draft" && (
                        <ActionBtn label="Delete" tone="danger" busy={del.isPending} onClick={() => del.mutate(r.id)} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function PRForm({
  departments,
  items,
  pending,
  onClose,
  onSave,
}: {
  departments: { id: string; name: string }[];
  items: { id: string; code: string; name: string; uom: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [materialId, setMaterialId] = useState(items[0]?.id || "");
  const [qty, setQty] = useState("100");
  const [needBy, setNeedBy] = useState("");

  return (
    <Modal title="New purchase requisition" onClose={onClose}>
      <Field label="Department">
        <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Material">
        <select className={inputCls} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} — {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Qty">
          <input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Required date">
          <input className={inputCls} type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
        </Field>
      </div>
      <ModalActions
        pending={pending}
        disabled={!materialId || !qty}
        onClose={onClose}
        onSave={() =>
          onSave({
            department_id: departmentId || null,
            lines: [
              {
                material_id: materialId,
                qty: Number(qty),
                required_date: needBy || null,
              },
            ],
          })
        }
      />
    </Modal>
  );
}

/* ── RFQ ──────────────────────────────────────────────────────────────────── */

function RFQSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProcRFQ | null>(null);

  const options = useQuery({
    queryKey: ["procurement", "options"],
    queryFn: procurementApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["procurement", "rfq", search, page],
    queryFn: () =>
      procurementApi.rfqs({
        search: search || undefined,
        page,
        page_size: 20,
        ordering: "unit_price",
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? procurementApi.updateRFQ(editing.id, payload) : procurementApi.createRFQ(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "RFQ updated." : "RFQ created.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => procurementApi.deleteRFQ(id),
    onSuccess: () => {
      onFlash("RFQ deleted.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const compareGroups = useMemo(() => {
    const map = new Map<string, ProcRFQ[]>();
    for (const r of q.data?.results || []) {
      const key = r.rfq_no;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].filter(([, rows]) => rows.length >= 2);
  }, [q.data]);

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search RFQ, vendor, item…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New RFQ"
      />

      {(showForm || editing) && (
        <RFQForm
          initial={editing}
          vendors={options.data?.vendors || []}
          items={options.data?.items || []}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(payload) => save.mutate(payload)}
        />
      )}

      {compareGroups.length > 0 && (
        <div className="mb-4 rounded-2xl bg-card border border-border p-4">
          <div className="text-sm font-semibold mb-2">Comparative statement (≥2 quotes)</div>
          <div className="space-y-3">
            {compareGroups.slice(0, 3).map(([rfqNo, rows]) => (
              <div key={rfqNo}>
                <div className="text-[11px] font-mono text-muted-foreground mb-1">{rfqNo}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-xl bg-secondary/60 p-3 text-sm">
                      <div className="font-semibold">{r.vendor}</div>
                      <div className="text-[11px] text-muted-foreground">{r.item}</div>
                      <div className="mt-1 tabular-nums font-semibold">{fmtNPR(r.unit_price)} / unit</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.delivery_days}d · Q{r.quality_score}/D{r.delivery_score}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>RFQ No</Th>
                <Th>Vendor</Th>
                <Th>Item</Th>
                <Th>Qty</Th>
                <Th>Unit price</Th>
                <Th>Delivery</Th>
                <Th>Score</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{r.rfq_no}</Td>
                  <Td className="font-semibold">{r.vendor}</Td>
                  <Td>{r.item}</Td>
                  <Td className="tabular-nums">
                    {r.qty} {r.uom}
                  </Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(r.unit_price)}</Td>
                  <Td>{r.delivery_days}d</Td>
                  <Td>
                    <Tag>{r.overall_score}</Tag>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-primary"
                        onClick={() => {
                          setEditing(r);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => del.mutate(r.id)}
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
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function RFQForm({
  initial,
  vendors,
  items,
  pending,
  onClose,
  onSave,
}: {
  initial: ProcRFQ | null;
  vendors: { id: string; name: string }[];
  items: { id: string; code: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [rfqNo, setRfqNo] = useState(initial?.rfq_no || "");
  const [supplierId, setSupplierId] = useState(initial?.supplier_id || vendors[0]?.id || "");
  const [itemId, setItemId] = useState(initial?.item_id || items[0]?.id || "");
  const [qty, setQty] = useState(String(initial?.qty ?? 100));
  const [unitPrice, setUnitPrice] = useState(String(initial?.unit_price ?? 0));
  const [deliveryDays, setDeliveryDays] = useState(String(initial?.delivery_days ?? 7));
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms || "");
  const [remarks, setRemarks] = useState(initial?.remarks || "");

  return (
    <Modal title={initial ? "Edit RFQ" : "New RFQ"} onClose={onClose}>
      <Field label="RFQ no (optional)">
        <input className={inputCls} value={rfqNo} onChange={(e) => setRfqNo(e.target.value)} placeholder="Auto if blank" />
      </Field>
      <Field label="Supplier">
        <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Item">
        <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} — {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Qty">
          <input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Unit price">
          <input className={inputCls} type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </Field>
        <Field label="Delivery days">
          <input className={inputCls} type="number" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
        </Field>
      </div>
      <Field label="Payment terms">
        <input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
      </Field>
      <Field label="Remarks">
        <textarea className={inputCls + " h-20"} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <ModalActions
        pending={pending}
        disabled={!supplierId || !itemId}
        onClose={onClose}
        onSave={() =>
          onSave({
            rfq_no: rfqNo || undefined,
            supplier_id: supplierId,
            item_id: itemId,
            qty: Number(qty),
            unit_price: Number(unitPrice),
            delivery_days: Number(deliveryDays),
            payment_terms: paymentTerms,
            remarks,
          })
        }
      />
    </Modal>
  );
}

/* ── Purchase Orders ──────────────────────────────────────────────────────── */

function POSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["procurement", "options"],
    queryFn: procurementApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["procurement", "po", search, status, page],
    queryFn: () =>
      procurementApi.orders({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => procurementApi.createPO(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Purchase order created.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) => procurementApi.poAction(id, act),
    onSuccess: () => {
      onFlash("Purchase order updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => procurementApi.deletePO(id),
    onSuccess: () => {
      onFlash("Purchase order deleted.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search PO or vendor…"
        onNew={() => setShowForm(true)}
        newLabel="New PO"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      />

      {showForm && (
        <POForm
          vendors={options.data?.vendors || []}
          items={options.data?.items || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(payload) => create.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>PO No</Th>
                <Th>Vendor</Th>
                <Th>Item</Th>
                <Th>Total</Th>
                <Th>Delivery</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((p: ProcPO) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{p.po_no}</Td>
                  <Td className="font-semibold">{p.vendor}</Td>
                  <Td>{p.item}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(p.total)}</Td>
                  <Td>{p.delivery_date || "—"}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.status === "draft" && (
                        <ActionBtn
                          label="Approve"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: p.id, act: "approve" })}
                        />
                      )}
                      {p.status === "approved" && (
                        <ActionBtn
                          label="Send"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: p.id, act: "send" })}
                        />
                      )}
                      {p.status !== "closed" && p.status !== "cancelled" && (
                        <ActionBtn
                          label="Cancel"
                          tone="danger"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: p.id, act: "cancel" })}
                        />
                      )}
                      {(p.status === "draft" || p.status === "cancelled") && (
                        <ActionBtn label="Delete" tone="danger" busy={del.isPending} onClick={() => del.mutate(p.id)} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function POForm({
  vendors,
  items,
  pending,
  onClose,
  onSave,
}: {
  vendors: { id: string; name: string }[];
  items: { id: string; code: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [supplierId, setSupplierId] = useState(vendors[0]?.id || "");
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [qty, setQty] = useState("100");
  const [rate, setRate] = useState("0");
  const [deliveryDate, setDeliveryDate] = useState("");

  return (
    <Modal title="New purchase order" onClose={onClose}>
      <Field label="Supplier">
        <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Item">
        <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} — {i.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Qty">
          <input className={inputCls} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Rate">
          <input className={inputCls} type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Delivery">
          <input className={inputCls} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </Field>
      </div>
      <ModalActions
        pending={pending}
        disabled={!supplierId || !itemId}
        onClose={onClose}
        onSave={() => {
          const q = Number(qty);
          const r = Number(rate);
          onSave({
            supplier_id: supplierId,
            delivery_date: deliveryDate || null,
            lines: [{ item_id: itemId, qty: q, rate: r, amount: q * r }],
            total: q * r,
          });
        }}
      />
    </Modal>
  );
}

/* ── GRN ──────────────────────────────────────────────────────────────────── */

function GRNSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["procurement", "options"],
    queryFn: procurementApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["procurement", "grn", search, status, page],
    queryFn: () =>
      procurementApi.grns({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => procurementApi.createGRN(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("GRN created.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: string }) =>
      procurementApi.grnAction(id, act, act === "post" ? { qc_status: "pass" } : {}),
    onSuccess: () => {
      onFlash("GRN updated.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => procurementApi.deleteGRN(id),
    onSuccess: () => {
      onFlash("GRN deleted.");
      void qc.invalidateQueries({ queryKey: ["procurement"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search GRN, PO, vendor…"
        onNew={() => setShowForm(true)}
        newLabel="New GRN"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="received">Received</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      />

      {showForm && (
        <GRNForm
          openPos={options.data?.open_pos || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(payload) => create.mutate(payload)}
        />
      )}

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>GRN No</Th>
                <Th>PO No</Th>
                <Th>Vendor</Th>
                <Th>Item</Th>
                <Th>Qty</Th>
                <Th>QC</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((g: ProcGRN) => (
                <tr key={g.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{g.grn_no}</Td>
                  <Td className="font-mono text-xs">{g.po_no}</Td>
                  <Td className="font-semibold">{g.vendor}</Td>
                  <Td>{g.item}</Td>
                  <Td className="tabular-nums">
                    {g.qty.toLocaleString()} {g.uom}
                  </Td>
                  <Td>
                    <StatusBadge status={g.qc_status} />
                  </Td>
                  <Td>
                    <StatusBadge status={g.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {g.status === "draft" && (
                        <ActionBtn
                          label="Receive"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: g.id, act: "receive" })}
                        />
                      )}
                      {(g.status === "draft" || g.status === "received") && (
                        <ActionBtn
                          label="Post"
                          busy={action.isPending}
                          onClick={() => action.mutate({ id: g.id, act: "post" })}
                        />
                      )}
                      {g.status === "draft" && (
                        <ActionBtn label="Delete" tone="danger" busy={del.isPending} onClick={() => del.mutate(g.id)} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function GRNForm({
  openPos,
  pending,
  onClose,
  onSave,
}: {
  openPos: { id: string; po_no: string; vendor: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [poId, setPoId] = useState(openPos[0]?.id || "");

  return (
    <Modal title="New goods receipt" onClose={onClose}>
      <Field label="Purchase order">
        <select className={inputCls} value={poId} onChange={(e) => setPoId(e.target.value)}>
          {openPos.length === 0 && <option value="">No open POs</option>}
          {openPos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.po_no} — {p.vendor}
            </option>
          ))}
        </select>
      </Field>
      <div className="text-[11px] text-muted-foreground mb-3">
        Lines are copied from the PO when created.
      </div>
      <ModalActions
        pending={pending}
        disabled={!poId}
        onClose={onClose}
        onSave={() => onSave({ po_id: poId })}
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
      Sign in to load procurement data from the database.
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
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

function ActionBtn({
  label,
  onClick,
  busy,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  tone?: "primary" | "danger" | "muted";
}) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "muted"
        ? "var(--color-muted-foreground)"
        : "var(--color-primary)";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="text-[10px] font-semibold px-2 py-1 rounded-md hover:bg-secondary disabled:opacity-50"
      style={{ color }}
    >
      {label}
    </button>
  );
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
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full h-9 rounded-lg bg-secondary text-sm pl-9 pr-3 border border-border outline-none focus:border-primary"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
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
    return count ? (
      <div className="mt-3 text-[11px] text-muted-foreground">{count} record(s)</div>
    ) : null;
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
        style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
