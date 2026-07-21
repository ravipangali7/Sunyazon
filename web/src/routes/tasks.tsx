import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare, Square, Paperclip, Clock, X, ChevronLeft, Plus, Copy, Archive,
  Trash2, MessageSquare, History, Filter,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, PriorityBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import {
  useEnterpriseTasks,
  useTaskStatuses,
  useTaskMutations,
  type EnterpriseTask,
} from "@/hooks/use-enterprise";
import { enterpriseApi } from "@/lib/enterprise-api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks & Approvals — Sunyazon BEOS" },
      { name: "description", content: "Workflow inbox for pending tasks, approvals and verifications." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { can } = useAuth();
  const { data: statuses = [] } = useTaskStatuses();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const filters = useMemo(() => ({
    status: statusFilter === "all" ? undefined : statusFilter,
    priority: priorityFilter || undefined,
    search: search || undefined,
  }), [statusFilter, priorityFilter, search]);

  const { data: tasks = [], isLoading, isError, error, refetch } = useEnterpriseTasks(filters);
  const mutations = useTaskMutations();
  const [selected, setSelected] = useState<EnterpriseTask | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!selected && tasks.length) setSelected(tasks[0]);
    if (selected && !tasks.find((t) => t.id === selected.id)) {
      setSelected(tasks[0] || null);
    }
  }, [tasks, selected]);

  const filterTabs = useMemo(() => {
    const tabs = [{ code: "all", name: "All", color: "#6B7280" }];
    for (const s of statuses) {
      tabs.push({ code: s.code, name: s.name, color: s.color });
    }
    return tabs;
  }, [statuses]);

  return (
    <AppShell
      title="Tasks & Approvals"
      subtitle="Dynamic workflow inbox"
      actions={
        can("tasks", "create") ? (
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          >
            <Plus className="h-3.5 w-3.5" /> New Task
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
          {filterTabs.map((f) => (
            <button
              key={f.code}
              onClick={() => setStatusFilter(f.code)}
              className="h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
              style={
                statusFilter === f.code
                  ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }
                  : { backgroundColor: "var(--color-secondary)", color: "var(--color-foreground)" }
              }
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-border bg-card text-xs"
          >
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!tasks.length}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-3">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelected(t); setMobileOpen(true); }}
                className={`w-full text-left rounded-2xl bg-card border p-4 transition-colors ${
                  selected?.id === t.id ? "lg:border-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${t.status_color || "var(--color-primary)"}22`, color: t.status_color || "var(--color-primary)" }}>
                    {t.status_code === "completed" ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground">{t.task_number || t.id.slice(0, 8)}</span>
                      {t.category_name ? <Tag>{t.category_name}</Tag> : null}
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <div className="mt-1 text-sm font-semibold">{t.title}</div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> due {fmtDateTime(t.due_at)}</span>
                      <span>· {t.assigned_to_name || t.assignee_name || "Unassigned"}</span>
                      {(t.attachment_count || 0) > 0 && (
                        <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{t.attachment_count}</span>
                      )}
                      {(t.comment_count || 0) > 0 && (
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.comment_count}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={t.status_name || t.status_code} />
                </div>
              </button>
            ))}
          </div>

          <div className="hidden lg:block lg:col-span-2 lg:sticky lg:top-20 self-start">
            {selected && (
              <TaskDetail
                t={selected}
                statuses={statuses}
                mutations={mutations}
                onRefresh={() => void refetch()}
                onDeleted={() => { setSelected(null); void refetch(); }}
              />
            )}
          </div>
        </div>

        {mobileOpen && selected && (
          <div className="lg:hidden fixed inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-right duration-200">
            <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border h-14 flex items-center gap-2 px-3 z-10">
              <button onClick={() => setMobileOpen(false)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono text-muted-foreground">{selected.task_number}</div>
                <div className="text-sm font-bold font-display truncate">{selected.title}</div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-32">
              <TaskDetail
                t={selected}
                statuses={statuses}
                mutations={mutations}
                onRefresh={() => void refetch()}
                onDeleted={() => { setSelected(null); setMobileOpen(false); void refetch(); }}
              />
            </div>
          </div>
        )}
      </QueryState>

      {createOpen && (
        <CreateTaskModal
          statuses={statuses}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void refetch(); }}
          create={mutations.create}
        />
      )}
    </AppShell>
  );
}

function TaskDetail({
  t,
  statuses,
  mutations,
  onRefresh,
  onDeleted,
}: {
  t: EnterpriseTask;
  statuses: { id: string; code: string; name: string }[];
  mutations: ReturnType<typeof useTaskMutations>;
  onRefresh: () => void;
  onDeleted: () => void;
}) {
  const { can } = useAuth();
  const [tab, setTab] = useState<"details" | "comments" | "history">("details");
  const [comment, setComment] = useState("");
  const commentsQ = useQuery({
    queryKey: ["task-comments", t.id],
    queryFn: () => enterpriseApi.taskComments(t.id),
    enabled: tab === "comments",
  });
  const historyQ = useQuery({
    queryKey: ["task-history", t.id],
    queryFn: () => enterpriseApi.taskHistory(t.id),
    enabled: tab === "history",
  });

  async function onStatusChange(code: string) {
    if (!can("tasks", "edit")) return;
    await mutations.update.mutateAsync({ id: t.id, body: { status: code } });
    onRefresh();
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-mono text-muted-foreground">{t.task_number}</span>
        {t.department_name ? <Tag>{t.department_name}</Tag> : null}
        <PriorityBadge priority={t.priority} />
        <StatusBadge status={t.status_name || t.status_code} />
      </div>
      <h3 className="text-lg font-bold font-display leading-tight">{t.title}</h3>
      {t.description ? <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {can("tasks", "edit") && (
          <select
            value={t.status_code}
            onChange={(e) => void onStatusChange(e.target.value)}
            className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.code}>{s.name}</option>
            ))}
          </select>
        )}
        {can("tasks", "edit") && (
          <button
            onClick={() => void mutations.duplicate.mutateAsync(t.id).then(onRefresh)}
            className="h-8 px-2 rounded-lg border border-border text-xs inline-flex items-center gap-1 hover:bg-secondary"
          >
            <Copy className="h-3 w-3" /> Duplicate
          </button>
        )}
        {can("tasks", "edit") && (
          <button
            onClick={() => void mutations.archive.mutateAsync(t.id).then(onDeleted)}
            className="h-8 px-2 rounded-lg border border-border text-xs inline-flex items-center gap-1 hover:bg-secondary"
          >
            <Archive className="h-3 w-3" /> Archive
          </button>
        )}
        {can("tasks", "delete") && (
          <button
            onClick={() => {
              if (confirm("Delete this task?")) void mutations.remove.mutateAsync(t.id).then(onDeleted);
            }}
            className="h-8 px-2 rounded-lg border border-destructive/40 text-destructive text-xs inline-flex items-center gap-1 hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Field k="Assignee" v={t.assigned_to_name || t.assignee_name || "—"} />
        <Field k="Assigned by" v={t.assigned_by_name || "—"} />
        <Field k="Project" v={t.project_name || "—"} />
        <Field k="Progress" v={`${t.progress_pct ?? 0}%`} />
        <Field k="Created" v={fmtDateTime(t.created_at)} />
        <Field k="Due" v={fmtDateTime(t.due_at)} />
        <Field k="Est. hours" v={String(t.estimated_hours ?? 0)} />
        <Field k="Actual hours" v={String(t.actual_hours ?? 0)} />
      </dl>

      <div className="mt-5 flex gap-1 border-b border-border">
        {(["details", "comments", "history"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-xs font-semibold capitalize ${tab === k ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          >
            {k}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Checklist</div>
          {(t.checklist_json || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No checklist items.</div>
          ) : (
            <ul className="space-y-2">
              {(t.checklist_json || []).map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {c.done ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  <span className={c.done ? "line-through text-muted-foreground" : ""}>{c.text}</span>
                </li>
              ))}
            </ul>
          )}
          {can("tasks", "edit") && (
            <label className="mt-4 block">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Attachments</span>
              <input
                type="file"
                multiple
                className="mt-2 block w-full text-xs"
                onChange={async (e) => {
                  if (!e.target.files?.length) return;
                  await enterpriseApi.uploadAttachments(t.id, e.target.files);
                  onRefresh();
                }}
              />
            </label>
          )}
        </div>
      )}

      {tab === "comments" && (
        <div className="mt-4 space-y-3">
          {(commentsQ.data?.results as { id: string; author_name: string; body: string; created_at: string }[] | undefined)?.map((c) => (
            <div key={c.id} className="rounded-xl bg-secondary/40 p-3 text-sm">
              <div className="text-[11px] font-semibold">{c.author_name} · <span className="text-muted-foreground font-normal">{fmtDateTime(c.created_at)}</span></div>
              <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment… use @username to mention"
              className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-sm"
            />
            <button
              disabled={!comment.trim()}
              onClick={async () => {
                await enterpriseApi.addComment(t.id, comment.trim());
                setComment("");
                void commentsQ.refetch();
              }}
              className="h-9 px-3 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="mt-4 space-y-2">
          {(historyQ.data?.results as { id: string; action: string; message: string; actor_name: string; created_at: string }[] | undefined)?.map((h) => (
            <div key={h.id} className="flex gap-2 text-xs">
              <History className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-semibold">{h.action}</span>
                {h.message ? ` — ${h.message}` : ""}
                <div className="text-muted-foreground">{h.actor_name} · {fmtDateTime(h.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTaskModal({
  statuses,
  onClose,
  onCreated,
  create,
}: {
  statuses: { code: string; name: string; is_default?: boolean }[];
  onClose: () => void;
  onCreated: () => void;
  create: ReturnType<typeof useTaskMutations>["create"];
}) {
  const defaultStatus = statuses.find((s) => s.is_default)?.code || statuses[0]?.code || "new";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState(defaultStatus);
  const [due, setDue] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg">New Task</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 px-3 rounded-xl border border-border bg-background text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-xl border border-border bg-background text-sm">
              {statuses.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm" />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-xl text-xs font-semibold border border-border">Cancel</button>
          <button
            disabled={create.isPending}
            onClick={async () => {
              if (!title.trim()) { setError("Title is required."); return; }
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  description,
                  priority,
                  status,
                  due_at: due ? new Date(due).toISOString() : null,
                });
                onCreated();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create");
              }
            }}
            className="h-9 px-4 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          >
            {create.isPending ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium mt-0.5 truncate">{v}</dd>
    </div>
  );
}
