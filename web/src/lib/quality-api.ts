/** Quality (QA/QC) module API — incoming, IPQC, release, lab, NCR, CAPA, masters. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type QualityOverview = {
  pending_incoming: number;
  pending_ipqc: number;
  held_releases: number;
  open_ncrs: number;
  open_capas: number;
  lab_fails: number;
  pass_count: number;
  fail_count: number;
  hold_count: number;
  released_count: number;
  by_status: { name: string; code: string; value: number }[];
  inbox: {
    id: string;
    type: string;
    ref: string;
    title: string;
    status: string;
    date: string;
  }[];
  recent_ncrs: QualityNCR[];
  recent_releases: QualityRelease[];
};

export type QualityIncoming = {
  id: string;
  inspection_no: string;
  date: string;
  supplier_id: string | null;
  supplier_name: string;
  material_id: string | null;
  material_name: string;
  material_code: string;
  batch_id: string | null;
  batch_no: string;
  grn_line_id: string | null;
  parameter: string;
  result: string;
  status: string;
  inspector_id: string | null;
  inspector_name: string;
};

export type QualityIPQC = {
  id: string;
  date: string;
  product_id: string | null;
  product_name: string;
  brand: string;
  batch_id: string | null;
  batch_no: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_id: string | null;
  process_run_stage_id: string | null;
  process_stage_id: string | null;
  process_step: string;
  parameter: string;
  standard: string;
  actual: string;
  status: string;
  inspector_id: string | null;
  inspector_name: string;
};

export type QualityRelease = {
  id: string;
  batch_id: string | null;
  batch_no: string;
  product_id: string | null;
  product_name: string;
  brand: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_id: string | null;
  process_run_stage_id: string | null;
  inspection_date: string;
  quantity: number;
  quality_status: string;
  release_status: string;
  approved_by_id: string | null;
  approved_by_name: string;
};

export type QualityLab = {
  id: string;
  test_no: string;
  sample: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_stage_id: string | null;
  batch_id: string | null;
  batch_no: string;
  test_parameter: string;
  method: string;
  specification: string;
  result: string;
  unit: string;
  status: string;
};

export type QualityNCR = {
  id: string;
  ncr_no: string;
  date: string;
  issue: string;
  department_id: string | null;
  department_name: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_stage_id: string | null;
  root_cause: string;
  correction: string;
  status: string;
  capa_count: number;
  capa_id?: string;
  capa_no?: string;
};

export type QualityCAPA = {
  id: string;
  capa_no: string;
  problem: string;
  root_cause: string;
  corrective_action: string;
  preventive_action: string;
  owner_id: string | null;
  owner_name: string;
  due_date: string;
  ncr_id: string | null;
  ncr_no: string;
  work_order_id: string | null;
  work_order_no: string;
  status: string;
};

export type QualityMaster = {
  id: string;
  product_id: string | null;
  product_name: string;
  process_definition_id: string | null;
  process_definition_name: string;
  process_stage_id: string | null;
  process_stage_name: string;
  quality_parameter: string;
  specification: string;
  tolerance: string;
  testing_frequency: string;
};

export type QualityOptions = {
  employees: { id: string; code: string; name: string }[];
  vendors: { id: string; name: string }[];
  materials: { id: string; code: string; name: string; uom: string }[];
  products: { id: string; name: string; brand: string }[];
  batches: { id: string; batch_no: string; status: string }[];
  work_orders: { id: string; wo_no: string; title: string; status: string }[];
  departments: { id: string; code: string; name: string }[];
  ncrs: { id: string; ncr_no: string; status: string }[];
  process_definitions: { id: string; name: string; code: string }[];
  process_stages: {
    id: string;
    name: string;
    code: string;
    process_definition_id: string;
  }[];
};

type ListParams = {
  search?: string;
  status?: string;
  release_status?: string;
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

export const qualityApi = {
  overview: () => apiFetch<QualityOverview>("/quality/overview/"),
  options: () => apiFetch<QualityOptions>("/quality/options/"),

  incoming: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityIncoming>>(`/quality/incoming/${qs(params)}`),
  createIncoming: (body: Record<string, unknown>) =>
    apiFetch<QualityIncoming>("/quality/incoming/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIncoming: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityIncoming>(`/quality/incoming/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteIncoming: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/incoming/${id}/`, { method: "DELETE" }),

  ipqc: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityIPQC>>(`/quality/ipqc/${qs(params)}`),
  createIpqc: (body: Record<string, unknown>) =>
    apiFetch<QualityIPQC>("/quality/ipqc/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIpqc: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityIPQC>(`/quality/ipqc/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteIpqc: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/ipqc/${id}/`, { method: "DELETE" }),

  releases: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityRelease>>(`/quality/releases/${qs(params)}`),
  createRelease: (body: Record<string, unknown>) =>
    apiFetch<QualityRelease>("/quality/releases/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRelease: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityRelease>(`/quality/releases/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRelease: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/releases/${id}/`, { method: "DELETE" }),

  lab: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityLab>>(`/quality/lab/${qs(params)}`),
  createLab: (body: Record<string, unknown>) =>
    apiFetch<QualityLab>("/quality/lab/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateLab: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityLab>(`/quality/lab/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteLab: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/lab/${id}/`, { method: "DELETE" }),

  ncrs: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityNCR>>(`/quality/ncrs/${qs(params)}`),
  createNcr: (body: Record<string, unknown>) =>
    apiFetch<QualityNCR>("/quality/ncrs/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNcr: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityNCR>(`/quality/ncrs/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNcr: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/ncrs/${id}/`, { method: "DELETE" }),

  capas: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityCAPA>>(`/quality/capas/${qs(params)}`),
  createCapa: (body: Record<string, unknown>) =>
    apiFetch<QualityCAPA>("/quality/capas/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCapa: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityCAPA>(`/quality/capas/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCapa: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/capas/${id}/`, { method: "DELETE" }),

  masters: (params: ListParams = {}) =>
    apiFetch<Paginated<QualityMaster>>(`/quality/masters/${qs(params)}`),
  createMaster: (body: Record<string, unknown>) =>
    apiFetch<QualityMaster>("/quality/masters/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMaster: (id: string, body: Record<string, unknown>) =>
    apiFetch<QualityMaster>(`/quality/masters/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteMaster: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/masters/${id}/`, { method: "DELETE" }),
};
