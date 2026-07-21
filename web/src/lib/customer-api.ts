/** Customer portal API — overview, orders, addresses, nearest shops. Profile via enterprise /auth/profile/. */

import { apiFetch } from "./api";
import { enterpriseApi } from "./enterprise-api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type CustomerOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string;
  qty: number;
  unit_price: number;
  amount: number;
  discount: number;
};

export type CustomerOrder = {
  id: string;
  order_no: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  tax: number;
  total: number;
  payment_status: string;
  order_status: string;
  item_count: number;
  items_summary: string;
  items: CustomerOrderItem[];
  seller_org_id: string | null;
  seller_org_name: string;
  shipping_address_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerAddress = {
  id: string;
  type: string;
  type_label: string;
  country: string;
  district: string;
  municipality: string;
  ward: string;
  street: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  line: string;
  city: string;
};

export type CustomerShop = {
  id: string;
  name: string;
  org_id: string | null;
  org_name: string;
  lat: number;
  lng: number;
  address: string;
  is_active: boolean;
};

export type CustomerOverview = {
  order_count: number;
  total_spend: number;
  loyalty: { tier: string; spend: number };
  address_count: number;
  nearest_shops_count: number;
  open_orders: number;
  recent_orders: CustomerOrder[];
};

export type CustomerOptions = {
  address_types: { value: string; label: string }[];
  order_statuses: { value: string; label: string }[];
  payment_statuses: { value: string; label: string }[];
};

export type CustomerProfile = {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  account_type?: string;
  platform_role?: string;
};

type ListParams = {
  search?: string;
  order_status?: string;
  type?: string;
  page?: number;
  page_size?: number;
  sort?: string;
};

function qs(params: Record<string, string | number | boolean | undefined | null> = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const customerApi = {
  overview: () => apiFetch<CustomerOverview>("/customer/overview/"),
  options: () => apiFetch<CustomerOptions>("/customer/options/"),

  orders: (params: ListParams = {}) =>
    apiFetch<Paginated<CustomerOrder>>(`/customer/orders/${qs(params)}`),
  order: (id: string) => apiFetch<CustomerOrder>(`/customer/orders/${id}/`),

  addresses: (params: ListParams = {}) =>
    apiFetch<Paginated<CustomerAddress>>(`/customer/addresses/${qs(params)}`),
  createAddress: (body: Record<string, unknown>) =>
    apiFetch<CustomerAddress>("/customer/addresses/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAddress: (id: string, body: Record<string, unknown>) =>
    apiFetch<CustomerAddress>(`/customer/addresses/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAddress: (id: string) =>
    apiFetch<{ ok: boolean }>(`/customer/addresses/${id}/`, { method: "DELETE" }),

  nearest: (params: ListParams = {}) =>
    apiFetch<Paginated<CustomerShop>>(`/customer/nearest/${qs(params)}`),

  /** Reuses enterprise ProfileView at GET/PATCH /auth/profile/ */
  profile: () => enterpriseApi.profile() as Promise<CustomerProfile>,
  updateProfile: (body: Record<string, unknown>) =>
    enterpriseApi.updateProfile(body) as Promise<CustomerProfile>,
};
