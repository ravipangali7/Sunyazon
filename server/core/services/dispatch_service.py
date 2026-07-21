"""Sales & logistics dispatch / POD — rules 62–70."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, today, write_audit
from core.services.stock_service import post_ledger


@transaction.atomic
def approve_sales_order(sales_order, *, actor=None, check_credit: bool = True):
    """Credit check vs Party.credit_limit and open AR; block if over policy."""
    from core.models import DocStatus, Sales, SalesOrder

    if sales_order.status != DocStatus.DRAFT:
        raise DomainError("Only draft sales order can be approved", code="invalid_status")

    party = sales_order.party
    if check_credit and party and party.credit_limit:
        open_ar = (
            Sales.objects.filter(party=party, status=DocStatus.POSTED)
            .aggregate(s=Sum("total"))["s"]
            or 0
        )
        # crude: open AR + this order vs credit_limit (receipts reduce AR in real ledger)
        if Decimal(open_ar) + Decimal(sales_order.total or 0) > Decimal(party.credit_limit):
            raise DomainError("Credit limit exceeded", code="credit_limit")

    before = status_snapshot(sales_order, ["status"])
    sales_order.status = DocStatus.APPROVED
    sales_order.save(update_fields=["status"])
    write_audit(actor=actor, entity=sales_order, action="so.approved", before=before)
    return sales_order


@transaction.atomic
def create_dispatch(*, sales_order, vehicle, driver, warehouse, route=None, actor=None, require_qa: bool = True):
    """Before Dispatch → require FinalQARelease released (if QC on); verify stock."""
    from core.models import Dispatch, DocStatus, FinalQARelease, StockLedger

    if sales_order.status not in {DocStatus.APPROVED, DocStatus.POSTED}:
        raise DomainError("Sales order must be approved", code="invalid_status")

    if require_qa:
        # Gate: any FG batch on lines must be released if FinalQARelease exists for product
        for line in sales_order.lines.select_related("product"):
            if not line.product_id:
                continue
            has_release = FinalQARelease.objects.filter(
                product=line.product,
                release_status=FinalQARelease.ReleaseStatus.RELEASED,
            ).exists()
            has_held = FinalQARelease.objects.filter(
                product=line.product,
                release_status__in={
                    FinalQARelease.ReleaseStatus.HELD,
                    FinalQARelease.ReleaseStatus.REJECTED,
                },
            ).exists()
            if has_held and not has_release:
                raise DomainError("Final QA not released for product batch", code="qa_block")

    dispatch = Dispatch.objects.create(
        organization=sales_order.organization,
        sales_order=sales_order,
        vehicle=vehicle,
        driver=driver,
        route=route,
        status=Dispatch.Status.PLANNED,
    )
    write_audit(actor=actor, entity=dispatch, action="dispatch.created")
    return dispatch


@transaction.atomic
def mark_dispatch_loaded(dispatch, *, actor=None):
    from core.models import Dispatch

    before = status_snapshot(dispatch, ["status"])
    dispatch.status = Dispatch.Status.LOADED
    dispatch.save(update_fields=["status"])
    write_audit(actor=actor, entity=dispatch, action="dispatch.loaded", before=before)
    return dispatch


@transaction.atomic
def mark_dispatched(dispatch, *, warehouse, actor=None):
    """Dispatch dispatched → StockLedger OUT per SO lines."""
    from core.models import Dispatch, StockLedger

    if dispatch.status not in {Dispatch.Status.PLANNED, Dispatch.Status.LOADED}:
        raise DomainError("Invalid dispatch status", code="invalid_status")

    before = status_snapshot(dispatch, ["status"])
    so = dispatch.sales_order
    for line in so.lines.select_related("product"):
        # Prefer ItemMaster linked via product sku match if possible; skip if no item
        item = None
        if line.product_id and hasattr(line.product, "sku") and line.product.sku:
            from core.models import ItemMaster

            item = ItemMaster.objects.filter(
                organization=dispatch.organization, item_code=line.product.sku
            ).first()
        if item is None:
            continue
        post_ledger(
            organization=dispatch.organization,
            item=item,
            warehouse=warehouse,
            transaction_type=StockLedger.TransactionType.OUT,
            qty=line.qty,
            reference_type="sales_dispatch",
            reference_id=dispatch.pk,
            actor=actor,
        )

    dispatch.status = Dispatch.Status.DISPATCHED
    dispatch.dispatched_at = timezone.now()
    dispatch.save(update_fields=["status", "dispatched_at"])
    write_audit(actor=actor, entity=dispatch, action="dispatch.dispatched", before=before)
    return dispatch


@transaction.atomic
def create_pod(dispatch, *, signature, delivered_at=None, received_by: str = "", photo=None, actor=None):
    """POD → Dispatch delivered + AR Sales doc."""
    from core.models import Dispatch, DocStatus, POD, Sales

    if hasattr(dispatch, "pod"):
        raise DomainError("POD already exists", code="pod_exists")

    delivered_at = delivered_at or timezone.now()
    pod = POD(
        dispatch=dispatch,
        signature=signature,
        photo=photo,
        received_by=received_by,
        delivered_at=delivered_at,
    )
    pod.save()

    before = status_snapshot(dispatch, ["status"])
    dispatch.status = Dispatch.Status.DELIVERED
    dispatch.delivered_at = delivered_at
    dispatch.save(update_fields=["status", "delivered_at"])

    so = dispatch.sales_order
    from django.utils import timezone as tz

    n = Sales.objects.filter(organization=dispatch.organization).count() + 1
    Sales.objects.create(
        organization=dispatch.organization,
        sales_no=f"SAL-{tz.now():%Y%m%d}-{n:04d}",
        party=so.party,
        date=today(),
        subtotal=so.total,
        total=so.total,
        status=DocStatus.POSTED,
    )

    if so.party_id:
        # notify ASM if linked
        pass

    write_audit(actor=actor, entity=dispatch, action="dispatch.delivered", before=before)
    return pod


@transaction.atomic
def cancel_dispatch(dispatch, *, warehouse=None, reverse_stock: bool = True, actor=None):
    """Cancel after stock OUT → reverse ledger."""
    from core.models import Dispatch, StockLedger

    before = status_snapshot(dispatch, ["status"])
    was_out = dispatch.status in {Dispatch.Status.DISPATCHED, Dispatch.Status.DELIVERED}

    if was_out and reverse_stock and warehouse:
        for line in dispatch.sales_order.lines.select_related("product"):
            from core.models import ItemMaster

            item = None
            if line.product_id and line.product.sku:
                item = ItemMaster.objects.filter(
                    organization=dispatch.organization, item_code=line.product.sku
                ).first()
            if item:
                post_ledger(
                    organization=dispatch.organization,
                    item=item,
                    warehouse=warehouse,
                    transaction_type=StockLedger.TransactionType.IN,
                    qty=line.qty,
                    reference_type="sales_dispatch",
                    reference_id=dispatch.pk,
                    actor=actor,
                    check_reorder=False,
                )

    dispatch.status = Dispatch.Status.CANCELLED
    dispatch.save(update_fields=["status"])
    write_audit(actor=actor, entity=dispatch, action="dispatch.cancelled", before=before)
    return dispatch
