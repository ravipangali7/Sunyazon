import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search, FileText, BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  docsApi,
  type DocsDocument,
  type DocsOptions,
  type DocsTemplate,
} from "@/lib/docs-api";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — Sunyazon BEOS" },
      {
        name: "description",
        content: "Knowledge base: SOPs, templates, document library and publishing.",
      },
    ],
  }),
  component: DocsPage,
});

type Section = "overview" | "templates" | "library";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "templates", "library"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Documentation", subtitle: "docs.overview · templates · library" },
  templates: { title: "Templates", subtitle: "docs.document_template" },
  library: { title: "Document Library", subtitle: "docs.document" },
};

const inputCls =
  "h-10 w-full rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50";
const btnPrimary = {
  backgroundColor: "var(--color-primary)",
  color: "var(--color-primary-foreground)",
} as const;

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function DocsPage() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{flash}</div>
      )}
      {section === "overview" && <OverviewSection />}
      {section === "templates" && <TemplatesSection onFlash={setFlash} />}
      {section === "library" && <LibrarySection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["docs", "overview"],
    queryFn: docsApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const statusData = kpi?.by_status?.length ? kpi.by_status : [];
  const typeData = kpi?.by_doc_type?.length ? kpi.by_doc_type : [];

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load documentation from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Documents" value={kpi?.total_documents ?? 0} sub="in library" />
        <Mini label="Published" value={kpi?.published_count ?? 0} sub={`${kpi?.draft_count ?? 0} drafts`} />
        <Mini label="Templates" value={kpi?.templates_count ?? 0} sub={`${kpi?.system_templates_count ?? 0} system`} />
        <Mini label="This month" value={kpi?.published_this_month ?? 0} sub="published" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">By status</div>
          {statusData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No documents yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {statusData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "published"
                            ? "var(--color-success)"
                            : s.code === "archived"
                              ? "var(--color-muted-foreground)"
                              : chartSeries[i % chartSeries.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Recent documents</div>
          </div>
          {(kpi?.recent_documents || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No documents in the library yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {(kpi?.recent_documents || []).map((row) => (
                <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{row.title}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {row.doc_type.replace(/_/g, " ")} · {fmtDate(row.created_at)}
                      {row.created_by_name ? ` · ${row.created_by_name}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {typeData.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">By document type</div>
          <div className="flex flex-wrap gap-2">
            {typeData.map((t) => (
              <div
                key={t.code}
                className="rounded-xl bg-secondary px-3 py-2 text-sm"
              >
                <span className="font-semibold tabular-nums mr-2">{t.value}</span>
                <span className="text-muted-foreground">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </QueryState>
  );
}

/* ── Library ──────────────────────────────────────────────────────────────── */

function LibrarySection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [docType, setDocType] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DocsDocument | null>(null);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["docs", "options"], queryFn: docsApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["docs", "documents", search, status, docType, page],
    queryFn: () =>
      docsApi.documents({
        search,
        status: status || undefined,
        doc_type: docType || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["docs"] });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "publish" | "archive" | "draft" }) =>
      docsApi.docAction(id, act),
    onSuccess: (_d, vars) => {
      onFlash(
        vars.act === "publish"
          ? "Document published."
          : vars.act === "archive"
            ? "Document archived."
            : "Document set to draft.",
      );
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => docsApi.deleteDocument(id),
    onSuccess: () => {
      onFlash("Document deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search title or content…"
      filters={
        <>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(options.data?.statuses || []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {(options.data?.doc_types || []).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Document
        </button>
      }
    >
      {showForm && options.data && (
        <DocumentForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      {editing && options.data && (
        <DocumentForm
          options={options.data}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Title", "Type", "Version", "Owner", "Created", "Status", "Actions"]}
          rows={(q.data?.results || []).map((row: DocsDocument) => [
            <div key="t" className="min-w-[160px]">
              <div className="font-semibold">{row.title}</div>
              {row.template_name ? (
                <div className="text-[11px] text-muted-foreground">Template: {row.template_name}</div>
              ) : null}
            </div>,
            <span key="dt" className="capitalize text-xs">
              {row.doc_type.replace(/_/g, " ")}
            </span>,
            `v${row.version}`,
            row.owner_name || row.created_by_name || "—",
            fmtDate(row.created_at),
            <StatusBadge key="s" status={row.status} />,
            <div key="a" className="flex flex-wrap gap-1">
              {row.status !== "published" && (
                <ActionBtn
                  label="Publish"
                  onClick={() => action.mutate({ id: row.id, act: "publish" })}
                  disabled={action.isPending}
                />
              )}
              {row.status !== "archived" && (
                <ActionBtn
                  label="Archive"
                  onClick={() => action.mutate({ id: row.id, act: "archive" })}
                  disabled={action.isPending}
                />
              )}
              <ActionBtn label="Edit" onClick={() => setEditing(row)} />
              <ActionBtn
                label="Delete"
                danger
                onClick={() => {
                  if (window.confirm(`Delete “${row.title}”?`)) remove.mutate(row.id);
                }}
                disabled={remove.isPending}
              />
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function DocumentForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: DocsOptions;
  initial?: DocsDocument;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    doc_type: initial?.doc_type || "custom",
    template_id: initial?.template_id || "",
    content_html: initial?.content_html || "",
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        doc_type: form.doc_type,
        template_id: form.template_id || null,
        content_html: form.content_html,
      };
      if (initial) return docsApi.updateDocument(initial.id, body);
      return docsApi.createDocument(body);
    },
    onSuccess: () => onSaved(initial ? "Document updated." : "Document created."),
    onError: (e: Error) => onSaved(e.message),
  });

  const onTemplateChange = (templateId: string) => {
    setForm((prev) => ({ ...prev, template_id: templateId }));
  };

  return (
    <Modal title={initial ? "Edit document" : "New document"} onClose={onClose}>
      <Field label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Document type *">
        <select
          className={inputCls}
          value={form.doc_type}
          onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
        >
          {options.doc_types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Template (optional)">
        <select
          className={inputCls}
          value={form.template_id}
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="">None</option>
          {options.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.doc_type})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Content (HTML)">
        <textarea
          className={`${inputCls} h-40 py-2 font-mono text-xs`}
          value={form.content_html}
          onChange={(e) => setForm({ ...form, content_html: e.target.value })}
          placeholder="Optional — leave blank to use selected template content on create"
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.title.trim()}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Templates ────────────────────────────────────────────────────────────── */

function TemplatesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DocsTemplate | null>(null);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["docs", "options"], queryFn: docsApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["docs", "templates", search, docType, page],
    queryFn: () =>
      docsApi.templates({
        search,
        doc_type: docType || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["docs"] });

  const remove = useMutation({
    mutationFn: (id: string) => docsApi.deleteTemplate(id),
    onSuccess: () => {
      onFlash("Template deleted.");
      invalidate();
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search templates…"
      filters={
        <select
          className={inputCls}
          value={docType}
          onChange={(e) => {
            setDocType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {(options.data?.template_doc_types || []).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Template
        </button>
      }
    >
      {showForm && options.data && (
        <TemplateForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      {editing && options.data && (
        <TemplateForm
          options={options.data}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onFlash(msg);
            invalidate();
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Name", "Type", "Scope", "Actions"]}
          rows={(q.data?.results || []).map((row: DocsTemplate) => [
            <div key="n" className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold">{row.name}</span>
            </div>,
            <span key="t" className="capitalize text-xs">
              {row.doc_type.replace(/_/g, " ")}
            </span>,
            row.is_system_template || !row.organization_id ? "System" : "Organization",
            <div key="a" className="flex flex-wrap gap-1">
              {!row.is_system_template && row.organization_id ? (
                <>
                  <ActionBtn label="Edit" onClick={() => setEditing(row)} />
                  <ActionBtn
                    label="Delete"
                    danger
                    onClick={() => {
                      if (window.confirm(`Delete template “${row.name}”?`)) remove.mutate(row.id);
                    }}
                    disabled={remove.isPending}
                  />
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Read-only</span>
              )}
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function TemplateForm({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: DocsOptions;
  initial?: DocsTemplate;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    doc_type: initial?.doc_type || "custom",
    template_content: initial?.template_content || "",
  });

  const save = useMutation({
    mutationFn: () => {
      if (initial) return docsApi.updateTemplate(initial.id, form);
      return docsApi.createTemplate(form);
    },
    onSuccess: () => onSaved(initial ? "Template updated." : "Template created."),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <Modal title={initial ? "Edit template" : "New template"} onClose={onClose}>
      <Field label="Name *">
        <input
          className={inputCls}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Document type *">
        <select
          className={inputCls}
          value={form.doc_type}
          onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
        >
          {(options.template_doc_types || options.doc_types).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Template content">
        <textarea
          className={`${inputCls} h-40 py-2 font-mono text-xs`}
          value={form.template_content}
          onChange={(e) => setForm({ ...form, template_content: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={save.isPending}
        disabled={!form.name.trim()}
        onClose={onClose}
        onSave={() => save.mutate()}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load documentation from the database.
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionLayout({
  search,
  onSearch,
  placeholder,
  filters,
  form,
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  filters?: React.ReactNode;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {(onSearch || filters || form) && (
        <div className="flex flex-wrap gap-2 items-center">
          {onSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className={`${inputCls} pl-9`}
                placeholder={placeholder || "Search…"}
                value={search || ""}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
          {filters}
          {form}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">{children}</div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty = "No records yet.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  meta,
  onPage,
}: {
  meta?: { page: number; total_pages: number; count: number } | null;
  onPage?: (page: number) => void;
}) {
  if (!meta || meta.total_pages <= 1) {
    return meta ? (
      <div className="p-3 text-[11px] text-muted-foreground border-t border-border">
        {meta.count} records
      </div>
    ) : null;
  }
  return (
    <div className="p-3 text-[11px] text-muted-foreground border-t border-border flex items-center justify-between gap-2">
      <span>
        Page {meta.page} of {meta.total_pages} · {meta.count} records
      </span>
      {onPage && (
        <div className="flex gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page >= meta.total_pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function ModalActions({
  pending,
  disabled,
  onClose,
  onSave,
}: {
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 mt-2">
      <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-sm border border-border">
        Cancel
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onSave}
        className="h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={btnPrimary}
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 px-3 rounded-md text-[11px] font-semibold border border-border disabled:opacity-50"
      style={danger ? { color: "var(--color-danger)" } : { color: "var(--color-primary)" }}
    >
      {label}
    </button>
  );
}
