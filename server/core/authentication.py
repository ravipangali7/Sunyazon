"""DRF authentication — JWT access tokens + legacy opaque session tokens."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import authentication, exceptions

from core.models import Session, User
from core.services.auth_service import get_user_from_token
from core.services.enterprise_auth import decode_access_jwt


class SessionTokenAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        token = None
        if header:
            parts = header.split()
            if len(parts) == 2 and parts[0] == self.keyword:
                token = parts[1]
            elif len(parts) == 1:
                token = parts[0]
        if not token:
            token = request.META.get("HTTP_X_AUTH_TOKEN") or request.COOKIES.get("beos_token")
        if not token:
            return None

        # Prefer JWT access tokens
        claims = decode_access_jwt(token)
        if claims and claims.get("typ") == "access":
            sid = claims.get("sid")
            sub = claims.get("sub")
            session = Session.objects.select_related("user").filter(id=sid).first()
            if session is None:
                raise exceptions.AuthenticationFailed("Invalid or expired token.")
            if session.refresh_expires_at and session.refresh_expires_at <= timezone.now():
                raise exceptions.AuthenticationFailed("Session expired.")
            user = session.user
            if str(user.id) != str(sub) or not user.is_active:
                raise exceptions.AuthenticationFailed("Invalid or expired token.")
            return (user, token)

        # Legacy opaque session token
        user = get_user_from_token(token)
        if user is None:
            raise exceptions.AuthenticationFailed("Invalid or expired token.")
        return (user, token)
