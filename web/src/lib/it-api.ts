/** IT & Digital Transformation API — helpdesk tickets and access sessions. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type ItOverview = {
  open_tickets: number;
  avg_open_age_days: number;
  active_sessions: number;
  by_status: { name: string; code: string; value: number }[];
  by_category: { name: string; value: number }[];
  recent_tickets: ItTicket[];
};

export type ItTicket = {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: string;
  user_id: string | null;
  user_name: string;
  assigned_to_id: string | null;
  assigned_to_name: string;
  created_at: string;
};

export type ItSession = {
  id: string;
  user_id: string | null;
  user_name: string;
  device_info: string;
  ip: string;
  expires_at: string;
  created_at: string;
};

export type ItOptions = {
  statuses: { value: string; label: string }[];
  categories: string[];
  assignable_users: { id: string; name: string }[];
  users: { id: string; name: string }[];
};

export type TicketAction = "assign" | "start" | "resolve" | "close";

type ListParams = {
  search?: string;
  status?: string;
  category?: string;
  assigned_to?: string;
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

export const itApi = {
  overview: () => apiFetch<ItOverview>("/it/overview/"),
  options: () => apiFetch<ItOptions>("/it/options/"),

  tickets: (params: ListParams = {}) =>
    apiFetch<Paginated<ItTicket>>(`/it/tickets/${qs(params)}`),
  createTicket: (body: Record<string, unknown>) =>
    apiFetch<ItTicket>("/it/tickets/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getTicket: (id: string) => apiFetch<ItTicket>(`/it/tickets/${id}/`),
  updateTicket: (id: string, body: Record<string, unknown>) =>
    apiFetch<ItTicket>(`/it/tickets/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTicket: (id: string) =>
    apiFetch<{ ok: boolean }>(`/it/tickets/${id}/`, { method: "DELETE" }),
  ticketAction: (id: string, action: TicketAction, extra: Record<string, unknown> = {}) =>
    apiFetch<ItTicket>(`/it/tickets/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),

  sessions: (params: ListParams = {}) =>
    apiFetch<Paginated<ItSession>>(`/it/sessions/${qs(params)}`),
};
