"""Process Engine dashboard — org-scoped, RBAC-aware aggregates from production models."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db.models import Count, Prefetch, Q
from django.utils import timezone

from core.api import user_has_module_action
from core.models import (
    Batch,
    IndustryTemplate,
    MenuItem,
    Module,
    Notification,
    Party,
    ProcessDefinition,
    ProcessRun,
    ProcessRunStage,
    ProcessStage,
    ProcessStageField,
    Team,
    WorkOrder,
)
from core.services.portal_service import resolve_portal, _pick_membership

MODULE_CODE = "process"
BASE_CODE_RE = re.compile(r"_v\d+$", re.IGNORECASE)


def _dec(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _iso(v) -> str | None:
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


def _user_display(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username


def family_code(code: str) -> str:
    """Strip trailing _vN so versioned clones group together."""
    return BASE_CODE_RE.sub("", code or "")


def _menu_node(item: MenuItem, children: list[dict] | None = None) -> dict[str, Any]:
    route = item.route or ""
    path, _, hash_part = route.partition("#")
    return {
        "id": str(item.id),
        "name": item.name,
        "code": item.code,
        "icon": item.icon or "",
        "route": path or route,
        "hash": hash_part or "",
        "display_order": item.display_order,
        "module_code": item.module.code if item.module_id else None,
        "required_action": item.required_action or "view",
        "children": children or [],
    }


def process_menus_for_user(user, org) -> list[dict[str, Any]]:
    """Permission-filtered MenuItem tree for the process module."""
    module = Module.objects.filter(code=MODULE_CODE, is_active=True).first()
    if not module:
        return []

    qs = MenuItem.objects.filter(is_visible=True, module=module).select_related("module", "parent")
    if org:
        qs = qs.filter(Q(organization__isnull=True) | Q(organization=org))
    else:
        qs = qs.filter(organization__isnull=True)

    def allowed(item: MenuItem) -> bool:
        action = item.required_action or "view"
        return user_has_module_action(user, MODULE_CODE, action)

    roots = [m for m in qs.filter(parent__isnull=True).order_by("display_order", "name") if allowed(m)]
    if not roots:
        parent = MenuItem.objects.filter(
            Q(organization__isnull=True) | Q(organization=org) if org else Q(organization__isnull=True),
            code=f"menu_{MODULE_CODE}",
            is_visible=True,
        ).first()
        if parent and allowed(parent):
            roots = [parent]
        else:
            return []

    tree = []
    for root in roots:
        kids = [
            _menu_node(child)
            for child in root.children.filter(is_visible=True).order_by("display_order", "name")
            if allowed(child)
        ]
        tree.append(_menu_node(root, kids))
    return tree


def _permissions_payload(user) -> dict[str, bool]:
    actions = ("view", "create", "edit", "delete", "approve", "export", "import", "print")
    return {a: user_has_module_action(user, MODULE_CODE, a) for a in actions}


def _modules_payload(user) -> list[dict[str, Any]]:
    portal = resolve_portal(user)
    return [
        {
            "code": m.code,
            "name": m.name,
            "description": m.description,
            "icon": m.icon,
            "color": m.color,
            "route_path": m.route_path,
            "category": m.category,
            "access_level": m.access_level,
            "actions": m.actions,
        }
        for m in portal.modules
    ]


def _search_resources(user) -> list[dict[str, str]]:
    resources = []
    mapping = (
        (MODULE_CODE, "definitions", "Process Definitions", "/process#definitions"),
        (MODULE_CODE, "templates", "Industry Templates", "/process#templates"),
        (MODULE_CODE, "stages", "Stages & Fields", "/process#stages"),
        (MODULE_CODE, "runs", "Process Runs", "/process#runs"),
        ("production", "workorders", "Work Orders", "/production#workorders"),
        ("inventory", "inventory", "Inventory", "/inventory"),
    )
    seen: set[str] = set()
    for module_code, key, label, route in mapping:
        if not user_has_module_action(user, module_code, "view"):
            continue
        if key in seen:
            continue
        seen.add(key)
        resources.append({"key": key, "label": label, "route": route, "module": module_code})
    return resources


def serialize_stage_field(field: ProcessStageField) -> dict[str, Any]:
    return {
        "id": str(field.id),
        "field_key": field.field_key,
        "label": field.label,
        "field_type": field.field_type,
        "is_required": field.is_required,
        "options_json": field.options_json,
        "validation_json": field.validation_json,
        "default_value": field.default_value or "",
        "sort_order": field.sort_order,
        "show_on_dashboard": field.show_on_dashboard,
    }


def serialize_stage(stage: ProcessStage, *, include_fields: bool = True) -> dict[str, Any]:
    ui = stage.ui_config_json if isinstance(stage.ui_config_json, dict) else {}
    fields = []
    if include_fields:
        # Prefer prefetched cache
        related = list(stage.fields.all())
        fields = [serialize_stage_field(f) for f in related]

    connections = {
        "requires_previous_complete": stage.requires_previous_complete,
        "allow_parallel": stage.allow_parallel,
        "is_optional": stage.is_optional,
        # No previous_stage / next_stage FKs on ProcessStage — flow is sort_order based.
        "flow_mode": "parallel" if stage.allow_parallel else "sequential",
    }

    return {
        "id": str(stage.id),
        "process_id": str(stage.process_definition_id),
        "code": stage.code,
        "name": stage.name,
        "sequence": stage.sort_order,
        "sort_order": stage.sort_order,
        "stage_type": stage.stage_type,
        "is_optional": stage.is_optional,
        "requires_previous_complete": stage.requires_previous_complete,
        "allow_parallel": stage.allow_parallel,
        "default_assignee_role": stage.default_assignee_role or "",
        "sla_hours": stage.sla_hours,
        "estimated_time": stage.sla_hours,
        "color": ui.get("color") or "",
        "icon": ui.get("icon") or "",
        "ui_config_json": ui,
        "connections": connections,
        "fields": fields,
        "field_count": len(fields),
        "requires_approval": stage.stage_type == ProcessStage.StageType.APPROVE,
        "created_at": _iso(stage.created_at),
    }


def serialize_definition(
    pd: ProcessDefinition,
    *,
    family_versions: dict[str, list[ProcessDefinition]] | None = None,
) -> dict[str, Any]:
    stages = [serialize_stage(s) for s in pd.stages.all()]
    stage_count = getattr(pd, "stage_count", None)
    if stage_count is None:
        stage_count = len(stages)
    run_count = getattr(pd, "run_count", None)
    if run_count is None:
        run_count = pd.runs.count() if hasattr(pd, "runs") else 0

    fam = family_code(pd.code)
    siblings = (family_versions or {}).get(fam, [pd])
    active_siblings = [s for s in siblings if s.status == ProcessDefinition.Status.ACTIVE]
    active_version = max((s.version for s in active_siblings), default=None)
    # No publish-history table — approximate last published as max active version in family.
    last_published_version = active_version

    return {
        "id": str(pd.id),
        "name": pd.name,
        "code": pd.code,
        "family_code": fam,
        "description": pd.description or "",
        "status": pd.status,
        "version": pd.version,
        "output_type": pd.output_type,
        "industry_template_id": str(pd.industry_template_id) if pd.industry_template_id else None,
        "industry": pd.industry_template.name if pd.industry_template_id else "",
        "industry_code": pd.industry_template.code if pd.industry_template_id else "",
        "workflow_definition_id": str(pd.workflow_definition_id) if pd.workflow_definition_id else None,
        "workflow_name": pd.workflow_definition.name if pd.workflow_definition_id else "",
        "form_metadata_id": str(pd.form_metadata_id) if pd.form_metadata_id else None,
        "default_output_item_id": str(pd.default_output_item_id) if pd.default_output_item_id else None,
        "created_by_id": str(pd.created_by_id) if pd.created_by_id else None,
        "created_by": _user_display(pd.created_by) if pd.created_by_id else "",
        "created_at": _iso(pd.created_at),
        "updated_at": _iso(pd.updated_at),
        "stage_count": int(stage_count),
        "total_runs": int(run_count),
        "active_version": active_version,
        "last_published_version": last_published_version,
        "stages": stages,
        # Backward-compatible alias used by older frontend
        "templates_alias": True,
    }


def serialize_industry_template(tpl: IndustryTemplate) -> dict[str, Any]:
    stages_json = tpl.default_stages_json or []
    return {
        "id": str(tpl.id),
        "code": tpl.code,
        "name": tpl.name,
        "description": tpl.description or "",
        "default_capabilities": tpl.default_capabilities or [],
        "default_stages_json": stages_json,
        "default_fields_json": tpl.default_fields_json or {},
        "stage_count": len(stages_json) if isinstance(stages_json, list) else 0,
        "is_system": tpl.is_system,
        "is_active": tpl.is_active,
    }


def serialize_work_order_process(wo: WorkOrder) -> dict[str, Any]:
    runs = list(wo.runs.all()) if hasattr(wo, "runs") else []
    latest_run = runs[0] if runs else None
    current_stage = ""
    progress = 0.0
    if latest_run:
        run_stages = list(latest_run.stages.all())
        total = len(run_stages) or 1
        done = sum(
            1
            for s in run_stages
            if s.status
            in (
                ProcessRunStage.Status.COMPLETED,
                ProcessRunStage.Status.SKIPPED,
            )
        )
        progress = round((done / total) * 100, 1)
        active = next(
            (s for s in run_stages if s.status == ProcessRunStage.Status.IN_PROGRESS),
            None,
        )
        if active and active.process_stage_id:
            current_stage = active.process_stage.name
        elif run_stages:
            pending = next(
                (s for s in run_stages if s.status == ProcessRunStage.Status.PENDING),
                None,
            )
            current_stage = (
                pending.process_stage.name
                if pending and pending.process_stage_id
                else run_stages[-1].process_stage.name
                if run_stages[-1].process_stage_id
                else ""
            )

    assignee = ""
    if wo.supervisor_id:
        assignee = wo.supervisor.full_name

    return {
        "id": str(wo.id),
        "order_number": wo.wo_no,
        "wo_no": wo.wo_no,
        "title": wo.title,
        "template_id": str(wo.process_definition_id) if wo.process_definition_id else None,
        "template": wo.process_definition.name if wo.process_definition_id else "",
        "template_code": wo.process_definition.code if wo.process_definition_id else "",
        "current_stage": current_stage,
        "assigned_user": assignee,
        "supervisor_id": str(wo.supervisor_id) if wo.supervisor_id else None,
        "progress": progress,
        "completion_pct": progress,
        "priority": wo.priority,
        "status": wo.status,
        "target_qty": _dec(wo.target_qty),
        "actual_qty": _dec(wo.actual_qty),
        "batch_id": str(wo.batch_id) if wo.batch_id else None,
        "batch_no": wo.batch.batch_no if wo.batch_id else "",
        "customer_id": str(wo.customer_party_id) if wo.customer_party_id else None,
        "customer": wo.customer_party.name if wo.customer_party_id else "",
        "planned_start": _iso(wo.planned_start),
        "planned_end": _iso(wo.planned_end),
        "due_date": _iso(wo.planned_end) or _iso(wo.date),
        "created_date": _iso(wo.created_at) or _iso(wo.date),
        "date": _iso(wo.date),
        "department": wo.department.name if wo.department_id else "",
        "created_by": _user_display(wo.created_by) if wo.created_by_id else "",
    }


def _duration_label(started, completed) -> str:
    if not started:
        return ""
    end = completed or timezone.now()
    if not isinstance(started, datetime):
        return ""
    secs = max(0, int((end - started).total_seconds()))
    hours, rem = divmod(secs, 3600)
    mins, _ = divmod(rem, 60)
    if hours:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def serialize_process_run(run: ProcessRun) -> dict[str, Any]:
    stages = list(run.stages.all())
    total = len(stages)
    completed = sum(
        1
        for s in stages
        if s.status in (ProcessRunStage.Status.COMPLETED, ProcessRunStage.Status.SKIPPED)
    )
    pending = sum(1 for s in stages if s.status == ProcessRunStage.Status.PENDING)
    in_progress = next(
        (s for s in stages if s.status == ProcessRunStage.Status.IN_PROGRESS),
        None,
    )
    current = ""
    if in_progress and in_progress.process_stage_id:
        current = in_progress.process_stage.name
    elif stages:
        nxt = next((s for s in stages if s.status == ProcessRunStage.Status.PENDING), None)
        if nxt and nxt.process_stage_id:
            current = nxt.process_stage.name

    progress = round((completed / total) * 100, 1) if total else 0.0
    started_by = ""
    if run.work_order_id and run.work_order.created_by_id:
        started_by = _user_display(run.work_order.created_by)

    return {
        "id": str(run.id),
        "run_id": run.run_no,
        "run_no": run.run_no,
        "template_id": str(run.process_definition_id),
        "template": run.process_definition.name if run.process_definition_id else "",
        "template_code": run.process_definition.code if run.process_definition_id else "",
        "work_order_id": str(run.work_order_id) if run.work_order_id else None,
        "work_order": run.work_order.wo_no if run.work_order_id else "",
        "started_by": started_by,
        "current_stage": current,
        "completed_stages": completed,
        "pending_stages": pending,
        "total_stages": total,
        "total_progress": progress,
        "progress": progress,
        "status": run.status,
        "duration": _duration_label(run.started_at, run.completed_at),
        "started_time": _iso(run.started_at),
        "finished_time": _iso(run.completed_at),
        "created_at": _iso(run.created_at),
        "notes": run.notes or "",
        "stages": [
            {
                "id": str(s.id),
                "stage_id": str(s.process_stage_id),
                "name": s.process_stage.name if s.process_stage_id else "",
                "status": s.status,
                "sort_order": s.sort_order or (s.process_stage.sort_order if s.process_stage_id else 0),
                "team": s.team.name if s.team_id else "",
                "member": s.member.full_name if s.member_id else "",
                "parent_run_stage_id": str(s.parent_run_stage_id) if s.parent_run_stage_id else None,
                "goal_qty": _dec(s.goal_qty),
                "actual_qty": _dec(s.actual_qty),
                "started_at": _iso(s.started_at),
                "completed_at": _iso(s.completed_at),
            }
            for s in stages
        ],
    }


def build_canvas(definition: ProcessDefinition | None) -> dict[str, Any]:
    if not definition:
        return {
            "template_id": None,
            "template_name": "",
            "template_code": "",
            "status": "",
            "version": None,
            "stages": [],
            "connections": [],
        }

    stages = [serialize_stage(s) for s in definition.stages.all()]
    connections = []
    ordered = sorted(stages, key=lambda s: s["sort_order"])
    for i, stage in enumerate(ordered):
        if i == 0:
            continue
        prev = ordered[i - 1]
        # Linear edges from sort_order; parallel flag softens dependency for UI.
        connections.append(
            {
                "id": f"{prev['id']}->{stage['id']}",
                "from_stage_id": prev["id"],
                "to_stage_id": stage["id"],
                "type": "parallel" if stage["allow_parallel"] else "sequential",
                "requires_previous_complete": stage["requires_previous_complete"],
            }
        )

    return {
        "template_id": str(definition.id),
        "template_name": definition.name,
        "template_code": definition.code,
        "status": definition.status,
        "version": definition.version,
        "stages": ordered,
        "connections": connections,
    }


def build_process_dashboard(user, request=None, *, selected_id: str | None = None) -> dict[str, Any] | tuple[dict[str, Any], int]:
    membership = _pick_membership(user)
    portal = resolve_portal(user)

    if not user_has_module_action(user, MODULE_CODE, "view"):
        # Allow production module viewers to open process runs (related capability)
        if not user_has_module_action(user, "production", "view"):
            return ({"detail": "You do not have permission to view the process module."}, 403)

    org = membership.organization if membership else None
    if org is None and (user.is_superuser or getattr(user, "account_type", "") == "super_admin"):
        from core.models import Organization

        org = Organization.objects.filter(is_active=True).order_by("created_at").first()

    module = Module.objects.filter(code=MODULE_CODE, is_active=True).first()
    permissions = _permissions_payload(user)
    if user_has_module_action(user, "production", "view") and not permissions.get("view"):
        permissions = {**permissions, "view": True}

    definitions: list[dict] = []
    flat_stages: list[dict] = []
    industries: list[dict] = []
    work_orders: list[dict] = []
    process_runs: list[dict] = []
    stage_fields_catalog: list[dict] = []
    options: dict[str, Any] = {
        "statuses": [{"value": c.value, "label": c.label} for c in ProcessDefinition.Status],
        "output_types": [{"value": c.value, "label": c.label} for c in ProcessDefinition.OutputType],
        "stage_types": [{"value": c.value, "label": c.label} for c in ProcessStage.StageType],
        "field_types": [{"value": c.value, "label": c.label} for c in ProcessStageField.FieldType],
        "wo_priorities": [{"value": c.value, "label": c.label} for c in WorkOrder.Priority],
        "wo_statuses": [{"value": c.value, "label": c.label} for c in WorkOrder.Status],
        "run_statuses": [{"value": c.value, "label": c.label} for c in ProcessRun.Status],
        "customers": [],
        "batches": [],
        "teams": [],
        "definition_fields": [
            {"key": "name", "label": "Template Name", "required": True},
            {"key": "code", "label": "Code", "required": True},
            {"key": "industry_template_id", "label": "Industry", "required": False},
            {"key": "description", "label": "Description", "required": False},
            {"key": "output_type", "label": "Output Type", "required": False},
            {"key": "status", "label": "Status", "required": False},
        ],
        "instantiate_fields": [
            {"key": "process_definition_id", "label": "Template", "required": True},
            {"key": "wo_no", "label": "Reference Number", "required": True},
            {"key": "title", "label": "Title", "required": True},
            {"key": "customer_party_id", "label": "Customer", "required": False},
            {"key": "batch_id", "label": "Batch", "required": False},
            {"key": "project_code", "label": "Production Order", "required": False},
            {"key": "priority", "label": "Priority", "required": False},
            {"key": "department_id", "label": "Department", "required": False},
            {"key": "planned_start", "label": "Start Date", "required": False},
            {"key": "target_qty", "label": "Target Qty", "required": False},
            {"key": "release", "label": "Release immediately", "required": False},
        ],
        "gaps": [
            {
                "feature": "Stage color / icon columns",
                "detail": "Stored optionally in ProcessStage.ui_config_json (color/icon keys), not dedicated columns.",
            },
            {
                "feature": "Previous/Next/Parent stage graph on definitions",
                "detail": "ProcessStage has no previous_stage/next_stage FKs. Flow uses sort_order + requires_previous_complete + allow_parallel. ProcessRunStage.parent_run_stage exists only on runs.",
            },
            {
                "feature": "Conditional branch / loop edges",
                "detail": "No connection model for branches or loops on ProcessStage.",
            },
            {
                "feature": "Tags on ProcessDefinition",
                "detail": "No tags field on ProcessDefinition.",
            },
            {
                "feature": "QR / Signature / Time / Attachment / Checkbox field types",
                "detail": "ProcessStageField.FieldType has text, number, currency, date, datetime, boolean, dropdown, multi_select, file, image, gps, barcode, rich_text — not qr, signature, time, or attachment aliases.",
            },
            {
                "feature": "Assigned Team on ProcessDefinition stage",
                "detail": "ProcessStage has default_assignee_role (string). Team FK exists on ProcessRunStage only.",
            },
            {
                "feature": "Immutable version snapshot table",
                "detail": "ProcessDefinition.version is an integer; unique is (organization, code). Save Version clones into a new ProcessDefinition row with code suffix _vN.",
            },
            {
                "feature": "Canvas undo/redo persistence",
                "detail": "No undo stack model — client-only if implemented.",
            },
        ],
    }

    selected_def = None
    family_map: dict[str, list[ProcessDefinition]] = {}

    if org:
        stage_qs = ProcessStage.objects.prefetch_related(
            Prefetch("fields", queryset=ProcessStageField.objects.order_by("sort_order"))
        ).order_by("sort_order")

        def_qs = (
            ProcessDefinition.objects.filter(organization=org)
            .select_related(
                "industry_template",
                "created_by__profile",
                "workflow_definition",
                "form_metadata",
                "default_output_item",
            )
            .prefetch_related(Prefetch("stages", queryset=stage_qs))
            .annotate(stage_count=Count("stages", distinct=True), run_count=Count("runs", distinct=True))
            .order_by("name", "-version")
        )
        defs_list = list(def_qs)
        for pd in defs_list:
            family_map.setdefault(family_code(pd.code), []).append(pd)

        definitions = [serialize_definition(pd, family_versions=family_map) for pd in defs_list]
        for d in definitions:
            for s in d["stages"]:
                flat_stages.append(
                    {
                        "id": s["id"],
                        "process_id": s["process_id"],
                        "name": s["name"],
                        "sequence": s["sequence"],
                        "stage_type": s["stage_type"],
                        "code": s["code"],
                    }
                )
                for f in s["fields"]:
                    stage_fields_catalog.append(
                        {
                            **f,
                            "stage_id": s["id"],
                            "stage_name": s["name"],
                            "process_id": s["process_id"],
                            "process_name": d["name"],
                        }
                    )

        if selected_id:
            selected_def = next((p for p in defs_list if str(p.id) == selected_id), None)
        if selected_def is None and defs_list:
            # Prefer active, then most recently updated
            selected_def = next(
                (p for p in defs_list if p.status == ProcessDefinition.Status.ACTIVE),
                defs_list[0],
            )

        industries = [
            serialize_industry_template(t)
            for t in IndustryTemplate.objects.filter(is_active=True).order_by("code")
        ]

        run_stage_qs = ProcessRunStage.objects.select_related(
            "process_stage", "team", "member", "parent_run_stage"
        ).order_by("sort_order", "process_stage__sort_order")

        wo_qs = (
            WorkOrder.objects.filter(organization=org)
            .select_related(
                "process_definition",
                "batch",
                "department",
                "supervisor",
                "customer_party",
                "created_by__profile",
            )
            .prefetch_related(
                Prefetch(
                    "runs",
                    queryset=ProcessRun.objects.prefetch_related(
                        Prefetch("stages", queryset=run_stage_qs)
                    ).order_by("-created_at"),
                )
            )
            .order_by("-date", "-created_at")[:100]
        )
        work_orders = [serialize_work_order_process(wo) for wo in wo_qs]

        run_qs = (
            ProcessRun.objects.filter(organization=org)
            .select_related(
                "process_definition",
                "work_order__created_by__profile",
            )
            .prefetch_related(Prefetch("stages", queryset=run_stage_qs))
            .order_by("-created_at")[:100]
        )
        process_runs = [serialize_process_run(r) for r in run_qs]

        # Party has no dedicated "customer" enum — work orders use Party via customer_party.
        options["customers"] = [
            {
                        "id": str(p.id),
                        "name": p.name,
                        "party_type": p.party_type,
                    }
            for p in Party.objects.filter(organization=org).order_by("name")[:100]
        ]
        options["batches"] = [
            {"id": str(b.id), "batch_no": b.batch_no, "status": b.status}
            for b in Batch.objects.filter(organization=org).order_by("-start_date", "-created_at")[:100]
        ]
        # Team is scoped via Department.organization (no direct organization FK / code).
        options["teams"] = [
            {
                "id": str(t.id),
                "name": t.name,
                "department_id": str(t.department_id) if t.department_id else None,
                "department": t.department.name if t.department_id else "",
            }
            for t in Team.objects.filter(department__organization=org)
            .select_related("department")
            .order_by("name")[:100]
        ]
        options["gaps"].append(
            {
                "feature": "Customer party type",
                "detail": "Party.PartyType has dealer/retailer/institutional/consumer_b2b — no customer choice. Instantiate uses Party via WorkOrder.customer_party.",
            }
        )
        options["gaps"].append(
            {
                "feature": "Assigned Team on WorkOrder",
                "detail": "WorkOrder has department + supervisor, not a team FK. Team applies on ProcessRunStage.",
            }
        )

    canvas = build_canvas(selected_def)

    unread = Notification.objects.filter(user=user, is_read=False).count()
    menus = process_menus_for_user(user, org)
    modules = _modules_payload(user)

    role_name = None
    role_kind = portal.role_kind
    designation = ""
    hr_department = None
    if membership:
        role_kind = membership.role_kind or role_kind
        designation = membership.designation or ""
        if membership.role_id:
            role_name = membership.role.name
        if membership.department_id:
            hr_department = {
                "id": str(membership.department_id),
                "name": membership.department.name,
                "code": membership.department.code,
            }

    company = None
    if org:
        company = {
            "id": str(org.id),
            "name": org.company_name,
            "org_type": org.org_type,
            "org_type_label": org.get_org_type_display(),
            "account_type": org.account_type,
            "account_type_label": org.get_account_type_display(),
            "industry_template_code": org.industry_template_code or "",
        }

    module_payload = None
    if module:
        module_payload = {
            "code": module.code,
            "name": module.name,
            "description": module.description,
            "icon": module.icon,
            "color": module.color,
            "route_path": module.route_path,
            "category": module.category,
        }

    stats = {
        "templates": len(definitions),
        "active_templates": sum(1 for d in definitions if d["status"] == ProcessDefinition.Status.ACTIVE),
        "draft_templates": sum(1 for d in definitions if d["status"] == ProcessDefinition.Status.DRAFT),
        "stages": len(flat_stages),
        "industry_templates": len(industries),
        "work_orders": len(work_orders),
        "process_runs": len(process_runs),
        "active_runs": sum(
            1 for r in process_runs if r["status"] in (ProcessRun.Status.PENDING, ProcessRun.Status.IN_PROGRESS)
        ),
        "avg_run_progress": round(
            sum(r["total_progress"] for r in process_runs) / len(process_runs), 1
        )
        if process_runs
        else 0.0,
    }

    # Keep legacy keys working
    templates_compat = [
        {
            "id": d["id"],
            "name": d["name"],
            "code": d["code"],
            "status": d["status"],
            "version": d["version"],
            "industry": d["industry"],
            "created_by": d["created_by"],
            "updated_at": d["updated_at"],
            "stage_count": d["stage_count"],
            "last_published_version": d["last_published_version"],
            "active_version": d["active_version"],
            "total_runs": d["total_runs"],
            "description": d["description"],
            "family_code": d["family_code"],
            "output_type": d["output_type"],
        }
        for d in definitions
    ]

    return {
        "company": company,
        "department": module_payload,
        "module": module_payload,
        "hr_department": hr_department,
        "role": {
            "name": role_name,
            "kind": role_kind,
            "designation": designation,
            "account_type": getattr(user, "account_type", "") or "",
            "portal": portal.portal,
        },
        "permissions": permissions,
        "menus": menus,
        "modules": modules,
        "search_resources": _search_resources(user),
        "notifications": {"unread_count": unread},
        "statistics": stats,
        "industries": industries,
        "industry_templates": industries,
        "definitions": definitions,
        "templates": templates_compat,
        "stages": flat_stages,
        "stage_fields": stage_fields_catalog,
        "work_orders": work_orders,
        "process_runs": process_runs,
        "canvas": canvas,
        "selected_template_id": str(selected_def.id) if selected_def else None,
        "options": options,
        "meta": {
            "title": module.name if module else "Process Engine",
            "subtitle": "process_definition · process_stage · workflow-driven",
            "company_name": company["name"] if company else None,
            "module_name": module.name if module else "Process Engine",
            "department_name": module.name if module else "Process Engine",
            "role_label": role_name or designation or role_kind or "",
        },
        "field_schema": {
            "definition": options["definition_fields"],
            "instantiate": options["instantiate_fields"],
            "statuses": options["statuses"],
            "output_types": options["output_types"],
            "stage_types": options["stage_types"],
            "field_types": options["field_types"],
        },
    }
