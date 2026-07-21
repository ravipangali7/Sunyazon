/** Process Engine dashboard types — mirrored from process_dashboard_service. */

export type ProcessOption = { value: string; label: string };

export type ProcessFieldSchema = {
  key: string;
  label: string;
  required?: boolean;
};

export type ProcessMenu = {
  id: string;
  name: string;
  code: string;
  icon: string;
  route: string;
  hash: string;
  display_order: number;
  module_code?: string | null;
  required_action?: string;
  children: ProcessMenu[];
};

export type ProcessModule = {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  route_path: string;
  category?: string;
  access_level?: string;
  actions?: Record<string, boolean>;
};

export type ProcessStageField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options_json?: unknown;
  validation_json?: unknown;
  default_value?: string;
  sort_order: number;
  show_on_dashboard?: boolean;
  stage_id?: string;
  stage_name?: string;
  process_id?: string;
  process_name?: string;
};

export type ProcessStage = {
  id: string;
  process_id: string;
  code: string;
  name: string;
  sequence: number;
  sort_order: number;
  stage_type: string;
  is_optional: boolean;
  requires_previous_complete: boolean;
  allow_parallel: boolean;
  default_assignee_role: string;
  sla_hours: number | null;
  estimated_time: number | null;
  color: string;
  icon: string;
  ui_config_json: Record<string, unknown>;
  connections: {
    requires_previous_complete: boolean;
    allow_parallel: boolean;
    is_optional: boolean;
    flow_mode: string;
  };
  fields: ProcessStageField[];
  field_count: number;
  requires_approval: boolean;
  created_at?: string | null;
};

export type ProcessTemplate = {
  id: string;
  name: string;
  code: string;
  family_code?: string;
  description?: string;
  status: string;
  version: number;
  output_type?: string;
  industry: string;
  industry_code?: string;
  industry_template_id?: string | null;
  created_by: string;
  created_at?: string | null;
  updated_at?: string | null;
  stage_count: number;
  last_published_version: number | null;
  active_version: number | null;
  total_runs: number;
};

export type ProcessDefinition = ProcessTemplate & {
  stages: ProcessStage[];
  workflow_definition_id?: string | null;
  workflow_name?: string;
  form_metadata_id?: string | null;
};

export type IndustryTemplate = {
  id: string;
  code: string;
  name: string;
  description: string;
  default_capabilities: string[];
  default_stages_json: unknown[];
  default_fields_json: Record<string, unknown>;
  stage_count: number;
  is_system: boolean;
  is_active: boolean;
};

export type ProcessWorkOrder = {
  id: string;
  order_number: string;
  wo_no: string;
  title: string;
  template_id?: string | null;
  template: string;
  template_code: string;
  current_stage: string;
  assigned_user: string;
  progress: number;
  completion_pct: number;
  priority: string;
  status: string;
  batch_no: string;
  customer: string;
  due_date?: string | null;
  created_date?: string | null;
  department?: string;
};

export type ProcessRun = {
  id: string;
  run_id: string;
  run_no: string;
  template_id: string;
  template: string;
  template_code: string;
  work_order: string;
  started_by: string;
  current_stage: string;
  completed_stages: number;
  pending_stages: number;
  total_stages: number;
  total_progress: number;
  progress: number;
  status: string;
  duration: string;
  started_time?: string | null;
  finished_time?: string | null;
  created_at?: string | null;
  stages: {
    id: string;
    stage_id: string;
    name: string;
    status: string;
    sort_order: number;
    team: string;
    member: string;
    parent_run_stage_id?: string | null;
  }[];
};

export type ProcessCanvas = {
  template_id: string | null;
  template_name: string;
  template_code: string;
  status: string;
  version: number | null;
  stages: ProcessStage[];
  connections: {
    id: string;
    from_stage_id: string;
    to_stage_id: string;
    type: string;
    requires_previous_complete: boolean;
  }[];
};

export type ProcessDashboard = {
  company: {
    id: string;
    name: string;
    org_type: string;
    org_type_label: string;
    account_type: string;
    account_type_label: string;
    industry_template_code?: string;
  } | null;
  department: ProcessModule | null;
  module: ProcessModule | null;
  hr_department?: { id: string; name: string; code: string } | null;
  role: {
    name: string | null;
    kind: string;
    designation: string;
    account_type: string;
    portal: string;
  };
  permissions: Record<string, boolean>;
  menus: ProcessMenu[];
  modules: ProcessModule[];
  search_resources: { key: string; label: string; route: string; module: string }[];
  notifications: { unread_count: number };
  statistics: Record<string, number>;
  industries: IndustryTemplate[];
  industry_templates: IndustryTemplate[];
  definitions: ProcessDefinition[];
  templates: ProcessTemplate[];
  stages: { id: string; process_id: string; name: string; sequence: number; stage_type?: string; code?: string }[];
  stage_fields: ProcessStageField[];
  work_orders: ProcessWorkOrder[];
  process_runs: ProcessRun[];
  canvas: ProcessCanvas;
  selected_template_id: string | null;
  options: {
    statuses: ProcessOption[];
    output_types: ProcessOption[];
    stage_types: ProcessOption[];
    field_types: ProcessOption[];
    wo_priorities: ProcessOption[];
    wo_statuses: ProcessOption[];
    run_statuses: ProcessOption[];
    customers: { id: string; name: string; party_type?: string }[];
    batches: { id: string; batch_no: string; status: string }[];
    teams: { id: string; name: string; department?: string }[];
    definition_fields: ProcessFieldSchema[];
    instantiate_fields: ProcessFieldSchema[];
    gaps: { feature: string; detail: string }[];
  };
  meta: {
    title: string;
    subtitle: string;
    company_name?: string | null;
    module_name?: string;
    department_name?: string;
    role_label?: string;
  };
  field_schema: {
    definition: ProcessFieldSchema[];
    instantiate: ProcessFieldSchema[];
    statuses: ProcessOption[];
    output_types: ProcessOption[];
    stage_types: ProcessOption[];
    field_types: ProcessOption[];
  };
};

export type ProcessAction =
  | "create"
  | "duplicate"
  | "save_version"
  | "archive"
  | "publish"
  | "delete"
  | "reorder_stages"
  | "instantiate"
  | "install_industry"
  | "update";
