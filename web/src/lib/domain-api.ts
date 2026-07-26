import { apiFetch } from "./api";
import type {
  Alert,
  Asset,
  Attendance,
  BatchRelease,
  Bill,
  DashboardData,
  Employee,
  GLEntry,
  GRN,
  Lead,
  PurchaseOrder,
  QCTest,
  Requisition,
  SalesOrder,
  StockItem,
  StockMovement,
  Task,
  Trip,
  WorkOrder,
  WorkRequest,
} from "./domain-types";
import type { ProcessDashboard } from "./process-types";

type List<T> = { results: T[] };

export const domainApi = {
  dashboard: () => apiFetch<DashboardData>("/dashboard/"),
  tasks: () => apiFetch<List<Task>>("/tasks/").then((r) => r.results),
  employees: () => apiFetch<List<Employee>>("/employees/").then((r) => r.results),
  attendance: (date?: string) =>
    apiFetch<List<Attendance> & { date: string }>(
      date ? `/attendance/?date=${date}` : "/attendance/",
    ).then((r) => r.results),
  workOrders: () => apiFetch<List<WorkOrder>>("/work-orders/").then((r) => r.results),
  workOrderAction: (id: string, action: string, extra: Record<string, unknown> = {}) =>
    apiFetch<{ ok: boolean; id: string; status: string }>(`/work-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),
  stock: () => apiFetch<List<StockItem>>("/stock/").then((r) => r.results),
  stockReorderPr: (itemId: string, qty?: number) =>
    apiFetch<Requisition>("/stock/reorder-pr/", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, qty }),
    }),
  stockMovements: () =>
    apiFetch<List<StockMovement>>("/stock-movements/").then((r) => r.results),
  materialIssue: (id: string) =>
    apiFetch<{ ok: boolean }>(`/stock/material-issues/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action: "issue" }),
    }),
  salesOrders: () => apiFetch<List<SalesOrder>>("/sales-orders/").then((r) => r.results),
  salesOrderAction: (id: string, action: "approve") =>
    apiFetch<{ ok: boolean; id: string; status: string }>(`/sales-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  salesByRegion: () =>
    apiFetch<{ results: { region: string; value: number }[] }>("/sales-by-region/").then(
      (r) => r.results,
    ),
  finance: () =>
    apiFetch<{
      gl_entries: GLEntry[];
      bills: Bill[];
      vat_summary: { vat_in: number; vat_out: number; payable: number; tax_year: string };
    }>("/finance/"),
  financeVoucherAction: (id: string, action: "post" | "reverse") =>
    apiFetch<{ ok: boolean }>(`/finance/vouchers/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  procurement: () =>
    apiFetch<{
      requisitions: Requisition[];
      purchase_orders: PurchaseOrder[];
      grns: GRN[];
      vendors?: unknown[];
      rfqs?: unknown[];
    }>("/procurement/"),
  procurementPrAction: (id: string, action: "submit" | "approve" | "reject", reason?: string) =>
    apiFetch<Requisition>(`/procurement/requisitions/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    }),
  procurementPoAction: (id: string, action: "approve" | "send" | "cancel") =>
    apiFetch<PurchaseOrder>(`/procurement/orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  procurementGrnAction: (id: string, action: "receive" | "post", warehouseId?: string) =>
    apiFetch<GRN>(`/procurement/grns/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, warehouse_id: warehouseId }),
    }),
  quality: () =>
    apiFetch<{
      qc_tests: QCTest[];
      batch_releases: BatchRelease[];
      incoming?: unknown[];
      lab_reports?: unknown[];
      ncrs?: unknown[];
      capas?: unknown[];
      masters?: unknown[];
    }>("/quality/"),
  qualityQcAction: (id: string, status: "pass" | "fail" | "hold" | "pending") =>
    apiFetch<{ ok: boolean; status: string }>(`/quality/ipqc/${id}/`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  qualityReleaseAction: (id: string, releaseStatus: "held" | "released" | "rejected") =>
    apiFetch<{ ok: boolean; release_status?: string }>(`/quality/releases/${id}/`, {
      method: "POST",
      body: JSON.stringify({ release_status: releaseStatus }),
    }),
  qualityIncomingAction: (id: string, status: "pass" | "fail" | "hold") =>
    apiFetch<{ ok: boolean; status?: string }>(`/quality/incoming/${id}/`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  qualityNcrCreate: (issue: string, createCapa?: boolean) =>
    apiFetch<{ ok: boolean; id: string }>("/quality/ncrs/", {
      method: "POST",
      body: JSON.stringify({ issue, create_capa: createCapa }),
    }),
  qualityCapaClose: (id: string) =>
    apiFetch<{ ok: boolean }>(`/quality/capas/${id}/`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close" }),
    }),
  crm: () =>
    apiFetch<{ leads: Lead[]; pipeline_stages: string[] }>("/crm/"),
  crmDealAction: (id: string, action: "won" | "lost", notes?: string) =>
    apiFetch<{ ok: boolean; stage: string }>(`/crm/deals/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, notes }),
    }),
  maintenance: () =>
    apiFetch<{ assets: Asset[]; work_requests: WorkRequest[] }>("/maintenance/"),
  maintenanceWoAction: (id: string, action: "close") =>
    apiFetch<{ ok: boolean; status: string }>(`/maintenance/work-orders/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  logistics: () => apiFetch<{ trips: Trip[] }>("/logistics/").then((r) => r.trips),
  logisticsDispatchAction: (
    id: string,
    action: "load" | "dispatch" | "pod" | "cancel",
    extra: Record<string, unknown> = {},
  ) =>
    apiFetch<{ ok: boolean; status: string }>(`/logistics/dispatches/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),
  notifications: () => apiFetch<List<Alert>>("/notifications/").then((r) => r.results),
  notificationMarkRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/notifications/${id}/read/`, {
      method: "POST",
      body: "{}",
    }),
  notificationMarkAllRead: () =>
    apiFetch<{ ok: boolean }>("/notifications/read-all/", {
      method: "POST",
      body: "{}",
    }),
  commerce: () =>
    apiFetch<{
      products: {
        id: string;
        sku: string;
        name: string;
        brand: string;
        price: number;
        stock: number;
        rating: number;
        sold_30d: number;
        status: string;
      }[];
      orders: {
        id: string;
        customer: string;
        items: number;
        total: number;
        channel: string;
        status: string;
        time: string;
      }[];
      kpi: { gmv_30d: number; orders_30d: number; aov: number; rating: number };
    }>("/commerce/"),
  feed: () =>
    apiFetch<
      List<{ id: string; author: string; body: string; likes: number; comments: number; created_at: string }>
    >("/feed/").then((r) => r.results),
  feedEngage: (id: string, type: "like" | "comment" | "share" | "save", commentText?: string) =>
    apiFetch<{ ok: boolean; likes?: number; comments?: number; liked?: boolean }>(
      `/feed/${id}/engage/`,
      {
        method: "POST",
        body: JSON.stringify({ type, comment_text: commentText }),
      },
    ),
  feedPublish: (body: string, title?: string) =>
    apiFetch<{ ok: boolean; id: string }>("/feed/publish/", {
      method: "POST",
      body: JSON.stringify({ body, title, post_type: "thought" }),
    }),
  chat: () =>
    apiFetch<{ threads: { id: string; title: string; preview: string; unread: number }[] }>(
      "/chat/",
    ).then((r) => r.threads),
  chatMessages: (threadId: string) =>
    apiFetch<
      List<{ id: string; sender: string; body: string; mine: boolean; created_at: string }>
    >(`/chat/${threadId}/messages/`).then((r) => r.results),
  chatSend: (threadId: string, body: string) =>
    apiFetch<{ id: string; sender: string; body: string; mine: boolean; created_at: string }>(
      `/chat/${threadId}/messages/`,
      { method: "POST", body: JSON.stringify({ body }) },
    ),
  admin: () =>
    apiFetch<{
      roles: { id: string; name: string; kind: string; is_system: boolean }[];
      modules: { code: string; name: string; category: string; route_path: string }[];
      matrix: {
        role: string;
        module: string;
        can_view: boolean;
        can_create: boolean;
        can_edit: boolean;
        can_delete: boolean;
      }[];
      forms: { id: string; name: string; object_code: string }[];
      workflows: { id: string; name: string; version: number }[];
    }>("/admin-console/"),
  process: (definitionId?: string | null) => {
    const q = definitionId ? `?definition_id=${encodeURIComponent(definitionId)}` : "";
    return apiFetch<ProcessDashboard>(`/process/${q}`);
  },
  processAction: (payload: Record<string, unknown>) =>
    apiFetch<{
      ok: boolean;
      action: string;
      definition_id?: string | null;
      dashboard?: ProcessDashboard;
      work_order_id?: string;
      run_id?: string | null;
      detail?: string;
    }>("/process/action/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  media: () =>
    apiFetch<{
      live: { id: string; title: string; status: string; viewers: number }[];
      videos: { id: string; title: string; duration: number; type: string }[];
    }>("/media/"),
  payments: () =>
    apiFetch<{
      transactions: {
        id: string;
        ref: string;
        amount: number;
        status: string;
        gateway: string;
        created_at: string;
      }[];
      campaigns: { id: string; name: string; budget: number; status: string }[];
      kpi: { settled: number; pending: number; count: number };
    }>("/payments/"),
  governance: () =>
    apiFetch<{
      organization: {
        id: string;
        company_name: string;
        registration_mode: string;
        vat_pan_no: string | null;
        managing_director_name: string;
      } | null;
      board: { id: string; title: string; status: string; signed_at: string | null }[];
      meetings: { id: string; title: string; scheduled_at: string | null; status: string }[];
      resolutions: { id: string; title: string; status: string; signed_at: string | null }[];
      leadership: {
        id: string;
        role_code: string;
        role_name: string;
        tier: string;
        reports_to_code: string;
        is_filled: boolean;
      }[];
      shareholders: {
        id: string;
        full_name: string;
        share_units: number;
        percentage: number;
        is_default: boolean;
      }[];
      documents: {
        id: string;
        title: string;
        doc_type: string;
        status: string;
        print_url?: string;
      }[];
    }>("/governance/"),
  audit: () =>
    apiFetch<List<{ id: string; action: string; actor: string; object: string; created_at: string }>>(
      "/audit/",
    ).then((r) => r.results),
  authKyc: () =>
    apiFetch<{
      kycs: { id: string; user: string; doc_type: string; status: string; created_at: string }[];
      sessions: { id: string; device: string; ip: string; expires_at: string }[];
    }>("/auth-kyc/"),
  authKycVerify: (id: string, approved: boolean, rejectionReason?: string) =>
    apiFetch<{ ok: boolean; status: string }>(`/auth-kyc/${id}/verify/`, {
      method: "POST",
      body: JSON.stringify({ approved, rejection_reason: rejectionReason }),
    }),
  it: () =>
    apiFetch<{
      tickets: { id: string; subject: string; status: string; priority: string; created_at: string }[];
      initiatives: unknown[];
      services: unknown[];
    }>("/it/"),
  docs: () =>
    apiFetch<{
      documents: { id: string; title: string; type: string; updated_at: string | null }[];
      templates: { id: string; name: string }[];
    }>("/docs/"),
  customer: () =>
    apiFetch<{
      orders: {
        id: string;
        customer: string;
        items: number;
        total: number;
        channel: string;
        status: string;
        time: string;
      }[];
      addresses: { id: string; label: string; line: string; city: string }[];
      loyalty: { tier: string; spend: number };
    }>("/customer/"),
  rnd: () =>
    apiFetch<{ projects: { id: string; name: string; status: string; stage: string }[] }>("/rnd/").then(
      (r) => r.projects,
    ),
};
