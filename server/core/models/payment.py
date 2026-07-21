"""Payment gateway and advertisement models."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, TimeStampedModel, UUIDPrimaryKeyModel


class PaymentGateway(UUIDPrimaryKeyModel):
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    config_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class PaymentTransaction(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    order = models.ForeignKey(
        "core.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_transactions",
    )
    ad_campaign = models.ForeignKey(
        "core.AdCampaign",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_transactions",
    )
    gateway = models.ForeignKey(
        PaymentGateway,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    external_txn_id = models.CharField(max_length=255, blank=True, db_index=True)
    amount = CurrencyField()
    currency = models.CharField(max_length=8, default="NPR")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    payment_method = models.CharField(max_length=64, blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.gateway.code} {self.amount} {self.currency} — {self.status}"


class AdPlan(UUIDPrimaryKeyModel):
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    price = CurrencyField()
    duration_days = models.PositiveIntegerField()
    impressions_limit = models.PositiveIntegerField(default=0)
    features_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["price"]

    def __str__(self):
        return self.name


class AdCampaign(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    advertiser_org = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="ad_campaigns",
    )
    plan = models.ForeignKey(
        AdPlan,
        on_delete=models.PROTECT,
        related_name="campaigns",
    )
    title = models.CharField(max_length=255)
    content_json = models.JSONField(default=dict, blank=True)
    target_audience_json = models.JSONField(default=dict, blank=True)
    budget = CurrencyField()
    spent = CurrencyField()
    payment_transaction = models.ForeignKey(
        PaymentTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paid_campaigns",
    )
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ad_campaigns",
    )
    process_run = models.ForeignKey(
        "core.ProcessRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ad_campaigns",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    class Meta:
        ordering = ["-start_at"]

    def __str__(self):
        return self.title


class AdImpression(UUIDPrimaryKeyModel):
    campaign = models.ForeignKey(
        AdCampaign,
        on_delete=models.CASCADE,
        related_name="impressions",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ad_impressions",
    )
    post_id = models.UUIDField(null=True, blank=True)
    viewed_at = models.DateTimeField(auto_now_add=True)
    clicked = models.BooleanField(default=False)

    class Meta:
        ordering = ["-viewed_at"]

    def __str__(self):
        return f"{self.campaign} impression @ {self.viewed_at:%Y-%m-%d}"
