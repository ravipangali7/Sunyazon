/** R&D portal API — overview/options plus thin wrappers for projects & trial batches. */

import { apiFetch } from "./api";

/** Domain-style pagination (production batches, quality, etc.). */
export type DomainPaginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

/** DRF StandardPagination shape used by /projects/. */
export type StandardPaginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type RndOverview = {
  active_projects: number;
  total_projects: number;
  trial_batches: number;
  definitions_count: number;
  by_department: { name: string; code: string; value: number }[];
  by_batch_status: { name: string; code: string; value: number }[];
  by_definition_status: { name: string; code: string; value: number }[];
  recent_batches: RndBatchBrief[];
  upcoming_ends: RndProjectBrief[];
  definitions: RndDefinition[];
};

export type RndBatchBrief = {
  id: string;
  batch_no: string;
  product_name: string;
  output_item_name: string;
  output_item_code: string;
  manufacture_date: string;
  expire_date: string;
  status: string;
  start_date: string;
};

export type RndProjectBrief = {
  id: string;
  name: string;
  code: string;
  end_date: string;
  department_id: string | null;
  department_name: string;
  is_active: boolean;
};

export type RndDefinition = {
  id: string;
  name: string;
  code: string;
  status: string;
  stage_count: number;
  output_type?: string;
};

export type RndOptions = {
  organization_id: string | null;
  departments: { id: string; code: string; name: string }[];
  managers: { id: string; username: string; name: string }[];
  employees: { id: string; code: string; name: string }[];
  process_definitions: RndDefinition[];
  products: { id: string; name: string; brand: string }[];
  items: { id: string; code: string; name: string; uom: string }[];
};

export type RndProject = {
  id: string;
  organization?: string;
  name: string;
  code: string;
  description: string;
  department: string | null;
  manager: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

export type RndBatch = {
  id: string;
  batch_no: string;
  product_id: string | null;
  product_name: string;
  output_item_id: string | null;
  output_item_code: string;
  output_item_name: string;
  work_order_id: string | null;
  work_order_no: string;
  batch_size: number;
  start_date: string | null;
  end_date: string | null;
  manufacture_date: string | null;
  expire_date: string | null;
  supervisor_id: string | null;
  supervisor_name: string;
  status: string;
  created_at: string | null;
};

type ListParams = {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
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

export const rndApi = {
  overview: () => apiFetch<RndOverview>("/rnd/overview/"),
  options: () => apiFetch<RndOptions>("/rnd/options/"),

  /** Existing enterprise ProjectViewSet — StandardPagination. */
  projects: (params: ListParams = {}) =>
    apiFetch<StandardPaginated<RndProject>>(`/projects/${qs(params)}`),
  createProject: (body: Record<string, unknown>) =>
    apiFetch<RndProject>("/projects/", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: Record<string, unknown>) =>
    apiFetch<RndProject>(`/projects/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    apiFetch<void>(`/projects/${id}/`, { method: "DELETE" }),

  /** Existing ProductionBatchesView — domain pagination. */
  batches: (params: ListParams = {}) =>
    apiFetch<DomainPaginated<RndBatch>>(`/production/batches/${qs(params)}`),
  createBatch: (body: Record<string, unknown>) =>
    apiFetch<RndBatch>("/production/batches/", { method: "POST", body: JSON.stringify(body) }),
  updateBatch: (id: string, body: Record<string, unknown>) =>
    apiFetch<RndBatch>(`/production/batches/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteBatch: (id: string) =>
    apiFetch<void>(`/production/batches/${id}/`, { method: "DELETE" }),

  /** Process definitions via overview (includes stage_count). */
  definitions: () =>
    apiFetch<RndOverview>("/rnd/overview/").then((o) => o.definitions || []),
};
