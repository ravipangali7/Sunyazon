/** Procurement module API — vendors, PR, RFQ, PO, GRN. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type ProcurementOverview = {
  pr_count: number;
  pr_pending: number;
  po_count: number;
  po_open: number;
  po_value: number;
  grn_count: number;
  grn_today: number;
  grn_qc_pending: number;
  vendor_count: number;
  vendor_active: number;
  rfq_count: number;
  avg_vendor_score: number;
  avg_cycle_days: number;
  otd_pct: number;
  by_pr_status: { name: string; code: string; value: number }[];
  by_po_status: { name: string; code: string; value: number }[];
  by_vendor_category: { name: string; code: string; value: number }[];
  recent_prs: ProcPR[];
  recent_pos: ProcPO[];
  recent_grns: ProcGRN[];
  recent_rfqs: ProcRFQ[];
  top_vendors: ProcVendor[];
};

export type ProcVendor = {
  id: string;
  vendor_name: string;
  contact: string;
  category: string;
  quality_rating: number;
  delivery_rating: number;
  overall_score: number;
  grade: string;
  pan_vat: string;
  status: string;
  po_count: number;
  rfq_count: number;
};

export type ProcPRLine = {
  id: string;
  item_code: string;
  material_id: string | null;
  material_name: string;
  uom: string;
  qty: number;
  required_date: string;
};

export type ProcPR = {
  id: string;
  pr_no: string;
  date: string;
  department: string;
  department_id: string | null;
  requested_by: string;
  requested_by_id: string | null;
  item: string;
  qty: number;
  uom: string;
  need_by: string;
  status: string;
  line_count: number;
  lines?: ProcPRLine[];
};

export type ProcRFQ = {
  id: string;
  rfq_no: string;
  supplier_id: string | null;
  vendor: string;
  item_id: string | null;
  item_code: string;
  item: string;
  uom: string;
  qty: number;
  unit_price: number;
  line_total: number;
  delivery_days: number;
  payment_terms: string;
  remarks: string;
  quality_score: number;
  delivery_score: number;
  overall_score: number;
};

export type ProcPOLine = {
  id: string;
  item_id: string | null;
  item_code: string;
  item_name: string;
  uom: string;
  qty: number;
  rate: number;
  amount: number;
};

export type ProcPO = {
  id: string;
  po_no: string;
  supplier_id: string | null;
  vendor: string;
  item: string;
  qty: number;
  uom: string;
  unit_price: number;
  total: number;
  order_date: string;
  delivery_date: string;
  status: string;
  approved_by_id: string | null;
  approved_by_name: string;
  line_count: number;
  lines?: ProcPOLine[];
};

export type ProcGRNLine = {
  id: string;
  item_id: string | null;
  item_code: string;
  item_name: string;
  uom: string;
  ordered_qty: number;
  received_qty: number;
  accepted_qty: number;
  rejected_qty: number;
};

export type ProcGRN = {
  id: string;
  grn_no: string;
  po_id: string | null;
  po_no: string;
  supplier_id: string | null;
  vendor: string;
  date: string;
  qc_status: string;
  status: string;
  received_by_id: string | null;
  received_by_name: string;
  item: string;
  qty: number;
  uom: string;
  received_date: string;
  line_count: number;
  lines: ProcGRNLine[];
};

export type ProcurementOptions = {
  vendors: { id: string; name: string; status: string; score: number }[];
  items: { id: string; code: string; name: string; uom: string; supplier_id: string | null }[];
  departments: { id: string; name: string; code: string }[];
  open_pos: {
    id: string;
    po_no: string;
    vendor: string;
    supplier_id: string | null;
    status: string;
  }[];
  warehouses: { id: string; code: string; name: string }[];
};

type ListOpts = {
  search?: string;
  status?: string;
  category?: string;
  department_id?: string;
  supplier_id?: string;
  item_id?: string;
  rfq_no?: string;
  qc_status?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

function qs(opts?: ListOpts): string {
  if (!opts) return "";
  const p = new URLSearchParams();
  Object.entries(opts).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

function list<T>(path: string, opts?: ListOpts) {
  return apiFetch<Paginated<T>>(`${path}${qs(opts)}`);
}

export const procurementApi = {
  overview: () => apiFetch<ProcurementOverview>("/procurement/overview/"),
  options: () => apiFetch<ProcurementOptions>("/procurement/options/"),

  vendors: (opts?: ListOpts) => list<ProcVendor>("/procurement/vendors/", opts),
  createVendor: (payload: Record<string, unknown>) =>
    apiFetch<ProcVendor>("/procurement/vendors/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateVendor: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProcVendor>(`/procurement/vendors/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteVendor: (id: string) =>
    apiFetch<void>(`/procurement/vendors/${id}/`, { method: "DELETE" }),

  requisitions: (opts?: ListOpts) => list<ProcPR>("/procurement/requisitions/", opts),
  createPR: (payload: Record<string, unknown>) =>
    apiFetch<ProcPR>("/procurement/requisitions/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePR: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProcPR>(`/procurement/requisitions/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePR: (id: string) =>
    apiFetch<void>(`/procurement/requisitions/${id}/`, { method: "DELETE" }),
  prAction: (id: string, action: string, extra: Record<string, unknown> = {}) =>
    apiFetch<ProcPR>(`/procurement/requisitions/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),

  rfqs: (opts?: ListOpts) => list<ProcRFQ>("/procurement/rfqs/", opts),
  createRFQ: (payload: Record<string, unknown>) =>
    apiFetch<ProcRFQ>("/procurement/rfqs/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRFQ: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProcRFQ>(`/procurement/rfqs/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteRFQ: (id: string) =>
    apiFetch<void>(`/procurement/rfqs/${id}/`, { method: "DELETE" }),

  orders: (opts?: ListOpts) => list<ProcPO>("/procurement/orders/", opts),
  createPO: (payload: Record<string, unknown>) =>
    apiFetch<ProcPO>("/procurement/orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePO: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProcPO>(`/procurement/orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePO: (id: string) =>
    apiFetch<void>(`/procurement/orders/${id}/`, { method: "DELETE" }),
  poAction: (id: string, action: string) =>
    apiFetch<ProcPO>(`/procurement/orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  grns: (opts?: ListOpts) => list<ProcGRN>("/procurement/grns/", opts),
  createGRN: (payload: Record<string, unknown>) =>
    apiFetch<ProcGRN>("/procurement/grns/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateGRN: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProcGRN>(`/procurement/grns/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteGRN: (id: string) =>
    apiFetch<void>(`/procurement/grns/${id}/`, { method: "DELETE" }),
  grnAction: (id: string, action: string, extra: Record<string, unknown> = {}) =>
    apiFetch<ProcGRN>(`/procurement/grns/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),
};
