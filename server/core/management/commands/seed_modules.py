"""Seed Module registry and demo users for portal / launcher testing.

Usage:
    python manage.py seed_modules
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    Module,
    Organization,
    OrgUser,
    Role,
    RoleModulePermission,
    User,
    UserProfile,
)

DEFAULT_MODULES = [
    # Workspace
    ("dashboard", "Dashboard", "My Work Center", "LayoutDashboard", "#F25C05", "/", "workspace", 10),
    ("tasks", "Tasks", "Work queue and missions", "ListChecks", "#FF6F1F", "/tasks", "workspace", 20),
    ("hr", "HR", "People, attendance, payroll", "Users", "#0EA5E9", "/hr", "workspace", 30),
    ("production", "Production", "Lines, batches, WO", "Factory", "#F59E0B", "/production", "workspace", 40),
    ("inventory", "Inventory", "Stock, warehouses, GRN", "Boxes", "#10B981", "/inventory", "workspace", 50),
    ("sales", "Sales", "Orders and targets", "TrendingUp", "#EF4444", "/sales", "workspace", 60),
    ("finance", "Finance", "Cash, vouchers, ledgers", "Wallet", "#8B5CF6", "/finance", "workspace", 70),
    ("procurement", "Procurement", "PR, RFQ, vendors", "ShoppingCart", "#EC4899", "/procurement", "workspace", 80),
    ("quality", "QA/QC", "Inspections and release", "ClipboardCheck", "#14B8A6", "/quality", "workspace", 90),
    ("crm", "CRM", "Pipeline and complaints", "Users", "#6366F1", "/crm", "workspace", 100),
    ("maintenance", "Maintenance", "Equipment and PM", "Wrench", "#64748B", "/maintenance", "workspace", 110),
    ("logistics", "Logistics", "Trips and POD", "Truck", "#F97316", "/logistics", "workspace", 120),
    ("stores", "Stores", "Material issue", "Package", "#84CC16", "/stores", "workspace", 130),
    ("rnd", "R&D", "Ideas and trials", "FlaskConical", "#A855F7", "/rnd", "workspace", 140),
    ("it", "IT & DT", "Assets and access", "Cpu", "#06B6D4", "/it", "workspace", 150),
    ("process", "Process Engine", "Universal process canvas", "GitBranch", "#F25C05", "/process", "workspace", 160),
    ("marketing", "Marketing", "Campaigns and brand", "Megaphone", "#E11D48", "/commerce", "workspace", 170),
    # Consumer
    ("feed", "Social Media", "Feed and community", "Newspaper", "#FF6F1F", "/feed", "consumer", 200),
    ("commerce", "E-commerce", "Shop and cart", "Store", "#F25C05", "/commerce", "consumer", 210),
    ("media", "Media & Live", "Live streams", "Video", "#DB2777", "/media", "consumer", 220),
    ("payments", "Payments", "Wallet and ads", "CreditCard", "#059669", "/payments", "consumer", 230),
    ("chat", "Chat", "Messages and help", "MessageCircle", "#2563EB", "/chat", "consumer", 240),
    ("customer", "Customer Portal", "Self-service home", "UserCircle", "#F25C05", "/customer", "consumer", 250),
    ("jobs", "Job Vacancies", "Browse and apply to open positions", "Briefcase", "#0EA5E9", "/jobs", "consumer", 260),
    # Admin
    ("governance", "Governance", "Board and DOA", "Landmark", "#475569", "/governance", "admin", 300),
    ("docs", "Documents", "Niyamawali, Prabandhapatra, SOPs", "FileText", "#64748B", "/docs", "admin", 305),
    ("admin", "Admin & RBAC", "Users and roles", "ShieldCheck", "#F25C05", "/admin", "admin", 310),
    ("audit", "Audit Log", "Change history", "ScrollText", "#64748B", "/audit", "admin", 320),
    ("copilot", "AI Copilot", "Ask BEOS", "Sparkles", "#F59E0B", "/copilot", "admin", 330),
]


class Command(BaseCommand):
    help = "Seed module catalog and demo phone-login users for portal routing."

    @transaction.atomic
    def handle(self, *args, **options):
        for code, name, desc, icon, color, route, category, order in DEFAULT_MODULES:
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
        self.stdout.write(self.style.SUCCESS(f"  Modules: {Module.objects.count()}"))

        # Super admin
        sa, created = User.objects.get_or_create(
            username="superadmin",
            defaults={
                "phone": "9800000001",
                "email": "superadmin@sunyazon.com",
                "account_type": User.AccountType.SUPER_ADMIN,
                "platform_role": User.PlatformRole.ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created or not sa.has_usable_password():
            sa.set_password("Admin@12345")
            sa.save()
        else:
            sa.phone = sa.phone or "9800000001"
            sa.account_type = User.AccountType.SUPER_ADMIN
            sa.platform_role = User.PlatformRole.ADMIN
            sa.save()
        UserProfile.objects.get_or_create(user=sa, defaults={"full_name": "Super Admin"})
        self.stdout.write("  Super Admin: phone 9800000001 / Admin@12345")

        # Consumer (role none)
        consumer, c_created = User.objects.get_or_create(
            username="consumer1",
            defaults={
                "phone": "9800000002",
                "email": "consumer@sunyazon.com",
                "account_type": User.AccountType.CONSUMER,
                "platform_role": User.PlatformRole.NONE,
            },
        )
        if c_created or not consumer.has_usable_password():
            consumer.set_password("Consumer@123")
            consumer.save()
        UserProfile.objects.get_or_create(user=consumer, defaults={"full_name": "Sita Consumer"})
        self.stdout.write("  Consumer: phone 9800000002 / Consumer@123 -> /customer")

        org = Organization.objects.filter(slug="sunyazon-foods").first()
        if not org:
            self.stdout.write(self.style.WARNING("  Org sunyazon-foods missing — run seed_demo for staff/admin users."))
            return

        # Update org account type to producer
        if org.account_type == Organization.AccountType.MANUFACTURE:
            org.account_type = Organization.AccountType.PRODUCER
            org.org_type = Organization.OrgType.PRODUCER
            org.enabled_capabilities = [
                "dashboard", "tasks", "hr", "production", "inventory", "sales",
                "finance", "procurement", "quality", "crm", "maintenance",
                "logistics", "stores", "process", "admin",
            ]
            org.save()

        admin_role, _ = Role.objects.update_or_create(
            organization=org,
            name="Primary Admin",
            defaults={
                "kind": Role.Kind.ADMIN,
                "permissions_json": {"*": True},
                "is_system": True,
            },
        )

        # Producer admin
        prod_admin, pa_created = User.objects.get_or_create(
            username="producer_admin",
            defaults={
                "phone": "9800000003",
                "email": "producer.admin@sunyazon.com",
                "account_type": User.AccountType.PRODUCER,
                "platform_role": User.PlatformRole.ADMIN,
            },
        )
        if pa_created or not prod_admin.has_usable_password():
            prod_admin.set_password("Producer@123")
            prod_admin.save()
        UserProfile.objects.get_or_create(user=prod_admin, defaults={"full_name": "Producer Admin"})
        OrgUser.objects.update_or_create(
            organization=org,
            user=prod_admin,
            defaults={
                "role": admin_role,
                "role_kind": OrgUser.RoleKind.ADMIN,
                "username": "producer_admin",
                "designation": "Plant Admin",
                "is_primary_admin": True,
            },
        )
        self.stdout.write("  Producer Admin: 9800000003 / Producer@123 -> /portal/producer")

        # Staff with multiple modules (inventory + finance)
        staff_multi_role, _ = Role.objects.update_or_create(
            organization=org,
            name="Finance & Stores Staff",
            defaults={
                "kind": Role.Kind.STAFF,
                "permissions_json": {"inventory": "F", "finance": "F", "stores": "R"},
                "is_system": False,
            },
        )
        for code in ("inventory", "finance", "stores"):
            mod = Module.objects.filter(code=code).first()
            if mod:
                RoleModulePermission.objects.update_or_create(
                    role=staff_multi_role,
                    module=mod,
                    defaults={"access_level": "R" if code == "stores" else "F"},
                )

        staff_multi, sm_created = User.objects.get_or_create(
            username="staff_multi",
            defaults={
                "phone": "9800000004",
                "email": "staff.multi@sunyazon.com",
                "account_type": User.AccountType.PRODUCER,
                "platform_role": User.PlatformRole.STAFF,
            },
        )
        if sm_created or not staff_multi.has_usable_password():
            staff_multi.set_password("Staff@123")
            staff_multi.save()
        UserProfile.objects.get_or_create(user=staff_multi, defaults={"full_name": "Multi Module Staff"})
        OrgUser.objects.update_or_create(
            organization=org,
            user=staff_multi,
            defaults={
                "role": staff_multi_role,
                "role_kind": OrgUser.RoleKind.STAFF,
                "username": "staff_multi",
                "designation": "Accounts Officer",
                "is_primary_admin": False,
            },
        )
        self.stdout.write("  Staff (multi): 9800000004 / Staff@123 -> /apps (grid)")

        # Staff with single module (inventory only)
        staff_one_role, _ = Role.objects.update_or_create(
            organization=org,
            name="Inventory Only",
            defaults={
                "kind": Role.Kind.STAFF,
                "permissions_json": {"inventory": "F"},
                "is_system": False,
            },
        )
        inv = Module.objects.filter(code="inventory").first()
        if inv:
            RoleModulePermission.objects.update_or_create(
                role=staff_one_role,
                module=inv,
                defaults={"access_level": "F"},
            )

        staff_one, so_created = User.objects.get_or_create(
            username="staff_inventory",
            defaults={
                "phone": "9800000005",
                "email": "staff.inv@sunyazon.com",
                "account_type": User.AccountType.PRODUCER,
                "platform_role": User.PlatformRole.STAFF,
            },
        )
        if so_created or not staff_one.has_usable_password():
            staff_one.set_password("Staff@123")
            staff_one.save()
        UserProfile.objects.get_or_create(user=staff_one, defaults={"full_name": "Inventory Staff"})
        OrgUser.objects.update_or_create(
            organization=org,
            user=staff_one,
            defaults={
                "role": staff_one_role,
                "role_kind": OrgUser.RoleKind.STAFF,
                "username": "staff_inventory",
                "designation": "Store Keeper",
                "is_primary_admin": False,
            },
        )
        self.stdout.write("  Staff (single): 9800000005 / Staff@123 -> /inventory")

        # Leadership hierarchy + governance document templates
        from core.models import DocumentTemplate
        from core.services.company_registration_service import ensure_leadership_role_definitions

        ensure_leadership_role_definitions()
        for doc_type, name, content in [
            (
                "niyamawali",
                "Standard Niyamawali Template",
                "<h2>Niyamawali — {{company_name}}</h2>"
                "<p>These regulations govern the internal affairs of {{company_name}} (PAN: {{pan}}).</p>"
                "<h3>1. Name and Registered Office</h3><p>…</p>"
                "<h3>2. Share Capital</h3><p>…</p>"
                "<h3>3. Board and Leadership</h3>"
                "<p>The company shall have a CEO/MD, Executive Team (CFO, CMO, COO, CTO), and an HR department.</p>"
                "<h3>4. Meetings</h3><p>…</p>",
            ),
            (
                "prabandhapatra",
                "Standard Prabandhapatra Template",
                "<h2>Prabandhapatra (Memorandum & Articles) — {{company_name}}</h2>"
                "<p>This memorandum sets out the objects and articles of {{company_name}} (PAN: {{pan}}).</p>"
                "<h3>1. Objects of the Company</h3><p>…</p>"
                "<h3>2. Liability of Members</h3><p>…</p>"
                "<h3>3. Capital Structure</h3><p>…</p>"
                "<h3>4. Leadership Structure</h3>"
                "<p>CEO/MD → Executive Team (CFO, CMO, COO, CTO) · Separate HR & Recruitment department.</p>",
            ),
        ]:
            DocumentTemplate.objects.update_or_create(
                name=name,
                defaults={
                    "doc_type": doc_type,
                    "template_content": content,
                    "is_system_template": True,
                    "organization": None,
                },
            )
        self.stdout.write("  Leadership roles + Niyamawali/Prabandhapatra templates seeded")
