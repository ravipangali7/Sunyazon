"""Shared helpers for domain services — audit, notify, errors, stock qty."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Sum
from django.utils import timezone


class DomainError(Exception):
    """Raised when a business rule or status transition is violated."""

    def __init__(self, message: str, *, code: str = "domain_error"):
        self.code = code
        super().__init__(message)


def model_label(instance) -> str:
    return instance.__class__.__name__


def write_audit(
    *,
    actor=None,
    entity,
    action: str,
    before: dict | None = None,
    after: dict | None = None,
    tenant=None,
    ip: str | None = None,
    device: str = "",
):
    """Immutable audit trail. Actor may be None for system actions (creates system actor if needed).

    Accepts an Actor instance, a User instance, or None.
    """
    from core.models import Actor, AuditLog, User

    if actor is not None and isinstance(actor, User):
        human = Actor.objects.filter(user=actor, actor_type=Actor.ActorType.HUMAN).first()
        if human is None:
            human = Actor.objects.create(
                actor_type=Actor.ActorType.HUMAN,
                user=actor,
                tenant=getattr(actor, "tenant", None),
            )
        actor = human

    if actor is None:
        actor = Actor.objects.filter(actor_type=Actor.ActorType.SYSTEM).first()
        if actor is None:
            actor = Actor.objects.create(actor_type=Actor.ActorType.SYSTEM)

    AuditLog.objects.create(
        tenant=tenant or getattr(entity, "tenant", None) or getattr(actor, "tenant", None),
        actor=actor,
        entity_type=model_label(entity),
        entity_id=entity.pk,
        action=action,
        before_json=before or {},
        after_json=after or {},
        ip=ip,
        device=device or "",
    )


def notify(
    user,
    *,
    title: str,
    body: str = "",
    type: str = "task",
    channel: str = "in_app",
):
    """Create an in-app (or other channel) notification for a user."""
    from core.models import Notification

    if user is None:
        return None
    return Notification.objects.create(
        user=user,
        channel=channel,
        type=type,
        title=title,
        body=body,
    )


def status_snapshot(instance, fields: list[str]) -> dict[str, Any]:
    return {f: getattr(instance, f) for f in fields if hasattr(instance, f)}


def get_closing_qty(item, warehouse) -> Decimal:
    """Latest closing qty for (item, warehouse), or 0."""
    from core.models import StockLedger

    last = (
        StockLedger.objects.filter(item=item, warehouse=warehouse)
        .order_by("-date", "-id")
        .first()
    )
    return Decimal(last.closing_qty) if last else Decimal("0")


def sum_payments(qs, field: str = "amount") -> Decimal:
    total = qs.aggregate(s=Sum(field))["s"]
    return Decimal(total or 0)


def today():
    return timezone.localdate()


def now():
    return timezone.now()


def as_uuid(value) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))
