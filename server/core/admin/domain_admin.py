"""Admin for sales/logistics, quality, CRM, maintenance, analytics."""

from __future__ import annotations

from django.contrib import admin

from core.models import (
    ASMOrder,
    CAPA,
    Calibration,
    Complaint,
    CustomerActivity,
    DashboardWidget,
    DealerSalesLine,
    DealerSalesOrder,
    Dispatch,
    Equipment,
    FinalQARelease,
    IncomingInspection,
    InProcessQC,
    KPISnapshot,
    LabReport,
    MaintenanceWorkOrder,
    NCR,
    Party,
    PipelineDeal,
    PMSchedule,
    POD,
    PromotionScheme,
    QualityMaster,
    ReportDefinition,
    RetailSalesLine,
    RetailSalesOrder,
    ReturnOrder,
    Route,
    Territory,
    Vehicle,
)

from .base import BaseAdmin, badge, choice_badge, image_thumb, money, progress_bar


@admin.register(Party)
class PartyAdmin(BaseAdmin):
    list_display = ("name", "type_badge", "organization", "area", "asm", "credit_col", "status_badge")
    list_filter = ("party_type", "status", "organization")
    search_fields = ("name", "area")
    autocomplete_fields = ["organization", "asm"]
    list_select_related = ("organization", "asm")

    @admin.display(description="Type", ordering="party_type")
    def type_badge(self, obj):
        return choice_badge(obj, "party_type")

    @admin.display(description="Credit limit", ordering="credit_limit")
    def credit_col(self, obj):
        return money(obj.credit_limit)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Territory)
class TerritoryAdmin(BaseAdmin):
    list_display = ("name", "region", "organization", "asm")
    list_filter = ("organization", "region")
    search_fields = ("name", "region")
    autocomplete_fields = ["organization", "asm"]
    list_select_related = ("organization", "asm")


@admin.register(ASMOrder)
class ASMOrderAdmin(BaseAdmin):
    list_display = ("party", "asm", "product", "date", "qty", "price_col", "amount_col", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("party__name", "product__name")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "party", "asm", "product"]
    list_select_related = ("party", "asm", "product")

    @admin.display(description="Price", ordering="price")
    def price_col(self, obj):
        return money(obj.price)

    @admin.display(description="Amount", ordering="amount")
    def amount_col(self, obj):
        return money(obj.amount)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class DealerSalesLineInline(admin.TabularInline):
    model = DealerSalesLine
    extra = 1
    autocomplete_fields = ["product"]
    fields = ("product", "barcode", "unit", "qty", "price", "discount", "amount")


@admin.register(DealerSalesOrder)
class DealerSalesOrderAdmin(BaseAdmin):
    inlines = [DealerSalesLineInline]
    list_display = ("party", "dsm", "date", "line_count", "discount_col", "total_col", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("party__name",)
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "party", "dsm"]
    list_select_related = ("party", "dsm")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Discount", ordering="discount")
    def discount_col(self, obj):
        return money(obj.discount)

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class RetailSalesLineInline(admin.TabularInline):
    model = RetailSalesLine
    extra = 1
    autocomplete_fields = ["product"]
    fields = ("product", "barcode", "unit", "qty", "price", "discount", "amount")


@admin.register(RetailSalesOrder)
class RetailSalesOrderAdmin(BaseAdmin):
    inlines = [RetailSalesLineInline]
    list_display = ("party", "rsm", "dealer_order", "date", "line_count", "total_col", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("party__name",)
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "party", "rsm", "dealer_order"]
    list_select_related = ("party", "rsm", "dealer_order")

    @admin.display(description="Lines")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(ReturnOrder)
class ReturnOrderAdmin(BaseAdmin):
    list_display = ("party", "organization", "total_col", "status_badge", "reason")
    list_filter = ("status", "organization")
    search_fields = ("party__name", "reason")
    autocomplete_fields = ["organization", "party"]
    list_select_related = ("party", "organization")

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(PromotionScheme)
class PromotionSchemeAdmin(BaseAdmin):
    list_display = ("name", "code", "organization", "budget_col", "start_date", "end_date", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("name", "code")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Budget", ordering="budget")
    def budget_col(self, obj):
        return money(obj.budget)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Vehicle)
class VehicleAdmin(BaseAdmin):
    list_display = ("number", "organization", "capacity", "insurance_expiry", "fitness_expiry", "tax_expiry")
    list_filter = ("organization",)
    search_fields = ("number",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)


@admin.register(Route)
class RouteAdmin(BaseAdmin):
    list_display = ("name", "organization", "territory")
    list_filter = ("organization",)
    search_fields = ("name",)
    autocomplete_fields = ["organization", "territory"]
    list_select_related = ("organization", "territory")


class PODInline(admin.StackedInline):
    model = POD
    extra = 0
    fields = (("signature", "photo"), ("received_by", "delivered_at"))


@admin.register(Dispatch)
class DispatchAdmin(BaseAdmin):
    inlines = [PODInline]
    list_display = (
        "sales_order", "vehicle", "driver", "route", "organization",
        "status_badge", "dispatched_at", "delivered_at", "has_pod",
    )
    list_filter = ("status", "organization")
    search_fields = ("sales_order__so_no", "vehicle__number", "driver__full_name")
    autocomplete_fields = ["organization", "sales_order", "vehicle", "driver", "route"]
    list_select_related = ("sales_order", "vehicle", "driver", "route", "organization")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    @admin.display(description="POD", boolean=True)
    def has_pod(self, obj):
        return hasattr(obj, "pod")


@admin.register(POD)
class PODAdmin(BaseAdmin):
    list_display = ("dispatch", "signature_col", "photo_col", "received_by", "delivered_at")
    search_fields = ("received_by", "dispatch__sales_order__so_no")
    autocomplete_fields = ["dispatch"]
    list_select_related = ("dispatch",)

    @admin.display(description="Signature")
    def signature_col(self, obj):
        return image_thumb(obj.signature, size=48)

    @admin.display(description="Photo")
    def photo_col(self, obj):
        return image_thumb(obj.photo, size=48)


# ------------------------------------------------------------------
# Quality / CRM / Maintenance / Analytics
# ------------------------------------------------------------------

@admin.register(IncomingInspection)
class IncomingInspectionAdmin(BaseAdmin):
    list_display = ("inspection_no", "date", "supplier", "material", "batch_no", "parameter", "result", "status_badge", "inspector")
    list_filter = ("status", "organization")
    search_fields = ("inspection_no", "material__name", "batch_no")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "supplier", "material", "batch", "grn_line", "inspector"]
    list_select_related = ("supplier", "material", "inspector")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(InProcessQC)
class InProcessQCAdmin(BaseAdmin):
    list_display = ("date", "process_step", "work_order", "parameter", "standard", "actual", "status_badge", "inspector")
    list_filter = ("status", "organization")
    search_fields = ("parameter", "process_step", "batch_no")
    date_hierarchy = "date"
    autocomplete_fields = [
        "organization", "product", "batch", "work_order", "process_run",
        "process_run_stage", "process_stage", "inspector",
    ]
    list_select_related = ("work_order", "inspector")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(FinalQARelease)
class FinalQAReleaseAdmin(BaseAdmin):
    list_display = (
        "batch_no", "product", "work_order", "inspection_date", "quantity",
        "quality_badge", "release_badge", "approved_by",
    )
    list_filter = ("quality_status", "release_status", "organization")
    search_fields = ("batch_no", "product__name")
    date_hierarchy = "inspection_date"
    autocomplete_fields = [
        "organization", "batch", "product", "work_order",
        "process_run", "process_run_stage", "approved_by",
    ]
    list_select_related = ("product", "work_order", "approved_by")

    @admin.display(description="Quality", ordering="quality_status")
    def quality_badge(self, obj):
        return choice_badge(obj, "quality_status")

    @admin.display(description="Release", ordering="release_status")
    def release_badge(self, obj):
        return choice_badge(obj, "release_status")


@admin.register(LabReport)
class LabReportAdmin(BaseAdmin):
    list_display = ("test_no", "sample", "test_parameter", "method", "result", "unit", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("test_no", "sample", "test_parameter")
    autocomplete_fields = ["organization", "work_order", "process_run_stage", "batch"]

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class CAPAInline(admin.StackedInline):
    model = CAPA
    extra = 0
    fields = (
        "capa_no", "problem", "root_cause",
        ("corrective_action", "preventive_action"),
        ("owner", "due_date", "status"),
        "work_order",
    )
    autocomplete_fields = ["owner", "work_order"]
    fk_name = "ncr"


@admin.register(NCR)
class NCRAdmin(BaseAdmin):
    inlines = [CAPAInline]
    list_display = ("ncr_no", "date", "organization", "department", "work_order", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("ncr_no", "issue")
    date_hierarchy = "date"
    autocomplete_fields = ["organization", "department", "work_order", "process_run_stage"]
    list_select_related = ("organization", "department", "work_order")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(CAPA)
class CAPAAdmin(BaseAdmin):
    list_display = ("capa_no", "owner", "due_date", "ncr", "work_order", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("capa_no", "problem")
    autocomplete_fields = ["organization", "owner", "ncr", "work_order"]
    list_select_related = ("owner", "ncr", "work_order")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(QualityMaster)
class QualityMasterAdmin(BaseAdmin):
    list_display = ("quality_parameter", "specification", "tolerance", "testing_frequency", "product", "process_stage")
    search_fields = ("quality_parameter", "specification")
    autocomplete_fields = ["organization", "product", "process_definition", "process_stage"]


@admin.register(Complaint)
class ComplaintAdmin(BaseAdmin):
    list_display = ("customer", "product", "organization", "status_badge", "sla_hours", "registered_at", "closed_at")
    list_filter = ("status", "organization")
    search_fields = ("customer__username", "description", "product__name")
    date_hierarchy = "registered_at"
    autocomplete_fields = ["organization", "customer", "product"]
    list_select_related = ("customer", "product", "organization")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(PipelineDeal)
class PipelineDealAdmin(BaseAdmin):
    list_display = ("title", "party", "stage_badge", "value_col", "owner", "expected_close", "work_order")
    list_filter = ("stage", "organization")
    search_fields = ("title", "party__name")
    autocomplete_fields = ["organization", "party", "owner", "work_order"]
    list_select_related = ("party", "owner", "work_order")

    @admin.display(description="Stage", ordering="stage")
    def stage_badge(self, obj):
        return choice_badge(obj, "stage")

    @admin.display(description="Value", ordering="value")
    def value_col(self, obj):
        return money(obj.value)


@admin.register(CustomerActivity)
class CustomerActivityAdmin(BaseAdmin):
    list_display = ("party", "type_badge", "performed_by", "performed_at", "notes")
    list_filter = ("activity_type", "organization")
    search_fields = ("party__name", "notes")
    date_hierarchy = "performed_at"
    autocomplete_fields = ["organization", "party", "performed_by"]
    list_select_related = ("party", "performed_by")

    @admin.display(description="Type", ordering="activity_type")
    def type_badge(self, obj):
        return choice_badge(obj, "activity_type")


class PMScheduleInline(admin.TabularInline):
    model = PMSchedule
    extra = 0
    fields = ("frequency", "activity", "next_due", "last_done")


class CalibrationInline(admin.TabularInline):
    model = Calibration
    extra = 0
    fields = ("calibrated_at", "next_due", "result", "performed_by")
    autocomplete_fields = ["performed_by"]


class MaintenanceWOInline(admin.StackedInline):
    model = MaintenanceWorkOrder
    extra = 0
    fields = (("type", "status"), "description", ("technician", "requested_at", "closed_at"))
    autocomplete_fields = ["technician"]
    readonly_fields = ("requested_at",)


@admin.register(Equipment)
class EquipmentAdmin(BaseAdmin):
    inlines = [PMScheduleInline, CalibrationInline, MaintenanceWOInline]
    list_display = (
        "asset_code", "name", "organization", "location", "category_badge",
        "health_badge", "purchase_date", "open_wo_count",
    )
    list_filter = ("category", "health_index", "organization")
    search_fields = ("asset_code", "name", "location")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Category", ordering="category")
    def category_badge(self, obj):
        return choice_badge(obj, "category")

    @admin.display(description="Health", ordering="health_index")
    def health_badge(self, obj):
        return choice_badge(obj, "health_index")

    @admin.display(description="Open WOs")
    def open_wo_count(self, obj):
        count = obj.maintenance_work_orders.exclude(status="closed").count()
        return badge(str(count), "#fd7e14" if count else "#198754")


@admin.register(MaintenanceWorkOrder)
class MaintenanceWorkOrderAdmin(BaseAdmin):
    list_display = ("equipment", "type_badge", "technician", "status_badge", "requested_at", "closed_at")
    list_filter = ("type", "status", "organization")
    search_fields = ("equipment__asset_code", "description")
    date_hierarchy = "requested_at"
    autocomplete_fields = ["organization", "equipment", "technician"]
    list_select_related = ("equipment", "technician")

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(DashboardWidget)
class DashboardWidgetAdmin(BaseAdmin):
    list_display = ("widget_code", "workspace_badge", "role", "sort_order")
    list_filter = ("workspace_type",)
    search_fields = ("widget_code", "role")
    list_editable = ("sort_order",)

    @admin.display(description="Workspace", ordering="workspace_type")
    def workspace_badge(self, obj):
        return choice_badge(obj, "workspace_type")


@admin.register(KPISnapshot)
class KPISnapshotAdmin(BaseAdmin):
    list_display = ("kpi_code", "organization", "period_date", "target", "actual", "achievement_col")
    list_filter = ("organization", "kpi_code")
    search_fields = ("kpi_code",)
    date_hierarchy = "period_date"
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Achievement", ordering="achievement_pct")
    def achievement_col(self, obj):
        color = "#198754" if obj.achievement_pct >= 100 else "#fd7e14" if obj.achievement_pct >= 70 else "#dc3545"
        return progress_bar(obj.achievement_pct, color)


@admin.register(ReportDefinition)
class ReportDefinitionAdmin(BaseAdmin):
    list_display = ("name", "domain", "organization", "created_by")
    list_filter = ("domain",)
    search_fields = ("name", "domain")
    autocomplete_fields = ["organization", "created_by"]
    list_select_related = ("organization", "created_by")
