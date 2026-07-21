"""Maintenance — equipment, work orders, PM schedules, calibration."""

from __future__ import annotations

from django.db import models

from .base import OrgScopedModel, UUIDPrimaryKeyModel


class Equipment(OrgScopedModel):
    class Category(models.TextChoices):
        A = "A", "Category A"
        B = "B", "Category B"
        C = "C", "Category C"

    class HealthIndex(models.TextChoices):
        GREEN = "green", "Green"
        YELLOW = "yellow", "Yellow"
        RED = "red", "Red"

    asset_code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    capacity = models.CharField(max_length=128, blank=True)
    category = models.CharField(max_length=2, choices=Category.choices, default=Category.B)
    health_index = models.CharField(
        max_length=8,
        choices=HealthIndex.choices,
        default=HealthIndex.GREEN,
        db_index=True,
    )
    purchase_date = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "equipment"
        ordering = ["asset_code"]
        unique_together = [("organization", "asset_code")]

    def __str__(self):
        return f"{self.asset_code} — {self.name}"


class MaintenanceWorkOrder(OrgScopedModel):
    class Type(models.TextChoices):
        PREVENTIVE = "preventive", "Preventive"
        BREAKDOWN = "breakdown", "Breakdown"
        PREDICTIVE = "predictive", "Predictive"

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        APPROVED = "approved", "Approved"
        IN_PROGRESS = "in_progress", "In Progress"
        CLOSED = "closed", "Closed"

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="maintenance_work_orders",
    )
    type = models.CharField(max_length=16, choices=Type.choices, db_index=True)
    description = models.TextField(blank=True)
    technician = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_work_orders",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.REQUESTED,
        db_index=True,
    )
    requested_at = models.DateTimeField(auto_now_add=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"{self.type} — {self.equipment}"


class PMSchedule(UUIDPrimaryKeyModel):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        ANNUAL = "annual", "Annual"

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="pm_schedules",
    )
    frequency = models.CharField(max_length=16, choices=Frequency.choices, db_index=True)
    activity = models.CharField(max_length=255)
    next_due = models.DateField(db_index=True)
    last_done = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = "PM schedule"
        ordering = ["next_due"]

    def __str__(self):
        return f"{self.activity} ({self.equipment})"


class Calibration(UUIDPrimaryKeyModel):
    class Result(models.TextChoices):
        PASS = "pass", "Pass"
        FAIL = "fail", "Fail"

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="calibrations",
    )
    calibrated_at = models.DateField()
    next_due = models.DateField(db_index=True)
    result = models.CharField(max_length=8, choices=Result.choices, default=Result.PASS)
    performed_by = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="calibrations",
    )

    class Meta:
        ordering = ["-calibrated_at"]

    def __str__(self):
        return f"Calibration {self.equipment} @ {self.calibrated_at}"
