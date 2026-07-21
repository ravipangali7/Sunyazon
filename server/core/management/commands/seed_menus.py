"""Seed the database-driven navigation tree (MenuItem).

Creates one root MenuItem per active Module plus child MenuItems for every
department section (models.md §15–22), so sidebars render from /menus/
instead of hardcoded frontend lists.

Usage:
    python manage.py seed_menus
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import MenuItem, Module

# module_code -> [(section_code, name, lucide_icon, route)]
# Routes may carry a #hash for in-page sections; the frontend splits on "#".
DEPARTMENT_MENUS: dict[str, list[tuple[str, str, str, str]]] = {
    "hr": [
        ("overview", "Overview", "LayoutDashboard", "/hr"),
        ("positions", "Positions", "Briefcase", "/hr#positions"),
        ("employees", "Employees", "Users", "/hr#employees"),
        ("vacancies", "Vacancies", "UserPlus", "/hr#vacancies"),
        ("applicants", "Applicants", "ClipboardList", "/hr#applicants"),
        ("onboarding", "Onboarding", "ListChecks", "/hr#onboarding"),
        ("training", "Training", "GraduationCap", "/hr#training"),
        ("attendance", "Attendance", "CalendarCheck", "/hr#attendance"),
        ("leave", "Leave", "CalendarOff", "/hr#leave"),
        ("payroll", "Payroll", "Wallet", "/hr#payroll"),
    ],
    "finance": [
        ("overview", "Overview", "LayoutDashboard", "/finance"),
        ("coa", "Chart of Accounts", "BookOpen", "/finance#coa"),
        ("vouchers", "Journal Vouchers", "FileText", "/finance#vouchers"),
        ("cashbank", "Cash & Bank", "Banknote", "/finance#cashbank"),
        ("daybook", "Day Book", "Receipt", "/finance#daybook"),
        ("ledger", "Ledger", "ScrollText", "/finance#ledger"),
        ("purchase", "Purchase Docs", "ShoppingCart", "/finance#purchase"),
        ("sales-docs", "Sales Docs", "TrendingUp", "/finance#sales-docs"),
        ("payments", "Payments / Receipts", "CreditCard", "/finance#payments"),
        ("notes", "Debit / Credit Notes", "FileText", "/finance#notes"),
        ("income", "Income & Expenses", "TrendingDown", "/finance#income"),
        ("pnl", "Profit & Loss", "PieChart", "/finance#pnl"),
        ("tax", "Tax & Audit", "Landmark", "/finance#tax"),
        ("cheques", "Issue Cheques", "Receipt", "/finance#cheques"),
    ],
    "sales": [
        ("overview", "Overview", "LayoutDashboard", "/sales"),
        ("parties", "Parties", "Handshake", "/sales#parties"),
        ("territories", "Territories", "MapPin", "/sales#territories"),
        ("asm", "ASM Orders", "TrendingUp", "/sales#asm"),
        ("dealer", "Dealer Orders", "Store", "/sales#dealer"),
        ("retail", "Retail Orders", "Tags", "/sales#retail"),
        ("returns", "Returns", "ArrowLeftRight", "/sales#returns"),
        ("schemes", "Promotion Schemes", "Sparkles", "/sales#schemes"),
    ],
    "logistics": [
        ("overview", "Overview", "LayoutDashboard", "/logistics"),
        ("vehicles", "Vehicles", "Car", "/logistics#vehicles"),
        ("routes", "Routes", "Route", "/logistics#routes"),
        ("dispatch", "Dispatch", "Truck", "/logistics#dispatch"),
        ("pod", "Proof of Delivery", "ClipboardCheck", "/logistics#pod"),
    ],
    "production": [
        ("overview", "Overview", "LayoutDashboard", "/production"),
        ("bom", "BOM & Recipes", "Beaker", "/production#bom"),
        ("batches", "Batches", "Package", "/production#batches"),
        ("workorders", "Work Orders", "Factory", "/production#workorders"),
        ("runs", "Process Runs", "GitBranch", "/process"),
        ("wip", "WIP Tracking", "Cog", "/production#wip"),
        ("costing", "Production Costing", "PieChart", "/production#costing"),
        ("damage", "Damage / Expire", "AlertTriangle", "/production#damage"),
        ("reports", "Working Reports", "FileText", "/production#reports"),
    ],
    "process": [
        ("overview", "Overview", "LayoutDashboard", "/process"),
        ("templates", "Industry Templates", "BookOpen", "/process#templates"),
        ("definitions", "Process Definitions", "GitBranch", "/process#definitions"),
        ("stages", "Stages & Fields", "ListChecks", "/process#stages"),
        ("workorders", "Work Orders", "Factory", "/production"),
        ("runs", "Process Runs", "Cog", "/process#runs"),
    ],
    "inventory": [
        ("overview", "Overview", "LayoutDashboard", "/inventory"),
        ("warehouses", "Warehouses", "Warehouse", "/inventory#warehouses"),
        ("items", "Item Master", "Package", "/inventory#items"),
        ("stock", "Stock Ledger", "Boxes", "/inventory#stock"),
        ("grn", "Goods Receipt (GRN)", "ClipboardCheck", "/inventory#grn"),
        ("adjust", "Stock Adjustments", "ArrowLeftRight", "/inventory#adjust"),
        ("issues", "Material Issues", "Package", "/inventory#issues"),
    ],
    "stores": [
        ("overview", "Overview", "LayoutDashboard", "/stores"),
        ("issues", "Material Issues", "Package", "/stores#issues"),
        ("grn", "Goods Receipt", "ClipboardCheck", "/stores#grn"),
        ("stock", "Stock Levels", "Boxes", "/stores#stock"),
        ("movements", "Stock Movements", "ArrowLeftRight", "/stores#movements"),
    ],
    "procurement": [
        ("overview", "Overview", "LayoutDashboard", "/procurement"),
        ("vendors", "Vendors", "Handshake", "/procurement#vendors"),
        ("pr", "Purchase Requisitions", "ClipboardList", "/procurement#pr"),
        ("rfq", "RFQ / Quotations", "FileText", "/procurement#rfq"),
        ("po", "Purchase Orders", "ShoppingCart", "/procurement#po"),
        ("grn", "Goods Receipt", "ClipboardCheck", "/procurement#grn"),
    ],
    "quality": [
        ("overview", "Overview", "LayoutDashboard", "/quality"),
        ("incoming", "Incoming Inspection", "ClipboardCheck", "/quality#incoming"),
        ("processqc", "In-Process QC", "Cog", "/quality#processqc"),
        ("release", "Final QA Release", "ShieldCheck", "/quality#release"),
        ("lab", "Lab Reports", "FlaskConical", "/quality#lab"),
        ("ncr", "NCR", "AlertTriangle", "/quality#ncr"),
        ("capa", "CAPA", "ListChecks", "/quality#capa"),
        ("masters", "Quality Masters", "BookOpen", "/quality#masters"),
    ],
    "crm": [
        ("overview", "Overview", "LayoutDashboard", "/crm"),
        ("pipeline", "Sales Pipeline", "TrendingUp", "/crm#pipeline"),
        ("complaints", "Complaints", "AlertTriangle", "/crm#complaints"),
        ("activities", "Customer Activities", "CalendarCheck", "/crm#activities"),
    ],
    "maintenance": [
        ("overview", "Overview", "LayoutDashboard", "/maintenance"),
        ("equipment", "Equipment", "Cog", "/maintenance#equipment"),
        ("pm", "PM Schedules", "CalendarCheck", "/maintenance#pm"),
        ("workorders", "Work Orders", "Wrench", "/maintenance#workorders"),
        ("calibration", "Calibration", "ClipboardCheck", "/maintenance#calibration"),
    ],
    "rnd": [
        ("overview", "Overview", "LayoutDashboard", "/rnd"),
        ("projects", "Projects", "Sparkles", "/rnd#projects"),
        ("trials", "Trial Batches", "Beaker", "/rnd#trials"),
        ("definitions", "Process Definitions", "GitBranch", "/rnd#definitions"),
    ],
    "it": [
        ("overview", "Overview", "LayoutDashboard", "/it"),
        ("helpdesk", "Helpdesk", "MessageCircle", "/it#helpdesk"),
        ("access", "Access & Sessions", "KeyRound", "/it#access"),
    ],
    "governance": [
        ("overview", "Overview", "LayoutDashboard", "/governance"),
        ("board", "Board Portal", "Landmark", "/governance#board"),
        ("doa", "Delegation of Authority", "ShieldCheck", "/governance#doa"),
        ("meetings", "Meetings", "Users", "/governance#meetings"),
    ],
    "admin": [
        ("overview", "Overview", "LayoutDashboard", "/admin"),
        ("users", "Users & Roles", "Users", "/admin#users"),
        ("modules", "Modules", "Boxes", "/admin#modules"),
        ("org", "Organization", "Landmark", "/settings"),
        ("audit", "Audit Log", "ScrollText", "/audit"),
    ],
    "audit": [
        ("overview", "Overview", "LayoutDashboard", "/audit"),
        ("trail", "Change Trail", "ScrollText", "/audit#trail"),
        ("admin", "Admin & RBAC", "ShieldCheck", "/admin"),
    ],
    "copilot": [
        ("overview", "Ask BEOS", "Sparkles", "/copilot"),
        ("insights", "AI Insights", "PieChart", "/copilot#insights"),
    ],
    "feed": [
        ("overview", "Overview", "LayoutDashboard", "/feed"),
        ("posts", "Posts", "Newspaper", "/feed#posts"),
        ("stories", "Stories", "Video", "/feed#stories"),
    ],
    "commerce": [
        ("overview", "Overview", "LayoutDashboard", "/commerce"),
        ("products", "Products", "Package", "/commerce#products"),
        ("orders", "Orders", "ShoppingCart", "/commerce#orders"),
        ("catalog", "Catalog", "Tags", "/commerce#catalog"),
    ],
    "media": [
        ("overview", "Overview", "LayoutDashboard", "/media"),
        ("assets", "Media Assets", "Video", "/media#assets"),
        ("live", "Live Streams", "Video", "/media#live"),
        ("playlists", "Playlists", "ListChecks", "/media#playlists"),
    ],
    "payments": [
        ("overview", "Overview", "LayoutDashboard", "/payments"),
        ("txns", "Transactions", "CreditCard", "/payments#txns"),
        ("ads", "Ad Campaigns", "Sparkles", "/payments#ads"),
    ],
    "chat": [
        ("overview", "Threads", "MessageCircle", "/chat"),
        ("calls", "Calls", "Video", "/chat#calls"),
        ("help", "Help Tickets", "AlertTriangle", "/chat#help"),
    ],
    "customer": [
        ("overview", "Overview", "LayoutDashboard", "/customer"),
        ("profile", "My Profile", "UserCircle", "/customer#profile"),
        ("orders", "My Orders", "ShoppingCart", "/commerce"),
        ("nearest", "Nearest Shops", "MapPin", "/customer#nearest"),
    ],
    "docs": [
        ("overview", "Overview", "LayoutDashboard", "/docs"),
        ("templates", "Templates", "FileText", "/docs#templates"),
        ("library", "Document Library", "BookOpen", "/docs#library"),
    ],
    "tasks": [
        ("overview", "Task Queue", "ListChecks", "/tasks"),
        ("approvals", "Approvals", "ShieldCheck", "/tasks#approvals"),
        ("mission", "Today's Mission", "LayoutDashboard", "/"),
        ("alerts", "Alerts", "AlertTriangle", "/notifications"),
    ],
}


class Command(BaseCommand):
    help = "Seed global MenuItem tree: module roots + department section children."

    @transaction.atomic
    def handle(self, *args, **options):
        order = 10
        roots = 0
        children = 0
        for mod in Module.objects.filter(is_active=True).order_by("sort_order"):
            root, _ = MenuItem.objects.update_or_create(
                organization=None,
                code=f"menu_{mod.code}",
                defaults={
                    "module": mod,
                    "name": mod.name,
                    "icon": mod.icon,
                    "route": mod.route_path,
                    "display_order": order,
                    "is_visible": True,
                    "required_action": "view",
                    "parent": None,
                },
            )
            roots += 1
            order += 10

            sections = DEPARTMENT_MENUS.get(mod.code) or []
            child_order = 10
            for section_code, name, icon, route in sections:
                MenuItem.objects.update_or_create(
                    organization=None,
                    code=f"menu_{mod.code}_{section_code}",
                    defaults={
                        "module": mod,
                        "name": name,
                        "icon": icon,
                        "route": route,
                        "display_order": child_order,
                        "is_visible": True,
                        "required_action": "view",
                        "parent": root,
                    },
                )
                children += 1
                child_order += 10

        self.stdout.write(
            self.style.SUCCESS(
                f"Menu tree seeded: {roots} module roots, {children} department items."
            )
        )
