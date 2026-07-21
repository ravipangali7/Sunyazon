"""Stock ledger — rules 38–42 (shared by GRN, issues, dispatch, process)."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from core.services.common import DomainError, get_closing_qty, notify, today, write_audit


@transaction.atomic
def post_ledger(
    *,
    organization,
    item,
    warehouse,
    transaction_type: str,
    qty: Decimal | int | float,
    reference_type: str = "",
    reference_id=None,
    work_order=None,
    process_run=None,
    date=None,
    actor=None,
    check_reorder: bool = True,
):
    """
    Write StockLedger and recompute closing_qty.
    transaction_type: in | out | adjust
    """
    from core.models import StockLedger

    qty = Decimal(qty)
    if qty < 0:
        raise DomainError("Quantity must be non-negative", code="invalid_qty")

    opening = get_closing_qty(item, warehouse)
    in_qty = Decimal("0")
    out_qty = Decimal("0")

    if transaction_type == StockLedger.TransactionType.IN:
        in_qty = qty
        closing = opening + in_qty
    elif transaction_type == StockLedger.TransactionType.OUT:
        out_qty = qty
        if opening < out_qty:
            raise DomainError(
                f"Insufficient stock for {item.item_code}: have {opening}, need {out_qty}",
                code="insufficient_stock",
            )
        closing = opening - out_qty
    elif transaction_type == StockLedger.TransactionType.ADJUST:
        # qty is the signed variance: positive = increase, negative handled via abs + type
        variance = qty
        if variance >= 0:
            in_qty = variance
            closing = opening + in_qty
        else:
            out_qty = abs(variance)
            closing = opening - out_qty
            transaction_type = StockLedger.TransactionType.ADJUST
    else:
        raise DomainError(f"Unknown transaction_type: {transaction_type}", code="invalid_type")

    entry = StockLedger.objects.create(
        organization=organization,
        item=item,
        warehouse=warehouse,
        date=date or today(),
        transaction_type=transaction_type,
        reference_type=reference_type,
        reference_id=reference_id,
        work_order=work_order,
        process_run=process_run,
        opening_qty=opening,
        in_qty=in_qty,
        out_qty=out_qty,
        closing_qty=closing,
    )

    write_audit(
        actor=actor,
        entity=entry,
        action=f"stock.{transaction_type}",
        after={
            "item": str(item.pk),
            "warehouse": str(warehouse.pk),
            "opening": str(opening),
            "closing": str(closing),
            "reference_type": reference_type,
        },
    )

    if check_reorder and closing <= (item.reorder_level or 0):
        _trigger_reorder(organization, item, closing, actor=actor)

    return entry


def _trigger_reorder(organization, item, closing_qty, *, actor=None):
    """Stock ≤ reorder_level → Notification + optional PR via policy/rule."""
    from core.models import Rule
    from core.services.procurement_service import create_reorder_pr

    # Notify org users linked via actors if any — best-effort
    for actor_row in organization.actors.select_related("user").filter(user__isnull=False)[:5]:
        notify(
            actor_row.user,
            title=f"Low stock: {item.item_code}",
            body=f"Closing qty {closing_qty} ≤ reorder level {item.reorder_level}.",
            type="warning",
        )

    rule = Rule.objects.filter(
        organization=organization,
        is_active=True,
        name__icontains="reorder",
    ).first()
    if rule and rule.action_json.get("create_pr"):
        from core.services.workflow_service import apply_rule_action

        apply_rule_action(
            rule,
            context={"organization": organization, "item": item, "qty": item.max_stock or item.reorder_level},
            actor=actor,
        )
    else:
        create_reorder_pr(
            organization=organization,
            item=item,
            qty=item.max_stock or item.reorder_level or Decimal("1"),
            actor=actor,
        )


@transaction.atomic
def approve_stock_adjustment(adjustment, *, approved_by, actor=None):
    """StockAdjustment approved → ledger adjust; variance = physical − system."""
    if adjustment.approved_by_id:
        raise DomainError("Adjustment already approved", code="already_approved")

    variance = Decimal(adjustment.physical_qty) - Decimal(adjustment.system_qty)
    adjustment.variance = variance
    adjustment.approved_by = approved_by
    adjustment.save(update_fields=["variance", "approved_by"])

    entry = post_ledger(
        organization=adjustment.organization,
        item=adjustment.item,
        warehouse=adjustment.warehouse,
        transaction_type="adjust",
        qty=variance,
        reference_type="manual",
        reference_id=adjustment.pk,
        date=adjustment.date,
        actor=actor,
    )
    return adjustment, entry
