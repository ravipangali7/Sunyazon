"""Seed enterprise defaults: task statuses, menus, roles, settings.

Usage:
    python manage.py seed_enterprise
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    AppSetting,
    MenuItem,
    Module,
    Organization,
    Role,
    RoleModulePermission,
    TaskStatus,
    WorkflowDefinition,
)

DEFAULT_STATUSES = [
    ("new", "New", "#6B7280", 10, False, True),
    ("assigned", "Assigned", "#3B82F6", 20, False, False),
    ("pending_approval", "Pending Approval", "#F59E0B", 30, False, False),
    ("in_progress", "In Progress", "#8B5CF6", 40, False, False),
    ("on_hold", "On Hold", "#94A3B8", 50, False, False),
    ("review", "Review", "#06B6D4", 60, False, False),
    ("completed", "Completed", "#10B981", 70, True, False),
    ("rejected", "Rejected", "#EF4444", 80, True, False),
    ("cancelled", "Cancelled", "#64748B", 90, True, False),
]

# Extra modules for enterprise features
EXTRA_MODULES = [
    ("notifications", "Notifications", "Alerts and reminders", "Bell", "#F25C05", "/notifications", "system", 400),
    ("settings", "Settings", "Company and system preferences", "Settings", "#64748B", "/settings", "system", 410),
    ("users", "Users", "User management", "Users", "#0EA5E9", "/users", "admin", 315),
]

SYSTEM_ROLES = [
    "Super Admin",
    "Admin",
    "HR",
    "Finance",
    "Production",
    "Inventory",
    "Sales",
    "Purchase",
    "Staff",
    "Employee",
]

# Menu tree rooted from Module registry
MENU_FROM_MODULES = True


class Command(BaseCommand):
    help = "Seed task statuses, sidebar menus, enterprise roles, and default settings."

    @transaction.atomic
    def handle(self, *args, **options):
        for code, name, desc, icon, color, route, category, order in EXTRA_MODULES:
            Module.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "description": desc,
                    "icon": icon,
                    "color": color,
                    "route_path": route,
                    "category": category,
                    "sort_order": order,
                    "is_active": True,
                },
            )

        # Global task statuses
        for code, name, color, order, terminal, default in DEFAULT_STATUSES:
            TaskStatus.objects.update_or_create(
                organization=None,
                code=code,
                defaults={
                    "name": name,
                    "color": color,
                    "display_order": order,
                    "is_terminal": terminal,
                    "is_default": default,
                    "show_in_filter": True,
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"  Task statuses: {TaskStatus.objects.filter(organization__isnull=True).count()}"))

        # Menus from modules (global)
        order = 10
        for mod in Module.objects.filter(is_active=True).order_by("sort_order"):
            MenuItem.objects.update_or_create(
                organization=None,
                code=f"menu_{mod.code}",
                defaults={
                    "module": mod,
                    "name": mod.name,
                    "icon": mod.icon,
                    "route": mod.route_path,
                    "display_order": order,
                    "is_visible": True,
                    "permission_code": f"{mod.code}.view",
                    "required_action": "view",
                    "parent": None,
                },
            )
            order += 10
        self.stdout.write(self.style.SUCCESS(f"  Menu items: {MenuItem.objects.filter(organization__isnull=True).count()}"))

        # Default settings (global)
        defaults = {
            "theme": {"mode": "system", "primary": "#F25C05"},
            "currency": {"code": "NPR", "symbol": "Rs."},
            "timezone": {"name": "Asia/Kathmandu"},
            "working_hours": {"start": "09:00", "end": "18:00", "days": [1, 2, 3, 4, 5]},
            "branding": {"app_name": "Sunyazon BEOS", "logo": "", "favicon": ""},
            "smtp": {"host": "", "port": 587, "user": "", "use_tls": True, "from_email": ""},
            "sms": {"provider": "", "api_key": "", "sender_id": ""},
        }
        for key, value in defaults.items():
            AppSetting.objects.update_or_create(
                organization=None,
                key=key,
                defaults={"value_json": value, "category": key if key in ("smtp", "sms", "theme", "branding") else "general", "is_secret": key in ("smtp", "sms")},
            )
        self.stdout.write(self.style.SUCCESS(f"  Settings keys: {AppSetting.objects.filter(organization__isnull=True).count()}"))

        # Default approval workflow
        WorkflowDefinition.objects.update_or_create(
            code="task_approval",
            version=1,
            defaults={
                "name": "Task Multi-Level Approval",
                "trigger_event": "task.submit_approval",
                "steps_json": [
                    {"name": "supervisor", "level": 1, "role": "Supervisor"},
                    {"name": "manager", "level": 2, "role": "Manager"},
                    {"name": "director", "level": 3, "role": "Director"},
                ],
                "sla_config": {"hours_per_level": 24},
                "status": WorkflowDefinition.Status.PUBLISHED,
            },
        )

        # Org-scoped roles for each active organization
        modules = list(Module.objects.filter(is_active=True))
        for org in Organization.objects.filter(is_active=True):
            for role_name in SYSTEM_ROLES:
                role, _ = Role.objects.get_or_create(
                    organization=org,
                    name=role_name,
                    defaults={
                        "kind": Role.Kind.ADMIN if role_name in ("Super Admin", "Admin") else Role.Kind.STAFF,
                        "is_system": True,
                        "permissions_json": {"*": True} if role_name in ("Super Admin", "Admin") else {},
                    },
                )
                if role_name in ("Super Admin", "Admin"):
                    for mod in modules:
                        perm, created = RoleModulePermission.objects.get_or_create(
                            role=role,
                            module=mod,
                            defaults={"access_level": "F"},
                        )
                        if created or not any(perm.actions_payload().values()):
                            perm.access_level = "F"
                            perm.sync_from_access_level()
                            perm.save()
                elif role_name == "Employee":
                    for code in ("dashboard", "tasks", "notifications", "settings"):
                        mod = Module.objects.filter(code=code).first()
                        if not mod:
                            continue
                        perm, _ = RoleModulePermission.objects.get_or_create(
                            role=role, module=mod, defaults={"access_level": "R"}
                        )
                        perm.access_level = "R"
                        perm.sync_from_access_level()
                        # Employees can create/edit own tasks
                        if code == "tasks":
                            perm.can_create = True
                            perm.can_edit = True
                        perm.save()
                else:
                    # Department-named roles get matching module full access + dashboard/tasks
                    code_map = {
                        "HR": "hr",
                        "Finance": "finance",
                        "Production": "production",
                        "Inventory": "inventory",
                        "Sales": "sales",
                        "Purchase": "procurement",
                        "Staff": None,
                    }
                    target = code_map.get(role_name)
                    codes = ["dashboard", "tasks", "notifications"]
                    if target:
                        codes.append(target)
                    if role_name == "Staff":
                        codes = [m.code for m in modules if m.category == "workspace"]
                    for code in codes:
                        mod = Module.objects.filter(code=code).first()
                        if not mod:
                            continue
                        perm, _ = RoleModulePermission.objects.get_or_create(
                            role=role, module=mod, defaults={"access_level": "F"}
                        )
                        perm.access_level = "F"
                        perm.sync_from_access_level()
                        perm.save()

            # Org copy of statuses
            for code, name, color, order, terminal, default in DEFAULT_STATUSES:
                TaskStatus.objects.update_or_create(
                    organization=org,
                    code=code,
                    defaults={
                        "name": name,
                        "color": color,
                        "display_order": order,
                        "is_terminal": terminal,
                        "is_default": default,
                        "show_in_filter": True,
                        "is_active": True,
                    },
                )

        self.stdout.write(self.style.SUCCESS("  Enterprise seed complete."))
