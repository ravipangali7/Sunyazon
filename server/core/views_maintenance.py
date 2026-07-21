"""Maintenance module APIs — equipment, work orders, PM schedules, calibration."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Calibration, Employee, Equipment, MaintenanceWorkOrder, PMSchedule
from core.services.common import DomainError
from core.services.maintenance_service import close_maintenance_wo, record_calibration
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, "year"):
        return value
    return parse_date(str(value))


def _paginate(qs, request, *, default_page_size=50):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(200, max(1, int(request.query_params.get("page_size") or default_page_size)))
    except (TypeError, ValueError):
        page_size = default_page_size
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])
    return items, {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def _emp_name(emp) -> str:
    if not emp:
        return ""
    return emp.full_name or emp.employee_code or ""


def _get_fk(model, org, pk, *, org_field="organization"):
    if not pk:
        return None
    qs = model.objects.filter(pk=pk)
    if org and hasattr(model, org_field):
        qs = qs.filter(**{org_field: org})
    return qs.first()


def _choices(choices_cls):
    return [{"value": v, "label": str(l)} for v, l in choices_cls.choices]


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_equipment(obj: Equipment) -> dict:
    next_pm = getattr(obj, "next_pm_due", None)
    if next_pm is None and hasattr(obj, "pm_schedules"):
        pm = obj.pm_schedules.order_by("next_due").first()
        next_pm = pm.next_due if pm else None
    open_wo = getattr(obj, "open_wo_count", None)
    if open_wo is None:
        open_wo = obj.maintenance_work_orders.exclude(
            status=MaintenanceWorkOrder.Status.CLOSED
        ).count()
    return {
        "id": str(obj.id),
        "asset_code": obj.asset_code,
        "name": obj.name,
        "location": obj.location or "",
        "capacity": obj.capacity or "",
        "category": obj.category,
        "health_index": obj.health_index,
        "purchase_date": _iso(obj.purchase_date) or "",
        "next_pm_due": _iso(next_pm) or "",
        "open_wo_count": int(open_wo or 0),
    }


def serialize_work_order(obj: MaintenanceWorkOrder) -> dict:
    return {
        "id": str(obj.id),
        "equipment_id": str(obj.equipment_id) if obj.equipment_id else None,
        "equipment_code": obj.equipment.asset_code if obj.equipment_id else "",
        "equipment_name": obj.equipment.name if obj.equipment_id else "",
        "type": obj.type,
        "description": obj.description or "",
        "technician_id": str(obj.technician_id) if obj.technician_id else None,
        "technician_name": _emp_name(obj.technician) if obj.technician_id else "",
        "status": obj.status,
        "requested_at": _iso(obj.requested_at) or "",
        "closed_at": _iso(obj.closed_at) or "",
    }


def serialize_pm(obj: PMSchedule) -> dict:
    return {
        "id": str(obj.id),
        "equipment_id": str(obj.equipment_id) if obj.equipment_id else None,
        "equipment_code": obj.equipment.asset_code if obj.equipment_id else "",
        "equipment_name": obj.equipment.name if obj.equipment_id else "",
        "frequency": obj.frequency,
        "activity": obj.activity or "",
        "next_due": _iso(obj.next_due) or "",
        "last_done": _iso(obj.last_done) or "",
    }


def serialize_calibration(obj: Calibration) -> dict:
    return {
        "id": str(obj.id),
        "equipment_id": str(obj.equipment_id) if obj.equipment_id else None,
        "equipment_code": obj.equipment.asset_code if obj.equipment_id else "",
        "equipment_name": obj.equipment.name if obj.equipment_id else "",
        "calibrated_at": _iso(obj.calibrated_at) or "",
        "next_due": _iso(obj.next_due) or "",
        "result": obj.result,
        "performed_by_id": str(obj.performed_by_id) if obj.performed_by_id else None,
        "performed_by_name": _emp_name(obj.performed_by) if obj.performed_by_id else "",
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class MaintenanceOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "equipment_count": 0,
            "health_index": [],
            "open_work_orders": [],
            "pm_due_soon_count": 0,
            "pm_due_soon": [],
            "overdue_calibrations": 0,
            "by_type": [],
            "open_wo_count": 0,
        }
        if not org:
            return Response(empty)

        today = timezone.localdate()
        week = today + timedelta(days=7)

        eq_qs = Equipment.objects.filter(organization=org)
        wo_qs = MaintenanceWorkOrder.objects.filter(organization=org)
        open_wo = wo_qs.exclude(status=MaintenanceWorkOrder.Status.CLOSED)
        pm_qs = PMSchedule.objects.filter(equipment__organization=org)
        cal_qs = Calibration.objects.filter(equipment__organization=org)

        health_index = [
            {
                "name": label,
                "code": value,
                "value": eq_qs.filter(health_index=value).count(),
            }
            for value, label in Equipment.HealthIndex.choices
        ]

        open_work_orders = [
            {
                "name": label,
                "code": value,
                "value": open_wo.filter(status=value).count(),
            }
            for value, label in MaintenanceWorkOrder.Status.choices
            if value != MaintenanceWorkOrder.Status.CLOSED
        ]

        pm_due = list(
            pm_qs.filter(next_due__lte=week)
            .select_related("equipment")
            .order_by("next_due")[:20]
        )

        by_type = [
            {
                "name": label,
                "code": value,
                "value": open_wo.filter(type=value).count(),
            }
            for value, label in MaintenanceWorkOrder.Type.choices
        ]

        return Response(
            {
                "equipment_count": eq_qs.count(),
                "health_index": health_index,
                "open_work_orders": open_work_orders,
                "pm_due_soon_count": pm_qs.filter(next_due__lte=week).count(),
                "pm_due_soon": [serialize_pm(p) for p in pm_due],
                "overdue_calibrations": cal_qs.filter(next_due__lt=today).count(),
                "by_type": by_type,
                "open_wo_count": open_wo.count(),
            }
        )


class MaintenanceOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "equipment": [],
                    "employees": [],
                    "wo_types": _choices(MaintenanceWorkOrder.Type),
                    "wo_statuses": _choices(MaintenanceWorkOrder.Status),
                    "health_indexes": _choices(Equipment.HealthIndex),
                    "pm_frequencies": _choices(PMSchedule.Frequency),
                    "calibration_results": _choices(Calibration.Result),
                    "equipment_categories": _choices(Equipment.Category),
                }
            )
        return Response(
            {
                "equipment": [
                    {
                        "id": str(e.id),
                        "asset_code": e.asset_code,
                        "name": e.name,
                    }
                    for e in Equipment.objects.filter(organization=org).order_by("asset_code")[:500]
                ],
                "employees": [
                    {
                        "id": str(e.id),
                        "code": e.employee_code,
                        "name": e.full_name,
                    }
                    for e in Employee.objects.filter(
                        organization=org, status=Employee.Status.ACTIVE
                    ).order_by("full_name")[:200]
                ],
                "wo_types": _choices(MaintenanceWorkOrder.Type),
                "wo_statuses": _choices(MaintenanceWorkOrder.Status),
                "health_indexes": _choices(Equipment.HealthIndex),
                "pm_frequencies": _choices(PMSchedule.Frequency),
                "calibration_results": _choices(Calibration.Result),
                "equipment_categories": _choices(Equipment.Category),
            }
        )


# ── Equipment ────────────────────────────────────────────────────────────────


class MaintenanceEquipmentView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        next_pm = (
            PMSchedule.objects.filter(equipment_id=OuterRef("pk"))
            .order_by("next_due")
            .values("next_due")[:1]
        )
        qs = (
            org_filter(Equipment.objects.all(), org)
            .annotate(
                next_pm_due=Subquery(next_pm),
                open_wo_count=Count(
                    "maintenance_work_orders",
                    filter=~Q(maintenance_work_orders__status=MaintenanceWorkOrder.Status.CLOSED),
                ),
            )
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(asset_code__icontains=search)
                | Q(name__icontains=search)
                | Q(location__icontains=search)
            )
        health = (request.query_params.get("health_index") or "").strip()
        if health:
            qs = qs.filter(health_index=health)
        category = (request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category=category)
        sort = request.query_params.get("sort") or "asset_code"
        allowed = ("asset_code", "name", "location", "category", "health_index", "purchase_date")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("asset_code")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_equipment(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        asset_code = (data.get("asset_code") or "").strip()
        name = (data.get("name") or "").strip()
        if not asset_code or not name:
            return Response({"detail": "asset_code and name are required."}, status=400)
        if Equipment.objects.filter(organization=org, asset_code=asset_code).exists():
            return Response({"detail": "Asset code already exists."}, status=400)
        category = data.get("category") or Equipment.Category.B
        if category not in Equipment.Category.values:
            category = Equipment.Category.B
        health = data.get("health_index") or Equipment.HealthIndex.GREEN
        if health not in Equipment.HealthIndex.values:
            health = Equipment.HealthIndex.GREEN
        obj = Equipment.objects.create(
            organization=org,
            asset_code=asset_code,
            name=name,
            location=data.get("location") or "",
            capacity=data.get("capacity") or "",
            category=category,
            health_index=health,
            purchase_date=_parse_date(data.get("purchase_date")),
        )
        return Response(serialize_equipment(obj), status=201)


class MaintenanceEquipmentDetailView(DomainAuthMixin, APIView):
    def get(self, request, equipment_id):
        org = resolve_org(request.user)
        obj = org_filter(Equipment.objects.all(), org).filter(pk=equipment_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_equipment(obj))

    def patch(self, request, equipment_id):
        org = resolve_org(request.user)
        obj = org_filter(Equipment.objects.all(), org).filter(pk=equipment_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "asset_code" in data and data.get("asset_code"):
            code = str(data["asset_code"]).strip()
            if (
                Equipment.objects.filter(organization=org, asset_code=code)
                .exclude(pk=obj.pk)
                .exists()
            ):
                return Response({"detail": "Asset code already exists."}, status=400)
            obj.asset_code = code
        if "name" in data and data.get("name"):
            obj.name = str(data["name"]).strip()
        for field in ("location", "capacity"):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "category" in data and data["category"] in Equipment.Category.values:
            obj.category = data["category"]
        if "health_index" in data and data["health_index"] in Equipment.HealthIndex.values:
            obj.health_index = data["health_index"]
        if "purchase_date" in data:
            obj.purchase_date = _parse_date(data.get("purchase_date"))
        obj.save()
        return Response(serialize_equipment(obj))

    def delete(self, request, equipment_id):
        org = resolve_org(request.user)
        obj = org_filter(Equipment.objects.all(), org).filter(pk=equipment_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Work Orders ──────────────────────────────────────────────────────────────


class MaintenanceWorkOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(MaintenanceWorkOrder.objects.all(), org).select_related(
            "equipment", "technician"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(description__icontains=search)
                | Q(equipment__asset_code__icontains=search)
                | Q(equipment__name__icontains=search)
                | Q(technician__full_name__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        wo_type = (request.query_params.get("type") or "").strip()
        if wo_type:
            qs = qs.filter(type=wo_type)
        sort = request.query_params.get("sort") or "-requested_at"
        allowed = ("requested_at", "status", "type", "closed_at")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-requested_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_work_order(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        equipment = _get_fk(Equipment, org, data.get("equipment_id"))
        if not equipment:
            return Response({"detail": "equipment_id is required."}, status=400)
        wo_type = data.get("type") or MaintenanceWorkOrder.Type.BREAKDOWN
        if wo_type not in MaintenanceWorkOrder.Type.values:
            wo_type = MaintenanceWorkOrder.Type.BREAKDOWN
        technician = _get_fk(Employee, org, data.get("technician_id"))
        status = data.get("status") or MaintenanceWorkOrder.Status.REQUESTED
        if status not in MaintenanceWorkOrder.Status.values:
            status = MaintenanceWorkOrder.Status.REQUESTED
        obj = MaintenanceWorkOrder.objects.create(
            organization=org,
            equipment=equipment,
            type=wo_type,
            description=data.get("description") or "",
            technician=technician,
            status=status,
        )
        obj = MaintenanceWorkOrder.objects.select_related("equipment", "technician").get(pk=obj.pk)
        return Response(serialize_work_order(obj), status=201)


class MaintenanceWorkOrderDetailView(DomainAuthMixin, APIView):
    """Detail at /maintenance/work-orders/<uuid>/detail/ — legacy FBV keeps /work-orders/<uuid>/."""

    def _get(self, request, wo_id):
        org = resolve_org(request.user)
        return (
            org_filter(MaintenanceWorkOrder.objects.all(), org)
            .select_related("equipment", "technician")
            .filter(pk=wo_id)
            .first()
        )

    def get(self, request, wo_id):
        obj = self._get(request, wo_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_work_order(obj))

    def post(self, request, wo_id):
        """Status transitions: approve → start → close (close via maintenance_service)."""
        obj = self._get(request, wo_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        try:
            if action == "approve":
                if obj.status != MaintenanceWorkOrder.Status.REQUESTED:
                    return Response(
                        {"detail": f"Cannot approve from status {obj.status}."},
                        status=400,
                    )
                obj.status = MaintenanceWorkOrder.Status.APPROVED
                obj.save(update_fields=["status"])
            elif action in ("start", "in_progress"):
                if obj.status != MaintenanceWorkOrder.Status.APPROVED:
                    return Response(
                        {"detail": f"Cannot start from status {obj.status}."},
                        status=400,
                    )
                obj.status = MaintenanceWorkOrder.Status.IN_PROGRESS
                obj.save(update_fields=["status"])
            elif action == "close":
                close_maintenance_wo(obj, actor=request.user)
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        obj = self._get(request, wo_id)
        return Response(serialize_work_order(obj))

    def patch(self, request, wo_id):
        obj = self._get(request, wo_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip().lower()
        if action:
            return self.post(request, wo_id)
        org = resolve_org(request.user)
        if "description" in data:
            obj.description = data.get("description") or ""
        if "type" in data and data["type"] in MaintenanceWorkOrder.Type.values:
            obj.type = data["type"]
        if "equipment_id" in data:
            eq = _get_fk(Equipment, org, data.get("equipment_id"))
            if eq:
                obj.equipment = eq
        if "technician_id" in data:
            obj.technician = _get_fk(Employee, org, data.get("technician_id"))
        if "status" in data and data["status"] in MaintenanceWorkOrder.Status.values:
            new_status = data["status"]
            if new_status == MaintenanceWorkOrder.Status.CLOSED:
                try:
                    close_maintenance_wo(obj, actor=request.user)
                except DomainError as exc:
                    return _domain_error(exc)
            else:
                obj.status = new_status
                obj.save()
        else:
            obj.save()
        obj = self._get(request, wo_id)
        return Response(serialize_work_order(obj))

    def delete(self, request, wo_id):
        obj = self._get(request, wo_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── PM Schedules ─────────────────────────────────────────────────────────────


class MaintenancePMSchedulesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = PMSchedule.objects.filter(equipment__organization=org).select_related("equipment")
        if not org:
            qs = PMSchedule.objects.none()
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(activity__icontains=search)
                | Q(equipment__asset_code__icontains=search)
                | Q(equipment__name__icontains=search)
            )
        frequency = (request.query_params.get("frequency") or "").strip()
        if frequency:
            qs = qs.filter(frequency=frequency)
        sort = request.query_params.get("sort") or "next_due"
        allowed = ("next_due", "last_done", "frequency", "activity")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("next_due")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_pm(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        equipment = _get_fk(Equipment, org, data.get("equipment_id"))
        if not equipment:
            return Response({"detail": "equipment_id is required."}, status=400)
        activity = (data.get("activity") or "").strip()
        if not activity:
            return Response({"detail": "activity is required."}, status=400)
        next_due = _parse_date(data.get("next_due"))
        if not next_due:
            return Response({"detail": "next_due is required."}, status=400)
        frequency = data.get("frequency") or PMSchedule.Frequency.MONTHLY
        if frequency not in PMSchedule.Frequency.values:
            frequency = PMSchedule.Frequency.MONTHLY
        obj = PMSchedule.objects.create(
            equipment=equipment,
            frequency=frequency,
            activity=activity,
            next_due=next_due,
            last_done=_parse_date(data.get("last_done")),
        )
        obj = PMSchedule.objects.select_related("equipment").get(pk=obj.pk)
        return Response(serialize_pm(obj), status=201)


class MaintenancePMScheduleDetailView(DomainAuthMixin, APIView):
    def _get(self, request, schedule_id):
        org = resolve_org(request.user)
        qs = PMSchedule.objects.select_related("equipment")
        if org:
            qs = qs.filter(equipment__organization=org)
        else:
            qs = qs.none()
        return qs.filter(pk=schedule_id).first()

    def get(self, request, schedule_id):
        obj = self._get(request, schedule_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_pm(obj))

    def patch(self, request, schedule_id):
        obj = self._get(request, schedule_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        org = resolve_org(request.user)
        if "activity" in data and data.get("activity"):
            obj.activity = str(data["activity"]).strip()
        if "frequency" in data and data["frequency"] in PMSchedule.Frequency.values:
            obj.frequency = data["frequency"]
        if "next_due" in data:
            d = _parse_date(data.get("next_due"))
            if d:
                obj.next_due = d
        if "last_done" in data:
            obj.last_done = _parse_date(data.get("last_done"))
        if "equipment_id" in data:
            eq = _get_fk(Equipment, org, data.get("equipment_id"))
            if eq:
                obj.equipment = eq
        obj.save()
        return Response(serialize_pm(self._get(request, schedule_id)))

    def delete(self, request, schedule_id):
        obj = self._get(request, schedule_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Calibrations ─────────────────────────────────────────────────────────────


class MaintenanceCalibrationsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = Calibration.objects.filter(equipment__organization=org).select_related(
            "equipment", "performed_by"
        )
        if not org:
            qs = Calibration.objects.none()
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(equipment__asset_code__icontains=search)
                | Q(equipment__name__icontains=search)
                | Q(performed_by__full_name__icontains=search)
            )
        result = (request.query_params.get("result") or request.query_params.get("status") or "").strip()
        if result:
            qs = qs.filter(result=result)
        sort = request.query_params.get("sort") or "-calibrated_at"
        allowed = ("calibrated_at", "next_due", "result")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-calibrated_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_calibration(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        equipment = _get_fk(Equipment, org, data.get("equipment_id"))
        performed_by = _get_fk(Employee, org, data.get("performed_by_id"))
        if not equipment or not performed_by:
            return Response(
                {"detail": "equipment_id and performed_by_id are required."},
                status=400,
            )
        calibrated_at = _parse_date(data.get("calibrated_at")) or timezone.localdate()
        next_due = _parse_date(data.get("next_due"))
        if not next_due:
            return Response({"detail": "next_due is required."}, status=400)
        result = data.get("result") or Calibration.Result.PASS
        if result not in Calibration.Result.values:
            result = Calibration.Result.PASS
        obj = Calibration.objects.create(
            equipment=equipment,
            calibrated_at=calibrated_at,
            next_due=next_due,
            result=result,
            performed_by=performed_by,
        )
        try:
            record_calibration(obj, actor=request.user)
            obj.refresh_from_db()
        except DomainError as exc:
            return _domain_error(exc)
        obj = Calibration.objects.select_related("equipment", "performed_by").get(pk=obj.pk)
        return Response(serialize_calibration(obj), status=201)


class MaintenanceCalibrationDetailView(DomainAuthMixin, APIView):
    def _get(self, request, calibration_id):
        org = resolve_org(request.user)
        qs = Calibration.objects.select_related("equipment", "performed_by")
        if org:
            qs = qs.filter(equipment__organization=org)
        else:
            qs = qs.none()
        return qs.filter(pk=calibration_id).first()

    def get(self, request, calibration_id):
        obj = self._get(request, calibration_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_calibration(obj))

    def post(self, request, calibration_id):
        """Legacy record_calibration action (fail → breakdown WO)."""
        obj = self._get(request, calibration_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        try:
            record_calibration(obj, actor=request.user)
            obj.refresh_from_db()
        except DomainError as exc:
            return _domain_error(exc)
        return Response({"ok": True, "id": str(obj.id), **serialize_calibration(obj)})

    def patch(self, request, calibration_id):
        obj = self._get(request, calibration_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        org = resolve_org(request.user)
        prev_result = obj.result
        if "calibrated_at" in data:
            d = _parse_date(data.get("calibrated_at"))
            if d:
                obj.calibrated_at = d
        if "next_due" in data:
            d = _parse_date(data.get("next_due"))
            if d:
                obj.next_due = d
        if "result" in data and data["result"] in Calibration.Result.values:
            obj.result = data["result"]
        if "equipment_id" in data:
            eq = _get_fk(Equipment, org, data.get("equipment_id"))
            if eq:
                obj.equipment = eq
        if "performed_by_id" in data:
            emp = _get_fk(Employee, org, data.get("performed_by_id"))
            if emp:
                obj.performed_by = emp
        obj.save()
        if obj.result != prev_result or data.get("action") == "record":
            try:
                record_calibration(obj, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        return Response(serialize_calibration(self._get(request, calibration_id)))

    def delete(self, request, calibration_id):
        obj = self._get(request, calibration_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
