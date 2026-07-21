/** Maintenance module API — equipment, work orders, PM schedules, calibration. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type MaintenanceOverview = {
  equipment_count: number;
  health_index: { name: string; code: string; value: number }[];
  open_work_orders: { name: string; code: string; value: number }[];
  pm_due_soon_count: number;
  pm_due_soon: MaintenancePMSchedule[];
  overdue_calibrations: number;
  by_type: { name: string; code: string; value: number }[];
  open_wo_count: number;
};

export type Choice = { value: string; label: string };

export type MaintenanceOptions = {
  equipment: { id: string; asset_code: string; name: string }[];
  employees: { id: string; code: string; name: string }[];
  wo_types: Choice[];
  wo_statuses: Choice[];
  health_indexes: Choice[];
  pm_frequencies: Choice[];
  calibration_results: Choice[];
  equipment_categories: Choice[];
};

export type MaintenanceEquipment = {
  id: string;
  asset_code: string;
  name: string;
  location: string;
  capacity: string;
  category: string;
  health_index: string;
  purchase_date: string;
  next_pm_due: string;
  open_wo_count: number;
};

export type MaintenanceWorkOrder = {
  id: string;
  equipment_id: string | null;
  equipment_code: string;
  equipment_name: string;
  type: string;
  description: string;
  technician_id: string | null;
  technician_name: string;
  status: string;
  requested_at: string;
  closed_at: string;
};

export type MaintenancePMSchedule = {
  id: string;
  equipment_id: string | null;
  equipment_code: string;
  equipment_name: string;
  frequency: string;
  activity: string;
  next_due: string;
  last_done: string;
};

export type MaintenanceCalibration = {
  id: string;
  equipment_id: string | null;
  equipment_code: string;
  equipment_name: string;
  calibrated_at: string;
  next_due: string;
  result: string;
  performed_by_id: string | null;
  performed_by_name: string;
};

type ListParams = {
  search?: string;
  status?: string;
  health_index?: string;
  category?: string;
  type?: string;
  frequency?: string;
  result?: string;
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

export const maintenanceApi = {
  overview: () => apiFetch<MaintenanceOverview>("/maintenance/overview/"),
  options: () => apiFetch<MaintenanceOptions>("/maintenance/options/"),

  equipment: (params: ListParams = {}) =>
    apiFetch<Paginated<MaintenanceEquipment>>(`/maintenance/equipment/${qs(params)}`),
  createEquipment: (body: Record<string, unknown>) =>
    apiFetch<MaintenanceEquipment>("/maintenance/equipment/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEquipment: (id: string, body: Record<string, unknown>) =>
    apiFetch<MaintenanceEquipment>(`/maintenance/equipment/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEquipment: (id: string) =>
    apiFetch<{ ok: boolean }>(`/maintenance/equipment/${id}/`, { method: "DELETE" }),

  workOrders: (params: ListParams = {}) =>
    apiFetch<Paginated<MaintenanceWorkOrder>>(`/maintenance/work-orders/${qs(params)}`),
  createWorkOrder: (body: Record<string, unknown>) =>
    apiFetch<MaintenanceWorkOrder>("/maintenance/work-orders/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateWorkOrder: (id: string, body: Record<string, unknown>) =>
    apiFetch<MaintenanceWorkOrder>(`/maintenance/work-orders/${id}/detail/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteWorkOrder: (id: string) =>
    apiFetch<{ ok: boolean }>(`/maintenance/work-orders/${id}/detail/`, { method: "DELETE" }),
  /** Close uses legacy FBV; approve/start use detail action endpoint. */
  woAction: (id: string, action: "approve" | "start" | "close" | "in_progress") => {
    if (action === "close") {
      return apiFetch<{ ok: boolean; id?: string; status?: string }>(
        `/maintenance/work-orders/${id}/`,
        { method: "POST", body: JSON.stringify({ action: "close" }) },
      );
    }
    return apiFetch<MaintenanceWorkOrder>(`/maintenance/work-orders/${id}/detail/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },

  pmSchedules: (params: ListParams = {}) =>
    apiFetch<Paginated<MaintenancePMSchedule>>(`/maintenance/pm-schedules/${qs(params)}`),
  createPmSchedule: (body: Record<string, unknown>) =>
    apiFetch<MaintenancePMSchedule>("/maintenance/pm-schedules/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePmSchedule: (id: string, body: Record<string, unknown>) =>
    apiFetch<MaintenancePMSchedule>(`/maintenance/pm-schedules/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePmSchedule: (id: string) =>
    apiFetch<{ ok: boolean }>(`/maintenance/pm-schedules/${id}/`, { method: "DELETE" }),
  generatePmDue: () =>
    apiFetch<{ ok: boolean; created: number }>("/maintenance/pm/generate/", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  calibrations: (params: ListParams = {}) =>
    apiFetch<Paginated<MaintenanceCalibration>>(`/maintenance/calibrations/${qs(params)}`),
  createCalibration: (body: Record<string, unknown>) =>
    apiFetch<MaintenanceCalibration>("/maintenance/calibrations/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCalibration: (id: string, body: Record<string, unknown>) =>
    apiFetch<MaintenanceCalibration>(`/maintenance/calibrations/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCalibration: (id: string) =>
    apiFetch<{ ok: boolean }>(`/maintenance/calibrations/${id}/`, { method: "DELETE" }),
};
