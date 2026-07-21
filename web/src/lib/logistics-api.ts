/** Logistics module API — vehicles, routes, dispatches, POD. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type LogisticsOverview = {
  active_vehicles: number;
  routes_count: number;
  deliveries_today: number;
  deliveries_week: number;
  pods_pending: number;
  pods_received: number;
  dispatches_planned: number;
  dispatches_loaded: number;
  dispatches_dispatched: number;
  dispatches_delivered: number;
  dispatches_cancelled: number;
  by_status: { name: string; code: string; value: number }[];
  recent_dispatches: LogisticsDispatch[];
};

export type LogisticsVehicle = {
  id: string;
  number: string;
  capacity: number;
  insurance_expiry: string;
  fitness_expiry: string;
  tax_expiry: string;
};

export type LogisticsRoute = {
  id: string;
  name: string;
  territory_id: string | null;
  territory_name: string;
  sequence_json: unknown[];
  stops: number;
};

export type LogisticsDispatch = {
  id: string;
  sales_order_id: string | null;
  so_no: string;
  party_name: string;
  vehicle_id: string | null;
  vehicle_number: string;
  driver_id: string | null;
  driver_name: string;
  route_id: string | null;
  route_name: string;
  status: string;
  dispatched_at: string;
  delivered_at: string;
  pod_id: string | null;
  pod_received_by: string;
  pod_delivered_at: string;
  has_pod: boolean;
};

export type LogisticsPOD = {
  id: string;
  dispatch_id: string;
  so_no: string;
  vehicle_number: string;
  driver_name: string;
  route_name: string;
  received_by: string;
  delivered_at: string;
  has_signature: boolean;
  has_photo: boolean;
  dispatch_status: string;
};

export type LogisticsOptions = {
  vehicles: { id: string; number: string; capacity: number }[];
  routes: { id: string; name: string }[];
  drivers: { id: string; code: string; name: string }[];
  sales_orders: {
    id: string;
    so_no: string;
    party_name: string;
    status: string;
    total: number;
  }[];
  warehouses: { id: string; code: string; name: string }[];
  territories: { id: string; name: string }[];
  dispatch_statuses: { value: string; label: string }[];
};

type ListParams = {
  search?: string;
  status?: string;
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

export const logisticsApi = {
  overview: () => apiFetch<LogisticsOverview>("/logistics/overview/"),
  options: () => apiFetch<LogisticsOptions>("/logistics/options/"),

  vehicles: (params: ListParams = {}) =>
    apiFetch<Paginated<LogisticsVehicle>>(`/logistics/vehicles/${qs(params)}`),
  createVehicle: (body: Record<string, unknown>) =>
    apiFetch<LogisticsVehicle>("/logistics/vehicles/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateVehicle: (id: string, body: Record<string, unknown>) =>
    apiFetch<LogisticsVehicle>(`/logistics/vehicles/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteVehicle: (id: string) =>
    apiFetch<{ ok: boolean }>(`/logistics/vehicles/${id}/`, { method: "DELETE" }),

  routes: (params: ListParams = {}) =>
    apiFetch<Paginated<LogisticsRoute>>(`/logistics/routes/${qs(params)}`),
  createRoute: (body: Record<string, unknown>) =>
    apiFetch<LogisticsRoute>("/logistics/routes/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRoute: (id: string, body: Record<string, unknown>) =>
    apiFetch<LogisticsRoute>(`/logistics/routes/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRoute: (id: string) =>
    apiFetch<{ ok: boolean }>(`/logistics/routes/${id}/`, { method: "DELETE" }),

  dispatches: (params: ListParams = {}) =>
    apiFetch<Paginated<LogisticsDispatch>>(`/logistics/dispatches/list/${qs(params)}`),
  getDispatch: (id: string) =>
    apiFetch<LogisticsDispatch>(`/logistics/dispatches/${id}/detail/`),
  createDispatch: (body: Record<string, unknown>) =>
    apiFetch<LogisticsDispatch>("/logistics/dispatches/list/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDispatch: (id: string, body: Record<string, unknown>) =>
    apiFetch<LogisticsDispatch>(`/logistics/dispatches/${id}/detail/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDispatch: (id: string) =>
    apiFetch<{ ok: boolean }>(`/logistics/dispatches/${id}/detail/`, { method: "DELETE" }),
  /** Lifecycle actions — uses legacy FBV so existing clients stay compatible. */
  dispatchAction: (
    id: string,
    action: "load" | "dispatch" | "pod" | "cancel",
    extra: Record<string, unknown> = {},
  ) =>
    apiFetch<{ ok: boolean; id: string; status: string }>(`/logistics/dispatches/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),

  pods: (params: ListParams = {}) =>
    apiFetch<Paginated<LogisticsPOD>>(`/logistics/pods/${qs(params)}`),
  updatePod: (id: string, body: Record<string, unknown>) =>
    apiFetch<LogisticsPOD>(`/logistics/pods/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePod: (id: string) =>
    apiFetch<{ ok: boolean }>(`/logistics/pods/${id}/`, { method: "DELETE" }),
};
