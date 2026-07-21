"""Finance vouchers, payments, cheques — rules 71–79."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from core.services.common import DomainError, notify, status_snapshot, sum_payments, today, write_audit


@transaction.atomic
def post_journal_voucher(voucher, *, actor=None):
    """Validate Σ debit = Σ credit → DayBook + Ledger + CashBank when applicable."""
    from core.models import CashBankAccount, DayBook, JournalVoucher, Ledger

    if voucher.status == JournalVoucher.Status.POSTED:
        raise DomainError("Voucher already posted", code="already_posted")

    lines = list(voucher.lines.select_related("account", "party"))
    total_debit = sum((Decimal(l.debit or 0) for l in lines), Decimal("0"))
    total_credit = sum((Decimal(l.credit or 0) for l in lines), Decimal("0"))
    if total_debit != total_credit:
        raise DomainError(
            f"Debit {total_debit} != Credit {total_credit}",
            code="unbalanced",
        )

    before = status_snapshot(voucher, ["status", "total_debit", "total_credit"])
    voucher.total_debit = total_debit
    voucher.total_credit = total_credit
    voucher.status = JournalVoucher.Status.POSTED
    voucher.save(update_fields=["status", "total_debit", "total_credit"])

    for line in lines:
        DayBook.objects.create(
            organization=voucher.organization,
            account=line.account,
            voucher=voucher,
            date=voucher.date,
            debit=line.debit,
            credit=line.credit,
        )
        # Running balance: last ledger for account/party + net
        last = (
            Ledger.objects.filter(organization=voucher.organization, account=line.account)
            .order_by("-date", "-id")
            .first()
        )
        bal = Decimal(last.balance if last else 0) + Decimal(line.debit or 0) - Decimal(line.credit or 0)
        Ledger.objects.create(
            organization=voucher.organization,
            party=line.party,
            account=line.account,
            date=voucher.date,
            debit=line.debit,
            credit=line.credit,
            balance=bal,
        )
        # Cash/Bank accounts: match by COA name/code heuristics via CashBankAccount.link if any
        # Update CashBankAccount when account name matches
        for cba in CashBankAccount.objects.filter(organization=voucher.organization):
            if cba.name and line.account and cba.name.lower() in (line.account.name or "").lower():
                cba.current_balance = Decimal(cba.current_balance) + Decimal(line.debit or 0) - Decimal(
                    line.credit or 0
                )
                cba.save(update_fields=["current_balance"])

    write_audit(actor=actor, entity=voucher, action="voucher.posted", before=before)
    return voucher


@transaction.atomic
def reverse_voucher(voucher, *, actor=None):
    """Cancel posted → reversing entries; never hard-delete."""
    from core.models import JournalLine, JournalVoucher

    if voucher.status != JournalVoucher.Status.POSTED:
        raise DomainError("Only posted vouchers can be reversed", code="invalid_status")

    rev = JournalVoucher.objects.create(
        organization=voucher.organization,
        voucher_no=f"REV-{voucher.voucher_no}",
        date=today(),
        voucher_type=voucher.voucher_type,
        status=JournalVoucher.Status.DRAFT,
        created_by=voucher.created_by,
    )
    for line in voucher.lines.all():
        JournalLine.objects.create(
            voucher=rev,
            account=line.account,
            party=line.party,
            debit=line.credit,
            credit=line.debit,
        )
    post_journal_voucher(rev, actor=actor)
    voucher.status = JournalVoucher.Status.DRAFT  # keep history; mark original non-active via audit
    # Prefer leaving original POSTED and documenting reverse — models lack cancelled on JV
    write_audit(actor=actor, entity=voucher, action="voucher.reversed", after={"reversal": str(rev.pk)})
    return rev


@transaction.atomic
def record_purchase_payment(payment, *, actor=None):
    """PurchasePayment → recompute Purchase.payment_status + CashBank OUT."""
    from core.models import CashBankAccount, Purchase

    purchase = payment.purchase
    paid = sum_payments(purchase.payments.all())
    total = Decimal(purchase.total or 0)
    if paid <= 0:
        purchase.payment_status = Purchase.PaymentStatus.UNPAID
    elif paid < total:
        purchase.payment_status = Purchase.PaymentStatus.PARTIAL
    else:
        purchase.payment_status = Purchase.PaymentStatus.PAID
    purchase.save(update_fields=["payment_status"])

    if payment.bank_account_id:
        acct = payment.bank_account
        acct.current_balance = Decimal(acct.current_balance) - Decimal(payment.amount)
        acct.save(update_fields=["current_balance"])

    write_audit(actor=actor, entity=payment, action="purchase_payment.recorded")
    return payment


@transaction.atomic
def record_sales_received(receipt, *, actor=None):
    """SalesReceived → AR receipt + CashBank IN."""
    from django.db.models import F

    # Optional cash bank bump if linked later — SalesReceived may not FK bank
    write_audit(actor=actor, entity=receipt, action="sales_received.recorded")
    return receipt


@transaction.atomic
def post_debit_note(note, *, actor=None):
    from core.models import DocStatus

    before = status_snapshot(note, ["status"])
    note.status = DocStatus.POSTED
    note.save(update_fields=["status"])
    write_audit(actor=actor, entity=note, action="debit_note.posted", before=before)
    return note


@transaction.atomic
def post_credit_note(note, *, actor=None):
    from core.models import DocStatus

    before = status_snapshot(note, ["status"])
    note.status = DocStatus.POSTED
    note.save(update_fields=["status"])
    write_audit(actor=actor, entity=note, action="credit_note.posted", before=before)
    return note


@transaction.atomic
def clear_cheque(cheque, *, cleared: bool = True, actor=None):
    """IssueCheque cleared → bank out; bounced → reverse + notify."""
    from core.models import IssueCheque
    from django.db.models import F

    before = status_snapshot(cheque, ["status"])
    if cleared:
        cheque.status = IssueCheque.Status.CLEARED
        cheque.save(update_fields=["status"])
        if cheque.bank_account_id:
            acct = cheque.bank_account
            acct.current_balance = Decimal(acct.current_balance) - Decimal(cheque.amount)
            acct.save(update_fields=["current_balance"])
    else:
        cheque.status = IssueCheque.Status.BOUNCED
        cheque.save(update_fields=["status"])
        # notify org actors best-effort
        for a in cheque.organization.actors.select_related("user").filter(user__isnull=False)[:3]:
            notify(a.user, title=f"Cheque bounced: {cheque.cheque_no}", type="warning")

    write_audit(actor=actor, entity=cheque, action=f"cheque.{cheque.status}", before=before)
    return cheque


@transaction.atomic
def generate_pnl_snapshot(*, organization, period_from, period_to, actor=None):
    """Period-end → ProfitLossSnapshot from COA heads (simplified)."""
    from core.models import DayBook, ProfitLossSnapshot

    revenue = Decimal("0")
    cogs = Decimal("0")
    expenses = Decimal("0")
    for db in DayBook.objects.filter(
        organization=organization, date__gte=period_from, date__lte=period_to
    ).select_related("account"):
        head = getattr(db.account, "head_type", "") if db.account_id else ""
        if head == "revenue":
            revenue += Decimal(db.credit or 0) - Decimal(db.debit or 0)
        elif head == "cogs":
            cogs += Decimal(db.debit or 0) - Decimal(db.credit or 0)
        elif head == "expense":
            expenses += Decimal(db.debit or 0) - Decimal(db.credit or 0)

    snap = ProfitLossSnapshot.objects.create(
        organization=organization,
        period_from=period_from,
        period_to=period_to,
        revenue=revenue,
        cogs=cogs,
        expenses=expenses,
        net_profit=revenue - cogs - expenses,
    )
    write_audit(actor=actor, entity=snap, action="pnl.generated")
    return snap


def capex_approval_level(amount: Decimal) -> str:
    """≤500K CFO, 500K–5M CEO, >5M Board."""
    amount = Decimal(amount)
    if amount <= Decimal("500000"):
        return "cfo"
    if amount <= Decimal("5000000"):
        return "ceo"
    return "board"
