"""Run all important seeders in the correct order.

Usage:
    python manage.py seed_all
    python manage.py seed_all --skip-demo
"""

from __future__ import annotations

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run create_superuser + seed_geo + seed_core + seed_demo + seed_modules + seed_enterprise + seed_menus."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-demo",
            action="store_true",
            help="Skip demo organization / product seed",
        )
        parser.add_argument(
            "--username",
            default="admin",
            help="Superuser username",
        )
        parser.add_argument(
            "--password",
            default="Admin@12345",
            help="Superuser password",
        )
        parser.add_argument(
            "--email",
            default="admin@sunyazon.com",
            help="Superuser email",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("1/6  create_superuser"))
        call_command(
            "create_superuser",
            username=options["username"],
            password=options["password"],
            email=options["email"],
            force=True,
        )

        self.stdout.write(self.style.MIGRATE_HEADING("2/6  seed_geo"))
        call_command("seed_geo")

        self.stdout.write(self.style.MIGRATE_HEADING("3/6  seed_core"))
        call_command("seed_core")

        if options["skip_demo"]:
            self.stdout.write(self.style.WARNING("Skipping seed_demo (--skip-demo)."))
        else:
            self.stdout.write(self.style.MIGRATE_HEADING("4/6  seed_demo"))
            call_command("seed_demo")

        self.stdout.write(self.style.MIGRATE_HEADING("5/7  seed_modules"))
        call_command("seed_modules")

        self.stdout.write(self.style.MIGRATE_HEADING("6/7  seed_enterprise"))
        call_command("seed_enterprise")

        self.stdout.write(self.style.MIGRATE_HEADING("7/7  seed_menus"))
        call_command("seed_menus")

        self.stdout.write(self.style.SUCCESS(
            "\nAll seeders finished.\n"
            f"  Admin login : {options['username']} / {options['password']}\n"
            "  Phone login : 9800000001 / Admin@12345\n"
            "  Admin URL   : /admin/\n"
        ))
