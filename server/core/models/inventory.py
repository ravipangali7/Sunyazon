"""Store & inventory — warehouses, items, stock ledger, GRN, issues."""

from __future__ import annotations

from django.db import models

from .base import OrgScopedModel, UUIDPrimaryKeyModel


class Warehouse(OrgScopedModel):
    class Type(models.TextChoices):
        RAW = "raw", "Raw"
        FINISHED = "finished", "Finished"
        SPARE = "spare", "Spare"
        PACKAGING = "packaging", "Packaging"

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, db_index=True)
    address = models.TextField(blank=True)
    type = models.CharField(max_length=16, choices=Type.choices, default=Type.RAW, db_index=True)

    class Meta:
        ordering = ["code"]
        unique_together = [("organization", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class ItemMaster(OrgScopedModel):
    class Category(models.TextChoices):
        RAW = "raw", "Raw Material"
        PACKAGING = "packaging", "Packaging"
        FINISHED = "finished", "Finished Good"
        SPARE = "spare", "Spare Part"

    item_code = models.CharField(max_length=64, db_index=True, help_text="RM-, PM-, FG-, SP-")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=16, choices=Category.choices, db_index=True)
    uom = models.CharField(max_length=32, default="pcs")
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    max_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    reorder_level = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    bin_location = models.CharField(max_length=64, blank=True)
    supplier = models.ForeignKey(
        "core.Vendor",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supplied_items",
    )

    class Meta:
        ordering = ["item_code"]
        unique_together = [("organization", "item_code")]

    def __str__(self):
        return f"{self.item_code} — {self.name}"


class StockLedger(OrgScopedModel):
    class TransactionType(models.TextChoices):
        IN = "in", "In"
        OUT = "out", "Out"
        ADJUST = "adjust", "Adjust"

    item = models.ForeignKey(
        ItemMaster,
        on_delete=models.PROTECT,
        related_name="stock_ledger_entries",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="stock_ledger_entries",
    )
    date = models.DateField(db_index=True)
    transaction_type = models.CharField(
        max_length=8,
        choices=TransactionType.choices,
        db_index=True,
    )
    reference_type = models.CharField(
        max_length=64,
        blank=True,
        help_text="grn, material_issue, process_run_line, sales_dispatch, damage_expire, manual",
    )
    reference_id = models.UUIDField(null=True, blank=True)
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_ledger_entries",
    )
    process_run = models.ForeignKey(
        "core.ProcessRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_ledger_entries",
    )
    opening_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    in_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    out_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    closing_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        ordering = ["-date"]
        indexes = [models.Index(fields=["reference_type", "reference_id"])]

    def __str__(self):
        return f"{self.item} {self.transaction_type} @ {self.date}"


class GRN(OrgScopedModel):
    class QCStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PASS = "pass", "Pass"
        FAIL = "fail", "Fail"
        PARTIAL = "partial", "Partial"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RECEIVED = "received", "Received"
        POSTED = "posted", "Posted"
        CANCELLED = "cancelled", "Cancelled"

    grn_no = models.CharField(max_length=64, db_index=True)
    po = models.ForeignKey(
        "core.PurchaseOrder",
        on_delete=models.PROTECT,
        related_name="grns",
    )
    supplier = models.ForeignKey(
        "core.Vendor",
        on_delete=models.PROTECT,
        related_name="grns",
    )
    date = models.DateField(db_index=True)
    qc_status = models.CharField(
        max_length=16,
        choices=QCStatus.choices,
        default=QCStatus.PENDING,
        db_index=True,
    )
    received_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_grns",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    class Meta:
        verbose_name = "GRN"
        verbose_name_plural = "GRNs"
        ordering = ["-date"]
        unique_together = [("organization", "grn_no")]

    def __str__(self):
        return self.grn_no


class GRNLine(UUIDPrimaryKeyModel):
    grn = models.ForeignKey(
        GRN,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    item = models.ForeignKey(
        ItemMaster,
        on_delete=models.PROTECT,
        related_name="grn_lines",
    )
    ordered_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    received_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    accepted_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    rejected_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        verbose_name = "GRN line"

    def __str__(self):
        return f"{self.grn} — {self.item}"


class MaterialIssue(OrgScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        ISSUED = "issued", "Issued"
        CANCELLED = "cancelled", "Cancelled"

    issue_no = models.CharField(max_length=64, db_index=True)
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="material_issues",
    )
    process_run = models.ForeignKey(
        "core.ProcessRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="material_issues",
    )
    process_run_stage = models.ForeignKey(
        "core.ProcessRunStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="material_issues",
    )
    date = models.DateField(db_index=True)
    issued_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="material_issues",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="material_issues",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "issue_no")]

    def __str__(self):
        return self.issue_no


class MaterialIssueLine(UUIDPrimaryKeyModel):
    issue = models.ForeignKey(
        MaterialIssue,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    material = models.ForeignKey(
        ItemMaster,
        on_delete=models.PROTECT,
        related_name="issue_lines",
    )
    required_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    issued_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    def __str__(self):
        return f"{self.material} × {self.issued_qty}"


class StockAdjustment(OrgScopedModel):
    item = models.ForeignKey(
        ItemMaster,
        on_delete=models.PROTECT,
        related_name="stock_adjustments",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="stock_adjustments",
    )
    system_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    physical_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    variance = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    reason = models.TextField(blank=True)
    date = models.DateField(db_index=True)
    approved_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_stock_adjustments",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Adjust {self.item} Δ{self.variance}"
