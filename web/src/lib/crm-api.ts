/** CRM module API — pipeline deals, complaints, customer activities. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type CrmChoice = { value: string; label: string };

export type CrmOverview = {
  open_deals: number;
  pipeline_value: number;
  won_value: number;
  conversion_pct: number;
  deals_by_stage: { name: string; code: string; count: number; value: number }[];
  open_complaints: number;
  complaints_by_status: { name: string; code: string; value: number }[];
  recent_activities: CrmActivity[];
};

export type CrmDeal = {
  id: string;
  title: string;
  stage: string;
  value: number;
  party_id: string | null;
  party_name: string;
  owner_id: string | null;
  owner_name: string;
  expected_close: string;
  work_order_id: string | null;
  work_order_no: string;
};

export type CrmComplaint = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  product_id: string | null;
  product_name: string;
  description: string;
  status: string;
  registered_at: string;
  closed_at: string;
  sla_hours: number;
};

export type CrmActivity = {
  id: string;
  party_id: string | null;
  party_name: string;
  activity_type: string;
  notes: string;
  performed_by_id: string | null;
  performed_by_name: string;
  performed_at: string;
};

export type CrmOptions = {
  parties: { id: string; name: string }[];
  employees: { id: string; code: string; name: string }[];
  products: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  work_orders: { id: string; wo_no: string }[];
  deal_stages: CrmChoice[];
  complaint_statuses: CrmChoice[];
  activity_types: CrmChoice[];
};

type ListParams = {
  search?: string;
  stage?: string;
  status?: string;
  activity_type?: string;
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

export const crmApi = {
  overview: () => apiFetch<CrmOverview>("/crm/overview/"),
  options: () => apiFetch<CrmOptions>("/crm/options/"),

  deals: (params: ListParams = {}) =>
    apiFetch<Paginated<CrmDeal>>(`/crm/deals/${qs(params)}`),
  createDeal: (body: Record<string, unknown>) =>
    apiFetch<CrmDeal>("/crm/deals/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDeal: (id: string, body: Record<string, unknown>) =>
    apiFetch<CrmDeal>(`/crm/deals/${id}/detail/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDeal: (id: string) =>
    apiFetch<{ ok: boolean }>(`/crm/deals/${id}/detail/`, { method: "DELETE" }),
  dealAction: (id: string, action: "won" | "lost", notes?: string) =>
    apiFetch<{ ok: boolean; stage: string }>(`/crm/deals/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, notes }),
    }),

  complaints: (params: ListParams = {}) =>
    apiFetch<Paginated<CrmComplaint>>(`/crm/complaints/${qs(params)}`),
  createComplaint: (body: Record<string, unknown>) =>
    apiFetch<CrmComplaint>("/crm/complaints/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateComplaint: (id: string, body: Record<string, unknown>) =>
    apiFetch<CrmComplaint>(`/crm/complaints/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteComplaint: (id: string) =>
    apiFetch<{ ok: boolean }>(`/crm/complaints/${id}/`, { method: "DELETE" }),
  complaintAction: (id: string, body: Record<string, unknown> = { action: "advance" }) =>
    apiFetch<CrmComplaint>(`/crm/complaints/${id}/`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  activities: (params: ListParams = {}) =>
    apiFetch<Paginated<CrmActivity>>(`/crm/activities/${qs(params)}`),
  createActivity: (body: Record<string, unknown>) =>
    apiFetch<CrmActivity>("/crm/activities/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateActivity: (id: string, body: Record<string, unknown>) =>
    apiFetch<CrmActivity>(`/crm/activities/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteActivity: (id: string) =>
    apiFetch<{ ok: boolean }>(`/crm/activities/${id}/`, { method: "DELETE" }),
};
