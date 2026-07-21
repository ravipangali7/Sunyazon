"""Universal Process Engine & production — industry-agnostic definitions, runs, BOM, batches."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, OrgScopedModel, UUIDPrimaryKeyModel


class IndustryTemplate(UUIDPrimaryKeyModel):
    code = models.CharField(
        max_length=64,
        unique=True,
        help_text="fmcg_food, chocolate, software, construction, marketing, generic",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    default_capabilities = models.JSONField(default=list, blank=True)
    default_stages_json = models.JSONField(default=list, blank=True)
    default_fields_json = models.JSONField(default=dict, blank=True)
    is_system = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class ProcessDefinition(OrgScopedModel):
    class OutputType(models.TextChoices):
        PRODUCT = "product", "Product"
        DELIVERABLE = "deliverable", "Deliverable"
        CAMPAIGN = "campaign", "Campaign"
        PROJECT = "project", "Project"
        SERVICE = "service", "Service"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    industry_template = models.ForeignKey(
        IndustryTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_definitions",
    )
    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    output_type = models.CharField(
        max_length=16,
        choices=OutputType.choices,
        default=OutputType.PRODUCT,
        db_index=True,
    )
    default_output_item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_definitions",
    )
    form_metadata = models.ForeignKey(
        "core.MetadataForm",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_definitions",
    )
    workflow_definition = models.ForeignKey(
        "core.WorkflowDefinition",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_definitions",
    )
    version = models.PositiveIntegerField(default=1)
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
        related_name="created_process_definitions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        unique_together = [("organization", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class ProcessStage(UUIDPrimaryKeyModel):
    class StageType(models.TextChoices):
        TRANSFORM = "transform", "Transform"
        ASSEMBLE = "assemble", "Assemble"
        INSPECT = "inspect", "Inspect"
        PACKAGE = "package", "Package"
        APPROVE = "approve", "Approve"
        DELIVER = "deliver", "Deliver"
        CUSTOM = "custom", "Custom"

    process_definition = models.ForeignKey(
        ProcessDefinition,
        on_delete=models.CASCADE,
        related_name="stages",
    )
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=255, help_text="Display label (Mixing Row, Packaging, Development…)")
    sort_order = models.PositiveIntegerField(default=0)
    stage_type = models.CharField(
        max_length=16,
        choices=StageType.choices,
        default=StageType.CUSTOM,
        db_index=True,
    )
    is_optional = models.BooleanField(default=False)
    requires_previous_complete = models.BooleanField(default=True)
    allow_parallel = models.BooleanField(default=False)
    default_assignee_role = models.CharField(max_length=128, blank=True)
    sla_hours = models.PositiveIntegerField(null=True, blank=True)
    ui_config_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["process_definition", "sort_order"]
        unique_together = [("process_definition", "code")]

    def __str__(self):
        return f"{self.sort_order}. {self.name}"


class ProcessStageField(UUIDPrimaryKeyModel):
    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        CURRENCY = "currency", "Currency"
        DATE = "date", "Date"
        DATETIME = "datetime", "DateTime"
        BOOLEAN = "boolean", "Boolean"
        DROPDOWN = "dropdown", "Dropdown"
        MULTI_SELECT = "multi_select", "Multi Select"
        FILE = "file", "File"
        IMAGE = "image", "Image"
        GPS = "gps", "GPS"
        BARCODE = "barcode", "Barcode"
        RICH_TEXT = "rich_text", "Rich Text"

    process_stage = models.ForeignKey(
        ProcessStage,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    field_key = models.CharField(max_length=64)
    label = models.CharField(max_length=255)
    field_type = models.CharField(
        max_length=16,
        choices=FieldType.choices,
        default=FieldType.TEXT,
    )
    is_required = models.BooleanField(default=False)
    options_json = models.JSONField(null=True, blank=True)
    validation_json = models.JSONField(null=True, blank=True)
    default_value = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    show_on_dashboard = models.BooleanField(default=False)

    class Meta:
        ordering = ["process_stage", "sort_order"]
        unique_together = [("process_stage", "field_key")]

    def __str__(self):
        return f"{self.label} ({self.field_type})"


class Batch(OrgScopedModel):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"
        QUARANTINED = "quarantined", "Quarantined"

    batch_no = models.CharField(max_length=64, db_index=True)
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    output_item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    work_order = models.ForeignKey(
        "core.WorkOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    batch_size = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    manufacture_date = models.DateField(null=True, blank=True)
    expire_date = models.DateField(null=True, blank=True)
    supervisor = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_batches",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PLANNED,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "batches"
        ordering = ["-start_date"]
        unique_together = [("organization", "batch_no")]

    def __str__(self):
        return self.batch_no


class BOM(OrgScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        OBSOLETE = "obsolete", "Obsolete"

    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    finished_product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="boms",
    )
    finished_item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="boms",
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    effective_from = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "BOM"
        verbose_name_plural = "BOMs"
        ordering = ["code", "-version"]
        unique_together = [("organization", "code", "version")]

    def __str__(self):
        return f"{self.code} v{self.version}"


class BOMLine(UUIDPrimaryKeyModel):
    bom = models.ForeignKey(
        BOM,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    raw_material = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.PROTECT,
        related_name="bom_lines",
    )
    qty_per_unit = models.DecimalField(max_digits=14, decimal_places=4)
    uom = models.CharField(max_length=32, default="pcs")
    scrap_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    remarks = models.TextField(blank=True)

    class Meta:
        verbose_name = "BOM line"
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.raw_material} × {self.qty_per_unit}/{self.uom}"


class WorkOrder(OrgScopedModel):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RELEASED = "released", "Released"
        IN_PROGRESS = "in_progress", "In Progress"
        ON_HOLD = "on_hold", "On Hold"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    process_definition = models.ForeignKey(
        ProcessDefinition,
        on_delete=models.PROTECT,
        related_name="work_orders",
    )
    wo_no = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=255)
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    output_item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    bom = models.ForeignKey(
        BOM,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    target_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    actual_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    waste_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    uom = models.CharField(max_length=32, blank=True)
    priority = models.CharField(
        max_length=16,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )
    planned_start = models.DateTimeField(null=True, blank=True)
    planned_end = models.DateTimeField(null=True, blank=True)
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    supervisor = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_work_orders",
    )
    customer_party = models.ForeignKey(
        "core.Party",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_orders",
    )
    project_code = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    date = models.DateField(db_index=True)
    custom_data_json = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_work_orders",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("organization", "wo_no")]

    def __str__(self):
        return f"{self.wo_no} — {self.title}"


class ProcessRun(OrgScopedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        ABORTED = "aborted", "Aborted"

    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    process_definition = models.ForeignKey(
        ProcessDefinition,
        on_delete=models.PROTECT,
        related_name="runs",
    )
    run_no = models.CharField(max_length=64, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.run_no} ({self.work_order})"


class ProcessRunStage(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"

    process_run = models.ForeignKey(
        ProcessRun,
        on_delete=models.CASCADE,
        related_name="stages",
    )
    process_stage = models.ForeignKey(
        ProcessStage,
        on_delete=models.PROTECT,
        related_name="run_stages",
    )
    parent_run_stage = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="child_run_stages",
    )
    member = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_run_stages",
    )
    team = models.ForeignKey(
        "core.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_run_stages",
    )
    row_ref = models.CharField(max_length=64, blank=True)
    goal_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    total_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    actual_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    custom_data_json = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["process_run", "sort_order"]

    def __str__(self):
        return f"{self.process_stage.name} — {self.process_run}"


class ProcessRunLine(UUIDPrimaryKeyModel):
    class LineType(models.TextChoices):
        INPUT = "input", "Input"
        OUTPUT = "output", "Output"
        WASTAGE = "wastage", "Wastage"
        REFINE = "refine", "Refine"
        RESOURCE = "resource", "Resource"
        DELIVERABLE = "deliverable", "Deliverable"
        CONSUMABLE = "consumable", "Consumable"

    process_run_stage = models.ForeignKey(
        ProcessRunStage,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    line_type = models.CharField(max_length=16, choices=LineType.choices, db_index=True)
    item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_run_lines",
    )
    item_name = models.CharField(max_length=255, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    uom = models.CharField(max_length=32, blank=True)
    from_warehouse = models.ForeignKey(
        "core.Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outgoing_process_lines",
    )
    to_warehouse = models.ForeignKey(
        "core.Warehouse",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_process_lines",
    )
    stock_ledger = models.ForeignKey(
        "core.StockLedger",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="process_run_lines",
    )
    refine_input_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    refine_output_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    refine_loss_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    notes = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["process_run_stage", "sort_order"]

    def __str__(self):
        return f"{self.line_type}: {self.item or self.item_name} × {self.qty}"


class ProcessFieldValue(UUIDPrimaryKeyModel):
    process_run_stage = models.ForeignKey(
        ProcessRunStage,
        on_delete=models.CASCADE,
        related_name="field_values",
    )
    process_stage_field = models.ForeignKey(
        ProcessStageField,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value_text = models.TextField(null=True, blank=True)
    value_number = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)
    value_date = models.DateTimeField(null=True, blank=True)
    value_json = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = [("process_run_stage", "process_stage_field")]

    def __str__(self):
        return f"{self.process_stage_field.field_key} @ {self.process_run_stage}"


class WorkingReport(OrgScopedModel):
    employee = models.ForeignKey(
        "core.Employee",
        on_delete=models.CASCADE,
        related_name="working_reports",
    )
    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="working_reports",
    )
    process_run_stage = models.ForeignKey(
        ProcessRunStage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="working_reports",
    )
    date = models.DateField(db_index=True)
    activities_json = models.JSONField(default=list, blank=True)
    hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee} — {self.date} ({self.hours}h)"


class DamageExpire(OrgScopedModel):
    class Reason(models.TextChoices):
        DAMAGE = "damage", "Damage"
        EXPIRE = "expire", "Expire"
        SCRAP = "scrap", "Scrap"
        OTHER = "other", "Other"

    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )
    item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )
    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )
    process_run_line = models.ForeignKey(
        ProcessRunLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    reason = models.CharField(
        max_length=16,
        choices=Reason.choices,
        default=Reason.DAMAGE,
        db_index=True,
    )
    date = models.DateField(db_index=True)
    approved_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_damage_expires",
    )
    stock_ledger = models.ForeignKey(
        "core.StockLedger",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="damage_expires",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.reason}: {self.product or self.item} × {self.qty}"


class RegisterBook(OrgScopedModel):
    entry_date = models.DateField(db_index=True)
    entry_type = models.CharField(max_length=64, blank=True)
    reference_type = models.CharField(
        max_length=64,
        blank=True,
        help_text="work_order, process_run, manual",
    )
    reference_id = models.UUIDField(null=True, blank=True)
    reference_no = models.CharField(max_length=64, blank=True)
    description = models.TextField(blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    balance = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        ordering = ["-entry_date"]

    def __str__(self):
        return f"{self.entry_date} — {self.reference_no or self.entry_type}"


class WIPTracking(OrgScopedModel):
    date = models.DateField(db_index=True)
    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wip_trackings",
    )
    process_stage = models.ForeignKey(
        ProcessStage,
        on_delete=models.CASCADE,
        related_name="wip_trackings",
    )
    opening_wip = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    input_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    output_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    closing_wip = models.DecimalField(max_digits=14, decimal_places=3, default=0)

    class Meta:
        verbose_name = "WIP tracking"
        verbose_name_plural = "WIP trackings"
        ordering = ["-date"]

    def __str__(self):
        return f"WIP {self.process_stage} @ {self.date}"


class ProductionCosting(OrgScopedModel):
    work_order = models.ForeignKey(
        WorkOrder,
        on_delete=models.CASCADE,
        related_name="costings",
    )
    process_run = models.ForeignKey(
        ProcessRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="costings",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_costings",
    )
    item = models.ForeignKey(
        "core.ItemMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_costings",
    )
    material_cost = CurrencyField()
    labor_cost = CurrencyField()
    machine_cost = CurrencyField()
    overhead_cost = CurrencyField()
    total_cost = CurrencyField()
    per_unit_cost = CurrencyField(null=True, blank=True)
    journal_voucher = models.ForeignKey(
        "core.JournalVoucher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_costings",
    )
    period_date = models.DateField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_date"]

    def __str__(self):
        return f"Costing {self.work_order} — {self.total_cost}"
