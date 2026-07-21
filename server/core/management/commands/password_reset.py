"""Reset a user's password by phone number.

Usage:
    python manage.py password_reset --phone 9800000001 --password NewPass@123
    python manage.py password_reset 9800000001 NewPass@123
"""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import User
from core.services.auth_service import normalize_phone


class Command(BaseCommand):
    help = "Reset a user's password looked up by phone number."

    def add_arguments(self, parser):
        parser.add_argument(
            "phone_pos",
            nargs="?",
            default="",
            help="Phone number (positional alternative to --phone)",
        )
        parser.add_argument(
            "password_pos",
            nargs="?",
            default="",
            help="New password (positional alternative to --password)",
        )
        parser.add_argument("--phone", default="", help="Phone number to look up")
        parser.add_argument("--password", default="", help="New password")

    @transaction.atomic
    def handle(self, *args, **options):
        phone_raw = (options["phone"] or options["phone_pos"] or "").strip()
        password = options["password"] or options["password_pos"] or ""

        if not phone_raw:
            raise CommandError("Phone is required. Use --phone or pass it as the first argument.")
        if not password:
            raise CommandError("Password is required. Use --password or pass it as the second argument.")
        if len(password) < 8:
            raise CommandError("Password must be at least 8 characters.")

        phone = normalize_phone(phone_raw)
        if not phone:
            raise CommandError("Enter a valid phone number.")

        user = (
            User.objects.filter(phone=phone).first()
            or User.objects.filter(phone=phone_raw).first()
            or User.objects.filter(username=phone_raw).first()
            or User.objects.filter(username=phone).first()
        )
        if not user:
            raise CommandError(f"No user found for phone '{phone_raw}'.")

        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc

        user.set_password(password)
        user.save(update_fields=["password"])

        display = user.phone or user.username
        self.stdout.write(self.style.SUCCESS(
            f"Password reset for user '{display}' (id={user.pk})."
        ))
