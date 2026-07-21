"""B2B sales (ASM/DSM/RSM), logistics & distribution."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, OrgScopedModel, UUIDPrimaryKeyModel
from .finance import DocStatus


class Party(OrgScopedModel):
    class PartyType(models.TextChoices):
        DEALER = "dealer", "Dealer"
        RETAILER = "retailer", "Retailer"
        INSTITUTIONAL = "institutional", "Institutional"
        CONSUMER_B2B = "consumer_b2b", "Consumer B2B"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=255)
    party_type = models.CharField(max_length=16, choices=PartyType.choices, db_index=True)
    area = models.CharField(max_length=128, blank=True)
    asm = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_parties",
    )
    credit_limit = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "parties"

    def __str__(self):
        return self.name


class Territory(OrgScopedModel):
    name = models.CharField(max_length=255)
    region = models.CharField(max_length=128, blank=True)
    asm = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="territories",
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "territories"

    def __str__(self):
        return self.name


class ASMOrder(OrgScopedModel):
    party = models.ForeignKey(Party, on_delete=models.PROTECT, related_name="asm_orders")
    asm = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="asm_orders",
    )
    date = models.DateField(db_index=True)
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.PROTECT,
        related_name="asm_orders",
    )
    unit = models.CharField(max_length=32, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    price = CurrencyField()
    amount = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        verbose_name = "ASM order"
        ordering = ["-date"]

    def __str__(self):
        return f"ASM {self.party} — {self.product} × {self.qty}"


class DealerSalesOrder(OrgScopedModel):
    party = models.ForeignKey(Party, on_delete=models.PROTECT, related_name="dealer_orders")
    dsm = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="dealer_orders",
    )
    date = models.DateField(db_index=True)
    discount = CurrencyField()
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Dealer SO {self.party} @ {self.date}"


class DealerSalesLine(UUIDPrimaryKeyModel):
    order = models.ForeignKey(
        DealerSalesOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.PROTECT,
        related_name="dealer_sales_lines",
    )
    barcode = models.CharField(max_length=64, blank=True)
    unit = models.CharField(max_length=32, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    price = CurrencyField()
    amount = CurrencyField()
    discount = CurrencyField()

    def __str__(self):
        return f"{self.product} × {self.qty}"


class RetailSalesOrder(OrgScopedModel):
    party = models.ForeignKey(Party, on_delete=models.PROTECT, related_name="retail_orders")
    rsm = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="retail_orders",
    )
    dealer_order = models.ForeignKey(
        DealerSalesOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="retail_orders",
    )
    date = models.DateField(db_index=True)
    discount = CurrencyField()
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Retail SO {self.party} @ {self.date}"


class RetailSalesLine(UUIDPrimaryKeyModel):
    order = models.ForeignKey(
        RetailSalesOrder,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.PROTECT,
        related_name="retail_sales_lines",
    )
    barcode = models.CharField(max_length=64, blank=True)
    unit = models.CharField(max_length=32, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    price = CurrencyField()
    amount = CurrencyField()
    discount = CurrencyField()

    def __str__(self):
        return f"{self.product} × {self.qty}"


class ReturnOrder(OrgScopedModel):
    original_order_id = models.UUIDField(null=True, blank=True)
    party = models.ForeignKey(Party, on_delete=models.PROTECT, related_name="return_orders")
    reason = models.TextField(blank=True)
    total = CurrencyField()
    status = models.CharField(
        max_length=16,
        choices=DocStatus.choices,
        default=DocStatus.DRAFT,
        db_index=True,
    )

    def __str__(self):
        return f"Return {self.party} — {self.total}"


class PromotionScheme(OrgScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, db_index=True)
    budget = CurrencyField()
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.name


class Vehicle(OrgScopedModel):
    number = models.CharField(max_length=32, db_index=True)
    capacity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    insurance_expiry = models.DateField(null=True, blank=True)
    fitness_expiry = models.DateField(null=True, blank=True)
    tax_expiry = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["number"]

    def __str__(self):
        return self.number


class Route(OrgScopedModel):
    name = models.CharField(max_length=255)
    territory = models.ForeignKey(
        Territory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="routes",
    )
    sequence_json = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Dispatch(OrgScopedModel):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        LOADED = "loaded", "Loaded"
        DISPATCHED = "dispatched", "Dispatched"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    sales_order = models.ForeignKey(
        "core.SalesOrder",
        on_delete=models.PROTECT,
        related_name="dispatches",
    )
    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT,
        related_name="dispatches",
    )
    driver = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="driven_dispatches",
    )
    route = models.ForeignKey(
        Route,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispatches",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PLANNED,
        db_index=True,
    )
    dispatched_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "dispatches"
        ordering = ["-dispatched_at"]

    def __str__(self):
        return f"Dispatch {self.sales_order} via {self.vehicle}"


class POD(UUIDPrimaryKeyModel):
    dispatch = models.OneToOneField(
        Dispatch,
        on_delete=models.CASCADE,
        related_name="pod",
    )
    signature = models.ImageField(upload_to="logistics/pod/signatures/")
    photo = models.ImageField(upload_to="logistics/pod/photos/", blank=True, null=True)
    received_by = models.CharField(max_length=255, blank=True)
    delivered_at = models.DateTimeField()

    class Meta:
        verbose_name = "POD"
        verbose_name_plural = "PODs"

    def __str__(self):
        return f"POD {self.dispatch}"
