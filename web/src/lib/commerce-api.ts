/** Commerce (Seller Centre) API — products, orders, categories, overview. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type Choice = { value: string; label: string };

export type CommerceOverview = {
  gmv_30d: number;
  orders_30d: number;
  aov: number;
  avg_rating: number;
  low_stock_count: number;
  products_by_status: { name: string; code: string; value: number }[];
  orders_by_status: { name: string; code: string; value: number }[];
  revenue_trend: { date: string; revenue: number; orders: number }[];
};

export type CommerceOptions = {
  categories: { id: string; name: string }[];
  product_statuses: Choice[];
  order_statuses: Choice[];
  payment_statuses: Choice[];
  brands: string[];
};

export type CommerceProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand_name: string;
  description: string;
  price: number;
  currency: string;
  stock_qty: number;
  status: string;
  category_id: string | null;
  category_name: string;
  condition: string;
  plan_type: string;
  rating: number;
  created_at: string;
  updated_at: string;
};

export type CommerceOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string;
  qty: number;
  unit_price: number;
  amount: number;
  discount: number;
};

export type CommerceOrder = {
  id: string;
  order_no: string;
  buyer_user_id: string | null;
  buyer_name: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  tax: number;
  total: number;
  payment_status: string;
  order_status: string;
  item_count: number;
  items: CommerceOrderItem[];
  created_at: string;
  updated_at: string;
};

export type CommerceCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  parent_name: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
};

type ListParams = {
  search?: string;
  status?: string;
  category?: string;
  order_status?: string;
  payment_status?: string;
  is_active?: string;
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

export type OrderAction = "confirm" | "pack" | "ship" | "deliver" | "cancel";

export const commerceApi = {
  overview: () => apiFetch<CommerceOverview>("/commerce/overview/"),
  options: () => apiFetch<CommerceOptions>("/commerce/options/"),

  products: (params: ListParams = {}) =>
    apiFetch<Paginated<CommerceProduct>>(`/commerce/products/${qs(params)}`),
  createProduct: (body: Record<string, unknown>) =>
    apiFetch<CommerceProduct>("/commerce/products/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getProduct: (id: string) => apiFetch<CommerceProduct>(`/commerce/products/${id}/`),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    apiFetch<CommerceProduct>(`/commerce/products/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProduct: (id: string) =>
    apiFetch<{ ok: boolean }>(`/commerce/products/${id}/`, { method: "DELETE" }),

  orders: (params: ListParams = {}) =>
    apiFetch<Paginated<CommerceOrder>>(`/commerce/orders/${qs(params)}`),
  getOrder: (id: string) => apiFetch<CommerceOrder>(`/commerce/orders/${id}/`),
  orderAction: (id: string, action: OrderAction) =>
    apiFetch<CommerceOrder>(`/commerce/orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  categories: (params: ListParams = {}) =>
    apiFetch<Paginated<CommerceCategory>>(`/commerce/categories/${qs(params)}`),
  createCategory: (body: Record<string, unknown>) =>
    apiFetch<CommerceCategory>("/commerce/categories/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    apiFetch<CommerceCategory>(`/commerce/categories/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCategory: (id: string) =>
    apiFetch<{ ok: boolean }>(`/commerce/categories/${id}/`, { method: "DELETE" }),
};
