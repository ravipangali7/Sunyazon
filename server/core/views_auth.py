"""Auth & portal API views."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.authentication import SessionTokenAuthentication
from core.models import Module
from core.services.auth_service import (
    AuthError,
    register_user,
    revoke_token,
    user_payload,
)
from core.services.portal_service import resolve_portal


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _auth_error_response(exc: AuthError, *, default_status: int):
    body: dict = {"detail": exc.message, "code": exc.code}
    if exc.field_errors:
        body["errors"] = exc.field_errors
    http_status = (
        status.HTTP_400_BAD_REQUEST
        if exc.code in ("validation_error", "duplicate_account")
        else default_status
    )
    return Response(body, status=http_status)


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from core.services.enterprise_auth import login_with_credentials

        phone = request.data.get("phone") or request.data.get("phone_number") or ""
        password = request.data.get("password") or ""
        remember = bool(request.data.get("remember") or request.data.get("remember_me"))
        device_info = request.data.get("device_info") or request.META.get("HTTP_USER_AGENT", "")
        try:
            payload = login_with_credentials(
                phone,
                password,
                device_info=device_info,
                ip=_client_ip(request),
                remember=remember,
                browser=device_info,
            )
        except AuthError as exc:
            return _auth_error_response(exc, default_status=status.HTTP_401_UNAUTHORIZED)
        return Response(payload)


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        device_info = request.data.get("device_info") or request.META.get("HTTP_USER_AGENT", "")
        try:
            payload = register_user(
                full_name=request.data.get("full_name") or request.data.get("name") or "",
                phone=request.data.get("phone") or request.data.get("phone_number") or "",
                email=request.data.get("email"),
                password=request.data.get("password") or "",
                password_confirm=request.data.get("password_confirm")
                or request.data.get("confirm_password")
                or "",
                account_type=request.data.get("account_type"),
                device_info=device_info,
                ip=_client_ip(request),
            )
        except AuthError as exc:
            return _auth_error_response(exc, default_status=status.HTTP_400_BAD_REQUEST)
        return Response(payload, status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = getattr(request, "auth", None)
        if isinstance(token, str):
            revoke_token(token)
        return Response({"ok": True})


class MeView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_payload(request.user))


class PortalView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(resolve_portal(request.user).as_dict())


class ModuleListView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portal = resolve_portal(request.user)
        return Response({"modules": [m.as_dict() for m in portal.modules]})


class ModuleCatalogView(APIView):
    """Full active module catalog (super admin / admin tooling)."""

    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        modules = Module.objects.filter(is_active=True).order_by("sort_order", "name")
        return Response(
            {
                "modules": [
                    {
                        "code": m.code,
                        "name": m.name,
                        "description": m.description,
                        "icon": m.icon,
                        "color": m.color,
                        "route_path": m.route_path,
                        "category": m.category,
                    }
                    for m in modules
                ]
            }
        )
