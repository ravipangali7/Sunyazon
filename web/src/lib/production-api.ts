/** Production module API — BOM, batches, work orders, WIP, costing, damage, reports. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type ProductionOverview = {
  work_orders: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  draft: number;
  released: number;
  planned_qty: number;
  produced_qty: number;
  boms: number;
  batches_active: number;
  wip_closing: number;
  damage_open: number;
  costing_total: number;
  report_hours_today: number;
};

export type ProductionOptions = {
  items: { id: string; code: string; name: string; uom: string; category: string }[];
  definitions: { id: string; code: string; name: string; status: string }[];
  employees: { id: string; code: string; name: string }[];
  departments: { id: string; code: string; name: string }[];
  boms: {
    id: string;
    code: string;
    name: string;
    version: number;
    status: string;
    finished_item_id: string | null;
  }[];
  batches: { id: string; batch_no: string; status: string }[];
  work_orders: { id: string; wo_no: string; title: string; status: string }[];
  stages: { id: string; code: string; name: string; process_definition_id: string }[];
  warehouses: { id: string; code: string; name: string }[];
};

export type BOMLine = {
  id: string;
  bom_id: string;
  raw_material_id: string | null;
  raw_material_code: string;
  raw_material_name: string;
  qty_per_unit: number;
  uom: string;
  scrap_pct: number | null;
  sort_order: number;
  remarks: string;
};

export type BOM = {
  id: string;
  code: string;
  name: string;
  finished_product_id: string | null;
  finished_product_name: string;
  finished_item_id: string | null;
  finished_item_code: string;
  finished_item_name: string;
  version: number;
  status: string;
  effective_from: string | null;
  created_at: string | null;
  line_count: number;
  lines: BOMLine[];
};

export type Batch = {
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

export type ProductionWorkOrder = {
  id: string;
  wo_code: string;
  wo_no: string;
  title: string;
  product_name: string;
  brand: string;
  batch_no: string;
  planned_qty: number;
  produced_qty: number;
  uom: string;
  line: string;
  scheduled_start: string;
  status: string;
  qa_status: string;
  process_definition_id: string | null;
  process_definition_name: string;
  product_id: string | null;
  output_item_id: string | null;
  output_item_code: string;
  batch_id: string | null;
  bom_id: string | null;
  bom_code: string;
  target_qty: number | null;
  actual_qty: number | null;
  waste_qty: number | null;
  priority: string;
  planned_start: string | null;
  planned_end: string | null;
  department_id: string | null;
  department_name: string;
  supervisor_id: string | null;
  supervisor_name: string;
  customer_party_id: string | null;
  project_code: string;
  raw_status: string;
  date: string | null;
  custom_data_json: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type WIPRecord = {
  id: string;
  date: string | null;
  work_order_id: string | null;
  work_order_no: string;
  process_stage_id: string;
  process_stage_code: string;
  process_stage_name: string;
  opening_wip: number;
  input_qty: number;
  output_qty: number;
  closing_wip: number;
};

export type ProductionCosting = {
  id: string;
  work_order_id: string;
  work_order_no: string;
  process_run_id: string | null;
  process_run_no: string;
  product_id: string | null;
  product_name: string;
  item_id: string | null;
  item_code: string;
  item_name: string;
  material_cost: number;
  labor_cost: number;
  machine_cost: number;
  overhead_cost: number;
  total_cost: number;
  per_unit_cost: number | null;
  journal_voucher_id: string | null;
  period_date: string | null;
  created_at: string | null;
};

export type DamageExpire = {
  id: string;
  product_id: string | null;
  product_name: string;
  item_id: string | null;
  item_code: string;
  item_name: string;
  batch_id: string | null;
  batch_no: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_line_id: string | null;
  qty: number;
  reason: string;
  date: string | null;
  approved_by_id: string | null;
  approved_by_name: string;
  stock_ledger_id: string | null;
  is_posted: boolean;
};

export type WorkingReport = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  work_order_id: string | null;
  work_order_no: string;
  process_run_stage_id: string | null;
  date: string | null;
  activities_json: unknown[];
  hours: number;
  remarks: string;
  created_at: string | null;
};

type ListOpts = {
  search?: string;
  q?: string;
  status?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
  date?: string;
  reason?: string;
  posted?: string;
  work_order_id?: string;
  employee_id?: string;
  priority?: string;
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

async function list<T>(path: string, opts?: ListOpts): Promise<Paginated<T>> {
  return apiFetch<Paginated<T>>(`${path}${qs(opts)}`);
}

export const productionApi = {
  overview: () => apiFetch<ProductionOverview>("/production/overview/"),
  options: () => apiFetch<ProductionOptions>("/production/options/"),

  boms: (opts?: ListOpts) => list<BOM>("/production/boms/", opts),
  bom: (id: string) => apiFetch<BOM>(`/production/boms/${id}/`),
  createBom: (payload: Record<string, unknown>) =>
    apiFetch<BOM>("/production/boms/", { method: "POST", body: JSON.stringify(payload) }),
  updateBom: (id: string, payload: Record<string, unknown>) =>
    apiFetch<BOM>(`/production/boms/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBom: (id: string) => apiFetch<void>(`/production/boms/${id}/`, { method: "DELETE" }),
  addBomLine: (bomId: string, payload: Record<string, unknown>) =>
    apiFetch<BOMLine>(`/production/boms/${bomId}/lines/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteBomLine: (bomId: string, lineId: string) =>
    apiFetch<void>(`/production/boms/${bomId}/lines/${lineId}/`, { method: "DELETE" }),

  batches: (opts?: ListOpts) => list<Batch>("/production/batches/", opts),
  createBatch: (payload: Record<string, unknown>) =>
    apiFetch<Batch>("/production/batches/", { method: "POST", body: JSON.stringify(payload) }),
  updateBatch: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Batch>(`/production/batches/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  batchAction: (id: string, action: "quarantine" | "close" | "activate") =>
    apiFetch<Batch>(`/production/batches/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteBatch: (id: string) => apiFetch<void>(`/production/batches/${id}/`, { method: "DELETE" }),

  workOrders: (opts?: ListOpts) => list<ProductionWorkOrder>("/production/work-orders/", opts),
  createWorkOrder: (payload: Record<string, unknown>) =>
    apiFetch<ProductionWorkOrder>("/production/work-orders/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkOrder: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProductionWorkOrder>(`/production/work-orders/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  workOrderAction: (
    id: string,
    action: "release" | "hold" | "resume" | "start" | "complete" | "cancel",
    extra: Record<string, unknown> = {},
  ) =>
    apiFetch<{ ok: boolean; status: string; work_order?: ProductionWorkOrder }>(
      `/production/work-orders/${id}/`,
      { method: "POST", body: JSON.stringify({ action, ...extra }) },
    ),
  deleteWorkOrder: (id: string) =>
    apiFetch<void>(`/production/work-orders/${id}/`, { method: "DELETE" }),

  wip: (opts?: ListOpts) => list<WIPRecord>("/production/wip/", opts),
  createWip: (payload: Record<string, unknown>) =>
    apiFetch<WIPRecord>("/production/wip/", { method: "POST", body: JSON.stringify(payload) }),
  updateWip: (id: string, payload: Record<string, unknown>) =>
    apiFetch<WIPRecord>(`/production/wip/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteWip: (id: string) => apiFetch<void>(`/production/wip/${id}/`, { method: "DELETE" }),

  costing: (opts?: ListOpts) => list<ProductionCosting>("/production/costing/", opts),
  createCosting: (payload: Record<string, unknown>) =>
    apiFetch<ProductionCosting>("/production/costing/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCosting: (id: string, payload: Record<string, unknown>) =>
    apiFetch<ProductionCosting>(`/production/costing/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCosting: (id: string) =>
    apiFetch<void>(`/production/costing/${id}/`, { method: "DELETE" }),

  damage: (opts?: ListOpts) => list<DamageExpire>("/production/damage/", opts),
  createDamage: (payload: Record<string, unknown>) =>
    apiFetch<DamageExpire>("/production/damage/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateDamage: (id: string, payload: Record<string, unknown>) =>
    apiFetch<DamageExpire>(`/production/damage/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  approveDamage: (id: string, warehouseId?: string) =>
    apiFetch<DamageExpire>(`/production/damage/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", warehouse_id: warehouseId }),
    }),
  deleteDamage: (id: string) =>
    apiFetch<void>(`/production/damage/${id}/`, { method: "DELETE" }),

  workingReports: (opts?: ListOpts) => list<WorkingReport>("/production/working-reports/", opts),
  createWorkingReport: (payload: Record<string, unknown>) =>
    apiFetch<WorkingReport>("/production/working-reports/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkingReport: (id: string, payload: Record<string, unknown>) =>
    apiFetch<WorkingReport>(`/production/working-reports/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteWorkingReport: (id: string) =>
    apiFetch<void>(`/production/working-reports/${id}/`, { method: "DELETE" }),
};
