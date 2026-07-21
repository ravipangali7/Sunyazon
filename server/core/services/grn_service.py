"""GRN receive / QC / post — rules 34–37."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from core.services.common import DomainError, status_snapshot, today, write_audit
from core.services.stock_service import post_ledger


def _grn_no(organization) -> str:
    from core.models import GRN
    from django.utils import timezone

    n = GRN.objects.filter(organization=organization).count() + 1
    return f"GRN-{timezone.now():%Y%m%d}-{n:04d}"


@transaction.atomic
def receive_grn(grn, *, received_by=None, actor=None, create_inspections: bool = True):
    """
    GRN received → IncomingInspection per line (if QC capability enabled); hold stock until QC.
    """
    from core.models import GRN, IncomingInspection

    if grn.status not in {GRN.Status.DRAFT, GRN.Status.RECEIVED}:
        raise DomainError("Invalid GRN status for receive", code="invalid_status")

    before = status_snapshot(grn, ["status", "qc_status"])
    grn.status = GRN.Status.RECEIVED
    grn.qc_status = GRN.QCStatus.PENDING
    if received_by is not None:
        grn.received_by = received_by
    grn.save(update_fields=["status", "qc_status", "received_by"])

    org = grn.organization
    qc_enabled = not org or "quality" in (org.enabled_capabilities or []) or True

    if create_inspections and qc_enabled:
        from core.models import QCStatus
        from django.utils import timezone as tz

        for idx, line in enumerate(grn.lines.select_related("item"), start=1):
            if IncomingInspection.objects.filter(grn_line=line).exists():
                continue
            IncomingInspection.objects.create(
                organization=org,
                inspection_no=f"IQC-{tz.now():%Y%m%d}-{grn.grn_no}-{idx}",
                supplier=grn.supplier,
                material=line.item,
                grn_line=line,
                date=grn.date or today(),
                status=QCStatus.HOLD,
            )

    write_audit(actor=actor, entity=grn, action="grn.received", before=before)
    return grn


@transaction.atomic
def post_grn(grn, *, warehouse, actor=None):
    """
    QC pass|partial + GRN posted → StockLedger IN for accepted_qty.
    QC fail → do not post stock.
    """
    from core.models import GRN, StockLedger
    from core.services.procurement_service import close_po_if_fully_received

    if grn.status != GRN.Status.RECEIVED:
        raise DomainError("GRN must be received before post", code="invalid_status")
    if grn.qc_status == GRN.QCStatus.FAIL:
        raise DomainError("Cannot post stock for failed QC", code="qc_fail")
    if grn.qc_status == GRN.QCStatus.PENDING:
        raise DomainError("QC still pending", code="qc_pending")

    before = status_snapshot(grn, ["status"])
    entries = []
    for line in grn.lines.select_related("item"):
        qty = Decimal(line.accepted_qty or 0)
        if qty <= 0:
            continue
        entry = post_ledger(
            organization=grn.organization,
            item=line.item,
            warehouse=warehouse,
            transaction_type=StockLedger.TransactionType.IN,
            qty=qty,
            reference_type="grn",
            reference_id=grn.pk,
            date=grn.date,
            actor=actor,
        )
        entries.append(entry)

    grn.status = GRN.Status.POSTED
    grn.save(update_fields=["status"])
    close_po_if_fully_received(grn.po, actor=actor)
    write_audit(
        actor=actor,
        entity=grn,
        action="grn.posted",
        before=before,
        after={"entries": len(entries)},
    )
    return grn, entries


@transaction.atomic
def issue_material(issue, *, actor=None):
    """MaterialIssue issued → StockLedger OUT."""
    from core.models import MaterialIssue, StockLedger

    if issue.status not in {MaterialIssue.Status.APPROVED, MaterialIssue.Status.DRAFT}:
        raise DomainError("Issue must be draft/approved", code="invalid_status")

    before = status_snapshot(issue, ["status"])
    entries = []
    for line in issue.lines.select_related("material"):
        qty = Decimal(line.issued_qty or 0)
        if qty <= 0:
            continue
        entry = post_ledger(
            organization=issue.organization,
            item=line.material,
            warehouse=issue.warehouse,
            transaction_type=StockLedger.TransactionType.OUT,
            qty=qty,
            reference_type="material_issue",
            reference_id=issue.pk,
            work_order=issue.work_order,
            process_run=issue.process_run,
            date=issue.date,
            actor=actor,
        )
        entries.append(entry)

    issue.status = MaterialIssue.Status.ISSUED
    issue.save(update_fields=["status"])
    write_audit(actor=actor, entity=issue, action="material_issue.issued", before=before)
    return issue, entries
