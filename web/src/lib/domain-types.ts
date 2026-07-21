/** Domain types for live BEOS API responses. */

export type Task = {
  id: string;
  tenant_id: string;
  org_id: string;
  assignee_id: string;
  assignee_name: string;
  workflow_instance_id: string | null;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  due_at: string;
  status:
    | "new"
    | "assigned"
    | "accepted"
    | "in_progress"
    | "pending_approval"
    | "completed"
    | "verified"
    | "closed";
  checklist_json: { label: string; done: boolean }[];
  evidence_urls: string[];
  created_at: string;
  module: string;
};

export type Employee = {
  id: string;
  employee_code: string;
  full_name: string;
  designation: string;
  department_id: string;
  department_name: string;
  branch_name: string;
  employment_type: string;
  join_date: string;
  status: string;
  email: string;
  phone: string;
  reporting_to: string | null;
};

export type Attendance = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  work_hours: number;
};

export type WorkOrder = {
  id: string;
  wo_code: string;
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
};

export type StockItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  on_hand: number;
  reserved: number;
  reorder_level: number;
  warehouse: string;
  batch_no: string;
  expiry_date: string | null;
};

export type SalesOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  dealer_code: string;
  brand: string;
  product: string;
  qty: number;
  uom: string;
  unit_price: number;
  total: number;
  order_date: string;
  delivery_date: string;
  status: string;
  route: string;
  sales_rep: string;
  payment_terms: string;
};

export type GLEntry = {
  id: string;
  voucher_no: string;
  date: string;
  account: string;
  debit: number;
  credit: number;
  narrative: string;
  module: string;
};

export type Bill = {
  id: string;
  bill_no: string;
  vendor: string;
  amount: number;
  due_date: string;
  status: string;
};

export type Requisition = {
  id: string;
  pr_no: string;
  requested_by: string;
  department: string;
  item: string;
  qty: number;
  uom: string;
  need_by: string;
  status: string;
};

export type PurchaseOrder = {
  id: string;
  po_no: string;
  vendor: string;
  item: string;
  qty: number;
  uom: string;
  unit_price: number;
  total: number;
  order_date: string;
  delivery_date: string;
  status: string;
};

export type GRN = {
  id: string;
  grn_no: string;
  po_no: string;
  vendor: string;
  item: string;
  qty: number;
  uom: string;
  received_date: string;
  qc_status: string;
};

export type QCTest = {
  id: string;
  batch_no: string;
  product: string;
  brand: string;
  test: string;
  parameter: string;
  result: string;
  spec_min: string;
  spec_max: string;
  status: string;
  tested_by: string;
  tested_at: string;
};

export type BatchRelease = {
  id: string;
  batch_no: string;
  product: string;
  brand: string;
  status: string;
  qa_manager: string;
  release_date: string | null;
  coa_no: string | null;
};

export type Lead = {
  id: string;
  lead_code: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  value: number;
  assigned_to: string;
  last_activity: string;
};

export type Asset = {
  id: string;
  asset_code: string;
  name: string;
  location: string;
  status: string;
  last_service: string;
  next_service: string;
};

export type WorkRequest = {
  id: string;
  wr_no: string;
  asset_code: string;
  title: string;
  priority: string;
  status: string;
  requested_by: string;
  created_at: string;
};

export type Trip = {
  id: string;
  trip_no: string;
  vehicle_no: string;
  driver: string;
  route: string;
  status: string;
  stops: number;
  delivered: number;
  eta: string;
};

export type StockMovement = {
  id: string;
  doc_no: string;
  type: string;
  sku: string;
  item: string;
  qty: number;
  uom: string;
  warehouse: string;
  date: string;
  ref: string;
};

export type Alert = {
  id: string;
  severity: "critical" | "warning" | "info" | string;
  title: string;
  meta: string;
  is_read?: boolean;
  created_at?: string;
};

export type DashboardData = {
  kpi: {
    revenue_today: number;
    revenue_yesterday: number;
    orders_open: number;
    units_produced_today: number;
    otif_pct: number;
    qa_reject_pct: number;
    attendance_pct: number;
    ap_overdue: number;
    active_workflows: number;
    pending_approvals: number;
  };
  revenue_trend: { day: string; value: number }[];
  production_by_line: { line: string; planned: number; actual: number }[];
  brand_mix: { name: string; value: number }[];
  alerts: Alert[];
  mission: { title: string; subtitle: string; task_id: string } | null;
};

export const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
