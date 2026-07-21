"""Finance & accounts — chart of accounts, vouchers, purchases, sales, ledgers."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, OrgScopedModel, UUIDPrimaryKeyModel


class DocStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    APPROVED = "approved", "Approved"
    POSTED = "posted", "Posted"
    CANCELLED = "cancelled", "Cancelled"


class PaymentMode(models.TextChoices):
    CASH = "cash", "Cash"
    BANK = "bank", "Bank"
    CHEQUE = "cheque", "Cheque"
    GATEWAY = "gateway", "Gateway"


class ChartOfAccount(OrgScopedModel):
    class HeadType(models.TextChoices):
        ASSET = "asset", "Asset"
        LIABILITY = "liability", "Liability"
        EQUITY = "equity", "Equity"
        REVENUE = "revenue", "Revenue"
        COGS = "cogs", "COGS"
        EXPENSE = "expense", "Expense"

    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=255)
    head_type = models.CharField(max_length=16, choices=HeadType.choices, db_index=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        unique_together = [("organization", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class JournalVoucher(OrgScopedModel):
    class VoucherType(models.TextChoices):
        JOURNAL = "journal", "Journal"
        PAYMENT = "payment", "Payment"
        RECEIPT = "receipt", "Receipt"
        CONTRA = "contra", "Contra"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        VERIFIED = "verified", "Verified"
        POSTED = "posted", "Posted"

    voucher_no = models.CharField(max_length=64, db_index=True)
    voucher_type = models.CharField(
        max_length=16,
        choices=VoucherType.choices,
        default=VoucherType.JOURNAL,
        db_index=True,
    )
    date = models.DateField(db_index=True)
    narration = models.TextField(blank=True)
    total_debit = CurrencyField()
    total_credit = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_vouchers",
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "voucher_no")]

    def __str__(self):
        return f"{self.voucher_no} ({self.voucher_type})"


class JournalLine(UUIDPrimaryKeyModel):
    voucher = models.ForeignKey(
        JournalVoucher,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="journal_lines",
    )
    debit = CurrencyField()
    credit = CurrencyField()
    party = models.ForeignKey(
        "core.Party",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="journal_lines",
    )
    reference = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.account} D:{self.debit} C:{self.credit}"


class Purchase(OrgScopedModel):
    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PARTIAL = "partial", "Partial"
        PAID = "paid", "Paid"

    purchase_no = models.CharField(max_length=64, db_index=True)
    supplier = models.ForeignKey(
        "core.Vendor",
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    date = models.DateField(db_index=True)
    subtotal = CurrencyField()
    tax = CurrencyField()
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "purchase_no")]

    def __str__(self):
        return self.purchase_no


class PurchaseOrder(OrgScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        SENT = "sent", "Sent"
        CLOSED = "closed", "Closed"
        CANCELLED = "cancelled", "Cancelled"

    po_no = models.CharField(max_length=64, db_index=True)
    supplier = models.ForeignKey(
        "core.Vendor",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    date = models.DateField(db_index=True)
    delivery_date = models.DateField(null=True, blank=True)
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    approved_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_purchase_orders",
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "po_no")]

    def __str__(self):
        return self.po_no


class PurchaseOrderLine(UUIDPrimaryKeyModel):
    po = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="po_lines",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    rate = CurrencyField()
    amount = CurrencyField()

    def __str__(self):
        return f"{self.item} × {self.qty}"


class PurchasePayment(UUIDPrimaryKeyModel):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount = CurrencyField()
    payment_mode = models.CharField(
        max_length=16,
        choices=PaymentMode.choices,
        default=PaymentMode.CASH,
    )
    bank_account = models.ForeignKey(
        "core.CashBankAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchase_payments",
    )
    date = models.DateField(db_index=True)
    reference = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.purchase} payment {self.amount}"


class DebitNote(OrgScopedModel):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="debit_notes",
    )
    amount = CurrencyField()
    reason = models.TextField(blank=True)
    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Dr Note {self.amount} — {self.purchase}"


class Sales(OrgScopedModel):
    sales_no = models.CharField(max_length=64, db_index=True)
    party = models.ForeignKey(
        "core.Party",
        on_delete=models.PROTECT,
        related_name="sales",
    )
    date = models.DateField(db_index=True)
    subtotal = CurrencyField()
    discount = CurrencyField()
    tax = CurrencyField()
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "sales_no")]
        verbose_name_plural = "sales"

    def __str__(self):
        return self.sales_no


class SalesOrder(OrgScopedModel):
    so_no = models.CharField(max_length=64, db_index=True)
    party = models.ForeignKey(
        "core.Party",
        on_delete=models.PROTECT,
        related_name="sales_orders",
    )
    date = models.DateField(db_index=True)
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "so_no")]

    def __str__(self):
        return self.so_no


class SalesOrderLine(UUIDPrimaryKeyModel):
    so = models.ForeignKey(
        SalesOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.PROTECT,
        related_name="sales_order_lines",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    price = CurrencyField()
    amount = CurrencyField()
    discount = CurrencyField()

    def __str__(self):
        return f"{self.product} × {self.qty}"


class SalesReceived(UUIDPrimaryKeyModel):
    sales = models.ForeignKey(
        Sales,
        on_delete=models.CASCADE,
        related_name="receipts",
    )
    amount = CurrencyField()
    payment_mode = models.CharField(
        max_length=16,
        choices=PaymentMode.choices,
        default=PaymentMode.CASH,
    )
    date = models.DateField(db_index=True)
    reference = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "sales received"

    def __str__(self):
        return f"Received {self.amount} — {self.sales}"


class CreditNote(OrgScopedModel):
    sales = models.ForeignKey(
        Sales,
        on_delete=models.CASCADE,
        related_name="credit_notes",
    )
    amount = CurrencyField()
    reason = models.TextField(blank=True)
    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Cr Note {self.amount} — {self.sales}"


class CashBankAccount(OrgScopedModel):
    class AccountType(models.TextChoices):
        CASH = "cash", "Cash"
        BANK = "bank", "Bank"

    name = models.CharField(max_length=255)
    account_type = models.CharField(
        max_length=8,
        choices=AccountType.choices,
        default=AccountType.CASH,
        db_index=True,
    )
    opening_balance = CurrencyField()
    current_balance = CurrencyField()

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.account_type})"


class DayBook(OrgScopedModel):
    date = models.DateField(db_index=True)
    account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="day_book_entries",
    )
    debit = CurrencyField()
    credit = CurrencyField()
    narration = models.TextField(blank=True)
    voucher = models.ForeignKey(
        JournalVoucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="day_book_entries",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date} {self.account} D:{self.debit} C:{self.credit}"


class Ledger(OrgScopedModel):
    party = models.ForeignKey(
        "core.Party",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    date = models.DateField(db_index=True)
    debit = CurrencyField()
    credit = CurrencyField()
    balance = CurrencyField()
    reference = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date} {self.account} bal:{self.balance}"


class IncomeExpense(OrgScopedModel):
    class Type(models.TextChoices):
        INCOME = "income", "Income"
        EXPENSE = "expense", "Expense"

    type = models.CharField(max_length=8, choices=Type.choices, db_index=True)
    category = models.CharField(max_length=128, blank=True)
    amount = CurrencyField()
    date = models.DateField(db_index=True)
    description = models.TextField(blank=True)
    voucher = models.ForeignKey(
        JournalVoucher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="income_expenses",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.type} {self.amount} ({self.category})"


class ProfitLossSnapshot(OrgScopedModel):
    period_from = models.DateField()
    period_to = models.DateField()
    revenue = CurrencyField()
    cogs = CurrencyField()
    expenses = CurrencyField()
    net_profit = CurrencyField()
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_to"]

    def __str__(self):
        return f"P&L {self.period_from} → {self.period_to}: {self.net_profit}"


class TaxAuditRecord(OrgScopedModel):
    class TaxType(models.TextChoices):
        VAT = "vat", "VAT"
        TDS = "tds", "TDS"
        INCOME = "income", "Income"

    class FilingStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        FILED = "filed", "Filed"
        AUDITED = "audited", "Audited"

    tax_type = models.CharField(max_length=8, choices=TaxType.choices, db_index=True)
    period = models.CharField(max_length=32)
    amount = CurrencyField()
    filing_status = models.CharField(
        max_length=16,
        choices=FilingStatus.choices,
        default=FilingStatus.DRAFT,
        db_index=True,
    )
    filed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-period"]

    def __str__(self):
        return f"{self.tax_type.upper()} {self.period} — {self.amount}"


class ActionPlan(OrgScopedModel):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"

    title = models.CharField(max_length=255)
    objective = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_plans",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PLANNED,
        db_index=True,
    )
    tasks_json = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.title


class IssueCheque(OrgScopedModel):
    class Status(models.TextChoices):
        ISSUED = "issued", "Issued"
        CLEARED = "cleared", "Cleared"
        BOUNCED = "bounced", "Bounced"

    cheque_no = models.CharField(max_length=64, db_index=True)
    bank_account = models.ForeignKey(
        CashBankAccount,
        on_delete=models.PROTECT,
        related_name="issued_cheques",
    )
    payee = models.CharField(max_length=255)
    amount = CurrencyField()
    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ISSUED,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Cheque {self.cheque_no} → {self.payee}"
