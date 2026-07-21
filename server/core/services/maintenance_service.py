"""Maintenance PM / calibration — rules 97–101."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.services.common import notify, status_snapshot, today, write_audit


def _next_due(frequency: str, from_date):
    mapping = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
        "quarterly": timedelta(days=90),
        "annual": timedelta(days=365),
    }
    return from_date + mapping.get(frequency, timedelta(days=30))


@transaction.atomic
def create_pm_work_orders_due(*, as_of=None, actor=None):
    """PMSchedule.next_due reached → MaintenanceWorkOrder preventive requested."""
    from core.models import MaintenanceWorkOrder, PMSchedule

    as_of = as_of or today()
    created = []
    for sched in PMSchedule.objects.filter(next_due__lte=as_of).select_related("equipment"):
        eq = sched.equipment
        wo = MaintenanceWorkOrder.objects.create(
            organization=eq.organization,
            equipment=eq,
            type=MaintenanceWorkOrder.Type.PREVENTIVE,
            description=sched.activity,
            status=MaintenanceWorkOrder.Status.REQUESTED,
            requested_at=timezone.now(),
        )
        created.append(wo)
        write_audit(actor=actor, entity=wo, action="maint.pm_created")
    return created


@transaction.atomic
def close_maintenance_wo(wo, *, actor=None):
    """Maint WO closed → update PM last_done/next_due; adjust Equipment.health_index."""
    from core.models import Equipment, MaintenanceWorkOrder, PMSchedule

    before = status_snapshot(wo, ["status"])
    wo.status = MaintenanceWorkOrder.Status.CLOSED
    wo.closed_at = timezone.now()
    wo.save(update_fields=["status", "closed_at"])

    eq = wo.equipment
    sched = eq.pm_schedules.order_by("next_due").first()
    if sched:
        sched.last_done = today()
        sched.next_due = _next_due(sched.frequency, today())
        sched.save(update_fields=["last_done", "next_due"])

    if wo.type == MaintenanceWorkOrder.Type.BREAKDOWN:
        # Improve health after repair if was red
        if eq.health_index == Equipment.HealthIndex.RED:
            eq.health_index = Equipment.HealthIndex.YELLOW
            eq.save(update_fields=["health_index"])
    else:
        eq.health_index = Equipment.HealthIndex.GREEN
        eq.save(update_fields=["health_index"])

    write_audit(actor=actor, entity=wo, action="maint.closed", before=before)
    return wo


@transaction.atomic
def record_calibration(calibration, *, actor=None):
    """Calibration fail → Equipment health red; create breakdown WO; notify."""
    from core.models import Calibration, Equipment, MaintenanceWorkOrder

    eq = calibration.equipment
    if calibration.result == Calibration.Result.FAIL:
        eq.health_index = Equipment.HealthIndex.RED
        eq.save(update_fields=["health_index"])
        wo = MaintenanceWorkOrder.objects.create(
            organization=eq.organization,
            equipment=eq,
            type=MaintenanceWorkOrder.Type.BREAKDOWN,
            description=f"Calibration fail @ {calibration.calibrated_at}",
            status=MaintenanceWorkOrder.Status.REQUESTED,
            requested_at=timezone.now(),
        )
        for a in eq.organization.actors.select_related("user").filter(user__isnull=False)[:5]:
            notify(
                a.user,
                title=f"Critical: {eq.asset_code} calibration failed",
                body="Respond within 15 minutes (SLA).",
                type="emergency",
            )
        write_audit(actor=actor, entity=calibration, action="calibration.fail", after={"wo": str(wo.pk)})
        return calibration, wo

    write_audit(actor=actor, entity=calibration, action="calibration.pass")
    return calibration, None
