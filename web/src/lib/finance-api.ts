/** Finance module API — COA, vouchers, cash/bank, daybook, ledger, docs, P&L, tax, cheques. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type FinanceOverview = {
  cash_balance: number;
  bank_balance: number;
  ap_total: number;
  ap_overdue: number;
  ap_overdue_count: number;
  ap_open_count: number;
  ap_paid_count: number;
  ar_total: number;
  debit_today: number;
  credit_today: number;
  vouchers_draft: number;
  vouchers_posted: number;
  vat_in: number;
  vat_out: number;
  payable: number;
  tax_year: string;
  recent_gl: {
    id: string;
    voucher_no: string;
    date: string;
    account: string;
    debit: number;
    credit: number;
    narrative: string;
    module: string;
  }[];
  recent_bills: {
    id: string;
    bill_no: string;
    vendor: string;
    amount: number;
    due_date: string;
    status: string;
  }[];
  income_mtd: number;
  expense_mtd: number;
  cheques_open: number;
};

export type FinAccount = {
  id: string;
  code: string;
  name: string;
  head_type: string;
  parent_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  is_active: boolean;
  children_count: number;
};

export type FinVoucherLine = {
  id?: string;
  account_id: string | null;
  account_code?: string;
  account_name?: string;
  debit: number;
  credit: number;
  party_id?: string | null;
  party_name?: string | null;
  reference?: string;
};

export type FinVoucher = {
  id: string;
  voucher_no: string;
  voucher_type: string;
  date: string | null;
  narration: string;
  total_debit: number;
  total_credit: number;
  status: string;
  created_by_id: string | null;
  created_by_name: string | null;
  line_count: number;
  lines: FinVoucherLine[];
};

export type FinCashBank = {
  id: string;
  name: string;
  account_type: string;
  opening_balance: number;
  current_balance: number;
};

export type FinDayBook = {
  id: string;
  date: string | null;
  account_id: string | null;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
  voucher_id: string | null;
  voucher_no: string | null;
};

export type FinLedger = {
  id: string;
  date: string | null;
  account_id: string | null;
  account_code: string;
  account_name: string;
  party_id: string | null;
  party_name: string | null;
  debit: number;
  credit: number;
  balance: number;
  reference: string;
};

export type FinPurchase = {
  id: string;
  purchase_no: string;
  supplier_id: string | null;
  supplier_name: string;
  date: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  payment_status: string;
  bill_status: string;
  paid_amount: number;
  due_date: string | null;
};

export type FinPO = {
  id: string;
  po_no: string;
  supplier_id: string | null;
  supplier_name: string;
  date: string | null;
  delivery_date: string | null;
  total: number;
  status: string;
  approved_by_id: string | null;
  line_count: number;
  lines: {
    id: string;
    item_id: string | null;
    item_code: string;
    item_name: string;
    qty: number;
    rate: number;
    amount: number;
  }[];
};

export type FinSales = {
  id: string;
  sales_no: string;
  party_id: string | null;
  party_name: string;
  date: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  received_amount: number;
  balance: number;
};

export type FinSO = {
  id: string;
  so_no: string;
  party_id: string | null;
  party_name: string;
  date: string | null;
  total: number;
  status: string;
  line_count: number;
  lines: {
    id: string;
    product_id: string | null;
    product_name: string;
    qty: number;
    price: number;
    amount: number;
    discount: number;
  }[];
};

export type FinPayment = {
  id: string;
  purchase_id: string;
  purchase_no: string;
  supplier_name: string;
  amount: number;
  payment_mode: string;
  bank_account_id: string | null;
  bank_account_name: string | null;
  date: string | null;
  reference: string;
};

export type FinReceipt = {
  id: string;
  sales_id: string;
  sales_no: string;
  party_name: string;
  amount: number;
  payment_mode: string;
  date: string | null;
  reference: string;
};

export type FinDebitNote = {
  id: string;
  purchase_id: string;
  purchase_no: string;
  supplier_name: string;
  amount: number;
  reason: string;
  date: string | null;
  status: string;
};

export type FinCreditNote = {
  id: string;
  sales_id: string;
  sales_no: string;
  party_name: string;
  amount: number;
  reason: string;
  date: string | null;
  status: string;
};

export type FinIncomeExpense = {
  id: string;
  type: string;
  category: string;
  amount: number;
  date: string | null;
  description: string;
  voucher_id: string | null;
  voucher_no: string | null;
};

export type FinPnL = {
  id: string;
  period_from: string | null;
  period_to: string | null;
  revenue: number;
  cogs: number;
  expenses: number;
  net_profit: number;
  generated_at: string | null;
};

export type FinTax = {
  id: string;
  tax_type: string;
  period: string;
  amount: number;
  filing_status: string;
  filed_at: string | null;
};

export type FinCheque = {
  id: string;
  cheque_no: string;
  bank_account_id: string | null;
  bank_account_name: string;
  payee: string;
  amount: number;
  date: string | null;
  status: string;
};

export type FinOptions = {
  accounts: { id: string; code: string; name: string; head_type: string }[];
  cash_banks: { id: string; name: string; account_type: string; current_balance: number }[];
  vendors: { id: string; name: string; status: string }[];
  parties: { id: string; name: string; party_type: string }[];
  purchases: {
    id: string;
    purchase_no: string;
    supplier_name: string;
    total: number;
    payment_status: string;
  }[];
  sales: { id: string; sales_no: string; party_name: string; total: number }[];
  items: { id: string; item_code: string; name: string; uom: string }[];
  products: { id: string; name: string }[];
};

type ListOpts = {
  search?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  [key: string]: string | number | boolean | undefined;
};

function qs(opts?: ListOpts): string {
  if (!opts) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function list<T>(path: string, opts?: ListOpts) {
  return apiFetch<Paginated<T>>(`${path}${qs(opts)}`);
}

export const financeApi = {
  overview: () => apiFetch<FinanceOverview>("/finance/overview/"),
  options: () => apiFetch<FinOptions>("/finance/options/"),

  coa: (opts?: ListOpts) => list<FinAccount>("/finance/coa/", opts),
  createCoa: (payload: Record<string, unknown>) =>
    apiFetch<FinAccount>("/finance/coa/", { method: "POST", body: JSON.stringify(payload) }),
  updateCoa: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinAccount>(`/finance/coa/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCoa: (id: string) => apiFetch<void>(`/finance/coa/${id}/`, { method: "DELETE" }),

  vouchers: (opts?: ListOpts) => list<FinVoucher>("/finance/vouchers/", opts),
  voucher: (id: string) => apiFetch<FinVoucher>(`/finance/vouchers/${id}/`),
  createVoucher: (payload: Record<string, unknown>) =>
    apiFetch<FinVoucher>("/finance/vouchers/", { method: "POST", body: JSON.stringify(payload) }),
  updateVoucher: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinVoucher>(`/finance/vouchers/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  voucherAction: (id: string, action: "post" | "reverse") =>
    apiFetch<FinVoucher>(`/finance/vouchers/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteVoucher: (id: string) => apiFetch<void>(`/finance/vouchers/${id}/`, { method: "DELETE" }),

  cashBanks: (opts?: ListOpts) => list<FinCashBank>("/finance/cash-banks/", opts),
  createCashBank: (payload: Record<string, unknown>) =>
    apiFetch<FinCashBank>("/finance/cash-banks/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCashBank: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinCashBank>(`/finance/cash-banks/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCashBank: (id: string) =>
    apiFetch<void>(`/finance/cash-banks/${id}/`, { method: "DELETE" }),

  dayBook: (opts?: ListOpts) =>
    apiFetch<Paginated<FinDayBook> & { totals: { debit: number; credit: number } }>(
      `/finance/day-book/${qs(opts)}`,
    ),
  ledger: (opts?: ListOpts) => list<FinLedger>("/finance/ledger/", opts),

  purchases: (opts?: ListOpts) => list<FinPurchase>("/finance/purchases/", opts),
  createPurchase: (payload: Record<string, unknown>) =>
    apiFetch<FinPurchase>("/finance/purchases/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePurchase: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinPurchase>(`/finance/purchases/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePurchase: (id: string) =>
    apiFetch<void>(`/finance/purchases/${id}/`, { method: "DELETE" }),

  purchaseOrders: (opts?: ListOpts) => list<FinPO>("/finance/purchase-orders/", opts),
  createPurchaseOrder: (payload: Record<string, unknown>) =>
    apiFetch<FinPO>("/finance/purchase-orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePurchaseOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinPO>(`/finance/purchase-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePurchaseOrder: (id: string) =>
    apiFetch<void>(`/finance/purchase-orders/${id}/`, { method: "DELETE" }),

  sales: (opts?: ListOpts) => list<FinSales>("/finance/sales/", opts),
  createSales: (payload: Record<string, unknown>) =>
    apiFetch<FinSales>("/finance/sales/", { method: "POST", body: JSON.stringify(payload) }),
  updateSales: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinSales>(`/finance/sales/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteSales: (id: string) => apiFetch<void>(`/finance/sales/${id}/`, { method: "DELETE" }),

  salesOrders: (opts?: ListOpts) => list<FinSO>("/finance/sales-orders/", opts),
  createSalesOrder: (payload: Record<string, unknown>) =>
    apiFetch<FinSO>("/finance/sales-orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSalesOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinSO>(`/finance/sales-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteSalesOrder: (id: string) =>
    apiFetch<void>(`/finance/sales-orders/${id}/`, { method: "DELETE" }),

  payments: (opts?: ListOpts) => list<FinPayment>("/finance/payments/", opts),
  createPayment: (payload: Record<string, unknown>) =>
    apiFetch<FinPayment>("/finance/payments/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  receipts: (opts?: ListOpts) => list<FinReceipt>("/finance/receipts/", opts),
  createReceipt: (payload: Record<string, unknown>) =>
    apiFetch<FinReceipt>("/finance/receipts/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  debitNotes: (opts?: ListOpts) => list<FinDebitNote>("/finance/debit-notes/", opts),
  createDebitNote: (payload: Record<string, unknown>) =>
    apiFetch<FinDebitNote>("/finance/debit-notes/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  debitNoteAction: (id: string, action: "post") =>
    apiFetch<FinDebitNote>(`/finance/debit-notes/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteDebitNote: (id: string) =>
    apiFetch<void>(`/finance/debit-notes/${id}/`, { method: "DELETE" }),

  creditNotes: (opts?: ListOpts) => list<FinCreditNote>("/finance/credit-notes/", opts),
  createCreditNote: (payload: Record<string, unknown>) =>
    apiFetch<FinCreditNote>("/finance/credit-notes/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  creditNoteAction: (id: string, action: "post") =>
    apiFetch<FinCreditNote>(`/finance/credit-notes/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteCreditNote: (id: string) =>
    apiFetch<void>(`/finance/credit-notes/${id}/`, { method: "DELETE" }),

  incomeExpenses: (opts?: ListOpts) =>
    apiFetch<Paginated<FinIncomeExpense> & { totals: { income: number; expense: number } }>(
      `/finance/income-expenses/${qs(opts)}`,
    ),
  createIncomeExpense: (payload: Record<string, unknown>) =>
    apiFetch<FinIncomeExpense>("/finance/income-expenses/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateIncomeExpense: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinIncomeExpense>(`/finance/income-expenses/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteIncomeExpense: (id: string) =>
    apiFetch<void>(`/finance/income-expenses/${id}/`, { method: "DELETE" }),

  pnl: (opts?: ListOpts) => list<FinPnL>("/finance/pnl/", opts),
  generatePnl: (payload: { period_from: string; period_to: string }) =>
    apiFetch<FinPnL>("/finance/pnl/", { method: "POST", body: JSON.stringify(payload) }),

  tax: (opts?: ListOpts) => list<FinTax>("/finance/tax/", opts),
  createTax: (payload: Record<string, unknown>) =>
    apiFetch<FinTax>("/finance/tax/", { method: "POST", body: JSON.stringify(payload) }),
  updateTax: (id: string, payload: Record<string, unknown>) =>
    apiFetch<FinTax>(`/finance/tax/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTax: (id: string) => apiFetch<void>(`/finance/tax/${id}/`, { method: "DELETE" }),

  cheques: (opts?: ListOpts) => list<FinCheque>("/finance/cheques/", opts),
  createCheque: (payload: Record<string, unknown>) =>
    apiFetch<FinCheque>("/finance/cheques/", { method: "POST", body: JSON.stringify(payload) }),
  chequeAction: (id: string, action: "clear" | "bounce") =>
    apiFetch<FinCheque>(`/finance/cheques/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteCheque: (id: string) => apiFetch<void>(`/finance/cheques/${id}/`, { method: "DELETE" }),
};
