"""Procurement PR → RFQ → PO — rules 27–33."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, today, write_audit


def _pr_no(organization) -> str:
    from core.models import PurchaseRequisition

    n = PurchaseRequisition.objects.filter(organization=organization).count() + 1
    return f"PR-{timezone.now():%Y%m%d}-{n:04d}"


def _po_no(organization) -> str:
    from core.models import PurchaseOrder

    n = PurchaseOrder.objects.filter(organization=organization).count() + 1
    return f"PO-{timezone.now():%Y%m%d}-{n:04d}"


@transaction.atomic
def create_reorder_pr(*, organization, item, qty=None, department=None, requested_by=None, actor=None):
    """Policy/reorder action → draft/submitted PurchaseRequisition."""
    from core.models import PurchaseRequisition, PurchaseRequisitionLine

    qty = Decimal(qty or item.reorder_level or 1)
    pr = PurchaseRequisition.objects.create(
        organization=organization,
        pr_no=_pr_no(organization),
        date=today(),
        department=department,
        requested_by=requested_by,
        status=PurchaseRequisition.Status.SUBMITTED,
    )
    PurchaseRequisitionLine.objects.create(
        pr=pr,
        material=item,
        qty=qty,
        required_date=today(),
    )
    write_audit(actor=actor, entity=pr, action="pr.reorder_created", after={"item": item.item_code})
    return pr


@transaction.atomic
def submit_pr(pr, *, actor=None, assignee=None):
    """PR submitted → create approval Task."""
    from core.models import PurchaseRequisition, Task

    if pr.status != PurchaseRequisition.Status.DRAFT:
        raise DomainError("Only draft PR can be submitted", code="invalid_status")

    before = status_snapshot(pr, ["status"])
    pr.status = PurchaseRequisition.Status.SUBMITTED
    pr.save(update_fields=["status"])

    task = Task.objects.create(
        tenant=getattr(pr.organization, "tenant", None),
        organization=pr.organization,
        title=f"Approve PR {pr.pr_no}",
        status=Task.Status.ASSIGNED if assignee else Task.Status.NEW,
        assignee=assignee,
        priority=Task.Priority.MEDIUM,
    )
    if assignee and assignee.user_id:
        notify(assignee.user, title=task.title, body="Purchase requisition awaiting approval.", type="approval")

    write_audit(actor=actor, entity=pr, action="pr.submitted", before=before, after={"task": str(task.pk)})
    return pr, task


@transaction.atomic
def approve_pr(pr, *, actor=None, spawn_po: bool = True, supplier=None):
    """PR approved → optionally draft PO from lines."""
    from core.models import PurchaseOrder, PurchaseOrderLine, PurchaseRequisition

    if pr.status != PurchaseRequisition.Status.SUBMITTED:
        raise DomainError("PR must be submitted", code="invalid_status")

    before = status_snapshot(pr, ["status"])
    pr.status = PurchaseRequisition.Status.APPROVED
    pr.save(update_fields=["status"])

    po = None
    if spawn_po:
        if supplier is None:
            # Prefer first line material's preferred supplier
            line0 = pr.lines.select_related("material__supplier").first()
            supplier = line0.material.supplier if line0 else None
        if supplier is None:
            raise DomainError("Supplier required to draft PO", code="supplier_required")

        total = Decimal("0")
        po = PurchaseOrder.objects.create(
            organization=pr.organization,
            po_no=_po_no(pr.organization),
            supplier=supplier,
            date=today(),
            status=PurchaseOrder.Status.DRAFT,
            total=0,
        )
        for line in pr.lines.select_related("material"):
            rate = Decimal("0")
            amount = rate * Decimal(line.qty)
            PurchaseOrderLine.objects.create(
                po=po,
                item=line.material,
                qty=line.qty,
                rate=rate,
                amount=amount,
            )
            total += amount
        po.total = total
        po.save(update_fields=["total"])

    if pr.requested_by_id:
        notify(pr.requested_by, title=f"PR {pr.pr_no} approved", type="approval")

    write_audit(actor=actor, entity=pr, action="pr.approved", before=before)
    return pr, po


@transaction.atomic
def reject_pr(pr, *, actor=None, reason: str = ""):
    from core.models import PurchaseRequisition

    before = status_snapshot(pr, ["status"])
    pr.status = PurchaseRequisition.Status.REJECTED
    pr.save(update_fields=["status"])
    if pr.requested_by_id:
        notify(pr.requested_by, title=f"PR {pr.pr_no} rejected", body=reason, type="approval")
    write_audit(actor=actor, entity=pr, action="pr.rejected", before=before)
    return pr


@transaction.atomic
def approve_po(po, *, approved_by=None, actor=None):
    """PO approved → set approved_by; notify vendor; allow GRN."""
    from core.models import PurchaseOrder

    if po.status != PurchaseOrder.Status.DRAFT:
        raise DomainError("Only draft PO can be approved", code="invalid_status")

    before = status_snapshot(po, ["status"])
    po.status = PurchaseOrder.Status.APPROVED
    po.approved_by = approved_by
    po.save(update_fields=["status", "approved_by"])
    write_audit(actor=actor, entity=po, action="po.approved", before=before)
    return po


@transaction.atomic
def send_po(po, *, actor=None):
    """PO sent → lock line rates/qty (status gate)."""
    from core.models import PurchaseOrder

    if po.status != PurchaseOrder.Status.APPROVED:
        raise DomainError("PO must be approved before send", code="invalid_status")
    before = status_snapshot(po, ["status"])
    po.status = PurchaseOrder.Status.SENT
    po.save(update_fields=["status"])
    write_audit(actor=actor, entity=po, action="po.sent", before=before)
    return po


@transaction.atomic
def close_po_if_fully_received(po, *, actor=None):
    """All PO lines fully received via GRNs → PO closed."""
    from core.models import GRN, PurchaseOrder
    from django.db.models import Sum

    if po.status in {PurchaseOrder.Status.CLOSED, PurchaseOrder.Status.CANCELLED}:
        return po

    for line in po.lines.all():
        received = (
            GRN.objects.filter(po=po, status=GRN.Status.POSTED)
            .values("lines__item")
            # fallback: sum accepted via GRN lines for this item
        )
        accepted = Decimal("0")
        for grn in GRN.objects.filter(po=po, status=GRN.Status.POSTED).prefetch_related("lines"):
            for gl in grn.lines.filter(item=line.item):
                accepted += Decimal(gl.accepted_qty)
        if accepted < Decimal(line.qty):
            return po

    before = status_snapshot(po, ["status"])
    po.status = PurchaseOrder.Status.CLOSED
    po.save(update_fields=["status"])
    write_audit(actor=actor, entity=po, action="po.closed", before=before)
    return po


@transaction.atomic
def cancel_po(po, *, actor=None):
    """Cancel PO → cancel open GRN drafts; no stock impact."""
    from core.models import GRN, PurchaseOrder

    before = status_snapshot(po, ["status"])
    po.status = PurchaseOrder.Status.CANCELLED
    po.save(update_fields=["status"])
    GRN.objects.filter(po=po, status=GRN.Status.DRAFT).update(status=GRN.Status.CANCELLED)
    write_audit(actor=actor, entity=po, action="po.cancelled", before=before)
    return po
