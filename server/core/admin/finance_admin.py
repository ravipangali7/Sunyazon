"""Admin for finance & procurement — vouchers, purchase/sales docs with line inlines."""

from __future__ import annotations

from django.contrib import admin

from core.models import (
    ActionPlan,
    CashBankAccount,
    ChartOfAccount,
    CreditNote,
    DayBook,
    DebitNote,
    IncomeExpense,
    IssueCheque,
    JournalLine,
    JournalVoucher,
    Ledger,
    ProfitLossSnapshot,
    Purchase,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchasePayment,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    RFQ,
    Sales,
    SalesOrder,
    SalesOrderLine,
    SalesReceived,
    TaxAuditRecord,
    Vendor,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, money


@admin.register(ChartOfAccount)
class ChartOfAccountAdmin(BaseAdmin):
    list_display = ("code", "name", "head_badge", "parent", "organization", "active_col")
    list_filter = ("head_type", "is_active", "organization")
    search_fields = ("code", "name")
    autocomplete_fields = ["organization", "parent"]
    list_select_related = ("parent", "organization")

    @admin.display(description="Head", ordering="head_type")
    def head_badge(self, obj):
        return choice_badge(obj, "head_type")

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 1
    autocomplete_fields = ["account", "party"]
    fields = ("account", "debit", "credit", "party", "reference")


@admin.register(JournalVoucher)
class JournalVoucherAdmin(BaseAdmin):
    inlines = [JournalLineInline]
    list_display = (
        "voucher_no", "type_badge", "date", "organization",
        "debit_col", "credit_col", "balanced_col", "status_badge", "created_by",
    )
    list_filter = ("voucher_type", "status", "organization")
    search_fields = ("voucher_no", "narration")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "created_by"]
    list_select_related = ("organization", "created_by")

    @admin.display(description="Type", ordering="voucher_type")
    def type_badge(self, obj):
        return choice_badge(obj, "voucher_type")

    @admin.display(description="Debit", ordering="total_debit")
    def debit_col(self, obj):
        return money(obj.total_debit)

    @admin.display(description="Credit", ordering="total_credit")
    def credit_col(self, obj):
        return money(obj.total_credit)

    @admin.display(description="Balanced")
    def balanced_col(self, obj):
        return bool_badge(obj.total_debit == obj.total_credit, "Balanced", "Off-balance")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Vendor)
class VendorAdmin(BaseAdmin):
    list_display = (
        "vendor_name", "organization", "category", "contact", "pan_vat",
        "quality_col", "delivery_col", "overall_col", "status_badge",
    )
    list_filter = ("status", "category", "organization")
    search_fields = ("vendor_name", "contact", "pan_vat")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    def _score_badge(self, score):
        color = "#198754" if score >= 70 else "#fd7e14" if score >= 40 else "#dc3545"
        return badge(f"{score}/100", color)

    @admin.display(description="Quality", ordering="quality_rating")
    def quality_col(self, obj):
        return self._score_badge(obj.quality_rating)

    @admin.display(description="Delivery", ordering="delivery_rating")
    def delivery_col(self, obj):
        return self._score_badge(obj.delivery_rating)

    @admin.display(description="Overall", ordering="overall_score")
    def overall_col(self, obj):
        return self._score_badge(obj.overall_score)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class PurchasePaymentInline(admin.TabularInline):
    model = PurchasePayment
    extra = 0
    autocomplete_fields = ["bank_account"]
    fields = ("date", "amount", "payment_mode", "bank_account", "reference")


class DebitNoteInline(admin.StackedInline):
    model = DebitNote
    extra = 0
    fields = (("date", "amount", "status"), "reason")


@admin.register(Purchase)
class PurchaseAdmin(BaseAdmin):
    inlines = [PurchasePaymentInline, DebitNoteInline]
    list_display = (
        "purchase_no", "supplier", "organization", "date",
        "subtotal_col", "tax_col", "total_col", "status_badge", "payment_badge",
    )
    list_filter = ("status", "payment_status", "organization")
    search_fields = ("purchase_no", "supplier__vendor_name")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "supplier"]
    list_select_related = ("supplier", "organization")

    @admin.display(description="Subtotal", ordering="subtotal")
    def subtotal_col(self, obj):
        return money(obj.subtotal)

    @admin.display(description="Tax", ordering="tax")
    def tax_col(self, obj):
        return money(obj.tax)

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    @admin.display(description="Payment", ordering="payment_status")
    def payment_badge(self, obj):
        return choice_badge(obj, "payment_status")


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 1
    autocomplete_fields = ["item"]
    fields = ("item", "qty", "rate", "amount")


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(BaseAdmin):
    inlines = [PurchaseOrderLineInline]
    list_display = (
        "po_no", "supplier", "organization", "date", "delivery_date",
        "line_count", "total_col", "status_badge", "approved_by",
    )
    list_filter = ("status", "organization")
    search_fields = ("po_no", "supplier__vendor_name")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "supplier", "approved_by"]
    list_select_related = ("supplier", "organization", "approved_by")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class SalesReceivedInline(admin.TabularInline):
    model = SalesReceived
    extra = 0
    fields = ("date", "amount", "payment_mode", "reference")


class CreditNoteInline(admin.StackedInline):
    model = CreditNote
    extra = 0
    fields = (("date", "amount", "status"), "reason")


@admin.register(Sales)
class SalesAdmin(BaseAdmin):
    inlines = [SalesReceivedInline, CreditNoteInline]
    list_display = (
        "sales_no", "party", "organization", "date",
        "subtotal_col", "discount_col", "total_col", "received_col", "status_badge",
    )
    list_filter = ("status", "organization")
    search_fields = ("sales_no", "party__name")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "party"]
    list_select_related = ("party", "organization")

    @admin.display(description="Subtotal", ordering="subtotal")
    def subtotal_col(self, obj):
        return money(obj.subtotal)

    @admin.display(description="Discount", ordering="discount")
    def discount_col(self, obj):
        return money(obj.discount)

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Received")
    def received_col(self, obj):
        received = sum(r.amount for r in obj.receipts.all())
        color = "#198754" if received >= obj.total else "#fd7e14" if received else "#dc3545"
        return badge(f"{received:,.2f}", color)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("receipts")


class SalesOrderLineInline(admin.TabularInline):
    model = SalesOrderLine
    extra = 1
    autocomplete_fields = ["product"]
    fields = ("product", "qty", "price", "discount", "amount")


@admin.register(SalesOrder)
class SalesOrderAdmin(BaseAdmin):
    inlines = [SalesOrderLineInline]
    list_display = ("so_no", "party", "organization", "date", "line_count", "total_col", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("so_no", "party__name")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "party"]
    list_select_related = ("party", "organization")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(CashBankAccount)
class CashBankAccountAdmin(BaseAdmin):
    list_display = ("name", "type_badge", "organization", "opening_col", "balance_col")
    list_filter = ("account_type", "organization")
    search_fields = ("name",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Type", ordering="account_type")
    def type_badge(self, obj):
        return choice_badge(obj, "account_type")

    @admin.display(description="Opening", ordering="opening_balance")
    def opening_col(self, obj):
        return money(obj.opening_balance)

    @admin.display(description="Balance", ordering="current_balance")
    def balance_col(self, obj):
        return money(obj.current_balance)


@admin.register(Ledger)
class LedgerAdmin(BaseAdmin):
    list_display = ("date", "account", "party", "debit_col", "credit_col", "balance_col", "reference")
    list_filter = ("organization", "account__head_type")
    search_fields = ("account__name", "party__name", "reference")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "account", "party"]
    list_select_related = ("account", "party")

    @admin.display(description="Debit", ordering="debit")
    def debit_col(self, obj):
        return money(obj.debit)

    @admin.display(description="Credit", ordering="credit")
    def credit_col(self, obj):
        return money(obj.credit)

    @admin.display(description="Balance", ordering="balance")
    def balance_col(self, obj):
        return money(obj.balance)


@admin.register(DayBook)
class DayBookAdmin(BaseAdmin):
    list_display = ("date", "account", "organization", "debit_col", "credit_col", "voucher", "narration")
    list_filter = ("organization",)
    search_fields = ("account__name", "narration")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "account", "voucher"]
    list_select_related = ("account", "voucher", "organization")

    @admin.display(description="Debit", ordering="debit")
    def debit_col(self, obj):
        return money(obj.debit)

    @admin.display(description="Credit", ordering="credit")
    def credit_col(self, obj):
        return money(obj.credit)


@admin.register(IncomeExpense)
class IncomeExpenseAdmin(BaseAdmin):
    list_display = ("date", "type_badge", "category", "amount_col", "organization", "description")
    list_filter = ("type", "organization")
    search_fields = ("category", "description")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "voucher"]
    list_select_related = ("organization",)

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")

    @admin.display(description="Amount", ordering="amount")
    def amount_col(self, obj):
        return money(obj.amount)


@admin.register(ProfitLossSnapshot)
class ProfitLossSnapshotAdmin(BaseAdmin):
    list_display = ("organization", "period_from", "period_to", "revenue_col", "cogs_col", "expenses_col", "profit_col")
    list_filter = ("organization",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Revenue", ordering="revenue")
    def revenue_col(self, obj):
        return money(obj.revenue)

    @admin.display(description="COGS", ordering="cogs")
    def cogs_col(self, obj):
        return money(obj.cogs)

    @admin.display(description="Expenses", ordering="expenses")
    def expenses_col(self, obj):
        return money(obj.expenses)

    @admin.display(description="Net profit", ordering="net_profit")
    def profit_col(self, obj):
        color = "#198754" if obj.net_profit >= 0 else "#dc3545"
        return badge(f"{obj.net_profit:,.2f}", color)


@admin.register(TaxAuditRecord)
class TaxAuditRecordAdmin(BaseAdmin):
    list_display = ("tax_badge", "period", "organization", "amount_col", "filing_badge", "filed_at")
    list_filter = ("tax_type", "filing_status", "organization")
    search_fields = ("period",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Tax", ordering="tax_type")
    def tax_badge(self, obj):
        return choice_badge(obj, "tax_type")

    @admin.display(description="Amount", ordering="amount")
    def amount_col(self, obj):
        return money(obj.amount)

    @admin.display(description="Filing", ordering="filing_status")
    def filing_badge(self, obj):
        return choice_badge(obj, "filing_status")


@admin.register(IssueCheque)
class IssueChequeAdmin(BaseAdmin):
    list_display = ("cheque_no", "payee", "bank_account", "amount_col", "date", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("cheque_no", "payee")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "bank_account"]
    list_select_related = ("bank_account",)

    @admin.display(description="Amount", ordering="amount")
    def amount_col(self, obj):
        return money(obj.amount)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(ActionPlan)
class ActionPlanAdmin(BaseAdmin):
    list_display = ("title", "organization", "owner", "start_date", "end_date", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("title", "objective")
    autocomplete_fields = ["organization", "owner"]
    list_select_related = ("organization", "owner")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class PurchaseRequisitionLineInline(admin.TabularInline):
    model = PurchaseRequisitionLine
    extra = 1
    autocomplete_fields = ["material"]
    fields = ("item_code", "material", "qty", "required_date")


@admin.register(PurchaseRequisition)
class PurchaseRequisitionAdmin(BaseAdmin):
    inlines = [PurchaseRequisitionLineInline]
    list_display = ("pr_no", "date", "organization", "department", "line_count", "status_badge", "requested_by")
    list_filter = ("status", "organization")
    search_fields = ("pr_no",)
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "department", "requested_by"]
    list_select_related = ("organization", "department", "requested_by")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(RFQ)
class RFQAdmin(BaseAdmin):
    list_display = ("rfq_no", "supplier", "item", "qty", "price_col", "delivery_days", "organization")
    list_filter = ("organization",)
    search_fields = ("rfq_no", "supplier__vendor_name", "item__name")
    autocomplete_fields = ["organization", "supplier", "item"]
    list_select_related = ("supplier", "item", "organization")

    @admin.display(description="Unit price", ordering="unit_price")
    def price_col(self, obj):
        return money(obj.unit_price)
