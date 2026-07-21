"""CRM — complaints, pipeline deals, customer activity."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, OrgScopedModel


class Complaint(OrgScopedModel):
    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        INVESTIGATING = "investigating", "Investigating"
        CAPA = "capa", "CAPA"
        CLOSED = "closed", "Closed"

    customer = models.ForeignKey(
        "core.User",
        on_delete=models.PROTECT,
        related_name="complaints",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="complaints",
    )
    description = models.TextField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.REGISTERED,
        db_index=True,
    )
    registered_at = models.DateTimeField(auto_now_add=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    sla_hours = models.PositiveIntegerField(default=48)

    class Meta:
        ordering = ["-registered_at"]

    def __str__(self):
        return f"Complaint {self.customer} — {self.status}"


class PipelineDeal(OrgScopedModel):
    class Stage(models.TextChoices):
        LEAD = "lead", "Lead"
        QUALIFIED = "qualified", "Qualified"
        PROPOSAL = "proposal", "Proposal"
        NEGOTIATION = "negotiation", "Negotiation"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    party = models.ForeignKey(
        "core.Party",
        on_delete=models.PROTECT,
        related_name="pipeline_deals",
    )
    title = models.CharField(max_length=255)
    stage = models.CharField(
        max_length=16,
        choices=Stage.choices,
        default=Stage.LEAD,
        db_index=True,
    )
    value = CurrencyField()
    owner = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="pipeline_deals",
    )
    expected_close = models.DateField(null=True, blank=True)
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pipeline_deals",
    )

    class Meta:
        ordering = ["-expected_close"]

    def __str__(self):
        return self.title


class CustomerActivity(OrgScopedModel):
    class ActivityType(models.TextChoices):
        CALL = "call", "Call"
        VISIT = "visit", "Visit"
        EMAIL = "email", "Email"
        FOLLOW_UP = "follow_up", "Follow Up"

    party = models.ForeignKey(
        "core.Party",
        on_delete=models.CASCADE,
        related_name="activities",
    )
    activity_type = models.CharField(
        max_length=16,
        choices=ActivityType.choices,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    performed_by = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="customer_activities",
    )
    performed_at = models.DateTimeField(db_index=True)

    class Meta:
        verbose_name_plural = "customer activities"
        ordering = ["-performed_at"]

    def __str__(self):
        return f"{self.activity_type} — {self.party}"
