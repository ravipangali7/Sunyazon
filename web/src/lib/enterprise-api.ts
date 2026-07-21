/** Enterprise ERP API client — dynamic CRUD endpoints. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
  unread_count?: number;
};

export type MenuNode = {
  id: string;
  name: string;
  code: string;
  icon: string;
  route: string;
  display_order: number;
  children: MenuNode[];
  module?: string | null;
  required_action?: string;
};

export type TaskStatusRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  display_order: number;
  is_terminal: boolean;
  is_default: boolean;
  show_in_filter: boolean;
};

export type EnterpriseTask = {
  id: string;
  task_number: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  status_code: string;
  status_name: string;
  status_color: string;
  status_ref?: string | null;
  department?: string | null;
  department_name?: string;
  project?: string | null;
  project_name?: string;
  category?: string | null;
  category_name?: string;
  team?: string | null;
  assigned_to_user?: string | null;
  assigned_to_name?: string;
  assigned_by_name?: string;
  assignee_name?: string;
  start_date?: string | null;
  due_at?: string | null;
  estimated_hours?: number;
  actual_hours?: number;
  progress_pct?: number;
  checklist_json?: { text: string; done?: boolean }[];
  labels_data?: { id: string; name: string; color: string }[];
  comment_count?: number;
  attachment_count?: number;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DashboardCards = {
  total_tasks: number;
  completed: number;
  pending: number;
  in_progress: number;
  overdue: number;
  today_tasks: number;
  total_employees: number;
  notifications: number;
};

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return "";
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const enterpriseApi = {
  menus: () => apiFetch<{ results: MenuNode[] }>("/menus/"),
  taskStatuses: () => apiFetch<Paginated<TaskStatusRow> | TaskStatusRow[]>("/task-statuses/"),
  tasks: (params?: Record<string, string | number | undefined>) =>
    apiFetch<Paginated<EnterpriseTask>>(`/v2/tasks/${qs(params)}`),
  task: (id: string) => apiFetch<EnterpriseTask>(`/v2/tasks/${id}/`),
  createTask: (body: Record<string, unknown>) =>
    apiFetch<EnterpriseTask>("/v2/tasks/", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    apiFetch<EnterpriseTask>(`/v2/tasks/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTask: (id: string) => apiFetch(`/v2/tasks/${id}/`, { method: "DELETE" }),
  duplicateTask: (id: string) =>
    apiFetch<EnterpriseTask>(`/v2/tasks/${id}/duplicate/`, { method: "POST", body: "{}" }),
  archiveTask: (id: string) =>
    apiFetch<EnterpriseTask>(`/v2/tasks/${id}/archive/`, { method: "POST", body: "{}" }),
  restoreTask: (id: string) =>
    apiFetch<EnterpriseTask>(`/v2/tasks/${id}/restore/`, { method: "POST", body: "{}" }),
  taskComments: (id: string) =>
    apiFetch<{ results: unknown[] }>(`/v2/tasks/${id}/comments/`),
  addComment: (id: string, body: string, parent?: string) =>
    apiFetch(`/v2/tasks/${id}/comments/`, {
      method: "POST",
      body: JSON.stringify({ body, parent }),
    }),
  taskHistory: (id: string) =>
    apiFetch<{ results: unknown[] }>(`/v2/tasks/${id}/history/`),
  uploadAttachments: (id: string, files: FileList | File[]) => {
    const fd = new FormData();
    const list = Array.from(files as FileList);
    list.forEach((f) => fd.append("files", f));
    return apiFetch<{ results: unknown[] }>(`/v2/tasks/${id}/attachments/`, {
      method: "POST",
      body: fd,
    });
  },
  dashboard: () =>
    apiFetch<{ cards: DashboardCards; charts: { by_status: unknown[]; by_priority: unknown[] } }>(
      "/v2/dashboard/",
    ),
  todayMission: () => apiFetch<Record<string, unknown>>("/today-mission/"),
  search: (q: string) => apiFetch<{ results: SearchHit[]; query: string }>(`/search/${qs({ q })}`),
  notifications: () =>
    apiFetch<Paginated<{ id: string; title: string; body: string; is_read: boolean; type: string; created_at: string }>>(
      "/v2/notifications/",
    ),
  unreadCount: () => apiFetch<{ unread_count: number }>("/v2/notifications/unread_count/"),
  markRead: (id: string) =>
    apiFetch(`/v2/notifications/${id}/read/`, { method: "POST", body: "{}" }),
  markAllRead: () =>
    apiFetch("/v2/notifications/read_all/", { method: "POST", body: "{}" }),
  users: (params?: Record<string, string>) =>
    apiFetch<Paginated<Record<string, unknown>>>(`/users/${qs(params)}`),
  departments: () => apiFetch<Paginated<Record<string, unknown>>>("/departments/"),
  companies: () => apiFetch<Paginated<Record<string, unknown>>>("/companies/"),
  roles: () => apiFetch<Paginated<Record<string, unknown>>>("/roles/"),
  projects: () => apiFetch<Paginated<Record<string, unknown>>>("/projects/"),
  categories: () => apiFetch<Paginated<Record<string, unknown>>>("/task-categories/"),
  approvals: (params?: Record<string, string>) =>
    apiFetch<Paginated<Record<string, unknown>>>(`/approvals/${qs(params)}`),
  settings: () => apiFetch<Record<string, unknown>>("/settings/bulk/"),
  saveSettings: (data: Record<string, unknown>) =>
    apiFetch("/settings/bulk/", { method: "PUT", body: JSON.stringify(data) }),
  profile: () => apiFetch("/auth/profile/"),
  updateProfile: (body: Record<string, unknown>) =>
    apiFetch("/auth/profile/", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (current_password: string, new_password: string, new_password_confirm: string) =>
    apiFetch("/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password, new_password_confirm }),
    }),
  reports: (type: string, exportFmt?: string) =>
    apiFetch(`/reports/${qs({ type, export: exportFmt })}`),
};

export type SearchHit = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
};

export function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.results || [];
}
