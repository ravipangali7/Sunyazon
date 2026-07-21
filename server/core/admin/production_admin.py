"""Admin for inventory + Process Engine — stock docs and work-order run trees."""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from core.models import (
    BOM,
    Batch,
    BOMLine,
    DamageExpire,
    GRN,
    GRNLine,
    IndustryTemplate,
    ItemMaster,
    MaterialIssue,
    MaterialIssueLine,
    ProcessDefinition,
    ProcessFieldValue,
    ProcessRun,
    ProcessRunLine,
    ProcessRunStage,
    ProcessStage,
    ProcessStageField,
    ProductionCosting,
    RegisterBook,
    StockAdjustment,
    StockLedger,
    Warehouse,
    WIPTracking,
    WorkingReport,
    WorkOrder,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, money, progress_bar


@admin.register(Warehouse)
class WarehouseAdmin(BaseAdmin):
    list_display = ("code", "name", "organization", "type_badge", "address")
    list_filter = ("type", "organization")
    search_fields = ("code", "name")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")


@admin.register(ItemMaster)
class ItemMasterAdmin(BaseAdmin):
    list_display = (
        "item_code", "name", "organization", "category_badge", "uom",
        "min_stock", "reorder_level", "max_stock", "bin_location", "supplier",
    )
    list_filter = ("category", "organization")
    search_fields = ("item_code", "name", "bin_location")
    autocomplete_fields = ["organization", "supplier"]
    list_select_related = ("organization", "supplier")

    @admin.display(description="Category", ordering="category")
    def category_badge(self, obj):
        return choice_badge(obj, "category")


@admin.register(StockLedger)
class StockLedgerAdmin(BaseAdmin):
    list_display = (
        "date", "item", "warehouse", "type_badge", "opening_qty",
        "in_qty", "out_qty", "closing_qty", "reference_type", "work_order",
    )
    list_filter = ("transaction_type", "reference_type", "organization")
    search_fields = ("item__item_code", "item__name", "reference_type")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "item", "warehouse", "work_order", "process_run"]
    list_select_related = ("item", "warehouse", "work_order")

    @admin.display(description="Type", ordering="transaction_type")
    def type_badge(self, obj):
        return choice_badge(obj, "transaction_type")


class GRNLineInline(admin.TabularInline):
    model = GRNLine
    extra = 1
    autocomplete_fields = ["item"]
    fields = ("item", "ordered_qty", "received_qty", "accepted_qty", "rejected_qty")


@admin.register(GRN)
class GRNAdmin(BaseAdmin):
    inlines = [GRNLineInline]
    list_display = (
        "grn_no", "po", "supplier", "organization", "date",
        "line_count", "qc_badge", "status_badge", "received_by",
    )
    list_filter = ("qc_status", "status", "organization")
    search_fields = ("grn_no", "supplier__vendor_name", "po__po_no")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "po", "supplier", "received_by"]
    list_select_related = ("po", "supplier", "organization", "received_by")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="QC", ordering="qc_status")
    def qc_badge(self, obj):
        return choice_badge(obj, "qc_status")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class MaterialIssueLineInline(admin.TabularInline):
    model = MaterialIssueLine
    extra = 1
    autocomplete_fields = ["material"]
    fields = ("material", "required_qty", "issued_qty")


@admin.register(MaterialIssue)
class MaterialIssueAdmin(BaseAdmin):
    inlines = [MaterialIssueLineInline]
    list_display = (
        "issue_no", "date", "organization", "warehouse", "work_order",
        "line_count", "status_badge", "issued_by",
    )
    list_filter = ("status", "organization")
    search_fields = ("issue_no", "work_order__wo_no")
    date_hierarchy = "date"
    autocomplete_fields = [
        "organization", "warehouse", "work_order", "process_run",
        "process_run_stage", "issued_by",
    ]
    list_select_related = ("warehouse", "work_order", "organization", "issued_by")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(BaseAdmin):
    list_display = (
        "date", "item", "warehouse", "system_qty", "physical_qty",
        "variance_col", "organization", "approved_by",
    )
    list_filter = ("organization",)
    search_fields = ("item__item_code", "reason")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "item", "warehouse", "approved_by"]
    list_select_related = ("item", "warehouse", "organization")

    @admin.display(description="Variance", ordering="variance")
    def variance_col(self, obj):
        color = "#198754" if obj.variance == 0 else "#dc3545" if obj.variance < 0 else "#fd7e14"
        return badge(f"{obj.variance:g}", color)


# ------------------------------------------------------------------
# Process Engine
# ------------------------------------------------------------------

@admin.register(IndustryTemplate)
class IndustryTemplateAdmin(BaseAdmin):
    list_display = ("code", "name", "capabilities_col", "stages_col", "system_col", "active_col")
    list_filter = ("is_system", "is_active")
    search_fields = ("code", "name")

    @admin.display(description="Capabilities")
    def capabilities_col(self, obj):
        return ", ".join(obj.default_capabilities or []) or "—"

    @admin.display(description="Stages")
    def stages_col(self, obj):
        return badge(f"{len(obj.default_stages_json or [])} stages", "#0d6efd")

    @admin.display(description="System", ordering="is_system")
    def system_col(self, obj):
        return bool_badge(obj.is_system, "System", "Custom")

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


class ProcessStageFieldInline(admin.TabularInline):
    model = ProcessStageField
    extra = 0
    fields = ("field_key", "label", "field_type", "is_required", "sort_order", "show_on_dashboard")


class ProcessStageInline(admin.StackedInline):
    model = ProcessStage
    extra = 0
    fields = (
        ("code", "name", "sort_order", "stage_type"),
        ("is_optional", "requires_previous_complete", "allow_parallel"),
        ("default_assignee_role", "sla_hours"),
        "ui_config_json",
    )
    show_change_link = True


@admin.register(ProcessDefinition)
class ProcessDefinitionAdmin(BaseAdmin):
    inlines = [ProcessStageInline]
    list_display = (
        "code", "name", "organization", "output_badge", "industry_template",
        "stage_count", "version", "status_badge", "created_at",
    )
    list_filter = ("status", "output_type", "organization")
    search_fields = ("code", "name", "organization__company_name")
    autocomplete_fields = [
        "organization", "industry_template", "default_output_item",
        "form_metadata", "workflow_definition", "created_by",
    ]
    list_select_related = ("organization", "industry_template")

    @admin.display(description="Output", ordering="output_type")
    def output_badge(self, obj):
        return choice_badge(obj, "output_type")

    @admin.display(description="Stages")
    def stage_count(self, obj):
        return badge(f"{obj.stages.count()} stages", "#6f42c1")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(ProcessStage)
class ProcessStageAdmin(BaseAdmin):
    inlines = [ProcessStageFieldInline]
    list_display = (
        "sort_order", "name", "code", "process_definition",
        "type_badge", "optional_col", "field_count", "sla_hours",
    )
    list_filter = ("stage_type", "is_optional")
    search_fields = ("name", "code", "process_definition__name")
    autocomplete_fields = ["process_definition"]
    list_select_related = ("process_definition",)
    ordering = ("process_definition", "sort_order")

    @admin.display(description="Type", ordering="stage_type")
    def type_badge(self, obj):
        return choice_badge(obj, "stage_type")

    @admin.display(description="Optional", ordering="is_optional")
    def optional_col(self, obj):
        return bool_badge(obj.is_optional, "Optional", "Required")

    @admin.display(description="Fields")
    def field_count(self, obj):
        return obj.fields.count()


class BOMLineInline(admin.TabularInline):
    model = BOMLine
    extra = 1
    autocomplete_fields = ["raw_material"]
    fields = ("raw_material", "qty_per_unit", "uom", "scrap_pct", "sort_order", "remarks")


@admin.register(BOM)
class BOMAdmin(BaseAdmin):
    inlines = [BOMLineInline]
    list_display = (
        "code", "name", "organization", "finished_item", "finished_product",
        "line_count", "version", "status_badge", "effective_from",
    )
    list_filter = ("status", "organization")
    search_fields = ("code", "name")
    autocomplete_fields = ["organization", "finished_product", "finished_item"]
    list_select_related = ("organization", "finished_item", "finished_product")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Batch)
class BatchAdmin(BaseAdmin):
    list_display = (
        "batch_no", "organization", "product", "output_item", "batch_size",
        "start_date", "expire_date", "supervisor", "status_badge",
    )
    list_filter = ("status", "organization")
    search_fields = ("batch_no", "product__name")
    date_hierarchy = "start_date"
    autocomplete_fields = ["organization", "product", "output_item", "work_order", "supervisor"]
    list_select_related = ("organization", "product", "output_item", "supervisor")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class ProcessRunInline(admin.StackedInline):
    model = ProcessRun
    extra = 0
    fields = (("run_no", "status"), ("started_at", "completed_at"), "notes")
    show_change_link = True


@admin.register(WorkOrder)
class WorkOrderAdmin(BaseAdmin):
    inlines = [ProcessRunInline]
    list_display = (
        "wo_no", "title", "organization", "process_definition",
        "priority_badge", "qty_col", "progress_col", "supervisor",
        "customer_party", "date", "status_badge",
    )
    list_filter = ("status", "priority", "organization")
    search_fields = ("wo_no", "title", "project_code", "organization__company_name")
    date_hierarchy = "date"
    autocomplete_fields = [
        "organization", "process_definition", "product", "output_item",
        "batch", "bom", "department", "supervisor", "customer_party", "created_by",
    ]
    list_select_related = ("organization", "process_definition", "supervisor", "customer_party")

    fieldsets = (
        ("Work Order", {
            "fields": (
                ("wo_no", "title"),
                ("organization", "process_definition"),
                ("product", "output_item", "batch", "bom"),
            ),
        }),
        ("Quantities", {
            "fields": (("target_qty", "actual_qty", "waste_qty", "uom"),),
        }),
        ("Planning", {
            "fields": (
                ("priority", "status", "date"),
                ("planned_start", "planned_end"),
                ("department", "supervisor", "customer_party"),
                "project_code",
                "custom_data_json",
            ),
        }),
    )

    @admin.display(description="Priority", ordering="priority")
    def priority_badge(self, obj):
        return choice_badge(obj, "priority")

    @admin.display(description="Qty")
    def qty_col(self, obj):
        target = obj.target_qty or 0
        actual = obj.actual_qty or 0
        return format_html("<small>{}/{}</small>", actual, target)

    @admin.display(description="Progress")
    def progress_col(self, obj):
        if not obj.target_qty:
            return "—"
        pct = float(obj.actual_qty or 0) / float(obj.target_qty) * 100
        return progress_bar(pct)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class ProcessRunLineInline(admin.TabularInline):
    model = ProcessRunLine
    extra = 0
    autocomplete_fields = ["item", "from_warehouse", "to_warehouse"]
    fields = (
        "line_type", "item", "item_name", "qty", "uom",
        "from_warehouse", "to_warehouse", "sort_order",
    )


class ProcessFieldValueInline(admin.TabularInline):
    model = ProcessFieldValue
    extra = 0
    autocomplete_fields = ["process_stage_field"]
    fields = ("process_stage_field", "value_text", "value_number", "value_bool", "value_date")


class ProcessRunStageInline(admin.StackedInline):
    model = ProcessRunStage
    extra = 0
    fields = (
        ("process_stage", "sort_order", "status"),
        ("member", "team", "row_ref"),
        ("goal_qty", "total_qty", "actual_qty"),
        ("started_at", "completed_at"),
        "custom_data_json",
    )
    autocomplete_fields = ["process_stage", "member", "team", "parent_run_stage"]
    show_change_link = True


@admin.register(ProcessRun)
class ProcessRunAdmin(BaseAdmin):
    inlines = [ProcessRunStageInline]
    list_display = (
        "run_no", "work_order", "process_definition", "organization",
        "stage_count", "started_at", "completed_at", "status_badge",
    )
    list_filter = ("status", "organization")
    search_fields = ("run_no", "work_order__wo_no")
    autocomplete_fields = ["organization", "work_order", "process_definition"]
    list_select_related = ("work_order", "process_definition", "organization")

    @admin.display(description="Stages")
    def stage_count(self, obj):
        return obj.stages.count()

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(ProcessRunStage)
class ProcessRunStageAdmin(BaseAdmin):
    inlines = [ProcessRunLineInline, ProcessFieldValueInline]
    list_display = (
        "process_stage", "process_run", "member", "row_ref",
        "goal_qty", "actual_qty", "status_badge", "started_at", "completed_at",
    )
    list_filter = ("status",)
    search_fields = ("process_stage__name", "process_run__run_no", "row_ref")
    autocomplete_fields = [
        "process_run", "process_stage", "parent_run_stage", "member", "team",
    ]
    list_select_related = ("process_stage", "process_run", "member")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(WorkingReport)
class WorkingReportAdmin(BaseAdmin):
    list_display = ("employee", "date", "organization", "work_order", "hours", "remarks")
    list_filter = ("organization",)
    search_fields = ("employee__full_name", "work_order__wo_no")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "employee", "work_order", "process_run_stage"]
    list_select_related = ("employee", "work_order", "organization")


@admin.register(DamageExpire)
class DamageExpireAdmin(BaseAdmin):
    list_display = ("date", "reason_badge", "product", "item", "batch", "qty", "organization", "approved_by")
    list_filter = ("reason", "organization")
    search_fields = ("product__name", "item__name", "batch__batch_no")
    date_hierarchy = "date"
    autocomplete_fields = [
        "organization", "product", "item", "batch", "work_order",
        "process_run_line", "approved_by", "stock_ledger",
    ]
    list_select_related = ("product", "item", "batch", "organization")

    @admin.display(description="Reason", ordering="reason")
    def reason_badge(self, obj):
        return choice_badge(obj, "reason")


@admin.register(RegisterBook)
class RegisterBookAdmin(BaseAdmin):
    list_display = ("entry_date", "entry_type", "reference_no", "qty", "balance", "organization", "description")
    list_filter = ("entry_type", "organization")
    search_fields = ("reference_no", "description")
    date_hierarchy = "entry_date"
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)


@admin.register(WIPTracking)
class WIPTrackingAdmin(BaseAdmin):
    list_display = ("date", "process_stage", "work_order", "opening_wip", "input_qty", "output_qty", "closing_wip")
    list_filter = ("organization",)
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "work_order", "process_stage"]
    list_select_related = ("process_stage", "work_order")


@admin.register(ProductionCosting)
class ProductionCostingAdmin(BaseAdmin):
    list_display = (
        "work_order", "period_date", "organization",
        "material_col", "labor_col", "machine_col", "overhead_col", "total_col", "unit_col",
    )
    list_filter = ("organization",)
    search_fields = ("work_order__wo_no",)
    date_hierarchy = "period_date"
    autocomplete_fields = [
        "organization", "work_order", "process_run", "product", "item", "journal_voucher",
    ]
    list_select_related = ("work_order", "organization")

    @admin.display(description="Material", ordering="material_cost")
    def material_col(self, obj):
        return money(obj.material_cost)

    @admin.display(description="Labor", ordering="labor_cost")
    def labor_col(self, obj):
        return money(obj.labor_cost)

    @admin.display(description="Machine", ordering="machine_cost")
    def machine_col(self, obj):
        return money(obj.machine_cost)

    @admin.display(description="Overhead", ordering="overhead_cost")
    def overhead_col(self, obj):
        return money(obj.overhead_cost)

    @admin.display(description="Total", ordering="total_cost")
    def total_col(self, obj):
        return money(obj.total_cost)

    @admin.display(description="Per unit", ordering="per_unit_cost")
    def unit_col(self, obj):
        return money(obj.per_unit_cost) if obj.per_unit_cost is not None else "—"
