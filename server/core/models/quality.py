"""Quality (QA/QC) — inspections, NCR, CAPA, lab reports, masters."""

from __future__ import annotations

from django.db import models

from .base import OrgScopedModel


class QCStatus(models.TextChoices):
    PASS = "pass", "Pass"
    FAIL = "fail", "Fail"
    HOLD = "hold", "Hold"


class IncomingInspection(OrgScopedModel):
    inspection_no = models.CharField(max_length=64, db_index=True)
    date = models.DateField(db_index=True)
    supplier = models.ForeignKey(
        "core.Vendor",
        on_delete=models.PROTECT,
        related_name="incoming_inspections",
    )
    material = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="incoming_inspections",
    )
    batch = models.ForeignKey(
        "core.Batch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_inspections",
    )
    batch_no = models.CharField(max_length=64, blank=True)
    grn_line = models.ForeignKey(
        "core.GRNLine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inspections",
    )
    parameter = models.CharField(max_length=255, blank=True)
    result = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=8,
        choices=QCStatus.choices,
        default=QCStatus.HOLD,
        db_index=True,
    )
    inspector = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="incoming_inspections",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.inspection_no} — {self.material}"


class InProcessQC(OrgScopedModel):
    date = models.DateField(db_index=True)
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    batch = models.ForeignKey(
        "core.Batch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    batch_no = models.CharField(max_length=64, blank=True)
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    process_run = models.ForeignKey(
        "core.ProcessRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    process_run_stage = models.ForeignKey(
        "core.ProcessRunStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    process_stage = models.ForeignKey(
        "core.ProcessStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_process_qcs",
    )
    process_step = models.CharField(max_length=128, blank=True)
    parameter = models.CharField(max_length=255, blank=True)
    standard = models.CharField(max_length=255, blank=True)
    actual = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=8,
        choices=QCStatus.choices,
        default=QCStatus.HOLD,
        db_index=True,
    )
    inspector = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="in_process_qcs",
    )

    class Meta:
        verbose_name = "in-process QC"
        verbose_name_plural = "in-process QCs"
        ordering = ["-date"]

    def __str__(self):
        return f"IPQC {self.parameter} @ {self.date}"


class FinalQARelease(OrgScopedModel):
    class ReleaseStatus(models.TextChoices):
        RELEASED = "released", "Released"
        HELD = "held", "Held"
        REJECTED = "rejected", "Rejected"

    batch_no = models.CharField(max_length=64, blank=True)
    batch = models.ForeignKey(
        "core.Batch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_qa_releases",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_qa_releases",
    )
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_qa_releases",
    )
    process_run = models.ForeignKey(
        "core.ProcessRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_qa_releases",
    )
    process_run_stage = models.ForeignKey(
        "core.ProcessRunStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="final_qa_releases",
    )
    inspection_date = models.DateField(db_index=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    quality_status = models.CharField(
        max_length=8,
        choices=QCStatus.choices,
        default=QCStatus.HOLD,
    )
    release_status = models.CharField(
        max_length=16,
        choices=ReleaseStatus.choices,
        default=ReleaseStatus.HELD,
        db_index=True,
    )
    approved_by = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="final_qa_approvals",
    )

    class Meta:
        verbose_name = "final QA release"
        ordering = ["-inspection_date"]

    def __str__(self):
        return f"Final QA {self.batch_no or self.work_order} — {self.release_status}"


class LabReport(OrgScopedModel):
    test_no = models.CharField(max_length=64, db_index=True)
    sample = models.CharField(max_length=255, blank=True)
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_reports",
    )
    process_run_stage = models.ForeignKey(
        "core.ProcessRunStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_reports",
    )
    batch = models.ForeignKey(
        "core.Batch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_reports",
    )
    test_parameter = models.CharField(max_length=255, blank=True)
    method = models.CharField(max_length=255, blank=True)
    specification = models.CharField(max_length=255, blank=True)
    result = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=32, blank=True)
    status = models.CharField(
        max_length=8,
        choices=QCStatus.choices,
        default=QCStatus.HOLD,
        db_index=True,
    )

    class Meta:
        ordering = ["-test_no"]

    def __str__(self):
        return f"{self.test_no} — {self.test_parameter}"


class NCR(OrgScopedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        INVESTIGATING = "investigating", "Investigating"
        CORRECTED = "corrected", "Corrected"
        CLOSED = "closed", "Closed"

    ncr_no = models.CharField(max_length=64, db_index=True)
    date = models.DateField(db_index=True)
    issue = models.TextField()
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ncrs",
    )
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ncrs",
    )
    process_run_stage = models.ForeignKey(
        "core.ProcessRunStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ncrs",
    )
    root_cause = models.TextField(blank=True)
    correction = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    class Meta:
        verbose_name = "NCR"
        verbose_name_plural = "NCRs"
        ordering = ["-date"]

    def __str__(self):
        return self.ncr_no


class CAPA(OrgScopedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    capa_no = models.CharField(max_length=64, db_index=True)
    problem = models.TextField()
    root_cause = models.TextField(blank=True)
    corrective_action = models.TextField(blank=True)
    preventive_action = models.TextField(blank=True)
    owner = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="capas",
    )
    due_date = models.DateField(null=True, blank=True)
    ncr = models.ForeignKey(
        NCR,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="capas",
    )
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="capas",
    )
    status = models.CharField(
        max_length=8,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    class Meta:
        verbose_name = "CAPA"
        verbose_name_plural = "CAPAs"
        ordering = ["-due_date"]

    def __str__(self):
        return self.capa_no


class QualityMaster(OrgScopedModel):
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quality_masters",
    )
    process_definition = models.ForeignKey(
        "core.ProcessDefinition",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quality_masters",
    )
    process_stage = models.ForeignKey(
        "core.ProcessStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quality_masters",
    )
    quality_parameter = models.CharField(max_length=255)
    specification = models.CharField(max_length=255, blank=True)
    tolerance = models.CharField(max_length=128, blank=True)
    testing_frequency = models.CharField(max_length=128, blank=True)

    class Meta:
        ordering = ["quality_parameter"]

    def __str__(self):
        return self.quality_parameter
