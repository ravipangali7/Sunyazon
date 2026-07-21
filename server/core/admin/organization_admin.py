"""Admin for organizations — company profile with membership/structure inlines."""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from core.models import (
    BoardDeclaration,
    Branch,
    CompanyDocument,
    CompanyLeadershipSeat,
    Department,
    LeadershipRoleDefinition,
    Meeting,
    MeetingAttendee,
    Module,
    Organization,
    OrgUser,
    Role,
    RoleModulePermission,
    Shareholder,
    Team,
    Tenant,
)

from .base import BaseAdmin, bool_badge, choice_badge, image_thumb


class OrgUserInline(admin.TabularInline):
    model = OrgUser
    extra = 0
    fields = ("user", "role", "role_kind", "username", "designation", "is_primary_admin")
    autocomplete_fields = ["user", "role"]


class RoleInline(admin.TabularInline):
    model = Role
    extra = 0
    fields = ("name", "kind", "is_system")


class RoleModulePermissionInline(admin.TabularInline):
    model = RoleModulePermission
    extra = 0
    autocomplete_fields = ["module"]
    fields = ("module", "access_level")


class DepartmentInline(admin.TabularInline):
    model = Department
    extra = 0
    fields = ("code", "name", "parent", "head_employee")
    autocomplete_fields = ["parent", "head_employee"]
    show_change_link = True


class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0
    fields = ("code", "name", "address", "is_active")


class BoardDeclarationInline(admin.StackedInline):
    model = BoardDeclaration
    extra = 0
    fields = (("declaration_type", "status"), "document", ("signed_by", "signed_at"))


@admin.register(Module)
class ModuleAdmin(BaseAdmin):
    list_display = ("code", "name", "category_badge", "route_path", "icon", "sort_order", "active_col")
    list_filter = ("category", "is_active")
    search_fields = ("code", "name", "route_path")
    ordering = ("sort_order", "name")
    list_editable = ("sort_order",)

    @admin.display(description="Category", ordering="category")
    def category_badge(self, obj):
        return choice_badge(obj, "category")

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "On", "Off")


class ShareholderInline(admin.TabularInline):
    model = Shareholder
    extra = 0
    fields = ("full_name", "user", "share_units", "percentage", "is_default", "citizenship_document")
    autocomplete_fields = ["user"]


class CompanyDocumentInline(admin.TabularInline):
    model = CompanyDocument
    extra = 0
    fields = ("kind", "title", "file", "uploaded_by")
    autocomplete_fields = ["uploaded_by"]


class LeadershipSeatInline(admin.TabularInline):
    model = CompanyLeadershipSeat
    extra = 0
    fields = ("role_definition", "user", "employee", "title_override", "is_filled")
    autocomplete_fields = ["role_definition", "user", "employee"]


@admin.register(Organization)
class OrganizationAdmin(BaseAdmin):
    inlines = [
        OrgUserInline,
        RoleInline,
        ShareholderInline,
        LeadershipSeatInline,
        CompanyDocumentInline,
        DepartmentInline,
        BranchInline,
        BoardDeclarationInline,
    ]
    list_display = (
        "logo_thumb",
        "company_name",
        "org_type_badge",
        "account_type_badge",
        "registration_mode",
        "registration_status",
        "vat_pan_no",
        "total_capital",
        "country",
        "capabilities_col",
        "verified_col",
        "active_col",
        "created_at",
    )
    list_display_links = ("logo_thumb", "company_name")
    list_filter = (
        "org_type",
        "account_type",
        "registration_mode",
        "registration_status",
        "is_verified",
        "is_active",
        "country",
    )
    search_fields = ("company_name", "slug", "vat_pan_no", "official_email", "official_phone")
    prepopulated_fields = {"slug": ("company_name",)}
    autocomplete_fields = ["tenant", "parent_org", "country"]
    date_hierarchy = "created_at"
    list_select_related = ("country",)

    fieldsets = (
        ("Company", {
            "fields": (
                ("company_name", "slug"),
                ("tenant", "parent_org"),
                ("org_type", "account_type"),
                ("registration_mode", "registration_status"),
                ("industry_template_code", "enabled_capabilities"),
            ),
        }),
        ("Registration & Capital", {
            "fields": (
                ("vat_pan_no", "total_capital"),
                "registration_certificate",
                "share_allocation_document",
                ("official_phone", "official_email"),
                "address",
                "country",
            ),
        }),
        ("Branding & Documents", {
            "fields": (("logo", "cover_photo"), ("witness_id_for_buyer", "nat_pan_document")),
        }),
        ("Banking", {
            "classes": ("collapse",),
            "fields": (("bank_name", "bank_branch"), "bank_account_no"),
        }),
        ("Status", {"fields": (("is_active", "is_verified"),)}),
    )

    @admin.display(description="Logo")
    def logo_thumb(self, obj):
        return image_thumb(obj.logo, size=40, rounded=True)

    @admin.display(description="Org type", ordering="org_type")
    def org_type_badge(self, obj):
        return choice_badge(obj, "org_type")

    @admin.display(description="Account", ordering="account_type")
    def account_type_badge(self, obj):
        return choice_badge(obj, "account_type")

    @admin.display(description="Capabilities")
    def capabilities_col(self, obj):
        caps = obj.enabled_capabilities or []
        if not caps:
            return "—"
        return format_html(
            "".join(
                f'<span style="display:inline-block;margin:1px;padding:1px 7px;'
                f'border-radius:8px;background:#e7f1ff;color:#0d6efd;font-size:10px;">{c}</span>'
                for c in caps[:4]
            ) + (f'<small style="color:#6c757d;"> +{len(caps) - 4}</small>' if len(caps) > 4 else "")
        )

    @admin.display(description="Verified", ordering="is_verified")
    def verified_col(self, obj):
        return bool_badge(obj.is_verified, "Verified", "Pending")

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(Tenant)
class TenantAdmin(BaseAdmin):
    list_display = ("name", "slug", "status_badge", "org_count", "user_count", "created_at")
    list_filter = ("status",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    date_hierarchy = "created_at"

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    @admin.display(description="Organizations")
    def org_count(self, obj):
        return obj.organizations.count()

    @admin.display(description="Users")
    def user_count(self, obj):
        return obj.users.count()


class TeamInline(admin.TabularInline):
    model = Team
    extra = 0
    autocomplete_fields = ["leader"]


@admin.register(Department)
class DepartmentAdmin(BaseAdmin):
    inlines = [TeamInline]
    list_display = ("code", "name", "organization", "parent", "head_employee", "team_count")
    list_filter = ("organization",)
    search_fields = ("code", "name", "organization__company_name")
    autocomplete_fields = ["organization", "parent", "head_employee"]
    list_select_related = ("organization", "parent", "head_employee")

    @admin.display(description="Teams")
    def team_count(self, obj):
        return obj.teams.count()


@admin.register(Role)
class RoleAdmin(BaseAdmin):
    inlines = [RoleModulePermissionInline]
    list_display = ("name", "organization", "kind_badge", "modules_col", "system_col")
    list_filter = ("kind", "is_system", "organization")
    search_fields = ("name", "organization__company_name")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)
    fieldsets = (
        (None, {"fields": ("organization", "name", "kind", "is_system")}),
        ("Permissions JSON", {
            "fields": ("permissions_json",),
            "description": 'Use {"*": true} for all modules, or {"inventory": "F", "finance": "R"}.',
        }),
    )

    @admin.display(description="Kind", ordering="kind")
    def kind_badge(self, obj):
        return choice_badge(obj, "kind")

    @admin.display(description="System", ordering="is_system")
    def system_col(self, obj):
        return bool_badge(obj.is_system, "System", "Custom")

    @admin.display(description="Modules")
    def modules_col(self, obj):
        count = obj.module_permissions.exclude(
            access_level=RoleModulePermission.AccessLevel.NONE
        ).count()
        return count or "—"


@admin.register(RoleModulePermission)
class RoleModulePermissionAdmin(BaseAdmin):
    list_display = ("role", "module", "access_badge")
    list_filter = ("access_level", "module", "role__organization")
    search_fields = ("role__name", "module__code", "module__name")
    autocomplete_fields = ["role", "module"]
    list_select_related = ("role", "module", "role__organization")

    @admin.display(description="Access", ordering="access_level")
    def access_badge(self, obj):
        return choice_badge(obj, "access_level")


@admin.register(OrgUser)
class OrgUserAdmin(BaseAdmin):
    list_display = (
        "username",
        "user",
        "organization",
        "role",
        "role_kind_badge",
        "designation",
        "admin_col",
        "created_at",
    )
    list_filter = ("role_kind", "is_primary_admin", "organization")
    search_fields = ("username", "user__username", "user__phone", "organization__company_name", "designation")
    autocomplete_fields = ["organization", "user", "role"]
    list_select_related = ("organization", "user", "role")

    @admin.display(description="Role kind", ordering="role_kind")
    def role_kind_badge(self, obj):
        return choice_badge(obj, "role_kind")

    @admin.display(description="Primary admin", ordering="is_primary_admin")
    def admin_col(self, obj):
        return bool_badge(obj.is_primary_admin, "Admin", "Member")


@admin.register(Branch)
class BranchAdmin(BaseAdmin):
    list_display = ("code", "name", "organization", "address", "active_col")
    list_filter = ("is_active", "organization")
    search_fields = ("code", "name", "organization__company_name")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Open", "Closed")


@admin.register(Team)
class TeamAdmin(BaseAdmin):
    list_display = ("name", "department", "leader")
    list_filter = ("department__organization",)
    search_fields = ("name", "department__name", "leader__full_name")
    autocomplete_fields = ["department", "leader"]
    list_select_related = ("department", "leader")


@admin.register(BoardDeclaration)
class BoardDeclarationAdmin(BaseAdmin):
    list_display = ("organization", "type_badge", "signed_by", "signed_at", "status_badge")
    list_filter = ("declaration_type", "status")
    search_fields = ("organization__company_name", "signed_by")
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Type", ordering="declaration_type")
    def type_badge(self, obj):
        return choice_badge(obj, "declaration_type")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class MeetingAttendeeInline(admin.TabularInline):
    model = MeetingAttendee
    extra = 0
    autocomplete_fields = ["employee"]


@admin.register(Meeting)
class MeetingAdmin(BaseAdmin):
    inlines = [MeetingAttendeeInline]
    list_display = ("title", "organization", "scheduled_at", "location", "organizer", "attendee_count", "status_badge")
    list_filter = ("status", "organization")
    search_fields = ("title", "agenda", "organization__company_name")
    date_hierarchy = "scheduled_at"
    autocomplete_fields = ["organization", "organizer", "minutes_doc"]
    list_select_related = ("organization", "organizer")

    @admin.display(description="Attendees")
    def attendee_count(self, obj):
        return obj.attendees.count()

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

@admin.register(Shareholder)
class ShareholderAdmin(BaseAdmin):
    list_display = (
        "full_name",
        "organization",
        "share_units",
        "percentage",
        "is_default",
        "user",
    )
    list_filter = ("is_default", "organization")
    search_fields = ("full_name", "organization__company_name", "user__username")
    autocomplete_fields = ["organization", "user"]


@admin.register(LeadershipRoleDefinition)
class LeadershipRoleDefinitionAdmin(BaseAdmin):
    list_display = ("code", "name", "tier", "reports_to_code", "department_code", "sort_order", "is_active")
    list_filter = ("tier", "is_active", "is_system")
    search_fields = ("code", "name")
    list_editable = ("sort_order", "is_active")
    ordering = ("sort_order",)


@admin.register(CompanyLeadershipSeat)
class CompanyLeadershipSeatAdmin(BaseAdmin):
    list_display = ("organization", "role_definition", "user", "employee", "is_filled")
    list_filter = ("is_filled", "role_definition__tier", "organization")
    search_fields = ("organization__company_name", "role_definition__code", "user__username")
    autocomplete_fields = ["organization", "role_definition", "user", "employee"]


@admin.register(CompanyDocument)
class CompanyDocumentAdmin(BaseAdmin):
    list_display = ("title", "kind", "organization", "uploaded_by", "created_at")
    list_filter = ("kind", "organization")
    search_fields = ("title", "organization__company_name")
    autocomplete_fields = ["organization", "uploaded_by"]
