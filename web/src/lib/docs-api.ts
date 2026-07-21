/** Documents portal API — overview, library documents, templates. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type Choice = { value: string; label: string };

export type DocsOverview = {
  total_documents: number;
  draft_count: number;
  published_count: number;
  archived_count: number;
  templates_count: number;
  system_templates_count: number;
  org_templates_count: number;
  published_this_month: number;
  by_status: { name: string; code: string; value: number }[];
  by_doc_type: { name: string; code: string; value: number }[];
  recent_documents: DocsDocument[];
};

export type DocsOptions = {
  doc_types: Choice[];
  statuses: Choice[];
  template_doc_types: Choice[];
  templates: { id: string; name: string; doc_type: string }[];
};

export type DocsDocument = {
  id: string;
  organization_id: string | null;
  owner_id: string | null;
  owner_name: string;
  doc_type: string;
  title: string;
  content_html: string;
  file: string | null;
  template_id: string | null;
  template_name: string;
  version: number;
  status: string;
  entity_type: string;
  entity_id: string | null;
  created_by_id: string | null;
  created_by_name: string;
  published_at: string;
  created_at: string;
};

export type DocsTemplate = {
  id: string;
  organization_id: string | null;
  name: string;
  doc_type: string;
  template_content: string;
  is_system_template: boolean;
};

type ListParams = {
  search?: string;
  status?: string;
  doc_type?: string;
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

export const docsApi = {
  overview: () => apiFetch<DocsOverview>("/docs/overview/"),
  options: () => apiFetch<DocsOptions>("/docs/options/"),

  documents: (params: ListParams = {}) =>
    apiFetch<Paginated<DocsDocument>>(`/docs/documents/${qs(params)}`),
  createDocument: (body: Record<string, unknown>) =>
    apiFetch<DocsDocument>("/docs/documents/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getDocument: (id: string) => apiFetch<DocsDocument>(`/docs/documents/${id}/`),
  updateDocument: (id: string, body: Record<string, unknown>) =>
    apiFetch<DocsDocument>(`/docs/documents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDocument: (id: string) =>
    apiFetch<{ ok: boolean }>(`/docs/documents/${id}/`, { method: "DELETE" }),
  docAction: (id: string, action: "publish" | "archive" | "draft") =>
    apiFetch<DocsDocument>(`/docs/documents/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  templates: (params: ListParams = {}) =>
    apiFetch<Paginated<DocsTemplate>>(`/docs/templates/${qs(params)}`),
  createTemplate: (body: Record<string, unknown>) =>
    apiFetch<DocsTemplate>("/docs/templates/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getTemplate: (id: string) => apiFetch<DocsTemplate>(`/docs/templates/${id}/`),
  updateTemplate: (id: string, body: Record<string, unknown>) =>
    apiFetch<DocsTemplate>(`/docs/templates/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTemplate: (id: string) =>
    apiFetch<{ ok: boolean }>(`/docs/templates/${id}/`, { method: "DELETE" }),
};
