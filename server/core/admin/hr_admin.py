"""Admin for HR — employees with photo columns, recruitment & payroll inlines."""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from core.models import (
    Attendance,
    Employee,
    EmployeeOnboardingTask,
    JobApplicant,
    JobVacancy,
    LeaveRequest,
    OnboardingProcess,
    PayrollLine,
    PayrollRun,
    PositionMaster,
    SelectionScoring,
    TrainingLog,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, image_thumb, money


class OnboardingTaskInline(admin.TabularInline):
    model = EmployeeOnboardingTask
    extra = 0
    fields = ("task_name", "due_date", "is_completed", "manager_remark")


class TrainingLogInline(admin.TabularInline):
    model = TrainingLog
    extra = 0
    fields = ("module_name", "watch_time", "exam_score", "completion_date")


class OnboardingProcessInline(admin.StackedInline):
    model = OnboardingProcess
    extra = 0
    fields = ("offer_letter", ("joined_date", "probation_period_months"), "gurukul_status")


@admin.register(Employee)
class EmployeeAdmin(BaseAdmin):
    inlines = [OnboardingProcessInline, OnboardingTaskInline, TrainingLogInline]
    list_display = (
        "photo_col",
        "employee_code",
        "full_name",
        "organization",
        "department",
        "position",
        "grade_badge",
        "classification_badge",
        "reporting_to",
        "join_date",
        "status_badge",
    )
    list_display_links = ("photo_col", "employee_code", "full_name")
    list_filter = ("status", "classification", "grade", "organization", "department")
    search_fields = ("employee_code", "full_name", "citizenship_no", "pan_no", "user__username")
    autocomplete_fields = ["organization", "user", "department", "position", "reporting_to"]
    date_hierarchy = "created_at"
    list_select_related = ("organization", "department", "position", "reporting_to")

    fieldsets = (
        ("Identity", {
            "fields": (("employee_code", "full_name"), "photo", ("citizenship_no", "pan_no"), "user"),
        }),
        ("Placement", {
            "fields": (
                "organization",
                ("department", "position"),
                ("classification", "grade"),
                "reporting_to",
            ),
        }),
        ("Employment", {"fields": (("join_date", "probation_end"), "status")}),
    )

    @admin.display(description="Photo")
    def photo_col(self, obj):
        return image_thumb(obj.photo, size=36, rounded=True)

    @admin.display(description="Grade", ordering="grade")
    def grade_badge(self, obj):
        return badge(obj.grade, "#6f42c1")

    @admin.display(description="Class", ordering="classification")
    def classification_badge(self, obj):
        return choice_badge(obj, "classification")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(PositionMaster)
class PositionMasterAdmin(BaseAdmin):
    list_display = (
        "code",
        "designation",
        "department",
        "leadership_tier",
        "min_edu",
        "experience",
        "reports_to",
        "headcount",
    )
    list_filter = ("leadership_tier", "is_system")
    search_fields = ("code", "designation", "department")
    autocomplete_fields = ["reports_to"]
    list_select_related = ("reports_to",)

    @admin.display(description="Headcount")
    def headcount(self, obj):
        return obj.employees.count()


class JobApplicantInline(admin.TabularInline):
    model = JobApplicant
    extra = 0
    fields = ("full_name", "user", "phone", "email", "exp_years", "current_stage")
    autocomplete_fields = ["user"]
    show_change_link = True


@admin.register(JobVacancy)
class JobVacancyAdmin(BaseAdmin):
    inlines = [JobApplicantInline]
    list_display = (
        "vacancy_code",
        "title",
        "organization",
        "target_position",
        "hiring_manager",
        "open_date",
        "close_date",
        "applicant_count",
        "status_badge",
    )
    list_filter = ("status", "organization")
    search_fields = ("vacancy_code", "title", "organization__company_name")
    autocomplete_fields = ["organization", "target_position", "hiring_manager", "feed_post"]
    list_select_related = ("organization", "target_position", "hiring_manager")

    @admin.display(description="Applicants")
    def applicant_count(self, obj):
        return badge(f"{obj.applicants.count()} applied", "#0d6efd")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class SelectionScoringInline(admin.StackedInline):
    model = SelectionScoring
    extra = 0
    fields = (("interviewer", "score", "status"), "remarks")
    autocomplete_fields = ["interviewer"]


@admin.register(JobApplicant)
class JobApplicantAdmin(BaseAdmin):
    inlines = [SelectionScoringInline]
    list_display = (
        "full_name",
        "user",
        "vacancy",
        "phone",
        "email",
        "exp_years",
        "avg_score",
        "stage_badge",
        "reviewed_by",
    )
    list_filter = ("current_stage", "vacancy")
    search_fields = ("full_name", "phone", "email", "vacancy__title", "user__username")
    autocomplete_fields = ["vacancy", "user", "reviewed_by"]
    list_select_related = ("vacancy", "user", "reviewed_by")

    @admin.display(description="Avg score")
    def avg_score(self, obj):
        scores = [s.score for s in obj.scorings.all()]
        if not scores:
            return "—"
        avg = sum(scores) / len(scores)
        color = "#198754" if avg >= 70 else "#fd7e14" if avg >= 40 else "#dc3545"
        return badge(f"{avg:.0f}/100", color)

    @admin.display(description="Stage", ordering="current_stage")
    def stage_badge(self, obj):
        return choice_badge(obj, "current_stage")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("scorings")


@admin.register(Attendance)
class AttendanceAdmin(BaseAdmin):
    list_display = ("employee", "date", "shift_badge", "check_in", "check_out", "ot_col", "status_badge")
    list_filter = ("status", "shift", "employee__organization")
    search_fields = ("employee__full_name", "employee__employee_code")
    date_hierarchy = "date"
    autocomplete_fields = ["employee"]
    list_select_related = ("employee",)

    @admin.display(description="Shift", ordering="shift")
    def shift_badge(self, obj):
        return badge(f"Shift {obj.shift}", "#6f42c1")

    @admin.display(description="OT", ordering="ot_hours")
    def ot_col(self, obj):
        return badge(f"{obj.ot_hours}h OT", "#fd7e14") if obj.ot_hours else "—"

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(LeaveRequest)
class LeaveRequestAdmin(BaseAdmin):
    list_display = ("employee", "type_badge", "from_date", "to_date", "days_col", "approval_badge", "approved_by")
    list_filter = ("leave_type", "approval_status")
    search_fields = ("employee__full_name", "reason")
    autocomplete_fields = ["employee", "approved_by"]
    list_select_related = ("employee", "approved_by")
    actions = ["approve_leaves", "reject_leaves"]

    @admin.display(description="Type", ordering="leave_type")
    def type_badge(self, obj):
        return choice_badge(obj, "leave_type")

    @admin.display(description="Days")
    def days_col(self, obj):
        return (obj.to_date - obj.from_date).days + 1

    @admin.display(description="Approval", ordering="approval_status")
    def approval_badge(self, obj):
        return choice_badge(obj, "approval_status")

    @admin.action(description="Approve selected leave requests")
    def approve_leaves(self, request, queryset):
        updated = queryset.update(approval_status=LeaveRequest.ApprovalStatus.APPROVED)
        self.message_user(request, f"{updated} leave request(s) approved.")

    @admin.action(description="Reject selected leave requests")
    def reject_leaves(self, request, queryset):
        updated = queryset.update(approval_status=LeaveRequest.ApprovalStatus.REJECTED)
        self.message_user(request, f"{updated} leave request(s) rejected.")


class PayrollLineInline(admin.TabularInline):
    model = PayrollLine
    extra = 0
    autocomplete_fields = ["employee"]
    fields = ("employee", "basic", "allowances", "deductions", "ot_amount", "net_pay")


@admin.register(PayrollRun)
class PayrollRunAdmin(BaseAdmin):
    inlines = [PayrollLineInline]
    list_display = ("period_month", "organization", "line_count", "total_net", "status_badge", "processed_at", "approved_by")
    list_filter = ("status", "organization")
    search_fields = ("period_month", "organization__company_name")
    autocomplete_fields = ["organization", "approved_by"]
    list_select_related = ("organization", "approved_by")

    @admin.display(description="Employees")
    def line_count(self, obj):
        return obj.lines.count()

    @admin.display(description="Total net pay")
    def total_net(self, obj):
        return money(sum(line.net_pay for line in obj.lines.all()))

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("lines")


@admin.register(TrainingLog)
class TrainingLogAdmin(BaseAdmin):
    list_display = ("employee", "module_name", "watch_time", "score_col", "completion_date")
    search_fields = ("employee__full_name", "module_name")
    autocomplete_fields = ["employee"]
    list_select_related = ("employee",)

    @admin.display(description="Exam score", ordering="exam_score")
    def score_col(self, obj):
        passed = obj.exam_score >= 80
        return badge(f"{obj.exam_score}/100", "#198754" if passed else "#dc3545")
