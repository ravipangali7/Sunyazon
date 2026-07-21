import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  Plus,
  Play,
  MoreHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Save,
  Copy,
  Archive,
  Trash2,
  Eye,
  Upload,
  BookOpen,
  ListChecks,
  Factory,
  Cog,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { Tag, StatusBadge } from "@/components/ui-bits/Badge";
import { useProcess } from "@/hooks/use-domain";
import { domainApi } from "@/lib/domain-api";
import type {
  ProcessDashboard,
  ProcessDefinition,
  ProcessStage,
  ProcessTemplate,
} from "@/lib/process-types";

export const Route = createFileRoute("/process")({
  head: () => ({
    meta: [
      { title: "Process Engine — Sunyazon BEOS" },
      {
        name: "description",
        content: "Industry-agnostic stage builder for production, quality and workflow processes.",
      },
    ],
  }),
  component: ProcessPage,
});

type Section =
  | "overview"
  | "templates"
  | "definitions"
  | "stages"
  | "workorders"
  | "runs"
  | "";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  if (
    h === "overview" ||
    h === "templates" ||
    h === "definitions" ||
    h === "stages" ||
    h === "workorders" ||
    h === "runs"
  ) {
    return h;
  }
  return "overview";
}

function ProcessPage() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const navigate = useNavigate();
  const section = sectionFromHash(hash);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [modal, setModal] = useState<"create" | "instantiate" | null>(null);
  const { data, isLoading, isError, error } = useProcess(selectedId);
  const qc = useQueryClient();

  const dash = data as ProcessDashboard | undefined;
  const templates = dash?.templates ?? [];
  const definitions = dash?.definitions ?? [];
  const permissions = dash?.permissions ?? {};
  const canCreate = !!permissions.create;
  const canEdit = !!permissions.edit;
  const canDelete = !!permissions.delete;
  const canView = permissions.view !== false;

  useEffect(() => {
    if (!selectedId && dash?.selected_template_id) {
      setSelectedId(dash.selected_template_id);
    }
  }, [dash?.selected_template_id, selectedId]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => domainApi.processAction(payload),
    onSuccess: (res) => {
      if (res.dashboard) {
        qc.setQueryData(["process", selectedId || "default"], res.dashboard);
        if (res.definition_id) setSelectedId(res.definition_id);
      }
      void qc.invalidateQueries({ queryKey: ["process"] });
      setModal(null);
      setMenuOpenId(null);
    },
  });

  const activeDef: ProcessDefinition | undefined = useMemo(() => {
    if (!definitions.length) return undefined;
    return (
      definitions.find((d) => d.id === (selectedId || dash?.selected_template_id)) ||
      definitions.find((d) => d.status === "active") ||
      definitions[0]
    );
  }, [definitions, selectedId, dash?.selected_template_id]);

  const canvasStages: ProcessStage[] = useMemo(() => {
    const fromCanvas = dash?.canvas?.stages;
    if (fromCanvas?.length) return [...fromCanvas].sort((a, b) => a.sort_order - b.sort_order);
    if (activeDef?.stages?.length) return [...activeDef.stages].sort((a, b) => a.sort_order - b.sort_order);
    return [];
  }, [dash?.canvas?.stages, activeDef]);

  const metaTitle = dash?.meta?.title || "Process Engine";
  const metaSubtitle =
    dash?.meta?.subtitle ||
    [
      dash?.meta?.company_name,
      dash?.meta?.department_name || dash?.meta?.module_name,
      dash?.meta?.role_label,
    ]
      .filter(Boolean)
      .join(" · ") ||
    "process.template · stage builder · workflow-driven";

  const selectTemplate = (id: string) => {
    setSelectedId(id);
    void navigate({ to: "/process", hash: section === "overview" ? "" : section });
  };

  const runAction = (action: string, extra: Record<string, unknown> = {}) => {
    mutation.mutate({
      action,
      definition_id: extra.definition_id || selectedId || activeDef?.id,
      ...extra,
    });
  };

  if (!canView && !isLoading && dash === undefined && !isError) {
    return (
      <AppShell title="Process Engine" subtitle="Access denied">
        <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          You do not have permission to view the Process Engine.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={metaTitle}
      subtitle={metaSubtitle}
      roleBadge={dash?.meta?.role_label || dash?.role?.name}
      unreadCount={dash?.notifications?.unread_count}
      departmentModules={dash?.modules}
      actions={
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground">
          {dash?.company?.name && <span className="truncate max-w-[140px]">{dash.company.name}</span>}
          {dash?.module?.name && (
            <>
              <span>·</span>
              <span>{dash.module.name}</span>
            </>
          )}
        </div>
      }
    >
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={false}>
        {mutation.isError && (
          <div className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {(mutation.error as Error)?.message || "Action failed"}
          </div>
        )}

        {(section === "overview" || section === "definitions" || !section) && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {canCreate && (
                <button
                  type="button"
                  onClick={() => setModal("create")}
                  className="h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                  style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
                >
                  <Plus className="h-4 w-4" /> New template
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  onClick={() => setModal("instantiate")}
                  className="h-9 px-3 rounded-lg text-sm font-semibold bg-secondary inline-flex items-center gap-1.5"
                >
                  <Play className="h-4 w-4" /> Instantiate
                </button>
              )}
              {dash?.statistics && (
                <div className="ml-auto flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>{dash.statistics.templates ?? 0} templates</span>
                  <span>{dash.statistics.active_runs ?? 0} active runs</span>
                  <span>{dash.statistics.stages ?? 0} stages</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {templates.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No process definitions yet. Create a template or install an industry template.
                </div>
              ) : (
                templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    active={t.id === activeDef?.id}
                    menuOpen={menuOpenId === t.id}
                    onSelect={() => selectTemplate(t.id)}
                    onMenu={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                    canEdit={canEdit}
                    canCreate={canCreate}
                    canDelete={canDelete}
                    busy={mutation.isPending}
                    onAction={(action) => runAction(action, { definition_id: t.id })}
                  />
                ))
              )}
            </div>

            <ProcessCanvasPanel
              name={activeDef?.name || dash?.canvas?.template_name || "Process"}
              code={activeDef?.code || dash?.canvas?.template_code || "—"}
              status={activeDef?.status || dash?.canvas?.status || "draft"}
              version={activeDef?.version ?? dash?.canvas?.version}
              stages={canvasStages}
              connections={dash?.canvas?.connections || []}
              zoom={zoom}
              setZoom={setZoom}
              canEdit={canEdit}
              canCreate={canCreate}
              busy={mutation.isPending}
              onSaveVersion={() => runAction("save_version", { definition_id: activeDef?.id })}
              onReorder={(ids) =>
                runAction("reorder_stages", { definition_id: activeDef?.id, stage_ids: ids })
              }
            />
          </>
        )}

        {section === "templates" && (
          <IndustrySection
            industries={dash?.industry_templates || dash?.industries || []}
            canCreate={canCreate}
            busy={mutation.isPending}
            onInstall={(id) => runAction("install_industry", { industry_template_id: id })}
          />
        )}

        {section === "stages" && (
          <StagesFieldsSection
            definitions={definitions}
            selectedId={activeDef?.id}
            fieldTypes={dash?.options?.field_types || []}
          />
        )}

        {section === "workorders" && <WorkOrdersSection orders={dash?.work_orders || []} />}

        {section === "runs" && <RunsSection runs={dash?.process_runs || []} />}
      </QueryState>

      {modal === "create" && dash && (
        <CreateTemplateModal
          schema={dash.field_schema?.definition || dash.options.definition_fields}
          statuses={dash.options.statuses}
          outputTypes={dash.options.output_types}
          industries={dash.industry_templates || dash.industries || []}
          busy={mutation.isPending}
          onClose={() => setModal(null)}
          onSubmit={(payload) => runAction("create", payload)}
        />
      )}

      {modal === "instantiate" && dash && (
        <InstantiateModal
          schema={dash.field_schema?.instantiate || dash.options.instantiate_fields}
          templates={templates}
          selectedId={activeDef?.id}
          priorities={dash.options.wo_priorities}
          customers={dash.options.customers}
          batches={dash.options.batches}
          busy={mutation.isPending}
          onClose={() => setModal(null)}
          onSubmit={(payload) => runAction("instantiate", payload)}
        />
      )}
    </AppShell>
  );
}

function TemplateCard({
  template: t,
  active,
  menuOpen,
  onSelect,
  onMenu,
  canEdit,
  canCreate,
  canDelete,
  busy,
  onAction,
}: {
  template: ProcessTemplate;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenu: () => void;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  busy: boolean;
  onAction: (action: string) => void;
}) {
  const updated = t.updated_at
    ? new Date(t.updated_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`rounded-2xl bg-card border p-4 text-left transition-colors cursor-pointer ${
        active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between">
        <GitBranch className="h-4 w-4 text-primary" />
        <div className="relative">
          <button
            type="button"
            aria-label="More"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
            className="h-6 w-6 grid place-items-center rounded hover:bg-secondary"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-20 w-40 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuBtn icon={Eye} label="View" onClick={onSelect} />
              {canEdit && (
                <MenuBtn icon={Upload} label="Publish" disabled={busy} onClick={() => onAction("publish")} />
              )}
              {canCreate && (
                <MenuBtn icon={Copy} label="Duplicate" disabled={busy} onClick={() => onAction("duplicate")} />
              )}
              {canCreate && (
                <MenuBtn
                  icon={Save}
                  label="Save version"
                  disabled={busy}
                  onClick={() => onAction("save_version")}
                />
              )}
              {canEdit && (
                <MenuBtn icon={Archive} label="Archive" disabled={busy} onClick={() => onAction("archive")} />
              )}
              {canDelete && (
                <MenuBtn
                  icon={Trash2}
                  label="Delete"
                  disabled={busy}
                  danger
                  onClick={() => {
                    if (confirm(`Delete ${t.name}?`)) onAction("delete");
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold truncate">{t.name}</div>
      <div className="text-[11px] text-muted-foreground">
        {t.code} · <Tag>{t.status}</Tag>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span>Industry</span>
        <span className="text-foreground truncate text-right">{t.industry || "—"}</span>
        <span>Version</span>
        <span className="text-foreground text-right">v{t.version}</span>
        <span>Stages</span>
        <span className="text-foreground text-right">{t.stage_count}</span>
        <span>Runs</span>
        <span className="text-foreground text-right">{t.total_runs}</span>
        <span>Active ver.</span>
        <span className="text-foreground text-right">
          {t.active_version != null ? `v${t.active_version}` : "—"}
        </span>
        <span>Published</span>
        <span className="text-foreground text-right">
          {t.last_published_version != null ? `v${t.last_published_version}` : "—"}
        </span>
        <span>Created by</span>
        <span className="text-foreground truncate text-right">{t.created_by || "—"}</span>
        <span>Updated</span>
        <span className="text-foreground text-right">{updated}</span>
      </div>
    </div>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Eye;
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
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary disabled:opacity-50 ${
        danger ? "text-danger" : ""
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ProcessCanvasPanel({
  name,
  code,
  status,
  version,
  stages,
  connections,
  zoom,
  setZoom,
  canEdit,
  canCreate,
  busy,
  onSaveVersion,
  onReorder,
}: {
  name: string;
  code: string;
  status: string;
  version?: number | null;
  stages: ProcessStage[];
  connections: { id: string; from_stage_id: string; to_stage_id: string; type: string }[];
  zoom: number;
  setZoom: (n: number | ((z: number) => number)) => void;
  canEdit: boolean;
  canCreate: boolean;
  busy: boolean;
  onSaveVersion: () => void;
  onReorder: (ids: string[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  const edgeLabel = (fromId: string, toId: string) => {
    const edge = connections.find((c) => c.from_stage_id === fromId && c.to_stage_id === toId);
    return edge?.type === "parallel" ? "∥" : "→";
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold">
            {name} · canvas
            {version != null ? ` · v${version}` : ""}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {code} · {status}
            {connections.length ? ` · ${connections.length} links` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <CanvasTool
            label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </CanvasTool>
          <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <CanvasTool
            label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </CanvasTool>
          <CanvasTool label="Reset zoom" onClick={() => setZoom(1)}>
            <Crosshair className="h-3.5 w-3.5" />
          </CanvasTool>
          <CanvasTool label="Fit" onClick={() => setZoom(stages.length > 4 ? 0.75 : 1)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </CanvasTool>
          {canCreate && (
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={onSaveVersion}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save version
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="flex items-stretch gap-3 min-w-max origin-left transition-transform"
          style={{ transform: `scale(${zoom})` }}
        >
          {stages.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 px-4">
              No stages on this definition. Install an industry template or add stages in admin.
            </div>
          ) : (
            stages.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div
                  draggable={canEdit}
                  onDragStart={() => setDragId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId || dragId === s.id || !canEdit) return;
                    const ids = stages.map((x) => x.id);
                    const from = ids.indexOf(dragId);
                    const to = ids.indexOf(s.id);
                    if (from < 0 || to < 0) return;
                    ids.splice(to, 0, ids.splice(from, 1)[0]);
                    setDragId(null);
                    onReorder(ids);
                  }}
                  className="w-56 rounded-xl bg-secondary/30 p-3 border-2 shrink-0"
                  style={{
                    borderColor: s.color || "var(--color-border)",
                    borderLeftWidth: 4,
                    borderLeftColor: s.color || "var(--color-primary)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-mono text-muted-foreground">#{s.sort_order}</div>
                    {s.requires_approval && <Tag tone="brand">approval</Tag>}
                  </div>
                  <div className="text-sm font-bold mt-0.5">{s.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                    {s.stage_type}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    {s.code || s.id.slice(0, 8)}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>SLA</span>
                    <span className="text-right text-foreground">
                      {s.sla_hours != null ? `${s.sla_hours}h` : "—"}
                    </span>
                    <span>Role</span>
                    <span className="text-right text-foreground truncate">
                      {s.default_assignee_role || "—"}
                    </span>
                    <span>Fields</span>
                    <span className="text-right text-foreground">
                      {s.field_count ?? s.fields?.length ?? 0}
                    </span>
                    <span>Flow</span>
                    <span className="text-right text-foreground">
                      {s.connections?.flow_mode || "sequential"}
                    </span>
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className="flex flex-col items-center px-1 text-muted-foreground">
                    <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
                      <path
                        d="M0 6 H26 M26 6 L20 2 M26 6 L20 10"
                        stroke="var(--color-muted-foreground)"
                        strokeWidth="1.5"
                      />
                    </svg>
                    <span className="text-[9px]">{edgeLabel(s.id, stages[i + 1].id)}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CanvasTool({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 grid place-items-center rounded-lg bg-secondary hover:opacity-90"
    >
      {children}
    </button>
  );
}

function IndustrySection({
  industries,
  canCreate,
  busy,
  onInstall,
}: {
  industries: ProcessDashboard["industry_templates"];
  canCreate: boolean;
  busy: boolean;
  onInstall: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Industry Templates</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {industries.map((t) => (
          <div key={t.id} className="rounded-2xl bg-card border border-border p-4">
            <div className="text-sm font-semibold">{t.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground">{t.code}</div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{t.description || "—"}</p>
            <div className="mt-3 text-[11px] text-muted-foreground">
              {t.stage_count} default stages · {(t.default_capabilities || []).join(", ") || "no caps"}
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onInstall(t.id)}
                className="mt-3 h-8 px-3 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
              >
                Install stages
              </button>
            )}
          </div>
        ))}
        {!industries.length && (
          <div className="col-span-full text-sm text-muted-foreground">No industry templates in the database.</div>
        )}
      </div>
    </div>
  );
}

function StagesFieldsSection({
  definitions,
  selectedId,
  fieldTypes,
}: {
  definitions: ProcessDefinition[];
  selectedId?: string;
  fieldTypes: { value: string; label: string }[];
}) {
  const def = definitions.find((d) => d.id === selectedId) || definitions[0];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Stages & Fields</div>
        {def && <span className="text-[11px] text-muted-foreground">{def.name}</span>}
      </div>
      {!def ? (
        <div className="text-sm text-muted-foreground">Select a process definition first.</div>
      ) : (
        <div className="space-y-3">
          {[...def.stages]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s) => (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">#{s.sort_order}</span>
                  <span className="text-sm font-semibold">{s.name}</span>
                  <Tag>{s.stage_type}</Tag>
                  <span className="text-[11px] text-muted-foreground font-mono">{s.code}</span>
                </div>
                <div className="mt-3 divide-y divide-border">
                  {(s.fields || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No fields on this stage.</div>
                  ) : (
                    s.fields.map((f) => (
                      <div key={f.id} className="py-2 flex items-center gap-3 text-xs">
                        <span className="font-medium flex-1">{f.label}</span>
                        <span className="font-mono text-muted-foreground">{f.field_key}</span>
                        <Tag>{f.field_type}</Tag>
                        {f.is_required && <Tag tone="brand">required</Tag>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          {fieldTypes.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Available field types: {fieldTypes.map((f) => f.label).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkOrdersSection({ orders }: { orders: ProcessDashboard["work_orders"] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Factory className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Work Orders</div>
      </div>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                  <td className="px-4 py-3">{o.template || "—"}</td>
                  <td className="px-4 py-3">{o.current_stage || "—"}</td>
                  <td className="px-4 py-3">{o.assigned_user || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{o.completion_pct}%</td>
                  <td className="px-4 py-3">
                    <Tag>{o.priority}</Tag>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {o.due_date ? new Date(o.due_date).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No work orders for this organization.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RunsSection({ runs }: { runs: ProcessDashboard["process_runs"] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Cog className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Process Runs</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {runs.map((r) => (
          <div key={r.id} className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{r.run_id}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 text-sm font-semibold">{r.template}</div>
            <div className="text-[11px] text-muted-foreground">
              WO {r.work_order || "—"} · by {r.started_by || "—"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span>Current</span>
              <span className="text-right text-foreground">{r.current_stage || "—"}</span>
              <span>Completed</span>
              <span className="text-right text-foreground">
                {r.completed_stages}/{r.total_stages}
              </span>
              <span>Pending</span>
              <span className="text-right text-foreground">{r.pending_stages}</span>
              <span>Duration</span>
              <span className="text-right text-foreground">{r.duration || "—"}</span>
              <span>Started</span>
              <span className="text-right text-foreground">
                {r.started_time ? new Date(r.started_time).toLocaleString() : "—"}
              </span>
              <span>Finished</span>
              <span className="text-right text-foreground">
                {r.finished_time ? new Date(r.finished_time).toLocaleString() : "—"}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{r.total_progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, r.total_progress)}%`,
                    backgroundColor: "var(--color-primary)",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
        {!runs.length && (
          <div className="col-span-full text-sm text-muted-foreground">
            No process runs yet. Instantiate a template.
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTemplateModal({
  schema,
  statuses,
  outputTypes,
  industries,
  busy,
  onClose,
  onSubmit,
}: {
  schema: { key: string; label: string; required?: boolean }[];
  statuses: { value: string; label: string }[];
  outputTypes: { value: string; label: string }[];
  industries: ProcessDashboard["industry_templates"];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: "",
    code: "",
    description: "",
    status: statuses[0]?.value || "draft",
    output_type: outputTypes[0]?.value || "product",
    industry_template_id: "",
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal title="New process template" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...form,
            industry_template_id: form.industry_template_id || undefined,
          });
        }}
      >
        {schema.map((field) => {
          if (field.key === "industry_template_id") {
            return (
              <Field key={field.key} label={field.label} required={field.required}>
                <select
                  className="w-full h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
                  value={form.industry_template_id}
                  onChange={(e) => set("industry_template_id", e.target.value)}
                >
                  <option value="">—</option>
                  {industries.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (field.key === "status") {
            return (
              <Field key={field.key} label={field.label}>
                <select
                  className="w-full h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (field.key === "output_type") {
            return (
              <Field key={field.key} label={field.label}>
                <select
                  className="w-full h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
                  value={form.output_type}
                  onChange={(e) => set("output_type", e.target.value)}
                >
                  {outputTypes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (field.key === "description") {
            return (
              <Field key={field.key} label={field.label}>
                <textarea
                  className="w-full min-h-[72px] rounded-lg bg-secondary px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
            );
          }
          return (
            <Field key={field.key} label={field.label} required={field.required}>
              <input
                className="w-full h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
                required={field.required}
                value={form[field.key] || ""}
                onChange={(e) => set(field.key, e.target.value)}
              />
            </Field>
          );
        })}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-sm bg-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InstantiateModal({
  schema,
  templates,
  selectedId,
  priorities,
  customers,
  batches,
  busy,
  onClose,
  onSubmit,
}: {
  schema: { key: string; label: string; required?: boolean }[];
  templates: ProcessTemplate[];
  selectedId?: string;
  priorities: { value: string; label: string }[];
  customers: { id: string; name: string }[];
  batches: { id: string; batch_no: string }[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    process_definition_id: selectedId || templates[0]?.id || "",
    wo_no: "",
    title: "",
    customer_party_id: "",
    batch_id: "",
    project_code: "",
    priority: priorities.find((p) => p.value === "medium")?.value || priorities[0]?.value || "medium",
    planned_start: "",
    target_qty: "",
    release: "true",
  });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const fieldClass =
    "w-full h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary";

  return (
    <Modal title="Instantiate process run" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...form,
            definition_id: form.process_definition_id,
            release: form.release === "true",
            target_qty: form.target_qty ? Number(form.target_qty) : undefined,
            customer_party_id: form.customer_party_id || undefined,
            batch_id: form.batch_id || undefined,
            planned_start: form.planned_start || undefined,
          });
        }}
      >
        {schema
          .filter((f) => f.key !== "department_id")
          .map((field) => {
            if (field.key === "process_definition_id") {
              return (
                <Field key={field.key} label={field.label} required>
                  <select
                    className={fieldClass}
                    required
                    value={form.process_definition_id}
                    onChange={(e) => set("process_definition_id", e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </Field>
              );
            }
            if (field.key === "customer_party_id") {
              return (
                <Field key={field.key} label={field.label}>
                  <select
                    className={fieldClass}
                    value={form.customer_party_id}
                    onChange={(e) => set("customer_party_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            }
            if (field.key === "batch_id") {
              return (
                <Field key={field.key} label={field.label}>
                  <select
                    className={fieldClass}
                    value={form.batch_id}
                    onChange={(e) => set("batch_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_no}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            }
            if (field.key === "priority") {
              return (
                <Field key={field.key} label={field.label}>
                  <select
                    className={fieldClass}
                    value={form.priority}
                    onChange={(e) => set("priority", e.target.value)}
                  >
                    {priorities.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            }
            if (field.key === "release") {
              return (
                <Field key={field.key} label={field.label}>
                  <select
                    className={fieldClass}
                    value={form.release}
                    onChange={(e) => set("release", e.target.value)}
                  >
                    <option value="true">Yes — create ProcessRun + stages</option>
                    <option value="false">No — draft Work Order only</option>
                  </select>
                </Field>
              );
            }
            if (field.key === "planned_start") {
              return (
                <Field key={field.key} label={field.label}>
                  <input
                    type="datetime-local"
                    className={fieldClass}
                    value={form.planned_start}
                    onChange={(e) => set("planned_start", e.target.value)}
                  />
                </Field>
              );
            }
            const key = field.key;
            return (
              <Field key={field.key} label={field.label} required={field.required}>
                <input
                  className={fieldClass}
                  required={field.required}
                  value={form[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            );
          })}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-sm bg-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !templates.length}
            className="h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
          >
            Instantiate
          </button>
        </div>
      </form>
    </Modal>
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-bold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
