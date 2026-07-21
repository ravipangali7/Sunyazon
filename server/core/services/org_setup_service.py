"""Organization setup — rules 13–16."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, status_snapshot, write_audit


@transaction.atomic
def install_industry_template(organization, *, template=None, actor=None):
    """
    On Organization create + industry_template_code →
    copy IndustryTemplate into ProcessDefinition + ProcessStage + ProcessStageField;
    set enabled_capabilities.
    """
    from core.models import (
        IndustryTemplate,
        ProcessDefinition,
        ProcessStage,
        ProcessStageField,
    )

    code = organization.industry_template_code
    if template is None:
        if not code:
            return None
        template = IndustryTemplate.objects.filter(code=code, is_active=True).first()
        if template is None:
            raise DomainError(f"Industry template not found: {code}", code="template_missing")

    caps = list(template.default_capabilities or [])
    organization.enabled_capabilities = caps
    organization.industry_template_code = template.code
    organization.save(update_fields=["enabled_capabilities", "industry_template_code"])

    stages_json = template.default_stages_json or []
    fields_json = template.default_fields_json or {}

    process = ProcessDefinition.objects.create(
        organization=organization,
        industry_template=template,
        name=f"{template.code} process",
        code=f"{template.code}_default",
        version=1,
        status=ProcessDefinition.Status.ACTIVE,
    )

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
        entity=organization,
        action="org.template_installed",
        after={"template": template.code, "process_id": str(process.pk)},
        tenant=organization.tenant,
    )
    return process


@transaction.atomic
def set_capabilities(organization, *, capabilities: list, actor=None):
    """Disable capability → hide menus/workflows; keep historical transactions."""
    before = {"enabled_capabilities": list(organization.enabled_capabilities or [])}
    organization.enabled_capabilities = list(capabilities)
    organization.save(update_fields=["enabled_capabilities"])
    write_audit(
        actor=actor,
        entity=organization,
        action="org.capabilities_updated",
        before=before,
        after={"enabled_capabilities": capabilities},
        tenant=organization.tenant,
    )
    return organization


@transaction.atomic
def sign_board_declaration(declaration, *, signed_by=None, actor=None, verify_org: bool = False):
    from core.models import BoardDeclaration

    before = status_snapshot(declaration, ["status", "signed_at"])
    declaration.status = BoardDeclaration.Status.SIGNED
    declaration.signed_at = timezone.now()
    if signed_by is not None:
        declaration.signed_by = signed_by
    declaration.save(update_fields=["status", "signed_at", "signed_by"])

    if verify_org:
        org = declaration.organization
        org.is_verified = True
        org.save(update_fields=["is_verified"])

    write_audit(
        actor=actor,
        entity=declaration,
        action="board.signed",
        before=before,
        after=status_snapshot(declaration, ["status", "signed_at"]),
    )
    return declaration


@transaction.atomic
def complete_meeting(meeting, *, minutes_doc=None, actor=None):
    """Meeting completed → require/attach minutes Document."""
    from core.models import Meeting

    if minutes_doc is None and not meeting.minutes_doc_id:
        raise DomainError("Meeting minutes document required", code="minutes_required")

    before = status_snapshot(meeting, ["status"])
    if minutes_doc is not None:
        meeting.minutes_doc = minutes_doc
    meeting.status = Meeting.Status.COMPLETED
    meeting.save(update_fields=["status", "minutes_doc"] if minutes_doc else ["status"])
    write_audit(
        actor=actor,
        entity=meeting,
        action="meeting.completed",
        before=before,
        after=status_snapshot(meeting, ["status"]),
    )
    return meeting
