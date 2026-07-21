"""Commerce checkout & payment — rules 17–26."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, status_snapshot, write_audit


def _next_order_no() -> str:
    from core.models import Order

    n = Order.objects.count() + 1
    return f"ORD-{timezone.now():%Y%m%d}-{n:05d}"


@transaction.atomic
def checkout(*, user, gateway, shipping_address=None, actor=None):
    """Cart → Order + OrderItems → PaymentTransaction(pending) → clear cart."""
    from core.models import Cart, Order, OrderItem, PaymentTransaction, Product

    try:
        cart = Cart.objects.select_related("user").prefetch_related("items__product").get(user=user)
    except Cart.DoesNotExist as exc:
        raise DomainError("Cart is empty", code="empty_cart") from exc

    items = list(cart.items.select_related("product"))
    if not items:
        raise DomainError("Cart is empty", code="empty_cart")

    # Group by seller (first seller wins for single-order MVP; multi-seller can split later)
    seller_org = items[0].product.seller_org
    subtotal = Decimal("0")
    for ci in items:
        if ci.product.status != Product.Status.PUBLISHED:
            raise DomainError(f"Product not available: {ci.product.name}", code="product_unavailable")
        if ci.product.stock_qty < ci.qty:
            raise DomainError(f"Insufficient stock: {ci.product.name}", code="insufficient_stock")
        subtotal += Decimal(ci.unit_price) * Decimal(ci.qty)

    order = Order.objects.create(
        order_no=_next_order_no(),
        buyer_user=user,
        seller_org=seller_org,
        shipping_address=shipping_address,
        subtotal=subtotal,
        total=subtotal,
        payment_status=Order.PaymentStatus.PENDING,
        order_status=Order.OrderStatus.PLACED,
    )
    for ci in items:
        amount = Decimal(ci.unit_price) * Decimal(ci.qty)
        OrderItem.objects.create(
            order=order,
            product=ci.product,
            qty=ci.qty,
            unit_price=ci.unit_price,
            amount=amount,
        )

    txn = PaymentTransaction.objects.create(
        order=order,
        gateway=gateway,
        amount=order.total,
        currency=getattr(items[0].product, "currency", "NPR") or "NPR",
        status=PaymentTransaction.Status.PENDING,
    )
    cart.items.all().delete()

    write_audit(
        actor=actor,
        entity=order,
        action="checkout.created",
        after={"order_no": order.order_no, "txn": str(txn.pk)},
    )
    return order, txn


@transaction.atomic
def mark_payment_success(txn, *, actor=None, external_txn_id: str = ""):
    """Payment success → Order paid + confirmed + decrement Product.stock_qty."""
    from core.models import Order, PaymentTransaction, Product
    from django.db.models import F

    if txn.status == PaymentTransaction.Status.SUCCESS:
        return txn

    before = status_snapshot(txn, ["status"])
    txn.status = PaymentTransaction.Status.SUCCESS
    if external_txn_id:
        txn.external_txn_id = external_txn_id
    txn.save(update_fields=["status", "external_txn_id"] if external_txn_id else ["status"])

    if txn.order_id:
        order = txn.order
        order.payment_status = Order.PaymentStatus.PAID
        order.order_status = Order.OrderStatus.CONFIRMED
        order.save(update_fields=["payment_status", "order_status"])
        for line in order.items.select_related("product"):
            Product.objects.filter(pk=line.product_id).update(
                stock_qty=F("stock_qty") - line.qty
            )

    if txn.ad_campaign_id:
        campaign = txn.ad_campaign
        campaign.payment_transaction = txn
        if campaign.status == campaign.Status.DRAFT:
            campaign.status = campaign.Status.ACTIVE
        campaign.save(update_fields=["payment_transaction", "status"])

    write_audit(
        actor=actor,
        entity=txn,
        action="payment.success",
        before=before,
        after=status_snapshot(txn, ["status"]),
    )
    return txn


@transaction.atomic
def mark_payment_failed(txn, *, actor=None):
    from core.models import Order, PaymentTransaction

    before = status_snapshot(txn, ["status"])
    txn.status = PaymentTransaction.Status.FAILED
    txn.save(update_fields=["status"])
    if txn.order_id:
        order = txn.order
        order.payment_status = Order.PaymentStatus.FAILED
        order.save(update_fields=["payment_status"])
    write_audit(actor=actor, entity=txn, action="payment.failed", before=before)
    return txn


@transaction.atomic
def mark_payment_refunded(txn, *, actor=None, set_returned: bool = True):
    """Refund → Order refunded + restock; optional order_status=returned."""
    from core.models import Order, PaymentTransaction, Product
    from django.db.models import F

    before = status_snapshot(txn, ["status"])
    txn.status = PaymentTransaction.Status.REFUNDED
    txn.save(update_fields=["status"])

    if txn.order_id:
        order = txn.order
        order.payment_status = Order.PaymentStatus.REFUNDED
        if set_returned:
            order.order_status = Order.OrderStatus.RETURNED
        order.save(update_fields=["payment_status", "order_status"])
        for line in order.items.select_related("product"):
            Product.objects.filter(pk=line.product_id).update(
                stock_qty=F("stock_qty") + line.qty
            )

    write_audit(actor=actor, entity=txn, action="payment.refunded", before=before)
    return txn


@transaction.atomic
def cancel_order(order, *, actor=None):
    """Cancel after paid → refund + restock."""
    from core.models import Order, PaymentTransaction

    before = status_snapshot(order, ["order_status", "payment_status"])
    if order.order_status == Order.OrderStatus.CANCELLED:
        return order

    was_paid = order.payment_status == Order.PaymentStatus.PAID
    order.order_status = Order.OrderStatus.CANCELLED
    order.save(update_fields=["order_status"])

    if was_paid:
        txn = order.payment_transactions.filter(status=PaymentTransaction.Status.SUCCESS).first()
        if txn:
            mark_payment_refunded(txn, actor=actor, set_returned=False)
            order.refresh_from_db()
            order.order_status = Order.OrderStatus.CANCELLED
            order.save(update_fields=["order_status"])

    write_audit(
        actor=actor,
        entity=order,
        action="order.cancelled",
        before=before,
        after=status_snapshot(order, ["order_status", "payment_status"]),
    )
    return order


@transaction.atomic
def record_ad_impression(campaign, *, user=None, clicked: bool = False, post_id=None, cost: Decimal | None = None):
    """AdImpression → increment spent; pause if spent >= budget."""
    from core.models import AdCampaign, AdImpression
    from django.db.models import F

    AdImpression.objects.create(
        campaign=campaign,
        user=user,
        clicked=clicked,
        post_id=post_id,
    )
    spend = cost if cost is not None else Decimal("0.01")
    AdCampaign.objects.filter(pk=campaign.pk).update(spent=F("spent") + spend)
    campaign.refresh_from_db()
    if campaign.spent >= campaign.budget and campaign.status == AdCampaign.Status.ACTIVE:
        campaign.status = AdCampaign.Status.PAUSED
        campaign.save(update_fields=["status"])
    return campaign


@transaction.atomic
def sync_product_stock_from_fg(*, product, fg_qty, actor=None):
    """FG batch released + ecommerce link → sync Product.stock_qty."""
    from core.models import Product

    before = {"stock_qty": str(product.stock_qty)}
    product.stock_qty = Decimal(fg_qty)
    product.save(update_fields=["stock_qty"])
    write_audit(
        actor=actor,
        entity=product,
        action="product.stock_synced",
        before=before,
        after={"stock_qty": str(product.stock_qty)},
    )
    return product
