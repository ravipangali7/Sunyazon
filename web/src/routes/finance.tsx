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
  financeApi,
  type FinAccount,
  type FinCashBank,
  type FinCheque,
  type FinCreditNote,
  type FinDebitNote,
  type FinIncomeExpense,
  type FinPayment,
  type FinPnL,
  type FinPurchase,
  type FinReceipt,
  type FinSales,
  type FinTax,
  type FinVoucher,
  type FinVoucherLine,
} from "@/lib/finance-api";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finance & Accounts — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Chart of accounts, vouchers, cash & bank, day book, ledger, purchase/sales docs, P&L, tax and cheques.",
      },
    ],
  }),
  component: Finance,
});

type Section =
  | "overview"
  | "coa"
  | "vouchers"
  | "cashbank"
  | "daybook"
  | "ledger"
  | "purchase"
  | "sales-docs"
  | "payments"
  | "notes"
  | "income"
  | "pnl"
  | "tax"
  | "cheques";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = [
    "overview",
    "coa",
    "vouchers",
    "cashbank",
    "daybook",
    "ledger",
    "purchase",
    "sales-docs",
    "payments",
    "notes",
    "income",
    "pnl",
    "tax",
    "cheques",
  ];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Finance", subtitle: "finance.gl_entry · AP · VAT" },
  coa: { title: "Chart of Accounts", subtitle: "finance.chart_of_account" },
  vouchers: { title: "Journal Vouchers", subtitle: "finance.journal_voucher" },
  cashbank: { title: "Cash & Bank", subtitle: "finance.cash_bank_account" },
  daybook: { title: "Day Book", subtitle: "finance.day_book" },
  ledger: { title: "Ledger", subtitle: "finance.ledger" },
  purchase: { title: "Purchase Docs", subtitle: "finance.purchase · purchase_order" },
  "sales-docs": { title: "Sales Docs", subtitle: "finance.sales · sales_order" },
  payments: { title: "Payments / Receipts", subtitle: "finance.purchase_payment · sales_received" },
  notes: { title: "Debit / Credit Notes", subtitle: "finance.debit_note · credit_note" },
  income: { title: "Income & Expenses", subtitle: "finance.income_expense" },
  pnl: { title: "Profit & Loss", subtitle: "finance.profit_loss_snapshot" },
  tax: { title: "Tax & Audit", subtitle: "finance.tax_audit_record" },
  cheques: { title: "Issue Cheques", subtitle: "finance.issue_cheque" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function Finance() {
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
      {section === "coa" && <CoaSection onFlash={setFlash} />}
      {section === "vouchers" && <VouchersSection onFlash={setFlash} />}
      {section === "cashbank" && <CashBankSection onFlash={setFlash} />}
      {section === "daybook" && <DayBookSection />}
      {section === "ledger" && <LedgerSection />}
      {section === "purchase" && <PurchaseSection onFlash={setFlash} />}
      {section === "sales-docs" && <SalesSection onFlash={setFlash} />}
      {section === "payments" && <PaymentsSection onFlash={setFlash} />}
      {section === "notes" && <NotesSection onFlash={setFlash} />}
      {section === "income" && <IncomeSection onFlash={setFlash} />}
      {section === "pnl" && <PnlSection onFlash={setFlash} />}
      {section === "tax" && <TaxSection onFlash={setFlash} />}
      {section === "cheques" && <ChequesSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["finance", "overview"],
    queryFn: financeApi.overview,
    enabled: authed,
  });

  if (!authed) return <SignInHint />;

  const kpi = overview.data;
  const glEntries = kpi?.recent_gl ?? [];
  const bills = kpi?.recent_bills ?? [];
  const apPie = [
    { name: "Open", value: kpi?.ap_open_count ?? 0 },
    { name: "Overdue", value: kpi?.ap_overdue_count ?? 0 },
    { name: "Paid", value: kpi?.ap_paid_count ?? 0 },
  ];

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="AP Total" value={fmtNPR(kpi?.ap_total ?? 0)} sub={`${kpi?.ap_open_count ?? 0} open bills`} />
        <Mini label="Overdue AP" value={fmtNPR(kpi?.ap_overdue ?? 0)} sub="requires attention" />
        <Mini label="Debit Today" value={fmtNPR(kpi?.debit_today ?? 0)} sub="journal entries" />
        <Mini label="Credit Today" value={fmtNPR(kpi?.credit_today ?? 0)} sub="journal entries" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Cash" value={fmtNPR(kpi?.cash_balance ?? 0)} sub="cash accounts" />
        <Mini label="Bank" value={fmtNPR(kpi?.bank_balance ?? 0)} sub="bank accounts" />
        <Mini label="AR Outstanding" value={fmtNPR(kpi?.ar_total ?? 0)} sub="receivables" />
        <Mini
          label="Vouchers"
          value={`${kpi?.vouchers_draft ?? 0} / ${kpi?.vouchers_posted ?? 0}`}
          sub="draft / posted"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-1">Journal Entries</div>
          <div className="text-xs text-muted-foreground mb-3">finance.journal_line · recent</div>
          {glEntries.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6">No journal lines yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                    <Th>Voucher</Th>
                    <Th>Account</Th>
                    <Th>Narrative</Th>
                    <Th>Module</Th>
                    <Th>Debit</Th>
                    <Th>Credit</Th>
                  </tr>
                </thead>
                <tbody>
                  {glEntries.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-secondary/40">
                      <Td className="font-mono text-xs">{e.voucher_no}</Td>
                      <Td className="font-semibold">{e.account}</Td>
                      <Td>{e.narrative}</Td>
                      <Td>
                        <Tag>{e.module}</Tag>
                      </Td>
                      <Td className="tabular-nums text-right">{e.debit ? fmtNPR(e.debit) : "—"}</Td>
                      <Td
                        className="tabular-nums text-right"
                        style={{ color: e.credit ? "var(--color-danger)" : undefined }}
                      >
                        {e.credit ? fmtNPR(e.credit) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold mb-1">VAT Summary</div>
          <div className="text-xs text-muted-foreground mb-3">FY {kpi?.tax_year ?? "—"}</div>
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT Input</span>
              <span className="font-semibold tabular-nums">{fmtNPR(kpi?.vat_in ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT Output</span>
              <span className="font-semibold tabular-nums">{fmtNPR(kpi?.vat_out ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payable</span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--color-danger)" }}>
                {fmtNPR(kpi?.payable ?? 0)}
              </span>
            </div>
          </div>
          <div className="text-sm font-semibold mb-1">AP Status</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={apPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={3}>
                  {apPie.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? chartSeries[1] : i === 1 ? "var(--color-danger)" : "var(--color-success)"}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs text-center">
            {apPie.map((p) => (
              <div key={p.name}>
                <div className="font-semibold tabular-nums">{p.value}</div>
                <div className="text-muted-foreground">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 lg:p-5 border-b border-border">
          <div className="text-sm font-semibold">Accounts Payable</div>
          <div className="text-xs text-muted-foreground">finance.purchase</div>
        </div>
        {bills.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground">No purchase bills yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Bill No</Th>
                <Th>Vendor</Th>
                <Th>Amount</Th>
                <Th>Due Date</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{b.bill_no}</Td>
                  <Td className="font-semibold">{b.vendor}</Td>
                  <Td
                    className="tabular-nums font-semibold"
                    style={b.status === "overdue" ? { color: "var(--color-danger)" } : undefined}
                  >
                    {fmtNPR(b.amount)}
                  </Td>
                  <Td>{b.due_date}</Td>
                  <Td>
                    <StatusBadge status={b.status} />
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

/* ── Chart of Accounts ────────────────────────────────────────────────────── */

function CoaSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [headType, setHeadType] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinAccount | null>(null);

  const q = useQuery({
    queryKey: ["finance", "coa", search, headType, page],
    queryFn: () =>
      financeApi.coa({
        search: search || undefined,
        head_type: headType || undefined,
        page,
        page_size: 30,
      }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? financeApi.updateCoa(editing.id, payload) : financeApi.createCoa(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Account updated." : "Account created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => financeApi.deleteCoa(id),
    onSuccess: () => {
      onFlash("Account removed / deactivated.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
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
        placeholder="Search code or name…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Account"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={headType}
            onChange={(e) => {
              setHeadType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All heads</option>
            {["asset", "liability", "equity", "revenue", "cogs", "expense"].map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        }
      />
      {(showForm || editing) && (
        <CoaForm
          initial={editing}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(p) => save.mutate(p)}
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
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Head</Th>
                <Th>Parent</Th>
                <Th>Active</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{a.code}</Td>
                  <Td className="font-semibold">{a.name}</Td>
                  <Td>
                    <Tag>{a.head_type}</Tag>
                  </Td>
                  <Td className="text-muted-foreground">{a.parent_code || "—"}</Td>
                  <Td>{a.is_active ? "Yes" : "No"}</Td>
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
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function CoaForm({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: FinAccount | null;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [headType, setHeadType] = useState(initial?.head_type || "asset");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  return (
    <Modal title={initial ? "Edit account" : "New account"} onClose={onClose}>
      <Field label="Code">
        <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Head type">
        <select className={inputCls} value={headType} onChange={(e) => setHeadType(e.target.value)}>
          {["asset", "liability", "equity", "revenue", "cogs", "expense"].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 mb-3 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <ModalActions
        pending={pending}
        disabled={!code.trim() || !name.trim()}
        onClose={onClose}
        onSave={() => onSave({ code, name, head_type: headType, is_active: isActive })}
      />
    </Modal>
  );
}

/* ── Vouchers ─────────────────────────────────────────────────────────────── */

function VouchersSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });

  const q = useQuery({
    queryKey: ["finance", "vouchers", search, status, page],
    queryFn: () =>
      financeApi.vouchers({
        search: search || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => financeApi.createVoucher(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Voucher created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "post" | "reverse" }) =>
      financeApi.voucherAction(id, act),
    onSuccess: (_d, v) => {
      onFlash(v.act === "post" ? "Voucher posted." : "Voucher reversed.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => financeApi.deleteVoucher(id),
    onSuccess: () => {
      onFlash("Draft voucher deleted.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
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
        placeholder="Search voucher no…"
        onNew={() => setShowForm(true)}
        newLabel="New Voucher"
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
            <option value="draft">Draft</option>
            <option value="verified">Verified</option>
            <option value="posted">Posted</option>
          </select>
        }
      />
      {showForm && (
        <VoucherForm
          accounts={options.data?.accounts || []}
          parties={options.data?.parties || []}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
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
                <Th>Voucher</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                <Th>Debit</Th>
                <Th>Credit</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((v: FinVoucher) => (
                <tr key={v.id} className="border-t border-border hover:bg-secondary/40">
                  <Td className="font-mono text-xs">{v.voucher_no}</Td>
                  <Td>
                    <Tag>{v.voucher_type}</Tag>
                  </Td>
                  <Td>{v.date}</Td>
                  <Td className="tabular-nums">{fmtNPR(v.total_debit)}</Td>
                  <Td className="tabular-nums">{fmtNPR(v.total_credit)}</Td>
                  <Td>
                    <StatusBadge status={v.status} />
                  </Td>
                  <Td>
                    <div className="flex gap-2 flex-wrap">
                      {v.status !== "posted" && (
                        <ActionBtn
                          label="Post"
                          onClick={() => action.mutate({ id: v.id, act: "post" })}
                          disabled={action.isPending}
                        />
                      )}
                      {v.status === "posted" && (
                        <ActionBtn
                          label="Reverse"
                          onClick={() => action.mutate({ id: v.id, act: "reverse" })}
                          disabled={action.isPending}
                        />
                      )}
                      {v.status === "draft" && (
                        <ActionBtn label="Delete" danger onClick={() => del.mutate(v.id)} />
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

function VoucherForm({
  accounts,
  parties,
  pending,
  onClose,
  onSave,
}: {
  accounts: { id: string; code: string; name: string }[];
  parties: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [voucherNo, setVoucherNo] = useState(`JV-${Date.now().toString().slice(-6)}`);
  const [voucherType, setVoucherType] = useState("journal");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<FinVoucherLine[]>([
    { account_id: "", debit: 0, credit: 0, reference: "" },
    { account_id: "", debit: 0, credit: 0, reference: "" },
  ]);

  const totals = useMemo(
    () => ({
      debit: lines.reduce((s, l) => s + Number(l.debit || 0), 0),
      credit: lines.reduce((s, l) => s + Number(l.credit || 0), 0),
    }),
    [lines],
  );

  const updateLine = (idx: number, patch: Partial<FinVoucherLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  return (
    <Modal title="New journal voucher" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voucher no">
          <input className={inputCls} value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
            {["journal", "payment", "receipt", "contra"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Date">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Narration">
        <textarea className={inputCls + " h-16"} value={narration} onChange={(e) => setNarration(e.target.value)} />
      </Field>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
        Lines · Dr {fmtNPR(totals.debit)} / Cr {fmtNPR(totals.credit)}
        {totals.debit !== totals.credit && (
          <span style={{ color: "var(--color-danger)" }}> · unbalanced</span>
        )}
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
          <select
            className={inputCls + " col-span-5"}
            value={line.account_id || ""}
            onChange={(e) => updateLine(idx, { account_id: e.target.value })}
          >
            <option value="">Account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <input
            className={inputCls + " col-span-2"}
            type="number"
            placeholder="Debit"
            value={line.debit || ""}
            onChange={(e) => updateLine(idx, { debit: Number(e.target.value) || 0, credit: 0 })}
          />
          <input
            className={inputCls + " col-span-2"}
            type="number"
            placeholder="Credit"
            value={line.credit || ""}
            onChange={(e) => updateLine(idx, { credit: Number(e.target.value) || 0, debit: 0 })}
          />
          <select
            className={inputCls + " col-span-3"}
            value={line.party_id || ""}
            onChange={(e) => updateLine(idx, { party_id: e.target.value || null })}
          >
            <option value="">Party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-semibold text-primary mb-3"
        onClick={() => setLines((p) => [...p, { account_id: "", debit: 0, credit: 0 }])}
      >
        + Add line
      </button>
      <ModalActions
        pending={pending}
        disabled={
          !voucherNo.trim() ||
          lines.every((l) => !l.account_id) ||
          totals.debit !== totals.credit ||
          totals.debit === 0
        }
        onClose={onClose}
        onSave={() =>
          onSave({
            voucher_no: voucherNo,
            voucher_type: voucherType,
            date,
            narration,
            lines: lines.filter((l) => l.account_id),
          })
        }
      />
    </Modal>
  );
}

/* ── Cash & Bank ──────────────────────────────────────────────────────────── */

function CashBankSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinCashBank | null>(null);

  const q = useQuery({
    queryKey: ["finance", "cash-banks", search, page],
    queryFn: () => financeApi.cashBanks({ search: search || undefined, page, page_size: 20 }),
    enabled: authed,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? financeApi.updateCashBank(editing.id, payload) : financeApi.createCashBank(payload),
    onSuccess: () => {
      setShowForm(false);
      setEditing(null);
      onFlash(editing ? "Account updated." : "Account created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => financeApi.deleteCashBank(id),
    onSuccess: () => {
      onFlash("Account deleted.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const rows = q.data?.results || [];
  const cashTotal = rows.filter((r) => r.account_type === "cash").reduce((s, r) => s + r.current_balance, 0);
  const bankTotal = rows.filter((r) => r.account_type === "bank").reduce((s, r) => s + r.current_balance, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Mini label="Cash total" value={fmtNPR(cashTotal)} />
        <Mini label="Bank total" value={fmtNPR(bankTotal)} />
      </div>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search accounts…"
        onNew={() => {
          setEditing(null);
          setShowForm(true);
        }}
        newLabel="New Account"
      />
      {(showForm || editing) && (
        <CashBankForm
          initial={editing}
          pending={save.isPending}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(p) => save.mutate(p)}
        />
      )}
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!rows.length}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((a) => (
            <div key={a.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <Tag>{a.account_type}</Tag>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-display tabular-nums">{fmtNPR(a.current_balance)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Opening {fmtNPR(a.opening_balance)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <ActionBtn
                  label="Edit"
                  onClick={() => {
                    setEditing(a);
                    setShowForm(true);
                  }}
                />
                <ActionBtn label="Delete" danger onClick={() => del.mutate(a.id)} />
              </div>
            </div>
          ))}
        </div>
        <Pager page={page} totalPages={q.data?.total_pages ?? 1} onPage={setPage} count={q.data?.count ?? 0} />
      </QueryState>
    </>
  );
}

function CashBankForm({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: FinCashBank | null;
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [accountType, setAccountType] = useState(initial?.account_type || "cash");
  const [opening, setOpening] = useState(String(initial?.opening_balance ?? 0));
  const [current, setCurrent] = useState(String(initial?.current_balance ?? initial?.opening_balance ?? 0));
  return (
    <Modal title={initial ? "Edit cash/bank" : "New cash/bank"} onClose={onClose}>
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
        </select>
      </Field>
      <Field label="Opening balance">
        <input className={inputCls} type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </Field>
      <Field label="Current balance">
        <input className={inputCls} type="number" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <ModalActions
        pending={pending}
        disabled={!name.trim()}
        onClose={onClose}
        onSave={() =>
          onSave({
            name,
            account_type: accountType,
            opening_balance: Number(opening) || 0,
            current_balance: Number(current) || 0,
          })
        }
      />
    </Modal>
  );
}

/* ── Day Book & Ledger ────────────────────────────────────────────────────── */

function DayBookSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["finance", "daybook", search, date, page],
    queryFn: () =>
      financeApi.dayBook({
        search: search || undefined,
        date: date || undefined,
        page,
        page_size: 50,
      }),
    enabled: authed,
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
        placeholder="Search narration / account…"
        filters={
          <input
            type="date"
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Mini label="Total debit" value={fmtNPR(q.data?.totals?.debit ?? 0)} />
        <Mini label="Total credit" value={fmtNPR(q.data?.totals?.credit ?? 0)} />
      </div>
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
                <Th>Date</Th>
                <Th>Account</Th>
                <Th>Narration</Th>
                <Th>Voucher</Th>
                <Th>Debit</Th>
                <Th>Credit</Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/40">
                  <Td>{e.date}</Td>
                  <Td className="font-semibold">
                    <span className="font-mono text-xs text-muted-foreground mr-1">{e.account_code}</span>
                    {e.account_name}
                  </Td>
                  <Td>{e.narration || "—"}</Td>
                  <Td className="font-mono text-xs">{e.voucher_no || "—"}</Td>
                  <Td className="tabular-nums text-right">{e.debit ? fmtNPR(e.debit) : "—"}</Td>
                  <Td className="tabular-nums text-right">{e.credit ? fmtNPR(e.credit) : "—"}</Td>
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

function LedgerSection() {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });
  const [accountId, setAccountId] = useState("");

  const q = useQuery({
    queryKey: ["finance", "ledger", search, accountId, page],
    queryFn: () =>
      financeApi.ledger({
        search: search || undefined,
        account_id: accountId || undefined,
        page,
        page_size: 50,
      }),
    enabled: authed,
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
        placeholder="Search party / reference…"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border max-w-[220px]"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All accounts</option>
            {(options.data?.accounts || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        }
      />
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
                <Th>Date</Th>
                <Th>Account</Th>
                <Th>Party</Th>
                <Th>Debit</Th>
                <Th>Credit</Th>
                <Th>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/40">
                  <Td>{e.date}</Td>
                  <Td className="font-semibold">{e.account_name}</Td>
                  <Td>{e.party_name || "—"}</Td>
                  <Td className="tabular-nums text-right">{e.debit ? fmtNPR(e.debit) : "—"}</Td>
                  <Td className="tabular-nums text-right">{e.credit ? fmtNPR(e.credit) : "—"}</Td>
                  <Td className="tabular-nums font-semibold text-right">{fmtNPR(e.balance)}</Td>
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

/* ── Purchase / Sales ─────────────────────────────────────────────────────── */

function PurchaseSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"purchases" | "pos">("purchases");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });

  const purchases = useQuery({
    queryKey: ["finance", "purchases", search, page],
    queryFn: () => financeApi.purchases({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "purchases",
  });

  const pos = useQuery({
    queryKey: ["finance", "pos", search, page],
    queryFn: () => financeApi.purchaseOrders({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "pos",
  });

  const createPurchase = useMutation({
    mutationFn: (payload: Record<string, unknown>) => financeApi.createPurchase(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Purchase created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === "purchases"} onClick={() => { setTab("purchases"); setPage(1); }} label="Purchases" />
        <TabBtn active={tab === "pos"} onClick={() => { setTab("pos"); setPage(1); }} label="Purchase Orders" />
      </div>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search docs…"
        onNew={tab === "purchases" ? () => setShowForm(true) : undefined}
        newLabel="New Purchase"
      />
      {showForm && tab === "purchases" && (
        <SimpleDocForm
          title="New purchase"
          fields={[
            { key: "purchase_no", label: "Purchase no", default: `PUR-${Date.now().toString().slice(-6)}` },
            {
              key: "supplier_id",
              label: "Supplier",
              type: "select",
              options: (options.data?.vendors || []).map((v) => ({ value: v.id, label: v.name })),
            },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
            { key: "subtotal", label: "Subtotal", type: "number" },
            { key: "tax", label: "Tax (VAT)", type: "number" },
            { key: "total", label: "Total", type: "number" },
          ]}
          pending={createPurchase.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createPurchase.mutate(p)}
        />
      )}
      {tab === "purchases" ? (
        <QueryState
          isLoading={purchases.isLoading}
          isError={purchases.isError}
          error={purchases.error as Error}
          empty={!purchases.data?.results.length}
        >
          <DataTable
            headers={["No", "Supplier", "Date", "Total", "Payment", "Status"]}
            rows={(purchases.data?.results || []).map((p: FinPurchase) => [
              p.purchase_no,
              p.supplier_name,
              p.date,
              fmtNPR(p.total),
              p.payment_status,
              p.status,
            ])}
          />
          <Pager
            page={page}
            totalPages={purchases.data?.total_pages ?? 1}
            onPage={setPage}
            count={purchases.data?.count ?? 0}
          />
        </QueryState>
      ) : (
        <QueryState
          isLoading={pos.isLoading}
          isError={pos.isError}
          error={pos.error as Error}
          empty={!pos.data?.results.length}
        >
          <DataTable
            headers={["PO No", "Supplier", "Date", "Delivery", "Total", "Status"]}
            rows={(pos.data?.results || []).map((p) => [
              p.po_no,
              p.supplier_name,
              p.date,
              p.delivery_date || "—",
              fmtNPR(p.total),
              p.status,
            ])}
          />
          <Pager page={page} totalPages={pos.data?.total_pages ?? 1} onPage={setPage} count={pos.data?.count ?? 0} />
        </QueryState>
      )}
    </>
  );
}

function SalesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"sales" | "sos">("sales");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });

  const sales = useQuery({
    queryKey: ["finance", "sales", search, page],
    queryFn: () => financeApi.sales({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "sales",
  });

  const sos = useQuery({
    queryKey: ["finance", "sos", search, page],
    queryFn: () => financeApi.salesOrders({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "sos",
  });

  const createSales = useMutation({
    mutationFn: (payload: Record<string, unknown>) => financeApi.createSales(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Sales invoice created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === "sales"} onClick={() => { setTab("sales"); setPage(1); }} label="Sales Invoices" />
        <TabBtn active={tab === "sos"} onClick={() => { setTab("sos"); setPage(1); }} label="Sales Orders" />
      </div>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search sales…"
        onNew={tab === "sales" ? () => setShowForm(true) : undefined}
        newLabel="New Sales"
      />
      {showForm && tab === "sales" && (
        <SimpleDocForm
          title="New sales invoice"
          fields={[
            { key: "sales_no", label: "Sales no", default: `SAL-${Date.now().toString().slice(-6)}` },
            {
              key: "party_id",
              label: "Party",
              type: "select",
              options: (options.data?.parties || []).map((p) => ({ value: p.id, label: p.name })),
            },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
            { key: "subtotal", label: "Subtotal", type: "number" },
            { key: "discount", label: "Discount", type: "number" },
            { key: "tax", label: "Tax (VAT)", type: "number" },
            { key: "total", label: "Total", type: "number" },
          ]}
          pending={createSales.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createSales.mutate(p)}
        />
      )}
      {tab === "sales" ? (
        <QueryState
          isLoading={sales.isLoading}
          isError={sales.isError}
          error={sales.error as Error}
          empty={!sales.data?.results.length}
        >
          <DataTable
            headers={["No", "Party", "Date", "Total", "Received", "Balance", "Status"]}
            rows={(sales.data?.results || []).map((s: FinSales) => [
              s.sales_no,
              s.party_name,
              s.date,
              fmtNPR(s.total),
              fmtNPR(s.received_amount),
              fmtNPR(s.balance),
              s.status,
            ])}
          />
          <Pager page={page} totalPages={sales.data?.total_pages ?? 1} onPage={setPage} count={sales.data?.count ?? 0} />
        </QueryState>
      ) : (
        <QueryState
          isLoading={sos.isLoading}
          isError={sos.isError}
          error={sos.error as Error}
          empty={!sos.data?.results.length}
        >
          <DataTable
            headers={["SO No", "Party", "Date", "Total", "Status"]}
            rows={(sos.data?.results || []).map((s) => [s.so_no, s.party_name, s.date, fmtNPR(s.total), s.status])}
          />
          <Pager page={page} totalPages={sos.data?.total_pages ?? 1} onPage={setPage} count={sos.data?.count ?? 0} />
        </QueryState>
      )}
    </>
  );
}

/* ── Payments / Receipts ──────────────────────────────────────────────────── */

function PaymentsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"payments" | "receipts">("payments");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });

  const payments = useQuery({
    queryKey: ["finance", "payments", search, page],
    queryFn: () => financeApi.payments({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "payments",
  });

  const receipts = useQuery({
    queryKey: ["finance", "receipts", search, page],
    queryFn: () => financeApi.receipts({ search: search || undefined, page, page_size: 20 }),
    enabled: authed && tab === "receipts",
  });

  const createPay = useMutation({
    mutationFn: (payload: Record<string, unknown>) => financeApi.createPayment(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Payment recorded.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const createRec = useMutation({
    mutationFn: (payload: Record<string, unknown>) => financeApi.createReceipt(payload),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Receipt recorded.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === "payments"} onClick={() => { setTab("payments"); setPage(1); }} label="AP Payments" />
        <TabBtn active={tab === "receipts"} onClick={() => { setTab("receipts"); setPage(1); }} label="AR Receipts" />
      </div>
      <SectionToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search…"
        onNew={() => setShowForm(true)}
        newLabel={tab === "payments" ? "Record Payment" : "Record Receipt"}
      />
      {showForm && tab === "payments" && (
        <SimpleDocForm
          title="Record purchase payment"
          fields={[
            {
              key: "purchase_id",
              label: "Purchase",
              type: "select",
              options: (options.data?.purchases || []).map((p) => ({
                value: p.id,
                label: `${p.purchase_no} — ${p.supplier_name} (${fmtNPR(p.total)})`,
              })),
            },
            { key: "amount", label: "Amount", type: "number" },
            {
              key: "payment_mode",
              label: "Mode",
              type: "select",
              options: ["cash", "bank", "cheque", "gateway"].map((m) => ({ value: m, label: m })),
              default: "cash",
            },
            {
              key: "bank_account_id",
              label: "Bank account",
              type: "select",
              options: (options.data?.cash_banks || []).map((b) => ({ value: b.id, label: b.name })),
            },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
            { key: "reference", label: "Reference" },
          ]}
          pending={createPay.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createPay.mutate(p)}
        />
      )}
      {showForm && tab === "receipts" && (
        <SimpleDocForm
          title="Record sales receipt"
          fields={[
            {
              key: "sales_id",
              label: "Sales",
              type: "select",
              options: (options.data?.sales || []).map((s) => ({
                value: s.id,
                label: `${s.sales_no} — ${s.party_name} (${fmtNPR(s.total)})`,
              })),
            },
            { key: "amount", label: "Amount", type: "number" },
            {
              key: "payment_mode",
              label: "Mode",
              type: "select",
              options: ["cash", "bank", "cheque", "gateway"].map((m) => ({ value: m, label: m })),
              default: "cash",
            },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
            { key: "reference", label: "Reference" },
          ]}
          pending={createRec.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createRec.mutate(p)}
        />
      )}
      {tab === "payments" ? (
        <QueryState
          isLoading={payments.isLoading}
          isError={payments.isError}
          error={payments.error as Error}
          empty={!payments.data?.results.length}
        >
          <DataTable
            headers={["Purchase", "Supplier", "Amount", "Mode", "Date", "Ref"]}
            rows={(payments.data?.results || []).map((p: FinPayment) => [
              p.purchase_no,
              p.supplier_name,
              fmtNPR(p.amount),
              p.payment_mode,
              p.date,
              p.reference || "—",
            ])}
          />
          <Pager
            page={page}
            totalPages={payments.data?.total_pages ?? 1}
            onPage={setPage}
            count={payments.data?.count ?? 0}
          />
        </QueryState>
      ) : (
        <QueryState
          isLoading={receipts.isLoading}
          isError={receipts.isError}
          error={receipts.error as Error}
          empty={!receipts.data?.results.length}
        >
          <DataTable
            headers={["Sales", "Party", "Amount", "Mode", "Date", "Ref"]}
            rows={(receipts.data?.results || []).map((r: FinReceipt) => [
              r.sales_no,
              r.party_name,
              fmtNPR(r.amount),
              r.payment_mode,
              r.date,
              r.reference || "—",
            ])}
          />
          <Pager
            page={page}
            totalPages={receipts.data?.total_pages ?? 1}
            onPage={setPage}
            count={receipts.data?.count ?? 0}
          />
        </QueryState>
      )}
    </>
  );
}

/* ── Notes ────────────────────────────────────────────────────────────────── */

function NotesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"debit" | "credit">("debit");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });

  const debit = useQuery({
    queryKey: ["finance", "debit-notes", page],
    queryFn: () => financeApi.debitNotes({ page, page_size: 20 }),
    enabled: authed && tab === "debit",
  });
  const credit = useQuery({
    queryKey: ["finance", "credit-notes", page],
    queryFn: () => financeApi.creditNotes({ page, page_size: 20 }),
    enabled: authed && tab === "credit",
  });

  const createDr = useMutation({
    mutationFn: (p: Record<string, unknown>) => financeApi.createDebitNote(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Debit note created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const createCr = useMutation({
    mutationFn: (p: Record<string, unknown>) => financeApi.createCreditNote(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Credit note created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const postDr = useMutation({
    mutationFn: (id: string) => financeApi.debitNoteAction(id, "post"),
    onSuccess: () => {
      onFlash("Debit note posted.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const postCr = useMutation({
    mutationFn: (id: string) => financeApi.creditNoteAction(id, "post"),
    onSuccess: () => {
      onFlash("Credit note posted.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <div className="flex gap-2 mb-4">
        <TabBtn active={tab === "debit"} onClick={() => { setTab("debit"); setPage(1); }} label="Debit Notes" />
        <TabBtn active={tab === "credit"} onClick={() => { setTab("credit"); setPage(1); }} label="Credit Notes" />
      </div>
      <SectionToolbar
        search=""
        onSearch={() => {}}
        placeholder=""
        onNew={() => setShowForm(true)}
        newLabel={tab === "debit" ? "New Debit Note" : "New Credit Note"}
        hideSearch
      />
      {showForm && tab === "debit" && (
        <SimpleDocForm
          title="New debit note"
          fields={[
            {
              key: "purchase_id",
              label: "Purchase",
              type: "select",
              options: (options.data?.purchases || []).map((p) => ({
                value: p.id,
                label: `${p.purchase_no} — ${p.supplier_name}`,
              })),
            },
            { key: "amount", label: "Amount", type: "number" },
            { key: "reason", label: "Reason" },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
          ]}
          pending={createDr.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createDr.mutate(p)}
        />
      )}
      {showForm && tab === "credit" && (
        <SimpleDocForm
          title="New credit note"
          fields={[
            {
              key: "sales_id",
              label: "Sales",
              type: "select",
              options: (options.data?.sales || []).map((s) => ({
                value: s.id,
                label: `${s.sales_no} — ${s.party_name}`,
              })),
            },
            { key: "amount", label: "Amount", type: "number" },
            { key: "reason", label: "Reason" },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
          ]}
          pending={createCr.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => createCr.mutate(p)}
        />
      )}
      {tab === "debit" ? (
        <QueryState isLoading={debit.isLoading} isError={debit.isError} error={debit.error as Error} empty={!debit.data?.results.length}>
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                  <Th>Purchase</Th><Th>Supplier</Th><Th>Amount</Th><Th>Date</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {(debit.data?.results || []).map((n: FinDebitNote) => (
                  <tr key={n.id} className="border-t border-border">
                    <Td className="font-mono text-xs">{n.purchase_no}</Td>
                    <Td>{n.supplier_name}</Td>
                    <Td className="tabular-nums">{fmtNPR(n.amount)}</Td>
                    <Td>{n.date}</Td>
                    <Td><StatusBadge status={n.status} /></Td>
                    <Td>
                      {n.status !== "posted" && (
                        <ActionBtn label="Post" onClick={() => postDr.mutate(n.id)} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={debit.data?.total_pages ?? 1} onPage={setPage} count={debit.data?.count ?? 0} />
        </QueryState>
      ) : (
        <QueryState isLoading={credit.isLoading} isError={credit.isError} error={credit.error as Error} empty={!credit.data?.results.length}>
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                  <Th>Sales</Th><Th>Party</Th><Th>Amount</Th><Th>Date</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {(credit.data?.results || []).map((n: FinCreditNote) => (
                  <tr key={n.id} className="border-t border-border">
                    <Td className="font-mono text-xs">{n.sales_no}</Td>
                    <Td>{n.party_name}</Td>
                    <Td className="tabular-nums">{fmtNPR(n.amount)}</Td>
                    <Td>{n.date}</Td>
                    <Td><StatusBadge status={n.status} /></Td>
                    <Td>
                      {n.status !== "posted" && (
                        <ActionBtn label="Post" onClick={() => postCr.mutate(n.id)} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={credit.data?.total_pages ?? 1} onPage={setPage} count={credit.data?.count ?? 0} />
        </QueryState>
      )}
    </>
  );
}

/* ── Income / P&L / Tax / Cheques ─────────────────────────────────────────── */

function IncomeSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const q = useQuery({
    queryKey: ["finance", "income", type, page],
    queryFn: () => financeApi.incomeExpenses({ type: type || undefined, page, page_size: 30 }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => financeApi.createIncomeExpense(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Entry saved.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => financeApi.deleteIncomeExpense(id),
    onSuccess: () => {
      onFlash("Entry deleted.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Mini label="Income" value={fmtNPR(q.data?.totals?.income ?? 0)} />
        <Mini label="Expense" value={fmtNPR(q.data?.totals?.expense ?? 0)} />
      </div>
      <SectionToolbar
        search=""
        onSearch={() => {}}
        hideSearch
        onNew={() => setShowForm(true)}
        newLabel="New Entry"
        filters={
          <select
            className="h-9 rounded-lg bg-secondary text-sm px-3 border border-border"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        }
      />
      {showForm && (
        <SimpleDocForm
          title="Income / expense entry"
          fields={[
            {
              key: "type",
              label: "Type",
              type: "select",
              options: [
                { value: "income", label: "Income" },
                { value: "expense", label: "Expense" },
              ],
              default: "expense",
            },
            { key: "category", label: "Category" },
            { key: "amount", label: "Amount", type: "number" },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
            { key: "description", label: "Description" },
          ]}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Type</Th><Th>Category</Th><Th>Amount</Th><Th>Date</Th><Th>Description</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((e: FinIncomeExpense) => (
                <tr key={e.id} className="border-t border-border">
                  <Td><Tag>{e.type}</Tag></Td>
                  <Td>{e.category || "—"}</Td>
                  <Td className="tabular-nums font-semibold">{fmtNPR(e.amount)}</Td>
                  <Td>{e.date}</Td>
                  <Td className="text-muted-foreground max-w-[240px] truncate">{e.description || "—"}</Td>
                  <Td>
                    <ActionBtn label="Delete" danger onClick={() => del.mutate(e.id)} />
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

function PnlSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const q = useQuery({
    queryKey: ["finance", "pnl"],
    queryFn: () => financeApi.pnl({ page_size: 20 }),
    enabled: authed,
  });
  const generate = useMutation({
    mutationFn: (p: { period_from: string; period_to: string }) => financeApi.generatePnl(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("P&L snapshot generated.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  const latest = q.data?.results?.[0] as FinPnL | undefined;

  return (
    <>
      {latest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="Revenue" value={fmtNPR(latest.revenue)} />
          <Mini label="COGS" value={fmtNPR(latest.cogs)} />
          <Mini label="Expenses" value={fmtNPR(latest.expenses)} />
          <Mini label="Net Profit" value={fmtNPR(latest.net_profit)} sub={`${latest.period_from} → ${latest.period_to}`} />
        </div>
      )}
      <SectionToolbar
        search=""
        onSearch={() => {}}
        hideSearch
        onNew={() => setShowForm(true)}
        newLabel="Generate P&L"
      />
      {showForm && (
        <SimpleDocForm
          title="Generate P&L snapshot"
          fields={[
            { key: "period_from", label: "From", type: "date", default: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10) },
            { key: "period_to", label: "To", type: "date", default: new Date().toISOString().slice(0, 10) },
          ]}
          pending={generate.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) =>
            generate.mutate({
              period_from: String(p.period_from),
              period_to: String(p.period_to),
            })
          }
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["From", "To", "Revenue", "COGS", "Expenses", "Net Profit", "Generated"]}
          rows={(q.data?.results || []).map((s: FinPnL) => [
            s.period_from,
            s.period_to,
            fmtNPR(s.revenue),
            fmtNPR(s.cogs),
            fmtNPR(s.expenses),
            fmtNPR(s.net_profit),
            s.generated_at?.slice(0, 16) || "—",
          ])}
        />
      </QueryState>
    </>
  );
}

function TaxSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const q = useQuery({
    queryKey: ["finance", "tax", page],
    queryFn: () => financeApi.tax({ page, page_size: 20 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => financeApi.createTax(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Tax record created.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, filing_status }: { id: string; filing_status: string }) =>
      financeApi.updateTax(id, { filing_status }),
    onSuccess: () => {
      onFlash("Filing status updated.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <>
      <SectionToolbar
        search=""
        onSearch={() => {}}
        hideSearch
        onNew={() => setShowForm(true)}
        newLabel="New Tax Record"
      />
      {showForm && (
        <SimpleDocForm
          title="Tax / audit record"
          fields={[
            {
              key: "tax_type",
              label: "Tax type",
              type: "select",
              options: [
                { value: "vat", label: "VAT" },
                { value: "tds", label: "TDS" },
                { value: "income", label: "Income" },
              ],
              default: "vat",
            },
            { key: "period", label: "Period", default: "FY 2026/27" },
            { key: "amount", label: "Amount", type: "number" },
          ]}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Type</Th><Th>Period</Th><Th>Amount</Th><Th>Status</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((t: FinTax) => (
                <tr key={t.id} className="border-t border-border">
                  <Td><Tag>{t.tax_type.toUpperCase()}</Tag></Td>
                  <Td>{t.period}</Td>
                  <Td className="tabular-nums">{fmtNPR(t.amount)}</Td>
                  <Td><StatusBadge status={t.filing_status} /></Td>
                  <Td>
                    {t.filing_status === "draft" && (
                      <ActionBtn label="Mark Filed" onClick={() => update.mutate({ id: t.id, filing_status: "filed" })} />
                    )}
                    {t.filing_status === "filed" && (
                      <ActionBtn label="Mark Audited" onClick={() => update.mutate({ id: t.id, filing_status: "audited" })} />
                    )}
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

function ChequesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const options = useQuery({
    queryKey: ["finance", "options"],
    queryFn: financeApi.options,
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["finance", "cheques", search, page],
    queryFn: () => financeApi.cheques({ search: search || undefined, page, page_size: 20 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => financeApi.createCheque(p),
    onSuccess: () => {
      setShowForm(false);
      onFlash("Cheque issued.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "clear" | "bounce" }) => financeApi.chequeAction(id, act),
    onSuccess: (_d, v) => {
      onFlash(v.act === "clear" ? "Cheque cleared." : "Cheque bounced.");
      void qc.invalidateQueries({ queryKey: ["finance"] });
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
        placeholder="Search cheque / payee…"
        onNew={() => setShowForm(true)}
        newLabel="Issue Cheque"
      />
      {showForm && (
        <SimpleDocForm
          title="Issue cheque"
          fields={[
            { key: "cheque_no", label: "Cheque no", default: `CHQ-${Date.now().toString().slice(-6)}` },
            {
              key: "bank_account_id",
              label: "Bank account",
              type: "select",
              options: (options.data?.cash_banks || [])
                .filter((b) => b.account_type === "bank")
                .map((b) => ({ value: b.id, label: b.name })),
            },
            { key: "payee", label: "Payee" },
            { key: "amount", label: "Amount", type: "number" },
            { key: "date", label: "Date", type: "date", default: new Date().toISOString().slice(0, 10) },
          ]}
          pending={create.isPending}
          onClose={() => setShowForm(false)}
          onSave={(p) => create.mutate(p)}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <Th>Cheque</Th><Th>Bank</Th><Th>Payee</Th><Th>Amount</Th><Th>Date</Th><Th>Status</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.results || []).map((c: FinCheque) => (
                <tr key={c.id} className="border-t border-border">
                  <Td className="font-mono text-xs">{c.cheque_no}</Td>
                  <Td>{c.bank_account_name}</Td>
                  <Td className="font-semibold">{c.payee}</Td>
                  <Td className="tabular-nums">{fmtNPR(c.amount)}</Td>
                  <Td>{c.date}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>
                    {c.status === "issued" && (
                      <div className="flex gap-2">
                        <ActionBtn label="Clear" onClick={() => action.mutate({ id: c.id, act: "clear" })} />
                        <ActionBtn label="Bounce" danger onClick={() => action.mutate({ id: c.id, act: "bounce" })} />
                      </div>
                    )}
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

/* ── Shared UI ────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load finance data from the database.
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
function Td({
  children,
  className = "",
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style}>
      {children}
    </td>
  );
}

function SectionToolbar({
  search,
  onSearch,
  placeholder,
  onNew,
  newLabel,
  filters,
  hideSearch,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  onNew?: () => void;
  newLabel?: string;
  filters?: React.ReactNode;
  hideSearch?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {!hideSearch && (
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full h-9 rounded-lg bg-secondary text-sm pl-9 pr-3 border border-border outline-none focus:border-primary"
            placeholder={placeholder || "Search…"}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
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
        style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
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

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-3 rounded-lg text-xs font-semibold border border-border"
      style={
        active
          ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number | null | undefined)[][] }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
            {headers.map((h) => (
              <Th key={h}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <Td key={j} className={j === 0 ? "font-mono text-xs" : undefined}>
                  {cell ?? "—"}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type FormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  default?: string;
  options?: { value: string; label: string }[];
};

function SimpleDocForm({
  title,
  fields,
  pending,
  onClose,
  onSave,
}: {
  title: string;
  fields: FormField[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.default ?? "";
    return init;
  });

  return (
    <Modal title={title} onClose={onClose}>
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.type === "select" ? (
            <select
              className={inputCls}
              value={values[f.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              <option value="">Select…</option>
              {(f.options || []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              type={f.type || "text"}
              value={values[f.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <ModalActions
        pending={pending}
        onClose={onClose}
        onSave={() => {
          const payload: Record<string, unknown> = {};
          for (const f of fields) {
            const raw = values[f.key];
            if (f.type === "number") payload[f.key] = Number(raw) || 0;
            else if (raw) payload[f.key] = raw;
          }
          onSave(payload);
        }}
      />
    </Modal>
  );
}
