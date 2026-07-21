"""Enterprise CRUD viewsets — users, orgs, menus, tasks, workflows, reports."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import (
    EnterpriseAuthMixin,
    HasModulePermission,
    StandardPagination,
    client_meta,
    get_request_org,
    user_has_module_action,
)
from core.api.serializers import (
    ActivityLogSerializer,
    AppSettingSerializer,
    ApprovalSerializer,
    CompanySerializer,
    DepartmentSerializer,
    HolidaySerializer,
    MenuItemSerializer,
    ModuleSerializer,
    ProjectSerializer,
    RolePermissionSerializer,
    RoleSerializer,
    TaskAttachmentSerializer,
    TaskCategorySerializer,
    TaskCommentSerializer,
    TaskHistorySerializer,
    TaskLabelSerializer,
    TaskSerializer,
    TaskStatusSerializer,
    TeamSerializer,
    UserListSerializer,
    WorkflowDefinitionSerializer,
)
from core.models import (
    ActivityLog,
    Actor,
    AppSetting,
    Approval,
    Department,
    Employee,
    Holiday,
    MenuItem,
    Meeting,
    Module,
    Notification,
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
    WorkflowInstance,
)
from core.services.auth_service import AuthError, _unique_username, normalize_phone
from core.services.enterprise_auth import change_password, update_profile
from core.services.portal_service import _pick_membership


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log_activity(request, *, action: str, entity_type: str = "", entity_id: str = "", detail: str = ""):
    meta = client_meta(request)
    org = get_request_org(request)
    ActivityLog.objects.create(
        organization=org,
        user=request.user if request.user.is_authenticated else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        detail=detail,
        ip=meta["ip"],
        browser=meta["browser"],
        device=meta["device"],
        user_agent=meta["user_agent"],
    )


def task_history(task, user, action: str, message: str = "", before=None, after=None):
    TaskHistory.objects.create(
        task=task,
        actor=user,
        action=action,
        message=message,
        before_json=before or {},
        after_json=after or {},
    )


def next_task_number(org: Organization) -> str:
    year = timezone.now().year
    prefix = f"TSK-{year}-"
    last = (
        Task.objects.filter(organization=org, task_number__startswith=prefix)
        .order_by("-task_number")
        .values_list("task_number", flat=True)
        .first()
    )
    seq = 1
    if last:
        try:
            seq = int(last.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = Task.objects.filter(organization=org).count() + 1
    return f"{prefix}{seq:05d}"


def ensure_actor(user: User, org: Organization | None) -> Actor:
    actor = Actor.objects.filter(user=user, organization=org).first()
    if actor:
        return actor
    return Actor.objects.create(
        user=user,
        organization=org,
        tenant=getattr(org, "tenant", None) if org else user.tenant,
        actor_type=Actor.ActorType.HUMAN,
    )


def detect_file_kind(name: str, content_type: str) -> str:
    n = (name or "").lower()
    ct = (content_type or "").lower()
    if ct.startswith("image/") or n.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
        return TaskAttachment.Kind.IMAGE
    if "pdf" in ct or n.endswith(".pdf"):
        return TaskAttachment.Kind.PDF
    if "word" in ct or n.endswith((".doc", ".docx")):
        return TaskAttachment.Kind.WORD
    if "sheet" in ct or "excel" in ct or n.endswith((".xls", ".xlsx", ".csv")):
        return TaskAttachment.Kind.EXCEL
    if "zip" in ct or n.endswith((".zip", ".rar", ".7z")):
        return TaskAttachment.Kind.ZIP
    if ct.startswith("video/") or n.endswith((".mp4", ".mov", ".avi", ".webm")):
        return TaskAttachment.Kind.VIDEO
    return TaskAttachment.Kind.OTHER


def notify_user(user, *, org, ntype: str, title: str, body: str = "", link: str = "", entity_type: str = "", entity_id: str = ""):
    if not user:
        return
    Notification.objects.create(
        user=user,
        organization=org,
        channel=Notification.Channel.IN_APP,
        type=ntype,
        title=title,
        body=body,
        link=link,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
    )


# ---------------------------------------------------------------------------
# Auth extras
# ---------------------------------------------------------------------------

class ProfileView(EnterpriseAuthMixin, APIView):
    def get(self, request):
        from core.services.auth_service import user_payload

        return Response(user_payload(request.user))

    def patch(self, request):
        try:
            data = {k: request.data.get(k) for k in request.data.keys()}
            if "profile_picture" in request.FILES:
                data["profile_picture"] = request.FILES["profile_picture"]
            payload = update_profile(request.user, data)
            log_activity(request, action="profile.update", entity_type="user", entity_id=request.user.id)
            return Response(payload)
        except AuthError as exc:
            return Response({"detail": exc.message, "code": exc.code, "errors": exc.field_errors}, status=400)


class ChangePasswordView(EnterpriseAuthMixin, APIView):
    def post(self, request):
        try:
            change_password(
                request.user,
                request.data.get("current_password") or "",
                request.data.get("new_password") or "",
                request.data.get("new_password_confirm") or request.data.get("confirm_password") or "",
            )
            log_activity(request, action="password.change", entity_type="user", entity_id=request.user.id)
            return Response({"ok": True})
        except AuthError as exc:
            return Response({"detail": exc.message, "code": exc.code, "errors": exc.field_errors}, status=400)


class RefreshTokenView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        from core.services.enterprise_auth import refresh_access_token

        try:
            payload = refresh_access_token(request.data.get("refresh_token") or "")
            return Response(payload)
        except AuthError as exc:
            return Response({"detail": exc.message, "code": exc.code}, status=401)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "admin"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = UserListSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = User.objects.select_related("profile").prefetch_related("org_memberships__organization", "org_memberships__role", "org_memberships__department")
        if org and not (self.request.user.is_superuser or self.request.user.account_type == "super_admin"):
            qs = qs.filter(org_memberships__organization=org).distinct()
        q = self.request.query_params.get("search") or self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(phone__icontains=q)
                | Q(profile__full_name__icontains=q)
            )
        status_f = self.request.query_params.get("status")
        if status_f == "active":
            qs = qs.filter(is_active=True)
        elif status_f == "inactive":
            qs = qs.filter(is_active=False)
        dept = self.request.query_params.get("department")
        if dept:
            qs = qs.filter(org_memberships__department_id=dept)
        ordering = self.request.query_params.get("ordering") or "-date_joined"
        return qs.order_by(ordering)

    def create(self, request, *args, **kwargs):
        org = get_request_org(request)
        if not org:
            return Response({"detail": "No organization context."}, status=400)
        data = request.data
        full_name = (data.get("full_name") or "").strip()
        email = (data.get("email") or "").strip().lower() or None
        phone = normalize_phone(data.get("phone") or "")
        username = (data.get("username") or "").strip() or _unique_username(phone or "user", email)
        password = data.get("password") or ""
        if not full_name:
            return Response({"detail": "Full name is required.", "errors": {"full_name": ["Required"]}}, status=400)
        if not password:
            return Response({"detail": "Password is required.", "errors": {"password": ["Required"]}}, status=400)
        if phone and User.objects.filter(phone=phone).exists():
            return Response({"detail": "Phone already exists."}, status=400)
        if email and User.objects.filter(email__iexact=email).exists():
            return Response({"detail": "Email already exists."}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "Username already exists."}, status=400)

        with transaction.atomic():
            parts = full_name.split(None, 1)
            user = User(
                username=username,
                email=email,
                phone=phone or None,
                first_name=parts[0][:150],
                last_name=parts[1][:150] if len(parts) > 1 else "",
                is_active=str(data.get("is_active", "true")).lower() not in ("false", "0", "inactive"),
                account_type=data.get("account_type") or User.AccountType.DEFAULT,
                platform_role=data.get("platform_role") or User.PlatformRole.STAFF,
                tenant=org.tenant,
            )
            user.set_password(password)
            user.save()
            profile = UserProfile.objects.create(user=user, full_name=full_name)
            if "profile_image" in request.FILES or "profile_picture" in request.FILES:
                profile.profile_picture = request.FILES.get("profile_image") or request.FILES.get("profile_picture")
                profile.save()
            role = None
            role_id = data.get("role") or data.get("role_id")
            if role_id:
                role = Role.objects.filter(id=role_id, organization=org).first()
            OrgUser.objects.create(
                organization=org,
                user=user,
                role=role,
                role_kind=data.get("role_kind") or (role.kind if role else OrgUser.RoleKind.STAFF),
                username=username,
                designation=data.get("designation") or "",
                employee_id=data.get("employee_id") or "",
                department_id=data.get("department") or data.get("department_id") or None,
                team_id=data.get("team") or data.get("team_id") or None,
                manager_id=data.get("manager") or data.get("manager_id") or None,
                status=data.get("status") or OrgUser.Status.ACTIVE,
            )
            ensure_actor(user, org)
        log_activity(request, action="user.create", entity_type="user", entity_id=user.id, detail=full_name)
        return Response(UserListSerializer(user, context={"request": request}).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        data = request.data
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if "full_name" in data:
            profile.full_name = str(data["full_name"]).strip()
            parts = profile.full_name.split(None, 1)
            user.first_name = parts[0][:150] if parts else ""
            user.last_name = parts[1][:150] if len(parts) > 1 else ""
        if "email" in data:
            user.email = str(data["email"]).strip().lower() or None
        if "phone" in data:
            user.phone = normalize_phone(data["phone"]) or None
        if "username" in data and data["username"]:
            user.username = str(data["username"]).strip()
        if "is_active" in data:
            user.is_active = str(data["is_active"]).lower() not in ("false", "0", "inactive")
        if "password" in data and data["password"]:
            user.set_password(data["password"])
        if "profile_image" in request.FILES or "profile_picture" in request.FILES:
            profile.profile_picture = request.FILES.get("profile_image") or request.FILES.get("profile_picture")
        user.save()
        profile.save()
        membership = user.org_memberships.filter(organization=get_request_org(request)).first()
        if membership:
            for field, key in [
                ("designation", "designation"),
                ("employee_id", "employee_id"),
                ("status", "status"),
            ]:
                if key in data:
                    setattr(membership, field, data[key])
            if "department" in data or "department_id" in data:
                membership.department_id = data.get("department") or data.get("department_id") or None
            if "team" in data or "team_id" in data:
                membership.team_id = data.get("team") or data.get("team_id") or None
            if "manager" in data or "manager_id" in data:
                membership.manager_id = data.get("manager") or data.get("manager_id") or None
            if "role" in data or "role_id" in data:
                membership.role_id = data.get("role") or data.get("role_id") or None
            membership.save()
        log_activity(request, action="user.update", entity_type="user", entity_id=user.id)
        return Response(UserListSerializer(user, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active"])
        OrgUser.objects.filter(user=user).update(status=OrgUser.Status.INACTIVE)
        log_activity(request, action="user.deactivate", entity_type="user", entity_id=user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Companies / Departments / Teams / Roles / Menus
# ---------------------------------------------------------------------------

class CompanyViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "admin"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = CompanySerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Organization.objects.all()
        if not (self.request.user.is_superuser or self.request.user.account_type == "super_admin"):
            org = get_request_org(self.request)
            qs = qs.filter(id=org.id) if org else qs.none()
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(Q(company_name__icontains=q) | Q(official_email__icontains=q))
        return qs.order_by("company_name")

    def perform_create(self, serializer):
        org = serializer.save()
        log_activity(self.request, action="company.create", entity_type="organization", entity_id=org.id)

    def perform_update(self, serializer):
        org = serializer.save()
        log_activity(self.request, action="company.update", entity_type="organization", entity_id=org.id)


class DepartmentViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "hr"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Department.objects.select_related("parent", "head_employee")
        if org:
            qs = qs.filter(organization=org)
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        status_f = self.request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        return qs.order_by("code")

    def perform_create(self, serializer):
        org = get_request_org(self.request)
        serializer.save(organization=org)
        log_activity(self.request, action="department.create", entity_type="department", entity_id=serializer.instance.id)


class TeamViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "hr"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = TeamSerializer

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Team.objects.select_related("department", "leader")
        if org:
            qs = qs.filter(department__organization=org)
        return qs.order_by("name")


class RoleViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "admin"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = RoleSerializer

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Role.objects.prefetch_related("module_permissions__module")
        if org:
            qs = qs.filter(organization=org)
        return qs.order_by("name")

    def perform_create(self, serializer):
        org = get_request_org(self.request)
        serializer.save(organization=org)

    @action(detail=True, methods=["put", "patch"], url_path="permissions")
    def set_permissions(self, request, pk=None):
        role = self.get_object()
        items = request.data.get("permissions") or request.data
        if not isinstance(items, list):
            return Response({"detail": "Expected permissions list."}, status=400)
        with transaction.atomic():
            for item in items:
                module_id = item.get("module") or item.get("module_id")
                module_code = item.get("module_code")
                module = None
                if module_id:
                    module = Module.objects.filter(id=module_id).first()
                elif module_code:
                    module = Module.objects.filter(code=module_code).first()
                if not module:
                    continue
                perm, _ = RoleModulePermission.objects.get_or_create(role=role, module=module)
                if "access_level" in item:
                    perm.access_level = item["access_level"]
                    if item["access_level"] in ("F", "R", "N") and not any(
                        k.startswith("can_") for k in item
                    ):
                        perm.sync_from_access_level()
                for flag in ("view", "create", "edit", "delete", "approve", "export", "import", "print"):
                    key = f"can_{flag}"
                    if key in item:
                        setattr(perm, key, bool(item[key]))
                    elif flag in item:
                        setattr(perm, key, bool(item[flag]))
                perm.save()
        return Response(RoleSerializer(role).data)


class MenuViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "admin"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = MenuItemSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = MenuItem.objects.select_related("module", "parent")
        # Global + org menus
        if org:
            qs = qs.filter(Q(organization__isnull=True) | Q(organization=org))
        else:
            qs = qs.filter(organization__isnull=True)
        return qs.order_by("display_order", "name")

    def list(self, request, *args, **kwargs):
        """Return nested tree filtered by user permissions."""
        org = get_request_org(request)
        qs = MenuItem.objects.filter(is_visible=True, parent__isnull=True).select_related("module")
        if org:
            qs = qs.filter(Q(organization__isnull=True) | Q(organization=org))
        else:
            qs = qs.filter(organization__isnull=True)
        qs = qs.order_by("display_order", "name")

        def allowed(item: MenuItem) -> bool:
            if not item.module_id:
                return True
            action = item.required_action or "view"
            return user_has_module_action(request.user, item.module.code, action)

        roots = [m for m in qs if allowed(m)]
        # Filter children inside serializer by re-querying allowed only
        data = []
        for root in roots:
            ser = MenuItemSerializer(root, context={"request": request}).data
            # filter children
            children = []
            for child in root.children.filter(is_visible=True).order_by("display_order"):
                if allowed(child):
                    children.append(MenuItemSerializer(child, context={"request": request}).data)
            ser["children"] = children
            data.append(ser)
        return Response({"results": data})

    def perform_create(self, serializer):
        org = get_request_org(self.request)
        serializer.save(organization=org)


class ModuleViewSet(EnterpriseAuthMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasModulePermission]
    module_code = "admin"
    serializer_class = ModuleSerializer
    pagination_class = StandardPagination
    queryset = Module.objects.filter(is_active=True).order_by("sort_order", "name")


# ---------------------------------------------------------------------------
# Task masters + Task CRUD
# ---------------------------------------------------------------------------

class TaskStatusViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    pagination_class = StandardPagination
    serializer_class = TaskStatusSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = TaskStatus.objects.filter(is_active=True)
        if org:
            qs = qs.filter(Q(organization__isnull=True) | Q(organization=org))
        return qs.order_by("display_order", "name")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))


class TaskCategoryViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    serializer_class = TaskCategorySerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = TaskCategory.objects.filter(is_active=True)
        if org:
            qs = qs.filter(organization=org)
        return qs.order_by("name")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))


class ProjectViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    serializer_class = ProjectSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Project.objects.all()
        if org:
            qs = qs.filter(organization=org)
        q = self.request.query_params.get("search")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))
        return qs.order_by("code")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))


class TaskLabelViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    serializer_class = TaskLabelSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = TaskLabel.objects.all()
        if org:
            qs = qs.filter(organization=org)
        return qs.order_by("name")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))


class TaskViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    serializer_class = TaskSerializer
    pagination_class = StandardPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        # Authenticated users with tasks module; fall back to IsAuthenticated for view
        if self.action in ("list", "retrieve", "comments", "attachments", "history"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), HasModulePermission()]

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Task.objects.select_related(
            "status_ref",
            "department",
            "project",
            "category",
            "team",
            "assigned_by",
            "assigned_to_user__profile",
            "assignee__user__profile",
            "organization",
        ).prefetch_related("labels").annotate(
            _comment_count=Count("comments", filter=Q(comments__is_deleted=False)),
            _attachment_count=Count("attachments"),
        )
        if org:
            qs = qs.filter(organization=org)
        params = self.request.query_params
        if params.get("archived") in ("1", "true"):
            qs = qs.filter(is_archived=True)
        else:
            qs = qs.filter(is_archived=False)
        if params.get("status"):
            code = params["status"]
            qs = qs.filter(Q(status=code) | Q(status_ref__code=code))
        if params.get("priority"):
            qs = qs.filter(priority=params["priority"])
        if params.get("department"):
            qs = qs.filter(department_id=params["department"])
        if params.get("assigned_to") or params.get("assigned_user"):
            uid = params.get("assigned_to") or params.get("assigned_user")
            qs = qs.filter(Q(assigned_to_user_id=uid) | Q(assignee__user_id=uid))
        if params.get("category"):
            qs = qs.filter(category_id=params["category"])
        if params.get("project"):
            qs = qs.filter(project_id=params["project"])
        if params.get("team"):
            qs = qs.filter(team_id=params["team"])
        if params.get("due_date"):
            qs = qs.filter(due_at__date=params["due_date"])
        if params.get("due_from"):
            qs = qs.filter(due_at__date__gte=params["due_from"])
        if params.get("due_to"):
            qs = qs.filter(due_at__date__lte=params["due_to"])
        q = params.get("search") or params.get("q")
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(description__icontains=q)
                | Q(task_number__icontains=q)
            )
        ordering = params.get("ordering") or "-created_at"
        return qs.order_by(ordering)

    def create(self, request, *args, **kwargs):
        org = get_request_org(request)
        if not org:
            return Response({"detail": "No organization context."}, status=400)
        data = request.data
        status_ref = None
        status_code = data.get("status") or data.get("status_code")
        status_ref_id = data.get("status_ref")
        if status_ref_id:
            status_ref = TaskStatus.objects.filter(id=status_ref_id).first()
        elif status_code:
            status_ref = TaskStatus.objects.filter(
                Q(organization=org) | Q(organization__isnull=True), code=status_code
            ).first()
        if not status_ref:
            status_ref = TaskStatus.objects.filter(
                Q(organization=org) | Q(organization__isnull=True), is_default=True
            ).first()
        with transaction.atomic():
            task = Task(
                organization=org,
                tenant=org.tenant,
                task_number=next_task_number(org),
                title=(data.get("title") or "").strip(),
                description=data.get("description") or "",
                priority=data.get("priority") or Task.Priority.MEDIUM,
                department_id=data.get("department") or None,
                project_id=data.get("project") or None,
                category_id=data.get("category") or None,
                team_id=data.get("team") or None,
                status_ref=status_ref,
                status=status_ref.code if status_ref else (status_code or Task.Status.NEW),
                assigned_by=request.user,
                assigned_to_user_id=data.get("assigned_to") or data.get("assigned_to_user") or None,
                start_date=data.get("start_date") or None,
                due_at=data.get("due_at") or data.get("due_date") or None,
                estimated_hours=data.get("estimated_hours") or 0,
                actual_hours=data.get("actual_hours") or 0,
                progress_pct=int(data.get("progress_pct") or 0),
                checklist_json=data.get("checklist_json") or [],
            )
            if not task.title:
                return Response({"detail": "Title is required."}, status=400)
            if task.assigned_to_user_id:
                task.assignee = ensure_actor(User.objects.get(pk=task.assigned_to_user_id), org)
            task.save()
            label_ids = data.get("labels") or []
            if label_ids:
                task.labels.set(TaskLabel.objects.filter(id__in=label_ids, organization=org))
            task_history(task, request.user, "created", "Task created")
            if task.assigned_to_user_id:
                notify_user(
                    task.assigned_to_user,
                    org=org,
                    ntype=Notification.Type.TASK_ASSIGNED,
                    title=f"Task assigned: {task.title}",
                    body=f"{task.task_number} has been assigned to you.",
                    link=f"/tasks?id={task.id}",
                    entity_type="task",
                    entity_id=task.id,
                )
                task_history(task, request.user, "assigned", f"Assigned to user {task.assigned_to_user_id}")
        log_activity(request, action="task.create", entity_type="task", entity_id=task.id, detail=task.title)
        return Response(TaskSerializer(task, context={"request": request}).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        before = {"status": task.status_code, "title": task.title, "progress_pct": task.progress_pct}
        data = request.data
        for field in (
            "title", "description", "priority", "estimated_hours", "actual_hours",
            "progress_pct", "checklist_json", "evidence_urls",
        ):
            if field in data:
                setattr(task, field, data[field])
        for fk in ("department", "project", "category", "team"):
            if fk in data:
                setattr(task, f"{fk}_id", data[fk] or None)
        if "start_date" in data:
            task.start_date = data["start_date"] or None
        if "due_at" in data or "due_date" in data:
            task.due_at = data.get("due_at") or data.get("due_date") or None
        if "status_ref" in data or "status" in data or "status_code" in data:
            org = task.organization
            status_ref = None
            if data.get("status_ref"):
                status_ref = TaskStatus.objects.filter(id=data["status_ref"]).first()
            else:
                code = data.get("status") or data.get("status_code")
                status_ref = TaskStatus.objects.filter(
                    Q(organization=org) | Q(organization__isnull=True), code=code
                ).first()
            if status_ref:
                task.status_ref = status_ref
                task.status = status_ref.code
            elif data.get("status"):
                task.status = data["status"]
        if "assigned_to" in data or "assigned_to_user" in data:
            uid = data.get("assigned_to") or data.get("assigned_to_user")
            task.assigned_to_user_id = uid or None
            if uid:
                task.assignee = ensure_actor(User.objects.get(pk=uid), task.organization)
                notify_user(
                    task.assigned_to_user,
                    org=task.organization,
                    ntype=Notification.Type.TASK_ASSIGNED,
                    title=f"Task assigned: {task.title}",
                    body=f"{task.task_number} has been assigned to you.",
                    link=f"/tasks?id={task.id}",
                    entity_type="task",
                    entity_id=task.id,
                )
                task_history(task, request.user, "assigned", f"Assigned to {uid}")
        if "labels" in data:
            task.labels.set(TaskLabel.objects.filter(id__in=data["labels"] or [], organization=task.organization))
        task.save()
        after = {"status": task.status_code, "title": task.title, "progress_pct": task.progress_pct}
        task_history(task, request.user, "updated", "Task updated", before=before, after=after)
        notify_user(
            task.assigned_to_user,
            org=task.organization,
            ntype=Notification.Type.TASK_UPDATED,
            title=f"Task updated: {task.title}",
            body=f"{task.task_number} was updated.",
            link=f"/tasks?id={task.id}",
            entity_type="task",
            entity_id=task.id,
        )
        log_activity(request, action="task.update", entity_type="task", entity_id=task.id)
        return Response(TaskSerializer(task, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        task_history(task, request.user, "deleted", "Task deleted")
        log_activity(request, action="task.delete", entity_type="task", entity_id=task.id)
        task.delete()
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        src = self.get_object()
        org = src.organization
        clone = Task.objects.create(
            organization=org,
            tenant=src.tenant,
            task_number=next_task_number(org),
            title=f"{src.title} (Copy)",
            description=src.description,
            priority=src.priority,
            department=src.department,
            project=src.project,
            category=src.category,
            team=src.team,
            status_ref=src.status_ref,
            status=src.status,
            assigned_by=request.user,
            assigned_to_user=src.assigned_to_user,
            assignee=src.assignee,
            start_date=src.start_date,
            due_at=src.due_at,
            estimated_hours=src.estimated_hours,
            progress_pct=0,
            checklist_json=src.checklist_json,
        )
        clone.labels.set(src.labels.all())
        task_history(clone, request.user, "created", f"Duplicated from {src.task_number}")
        return Response(TaskSerializer(clone, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        task = self.get_object()
        task.is_archived = True
        task.archived_at = timezone.now()
        task.save(update_fields=["is_archived", "archived_at", "updated_at"])
        task_history(task, request.user, "archived", "Task archived")
        return Response(TaskSerializer(task, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        task = self.get_object()
        task.is_archived = False
        task.archived_at = None
        task.save(update_fields=["is_archived", "archived_at", "updated_at"])
        task_history(task, request.user, "restored", "Task restored")
        return Response(TaskSerializer(task, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        task = self.get_object()
        if request.method == "GET":
            qs = task.comments.filter(parent__isnull=True, is_deleted=False).select_related("author__profile")
            return Response({"results": TaskCommentSerializer(qs, many=True).data})
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response({"detail": "Comment body required."}, status=400)
        comment = TaskComment.objects.create(
            task=task,
            author=request.user,
            parent_id=request.data.get("parent") or None,
            body=body,
        )
        # Mentions: @username
        usernames = re.findall(r"@([A-Za-z0-9_.-]+)", body)
        if usernames:
            mentioned = User.objects.filter(username__in=usernames)
            comment.mentions.set(mentioned)
            for u in mentioned:
                notify_user(
                    u,
                    org=task.organization,
                    ntype=Notification.Type.MENTION,
                    title=f"Mentioned in {task.task_number}",
                    body=body[:200],
                    link=f"/tasks?id={task.id}",
                    entity_type="task",
                    entity_id=task.id,
                )
        return Response(TaskCommentSerializer(comment).data, status=201)

    @action(detail=True, methods=["patch", "delete"], url_path=r"comments/(?P<comment_id>[^/.]+)")
    def comment_detail(self, request, pk=None, comment_id=None):
        task = self.get_object()
        comment = task.comments.filter(id=comment_id).first()
        if not comment:
            return Response({"detail": "Not found."}, status=404)
        if request.method == "DELETE":
            if comment.author_id != request.user.id and not request.user.is_superuser:
                return Response({"detail": "Forbidden."}, status=403)
            comment.is_deleted = True
            comment.body = ""
            comment.save(update_fields=["is_deleted", "body", "updated_at"])
            return Response(status=204)
        if comment.author_id != request.user.id and not request.user.is_superuser:
            return Response({"detail": "Forbidden."}, status=403)
        comment.body = request.data.get("body", comment.body)
        comment.is_edited = True
        comment.save(update_fields=["body", "is_edited", "updated_at"])
        return Response(TaskCommentSerializer(comment).data)

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        task = self.get_object()
        if request.method == "GET":
            return Response({"results": TaskAttachmentSerializer(task.attachments.all(), many=True, context={"request": request}).data})
        files = request.FILES.getlist("files") or ([request.FILES["file"]] if "file" in request.FILES else [])
        if not files:
            return Response({"detail": "No files uploaded."}, status=400)
        created = []
        for f in files:
            att = TaskAttachment.objects.create(
                task=task,
                uploaded_by=request.user,
                file=f,
                original_name=getattr(f, "name", "")[:255],
                content_type=getattr(f, "content_type", "")[:128],
                size_bytes=getattr(f, "size", 0) or 0,
                kind=detect_file_kind(getattr(f, "name", ""), getattr(f, "content_type", "")),
            )
            created.append(att)
        return Response(
            {"results": TaskAttachmentSerializer(created, many=True, context={"request": request}).data},
            status=201,
        )

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        task = self.get_object()
        qs = task.history.select_related("actor__profile")
        return Response({"results": TaskHistorySerializer(qs, many=True).data})


# ---------------------------------------------------------------------------
# Approvals / Workflows
# ---------------------------------------------------------------------------

class ApprovalViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "tasks"
    permission_classes = [HasModulePermission]
    serializer_class = ApprovalSerializer
    pagination_class = StandardPagination
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Approval.objects.select_related("task", "approver_user__profile", "approver__user")
        if org:
            qs = qs.filter(task__organization=org)
        decision = self.request.query_params.get("decision") or self.request.query_params.get("status")
        if decision:
            qs = qs.filter(decision=decision)
        return qs.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        org = get_request_org(request)
        task = Task.objects.filter(id=request.data.get("task"), organization=org).first()
        if not task:
            return Response({"detail": "Task not found."}, status=404)
        actor = ensure_actor(request.user, org)
        approval = Approval.objects.create(
            task=task,
            approver=actor,
            approver_user=request.user,
            level=int(request.data.get("level") or 1),
            decision=Approval.Decision.PENDING,
            remarks=request.data.get("remarks") or "",
        )
        notify_user(
            task.assigned_to_user,
            org=org,
            ntype=Notification.Type.APPROVAL,
            title=f"Approval pending: {task.title}",
            body=f"Level {approval.level} approval requested.",
            link=f"/tasks?id={task.id}",
            entity_type="approval",
            entity_id=approval.id,
        )
        return Response(ApprovalSerializer(approval).data, status=201)

    def _decide(self, request, decision: str):
        approval = self.get_object()
        if not user_has_module_action(request.user, "tasks", "approve"):
            return Response({"detail": "Approve permission required."}, status=403)
        approval.decision = decision
        approval.remarks = request.data.get("remarks") or approval.remarks
        approval.decided_at = timezone.now()
        approval.approver_user = request.user
        approval.save()
        task_history(
            approval.task,
            request.user,
            decision,
            f"Approval L{approval.level}: {decision}",
        )
        notify_user(
            approval.task.assigned_by or approval.task.assigned_to_user,
            org=approval.task.organization,
            ntype=Notification.Type.APPROVAL,
            title=f"Approval {decision}: {approval.task.title}",
            body=approval.remarks,
            link=f"/tasks?id={approval.task_id}",
            entity_type="approval",
            entity_id=approval.id,
        )
        # Advance workflow if configured
        if decision == Approval.Decision.APPROVED and approval.workflow_instance_id:
            wi = approval.workflow_instance
            steps = (wi.definition.steps_json or []) if wi.definition_id else []
            next_level = approval.level + 1
            if next_level <= len(steps):
                Approval.objects.create(
                    task=approval.task,
                    workflow_instance=wi,
                    approver=approval.approver,
                    level=next_level,
                    decision=Approval.Decision.PENDING,
                )
            else:
                wi.status = WorkflowInstance.Status.COMPLETED
                wi.completed_at = timezone.now()
                wi.save(update_fields=["status", "completed_at"])
                done = TaskStatus.objects.filter(
                    Q(organization=approval.task.organization) | Q(organization__isnull=True),
                    code="completed",
                ).first()
                if done:
                    approval.task.status_ref = done
                    approval.task.status = done.code
                    approval.task.save(update_fields=["status_ref", "status", "updated_at"])
                task_history(approval.task, request.user, "completed", "Workflow completed")
        return Response(ApprovalSerializer(approval).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._decide(request, Approval.Decision.APPROVED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._decide(request, Approval.Decision.REJECTED)

    @action(detail=True, methods=["post"], url_path="return")
    def return_approval(self, request, pk=None):
        return self._decide(request, Approval.Decision.RETURNED)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        return self._decide(request, Approval.Decision.ESCALATED)


class WorkflowViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "admin"
    permission_classes = [HasModulePermission]
    serializer_class = WorkflowDefinitionSerializer
    pagination_class = StandardPagination
    queryset = WorkflowDefinition.objects.all().order_by("code", "-version")

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        definition = self.get_object()
        org = get_request_org(request)
        task_id = request.data.get("task")
        task = Task.objects.filter(id=task_id, organization=org).first()
        if not task:
            return Response({"detail": "Task required."}, status=400)
        wi = WorkflowInstance.objects.create(
            definition=definition,
            tenant=org.tenant if org else None,
            organization=org,
            entity_type="task",
            entity_id=task.id,
            current_step=(definition.steps_json or [{}])[0].get("name", "level_1") if definition.steps_json else "level_1",
            status=WorkflowInstance.Status.RUNNING,
        )
        task.workflow_instance = wi
        pending = TaskStatus.objects.filter(
            Q(organization=org) | Q(organization__isnull=True), code="pending_approval"
        ).first()
        if pending:
            task.status_ref = pending
            task.status = pending.code
        task.save()
        actor = ensure_actor(request.user, org)
        Approval.objects.create(
            task=task,
            workflow_instance=wi,
            approver=actor,
            level=1,
            decision=Approval.Decision.PENDING,
        )
        task_history(task, request.user, "workflow_started", f"Started {definition.code}")
        return Response({"workflow_instance_id": str(wi.id), "task_id": str(task.id)}, status=201)


# ---------------------------------------------------------------------------
# Notifications / Activity / Settings / Search / Dashboard / Reports
# ---------------------------------------------------------------------------

class NotificationViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    """Own notifications — any authenticated user."""
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(is_read=False)
        return qs.order_by("-created_at")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        def ser(n):
            return {
                "id": str(n.id),
                "type": n.type,
                "channel": n.channel,
                "title": n.title,
                "body": n.body,
                "link": n.link,
                "entity_type": n.entity_type,
                "entity_id": n.entity_id,
                "is_read": n.is_read,
                "read_at": n.read_at.isoformat() if n.read_at else None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
        unread = Notification.objects.filter(user=request.user, is_read=False).count()
        if page is not None:
            resp = self.get_paginated_response([ser(n) for n in page])
            resp.data["unread_count"] = unread
            return resp
        return Response({"results": [ser(n) for n in qs[:100]], "unread_count": unread})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"unread_count": Notification.objects.filter(user=request.user, is_read=False).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        n = self.get_queryset().filter(pk=pk).first()
        if not n:
            return Response({"detail": "Not found."}, status=404)
        n.is_read = True
        n.read_at = timezone.now()
        n.save(update_fields=["is_read", "read_at"])
        return Response({"ok": True})

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True, read_at=timezone.now())
        return Response({"ok": True})


class ActivityLogViewSet(EnterpriseAuthMixin, viewsets.ReadOnlyModelViewSet):
    module_code = "audit"
    permission_classes = [HasModulePermission]
    serializer_class = ActivityLogSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = ActivityLog.objects.select_related("user__profile")
        if org and not self.request.user.is_superuser:
            qs = qs.filter(organization=org)
        return qs.order_by("-created_at")


class SettingViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "settings"
    permission_classes = [HasModulePermission]
    serializer_class = AppSettingSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = AppSetting.objects.all()
        if org:
            qs = qs.filter(Q(organization=org) | Q(organization__isnull=True))
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs.order_by("category", "key")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))

    @action(detail=False, methods=["get", "put", "patch"], url_path="bulk")
    def bulk(self, request):
        org = get_request_org(request)
        if request.method == "GET":
            qs = self.get_queryset()
            return Response({s.key: s.value_json for s in qs if not s.is_secret})
        items = request.data if isinstance(request.data, dict) else {}
        for key, value in items.items():
            AppSetting.objects.update_or_create(
                organization=org,
                key=key,
                defaults={"value_json": value, "category": request.query_params.get("category") or "general"},
            )
        return Response({"ok": True})


class HolidayViewSet(EnterpriseAuthMixin, viewsets.ModelViewSet):
    module_code = "settings"
    permission_classes = [HasModulePermission]
    serializer_class = HolidaySerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        org = get_request_org(self.request)
        qs = Holiday.objects.all()
        if org:
            qs = qs.filter(organization=org)
        return qs.order_by("date")

    def perform_create(self, serializer):
        serializer.save(organization=get_request_org(self.request))


class GlobalSearchView(EnterpriseAuthMixin, APIView):
    def get(self, request):
        q = (request.query_params.get("q") or request.query_params.get("search") or "").strip()
        if len(q) < 2:
            return Response({"results": []})
        org = get_request_org(request)
        results = []

        def add(type_, id_, title, subtitle="", route=""):
            results.append({"type": type_, "id": str(id_), "title": title, "subtitle": subtitle, "route": route})

        tasks = Task.objects.filter(organization=org, is_archived=False).filter(
            Q(title__icontains=q) | Q(task_number__icontains=q)
        )[:10] if org else Task.objects.none()
        for t in tasks:
            add("task", t.id, t.title, t.task_number, f"/tasks?id={t.id}")

        users = User.objects.filter(
            Q(username__icontains=q) | Q(email__icontains=q) | Q(profile__full_name__icontains=q)
        )
        if org:
            users = users.filter(org_memberships__organization=org)
        for u in users.distinct()[:10]:
            name = getattr(getattr(u, "profile", None), "full_name", None) or u.username
            add("user", u.id, name, u.email or u.phone or "", "/admin")

        if org:
            for p in Project.objects.filter(organization=org).filter(Q(name__icontains=q) | Q(code__icontains=q))[:10]:
                add("project", p.id, p.name, p.code, "/tasks")
            for d in Department.objects.filter(organization=org).filter(Q(name__icontains=q) | Q(code__icontains=q))[:10]:
                add("department", d.id, d.name, d.code, "/hr")
            for t in Team.objects.filter(department__organization=org, name__icontains=q)[:10]:
                add("team", t.id, t.name, t.department.name, "/hr")
            for a in Approval.objects.filter(task__organization=org, task__title__icontains=q)[:10]:
                add("approval", a.id, a.task.title, a.decision, f"/tasks?id={a.task_id}")

        if request.user.is_superuser or request.user.account_type == "super_admin":
            for c in Organization.objects.filter(company_name__icontains=q)[:10]:
                add("company", c.id, c.company_name, c.official_email or "", "/admin")

        return Response({"results": results, "query": q})


class EnterpriseDashboardView(EnterpriseAuthMixin, APIView):
    def get(self, request):
        org = get_request_org(request)
        today = timezone.localdate()
        tasks = Task.objects.filter(organization=org, is_archived=False) if org else Task.objects.none()
        completed_codes = list(
            TaskStatus.objects.filter(
                Q(organization=org) | Q(organization__isnull=True), is_terminal=True
            ).values_list("code", flat=True)
        ) or ["completed", "cancelled", "rejected", "closed"]

        total = tasks.count()
        completed = tasks.filter(Q(status__in=completed_codes) | Q(status_ref__code__in=completed_codes)).count()
        in_progress = tasks.filter(Q(status="in_progress") | Q(status_ref__code="in_progress")).count()
        pending = tasks.filter(
            Q(status__in=["new", "assigned", "pending_approval"]) | Q(status_ref__code__in=["new", "assigned", "pending_approval"])
        ).count()
        overdue = tasks.exclude(
            Q(status__in=completed_codes) | Q(status_ref__code__in=completed_codes)
        ).filter(due_at__lt=timezone.now()).count()
        today_tasks = tasks.filter(due_at__date=today).count()
        employees = Employee.objects.filter(organization=org, status=Employee.Status.ACTIVE).count() if org else 0
        unread = Notification.objects.filter(user=request.user, is_read=False).count()

        # Chart: tasks by status
        by_status = (
            tasks.values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        # Chart: tasks by priority
        by_priority = tasks.values("priority").annotate(count=Count("id"))

        return Response({
            "cards": {
                "total_tasks": total,
                "completed": completed,
                "pending": pending,
                "in_progress": in_progress,
                "overdue": overdue,
                "today_tasks": today_tasks,
                "total_employees": employees,
                "notifications": unread,
            },
            "charts": {
                "by_status": list(by_status),
                "by_priority": list(by_priority),
            },
        })


class TodayMissionView(EnterpriseAuthMixin, APIView):
    def get(self, request):
        org = get_request_org(request)
        today = timezone.localdate()
        now = timezone.now()
        tasks = Task.objects.filter(organization=org, is_archived=False) if org else Task.objects.none()
        completed_codes = ["completed", "cancelled", "rejected", "closed", "archived"]

        due_today = tasks.filter(due_at__date=today).exclude(status__in=completed_codes)
        overdue = tasks.filter(due_at__lt=now).exclude(status__in=completed_codes)
        my_tasks = tasks.filter(assigned_to_user=request.user).exclude(status__in=completed_codes)[:20]
        approvals = Approval.objects.filter(
            decision=Approval.Decision.PENDING,
            task__organization=org,
        ).select_related("task")[:20] if org else Approval.objects.none()
        meetings = Meeting.objects.filter(
            organization=org,
            scheduled_at__date=today,
        ).order_by("scheduled_at")[:20] if org else Meeting.objects.none()

        return Response({
            "due_today": TaskSerializer(due_today[:20], many=True, context={"request": request}).data,
            "overdue": TaskSerializer(overdue[:20], many=True, context={"request": request}).data,
            "tasks": TaskSerializer(my_tasks, many=True, context={"request": request}).data,
            "approvals": ApprovalSerializer(approvals, many=True).data,
            "meetings": [
                {
                    "id": str(m.id),
                    "title": m.title,
                    "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
                    "location": m.location,
                    "status": m.status,
                }
                for m in meetings
            ],
        })


class ReportView(EnterpriseAuthMixin, APIView):
    """Dynamic reports with CSV/Excel-ish export (CSV) and PDF limitation note."""

    def get(self, request):
        org = get_request_org(request)
        report = request.query_params.get("type") or "task"
        export = request.query_params.get("export")  # csv | excel | pdf

        if report == "employee":
            rows = []
            qs = Employee.objects.filter(organization=org).select_related("department", "position") if org else []
            for e in qs:
                rows.append({
                    "employee_code": e.employee_code,
                    "full_name": e.full_name,
                    "department": e.department.name if e.department_id else "",
                    "designation": e.position.designation if e.position_id else "",
                    "status": e.status,
                })
        elif report == "department":
            rows = []
            qs = Department.objects.filter(organization=org).annotate(emp_count=Count("employees")) if org else []
            for d in qs:
                rows.append({
                    "code": d.code,
                    "name": d.name,
                    "status": d.status,
                    "employees": d.emp_count,
                })
        elif report == "approval":
            rows = []
            qs = Approval.objects.filter(task__organization=org).select_related("task") if org else []
            for a in qs[:500]:
                rows.append({
                    "task": a.task.task_number or str(a.task_id),
                    "title": a.task.title,
                    "level": a.level,
                    "decision": a.decision,
                    "decided_at": a.decided_at.isoformat() if a.decided_at else "",
                })
        elif report == "productivity":
            rows = []
            qs = (
                Task.objects.filter(organization=org, is_archived=False)
                .values("assigned_to_user__username")
                .annotate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(status="completed")),
                )
                if org
                else []
            )
            for r in qs:
                rows.append({
                    "user": r["assigned_to_user__username"] or "Unassigned",
                    "total": r["total"],
                    "completed": r["completed"],
                    "completion_pct": round((r["completed"] / r["total"] * 100) if r["total"] else 0, 1),
                })
        else:  # task
            rows = []
            qs = Task.objects.filter(organization=org).select_related("department", "status_ref") if org else []
            for t in qs[:1000]:
                rows.append({
                    "task_number": t.task_number,
                    "title": t.title,
                    "status": t.status_code,
                    "priority": t.priority,
                    "department": t.department.name if t.department_id else "",
                    "progress_pct": t.progress_pct,
                    "due_at": t.due_at.isoformat() if t.due_at else "",
                })

        if export in ("csv", "excel"):
            # Excel export without openpyxl: deliver CSV with excel MIME (limitation documented)
            if not rows:
                return Response({"detail": "No data."}, status=404)
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
            content = buf.getvalue()
            resp = HttpResponse(content, content_type="text/csv")
            resp["Content-Disposition"] = f'attachment; filename="{report}_report.csv"'
            return resp

        if export == "pdf":
            return Response(
                {
                    "detail": "PDF export requires a PDF engine (WeasyPrint/ReportLab) which is not installed. Use CSV export, or install a PDF library.",
                    "code": "pdf_unavailable",
                    "rows": rows[:50],
                },
                status=501,
            )

        return Response({"type": report, "count": len(rows), "results": rows})
