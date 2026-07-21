"""Finance module APIs — COA, vouchers, cash/bank, daybook, ledger, purchase/sales docs, P&L, tax, cheques."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    CashBankAccount,
    ChartOfAccount,
    CreditNote,
    DayBook,
    DebitNote,
    DocStatus,
    IncomeExpense,
    IssueCheque,
    ItemMaster,
    JournalLine,
    JournalVoucher,
    Ledger,
    Party,
    Product,
    ProfitLossSnapshot,
    Purchase,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchasePayment,
    Sales,
    SalesOrder,
    SalesOrderLine,
    SalesReceived,
    TaxAuditRecord,
    Vendor,
)
from core.services.common import DomainError
from core.services.finance_service import (
    clear_cheque,
    generate_pnl_snapshot,
    post_credit_note,
    post_debit_note,
    post_journal_voucher,
    record_purchase_payment,
    record_sales_received,
    reverse_voucher,
)
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org, serialize_bill, serialize_gl_entry


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, "year"):
        return value
    return parse_date(str(value))


def _paginate(qs, request, *, default_page_size=50):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(200, max(1, int(request.query_params.get("page_size") or default_page_size)))
    except (TypeError, ValueError):
        page_size = default_page_size
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])
    return items, {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def _dec(v) -> float:
    return float(v or 0)


def _tax_year(today: date | None = None) -> str:
    today = today or date.today()
    return f"{today.year}/{str(today.year + 1)[-2:]}"


def _bill_status(p: Purchase) -> str:
    today = date.today()
    if p.payment_status == Purchase.PaymentStatus.PAID:
        return "paid"
    if p.payment_status == Purchase.PaymentStatus.UNPAID and p.date and p.date < today - timedelta(days=30):
        return "overdue"
    if p.payment_status == Purchase.PaymentStatus.PARTIAL:
        return "open"
    return "open"


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_coa(a: ChartOfAccount) -> dict:
    return {
        "id": str(a.id),
        "code": a.code,
        "name": a.name,
        "head_type": a.head_type,
        "parent_id": str(a.parent_id) if a.parent_id else None,
        "parent_code": a.parent.code if a.parent_id else None,
        "parent_name": a.parent.name if a.parent_id else None,
        "is_active": a.is_active,
        "children_count": getattr(a, "_children_count", None)
        if hasattr(a, "_children_count")
        else a.children.count(),
    }


def serialize_voucher_line(line: JournalLine) -> dict:
    return {
        "id": str(line.id),
        "account_id": str(line.account_id) if line.account_id else None,
        "account_code": line.account.code if line.account_id else "",
        "account_name": line.account.name if line.account_id else "",
        "debit": _dec(line.debit),
        "credit": _dec(line.credit),
        "party_id": str(line.party_id) if line.party_id else None,
        "party_name": line.party.name if line.party_id else None,
        "reference": line.reference or "",
    }


def serialize_voucher(v: JournalVoucher, *, include_lines: bool = True) -> dict:
    lines = list(v.lines.select_related("account", "party").all()) if include_lines else []
    return {
        "id": str(v.id),
        "voucher_no": v.voucher_no,
        "voucher_type": v.voucher_type,
        "date": _iso(v.date),
        "narration": v.narration or "",
        "total_debit": _dec(v.total_debit),
        "total_credit": _dec(v.total_credit),
        "status": v.status,
        "created_by_id": str(v.created_by_id) if v.created_by_id else None,
        "created_by_name": (
            (
                (getattr(v.created_by, "get_full_name", None) and v.created_by.get_full_name())
                or getattr(v.created_by, "email", None)
                or getattr(v.created_by, "username", None)
            )
            if v.created_by_id
            else None
        ),
        "line_count": len(lines) if include_lines else v.lines.count(),
        "lines": [serialize_voucher_line(l) for l in lines] if include_lines else [],
    }


def serialize_cash_bank(a: CashBankAccount) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "account_type": a.account_type,
        "opening_balance": _dec(a.opening_balance),
        "current_balance": _dec(a.current_balance),
    }


def serialize_day_book(e: DayBook) -> dict:
    return {
        "id": str(e.id),
        "date": _iso(e.date),
        "account_id": str(e.account_id) if e.account_id else None,
        "account_code": e.account.code if e.account_id else "",
        "account_name": e.account.name if e.account_id else "",
        "debit": _dec(e.debit),
        "credit": _dec(e.credit),
        "narration": e.narration or "",
        "voucher_id": str(e.voucher_id) if e.voucher_id else None,
        "voucher_no": e.voucher.voucher_no if e.voucher_id else None,
    }


def serialize_ledger(e: Ledger) -> dict:
    return {
        "id": str(e.id),
        "date": _iso(e.date),
        "account_id": str(e.account_id) if e.account_id else None,
        "account_code": e.account.code if e.account_id else "",
        "account_name": e.account.name if e.account_id else "",
        "party_id": str(e.party_id) if e.party_id else None,
        "party_name": e.party.name if e.party_id else None,
        "debit": _dec(e.debit),
        "credit": _dec(e.credit),
        "balance": _dec(e.balance),
        "reference": e.reference or "",
    }


def serialize_purchase(p: Purchase) -> dict:
    paid = _dec(sum((x.amount for x in p.payments.all()), Decimal("0")))
    return {
        "id": str(p.id),
        "purchase_no": p.purchase_no,
        "supplier_id": str(p.supplier_id) if p.supplier_id else None,
        "supplier_name": p.supplier.vendor_name if p.supplier_id else "",
        "date": _iso(p.date),
        "subtotal": _dec(p.subtotal),
        "tax": _dec(p.tax),
        "total": _dec(p.total),
        "status": p.status,
        "payment_status": p.payment_status,
        "bill_status": _bill_status(p),
        "paid_amount": paid,
        "due_date": _iso(p.date + timedelta(days=15)) if p.date else None,
    }


def serialize_po_line(line: PurchaseOrderLine) -> dict:
    return {
        "id": str(line.id),
        "item_id": str(line.item_id) if line.item_id else None,
        "item_code": line.item.item_code if line.item_id else "",
        "item_name": line.item.name if line.item_id else "",
        "qty": _dec(line.qty),
        "rate": _dec(line.rate),
        "amount": _dec(line.amount),
    }


def serialize_po(po: PurchaseOrder, *, include_lines: bool = True) -> dict:
    lines = list(po.lines.select_related("item").all()) if include_lines else []
    return {
        "id": str(po.id),
        "po_no": po.po_no,
        "supplier_id": str(po.supplier_id) if po.supplier_id else None,
        "supplier_name": po.supplier.vendor_name if po.supplier_id else "",
        "date": _iso(po.date),
        "delivery_date": _iso(po.delivery_date),
        "total": _dec(po.total),
        "status": po.status,
        "approved_by_id": str(po.approved_by_id) if po.approved_by_id else None,
        "line_count": len(lines) if include_lines else po.lines.count(),
        "lines": [serialize_po_line(l) for l in lines] if include_lines else [],
    }


def serialize_sales(s: Sales) -> dict:
    try:
        received = _dec(sum((x.amount for x in s.receipts.all()), Decimal("0")))
    except Exception:
        received = 0.0
    return {
        "id": str(s.id),
        "sales_no": s.sales_no,
        "party_id": str(s.party_id) if s.party_id else None,
        "party_name": s.party.name if s.party_id else "",
        "date": _iso(s.date),
        "subtotal": _dec(s.subtotal),
        "discount": _dec(s.discount),
        "tax": _dec(s.tax),
        "total": _dec(s.total),
        "status": s.status,
        "received_amount": received,
        "balance": round(_dec(s.total) - received, 2),
    }


def serialize_so_line(line: SalesOrderLine) -> dict:
    return {
        "id": str(line.id),
        "product_id": str(line.product_id) if line.product_id else None,
        "product_name": line.product.name if line.product_id else "",
        "qty": _dec(line.qty),
        "price": _dec(line.price),
        "amount": _dec(line.amount),
        "discount": _dec(line.discount),
    }


def serialize_so(so: SalesOrder, *, include_lines: bool = True) -> dict:
    lines = list(so.lines.select_related("product").all()) if include_lines else []
    return {
        "id": str(so.id),
        "so_no": so.so_no,
        "party_id": str(so.party_id) if so.party_id else None,
        "party_name": so.party.name if so.party_id else "",
        "date": _iso(so.date),
        "total": _dec(so.total),
        "status": so.status,
        "line_count": len(lines) if include_lines else so.lines.count(),
        "lines": [serialize_so_line(l) for l in lines] if include_lines else [],
    }


def serialize_payment(p: PurchasePayment) -> dict:
    return {
        "id": str(p.id),
        "purchase_id": str(p.purchase_id),
        "purchase_no": p.purchase.purchase_no if p.purchase_id else "",
        "supplier_name": p.purchase.supplier.vendor_name if p.purchase_id and p.purchase.supplier_id else "",
        "amount": _dec(p.amount),
        "payment_mode": p.payment_mode,
        "bank_account_id": str(p.bank_account_id) if p.bank_account_id else None,
        "bank_account_name": p.bank_account.name if p.bank_account_id else None,
        "date": _iso(p.date),
        "reference": p.reference or "",
    }


def serialize_receipt(r: SalesReceived) -> dict:
    return {
        "id": str(r.id),
        "sales_id": str(r.sales_id),
        "sales_no": r.sales.sales_no if r.sales_id else "",
        "party_name": r.sales.party.name if r.sales_id and r.sales.party_id else "",
        "amount": _dec(r.amount),
        "payment_mode": r.payment_mode,
        "date": _iso(r.date),
        "reference": r.reference or "",
    }


def serialize_debit_note(n: DebitNote) -> dict:
    return {
        "id": str(n.id),
        "purchase_id": str(n.purchase_id),
        "purchase_no": n.purchase.purchase_no if n.purchase_id else "",
        "supplier_name": n.purchase.supplier.vendor_name if n.purchase_id and n.purchase.supplier_id else "",
        "amount": _dec(n.amount),
        "reason": n.reason or "",
        "date": _iso(n.date),
        "status": n.status,
    }


def serialize_credit_note(n: CreditNote) -> dict:
    return {
        "id": str(n.id),
        "sales_id": str(n.sales_id),
        "sales_no": n.sales.sales_no if n.sales_id else "",
        "party_name": n.sales.party.name if n.sales_id and n.sales.party_id else "",
        "amount": _dec(n.amount),
        "reason": n.reason or "",
        "date": _iso(n.date),
        "status": n.status,
    }


def serialize_income_expense(e: IncomeExpense) -> dict:
    return {
        "id": str(e.id),
        "type": e.type,
        "category": e.category or "",
        "amount": _dec(e.amount),
        "date": _iso(e.date),
        "description": e.description or "",
        "voucher_id": str(e.voucher_id) if e.voucher_id else None,
        "voucher_no": e.voucher.voucher_no if e.voucher_id else None,
    }


def serialize_pnl(s: ProfitLossSnapshot) -> dict:
    return {
        "id": str(s.id),
        "period_from": _iso(s.period_from),
        "period_to": _iso(s.period_to),
        "revenue": _dec(s.revenue),
        "cogs": _dec(s.cogs),
        "expenses": _dec(s.expenses),
        "net_profit": _dec(s.net_profit),
        "generated_at": _iso(s.generated_at),
    }


def serialize_tax(t: TaxAuditRecord) -> dict:
    return {
        "id": str(t.id),
        "tax_type": t.tax_type,
        "period": t.period,
        "amount": _dec(t.amount),
        "filing_status": t.filing_status,
        "filed_at": _iso(t.filed_at),
    }


def serialize_cheque(c: IssueCheque) -> dict:
    return {
        "id": str(c.id),
        "cheque_no": c.cheque_no,
        "bank_account_id": str(c.bank_account_id) if c.bank_account_id else None,
        "bank_account_name": c.bank_account.name if c.bank_account_id else "",
        "payee": c.payee,
        "amount": _dec(c.amount),
        "date": _iso(c.date),
        "status": c.status,
    }


# ── Overview & options ───────────────────────────────────────────────────────


class FinanceOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "cash_balance": 0,
            "bank_balance": 0,
            "ap_total": 0,
            "ap_overdue": 0,
            "ap_overdue_count": 0,
            "ap_open_count": 0,
            "ap_paid_count": 0,
            "ar_total": 0,
            "debit_today": 0,
            "credit_today": 0,
            "vouchers_draft": 0,
            "vouchers_posted": 0,
            "vat_in": 0,
            "vat_out": 0,
            "payable": 0,
            "tax_year": _tax_year(),
            "recent_gl": [],
            "recent_bills": [],
            "income_mtd": 0,
            "expense_mtd": 0,
            "cheques_open": 0,
        }
        if not org:
            return Response(empty)

        today = date.today()
        cash = CashBankAccount.objects.filter(organization=org, account_type="cash").aggregate(
            s=Sum("current_balance")
        )["s"]
        bank = CashBankAccount.objects.filter(organization=org, account_type="bank").aggregate(
            s=Sum("current_balance")
        )["s"]

        purchases = Purchase.objects.filter(organization=org)
        unpaid = purchases.exclude(payment_status=Purchase.PaymentStatus.PAID)
        ap_total = unpaid.aggregate(s=Sum("total"))["s"] or 0
        overdue_qs = purchases.filter(
            payment_status=Purchase.PaymentStatus.UNPAID,
            date__lt=today - timedelta(days=30),
        )
        ap_overdue = overdue_qs.aggregate(s=Sum("total"))["s"] or 0

        sales_qs = Sales.objects.filter(organization=org)
        sales_total = sales_qs.aggregate(s=Sum("total"))["s"] or 0
        received_total = (
            SalesReceived.objects.filter(sales__organization=org).aggregate(s=Sum("amount"))["s"] or 0
        )

        today_lines = JournalLine.objects.filter(voucher__organization=org, voucher__date=today)
        debit_today = today_lines.aggregate(s=Sum("debit"))["s"] or 0
        credit_today = today_lines.aggregate(s=Sum("credit"))["s"] or 0

        vat_in = purchases.aggregate(s=Sum("tax"))["s"] or 0
        vat_out = sales_qs.aggregate(s=Sum("tax"))["s"] or 0

        month_start = today.replace(day=1)
        ie = IncomeExpense.objects.filter(organization=org, date__gte=month_start, date__lte=today)
        income_mtd = ie.filter(type="income").aggregate(s=Sum("amount"))["s"] or 0
        expense_mtd = ie.filter(type="expense").aggregate(s=Sum("amount"))["s"] or 0

        gl = (
            JournalLine.objects.filter(voucher__organization=org)
            .select_related("voucher", "account")
            .order_by("-voucher__date", "-id")[:10]
        )
        bills = purchases.select_related("supplier").order_by("-date")[:10]

        return Response(
            {
                "cash_balance": _dec(cash),
                "bank_balance": _dec(bank),
                "ap_total": _dec(ap_total),
                "ap_overdue": _dec(ap_overdue),
                "ap_overdue_count": overdue_qs.count(),
                "ap_open_count": unpaid.count(),
                "ap_paid_count": purchases.filter(payment_status=Purchase.PaymentStatus.PAID).count(),
                "ar_total": _dec(Decimal(sales_total) - Decimal(received_total)),
                "debit_today": _dec(debit_today),
                "credit_today": _dec(credit_today),
                "vouchers_draft": JournalVoucher.objects.filter(
                    organization=org, status=JournalVoucher.Status.DRAFT
                ).count(),
                "vouchers_posted": JournalVoucher.objects.filter(
                    organization=org, status=JournalVoucher.Status.POSTED
                ).count(),
                "vat_in": _dec(vat_in),
                "vat_out": _dec(vat_out),
                "payable": round(_dec(vat_out) - _dec(vat_in), 2),
                "tax_year": _tax_year(today),
                "recent_gl": [serialize_gl_entry(l) for l in gl],
                "recent_bills": [serialize_bill(p) for p in bills],
                "income_mtd": _dec(income_mtd),
                "expense_mtd": _dec(expense_mtd),
                "cheques_open": IssueCheque.objects.filter(
                    organization=org, status=IssueCheque.Status.ISSUED
                ).count(),
            }
        )


class FinanceOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "accounts": [],
                    "cash_banks": [],
                    "vendors": [],
                    "parties": [],
                    "purchases": [],
                    "sales": [],
                    "items": [],
                    "products": [],
                }
            )
        return Response(
            {
                "accounts": [
                    {
                        "id": str(a.id),
                        "code": a.code,
                        "name": a.name,
                        "head_type": a.head_type,
                    }
                    for a in ChartOfAccount.objects.filter(organization=org, is_active=True).order_by("code")[
                        :500
                    ]
                ],
                "cash_banks": [
                    {
                        "id": str(a.id),
                        "name": a.name,
                        "account_type": a.account_type,
                        "current_balance": _dec(a.current_balance),
                    }
                    for a in CashBankAccount.objects.filter(organization=org).order_by("name")[:200]
                ],
                "vendors": [
                    {"id": str(v.id), "name": v.vendor_name, "status": v.status}
                    for v in Vendor.objects.filter(organization=org).order_by("vendor_name")[:200]
                ],
                "parties": [
                    {"id": str(p.id), "name": p.name, "party_type": p.party_type}
                    for p in Party.objects.filter(organization=org).order_by("name")[:200]
                ],
                "purchases": [
                    {
                        "id": str(p.id),
                        "purchase_no": p.purchase_no,
                        "supplier_name": p.supplier.vendor_name if p.supplier_id else "",
                        "total": _dec(p.total),
                        "payment_status": p.payment_status,
                    }
                    for p in Purchase.objects.filter(organization=org)
                    .select_related("supplier")
                    .order_by("-date")[:100]
                ],
                "sales": [
                    {
                        "id": str(s.id),
                        "sales_no": s.sales_no,
                        "party_name": s.party.name if s.party_id else "",
                        "total": _dec(s.total),
                    }
                    for s in Sales.objects.filter(organization=org)
                    .select_related("party")
                    .order_by("-date")[:100]
                ],
                "items": [
                    {"id": str(i.id), "item_code": i.item_code, "name": i.name, "uom": i.uom}
                    for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:300]
                ],
                "products": [
                    {"id": str(p.id), "name": p.name}
                    for p in Product.objects.filter(seller_org=org).order_by("name")[:300]
                ],
            }
        )


# ── Chart of Accounts ────────────────────────────────────────────────────────


class FinanceCOAView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(ChartOfAccount.objects.select_related("parent"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
        head = request.query_params.get("head_type")
        if head:
            qs = qs.filter(head_type=head)
        active = request.query_params.get("is_active")
        if active in ("true", "1"):
            qs = qs.filter(is_active=True)
        elif active in ("false", "0"):
            qs = qs.filter(is_active=False)
        sort = request.query_params.get("sort") or "code"
        if sort.lstrip("-") in ("code", "name", "head_type"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("code")
        qs = qs.annotate(_children_count=Count("children"))
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_coa(a) for a in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        code = (data.get("code") or "").strip()
        name = (data.get("name") or "").strip()
        if not code or not name:
            return Response({"detail": "code and name are required."}, status=400)
        if ChartOfAccount.objects.filter(organization=org, code=code).exists():
            return Response({"detail": "Account code already exists."}, status=400)
        parent = None
        if data.get("parent_id"):
            parent = ChartOfAccount.objects.filter(pk=data["parent_id"], organization=org).first()
        acct = ChartOfAccount.objects.create(
            organization=org,
            code=code,
            name=name,
            head_type=data.get("head_type") or ChartOfAccount.HeadType.ASSET,
            parent=parent,
            is_active=bool(data.get("is_active", True)),
        )
        return Response(serialize_coa(acct), status=201)


class FinanceCOADetailView(DomainAuthMixin, APIView):
    def get(self, request, account_id):
        org = resolve_org(request.user)
        acct = org_filter(ChartOfAccount.objects.select_related("parent"), org).filter(pk=account_id).first()
        if not acct:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_coa(acct))

    def patch(self, request, account_id):
        org = resolve_org(request.user)
        acct = org_filter(ChartOfAccount.objects.all(), org).filter(pk=account_id).first()
        if not acct:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "code" in data and data["code"]:
            code = data["code"].strip()
            if ChartOfAccount.objects.filter(organization=org, code=code).exclude(pk=acct.pk).exists():
                return Response({"detail": "Account code already exists."}, status=400)
            acct.code = code
        if "name" in data and data["name"] is not None:
            acct.name = data["name"].strip()
        if "head_type" in data and data["head_type"]:
            acct.head_type = data["head_type"]
        if "is_active" in data:
            acct.is_active = bool(data["is_active"])
        if "parent_id" in data:
            pid = data.get("parent_id")
            acct.parent = (
                ChartOfAccount.objects.filter(pk=pid, organization=org).exclude(pk=acct.pk).first()
                if pid
                else None
            )
        acct.save()
        return Response(serialize_coa(acct))

    def delete(self, request, account_id):
        org = resolve_org(request.user)
        acct = org_filter(ChartOfAccount.objects.all(), org).filter(pk=account_id).first()
        if not acct:
            return Response({"detail": "Not found."}, status=404)
        if acct.journal_lines.exists() or acct.ledger_entries.exists() or acct.day_book_entries.exists():
            acct.is_active = False
            acct.save(update_fields=["is_active"])
            return Response(serialize_coa(acct))
        acct.delete()
        return Response(status=204)


# ── Journal vouchers ─────────────────────────────────────────────────────────


class FinanceVouchersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(JournalVoucher.objects.select_related("created_by"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(voucher_no__icontains=search) | Q(narration__icontains=search))
        vtype = request.query_params.get("voucher_type")
        if vtype:
            qs = qs.filter(voucher_type=vtype)
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        sort = request.query_params.get("sort") or "-date"
        if sort.lstrip("-") in ("date", "voucher_no", "status", "total_debit"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response(
            {"results": [serialize_voucher(v, include_lines=False) for v in items], **meta}
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        voucher_no = (data.get("voucher_no") or "").strip()
        if not voucher_no:
            return Response({"detail": "voucher_no is required."}, status=400)
        if JournalVoucher.objects.filter(organization=org, voucher_no=voucher_no).exists():
            return Response({"detail": "Voucher number already exists."}, status=400)
        lines_data = data.get("lines") or []
        if not lines_data:
            return Response({"detail": "At least one line is required."}, status=400)
        total_debit = sum((_decimal(l.get("debit")) for l in lines_data), Decimal("0"))
        total_credit = sum((_decimal(l.get("credit")) for l in lines_data), Decimal("0"))
        voucher = JournalVoucher.objects.create(
            organization=org,
            voucher_no=voucher_no,
            voucher_type=data.get("voucher_type") or JournalVoucher.VoucherType.JOURNAL,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            narration=data.get("narration") or "",
            total_debit=total_debit,
            total_credit=total_credit,
            status=JournalVoucher.Status.DRAFT,
            created_by=request.user if getattr(request.user, "is_authenticated", False) else None,
        )
        for line in lines_data:
            acct = ChartOfAccount.objects.filter(pk=line.get("account_id"), organization=org).first()
            if not acct:
                voucher.delete()
                return Response({"detail": f"Invalid account_id: {line.get('account_id')}"}, status=400)
            party = None
            if line.get("party_id"):
                party = Party.objects.filter(pk=line["party_id"], organization=org).first()
            JournalLine.objects.create(
                voucher=voucher,
                account=acct,
                debit=_decimal(line.get("debit")),
                credit=_decimal(line.get("credit")),
                party=party,
                reference=line.get("reference") or "",
            )
        return Response(serialize_voucher(voucher), status=201)


class FinanceVoucherDetailView(DomainAuthMixin, APIView):
    def get(self, request, voucher_id):
        org = resolve_org(request.user)
        v = (
            org_filter(JournalVoucher.objects.select_related("created_by"), org)
            .filter(pk=voucher_id)
            .first()
        )
        if not v:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_voucher(v))

    def patch(self, request, voucher_id):
        org = resolve_org(request.user)
        v = org_filter(JournalVoucher.objects.all(), org).filter(pk=voucher_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        if v.status == JournalVoucher.Status.POSTED:
            return Response({"detail": "Posted vouchers cannot be edited."}, status=400)
        data = request.data
        if "voucher_no" in data and data["voucher_no"]:
            no = data["voucher_no"].strip()
            if JournalVoucher.objects.filter(organization=org, voucher_no=no).exclude(pk=v.pk).exists():
                return Response({"detail": "Voucher number already exists."}, status=400)
            v.voucher_no = no
        if "voucher_type" in data and data["voucher_type"]:
            v.voucher_type = data["voucher_type"]
        if "date" in data:
            v.date = _parse_date(data.get("date")) or v.date
        if "narration" in data:
            v.narration = data.get("narration") or ""
        if "status" in data and data["status"] in dict(JournalVoucher.Status.choices):
            if data["status"] != JournalVoucher.Status.POSTED:
                v.status = data["status"]
        if "lines" in data and isinstance(data["lines"], list):
            v.lines.all().delete()
            total_debit = Decimal("0")
            total_credit = Decimal("0")
            for line in data["lines"]:
                acct = ChartOfAccount.objects.filter(pk=line.get("account_id"), organization=org).first()
                if not acct:
                    continue
                party = None
                if line.get("party_id"):
                    party = Party.objects.filter(pk=line["party_id"], organization=org).first()
                d = _decimal(line.get("debit"))
                c = _decimal(line.get("credit"))
                total_debit += d
                total_credit += c
                JournalLine.objects.create(
                    voucher=v,
                    account=acct,
                    debit=d,
                    credit=c,
                    party=party,
                    reference=line.get("reference") or "",
                )
            v.total_debit = total_debit
            v.total_credit = total_credit
        v.save()
        return Response(serialize_voucher(v))

    def post(self, request, voucher_id):
        """Workflow actions: post | reverse."""
        org = resolve_org(request.user)
        v = org_filter(JournalVoucher.objects.all(), org).filter(pk=voucher_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "post":
                post_journal_voucher(v, actor=request.user)
            elif action == "reverse":
                reverse_voucher(v, actor=request.user)
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            v.refresh_from_db()
            return Response(serialize_voucher(v))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, voucher_id):
        org = resolve_org(request.user)
        v = org_filter(JournalVoucher.objects.all(), org).filter(pk=voucher_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        if v.status == JournalVoucher.Status.POSTED:
            return Response({"detail": "Posted vouchers cannot be deleted."}, status=400)
        v.delete()
        return Response(status=204)


# ── Cash & Bank ──────────────────────────────────────────────────────────────


class FinanceCashBanksView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(CashBankAccount.objects.all(), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        atype = request.query_params.get("account_type")
        if atype:
            qs = qs.filter(account_type=atype)
        qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_cash_bank(a) for a in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        opening = _decimal(data.get("opening_balance"))
        acct = CashBankAccount.objects.create(
            organization=org,
            name=name,
            account_type=data.get("account_type") or CashBankAccount.AccountType.CASH,
            opening_balance=opening,
            current_balance=_decimal(data.get("current_balance"), str(opening)),
        )
        return Response(serialize_cash_bank(acct), status=201)


class FinanceCashBankDetailView(DomainAuthMixin, APIView):
    def patch(self, request, account_id):
        org = resolve_org(request.user)
        acct = org_filter(CashBankAccount.objects.all(), org).filter(pk=account_id).first()
        if not acct:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            acct.name = data["name"].strip()
        if "account_type" in data and data["account_type"]:
            acct.account_type = data["account_type"]
        if "opening_balance" in data:
            acct.opening_balance = _decimal(data.get("opening_balance"))
        if "current_balance" in data:
            acct.current_balance = _decimal(data.get("current_balance"))
        acct.save()
        return Response(serialize_cash_bank(acct))

    def delete(self, request, account_id):
        org = resolve_org(request.user)
        acct = org_filter(CashBankAccount.objects.all(), org).filter(pk=account_id).first()
        if not acct:
            return Response({"detail": "Not found."}, status=404)
        acct.delete()
        return Response(status=204)


# ── Day Book & Ledger ────────────────────────────────────────────────────────


class FinanceDayBookView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(DayBook.objects.select_related("account", "voucher"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(narration__icontains=search)
                | Q(account__code__icontains=search)
                | Q(account__name__icontains=search)
                | Q(voucher__voucher_no__icontains=search)
            )
        if request.query_params.get("account_id"):
            qs = qs.filter(account_id=request.query_params["account_id"])
        date_from = _parse_date(request.query_params.get("date_from") or request.query_params.get("date"))
        date_to = _parse_date(request.query_params.get("date_to") or request.query_params.get("date"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        totals = qs.aggregate(debit=Sum("debit"), credit=Sum("credit"))
        return Response(
            {
                "results": [serialize_day_book(e) for e in items],
                "totals": {"debit": _dec(totals["debit"]), "credit": _dec(totals["credit"])},
                **meta,
            }
        )


class FinanceLedgerView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Ledger.objects.select_related("account", "party"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(account__code__icontains=search)
                | Q(account__name__icontains=search)
                | Q(party__name__icontains=search)
            )
        if request.query_params.get("account_id"):
            qs = qs.filter(account_id=request.query_params["account_id"])
        if request.query_params.get("party_id"):
            qs = qs.filter(party_id=request.query_params["party_id"])
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_ledger(e) for e in items], **meta})


# ── Purchases ────────────────────────────────────────────────────────────────


class FinancePurchasesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Purchase.objects.select_related("supplier").prefetch_related("payments"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(purchase_no__icontains=search) | Q(supplier__vendor_name__icontains=search)
            )
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("payment_status"):
            qs = qs.filter(payment_status=request.query_params["payment_status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_purchase(p) for p in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        purchase_no = (data.get("purchase_no") or "").strip()
        if not purchase_no:
            return Response({"detail": "purchase_no is required."}, status=400)
        supplier = Vendor.objects.filter(pk=data.get("supplier_id"), organization=org).first()
        if not supplier:
            return Response({"detail": "supplier_id is required."}, status=400)
        if Purchase.objects.filter(organization=org, purchase_no=purchase_no).exists():
            return Response({"detail": "Purchase number already exists."}, status=400)
        p = Purchase.objects.create(
            organization=org,
            purchase_no=purchase_no,
            supplier=supplier,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            subtotal=_decimal(data.get("subtotal")),
            tax=_decimal(data.get("tax")),
            total=_decimal(data.get("total") or (_decimal(data.get("subtotal")) + _decimal(data.get("tax")))),
            status=data.get("status") or DocStatus.DRAFT,
            payment_status=data.get("payment_status") or Purchase.PaymentStatus.UNPAID,
        )
        return Response(serialize_purchase(p), status=201)


class FinancePurchaseDetailView(DomainAuthMixin, APIView):
    def get(self, request, purchase_id):
        org = resolve_org(request.user)
        p = (
            org_filter(Purchase.objects.select_related("supplier").prefetch_related("payments"), org)
            .filter(pk=purchase_id)
            .first()
        )
        if not p:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_purchase(p))

    def patch(self, request, purchase_id):
        org = resolve_org(request.user)
        p = org_filter(Purchase.objects.all(), org).filter(pk=purchase_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("subtotal", "tax", "total"):
            if field in data:
                setattr(p, field, _decimal(data.get(field)))
        if "status" in data and data["status"]:
            p.status = data["status"]
        if "payment_status" in data and data["payment_status"]:
            p.payment_status = data["payment_status"]
        if "date" in data:
            p.date = _parse_date(data.get("date")) or p.date
        if "supplier_id" in data and data["supplier_id"]:
            supplier = Vendor.objects.filter(pk=data["supplier_id"], organization=org).first()
            if supplier:
                p.supplier = supplier
        p.save()
        return Response(serialize_purchase(p))

    def delete(self, request, purchase_id):
        org = resolve_org(request.user)
        p = org_filter(Purchase.objects.all(), org).filter(pk=purchase_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        if p.status == DocStatus.POSTED:
            return Response({"detail": "Posted purchases cannot be deleted."}, status=400)
        p.delete()
        return Response(status=204)


class FinancePurchaseOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(PurchaseOrder.objects.select_related("supplier"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(po_no__icontains=search) | Q(supplier__vendor_name__icontains=search))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_po(po, include_lines=False) for po in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        po_no = (data.get("po_no") or "").strip()
        supplier = Vendor.objects.filter(pk=data.get("supplier_id"), organization=org).first()
        if not po_no or not supplier:
            return Response({"detail": "po_no and supplier_id are required."}, status=400)
        if PurchaseOrder.objects.filter(organization=org, po_no=po_no).exists():
            return Response({"detail": "PO number already exists."}, status=400)
        lines_data = data.get("lines") or []
        total = _decimal(data.get("total"))
        if lines_data and not total:
            total = sum((_decimal(l.get("amount")) for l in lines_data), Decimal("0"))
        po = PurchaseOrder.objects.create(
            organization=org,
            po_no=po_no,
            supplier=supplier,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            delivery_date=_parse_date(data.get("delivery_date")),
            total=total,
            status=data.get("status") or PurchaseOrder.Status.DRAFT,
        )
        for line in lines_data:
            item = ItemMaster.objects.filter(pk=line.get("item_id"), organization=org).first()
            if not item:
                continue
            qty = _decimal(line.get("qty"))
            rate = _decimal(line.get("rate"))
            PurchaseOrderLine.objects.create(
                po=po,
                item=item,
                qty=qty,
                rate=rate,
                amount=_decimal(line.get("amount"), str(qty * rate)),
            )
        return Response(serialize_po(po), status=201)


class FinancePurchaseOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.select_related("supplier"), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_po(po))

    def patch(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.all(), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "status" in data and data["status"]:
            po.status = data["status"]
        if "total" in data:
            po.total = _decimal(data.get("total"))
        if "delivery_date" in data:
            po.delivery_date = _parse_date(data.get("delivery_date"))
        if "date" in data:
            po.date = _parse_date(data.get("date")) or po.date
        po.save()
        return Response(serialize_po(po))

    def delete(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.all(), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        if po.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.CANCELLED):
            return Response({"detail": "Only draft/cancelled POs can be deleted."}, status=400)
        po.delete()
        return Response(status=204)


# ── Sales ────────────────────────────────────────────────────────────────────


class FinanceSalesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Sales.objects.select_related("party").prefetch_related("receipts"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(sales_no__icontains=search) | Q(party__name__icontains=search))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_sales(s) for s in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        sales_no = (data.get("sales_no") or "").strip()
        party = Party.objects.filter(pk=data.get("party_id"), organization=org).first()
        if not sales_no or not party:
            return Response({"detail": "sales_no and party_id are required."}, status=400)
        if Sales.objects.filter(organization=org, sales_no=sales_no).exists():
            return Response({"detail": "Sales number already exists."}, status=400)
        s = Sales.objects.create(
            organization=org,
            sales_no=sales_no,
            party=party,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            subtotal=_decimal(data.get("subtotal")),
            discount=_decimal(data.get("discount")),
            tax=_decimal(data.get("tax")),
            total=_decimal(data.get("total")),
            status=data.get("status") or DocStatus.DRAFT,
        )
        return Response(serialize_sales(s), status=201)


class FinanceSalesDetailView(DomainAuthMixin, APIView):
    def get(self, request, sales_id):
        org = resolve_org(request.user)
        s = (
            org_filter(Sales.objects.select_related("party").prefetch_related("receipts"), org)
            .filter(pk=sales_id)
            .first()
        )
        if not s:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_sales(s))

    def patch(self, request, sales_id):
        org = resolve_org(request.user)
        s = org_filter(Sales.objects.all(), org).filter(pk=sales_id).first()
        if not s:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("subtotal", "discount", "tax", "total"):
            if field in data:
                setattr(s, field, _decimal(data.get(field)))
        if "status" in data and data["status"]:
            s.status = data["status"]
        if "date" in data:
            s.date = _parse_date(data.get("date")) or s.date
        if "party_id" in data and data["party_id"]:
            party = Party.objects.filter(pk=data["party_id"], organization=org).first()
            if party:
                s.party = party
        s.save()
        return Response(serialize_sales(s))

    def delete(self, request, sales_id):
        org = resolve_org(request.user)
        s = org_filter(Sales.objects.all(), org).filter(pk=sales_id).first()
        if not s:
            return Response({"detail": "Not found."}, status=404)
        if s.status == DocStatus.POSTED:
            return Response({"detail": "Posted sales cannot be deleted."}, status=400)
        s.delete()
        return Response(status=204)


class FinanceSalesOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(SalesOrder.objects.select_related("party"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(so_no__icontains=search) | Q(party__name__icontains=search))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_so(so, include_lines=False) for so in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        so_no = (data.get("so_no") or "").strip()
        party = Party.objects.filter(pk=data.get("party_id"), organization=org).first()
        if not so_no or not party:
            return Response({"detail": "so_no and party_id are required."}, status=400)
        lines_data = data.get("lines") or []
        total = _decimal(data.get("total"))
        if lines_data and not total:
            total = sum((_decimal(l.get("amount")) for l in lines_data), Decimal("0"))
        so = SalesOrder.objects.create(
            organization=org,
            so_no=so_no,
            party=party,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            total=total,
            status=data.get("status") or DocStatus.DRAFT,
        )
        for line in lines_data:
            product = Product.objects.filter(pk=line.get("product_id")).first()
            if not product:
                continue
            qty = _decimal(line.get("qty"))
            price = _decimal(line.get("price"))
            SalesOrderLine.objects.create(
                so=so,
                product=product,
                qty=qty,
                price=price,
                amount=_decimal(line.get("amount"), str(qty * price)),
                discount=_decimal(line.get("discount")),
            )
        return Response(serialize_so(so), status=201)


class FinanceSalesOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, so_id):
        org = resolve_org(request.user)
        so = org_filter(SalesOrder.objects.select_related("party"), org).filter(pk=so_id).first()
        if not so:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_so(so))

    def patch(self, request, so_id):
        org = resolve_org(request.user)
        so = org_filter(SalesOrder.objects.all(), org).filter(pk=so_id).first()
        if not so:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "status" in data and data["status"]:
            so.status = data["status"]
        if "total" in data:
            so.total = _decimal(data.get("total"))
        if "date" in data:
            so.date = _parse_date(data.get("date")) or so.date
        so.save()
        return Response(serialize_so(so))

    def delete(self, request, so_id):
        org = resolve_org(request.user)
        so = org_filter(SalesOrder.objects.all(), org).filter(pk=so_id).first()
        if not so:
            return Response({"detail": "Not found."}, status=404)
        if so.status == DocStatus.POSTED:
            return Response({"detail": "Posted sales orders cannot be deleted."}, status=400)
        so.delete()
        return Response(status=204)


# ── Payments & Receipts ──────────────────────────────────────────────────────


class FinancePaymentsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = PurchasePayment.objects.filter(purchase__organization=org).select_related(
            "purchase__supplier", "bank_account"
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(purchase__purchase_no__icontains=search)
                | Q(purchase__supplier__vendor_name__icontains=search)
            )
        if request.query_params.get("payment_mode"):
            qs = qs.filter(payment_mode=request.query_params["payment_mode"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_payment(p) for p in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        purchase = Purchase.objects.filter(pk=data.get("purchase_id"), organization=org).first()
        if not purchase:
            return Response({"detail": "purchase_id is required."}, status=400)
        bank = None
        if data.get("bank_account_id"):
            bank = CashBankAccount.objects.filter(pk=data["bank_account_id"], organization=org).first()
        payment = PurchasePayment.objects.create(
            purchase=purchase,
            amount=_decimal(data.get("amount")),
            payment_mode=data.get("payment_mode") or "cash",
            bank_account=bank,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            reference=data.get("reference") or "",
        )
        try:
            record_purchase_payment(payment, actor=request.user)
        except DomainError as exc:
            return _domain_error(exc)
        return Response(serialize_payment(payment), status=201)


class FinanceReceiptsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = SalesReceived.objects.filter(sales__organization=org).select_related("sales__party")
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(sales__sales_no__icontains=search)
                | Q(sales__party__name__icontains=search)
            )
        if request.query_params.get("payment_mode"):
            qs = qs.filter(payment_mode=request.query_params["payment_mode"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_receipt(r) for r in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        sales = Sales.objects.filter(pk=data.get("sales_id"), organization=org).first()
        if not sales:
            return Response({"detail": "sales_id is required."}, status=400)
        receipt = SalesReceived.objects.create(
            sales=sales,
            amount=_decimal(data.get("amount")),
            payment_mode=data.get("payment_mode") or "cash",
            date=_parse_date(data.get("date")) or timezone.localdate(),
            reference=data.get("reference") or "",
        )
        try:
            record_sales_received(receipt, actor=request.user)
        except DomainError as exc:
            return _domain_error(exc)
        return Response(serialize_receipt(receipt), status=201)


# ── Debit / Credit notes ─────────────────────────────────────────────────────


class FinanceDebitNotesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(DebitNote.objects.select_related("purchase__supplier"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reason__icontains=search) | Q(purchase__purchase_no__icontains=search)
            )
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_debit_note(n) for n in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        purchase = Purchase.objects.filter(pk=data.get("purchase_id"), organization=org).first()
        if not purchase:
            return Response({"detail": "purchase_id is required."}, status=400)
        note = DebitNote.objects.create(
            organization=org,
            purchase=purchase,
            amount=_decimal(data.get("amount")),
            reason=data.get("reason") or "",
            date=_parse_date(data.get("date")) or timezone.localdate(),
            status=data.get("status") or DocStatus.DRAFT,
        )
        return Response(serialize_debit_note(note), status=201)


class FinanceDebitNoteDetailView(DomainAuthMixin, APIView):
    def patch(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(DebitNote.objects.select_related("purchase__supplier"), org).filter(
            pk=note_id
        ).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if note.status == DocStatus.POSTED:
            return Response({"detail": "Posted notes cannot be edited."}, status=400)
        data = request.data
        if "amount" in data:
            note.amount = _decimal(data.get("amount"))
        if "reason" in data:
            note.reason = data.get("reason") or ""
        if "date" in data:
            note.date = _parse_date(data.get("date")) or note.date
        note.save()
        return Response(serialize_debit_note(note))

    def post(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(DebitNote.objects.all(), org).filter(pk=note_id).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if (request.data.get("action") or "") != "post":
            return Response({"detail": "Unknown action."}, status=400)
        try:
            post_debit_note(note, actor=request.user)
            note.refresh_from_db()
            return Response(serialize_debit_note(note))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(DebitNote.objects.all(), org).filter(pk=note_id).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if note.status == DocStatus.POSTED:
            return Response({"detail": "Posted notes cannot be deleted."}, status=400)
        note.delete()
        return Response(status=204)


class FinanceCreditNotesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(CreditNote.objects.select_related("sales__party"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(reason__icontains=search) | Q(sales__sales_no__icontains=search))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_credit_note(n) for n in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        sales = Sales.objects.filter(pk=data.get("sales_id"), organization=org).first()
        if not sales:
            return Response({"detail": "sales_id is required."}, status=400)
        note = CreditNote.objects.create(
            organization=org,
            sales=sales,
            amount=_decimal(data.get("amount")),
            reason=data.get("reason") or "",
            date=_parse_date(data.get("date")) or timezone.localdate(),
            status=data.get("status") or DocStatus.DRAFT,
        )
        return Response(serialize_credit_note(note), status=201)


class FinanceCreditNoteDetailView(DomainAuthMixin, APIView):
    def patch(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(CreditNote.objects.select_related("sales__party"), org).filter(
            pk=note_id
        ).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if note.status == DocStatus.POSTED:
            return Response({"detail": "Posted notes cannot be edited."}, status=400)
        data = request.data
        if "amount" in data:
            note.amount = _decimal(data.get("amount"))
        if "reason" in data:
            note.reason = data.get("reason") or ""
        if "date" in data:
            note.date = _parse_date(data.get("date")) or note.date
        note.save()
        return Response(serialize_credit_note(note))

    def post(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(CreditNote.objects.all(), org).filter(pk=note_id).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if (request.data.get("action") or "") != "post":
            return Response({"detail": "Unknown action."}, status=400)
        try:
            post_credit_note(note, actor=request.user)
            note.refresh_from_db()
            return Response(serialize_credit_note(note))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, note_id):
        org = resolve_org(request.user)
        note = org_filter(CreditNote.objects.all(), org).filter(pk=note_id).first()
        if not note:
            return Response({"detail": "Not found."}, status=404)
        if note.status == DocStatus.POSTED:
            return Response({"detail": "Posted notes cannot be deleted."}, status=400)
        note.delete()
        return Response(status=204)


# ── Income / Expense, P&L, Tax, Cheques ──────────────────────────────────────


class FinanceIncomeExpensesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(IncomeExpense.objects.select_related("voucher"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(category__icontains=search) | Q(description__icontains=search))
        if request.query_params.get("type"):
            qs = qs.filter(type=request.query_params["type"])
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        totals = {
            "income": _dec(
                org_filter(IncomeExpense.objects.filter(type="income"), org).aggregate(s=Sum("amount"))[
                    "s"
                ]
            ),
            "expense": _dec(
                org_filter(IncomeExpense.objects.filter(type="expense"), org).aggregate(s=Sum("amount"))[
                    "s"
                ]
            ),
        }
        return Response(
            {"results": [serialize_income_expense(e) for e in items], "totals": totals, **meta}
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        entry = IncomeExpense.objects.create(
            organization=org,
            type=data.get("type") or IncomeExpense.Type.EXPENSE,
            category=data.get("category") or "",
            amount=_decimal(data.get("amount")),
            date=_parse_date(data.get("date")) or timezone.localdate(),
            description=data.get("description") or "",
            voucher_id=data.get("voucher_id") or None,
        )
        return Response(serialize_income_expense(entry), status=201)


class FinanceIncomeExpenseDetailView(DomainAuthMixin, APIView):
    def patch(self, request, entry_id):
        org = resolve_org(request.user)
        entry = org_filter(IncomeExpense.objects.select_related("voucher"), org).filter(
            pk=entry_id
        ).first()
        if not entry:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "type" in data and data["type"]:
            entry.type = data["type"]
        if "category" in data:
            entry.category = data.get("category") or ""
        if "amount" in data:
            entry.amount = _decimal(data.get("amount"))
        if "date" in data:
            entry.date = _parse_date(data.get("date")) or entry.date
        if "description" in data:
            entry.description = data.get("description") or ""
        entry.save()
        return Response(serialize_income_expense(entry))

    def delete(self, request, entry_id):
        org = resolve_org(request.user)
        entry = org_filter(IncomeExpense.objects.all(), org).filter(pk=entry_id).first()
        if not entry:
            return Response({"detail": "Not found."}, status=404)
        entry.delete()
        return Response(status=204)


class FinancePnLView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(ProfitLossSnapshot.objects.all(), org).order_by("-period_to")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_pnl(s) for s in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        period_from = _parse_date(request.data.get("period_from"))
        period_to = _parse_date(request.data.get("period_to"))
        if not period_from or not period_to:
            return Response({"detail": "period_from and period_to are required."}, status=400)
        try:
            snap = generate_pnl_snapshot(
                organization=org,
                period_from=period_from,
                period_to=period_to,
                actor=request.user,
            )
            return Response(serialize_pnl(snap), status=201)
        except DomainError as exc:
            return _domain_error(exc)


class FinanceTaxView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(TaxAuditRecord.objects.all(), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(period__icontains=search) | Q(tax_type__icontains=search))
        if request.query_params.get("tax_type"):
            qs = qs.filter(tax_type=request.query_params["tax_type"])
        if request.query_params.get("filing_status"):
            qs = qs.filter(filing_status=request.query_params["filing_status"])
        qs = qs.order_by("-period")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_tax(t) for t in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        rec = TaxAuditRecord.objects.create(
            organization=org,
            tax_type=data.get("tax_type") or TaxAuditRecord.TaxType.VAT,
            period=data.get("period") or "",
            amount=_decimal(data.get("amount")),
            filing_status=data.get("filing_status") or TaxAuditRecord.FilingStatus.DRAFT,
        )
        return Response(serialize_tax(rec), status=201)


class FinanceTaxDetailView(DomainAuthMixin, APIView):
    def patch(self, request, record_id):
        org = resolve_org(request.user)
        rec = org_filter(TaxAuditRecord.objects.all(), org).filter(pk=record_id).first()
        if not rec:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "tax_type" in data and data["tax_type"]:
            rec.tax_type = data["tax_type"]
        if "period" in data:
            rec.period = data.get("period") or ""
        if "amount" in data:
            rec.amount = _decimal(data.get("amount"))
        if "filing_status" in data and data["filing_status"]:
            rec.filing_status = data["filing_status"]
            if data["filing_status"] in (
                TaxAuditRecord.FilingStatus.FILED,
                TaxAuditRecord.FilingStatus.AUDITED,
            ):
                rec.filed_at = timezone.now()
        rec.save()
        return Response(serialize_tax(rec))

    def delete(self, request, record_id):
        org = resolve_org(request.user)
        rec = org_filter(TaxAuditRecord.objects.all(), org).filter(pk=record_id).first()
        if not rec:
            return Response({"detail": "Not found."}, status=404)
        rec.delete()
        return Response(status=204)


class FinanceChequesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(IssueCheque.objects.select_related("bank_account"), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(cheque_no__icontains=search) | Q(payee__icontains=search))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_cheque(c) for c in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        bank = CashBankAccount.objects.filter(pk=data.get("bank_account_id"), organization=org).first()
        cheque_no = (data.get("cheque_no") or "").strip()
        payee = (data.get("payee") or "").strip()
        if not bank or not cheque_no or not payee:
            return Response({"detail": "cheque_no, payee and bank_account_id are required."}, status=400)
        cheque = IssueCheque.objects.create(
            organization=org,
            cheque_no=cheque_no,
            bank_account=bank,
            payee=payee,
            amount=_decimal(data.get("amount")),
            date=_parse_date(data.get("date")) or timezone.localdate(),
            status=data.get("status") or IssueCheque.Status.ISSUED,
        )
        return Response(serialize_cheque(cheque), status=201)


class FinanceChequeDetailView(DomainAuthMixin, APIView):
    def patch(self, request, cheque_id):
        org = resolve_org(request.user)
        cheque = org_filter(IssueCheque.objects.select_related("bank_account"), org).filter(
            pk=cheque_id
        ).first()
        if not cheque:
            return Response({"detail": "Not found."}, status=404)
        if cheque.status != IssueCheque.Status.ISSUED:
            return Response({"detail": "Only issued cheques can be edited."}, status=400)
        data = request.data
        if "payee" in data and data["payee"]:
            cheque.payee = data["payee"].strip()
        if "amount" in data:
            cheque.amount = _decimal(data.get("amount"))
        if "date" in data:
            cheque.date = _parse_date(data.get("date")) or cheque.date
        if "cheque_no" in data and data["cheque_no"]:
            cheque.cheque_no = data["cheque_no"].strip()
        cheque.save()
        return Response(serialize_cheque(cheque))

    def post(self, request, cheque_id):
        org = resolve_org(request.user)
        cheque = org_filter(IssueCheque.objects.all(), org).filter(pk=cheque_id).first()
        if not cheque:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "clear":
                clear_cheque(cheque, cleared=True, actor=request.user)
            elif action == "bounce":
                clear_cheque(cheque, cleared=False, actor=request.user)
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            cheque.refresh_from_db()
            return Response(serialize_cheque(cheque))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, cheque_id):
        org = resolve_org(request.user)
        cheque = org_filter(IssueCheque.objects.all(), org).filter(pk=cheque_id).first()
        if not cheque:
            return Response({"detail": "Not found."}, status=404)
        if cheque.status != IssueCheque.Status.ISSUED:
            return Response({"detail": "Only issued cheques can be deleted."}, status=400)
        cheque.delete()
        return Response(status=204)
