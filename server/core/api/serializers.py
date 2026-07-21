"""Serializers for enterprise CRUD APIs."""

from __future__ import annotations

from rest_framework import serializers

from core.models import (
    ActivityLog,
    AppSetting,
    Approval,
    Department,
    Holiday,
    MenuItem,
    Module,
    Organization,
    OrgUser,
    Project,
    Role,
    RoleModulePermission,
    Task,
    TaskAttachment,
    TaskCategory,
    TaskComment,
    TaskHistory,
    TaskLabel,
    TaskStatus,
    Team,
    User,
    UserProfile,
    WorkflowDefinition,
)


class UserListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    profile_image = serializers.SerializerMethodField()
    department_id = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()
    company_id = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    team_id = serializers.SerializerMethodField()
    manager_id = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(source="last_login", read_only=True)
    role_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "phone",
            "full_name",
            "profile_image",
            "employee_id",
            "department_id",
            "department_name",
            "designation",
            "company_id",
            "company_name",
            "team_id",
            "manager_id",
            "role_name",
            "status",
            "is_active",
            "last_login",
            "account_type",
            "platform_role",
            "date_joined",
        ]

    def _membership(self, obj):
        cache = getattr(obj, "_primary_membership", None)
        if cache is not None:
            return cache
        m = (
            obj.org_memberships.select_related(
                "organization", "role", "department", "team", "manager"
            )
            .order_by("-is_primary_admin", "created_at")
            .first()
        )
        obj._primary_membership = m
        return m

    def get_full_name(self, obj):
        profile = getattr(obj, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return obj.get_full_name() or obj.username

    def get_profile_image(self, obj):
        profile = getattr(obj, "profile", None)
        if profile and profile.profile_picture:
            request = self.context.get("request")
            url = profile.profile_picture.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_department_id(self, obj):
        m = self._membership(obj)
        return str(m.department_id) if m and m.department_id else None

    def get_department_name(self, obj):
        m = self._membership(obj)
        return m.department.name if m and m.department_id else ""

    def get_designation(self, obj):
        m = self._membership(obj)
        return m.designation if m else ""

    def get_company_id(self, obj):
        m = self._membership(obj)
        return str(m.organization_id) if m else None

    def get_company_name(self, obj):
        m = self._membership(obj)
        return m.organization.company_name if m else ""

    def get_team_id(self, obj):
        m = self._membership(obj)
        return str(m.team_id) if m and m.team_id else None

    def get_manager_id(self, obj):
        m = self._membership(obj)
        return str(m.manager_id) if m and m.manager_id else None

    def get_employee_id(self, obj):
        m = self._membership(obj)
        return m.employee_id if m else ""

    def get_status(self, obj):
        m = self._membership(obj)
        if m:
            return m.status
        return "active" if obj.is_active else "inactive"

    def get_role_name(self, obj):
        m = self._membership(obj)
        return m.role.name if m and m.role_id else None


class CompanySerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "company_name",
            "slug",
            "logo",
            "logo_url",
            "address",
            "official_email",
            "official_phone",
            "website",
            "currency",
            "timezone",
            "org_type",
            "account_type",
            "is_active",
            "is_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url


class DepartmentSerializer(serializers.ModelSerializer):
    head_name = serializers.SerializerMethodField()
    parent_name = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id",
            "organization",
            "name",
            "code",
            "description",
            "parent",
            "parent_name",
            "head_employee",
            "head_name",
            "status",
        ]
        read_only_fields = ["id"]

    def get_head_name(self, obj):
        return obj.head_employee.full_name if obj.head_employee_id else ""

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent_id else ""


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ["id", "department", "name", "leader"]


class RolePermissionSerializer(serializers.ModelSerializer):
    module_code = serializers.CharField(source="module.code", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    actions = serializers.SerializerMethodField()

    class Meta:
        model = RoleModulePermission
        fields = [
            "id",
            "module",
            "module_code",
            "module_name",
            "access_level",
            "can_view",
            "can_create",
            "can_edit",
            "can_delete",
            "can_approve",
            "can_export",
            "can_import",
            "can_print",
            "actions",
        ]

    def get_actions(self, obj):
        return obj.actions_payload()


class RoleSerializer(serializers.ModelSerializer):
    permissions = RolePermissionSerializer(source="module_permissions", many=True, read_only=True)

    class Meta:
        model = Role
        fields = [
            "id",
            "organization",
            "name",
            "kind",
            "permissions_json",
            "is_system",
            "permissions",
        ]
        read_only_fields = ["id"]


class MenuItemSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = [
            "id",
            "parent",
            "module",
            "name",
            "code",
            "icon",
            "route",
            "display_order",
            "is_visible",
            "permission_code",
            "required_action",
            "children",
        ]

    def get_children(self, obj):
        kids = obj.children.filter(is_visible=True).order_by("display_order", "name")
        return MenuItemSerializer(kids, many=True, context=self.context).data


class TaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskStatus
        fields = [
            "id",
            "organization",
            "name",
            "code",
            "color",
            "display_order",
            "is_terminal",
            "is_default",
            "show_in_filter",
            "is_active",
        ]


class TaskCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskCategory
        fields = ["id", "organization", "name", "code", "color", "is_active"]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            "id",
            "organization",
            "name",
            "code",
            "description",
            "department",
            "manager",
            "start_date",
            "end_date",
            "is_active",
        ]


class TaskLabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskLabel
        fields = ["id", "organization", "name", "color"]


class TaskCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = TaskComment
        fields = [
            "id",
            "task",
            "author",
            "author_name",
            "parent",
            "body",
            "is_edited",
            "is_deleted",
            "created_at",
            "updated_at",
            "replies",
        ]
        read_only_fields = ["id", "author", "is_edited", "created_at", "updated_at"]

    def get_author_name(self, obj):
        if not obj.author_id:
            return ""
        profile = getattr(obj.author, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return obj.author.get_full_name() or obj.author.username

    def get_replies(self, obj):
        if obj.parent_id:
            return []
        qs = obj.replies.filter(is_deleted=False).select_related("author__profile")
        return TaskCommentSerializer(qs, many=True, context=self.context).data


class TaskAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = TaskAttachment
        fields = [
            "id",
            "task",
            "comment",
            "uploaded_by",
            "file",
            "url",
            "original_name",
            "content_type",
            "size_bytes",
            "kind",
            "created_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at"]

    def get_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class TaskHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = TaskHistory
        fields = [
            "id",
            "action",
            "message",
            "actor",
            "actor_name",
            "before_json",
            "after_json",
            "created_at",
        ]

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return "System"
        profile = getattr(obj.actor, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return obj.actor.get_full_name() or obj.actor.username


class TaskSerializer(serializers.ModelSerializer):
    status_code = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()
    status_color = serializers.SerializerMethodField()
    assignee_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    labels_data = TaskLabelSerializer(source="labels", many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "organization",
            "task_number",
            "title",
            "description",
            "department",
            "department_name",
            "project",
            "project_name",
            "category",
            "category_name",
            "team",
            "priority",
            "status",
            "status_ref",
            "status_code",
            "status_name",
            "status_color",
            "assignee",
            "assignee_name",
            "assigned_by",
            "assigned_by_name",
            "assigned_to_user",
            "assigned_to_name",
            "start_date",
            "due_at",
            "estimated_hours",
            "actual_hours",
            "progress_pct",
            "checklist_json",
            "evidence_urls",
            "labels",
            "labels_data",
            "is_archived",
            "archived_at",
            "workflow_instance",
            "comment_count",
            "attachment_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "task_number",
            "created_at",
            "updated_at",
            "archived_at",
        ]

    def get_status_code(self, obj):
        return obj.status_code

    def get_status_name(self, obj):
        if obj.status_ref_id:
            return obj.status_ref.name
        return obj.get_status_display()

    def get_status_color(self, obj):
        if obj.status_ref_id:
            return obj.status_ref.color
        return "#6B7280"

    def get_assignee_name(self, obj):
        if obj.assigned_to_user_id:
            profile = getattr(obj.assigned_to_user, "profile", None)
            if profile and profile.full_name:
                return profile.full_name
            return obj.assigned_to_user.get_full_name() or obj.assigned_to_user.username
        if obj.assignee_id and obj.assignee.user_id:
            profile = getattr(obj.assignee.user, "profile", None)
            if profile and profile.full_name:
                return profile.full_name
            return obj.assignee.user.get_full_name() or obj.assignee.user.username
        return "Unassigned"

    def get_assigned_by_name(self, obj):
        if not obj.assigned_by_id:
            return ""
        profile = getattr(obj.assigned_by, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return obj.assigned_by.get_full_name() or obj.assigned_by.username

    def get_assigned_to_name(self, obj):
        return self.get_assignee_name(obj)

    def get_department_name(self, obj):
        return obj.department.name if obj.department_id else ""

    def get_project_name(self, obj):
        return obj.project.name if obj.project_id else ""

    def get_category_name(self, obj):
        return obj.category.name if obj.category_id else ""

    def get_comment_count(self, obj):
        if hasattr(obj, "_comment_count"):
            return obj._comment_count
        return obj.comments.filter(is_deleted=False).count()

    def get_attachment_count(self, obj):
        if hasattr(obj, "_attachment_count"):
            return obj._attachment_count
        return obj.attachments.count()


class ApprovalSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)
    task_number = serializers.CharField(source="task.task_number", read_only=True)
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model = Approval
        fields = [
            "id",
            "task",
            "task_title",
            "task_number",
            "workflow_instance",
            "approver",
            "approver_user",
            "approver_name",
            "level",
            "decision",
            "remarks",
            "decided_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "decided_at"]

    def get_approver_name(self, obj):
        if obj.approver_user_id:
            profile = getattr(obj.approver_user, "profile", None)
            if profile and profile.full_name:
                return profile.full_name
            return obj.approver_user.get_full_name() or obj.approver_user.username
        if obj.approver_id and obj.approver.user_id:
            return obj.approver.user.get_full_name() or obj.approver.user.username
        return ""


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowDefinition
        fields = [
            "id",
            "code",
            "name",
            "version",
            "trigger_event",
            "steps_json",
            "sla_config",
            "status",
            "created_at",
        ]


class AppSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppSetting
        fields = ["id", "organization", "key", "value_json", "category", "is_secret", "updated_at"]
        read_only_fields = ["id", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_secret:
            data["value_json"] = {"masked": True}
        return data


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "organization",
            "user",
            "user_name",
            "action",
            "entity_type",
            "entity_id",
            "detail",
            "ip",
            "browser",
            "device",
            "created_at",
        ]

    def get_user_name(self, obj):
        if not obj.user_id:
            return ""
        profile = getattr(obj.user, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return obj.user.get_full_name() or obj.user.username


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ["id", "organization", "name", "date", "is_recurring"]


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = [
            "id",
            "code",
            "name",
            "description",
            "icon",
            "color",
            "route_path",
            "category",
            "sort_order",
            "is_active",
        ]
