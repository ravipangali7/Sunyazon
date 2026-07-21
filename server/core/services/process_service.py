"""Work order & process engine — rules 43–53."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, status_snapshot, today, write_audit
from core.services.stock_service import post_ledger


@transaction.atomic
def release_work_order(work_order, *, actor=None, run_no: str | None = None):
    """
    WO released → ProcessRun + ProcessRunStage from ProcessDefinition stages.
    BOM approved × WO → draft MaterialIssue from BOM lines.
    """
    from core.models import (
        BOM,
        MaterialIssue,
        MaterialIssueLine,
        ProcessRun,
        ProcessRunStage,
        Warehouse,
        WorkOrder,
    )

    if work_order.status != WorkOrder.Status.DRAFT:
        raise DomainError("Only draft WO can be released", code="invalid_status")
    if not work_order.process_definition_id:
        raise DomainError("Work order needs a process definition", code="no_process")

    before = status_snapshot(work_order, ["status"])
    work_order.status = WorkOrder.Status.RELEASED
    work_order.save(update_fields=["status"])

    definition = work_order.process_definition
    run = ProcessRun.objects.create(
        organization=work_order.organization,
        work_order=work_order,
        process_definition=definition,
        run_no=run_no or f"RUN-{timezone.now():%Y%m%d%H%M%S}",
        status=ProcessRun.Status.PENDING,
    )

    for stage in definition.stages.order_by("sort_order"):
        ProcessRunStage.objects.create(
            process_run=run,
            process_stage=stage,
            status=ProcessRunStage.Status.PENDING,
            goal_qty=work_order.target_qty or 0,
        )

    material_issue = None
    bom = work_order.bom
    if bom and bom.status == BOM.Status.APPROVED:
        warehouse = Warehouse.objects.filter(
            organization=work_order.organization, type=Warehouse.Type.RAW
        ).first()
        if warehouse:
            material_issue = MaterialIssue.objects.create(
                organization=work_order.organization,
                issue_no=f"MI-{timezone.now():%Y%m%d%H%M%S}",
                work_order=work_order,
                process_run=run,
                date=today(),
                warehouse=warehouse,
                status=MaterialIssue.Status.DRAFT,
            )
            target = Decimal(work_order.target_qty or 0)
            for bl in bom.lines.select_related("raw_material"):
                scrap = Decimal(bl.scrap_pct or 0) / Decimal("100")
                req = Decimal(bl.qty_per_unit) * target * (Decimal("1") + scrap)
                MaterialIssueLine.objects.create(
                    issue=material_issue,
                    material=bl.raw_material,
                    required_qty=req,
                    issued_qty=0,
                )

    write_audit(
        actor=actor,
        entity=work_order,
        action="wo.released",
        before=before,
        after={"run": str(run.pk)},
    )
    return work_order, run, material_issue


@transaction.atomic
def start_run_stage(run_stage, *, actor=None):
    """Block if requires_previous_complete and prior not done."""
    from core.models import ProcessRun, ProcessRunStage

    stage_def = run_stage.process_stage
    if stage_def.requires_previous_complete and not stage_def.allow_parallel:
        prior = (
            ProcessRunStage.objects.filter(
                process_run=run_stage.process_run,
                process_stage__sort_order__lt=stage_def.sort_order,
            )
            .exclude(status__in={ProcessRunStage.Status.COMPLETED, ProcessRunStage.Status.SKIPPED})
            .exists()
        )
        if prior:
            raise DomainError("Previous stage must be completed", code="stage_blocked")

    run_stage.status = ProcessRunStage.Status.IN_PROGRESS
    run_stage.save(update_fields=["status"])

    run = run_stage.process_run
    if run.status == ProcessRun.Status.PENDING:
        run.status = ProcessRun.Status.IN_PROGRESS
        run.started_at = timezone.now()
        run.save(update_fields=["status", "started_at"])
        wo = run.work_order
        if wo and wo.status == wo.Status.RELEASED:
            wo.status = wo.Status.IN_PROGRESS
            wo.save(update_fields=["status"])

    write_audit(actor=actor, entity=run_stage, action="stage.started")
    return run_stage


@transaction.atomic
def complete_run_stage(run_stage, *, actor=None, require_qc: bool = True):
    """QC stages blocked until InProcessQC / FinalQARelease pass."""
    from core.models import FinalQARelease, InProcessQC, ProcessRunStage, ProcessStage

    stage_def = run_stage.process_stage
    if require_qc and stage_def.stage_type == ProcessStage.StageType.INSPECT:
        qc_ok = InProcessQC.objects.filter(
            process_run_stage=run_stage, status="pass"
        ).exists() or FinalQARelease.objects.filter(
            process_run_stage=run_stage, release_status="released"
        ).exists()
        if not qc_ok:
            raise DomainError("QC pass required before completing inspect stage", code="qc_required")

    run_stage.status = ProcessRunStage.Status.COMPLETED
    run_stage.save(update_fields=["status"])
    write_audit(actor=actor, entity=run_stage, action="stage.completed")
    _maybe_complete_run(run_stage.process_run, actor=actor)
    return run_stage


def _maybe_complete_run(run, *, actor=None):
    from core.models import ProcessRun, ProcessRunStage, WorkOrder

    open_stages = run.stages.exclude(
        status__in={ProcessRunStage.Status.COMPLETED, ProcessRunStage.Status.SKIPPED}
    )
    if open_stages.exists():
        return

    run.status = ProcessRun.Status.COMPLETED
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "completed_at"])

    wo = run.work_order
    if wo:
        wo.status = WorkOrder.Status.COMPLETED
        wo.actual_qty = wo.actual_qty or wo.target_qty
        wo.save(update_fields=["status", "actual_qty"])
        write_audit(actor=actor, entity=wo, action="wo.completed")


@transaction.atomic
def commit_run_line(run_line, *, actor=None):
    """
    ProcessRunLine commit:
    input/consumable → OUT; output/deliverable → IN; wastage → OUT; refine → apply qtys.
    Sets stock_ledger_id.
    """
    from core.models import ProcessRunLine, StockLedger

    if run_line.stock_ledger_id:
        raise DomainError("Line already committed to stock", code="already_committed")

    org = run_line.process_run_stage.process_run.organization
    run = run_line.process_run_stage.process_run
    lt = run_line.line_type
    entry = None

    if lt in {ProcessRunLine.LineType.INPUT, ProcessRunLine.LineType.CONSUMABLE}:
        if not run_line.from_warehouse_id or not run_line.item_id:
            raise DomainError("from_warehouse and item required for input", code="missing_fields")
        entry = post_ledger(
            organization=org,
            item=run_line.item,
            warehouse=run_line.from_warehouse,
            transaction_type=StockLedger.TransactionType.OUT,
            qty=run_line.qty,
            reference_type="process_run_line",
            reference_id=run_line.pk,
            work_order=run.work_order,
            process_run=run,
            actor=actor,
        )
    elif lt in {ProcessRunLine.LineType.OUTPUT, ProcessRunLine.LineType.DELIVERABLE}:
        if not run_line.to_warehouse_id or not run_line.item_id:
            raise DomainError("to_warehouse and item required for output", code="missing_fields")
        entry = post_ledger(
            organization=org,
            item=run_line.item,
            warehouse=run_line.to_warehouse,
            transaction_type=StockLedger.TransactionType.IN,
            qty=run_line.qty,
            reference_type="process_run_line",
            reference_id=run_line.pk,
            work_order=run.work_order,
            process_run=run,
            actor=actor,
        )
    elif lt == ProcessRunLine.LineType.WASTAGE:
        if not run_line.from_warehouse_id or not run_line.item_id:
            raise DomainError("from_warehouse and item required for wastage", code="missing_fields")
        entry = post_ledger(
            organization=org,
            item=run_line.item,
            warehouse=run_line.from_warehouse,
            transaction_type=StockLedger.TransactionType.OUT,
            qty=run_line.qty,
            reference_type="process_run_line",
            reference_id=run_line.pk,
            work_order=run.work_order,
            process_run=run,
            actor=actor,
        )
    elif lt == ProcessRunLine.LineType.REFINE:
        # refine_input OUT, refine_output IN, loss as OUT
        if run_line.item_id and run_line.from_warehouse_id and getattr(run_line, "refine_input_qty", None):
            post_ledger(
                organization=org,
                item=run_line.item,
                warehouse=run_line.from_warehouse,
                transaction_type=StockLedger.TransactionType.OUT,
                qty=run_line.refine_input_qty or run_line.qty,
                reference_type="process_run_line",
                reference_id=run_line.pk,
                process_run=run,
                actor=actor,
            )
        if run_line.item_id and run_line.to_warehouse_id and getattr(run_line, "refine_output_qty", None):
            entry = post_ledger(
                organization=org,
                item=run_line.item,
                warehouse=run_line.to_warehouse,
                transaction_type=StockLedger.TransactionType.IN,
                qty=run_line.refine_output_qty or 0,
                reference_type="process_run_line",
                reference_id=run_line.pk,
                process_run=run,
                actor=actor,
            )

    if entry:
        run_line.stock_ledger = entry
        run_line.save(update_fields=["stock_ledger"])

    write_audit(actor=actor, entity=run_line, action="run_line.committed")
    return run_line, entry


@transaction.atomic
def approve_damage_expire(damage, *, warehouse, approved_by=None, actor=None):
    """DamageExpire approved → StockLedger OUT."""
    from core.models import StockLedger

    if not damage.item_id:
        raise DomainError("Item required", code="missing_item")
    if damage.stock_ledger_id:
        raise DomainError("Already posted", code="already_posted")

    if approved_by is not None:
        damage.approved_by = approved_by
        damage.save(update_fields=["approved_by"])

    entry = post_ledger(
        organization=damage.organization,
        item=damage.item,
        warehouse=warehouse,
        transaction_type=StockLedger.TransactionType.OUT,
        qty=damage.qty,
        reference_type="damage_expire",
        reference_id=damage.pk,
        work_order=damage.work_order,
        date=damage.date,
        actor=actor,
    )
    damage.stock_ledger = entry
    damage.save(update_fields=["stock_ledger"])
    return damage, entry


@transaction.atomic
def quarantine_batch(batch, *, actor=None):
    from core.models import Batch

    before = status_snapshot(batch, ["status"])
    batch.status = Batch.Status.QUARANTINED
    batch.save(update_fields=["status"])
    write_audit(actor=actor, entity=batch, action="batch.quarantined", before=before)
    return batch


@transaction.atomic
def close_batch(batch, *, actor=None):
    from core.models import Batch

    before = status_snapshot(batch, ["status"])
    batch.status = Batch.Status.CLOSED
    batch.save(update_fields=["status"])
    write_audit(actor=actor, entity=batch, action="batch.closed", before=before)
    return batch


def _family_code(code: str) -> str:
    import re

    return re.sub(r"_v\d+$", "", code or "", flags=re.IGNORECASE)


def _next_versioned_code(organization, base: str, version: int) -> str:
    """Build a unique org code for a cloned version (unique_together organization+code)."""
    from core.models import ProcessDefinition

    candidate = f"{base}_v{version}"
    n = version
    while ProcessDefinition.objects.filter(organization=organization, code=candidate).exists():
        n += 1
        candidate = f"{base}_v{n}"
    return candidate


def _copy_stages(source, target, *, actor=None):
    from core.models import ProcessStage, ProcessStageField

    stage_map = {}
    for stage in source.stages.prefetch_related("fields").order_by("sort_order"):
        ns = ProcessStage.objects.create(
            process_definition=target,
            code=stage.code,
            name=stage.name,
            sort_order=stage.sort_order,
            stage_type=stage.stage_type,
            is_optional=stage.is_optional,
            requires_previous_complete=stage.requires_previous_complete,
            allow_parallel=stage.allow_parallel,
            default_assignee_role=stage.default_assignee_role,
            sla_hours=stage.sla_hours,
            ui_config_json=stage.ui_config_json or {},
        )
        stage_map[stage.pk] = ns
        for field in stage.fields.all():
            ProcessStageField.objects.create(
                process_stage=ns,
                field_key=field.field_key,
                label=field.label,
                field_type=field.field_type,
                is_required=field.is_required,
                options_json=field.options_json,
                validation_json=field.validation_json,
                default_value=field.default_value,
                sort_order=field.sort_order,
                show_on_dashboard=field.show_on_dashboard,
            )
    return stage_map


@transaction.atomic
def create_process_definition(organization, *, data: dict, actor=None):
    from core.models import IndustryTemplate, ProcessDefinition

    name = (data.get("name") or "").strip()
    code = (data.get("code") or "").strip()
    if not name or not code:
        raise DomainError("name and code are required", code="missing_fields")
    if ProcessDefinition.objects.filter(organization=organization, code=code).exists():
        raise DomainError(f"Process code already exists: {code}", code="duplicate_code")

    industry = None
    industry_id = data.get("industry_template_id")
    if industry_id:
        industry = IndustryTemplate.objects.filter(pk=industry_id, is_active=True).first()
        if industry is None:
            raise DomainError("Industry template not found", code="industry_missing")

    status = data.get("status") or ProcessDefinition.Status.DRAFT
    if status not in ProcessDefinition.Status.values:
        status = ProcessDefinition.Status.DRAFT

    output_type = data.get("output_type") or ProcessDefinition.OutputType.PRODUCT
    if output_type not in ProcessDefinition.OutputType.values:
        output_type = ProcessDefinition.OutputType.PRODUCT

    pd = ProcessDefinition.objects.create(
        organization=organization,
        industry_template=industry,
        code=code,
        name=name,
        description=data.get("description") or "",
        output_type=output_type,
        version=int(data.get("version") or 1),
        status=status,
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    write_audit(actor=actor, entity=pd, action="process_definition.created")
    return pd


@transaction.atomic
def duplicate_process_definition(source, *, actor=None, new_code: str | None = None):
    from core.models import ProcessDefinition

    base = _family_code(source.code)
    code = (new_code or f"{base}_copy").strip()
    if ProcessDefinition.objects.filter(organization=source.organization, code=code).exists():
        code = f"{base}_copy_{timezone.now():%Y%m%d%H%M%S}"

    clone = ProcessDefinition.objects.create(
        organization=source.organization,
        industry_template=source.industry_template,
        code=code,
        name=f"{source.name} (copy)",
        description=source.description,
        output_type=source.output_type,
        default_output_item=source.default_output_item,
        form_metadata=source.form_metadata,
        workflow_definition=source.workflow_definition,
        version=1,
        status=ProcessDefinition.Status.DRAFT,
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    _copy_stages(source, clone, actor=actor)
    write_audit(
        actor=actor,
        entity=clone,
        action="process_definition.duplicated",
        after={"source": str(source.pk)},
    )
    return clone


@transaction.atomic
def save_process_version(source, *, actor=None):
    """
    Clone definition + stages into a new ProcessDefinition row with incremented version.
    Does not overwrite the prior row (org+code is unique, so code becomes {family}_v{N}).
    """
    from core.models import ProcessDefinition

    base = _family_code(source.code)
    siblings = list(
        ProcessDefinition.objects.filter(organization=source.organization).filter(
            Q_code_family(base)
        )
    )
    if not siblings:
        siblings = [source]
    next_ver = max(s.version for s in siblings) + 1
    new_code = _next_versioned_code(source.organization, base, next_ver)

    clone = ProcessDefinition.objects.create(
        organization=source.organization,
        industry_template=source.industry_template,
        code=new_code,
        name=source.name,
        description=source.description,
        output_type=source.output_type,
        default_output_item=source.default_output_item,
        form_metadata=source.form_metadata,
        workflow_definition=source.workflow_definition,
        version=next_ver,
        status=ProcessDefinition.Status.DRAFT,
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    _copy_stages(source, clone, actor=actor)
    write_audit(
        actor=actor,
        entity=clone,
        action="process_definition.version_saved",
        after={"source": str(source.pk), "version": next_ver},
    )
    return clone


def Q_code_family(base: str):
    from django.db.models import Q

    return Q(code=base) | Q(code__startswith=f"{base}_v")


@transaction.atomic
def archive_process_definition(pd, *, actor=None):
    from core.models import ProcessDefinition

    before = status_snapshot(pd, ["status"])
    pd.status = ProcessDefinition.Status.ARCHIVED
    pd.save(update_fields=["status", "updated_at"])
    write_audit(
        actor=actor,
        entity=pd,
        action="process_definition.archived",
        before=before,
        after=status_snapshot(pd, ["status"]),
    )
    return pd


@transaction.atomic
def publish_process_definition(pd, *, actor=None, archive_siblings: bool = True):
    """Set status=active. Optionally archive other active defs in the same family."""
    from core.models import ProcessDefinition

    before = status_snapshot(pd, ["status"])
    base = _family_code(pd.code)
    if archive_siblings:
        ProcessDefinition.objects.filter(
            organization=pd.organization,
        ).filter(Q_code_family(base)).exclude(pk=pd.pk).filter(
            status=ProcessDefinition.Status.ACTIVE
        ).update(status=ProcessDefinition.Status.ARCHIVED)

    pd.status = ProcessDefinition.Status.ACTIVE
    pd.save(update_fields=["status", "updated_at"])
    write_audit(
        actor=actor,
        entity=pd,
        action="process_definition.published",
        before=before,
        after=status_snapshot(pd, ["status"]),
    )
    return pd


@transaction.atomic
def delete_process_definition(pd, *, actor=None):
    from core.models import ProcessRun, WorkOrder

    if WorkOrder.objects.filter(process_definition=pd).exists():
        raise DomainError("Cannot delete: work orders reference this definition", code="in_use")
    if ProcessRun.objects.filter(process_definition=pd).exists():
        raise DomainError("Cannot delete: process runs reference this definition", code="in_use")

    pk = pd.pk
    write_audit(actor=actor, entity=pd, action="process_definition.deleted", after={"id": str(pk)})
    pd.delete()
    return pk


@transaction.atomic
def reorder_process_stages(definition, *, stage_ids: list, actor=None):
    """Persist drag-and-drop order via ProcessStage.sort_order."""
    from core.models import ProcessStage

    stages = {
        str(s.pk): s
        for s in ProcessStage.objects.filter(process_definition=definition)
    }
    if len(stage_ids) != len(stages):
        raise DomainError("stage_ids must include every stage on the definition", code="invalid_order")
    for sid in stage_ids:
        if sid not in stages:
            raise DomainError(f"Unknown stage: {sid}", code="unknown_stage")

    for idx, sid in enumerate(stage_ids):
        st = stages[sid]
        if st.sort_order != idx:
            st.sort_order = idx
            st.save(update_fields=["sort_order"])

    write_audit(
        actor=actor,
        entity=definition,
        action="process_stages.reordered",
        after={"order": stage_ids},
    )
    return list(
        ProcessStage.objects.filter(process_definition=definition).order_by("sort_order")
    )


@transaction.atomic
def instantiate_process(
    organization,
    *,
    process_definition,
    data: dict,
    actor=None,
    release: bool = True,
):
    """
    Create WorkOrder from a ProcessDefinition; optionally release → ProcessRun + stages.
    Stages are never created manually — release_work_order materializes them.
    """
    from core.models import Batch, Department, Party, WorkOrder
    from core.services.common import today as _today

    wo_no = (data.get("wo_no") or data.get("reference_number") or "").strip()
    title = (data.get("title") or process_definition.name or "").strip()
    if not wo_no:
        wo_no = f"WO-{timezone.now():%Y%m%d%H%M%S}"
    if WorkOrder.objects.filter(organization=organization, wo_no=wo_no).exists():
        raise DomainError(f"Work order already exists: {wo_no}", code="duplicate_wo")

    priority = data.get("priority") or WorkOrder.Priority.MEDIUM
    if priority not in WorkOrder.Priority.values:
        priority = WorkOrder.Priority.MEDIUM

    customer = None
    if data.get("customer_party_id"):
        customer = Party.objects.filter(organization=organization, pk=data["customer_party_id"]).first()

    batch = None
    if data.get("batch_id"):
        batch = Batch.objects.filter(organization=organization, pk=data["batch_id"]).first()

    department = None
    if data.get("department_id"):
        department = Department.objects.filter(organization=organization, pk=data["department_id"]).first()

    planned_start = data.get("planned_start") or data.get("start_date")
    wo = WorkOrder.objects.create(
        organization=organization,
        process_definition=process_definition,
        wo_no=wo_no,
        title=title,
        batch=batch,
        priority=priority,
        planned_start=planned_start,
        department=department,
        customer_party=customer,
        project_code=data.get("project_code") or data.get("production_order") or "",
        target_qty=data.get("target_qty"),
        status=WorkOrder.Status.DRAFT,
        date=_today(),
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    write_audit(actor=actor, entity=wo, action="work_order.instantiated", after={"definition": str(process_definition.pk)})

    run = None
    material_issue = None
    do_release = data.get("release", release)
    if do_release is True or do_release == "true" or do_release == 1:
        wo, run, material_issue = release_work_order(wo, actor=actor, run_no=data.get("run_no"))
    return wo, run, material_issue


@transaction.atomic
def install_industry_for_org(organization, *, template_id=None, template_code=None, actor=None):
    """Install IndustryTemplate → ProcessDefinition + stages (unique code if default exists)."""
    from core.models import IndustryTemplate, ProcessDefinition, ProcessStage, ProcessStageField
    from core.services.org_setup_service import install_industry_template

    template = None
    if template_id:
        template = IndustryTemplate.objects.filter(pk=template_id, is_active=True).first()
    elif template_code:
        template = IndustryTemplate.objects.filter(code=template_code, is_active=True).first()
    if template is None:
        raise DomainError("Industry template not found", code="template_missing")

    default_code = f"{template.code}_default"
    if not ProcessDefinition.objects.filter(organization=organization, code=default_code).exists():
        process = install_industry_template(organization, template=template, actor=actor)
        if process is None:
            raise DomainError("Install returned nothing", code="install_failed")
        return process

    # Default already installed — create a fresh uniquely coded definition from template JSON
    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    code = f"{template.code}_{stamp}"
    process = ProcessDefinition.objects.create(
        organization=organization,
        industry_template=template,
        name=f"{template.name} process",
        code=code,
        version=1,
        status=ProcessDefinition.Status.ACTIVE,
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    stages_json = template.default_stages_json or []
    fields_json = template.default_fields_json or {}
    for idx, stage in enumerate(stages_json):
        if isinstance(stage, str):
            stage = {"name": stage, "stage_type": "custom"}
        stage_name = stage.get("name", f"Stage {idx + 1}")
        stage_code = stage.get("code") or f"stage_{idx + 1}"
        ps = ProcessStage.objects.create(
            process_definition=process,
            code=stage_code,
            name=stage_name,
            stage_type=stage.get("stage_type", ProcessStage.StageType.CUSTOM),
            sort_order=stage.get("sort_order", idx),
            requires_previous_complete=stage.get("requires_previous_complete", True),
            allow_parallel=stage.get("allow_parallel", False),
            sla_hours=stage.get("sla_hours"),
        )
        for field_def in fields_json.get(stage_name, []) or stage.get("fields", []):
            if isinstance(field_def, str):
                field_def = {"field_key": field_def, "label": field_def}
            ProcessStageField.objects.create(
                process_stage=ps,
                field_key=field_def.get("field_key", field_def.get("key", "field")),
                label=field_def.get("label", ""),
                field_type=field_def.get("field_type", "text"),
                is_required=field_def.get("is_required", field_def.get("required", False)),
                options_json=field_def.get("options_json"),
            )
    write_audit(
        actor=actor,
        entity=process,
        action="org.template_installed",
        after={"template": template.code, "process_id": str(process.pk)},
        tenant=organization.tenant,
    )
    return process
