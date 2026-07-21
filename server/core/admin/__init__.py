"""Sunyazon admin package — advanced Jazzmin UI with image columns & inlines.

Hand-crafted ModelAdmins live in sibling modules. Any remaining concrete
models are auto-registered with SmartModelAdmin so every table gets
advanced columns (image thumbs, choice badges, filters, search).
"""

from __future__ import annotations

from django.apps import apps
from django.contrib import admin

from .base import SmartModelAdmin

# Import hand-crafted admins (side-effect: @admin.register)
from . import (  # noqa: F401
    commerce_admin,
    domain_admin,
    finance_admin,
    hr_admin,
    identity_admin,
    organization_admin,
    platform_social_admin,
    production_admin,
)


def _register_remaining():
    registered = set(admin.site._registry.keys())
    for model in apps.get_app_config("core").get_models():
        if model in registered or model._meta.abstract or model._meta.proxy:
            continue
        # Skip Django's own auth models if they somehow appear
        if model._meta.app_label != "core":
            continue
        admin.site.register(model, SmartModelAdmin)


_register_remaining()
