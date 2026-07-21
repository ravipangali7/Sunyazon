/** Inventory module API — warehouses, items, stock, ledger, GRN, adjustments, issues. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type InventoryOverview = {
  sku_count: number;
  below_reorder: number;
  warehouse_count: number;
  category_count: number;
  pending_grns: number;
  pending_adjustments: number;
  open_issues: number;
  movements_today: number;
  by_category: { name: string; code: string; value: number }[];
  by_warehouse_type: { name: string; code: string; value: number }[];
  low_stock: {
    id: string;
    sku: string;
    name: string;
    on_hand: number;
    reorder_level: number;
    uom: string;
    category: string;
  }[];
};

export type InvWarehouse = {
  id: string;
  name: string;
  code: string;
  address: string;
  type: string;
  type_label: string;
  item_count: number;
};

export type InvItem = {
  id: string;
  item_code: string;
  sku: string;
  name: string;
  category: string;
  category_label: string;
  uom: string;
  min_stock: number;
  max_stock: number;
  reorder_level: number;
  bin_location: string;
  supplier_id: string | null;
  supplier_name: string | null;
  on_hand: number;
};

export type InvStockBalance = {
  id: string;
  item_id: string;
  sku: string;
  name: string;
  category: string;
  category_code: string;
  uom: string;
  on_hand: number;
  reserved: number;
  available: number;
  reorder_level: number;
  min_stock: number;
  max_stock: number;
  warehouse_id: string;
  warehouse: string;
  warehouse_name: string;
  batch_no: string;
  expiry_date: string | null;
  bin_location: string;
  below_reorder: boolean;
};

export type InvLedgerEntry = {
  id: string;
  doc_no: string;
  type: string;
  transaction_type: string;
  sku: string;
  item: string;
  item_id: string | null;
  qty: number;
  uom: string;
  warehouse: string;
  warehouse_id: string | null;
  date: string;
  ref: string;
  reference_type: string;
  reference_id: string | null;
  opening_qty: number;
  in_qty: number;
  out_qty: number;
  closing_qty: number;
  work_order_id: string | null;
};

export type InvGRNLine = {
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

export type InvGRN = {
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
  received_by_name: string | null;
  item: string;
  qty: number;
  uom: string;
  received_date: string;
  line_count: number;
  lines: InvGRNLine[];
};

export type InvAdjustment = {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  system_qty: number;
  physical_qty: number;
  variance: number;
  reason: string;
  date: string;
  approved_by_id: string | null;
  approved_by_name: string | null;
  status: string;
};

export type InvIssueLine = {
  id: string;
  material_id: string | null;
  material_code: string;
  material_name: string;
  uom: string;
  required_qty: number;
  issued_qty: number;
};

export type InvMaterialIssue = {
  id: string;
  issue_no: string;
  date: string;
  status: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  work_order_id: string | null;
  work_order_no: string | null;
  process_run_id: string | null;
  issued_by_id: string | null;
  issued_by_name: string | null;
  line_count: number;
  total_issued: number;
  lines: InvIssueLine[];
};

export type InvOptions = {
  warehouses: { id: string; code: string; name: string; type: string }[];
  items: {
    id: string;
    item_code: string;
    name: string;
    uom: string;
    category: string;
    reorder_level: number;
  }[];
  vendors: { id: string; name: string; status: string }[];
  purchase_orders: {
    id: string;
    po_no: string;
    supplier_id: string;
    supplier_name: string;
    status: string;
    date: string | null;
  }[];
  work_orders: { id: string; wo_no: string; title: string; status: string }[];
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

export const inventoryApi = {
  overview: () => apiFetch<InventoryOverview>("/inventory/overview/"),
  options: () => apiFetch<InvOptions>("/inventory/options/"),

  warehouses: (opts?: ListOpts) => list<InvWarehouse>("/inventory/warehouses/", opts),
  createWarehouse: (payload: Record<string, unknown>) =>
    apiFetch<InvWarehouse>("/inventory/warehouses/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWarehouse: (id: string, payload: Record<string, unknown>) =>
    apiFetch<InvWarehouse>(`/inventory/warehouses/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteWarehouse: (id: string) =>
    apiFetch<void>(`/inventory/warehouses/${id}/`, { method: "DELETE" }),

  items: (opts?: ListOpts) => list<InvItem>("/inventory/items/", opts),
  createItem: (payload: Record<string, unknown>) =>
    apiFetch<InvItem>("/inventory/items/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateItem: (id: string, payload: Record<string, unknown>) =>
    apiFetch<InvItem>(`/inventory/items/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteItem: (id: string) => apiFetch<void>(`/inventory/items/${id}/`, { method: "DELETE" }),

  stock: (opts?: ListOpts) => list<InvStockBalance>("/inventory/stock/", opts),
  ledger: (opts?: ListOpts) => list<InvLedgerEntry>("/inventory/ledger/", opts),
  postLedger: (payload: Record<string, unknown>) =>
    apiFetch<InvLedgerEntry>("/inventory/ledger/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  grns: (opts?: ListOpts) => list<InvGRN>("/inventory/grns/", opts),
  createGrn: (payload: Record<string, unknown>) =>
    apiFetch<InvGRN>("/inventory/grns/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateGrn: (id: string, payload: Record<string, unknown>) =>
    apiFetch<InvGRN>(`/inventory/grns/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  grnAction: (id: string, action: "receive" | "post" | "cancel", extra: Record<string, unknown> = {}) =>
    apiFetch<InvGRN>(`/inventory/grns/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),
  deleteGrn: (id: string) => apiFetch<void>(`/inventory/grns/${id}/`, { method: "DELETE" }),

  adjustments: (opts?: ListOpts) => list<InvAdjustment>("/inventory/adjustments/", opts),
  createAdjustment: (payload: Record<string, unknown>) =>
    apiFetch<InvAdjustment>("/inventory/adjustments/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAdjustment: (id: string, payload: Record<string, unknown>) =>
    apiFetch<InvAdjustment>(`/inventory/adjustments/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  adjustmentAction: (id: string, action: "approve" = "approve") =>
    apiFetch<InvAdjustment>(`/inventory/adjustments/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteAdjustment: (id: string) =>
    apiFetch<void>(`/inventory/adjustments/${id}/`, { method: "DELETE" }),

  materialIssues: (opts?: ListOpts) => list<InvMaterialIssue>("/inventory/material-issues/", opts),
  createMaterialIssue: (payload: Record<string, unknown>) =>
    apiFetch<InvMaterialIssue>("/inventory/material-issues/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMaterialIssue: (id: string, payload: Record<string, unknown>) =>
    apiFetch<InvMaterialIssue>(`/inventory/material-issues/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  materialIssueAction: (id: string, action: "approve" | "issue" | "cancel") =>
    apiFetch<InvMaterialIssue>(`/inventory/material-issues/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteMaterialIssue: (id: string) =>
    apiFetch<void>(`/inventory/material-issues/${id}/`, { method: "DELETE" }),

  reorderPr: (itemId: string, qty?: number) =>
    apiFetch<unknown>("/inventory/reorder-pr/", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, qty }),
    }),
};
