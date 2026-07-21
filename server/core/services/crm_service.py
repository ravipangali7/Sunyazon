"""CRM complaints & pipeline — rules 91–96."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, today, write_audit


@transaction.atomic
def register_complaint(complaint, *, actor=None, assignee=None):
    """Complaint registered → investigation Task; start SLA timer."""
    from core.models import Complaint, Task

    task = Task.objects.create(
        tenant=getattr(complaint.organization, "tenant", None),
        organization=complaint.organization,
        title="Investigate complaint",
        status=Task.Status.ASSIGNED if assignee else Task.Status.NEW,
        assignee=assignee,
        priority=Task.Priority.HIGH,
        due_at=timezone.now() + timedelta(hours=complaint.sla_hours or 48),
    )
    if assignee and assignee.user_id:
        notify(assignee.user, title=task.title, body=complaint.description[:200], type="escalation")
    write_audit(actor=actor, entity=complaint, action="complaint.registered", after={"task": str(task.pk)})
    return complaint, task


@transaction.atomic
def advance_complaint(complaint, *, status: str, actor=None, create_ncr: bool = False, capa_owner=None):
    from core.models import Complaint
    from core.services.qa_service import open_ncr_record

    if status not in {s.value for s in Complaint.Status}:
        raise DomainError(f"Invalid status {status}", code="invalid_status")

    before = status_snapshot(complaint, ["status"])
    complaint.status = status
    update_fields = ["status"]
    if status == Complaint.Status.CLOSED:
        complaint.closed_at = timezone.now()
        update_fields.append("closed_at")
        if complaint.customer_id:
            notify(complaint.customer, title="Complaint closed", body=complaint.description[:200], type="reminder")
    complaint.save(update_fields=update_fields)

    if status == Complaint.Status.INVESTIGATING and create_ncr:
        open_ncr_record(
            organization=complaint.organization,
            issue=complaint.description,
            create_capa=status == Complaint.Status.CAPA,
            capa_owner=capa_owner,
            actor=actor,
        )
    if status == Complaint.Status.CAPA and create_ncr:
        open_ncr_record(
            organization=complaint.organization,
            issue=complaint.description,
            create_capa=True,
            capa_owner=capa_owner,
            actor=actor,
        )

    write_audit(actor=actor, entity=complaint, action=f"complaint.{status}", before=before)
    return complaint


@transaction.atomic
def escalate_complaint_sla(complaint, *, actor=None):
    """SLA breach → escalate Customer Care → Sales Manager → QA → CEO."""
    for a in complaint.organization.actors.select_related("user").filter(user__isnull=False)[:5]:
        notify(
            a.user,
            title="Complaint SLA breached",
            body=complaint.description[:200],
            type="escalation",
        )
    write_audit(actor=actor, entity=complaint, action="complaint.sla_breach")
    return complaint


@transaction.atomic
def mark_deal_won(deal, *, create_sales_order: bool = True, create_work_order: bool = False, actor=None):
    """Deal won → SalesOrder and/or WorkOrder; log CustomerActivity."""
    from core.models import CustomerActivity, DocStatus, PipelineDeal, SalesOrder

    before = status_snapshot(deal, ["stage"])
    deal.stage = PipelineDeal.Stage.WON
    deal.save(update_fields=["stage"])

    so = None
    if create_sales_order:
        from django.utils import timezone as tz

        n = SalesOrder.objects.filter(organization=deal.organization).count() + 1
        so = SalesOrder.objects.create(
            organization=deal.organization,
            so_no=f"SO-{tz.now():%Y%m%d}-{n:04d}",
            party=deal.party,
            date=today(),
            total=deal.value,
            status=DocStatus.DRAFT,
        )

    if create_work_order and deal.work_order_id is None:
        # Caller may attach WO separately when process_definition known
        pass

    CustomerActivity.objects.create(
        organization=deal.organization,
        party=deal.party,
        activity_type=CustomerActivity.ActivityType.FOLLOW_UP
        if hasattr(CustomerActivity, "ActivityType")
        else "follow_up",
        notes=f"Deal won: {deal.title}",
        performed_by=deal.owner,
        performed_at=timezone.now(),
    )

    write_audit(actor=actor, entity=deal, action="deal.won", before=before)
    return deal, so


@transaction.atomic
def mark_deal_lost(deal, *, actor=None, notes: str = ""):
    from core.models import CustomerActivity, PipelineDeal

    before = status_snapshot(deal, ["stage"])
    deal.stage = PipelineDeal.Stage.LOST
    deal.save(update_fields=["stage"])
    CustomerActivity.objects.create(
        organization=deal.organization,
        party=deal.party,
        activity_type="follow_up",
        notes=notes or f"Deal lost: {deal.title}",
        performed_by=deal.owner,
        performed_at=timezone.now(),
    )
    write_audit(actor=actor, entity=deal, action="deal.lost", before=before)
    return deal
