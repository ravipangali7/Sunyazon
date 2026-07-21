/** Sales module API — parties, territories, ASM/dealer/retail orders, returns, schemes. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type SalesOverview = {
  party_count: number;
  active_parties: number;
  territory_count: number;
  asm_orders_today: number;
  dealer_orders_today: number;
  retail_orders_today: number;
  today_sales: number;
  open_orders: number;
  approved_orders: number;
  returns_open: number;
  active_schemes: number;
  by_region: { region: string; territory: string; value: number }[];
  by_party_type: { name: string; code: string; value: number }[];
  by_status: { status: string; count: number }[];
  territory_counts: { name: string; value: number }[];
  recent_asm: SalesASMOrder[];
  recent_dealer: SalesDealerOrder[];
  recent_retail: SalesRetailOrder[];
  finance_so_total: number;
  finance_so_count: number;
};

export type SalesParty = {
  id: string;
  name: string;
  party_type: string;
  party_type_label: string;
  area: string;
  asm_id: string | null;
  asm_name: string | null;
  credit_limit: number;
  status: string;
  status_label: string;
};

export type SalesTerritory = {
  id: string;
  name: string;
  region: string;
  asm_id: string | null;
  asm_name: string | null;
  party_count: number;
  route_count: number;
};

export type SalesASMOrder = {
  id: string;
  party_id: string;
  party_name: string;
  party_type: string;
  asm_id: string;
  asm_name: string;
  date: string | null;
  product_id: string;
  product_name: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
  status: string;
};

export type SalesOrderLine = {
  id?: string;
  product_id: string;
  product_name?: string;
  barcode: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
  discount: number;
};

export type SalesDealerOrder = {
  id: string;
  party_id: string;
  party_name: string;
  dsm_id: string;
  dsm_name: string;
  date: string | null;
  discount: number;
  total: number;
  status: string;
  line_count: number;
  lines?: SalesOrderLine[];
};

export type SalesRetailOrder = {
  id: string;
  party_id: string;
  party_name: string;
  rsm_id: string;
  rsm_name: string;
  dealer_order_id: string | null;
  dealer_order_label: string | null;
  date: string | null;
  discount: number;
  total: number;
  status: string;
  line_count: number;
  lines?: SalesOrderLine[];
};

export type SalesReturn = {
  id: string;
  original_order_id: string | null;
  party_id: string;
  party_name: string;
  reason: string;
  total: number;
  status: string;
};

export type SalesScheme = {
  id: string;
  name: string;
  code: string;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  status_label: string;
};

export type SalesOptions = {
  parties: { id: string; name: string; party_type: string; area: string; status: string }[];
  employees: { id: string; employee_code: string; full_name: string; status: string }[];
  products: { id: string; name: string; brand_name: string; status: string }[];
  territories: { id: string; name: string; region: string }[];
  dealer_orders: {
    id: string;
    label: string;
    party_id: string;
    date: string | null;
    status: string;
  }[];
  party_types: { value: string; label: string }[];
  party_statuses: { value: string; label: string }[];
  doc_statuses: { value: string; label: string }[];
  scheme_statuses: { value: string; label: string }[];
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

export const salesApi = {
  overview: () => apiFetch<SalesOverview>("/sales/overview/"),
  options: () => apiFetch<SalesOptions>("/sales/options/"),

  parties: (opts?: ListOpts) => list<SalesParty>("/sales/parties/", opts),
  createParty: (payload: Record<string, unknown>) =>
    apiFetch<SalesParty>("/sales/parties/", { method: "POST", body: JSON.stringify(payload) }),
  updateParty: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesParty>(`/sales/parties/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteParty: (id: string) => apiFetch<void>(`/sales/parties/${id}/`, { method: "DELETE" }),

  territories: (opts?: ListOpts) => list<SalesTerritory>("/sales/territories/", opts),
  createTerritory: (payload: Record<string, unknown>) =>
    apiFetch<SalesTerritory>("/sales/territories/", { method: "POST", body: JSON.stringify(payload) }),
  updateTerritory: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesTerritory>(`/sales/territories/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTerritory: (id: string) =>
    apiFetch<void>(`/sales/territories/${id}/`, { method: "DELETE" }),

  asmOrders: (opts?: ListOpts) => list<SalesASMOrder>("/sales/asm-orders/", opts),
  createAsmOrder: (payload: Record<string, unknown>) =>
    apiFetch<SalesASMOrder>("/sales/asm-orders/", { method: "POST", body: JSON.stringify(payload) }),
  updateAsmOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesASMOrder>(`/sales/asm-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  asmOrderAction: (id: string, action: "approve" | "post" | "cancel") =>
    apiFetch<SalesASMOrder>(`/sales/asm-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteAsmOrder: (id: string) =>
    apiFetch<void>(`/sales/asm-orders/${id}/`, { method: "DELETE" }),

  dealerOrders: (opts?: ListOpts) => list<SalesDealerOrder>("/sales/dealer-orders/", opts),
  createDealerOrder: (payload: Record<string, unknown>) =>
    apiFetch<SalesDealerOrder>("/sales/dealer-orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateDealerOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesDealerOrder>(`/sales/dealer-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  dealerOrderAction: (id: string, action: "approve" | "post" | "cancel") =>
    apiFetch<SalesDealerOrder>(`/sales/dealer-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteDealerOrder: (id: string) =>
    apiFetch<void>(`/sales/dealer-orders/${id}/`, { method: "DELETE" }),

  retailOrders: (opts?: ListOpts) => list<SalesRetailOrder>("/sales/retail-orders/", opts),
  createRetailOrder: (payload: Record<string, unknown>) =>
    apiFetch<SalesRetailOrder>("/sales/retail-orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRetailOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesRetailOrder>(`/sales/retail-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  retailOrderAction: (id: string, action: "approve" | "post" | "cancel") =>
    apiFetch<SalesRetailOrder>(`/sales/retail-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteRetailOrder: (id: string) =>
    apiFetch<void>(`/sales/retail-orders/${id}/`, { method: "DELETE" }),

  returns: (opts?: ListOpts) => list<SalesReturn>("/sales/returns/", opts),
  createReturn: (payload: Record<string, unknown>) =>
    apiFetch<SalesReturn>("/sales/returns/", { method: "POST", body: JSON.stringify(payload) }),
  updateReturn: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesReturn>(`/sales/returns/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  returnAction: (id: string, action: "approve" | "post" | "cancel") =>
    apiFetch<SalesReturn>(`/sales/returns/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteReturn: (id: string) => apiFetch<void>(`/sales/returns/${id}/`, { method: "DELETE" }),

  schemes: (opts?: ListOpts) => list<SalesScheme>("/sales/schemes/", opts),
  createScheme: (payload: Record<string, unknown>) =>
    apiFetch<SalesScheme>("/sales/schemes/", { method: "POST", body: JSON.stringify(payload) }),
  updateScheme: (id: string, payload: Record<string, unknown>) =>
    apiFetch<SalesScheme>(`/sales/schemes/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteScheme: (id: string) => apiFetch<void>(`/sales/schemes/${id}/`, { method: "DELETE" }),
};
