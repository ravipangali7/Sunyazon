"""Payroll — rules 85–88. Uses EmployeeSalary masters + attendance OT."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from core.services.common import DomainError, notify, status_snapshot, today, write_audit
from core.services.finance_service import post_journal_voucher


def _salary_components(emp):
    """Resolve basic / allowances / deductions / OT rate from EmployeeSalary."""
    salary = getattr(emp, "salary", None)
    if salary is None:
        try:
            from core.models import EmployeeSalary

            salary = EmployeeSalary.objects.filter(employee=emp).first()
        except Exception:
            salary = None

    if not salary:
        return {
            "basic": Decimal("0"),
            "allowances": Decimal("0"),
            "deductions": Decimal("0"),
            "ot_rate": Decimal("0"),
        }

    return {
        "basic": Decimal(salary.basic or 0),
        "allowances": Decimal(salary.total_allowances or 0),
        "deductions": Decimal(salary.deductions or 0),
        "ot_rate": Decimal(salary.ot_rate_per_hour or 0),
    }


@transaction.atomic
def process_payroll(payroll_run, *, actor=None):
    """Payroll processed → generate PayrollLines from attendance + salary masters."""
    from core.models import Attendance, Employee, PayrollLine, PayrollRun

    if payroll_run.status != PayrollRun.Status.DRAFT:
        raise DomainError("Only draft payroll can be processed", code="invalid_status")

    before = status_snapshot(payroll_run, ["status"])
    year, month = payroll_run.period_month.split("-")
    year, month = int(year), int(month)

    employees = Employee.objects.filter(
        organization=payroll_run.organization,
        status__in={Employee.Status.ACTIVE, Employee.Status.ON_LEAVE},
    ).select_related("salary")

    for emp in employees:
        ot = (
            Attendance.objects.filter(
                employee=emp, date__year=year, date__month=month
            ).aggregate(s=Sum("ot_hours"))["s"]
            or 0
        )
        comps = _salary_components(emp)
        ot_amount = Decimal(ot or 0) * comps["ot_rate"]
        net = comps["basic"] + comps["allowances"] + ot_amount - comps["deductions"]
        PayrollLine.objects.update_or_create(
            payroll_run=payroll_run,
            employee=emp,
            defaults={
                "basic": comps["basic"],
                "allowances": comps["allowances"],
                "deductions": comps["deductions"],
                "ot_amount": ot_amount,
                "net_pay": net,
            },
        )

    payroll_run.status = PayrollRun.Status.PROCESSED
    payroll_run.save(update_fields=["status"])
    write_audit(actor=actor, entity=payroll_run, action="payroll.processed", before=before)
    return payroll_run


@transaction.atomic
def approve_payroll(payroll_run, *, approved_by=None, actor=None):
    from core.models import PayrollRun

    if payroll_run.status != PayrollRun.Status.PROCESSED:
        raise DomainError("Payroll must be processed first", code="invalid_status")
    before = status_snapshot(payroll_run, ["status"])
    payroll_run.status = PayrollRun.Status.APPROVED
    payroll_run.approved_by = approved_by
    payroll_run.save(update_fields=["status", "approved_by"])
    write_audit(actor=actor, entity=payroll_run, action="payroll.approved", before=before)
    return payroll_run


@transaction.atomic
def pay_payroll(payroll_run, *, cash_account=None, created_by=None, actor=None):
    """Payroll paid → JournalVoucher + CashBank OUT + notify employees."""
    from core.models import ChartOfAccount, JournalLine, JournalVoucher, PayrollRun
    from django.utils import timezone

    if payroll_run.status != PayrollRun.Status.APPROVED:
        raise DomainError("Payroll must be approved", code="invalid_status")

    total = sum((Decimal(l.net_pay or 0) for l in payroll_run.lines.all()), Decimal("0"))
    voucher = None
    if total > 0:
        expense = ChartOfAccount.objects.filter(
            organization=payroll_run.organization, code__startswith="6"
        ).first()
        cash = ChartOfAccount.objects.filter(
            organization=payroll_run.organization, code__startswith="1"
        ).first()
        if expense and cash:
            voucher = JournalVoucher.objects.create(
                organization=payroll_run.organization,
                voucher_no=f"PAY-{payroll_run.period_month}-{timezone.now():%H%M%S}",
                date=today(),
                voucher_type=JournalVoucher.VoucherType.PAYMENT,
                status=JournalVoucher.Status.DRAFT,
                created_by=created_by,
            )
            JournalLine.objects.create(voucher=voucher, account=expense, debit=total, credit=0)
            JournalLine.objects.create(voucher=voucher, account=cash, debit=0, credit=total)
            post_journal_voucher(voucher, actor=actor)

    if cash_account:
        cash_account.current_balance = Decimal(cash_account.current_balance) - total
        cash_account.save(update_fields=["current_balance"])

    before = status_snapshot(payroll_run, ["status"])
    payroll_run.status = PayrollRun.Status.PAID
    payroll_run.save(update_fields=["status"])

    for line in payroll_run.lines.select_related("employee__user"):
        if line.employee.user_id:
            notify(
                line.employee.user,
                title=f"Salary paid — {payroll_run.period_month}",
                body=f"Net pay: {line.net_pay}",
                type="reminder",
            )

    write_audit(actor=actor, entity=payroll_run, action="payroll.paid", before=before)
    return payroll_run, voucher
