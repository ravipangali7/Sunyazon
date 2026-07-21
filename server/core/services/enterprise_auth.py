"""Auth enhancements — refresh tokens, remember login, profile, password change."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

import jwt
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone

from core.models import OrgUser, Session, User, UserProfile
from core.services.auth_service import (
    AuthError,
    _hash_token,
    authenticate_phone,
    user_payload,
)


ACCESS_TOKEN_HOURS = 12
ACCESS_TOKEN_REMEMBER_DAYS = 14
REFRESH_TOKEN_DAYS = 7
REFRESH_TOKEN_REMEMBER_DAYS = 30


def _jwt_secret() -> str:
    return getattr(settings, "SECRET_KEY", "insecure")


def issue_access_jwt(user: User, session: Session, *, remember: bool = False) -> str:
    now = timezone.now()
    if remember:
        exp = now + timedelta(days=ACCESS_TOKEN_REMEMBER_DAYS)
    else:
        exp = now + timedelta(hours=ACCESS_TOKEN_HOURS)
    payload = {
        "sub": str(user.id),
        "sid": str(session.id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def decode_access_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def create_auth_session(
    user: User,
    *,
    device_info: str = "",
    ip: str | None = None,
    remember: bool = False,
    browser: str = "",
) -> dict:
    raw_refresh = secrets.token_urlsafe(48)
    now = timezone.now()
    access_days = ACCESS_TOKEN_REMEMBER_DAYS if remember else max(1, ACCESS_TOKEN_HOURS // 24 or 1)
    refresh_days = REFRESH_TOKEN_REMEMBER_DAYS if remember else REFRESH_TOKEN_DAYS
    # Keep opaque access hash for backward-compatible Bearer tokens too
    raw_access = secrets.token_urlsafe(48)
    session = Session.objects.create(
        user=user,
        token_hash=_hash_token(raw_access),
        refresh_token_hash=_hash_token(raw_refresh),
        remember=remember,
        device_info=device_info[:255],
        browser=browser[:255],
        ip=ip,
        expires_at=now + timedelta(days=access_days if remember else 1),
        refresh_expires_at=now + timedelta(days=refresh_days),
    )
    jwt_access = issue_access_jwt(user, session, remember=remember)
    # Update last login
    User.objects.filter(pk=user.pk).update(last_login=now)
    OrgUser.objects.filter(user=user).update(last_login_at=now)
    return {
        "token": jwt_access,
        "access_token": jwt_access,
        "refresh_token": raw_refresh,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_REMEMBER_DAYS * 86400 if remember else ACCESS_TOKEN_HOURS * 3600,
        "user": user_payload(user),
    }


def login_with_credentials(
    phone: str,
    password: str,
    *,
    device_info: str = "",
    ip: str | None = None,
    remember: bool = False,
    browser: str = "",
) -> dict:
    user = authenticate_phone(phone, password)
    return create_auth_session(
        user,
        device_info=device_info,
        ip=ip,
        remember=remember,
        browser=browser or device_info,
    )


def refresh_access_token(raw_refresh: str) -> dict:
    if not raw_refresh:
        raise AuthError("Refresh token is required.", "missing_refresh")
    token_hash = _hash_token(raw_refresh)
    session = (
        Session.objects.select_related("user")
        .filter(refresh_token_hash=token_hash)
        .first()
    )
    if session is None:
        raise AuthError("Invalid refresh token.", "invalid_refresh")
    if session.refresh_expires_at and session.refresh_expires_at <= timezone.now():
        session.delete()
        raise AuthError("Refresh token expired.", "expired_refresh")
    user = session.user
    if not user.is_active:
        raise AuthError("This account is disabled.", "inactive")

    # Rotate refresh token
    new_refresh = secrets.token_urlsafe(48)
    new_access_opaque = secrets.token_urlsafe(48)
    now = timezone.now()
    remember = session.remember
    refresh_days = REFRESH_TOKEN_REMEMBER_DAYS if remember else REFRESH_TOKEN_DAYS
    session.token_hash = _hash_token(new_access_opaque)
    session.refresh_token_hash = _hash_token(new_refresh)
    session.expires_at = now + timedelta(days=ACCESS_TOKEN_REMEMBER_DAYS if remember else 1)
    session.refresh_expires_at = now + timedelta(days=refresh_days)
    session.save(
        update_fields=[
            "token_hash",
            "refresh_token_hash",
            "expires_at",
            "refresh_expires_at",
        ]
    )
    jwt_access = issue_access_jwt(user, session, remember=remember)
    return {
        "token": jwt_access,
        "access_token": jwt_access,
        "refresh_token": new_refresh,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_REMEMBER_DAYS * 86400 if remember else ACCESS_TOKEN_HOURS * 3600,
        "user": user_payload(user),
    }


def revoke_refresh_token(raw_refresh: str) -> None:
    if not raw_refresh:
        return
    Session.objects.filter(refresh_token_hash=_hash_token(raw_refresh)).delete()


def update_profile(user: User, data: dict) -> dict:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if "full_name" in data and data["full_name"] is not None:
        name = str(data["full_name"]).strip()
        profile.full_name = name
        parts = name.split(None, 1)
        user.first_name = parts[0][:150] if parts else ""
        user.last_name = parts[1][:150] if len(parts) > 1 else ""
    if "email" in data and data["email"] is not None:
        email = str(data["email"]).strip().lower() or None
        if email and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            raise AuthError("Email already in use.", "duplicate_email", field_errors={"email": ["Email already in use."]})
        user.email = email
    if "phone" in data and data["phone"] is not None:
        phone = "".join(ch for ch in str(data["phone"]) if ch.isdigit() or ch == "+")
        if phone and User.objects.filter(phone=phone).exclude(pk=user.pk).exists():
            raise AuthError("Phone already in use.", "duplicate_phone", field_errors={"phone": ["Phone already in use."]})
        user.phone = phone or None
    if "language_preference" in data and data["language_preference"] is not None:
        profile.language_preference = str(data["language_preference"])[:16]
    if "bio" in data and data["bio"] is not None:
        profile.bio = str(data["bio"])
    if "profile_picture" in data and data["profile_picture"] is not None:
        profile.profile_picture = data["profile_picture"]
    user.save()
    profile.save()
    return user_payload(user)


def change_password(user: User, current_password: str, new_password: str, confirm: str = "") -> None:
    if not current_password or not new_password:
        raise AuthError("Current and new password are required.", "validation_error")
    if not user.check_password(current_password):
        raise AuthError("Current password is incorrect.", "invalid_password", field_errors={"current_password": ["Incorrect password."]})
    if confirm and new_password != confirm:
        raise AuthError("Passwords do not match.", "validation_error", field_errors={"new_password_confirm": ["Passwords do not match."]})
    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        raise AuthError(
            "Password does not meet requirements.",
            "validation_error",
            field_errors={"new_password": list(exc.messages)},
        ) from exc
    user.set_password(new_password)
    user.save(update_fields=["password"])
    # Invalidate other sessions optionally left to caller
