"""Analytics — dashboard widgets, KPI snapshots, report definitions."""

from __future__ import annotations

from django.db import models

from .base import OrgScopedModel, UUIDPrimaryKeyModel


class DashboardWidget(UUIDPrimaryKeyModel):
    class WorkspaceType(models.TextChoices):
        EXECUTIVE = "executive", "Executive"
        MANUFACTURE = "manufacture", "Manufacture"
        OPERATIONS = "operations", "Operations"
        SOFTWARE = "software", "Software"
        CONSTRUCTION = "construction", "Construction"
        MARKETING = "marketing", "Marketing"
        DISTRIBUTOR = "distributor", "Distributor"
        RETAIL = "retail", "Retail"
        PROCESSING = "processing", "Processing"
        CONSUMER = "consumer", "Consumer"
        SELLER = "seller", "Seller"

    workspace_type = models.CharField(
        max_length=32,
        choices=WorkspaceType.choices,
        db_index=True,
    )
    role = models.CharField(max_length=128, blank=True)
    widget_code = models.CharField(max_length=64, db_index=True)
    query_config_json = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["workspace_type", "sort_order"]

    def __str__(self):
        return f"{self.workspace_type} — {self.widget_code}"


class KPISnapshot(OrgScopedModel):
    kpi_code = models.CharField(max_length=64, db_index=True)
    target = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    actual = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    achievement_pct = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    period_date = models.DateField(db_index=True)

    class Meta:
        verbose_name = "KPI snapshot"
        ordering = ["-period_date"]

    def __str__(self):
        return f"{self.kpi_code} @ {self.period_date} ({self.achievement_pct}%)"


class ReportDefinition(UUIDPrimaryKeyModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="report_definitions",
    )
    name = models.CharField(max_length=255)
    domain = models.CharField(max_length=64, blank=True)
    fields_json = models.JSONField(default=list, blank=True)
    filters_json = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="report_definitions",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
