"""Create a platform superuser for core.User (AbstractUser).

Usage:
    python manage.py create_superuser
    python manage.py create_superuser --username admin --email admin@sunyazon.com --password Admin@123
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import User, UserProfile


class Command(BaseCommand):
    help = "Create a Sunyazon superuser (core.User AbstractUser) with optional profile."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="admin", help="Username (default: admin)")
        parser.add_argument("--email", default="admin@sunyazon.com", help="Email")
        parser.add_argument("--phone", default="", help="Phone number")
        parser.add_argument("--password", default="Admin@12345", help="Password")
        parser.add_argument("--full-name", default="Sunyazon Administrator", help="Profile full name")
        parser.add_argument("--force", action="store_true", help="Reset password if user already exists")

    @transaction.atomic
    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        phone = options["phone"] or None
        password = options["password"]
        full_name = options["full_name"]
        force = options["force"]

        if not password or len(password) < 8:
            raise CommandError("Password must be at least 8 characters.")

        user = User.objects.filter(username=username).first()
        if user and not force:
            self.stdout.write(self.style.WARNING(
                f"User '{username}' already exists. Use --force to reset password."
            ))
            return

        if user:
            user.email = email
            user.phone = phone
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.account_type = User.AccountType.SUPER_ADMIN
            user.platform_role = User.PlatformRole.ADMIN
            user.set_password(password)
            user.save()
            action = "Updated"
        else:
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password,
            )
            user.phone = phone
            user.account_type = User.AccountType.SUPER_ADMIN
            user.platform_role = User.PlatformRole.ADMIN
            user.save(update_fields=["phone", "account_type", "platform_role"])
            action = "Created"

        UserProfile.objects.update_or_create(
            user=user,
            defaults={"full_name": full_name, "language_preference": "en"},
        )

        self.stdout.write(self.style.SUCCESS(
            f"{action} superuser '{username}' ({email}). "
            f"Login at /admin/ with password you provided."
        ))
