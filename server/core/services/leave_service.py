"""HR leave & attendance — rules 82–84, 90."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction

from core.services.common import DomainError, notify, status_snapshot, write_audit


def leave_days(from_date, to_date) -> int:
    return (to_date - from_date).days + 1


def leave_approval_role(days: int) -> str:
    """1 day Supervisor; 2–7 Manager; >7 Director."""
    if days <= 1:
        return "supervisor"
    if days <= 7:
        return "manager"
    return "director"


LEAVE_APPROVAL_MATRIX = [
    {"max_days": 1, "role": "supervisor", "label": "1 day → Supervisor"},
    {"max_days": 7, "role": "manager", "label": "2–7 days → Manager"},
    {"max_days": None, "role": "director", "label": ">7 days → Director"},
]


def _leadership_tier_for_role(role: str) -> set[str]:
    """Map approval role → PositionMaster.leadership_tier values that may approve."""
    if role == "supervisor":
        return {"none", "executive", "hr", "top"}
    if role == "manager":
        return {"executive", "hr", "top"}
    return {"top", "hr"}


def can_approve_leave(approver, leave_request) -> bool:
    """Enforce duration-based approval matrix using approver position leadership_tier."""
    if approver is None:
        return False
    days = leave_days(leave_request.from_date, leave_request.to_date)
    required = leave_approval_role(days)
    tier = "none"
    if getattr(approver, "position_id", None) and approver.position:
        tier = str(approver.position.leadership_tier or "none")
    # HR / top leadership can approve any leave
    if tier in {"hr", "top"}:
        return True
    return tier in _leadership_tier_for_role(required)


@transaction.atomic
def approve_leave(leave_request, *, approved_by=None, actor=None, enforce_role: bool = True):
    """
    Leave approved → upsert Attendance(leave) for each date;
    Employee.on_leave while period active.
    """
    from core.models import Attendance, Employee, LeaveRequest

    if leave_request.approval_status != LeaveRequest.ApprovalStatus.PENDING:
        raise DomainError("Leave is not pending", code="invalid_status")

    if enforce_role and approved_by is not None and not can_approve_leave(approved_by, leave_request):
        # Superusers / staff without matching tier still blocked unless actor is superuser
        if not (actor and getattr(actor, "is_superuser", False)):
            days = leave_days(leave_request.from_date, leave_request.to_date)
            required = leave_approval_role(days)
            raise DomainError(
                f"Leave of {days} day(s) requires {required}-level approval.",
                code="insufficient_authority",
            )

    before = status_snapshot(leave_request, ["approval_status"])
    leave_request.approval_status = LeaveRequest.ApprovalStatus.APPROVED
    leave_request.approved_by = approved_by
    leave_request.save(update_fields=["approval_status", "approved_by"])

    emp = leave_request.employee
    d = leave_request.from_date
    while d <= leave_request.to_date:
        Attendance.objects.update_or_create(
            employee=emp,
            date=d,
            defaults={"status": Attendance.Status.LEAVE},
        )
        d += timedelta(days=1)

    from django.utils import timezone

    today = timezone.localdate()
    if leave_request.from_date <= today <= leave_request.to_date:
        emp.status = Employee.Status.ON_LEAVE
        emp.save(update_fields=["status"])

    if emp.user_id:
        notify(
            emp.user,
            title="Leave approved",
            body=f"{leave_request.from_date} → {leave_request.to_date}",
            type="approval",
        )

    write_audit(actor=actor, entity=leave_request, action="leave.approved", before=before)
    return leave_request


@transaction.atomic
def reject_leave(leave_request, *, approved_by=None, actor=None, reason: str = ""):
    from core.models import LeaveRequest

    before = status_snapshot(leave_request, ["approval_status"])
    leave_request.approval_status = LeaveRequest.ApprovalStatus.REJECTED
    leave_request.approved_by = approved_by
    leave_request.save(update_fields=["approval_status", "approved_by"])
    if leave_request.employee.user_id:
        notify(
            leave_request.employee.user,
            title="Leave rejected",
            body=reason,
            type="approval",
        )
    write_audit(actor=actor, entity=leave_request, action="leave.rejected", before=before)
    return leave_request


@transaction.atomic
def restore_employee_after_leave(employee, *, as_of=None, actor=None):
    """Restore active after leave to_date."""
    from core.models import Employee, LeaveRequest
    from django.utils import timezone

    as_of = as_of or timezone.localdate()
    active_leave = LeaveRequest.objects.filter(
        employee=employee,
        approval_status=LeaveRequest.ApprovalStatus.APPROVED,
        from_date__lte=as_of,
        to_date__gte=as_of,
    ).exists()
    if not active_leave and employee.status == Employee.Status.ON_LEAVE:
        employee.status = Employee.Status.ACTIVE
        employee.save(update_fields=["status"])
        write_audit(actor=actor, entity=employee, action="employee.restored_active")
    return employee


@transaction.atomic
def exit_employee(employee, *, actor=None):
    """Exit → status=exited; revoke OrgUser access; clearance tasks."""
    from core.models import Employee, OrgUser, Task

    before = status_snapshot(employee, ["status"])
    employee.status = Employee.Status.EXITED
    employee.save(update_fields=["status"])
    OrgUser.objects.filter(user=employee.user, organization=employee.organization).delete()
    if employee.user_id:
        if not OrgUser.objects.filter(user=employee.user).exists():
            employee.user.is_active = False
            employee.user.save(update_fields=["is_active"])
    Task.objects.create(
        tenant=getattr(employee.organization, "tenant", None),
        organization=employee.organization,
        title=f"Exit clearance: {employee}",
        status=Task.Status.NEW,
        priority=Task.Priority.HIGH,
    )
    write_audit(actor=actor, entity=employee, action="employee.exited", before=before)
    return employee
