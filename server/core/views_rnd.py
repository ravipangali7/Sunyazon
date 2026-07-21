"""R&D portal APIs — overview KPIs and form options from Project / Batch / ProcessDefinition."""

from __future__ import annotations

from django.db.models import Count
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Batch,
    Department,
    Employee,
    ItemMaster,
    OrgUser,
    ProcessDefinition,
    Product,
    Project,
    User,
)
from core.views_domain import DomainAuthMixin, _iso, resolve_org


def _user_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username or str(user.pk)


def _serialize_batch_brief(b: Batch) -> dict:
    return {
        "id": str(b.id),
        "batch_no": b.batch_no,
        "product_name": b.product.name if b.product_id else "",
        "output_item_name": b.output_item.name if b.output_item_id else "",
        "output_item_code": b.output_item.item_code if b.output_item_id else "",
        "manufacture_date": _iso(b.manufacture_date) or "",
        "expire_date": _iso(b.expire_date) or "",
        "status": b.status,
        "start_date": _iso(b.start_date) or "",
    }


def _serialize_project_brief(p: Project) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "code": p.code,
        "end_date": _iso(p.end_date) or "",
        "department_id": str(p.department_id) if p.department_id else None,
        "department_name": p.department.name if p.department_id else "",
        "is_active": p.is_active,
    }


class RndOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "active_projects": 0,
            "total_projects": 0,
            "trial_batches": 0,
            "definitions_count": 0,
            "by_department": [],
            "by_batch_status": [],
            "by_definition_status": [],
            "recent_batches": [],
            "upcoming_ends": [],
            "definitions": [],
        }
        if not org:
            return Response(empty)

        today = timezone.localdate()
        projects = Project.objects.filter(organization=org).select_related("department")
        batches = Batch.objects.filter(organization=org).select_related("product", "output_item")
        definitions = ProcessDefinition.objects.filter(organization=org).annotate(
            stage_count=Count("stages")
        )

        active_projects = projects.filter(is_active=True).count()
        total_projects = projects.count()

        by_department = []
        dept_counts = (
            projects.filter(is_active=True)
            .values("department_id", "department__name", "department__code")
            .annotate(value=Count("id"))
            .order_by("-value")
        )
        for row in dept_counts:
            name = row["department__name"] or "Unassigned"
            code = row["department__code"] or "unassigned"
            by_department.append({"name": name, "code": code, "value": row["value"]})

        by_batch_status = []
        for code, label in Batch.Status.choices:
            by_batch_status.append(
                {
                    "name": label,
                    "code": code,
                    "value": batches.filter(status=code).count(),
                }
            )

        by_definition_status = []
        for code, label in ProcessDefinition.Status.choices:
            by_definition_status.append(
                {
                    "name": label,
                    "code": code,
                    "value": definitions.filter(status=code).count(),
                }
            )

        recent_batches = [
            _serialize_batch_brief(b)
            for b in batches.order_by("-created_at", "-id")[:5]
        ]

        upcoming_ends = [
            _serialize_project_brief(p)
            for p in projects.filter(end_date__isnull=False, end_date__gte=today)
            .order_by("end_date")[:8]
        ]

        definitions_list = [
            {
                "id": str(d.id),
                "name": d.name,
                "code": d.code,
                "status": d.status,
                "stage_count": d.stage_count or 0,
                "output_type": d.output_type,
            }
            for d in definitions.order_by("code")[:100]
        ]

        return Response(
            {
                "active_projects": active_projects,
                "total_projects": total_projects,
                "trial_batches": batches.count(),
                "definitions_count": definitions.count(),
                "by_department": by_department,
                "by_batch_status": by_batch_status,
                "by_definition_status": by_definition_status,
                "recent_batches": recent_batches,
                "upcoming_ends": upcoming_ends,
                "definitions": definitions_list,
            }
        )


class RndOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "organization_id": None,
            "departments": [],
            "managers": [],
            "employees": [],
            "process_definitions": [],
            "products": [],
            "items": [],
        }
        if not org:
            return Response(empty)

        member_user_ids = list(
            OrgUser.objects.filter(organization=org, status=OrgUser.Status.ACTIVE).values_list(
                "user_id", flat=True
            )[:300]
        )
        managers = []
        for u in (
            User.objects.filter(pk__in=member_user_ids, is_active=True)
            .select_related("profile")
            .order_by("username")[:200]
        ):
            managers.append(
                {
                    "id": str(u.id),
                    "username": u.username,
                    "name": _user_name(u),
                }
            )

        return Response(
            {
                "organization_id": str(org.id),
                "departments": [
                    {"id": str(d.id), "code": d.code or "", "name": d.name}
                    for d in Department.objects.filter(organization=org).order_by("code")[:100]
                ],
                "managers": managers,
                "employees": [
                    {"id": str(e.id), "code": e.employee_code, "name": e.full_name}
                    for e in Employee.objects.filter(
                        organization=org, status=Employee.Status.ACTIVE
                    ).order_by("full_name")[:200]
                ],
                "process_definitions": [
                    {
                        "id": str(d.id),
                        "code": d.code,
                        "name": d.name,
                        "status": d.status,
                        "stage_count": d.stage_count or 0,
                    }
                    for d in ProcessDefinition.objects.filter(organization=org)
                    .annotate(stage_count=Count("stages"))
                    .order_by("code")[:100]
                ],
                "products": [
                    {"id": str(p.id), "name": p.name, "brand": p.brand_name or ""}
                    for p in Product.objects.filter(seller_org=org).order_by("name")[:200]
                ],
                "items": [
                    {
                        "id": str(i.id),
                        "code": i.item_code,
                        "name": i.name,
                        "uom": i.uom,
                    }
                    for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:300]
                ],
            }
        )
