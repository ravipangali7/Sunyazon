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


@transaction.atomic
def approve_leave(leave_request, *, approved_by=None, actor=None):
    """
    Leave approved → upsert Attendance(leave) for each date;
    Employee.on_leave while period active.
    """
    from core.models import Attendance, Employee, LeaveRequest

    if leave_request.approval_status != LeaveRequest.ApprovalStatus.PENDING:
        raise DomainError("Leave is not pending", code="invalid_status")

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
        notify(emp.user, title="Leave approved", body=f"{leave_request.from_date} → {leave_request.to_date}", type="approval")

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
        # Soft-disable login if no remaining org memberships and not consumer
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
