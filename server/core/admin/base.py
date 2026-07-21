"""Shared admin helpers — image thumbnails, colored badges, smart auto-config admin."""

from __future__ import annotations

from django.contrib import admin
from django.db import models as djm
from django.utils.html import format_html

# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

_COLOR_MAP = {
    # positive
    "active": "#198754", "approved": "#198754", "published": "#198754",
    "completed": "#198754", "paid": "#198754", "delivered": "#198754",
    "success": "#198754", "verified": "#198754", "posted": "#198754",
    "released": "#198754", "hired": "#198754", "present": "#198754",
    "pass": "#198754", "cleared": "#198754", "won": "#198754",
    "resolved": "#198754", "accepted": "#198754", "closed": "#495057",
    "green": "#198754", "signed": "#198754", "ready": "#198754",
    # in progress / neutral
    "in_progress": "#0d6efd", "processing": "#0d6efd", "running": "#0d6efd",
    "shipped": "#0d6efd", "dispatched": "#0d6efd", "in_transit": "#0d6efd",
    "live": "#0d6efd", "confirmed": "#0d6efd", "packed": "#0d6efd",
    "assigned": "#0d6efd", "loaded": "#0d6efd", "issued": "#0d6efd",
    "processed": "#0d6efd", "filed": "#0d6efd", "interviewed": "#0d6efd",
    "investigating": "#0d6efd", "sent": "#0d6efd", "submitted": "#0d6efd",
    # waiting
    "pending": "#fd7e14", "draft": "#6c757d", "scheduled": "#6f42c1",
    "on_hold": "#fd7e14", "hold": "#fd7e14", "waitlist": "#fd7e14",
    "requested": "#fd7e14", "placed": "#fd7e14", "open": "#fd7e14",
    "planned": "#6f42c1", "ringing": "#fd7e14", "partial": "#fd7e14",
    "unpaid": "#fd7e14", "shortlisted": "#fd7e14", "applied": "#6c757d",
    "yellow": "#fd7e14", "uploading": "#6c757d", "quarantined": "#fd7e14",
    "on_leave": "#fd7e14", "half_day": "#fd7e14", "invited": "#6c757d",
    # negative
    "rejected": "#dc3545", "failed": "#dc3545", "cancelled": "#dc3545",
    "suspended": "#dc3545", "archived": "#6c757d", "blocked": "#dc3545",
    "returned": "#dc3545", "refunded": "#6f42c1", "missed": "#dc3545",
    "fail": "#dc3545", "bounced": "#dc3545", "lost": "#dc3545",
    "absent": "#dc3545", "expired": "#dc3545", "aborted": "#dc3545",
    "obsolete": "#6c757d", "exited": "#6c757d", "inactive": "#6c757d",
    "blacklisted": "#dc3545", "red": "#dc3545", "skipped": "#6c757d",
    "breakdown": "#dc3545", "critical": "#dc3545", "high": "#fd7e14",
    "medium": "#0d6efd", "low": "#6c757d", "ended": "#495057",
}


def badge(text, color="#6c757d"):
    """Render a rounded colored pill."""
    return format_html(
        '<span style="display:inline-block;padding:2px 10px;border-radius:12px;'
        'background:{}1a;color:{};border:1px solid {}55;font-size:11px;'
        'font-weight:600;white-space:nowrap;">{}</span>',
        color, color, color, text,
    )


def choice_badge(obj, field_name):
    """Badge for a choices field, colored by value keyword."""
    value = getattr(obj, field_name, None)
    if value in (None, ""):
        return format_html('<span style="color:#adb5bd;">—</span>')
    display = getattr(obj, f"get_{field_name}_display", lambda: value)()
    return badge(display, _COLOR_MAP.get(str(value), "#6c757d"))


def bool_badge(value, true_label="Yes", false_label="No"):
    return badge(true_label, "#198754") if value else badge(false_label, "#dc3545")


def image_thumb(file_field, size=38, rounded=False):
    """Inline thumbnail for an Image/FileField; dash placeholder when empty."""
    if not file_field:
        return format_html(
            '<span style="display:inline-flex;width:{}px;height:{}px;align-items:center;'
            'justify-content:center;background:#f1f3f5;border:1px dashed #ced4da;'
            'border-radius:{};color:#adb5bd;font-size:10px;">n/a</span>',
            size, size, "50%" if rounded else "6px",
        )
    try:
        url = file_field.url
    except ValueError:
        return format_html('<span style="color:#adb5bd;">—</span>')
    return format_html(
        '<a href="{}" target="_blank"><img src="{}" style="width:{}px;height:{}px;'
        'object-fit:cover;border-radius:{};border:1px solid #dee2e6;'
        'box-shadow:0 1px 2px rgba(0,0,0,.12);" loading="lazy"/></a>',
        url, url, size, size, "50%" if rounded else "6px",
    )


def money(value, currency="Rs"):
    if value is None:
        return format_html('<span style="color:#adb5bd;">—</span>')
    return format_html(
        '<span style="font-family:monospace;font-weight:600;">{}&nbsp;{:,.2f}</span>',
        currency, value,
    )


def progress_bar(pct, color="#0d6efd"):
    pct = max(0, min(100, float(pct or 0)))
    return format_html(
        '<div style="width:90px;background:#e9ecef;border-radius:6px;overflow:hidden;">'
        '<div style="width:{}%;background:{};height:12px;"></div></div>'
        '<small style="color:#6c757d;">{:.0f}%</small>',
        pct, color, pct,
    )


# ---------------------------------------------------------------------------
# Base admin classes
# ---------------------------------------------------------------------------

class BaseAdmin(admin.ModelAdmin):
    list_per_page = 25
    save_on_top = True
    empty_value_display = "—"


_SEARCHABLE_NAMES = (
    "name", "title", "code", "slug", "full_name", "company_name", "username",
    "email", "phone", "subject", "sku", "barcode",
)
_NO_SUFFIXES = ("_no", "_code", "_key")


class SmartModelAdmin(BaseAdmin):
    """Auto-configures rich columns, filters, search, and date drill-down
    from the model's fields. Used as fallback for models without a
    hand-crafted admin, so every table gets advanced columns."""

    MAX_COLUMNS = 8
    MAX_FILTERS = 5
    # Class-level defaults so admin.E040 (autocomplete) system checks pass
    # before instance __init__ customizes them from the model meta.
    search_fields = ("id",)
    list_display = ("__str__",)
    list_filter = ()
    list_select_related = False

    def __init__(self, model, admin_site):
        meta = model._meta
        columns = []
        filters = []
        search = []
        date_field = None

        for f in meta.concrete_fields:
            if f.name in ("id", "password"):
                continue
            if isinstance(f, djm.ImageField):
                columns.append(self._make_thumb_col(f.name))
            elif f.choices:
                columns.append(self._make_badge_col(f.name))
                if len(filters) < self.MAX_FILTERS:
                    filters.append(f.name)
            elif isinstance(f, djm.BooleanField):
                columns.append(f.name)
                if len(filters) < self.MAX_FILTERS:
                    filters.append(f.name)
            elif isinstance(f, (djm.DateField, djm.DateTimeField)):
                if date_field is None and f.name in ("date", "created_at"):
                    date_field = f.name
                columns.append(f.name)
            elif isinstance(f, djm.JSONField):
                continue
            elif isinstance(f, djm.TextField):
                continue
            else:
                columns.append(f.name)
            if isinstance(f, (djm.CharField, djm.SlugField, djm.EmailField)) and (
                f.name in _SEARCHABLE_NAMES or f.name.endswith(_NO_SUFFIXES)
            ):
                search.append(f.name)

        self.list_display = tuple(columns[: self.MAX_COLUMNS]) or ("__str__",)
        self.list_filter = tuple(filters)
        # Always keep at least id so autocomplete_fields system checks pass
        self.search_fields = tuple(search) or ("id",)
        if date_field:
            self.date_hierarchy = date_field
        # avoid N+1 queries for FK columns
        self.list_select_related = tuple(
            f.name
            for f in meta.concrete_fields
            if f.is_relation and f.name in self.list_display
        ) or False
        super().__init__(model, admin_site)

    def _make_thumb_col(self, field_name):
        def col(obj):
            return image_thumb(getattr(obj, field_name))
        col.short_description = field_name.replace("_", " ")
        col.__name__ = f"{field_name}_thumb"
        return col

    def _make_badge_col(self, field_name):
        def col(obj):
            return choice_badge(obj, field_name)
        col.short_description = field_name.replace("_", " ")
        col.admin_order_field = field_name
        col.__name__ = f"{field_name}_badge"
        return col
