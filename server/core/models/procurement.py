"""Procurement — purchase requisitions, RFQs, vendors."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, OrgScopedModel, UUIDPrimaryKeyModel


class Vendor(OrgScopedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        BLACKLISTED = "blacklisted", "Blacklisted"

    vendor_name = models.CharField(max_length=255)
    contact = models.CharField(max_length=128, blank=True)
    category = models.CharField(max_length=128, blank=True)
    quality_rating = models.PositiveSmallIntegerField(default=0)
    delivery_rating = models.PositiveSmallIntegerField(default=0)
    overall_score = models.PositiveSmallIntegerField(default=0)
    pan_vat = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    class Meta:
        ordering = ["vendor_name"]

    def __str__(self):
        return self.vendor_name


class PurchaseRequisition(OrgScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CLOSED = "closed", "Closed"

    pr_no = models.CharField(max_length=64, db_index=True)
    date = models.DateField(db_index=True)
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchase_requisitions",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    requested_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchase_requisitions",
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "pr_no")]

    def __str__(self):
        return self.pr_no


class PurchaseRequisitionLine(UUIDPrimaryKeyModel):
    pr = models.ForeignKey(
        PurchaseRequisition,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    item_code = models.CharField(max_length=64, blank=True)
    material = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="pr_lines",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    required_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.material} × {self.qty}"


class RFQ(OrgScopedModel):
    rfq_no = models.CharField(max_length=64, db_index=True)
    supplier = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        related_name="rfqs",
    )
    item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="rfqs",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = CurrencyField()
    delivery_days = models.PositiveIntegerField(default=0)
    payment_terms = models.TextField(blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        verbose_name = "RFQ"
        verbose_name_plural = "RFQs"
        ordering = ["rfq_no"]

    def __str__(self):
        return f"{self.rfq_no} — {self.supplier}"
