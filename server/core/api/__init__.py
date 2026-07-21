"""Enterprise REST API — permissions, pagination helpers, org scoping."""

from __future__ import annotations

from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated

from core.authentication import SessionTokenAuthentication
from core.services.portal_service import _pick_membership
from core.views_domain import resolve_org


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class EnterpriseAuthMixin:
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]


def get_request_org(request):
    return resolve_org(request.user)


def user_has_module_action(user, module_code: str, action: str = "view") -> bool:
    """Check granular RBAC for a module code + action."""
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "account_type", "") == "super_admin":
        return True

    membership = _pick_membership(user)
    if membership is None:
        return False
    if membership.role_kind == "admin" or membership.is_primary_admin:
        return True
    if not membership.role_id:
        return False

    perm = (
        membership.role.module_permissions.select_related("module")
        .filter(module__code=module_code, module__is_active=True)
        .first()
    )
    if perm is None:
        # fallback permissions_json
        pj = membership.role.permissions_json or {}
        if pj.get("*") is True:
            return True
        level = pj.get(module_code)
        if level in (True, "F", "full"):
            return True
        if level in ("R", "read") and action == "view":
            return True
        return False

    if perm.access_level == "N":
        return False
    flag = {
        "view": perm.can_view,
        "create": perm.can_create,
        "edit": perm.can_edit,
        "delete": perm.can_delete,
        "approve": perm.can_approve,
        "export": perm.can_export,
        "import": perm.can_import,
        "print": perm.can_print,
    }.get(action)
    if flag is None:
        return perm.access_level in ("F", "R") and action == "view"
    # Legacy rows may have all False — derive from access_level
    if not any(perm.actions_payload().values()) and perm.access_level == "F":
        return True
    if not any(perm.actions_payload().values()) and perm.access_level == "R":
        return action in ("view", "export", "print")
    return bool(flag)


class HasModulePermission(BasePermission):
    """DRF permission: set view.module_code and view.required_action."""

    def has_permission(self, request, view):
        module_code = getattr(view, "module_code", None)
        if not module_code:
            return True
        action = getattr(view, "required_action", None)
        if action is None:
            method_map = {
                "GET": "view",
                "HEAD": "view",
                "OPTIONS": "view",
                "POST": "create",
                "PUT": "edit",
                "PATCH": "edit",
                "DELETE": "delete",
            }
            action = method_map.get(request.method, "view")
            # Detail custom actions may override via view.action
            view_action = getattr(view, "action", None)
            if view_action in ("approve", "reject", "return_approval", "escalate"):
                action = "approve"
            elif view_action in ("export",):
                action = "export"
            elif view_action in ("import_data",):
                action = "import"
            elif view_action in ("duplicate", "archive", "restore"):
                action = "edit"
        return user_has_module_action(request.user, module_code, action)


def client_meta(request) -> dict:
    ua = request.META.get("HTTP_USER_AGENT", "")[:500]
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
    browser = ua[:255]
    device = "mobile" if any(x in ua.lower() for x in ("mobile", "android", "iphone")) else "desktop"
    return {"ip": ip, "browser": browser, "device": device, "user_agent": ua}
