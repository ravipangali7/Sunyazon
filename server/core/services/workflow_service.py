"""Workflow / Task / Approval engine — rules 1–8."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, write_audit


@transaction.atomic
def start_workflow(
    *,
    definition,
    tenant,
    organization,
    entity_type: str,
    entity_id,
    actor=None,
):
    """On published WorkflowDefinition + matching event → instance + seed Tasks."""
    from core.models import Task, WorkflowDefinition, WorkflowInstance

    if definition.status != WorkflowDefinition.Status.PUBLISHED:
        raise DomainError("Workflow definition must be published", code="workflow_not_published")

    instance = WorkflowInstance.objects.create(
        definition=definition,
        tenant=tenant,
        organization=organization,
        entity_type=entity_type,
        entity_id=entity_id,
        current_step="",
        status=WorkflowInstance.Status.RUNNING,
    )

    steps = definition.steps_json or []
    tasks = []
    for idx, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        title = step.get("title") or step.get("name") or f"Step {idx + 1}"
        assignee_id = step.get("assignee_id") or step.get("assignee")
        task = Task.objects.create(
            tenant=tenant,
            organization=organization,
            workflow_instance=instance,
            title=title,
            priority=step.get("priority", Task.Priority.MEDIUM),
            status=Task.Status.ASSIGNED if assignee_id else Task.Status.NEW,
            assignee_id=assignee_id,
            checklist_json=step.get("checklist", []),
        )
        tasks.append(task)
        if idx == 0:
            instance.current_step = title
            instance.save(update_fields=["current_step"])

    write_audit(
        actor=actor,
        entity=instance,
        action="workflow.started",
        after={"definition": str(definition.pk), "tasks": len(tasks)},
        tenant=tenant,
    )
    return instance, tasks


@transaction.atomic
def decide_approval(
    approval,
    *,
    decision: str,
    remarks: str = "",
    actor=None,
    amount=None,
):
    """
    Approval decision cascade:
    - approved (all required levels) → advance Task / WorkflowInstance
    - rejected / returned → rewind + notify requester
    - amount-bearing → enforce Actor.approval_limit
    """
    from core.models import Approval, Task, WorkflowInstance

    if decision not in {
        Approval.Decision.APPROVED,
        Approval.Decision.REJECTED,
        Approval.Decision.RETURNED,
    }:
        raise DomainError(f"Invalid decision: {decision}", code="invalid_decision")

    if approval.decision != Approval.Decision.PENDING:
        raise DomainError("Approval already decided", code="already_decided")

    if (
        decision == Approval.Decision.APPROVED
        and amount is not None
        and approval.approver
        and approval.approver.approval_limit
        and amount > approval.approver.approval_limit
    ):
        raise DomainError(
            "Amount exceeds approver limit — escalate to next level",
            code="approval_limit_exceeded",
        )

    before = status_snapshot(approval, ["decision", "remarks"])
    approval.decision = decision
    approval.remarks = remarks
    approval.decided_at = timezone.now()
    approval.save(update_fields=["decision", "remarks", "decided_at"])

    task = approval.task
    pending = task.approvals.filter(decision=Approval.Decision.PENDING).exists()

    if decision == Approval.Decision.APPROVED and not pending:
        task.status = Task.Status.COMPLETED
        task.save(update_fields=["status"])
        _advance_workflow(task)
    elif decision in {Approval.Decision.REJECTED, Approval.Decision.RETURNED}:
        task.status = Task.Status.IN_PROGRESS if decision == Approval.Decision.RETURNED else Task.Status.CLOSED
        task.save(update_fields=["status"])
        if task.assignee and task.assignee.user_id:
            notify(
                task.assignee.user,
                title=f"Approval {decision}: {task.title}",
                body=remarks or f"Your request was {decision}.",
                type="approval",
            )

    write_audit(
        actor=actor or approval.approver,
        entity=approval,
        action=f"approval.{decision}",
        before=before,
        after=status_snapshot(approval, ["decision", "remarks"]),
    )
    return approval


def _advance_workflow(task):
    from core.models import Task, WorkflowInstance

    wi = task.workflow_instance
    if not wi or wi.status != WorkflowInstance.Status.RUNNING:
        return
    open_tasks = wi.tasks.exclude(
        status__in={Task.Status.COMPLETED, Task.Status.VERIFIED, Task.Status.CLOSED}
    )
    if not open_tasks.exists():
        wi.status = WorkflowInstance.Status.COMPLETED
        wi.completed_at = timezone.now()
        wi.save(update_fields=["status", "completed_at"])
    else:
        nxt = open_tasks.order_by("created_at").first()
        wi.current_step = nxt.title
        wi.save(update_fields=["current_step"])


@transaction.atomic
def escalate_sla_breach(workflow_instance, *, actor=None):
    """SLA breach → escalation notification."""
    from core.models import Task

    for task in workflow_instance.tasks.exclude(
        status__in={"completed", "verified", "closed"}
    ):
        if task.assignee and task.assignee.user_id:
            notify(
                task.assignee.user,
                title=f"SLA escalation: {task.title}",
                body="Workflow SLA breached — escalate immediately.",
                type="escalation",
            )
    write_audit(
        actor=actor,
        entity=workflow_instance,
        action="workflow.sla_breach",
        tenant=workflow_instance.tenant,
    )


@transaction.atomic
def apply_rule_action(rule_or_policy, *, context: dict | None = None, actor=None):
    """Execute action_json from Rule/Policy (e.g. create PR, notify, block)."""
    action = getattr(rule_or_policy, "action_json", None) or {}
    context = context or {}
    result = {"actions": []}

    if action.get("notify_user_id"):
        from core.models import User

        user = User.objects.filter(pk=action["notify_user_id"]).first()
        notify(
            user,
            title=action.get("title", "Policy alert"),
            body=action.get("body", ""),
            type=action.get("type", "warning"),
        )
        result["actions"].append("notify")

    if action.get("create_pr") and context.get("organization") and context.get("item"):
        from core.services.procurement_service import create_reorder_pr

        pr = create_reorder_pr(
            organization=context["organization"],
            item=context["item"],
            qty=context.get("qty") or action.get("order_qty"),
            actor=actor,
        )
        result["actions"].append("create_pr")
        result["pr_id"] = str(pr.pk) if pr else None

    if action.get("block"):
        result["blocked"] = True
        result["actions"].append("block")

    write_audit(
        actor=actor,
        entity=rule_or_policy,
        action="rule.executed",
        after=result,
    )
    return result
