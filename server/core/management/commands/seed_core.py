"""Seed core platform reference data — tenant, channels, payment, industry templates, COA.

Usage:
    python manage.py seed_core
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    AdPlan,
    BusinessObject,
    IndustryTemplate,
    PaymentGateway,
    PlatformChannel,
    Tenant,
)


INDUSTRY_TEMPLATES = [
    {
        "code": "fmcg_food",
        "name": "FMCG / Food",
        "description": "Process → Refine → Mix → Package",
        "default_capabilities": ["process_engine", "bom", "batch", "warehouse", "qc"],
        "default_stages_json": [
            {"code": "process", "name": "Process", "stage_type": "transform", "sort_order": 1},
            {"code": "refine", "name": "Refine", "stage_type": "transform", "sort_order": 2},
            {"code": "mix", "name": "Mixing", "stage_type": "assemble", "sort_order": 3},
            {"code": "package", "name": "Packaging", "stage_type": "package", "sort_order": 4},
        ],
    },
    {
        "code": "chocolate",
        "name": "Chocolate",
        "description": "Roast → Conche → Temper → Mold → Pack",
        "default_capabilities": ["process_engine", "bom", "batch", "warehouse", "qc", "recipe"],
        "default_stages_json": [
            {"code": "roast", "name": "Roast", "stage_type": "transform", "sort_order": 1},
            {"code": "conche", "name": "Conche", "stage_type": "transform", "sort_order": 2},
            {"code": "temper", "name": "Temper", "stage_type": "transform", "sort_order": 3},
            {"code": "mold", "name": "Mold", "stage_type": "assemble", "sort_order": 4},
            {"code": "pack", "name": "Pack", "stage_type": "package", "sort_order": 5},
        ],
    },
    {
        "code": "software",
        "name": "Software Delivery",
        "description": "Backlog → Design → Development → QA → Release",
        "default_capabilities": ["process_engine"],
        "default_stages_json": [
            {"code": "backlog", "name": "Backlog", "stage_type": "custom", "sort_order": 1},
            {"code": "design", "name": "Design", "stage_type": "custom", "sort_order": 2},
            {"code": "development", "name": "Development", "stage_type": "transform", "sort_order": 3},
            {"code": "qa", "name": "QA", "stage_type": "inspect", "sort_order": 4},
            {"code": "release", "name": "Release", "stage_type": "deliver", "sort_order": 5},
        ],
    },
    {
        "code": "construction",
        "name": "Construction",
        "description": "Excavation → Foundation → Structure → MEP → Finishing → Handover",
        "default_capabilities": ["process_engine", "warehouse", "qc"],
        "default_stages_json": [
            {"code": "excavation", "name": "Excavation", "stage_type": "transform", "sort_order": 1},
            {"code": "foundation", "name": "Foundation", "stage_type": "assemble", "sort_order": 2},
            {"code": "structure", "name": "Structure", "stage_type": "assemble", "sort_order": 3},
            {"code": "mep", "name": "MEP", "stage_type": "assemble", "sort_order": 4},
            {"code": "finishing", "name": "Finishing", "stage_type": "transform", "sort_order": 5},
            {"code": "handover", "name": "Handover", "stage_type": "deliver", "sort_order": 6},
        ],
    },
    {
        "code": "marketing",
        "name": "Marketing Production",
        "description": "Brief → Concept → Creative → Approval → Publish → Report",
        "default_capabilities": ["process_engine"],
        "default_stages_json": [
            {"code": "brief", "name": "Brief", "stage_type": "custom", "sort_order": 1},
            {"code": "concept", "name": "Concept", "stage_type": "custom", "sort_order": 2},
            {"code": "creative", "name": "Creative", "stage_type": "transform", "sort_order": 3},
            {"code": "approval", "name": "Approval", "stage_type": "approve", "sort_order": 4},
            {"code": "publish", "name": "Publish", "stage_type": "deliver", "sort_order": 5},
            {"code": "report", "name": "Report", "stage_type": "custom", "sort_order": 6},
        ],
    },
    {
        "code": "generic",
        "name": "Generic Process",
        "description": "Blank starter — Stage 1 → Stage 2",
        "default_capabilities": ["process_engine"],
        "default_stages_json": [
            {"code": "stage_1", "name": "Stage 1", "stage_type": "custom", "sort_order": 1},
            {"code": "stage_2", "name": "Stage 2", "stage_type": "custom", "sort_order": 2},
        ],
    },
]

CHANNELS = [
    ("feed", "Sunyazon Feed", "social_media"),
    ("live", "Live Market", "media"),
    ("jobs", "Jobs & Careers", "business"),
    ("news", "Official News", "official"),
    ("gaming", "Games Hub", "gaming"),
]

GATEWAYS = [
    ("esewa", "eSewa"),
    ("khalti", "Khalti"),
    ("bank", "Bank Transfer"),
    ("cash", "Cash on Delivery"),
]

AD_PLANS = [
    ("basic", "Basic Ad Plan", 1500, 7, 10000),
    ("super", "Super Ad Plan", 5000, 30, 100000),
    ("premium", "Premium Ad Plan", 15000, 90, 500000),
]

BUSINESS_OBJECTS = [
    ("PRODUCT", "Product", "commerce", "product"),
    ("SALES_ORDER", "Sales Order", "finance", "sales_order"),
    ("WORK_ORDER", "Work Order", "production", "work_order"),
    ("PURCHASE_ORDER", "Purchase Order", "finance", "purchase_order"),
    ("EMPLOYEE", "Employee", "hr", "employee"),
]


class Command(BaseCommand):
    help = "Seed core platform masters (tenant, channels, gateways, industry templates, ads)."

    @transaction.atomic
    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.update_or_create(
            slug="sunyazon",
            defaults={
                "name": "Sunyazon Platform",
                "status": Tenant.Status.ACTIVE,
                "settings_json": {
                    "default_currency": "NPR",
                    "timezone": "Asia/Kathmandu",
                    "locale": "ne-NP",
                },
            },
        )
        self.stdout.write(f"  Tenant: {tenant}")

        for code, name, category in CHANNELS:
            PlatformChannel.objects.update_or_create(
                code=code,
                defaults={"name": name, "category": category, "is_active": True},
            )
        self.stdout.write(f"  Channels: {len(CHANNELS)}")

        for code, name in GATEWAYS:
            PaymentGateway.objects.update_or_create(
                code=code,
                defaults={"name": name, "is_active": True, "config_json": {}},
            )
        self.stdout.write(f"  Gateways: {len(GATEWAYS)}")

        for code, name, price, days, impressions in AD_PLANS:
            AdPlan.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "price": price,
                    "duration_days": days,
                    "impressions_limit": impressions,
                    "is_active": True,
                    "features_json": {"tier": code},
                },
            )
        self.stdout.write(f"  Ad plans: {len(AD_PLANS)}")

        for tpl in INDUSTRY_TEMPLATES:
            IndustryTemplate.objects.update_or_create(
                code=tpl["code"],
                defaults={
                    "name": tpl["name"],
                    "description": tpl["description"],
                    "default_capabilities": tpl["default_capabilities"],
                    "default_stages_json": tpl["default_stages_json"],
                    "default_fields_json": {},
                    "is_system": True,
                    "is_active": True,
                },
            )
        self.stdout.write(f"  Industry templates: {len(INDUSTRY_TEMPLATES)}")

        for code, name, schema, table in BUSINESS_OBJECTS:
            BusinessObject.objects.update_or_create(
                object_code=code,
                defaults={
                    "name": name,
                    "schema_name": schema,
                    "table_name": table,
                    "lifecycle_states": [
                        "draft", "validated", "approved", "active",
                        "suspended", "archived", "disposed",
                    ],
                    "version": 1,
                },
            )
        self.stdout.write(f"  Business objects: {len(BUSINESS_OBJECTS)}")

        self.stdout.write(self.style.SUCCESS("Core platform seed complete."))
