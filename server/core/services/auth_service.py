"""Phone + password authentication and session tokens."""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.models import Session, User, UserProfile
from core.services.portal_service import resolve_portal


class AuthError(Exception):
    def __init__(
        self,
        message: str,
        code: str = "auth_error",
        *,
        field_errors: dict[str, list[str]] | None = None,
    ):
        self.message = message
        self.code = code
        self.field_errors = field_errors or {}
        super().__init__(message)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def normalize_phone(phone: str) -> str:
    return "".join(ch for ch in (phone or "").strip() if ch.isdigit() or ch == "+")


def authenticate_phone(phone: str, password: str) -> User:
    phone_norm = normalize_phone(phone)
    if not phone_norm or not password:
        raise AuthError("Phone number and password are required.", "missing_credentials")

    user = (
        User.objects.filter(phone=phone_norm).first()
        or User.objects.filter(phone=phone.strip()).first()
        or User.objects.filter(username=phone.strip()).first()
    )
    if user is None:
        raise AuthError("Invalid phone number or password.", "invalid_credentials")

    if not user.is_active:
        raise AuthError("This account is disabled.", "inactive")

    # Prefer Django password check; also allow authenticate via username
    if user.check_password(password):
        return user

    auth_user = authenticate(username=user.username, password=password)
    if auth_user is None:
        raise AuthError("Invalid phone number or password.", "invalid_credentials")
    return auth_user


def create_session(user: User, *, device_info: str = "", ip: str | None = None, days: int = 14) -> tuple[str, Session]:
    raw = secrets.token_urlsafe(48)
    session = Session.objects.create(
        user=user,
        token_hash=_hash_token(raw),
        device_info=device_info[:255],
        ip=ip,
        expires_at=timezone.now() + timedelta(days=days),
    )
    return raw, session


def get_user_from_token(raw_token: str) -> User | None:
    if not raw_token:
        return None
    token_hash = _hash_token(raw_token)
    session = (
        Session.objects.select_related("user")
        .filter(token_hash=token_hash, expires_at__gt=timezone.now())
        .first()
    )
    if session is None:
        return None
    user = session.user
    if not user.is_active:
        return None
    return user


def revoke_token(raw_token: str) -> None:
    if not raw_token:
        return
    Session.objects.filter(token_hash=_hash_token(raw_token)).delete()


def user_payload(user: User) -> dict:
    profile = getattr(user, "profile", None)
    membership = (
        user.org_memberships.select_related("organization", "role")
        .filter(organization__is_active=True)
        .order_by("-is_primary_admin", "created_at")
        .first()
    )
    portal = resolve_portal(user, membership)
    return {
        "id": str(user.id),
        "username": user.username,
        "phone": user.phone,
        "email": user.email,
        "full_name": (profile.full_name if profile else "") or user.get_full_name() or user.username,
        "account_type": user.account_type,
        "platform_role": user.platform_role,
        "is_superuser": user.is_superuser,
        "membership": (
            {
                "id": str(membership.id),
                "organization_id": str(membership.organization_id),
                "organization_name": membership.organization.company_name,
                "role_kind": membership.role_kind,
                "role_name": membership.role.name if membership.role_id else None,
                "designation": membership.designation,
                "is_primary_admin": membership.is_primary_admin,
            }
            if membership
            else None
        ),
        "portal": portal.as_dict(),
    }


def login_with_phone(phone: str, password: str, *, device_info: str = "", ip: str | None = None) -> dict:
    user = authenticate_phone(phone, password)
    raw_token, _session = create_session(user, device_info=device_info, ip=ip)
    return {
        "token": raw_token,
        "user": user_payload(user),
    }


_PHONE_RE = re.compile(r"^\+?\d{8,15}$")


def _normalize_email(email: str | None) -> str | None:
    value = (email or "").strip().lower()
    return value or None


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(None, 1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0][:150], ""
    return parts[0][:150], parts[1][:150]


def _unique_username(phone_norm: str, email: str | None) -> str:
    base = phone_norm.lstrip("+") or (email.split("@")[0] if email else "user")
    base = re.sub(r"[^a-zA-Z0-9._-]", "", base)[:120] or "user"
    candidate = base
    n = 1
    while User.objects.filter(username=candidate).exists():
        suffix = f"_{n}"
        candidate = f"{base[: 150 - len(suffix)]}{suffix}"
        n += 1
    return candidate


def register_user(
    *,
    full_name: str,
    phone: str,
    password: str,
    password_confirm: str = "",
    email: str | None = None,
    account_type: str | None = None,
    device_info: str = "",
    ip: str | None = None,
) -> dict:
    """Create an account and return a session token (auto-login).

    account_type:
      - default / consumer → Default user (HR Form Applicant / marketplace)
      - producer | distributor | wholesaler | retailer → business account
        (company registration completed in a follow-up step)
    """
    field_errors: dict[str, list[str]] = {}

    name = (full_name or "").strip()
    if not name or len(name) < 2:
        field_errors.setdefault("full_name", []).append("Please enter your full name.")

    phone_norm = normalize_phone(phone)
    if not phone_norm:
        field_errors.setdefault("phone", []).append("Phone number is required.")
    elif not _PHONE_RE.match(phone_norm):
        field_errors.setdefault("phone", []).append(
            "Enter a valid phone number (8–15 digits)."
        )

    email_norm = _normalize_email(email)
    if email and not email_norm:
        field_errors.setdefault("email", []).append("Enter a valid email address.")
    elif email_norm:
        try:
            validate_email(email_norm)
        except ValidationError:
            field_errors.setdefault("email", []).append("Enter a valid email address.")

    if not password:
        field_errors.setdefault("password", []).append("Password is required.")
    elif password_confirm and password != password_confirm:
        field_errors.setdefault("password_confirm", []).append("Passwords do not match.")

    if phone_norm and User.objects.filter(phone=phone_norm).exists():
        field_errors.setdefault("phone", []).append(
            "An account with this phone number already exists."
        )

    if email_norm and User.objects.filter(email__iexact=email_norm).exists():
        field_errors.setdefault("email", []).append(
            "An account with this email already exists."
        )

    allowed = {
        User.AccountType.DEFAULT,
        User.AccountType.CONSUMER,
        User.AccountType.PRODUCER,
        User.AccountType.DISTRIBUTOR,
        User.AccountType.WHOLESALER,
        User.AccountType.RETAILER,
    }
    resolved_type = (account_type or User.AccountType.DEFAULT).strip().lower()
    if resolved_type == "consumer":
        resolved_type = User.AccountType.DEFAULT
    if resolved_type not in allowed:
        field_errors.setdefault("account_type", []).append(
            "Invalid account type. Choose Default, Producer, Distributor, Wholesaler, or Retailer."
        )

    if password and not field_errors.get("password"):
        # Build a lightweight stand-in so similarity validators can run.
        probe = User(
            username=phone_norm or "user",
            phone=phone_norm or None,
            email=email_norm,
            first_name=_split_full_name(name)[0] if name else "",
            last_name=_split_full_name(name)[1] if name else "",
        )
        try:
            validate_password(password, user=probe)
        except ValidationError as exc:
            field_errors.setdefault("password", []).extend(list(exc.messages))

    if field_errors:
        raise AuthError(
            next(iter(next(iter(field_errors.values())))),
            "validation_error",
            field_errors=field_errors,
        )

    first_name, last_name = _split_full_name(name)
    username = _unique_username(phone_norm, email_norm)

    try:
        with transaction.atomic():
            user = User(
                username=username,
                email=email_norm,
                phone=phone_norm,
                first_name=first_name,
                last_name=last_name,
                account_type=resolved_type,
                platform_role=User.PlatformRole.NONE,
                is_active=True,
                is_staff=False,
                is_superuser=False,
            )
            user.set_password(password)
            user.save()
            UserProfile.objects.create(
                user=user,
                full_name=name,
                language_preference="en",
            )
            from core.services.kyc_service import setup_consumer_user

            setup_consumer_user(user)
    except IntegrityError:
        # Race on unique phone/email
        raise AuthError(
            "An account with this phone or email already exists.",
            "duplicate_account",
            field_errors={
                "phone": ["An account with this phone or email already exists."],
            },
        ) from None

    from core.services.enterprise_auth import create_auth_session

    auth = create_auth_session(user, device_info=device_info, ip=ip, browser=device_info)
    auth["needs_company_registration"] = resolved_type in {
        User.AccountType.PRODUCER,
        User.AccountType.DISTRIBUTOR,
        User.AccountType.WHOLESALER,
        User.AccountType.RETAILER,
    }
    return auth
