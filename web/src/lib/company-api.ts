/** Company registration & HR recruitment API helpers. */

import { apiFetch, getToken } from "./api";

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
  "http://127.0.0.1:8000/api";

export type AccountTypeOption = {
  value: string;
  label: string;
  requires_company: boolean;
};

export type RegistrationModeOption = {
  value: string;
  label: string;
  fields: string[];
};

export type ShareholderInput = {
  full_name: string;
  share_units: number;
  percentage: number;
  is_default: boolean;
  notes?: string;
};

export type LeadershipSeat = {
  id: string;
  role_code: string;
  role_name: string;
  tier: string;
  reports_to_code: string;
  department_code: string;
  department_name: string;
  user_id: string | null;
  employee_id: string | null;
  is_filled: boolean;
  sort_order: number;
};

export type JobVacancy = {
  id: string;
  vacancy_code: string;
  title: string;
  description: string;
  status: string;
  open_date: string | null;
  close_date: string | null;
  organization_id: string;
  organization_name: string;
  position: string;
  position_id: string | null;
  applicant_count: number;
  applicants?: JobApplicant[];
};

export type JobApplicant = {
  id: string;
  vacancy_id: string;
  vacancy_title: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string;
  exp_years: number;
  cv_link: string;
  cover_letter: string;
  current_stage: string;
  review_notes: string;
  reviewed_at: string | null;
  applied_at: string | null;
};

export type GovernanceDocument = {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  content_html?: string;
  template_id?: string | null;
  version?: number;
  print_url?: string;
};

async function apiForm<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: form });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const body = data as { detail?: string; code?: string; errors?: Record<string, string[]> } | null;
    throw new Error(body?.detail || res.statusText || "Request failed");
  }
  return data as T;
}

export const companyApi = {
  options: () =>
    apiFetch<{
      account_types: AccountTypeOption[];
      registration_modes: RegistrationModeOption[];
      shareholder_fields: string[];
      leadership: {
        code: string;
        name: string;
        tier: string;
        reports_to_code: string;
        department_code: string;
        department_name: string;
      }[];
      document_templates: { id: string; name: string; doc_type: string }[];
    }>("/company/registration/options/"),

  status: () =>
    apiFetch<{
      organization: Record<string, unknown> | null;
      needs_registration: boolean;
    }>("/company/registration/"),

  lookup: (pan: string) =>
    apiFetch<{
      found: boolean;
      organization: {
        id: string;
        company_name: string;
        vat_pan_no: string;
        account_type: string;
        is_verified: boolean;
      } | null;
    }>(`/company/lookup/?pan=${encodeURIComponent(pan)}`),

  register: (payload: {
    account_type: string;
    registration_mode: string;
    company_name: string;
    pan_number?: string;
    total_capital?: number | string;
    address?: string;
    official_phone?: string;
    official_email?: string;
    shareholders?: ShareholderInput[];
    registration_certificate?: File | null;
    share_allocation?: File | null;
    documents?: File[];
  }) => {
    const form = new FormData();
    form.append("account_type", payload.account_type);
    form.append("registration_mode", payload.registration_mode);
    form.append("company_name", payload.company_name);
    if (payload.pan_number) form.append("pan_number", payload.pan_number);
    if (payload.total_capital != null) form.append("total_capital", String(payload.total_capital));
    if (payload.address) form.append("address", payload.address);
    if (payload.official_phone) form.append("official_phone", payload.official_phone);
    if (payload.official_email) form.append("official_email", payload.official_email);
    if (payload.shareholders) form.append("shareholders", JSON.stringify(payload.shareholders));
    if (payload.registration_certificate) {
      form.append("registration_certificate", payload.registration_certificate);
    }
    if (payload.share_allocation) {
      form.append("share_allocation", payload.share_allocation);
    }
    payload.documents?.forEach((f, i) => form.append(`document_${i}`, f));
    return apiForm<{ organization: Record<string, unknown>; user: unknown }>(
      "/company/registration/",
      form,
    );
  },

  leadership: () => apiFetch<{ results: LeadershipSeat[] }>("/company/leadership/"),
  shareholders: () =>
    apiFetch<{ results: ShareholderInput & { id: string }[] }>("/company/shareholders/"),

  governanceDocs: (docType?: string) =>
    apiFetch<{
      documents: GovernanceDocument[];
      templates: {
        id: string;
        name: string;
        doc_type: string;
        template_content: string;
        is_system_template: boolean;
      }[];
    }>(docType ? `/governance/documents/?doc_type=${docType}` : "/governance/documents/"),

  createGovernanceDoc: (payload: {
    doc_type: string;
    title?: string;
    template_id?: string;
    content_html?: string;
  }) =>
    apiFetch<GovernanceDocument>("/governance/documents/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateGovernanceDoc: (
    id: string,
    payload: {
      content_html?: string;
      title?: string;
      status?: string;
      template_id?: string;
      apply_template?: boolean;
    },
  ) =>
    apiFetch<GovernanceDocument>(`/governance/documents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  vacancies: (scope?: "org" | "public") =>
    apiFetch<{ results: JobVacancy[] }>(
      scope === "public" ? "/hr/vacancies/?scope=public" : "/hr/vacancies/",
    ).then((r) => r.results),

  createVacancy: (payload: {
    title: string;
    description?: string;
    position?: string;
    position_id?: string;
    department?: string;
    publish?: boolean;
  }) =>
    apiFetch<JobVacancy>("/hr/vacancies/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  vacancyAction: (id: string, action: "publish" | "close") =>
    apiFetch<JobVacancy>(`/hr/vacancies/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  applications: (opts?: { mine?: boolean; vacancy_id?: string }) => {
    const params = new URLSearchParams();
    if (opts?.mine) params.set("mine", "1");
    if (opts?.vacancy_id) params.set("vacancy_id", opts.vacancy_id);
    const q = params.toString();
    return apiFetch<{ results: JobApplicant[] }>(
      q ? `/hr/applications/?${q}` : "/hr/applications/",
    ).then((r) => r.results);
  },

  apply: (payload: {
    vacancy_id: string;
    cover_letter?: string;
    cv_link?: string;
    exp_years?: number;
  }) =>
    apiFetch<JobApplicant>("/hr/applications/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  reviewApplication: (
    id: string,
    payload: { stage: string; review_notes?: string },
  ) =>
    apiFetch<JobApplicant>(`/hr/applications/${id}/review/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
