/** HR module API — positions, employees, onboarding, training, attendance, leave, payroll. */

import { apiFetch } from "./api";
import type { JobApplicant, JobVacancy } from "./company-api";
import { companyApi } from "./company-api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type HRPosition = {
  id: string;
  code: string;
  designation: string;
  department: string;
  min_edu: string;
  experience: string;
  leadership_tier: string;
  sort_order: number;
  is_system: boolean;
  reports_to_id: string | null;
  reports_to_name: string | null;
  employee_count: number;
};

export type HREmployee = {
  id: string;
  employee_code: string;
  full_name: string;
  designation: string;
  department_id: string;
  department_name: string;
  branch_name: string;
  employment_type: string;
  classification: string;
  grade: string;
  join_date: string;
  probation_end: string | null;
  status: string;
  raw_status?: string;
  email: string;
  phone: string;
  reporting_to: string | null;
  reporting_to_id: string | null;
  position_id: string | null;
  citizenship_no: string;
  pan_no: string;
  organization_id: string | null;
  user_id: string | null;
};

export type HRDepartment = {
  id: string;
  name: string;
  code: string;
  status: string;
};

export type HROnboardingTask = {
  id: string;
  employee_id: string;
  task_name: string;
  due_date: string | null;
  is_completed: boolean;
  manager_remark: string;
};

export type HROnboarding = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  joined_date: string | null;
  probation_period_months: number;
  gurukul_status: string;
  has_offer_letter: boolean;
  tasks: HROnboardingTask[];
  tasks_done: number;
  tasks_total: number;
};

export type HRTraining = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  module_name: string;
  watch_time: string | null;
  exam_score: number;
  passed: boolean;
  completion_date: string | null;
};

export type HRAttendance = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  raw_status?: string;
  work_hours: number;
  shift: string;
  ot_hours: number;
};

export type HRLeave = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  approval_status: string;
  approved_by_id: string | null;
  approved_by_name: string | null;
};

export type HRPayrollLine = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  basic: number;
  allowances: number;
  deductions: number;
  ot_amount: number;
  net_pay: number;
};

export type HRPayrollRun = {
  id: string;
  organization_id: string;
  period_month: string;
  status: string;
  processed_at: string | null;
  approved_by_id: string | null;
  approved_by_name: string | null;
  line_count: number;
  total_net: number;
  lines?: HRPayrollLine[];
};

export type HROverview = {
  headcount: number;
  active: number;
  present_today: number;
  present_pct: number;
  open_vacancies: number;
  applications: number;
  pending_leave: number;
  onboarding_open: number;
  by_department: { name: string; value: number }[];
};

type ListOpts = {
  search?: string;
  page?: number;
  page_size?: number;
  [key: string]: string | number | boolean | undefined;
};

function qs(opts?: ListOpts): string {
  if (!opts) return "";
  const params = new URLSearchParams();
  Object.entries(opts).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function list<T>(path: string, opts?: ListOpts): Promise<Paginated<T>> {
  return apiFetch<Paginated<T>>(`${path}${qs(opts)}`);
}

export const hrApi = {
  overview: () => apiFetch<HROverview>("/hr/overview/"),

  positions: (opts?: ListOpts) => list<HRPosition>("/hr/positions/", opts),
  createPosition: (payload: Partial<HRPosition> & { designation: string }) =>
    apiFetch<HRPosition>("/hr/positions/", { method: "POST", body: JSON.stringify(payload) }),
  updatePosition: (id: string, payload: Partial<HRPosition>) =>
    apiFetch<HRPosition>(`/hr/positions/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePosition: (id: string) =>
    apiFetch<void>(`/hr/positions/${id}/`, { method: "DELETE" }),

  employees: (opts?: ListOpts) => list<HREmployee>("/hr/employees/", opts),
  createEmployee: (payload: Record<string, unknown>) =>
    apiFetch<HREmployee>("/hr/employees/", { method: "POST", body: JSON.stringify(payload) }),
  updateEmployee: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HREmployee>(`/hr/employees/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  exitEmployee: (id: string) =>
    apiFetch<HREmployee>(`/hr/employees/${id}/`, { method: "DELETE" }),

  departments: () =>
    apiFetch<{ results: HRDepartment[] }>("/hr/departments/").then((r) => r.results),

  onboarding: (opts?: ListOpts) => list<HROnboarding>("/hr/onboarding/", opts),
  createOnboarding: (payload: Record<string, unknown>) =>
    apiFetch<HROnboarding>("/hr/onboarding/", { method: "POST", body: JSON.stringify(payload) }),
  updateOnboarding: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HROnboarding>(`/hr/onboarding/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createOnboardingTask: (payload: Record<string, unknown>) =>
    apiFetch<HROnboardingTask>("/hr/onboarding-tasks/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateOnboardingTask: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HROnboardingTask>(`/hr/onboarding-tasks/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  training: (opts?: ListOpts) => list<HRTraining>("/hr/training/", opts),
  createTraining: (payload: Record<string, unknown>) =>
    apiFetch<HRTraining>("/hr/training/", { method: "POST", body: JSON.stringify(payload) }),
  updateTraining: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HRTraining>(`/hr/training/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTraining: (id: string) =>
    apiFetch<void>(`/hr/training/${id}/`, { method: "DELETE" }),

  attendance: (opts?: ListOpts & { date?: string }) =>
    apiFetch<Paginated<HRAttendance> & { date: string; present_count: number }>(
      `/hr/attendance/${qs(opts)}`,
    ),
  upsertAttendance: (payload: Record<string, unknown>) =>
    apiFetch<HRAttendance>("/hr/attendance/", { method: "POST", body: JSON.stringify(payload) }),
  updateAttendance: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HRAttendance>(`/hr/attendance/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAttendance: (id: string) =>
    apiFetch<void>(`/hr/attendance/${id}/`, { method: "DELETE" }),

  leave: (opts?: ListOpts) => list<HRLeave>("/hr/leave/", opts),
  createLeave: (payload: Record<string, unknown>) =>
    apiFetch<HRLeave>("/hr/leave/", { method: "POST", body: JSON.stringify(payload) }),
  leaveAction: (id: string, action: "approve" | "reject", reason?: string) =>
    apiFetch<HRLeave>(`/hr/leave/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    }),
  deleteLeave: (id: string) => apiFetch<void>(`/hr/leave/${id}/`, { method: "DELETE" }),

  payroll: (opts?: ListOpts) => list<HRPayrollRun>("/hr/payroll/", opts),
  createPayroll: (period_month?: string) =>
    apiFetch<HRPayrollRun>("/hr/payroll/", {
      method: "POST",
      body: JSON.stringify({ period_month }),
    }),
  payrollDetail: (id: string) => apiFetch<HRPayrollRun>(`/hr/payroll/${id}/`),
  payrollAction: (id: string, action: "process" | "approve" | "pay") =>
    apiFetch<HRPayrollRun>(`/hr/payroll/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  updatePayrollLine: (id: string, payload: Record<string, unknown>) =>
    apiFetch<HRPayrollRun>(`/hr/payroll/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePayroll: (id: string) => apiFetch<void>(`/hr/payroll/${id}/`, { method: "DELETE" }),

  // Re-export recruitment helpers for one import surface
  vacancies: (scope?: "org" | "public") => companyApi.vacancies(scope),
  createVacancy: (payload: {
    title: string;
    description?: string;
    position?: string;
    position_id?: string;
    department?: string;
    publish?: boolean;
  }) => companyApi.createVacancy(payload),
  vacancyAction: (id: string, action: "publish" | "close") => companyApi.vacancyAction(id, action),
  applications: (opts?: { mine?: boolean; vacancy_id?: string }) => companyApi.applications(opts),
  reviewApplication: (id: string, payload: { stage: string; review_notes?: string }) =>
    companyApi.reviewApplication(id, payload),
};

export type { JobApplicant, JobVacancy };
