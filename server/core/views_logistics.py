"""Logistics module APIs — vehicles, routes, dispatches, POD."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Dispatch,
    DocStatus,
    Employee,
    POD,
    Route,
    SalesOrder,
    Territory,
    Vehicle,
    Warehouse,
)
from core.services.common import DomainError
from core.services.dispatch_service import (
    cancel_dispatch,
    create_dispatch,
    create_pod,
    mark_dispatch_loaded,
    mark_dispatched,
)
from core.views_domain import DomainAuthMixin, _dec, _iso, org_filter, resolve_org


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, "year") and not hasattr(value, "hour"):
        return value
    return parse_date(str(value))


def _parse_dt(value):
    if not value:
        return None
    if hasattr(value, "hour"):
        return value
    return parse_datetime(str(value)) or None


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


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_vehicle(obj: Vehicle) -> dict:
    return {
        "id": str(obj.id),
        "number": obj.number,
        "capacity": _dec(obj.capacity),
        "insurance_expiry": _iso(obj.insurance_expiry) or "",
        "fitness_expiry": _iso(obj.fitness_expiry) or "",
        "tax_expiry": _iso(obj.tax_expiry) or "",
    }


def serialize_route(obj: Route) -> dict:
    return {
        "id": str(obj.id),
        "name": obj.name,
        "territory_id": str(obj.territory_id) if obj.territory_id else None,
        "territory_name": obj.territory.name if obj.territory_id else "",
        "sequence_json": obj.sequence_json or [],
        "stops": len(obj.sequence_json or []),
    }


def serialize_pod(obj: POD) -> dict:
    d = obj.dispatch
    return {
        "id": str(obj.id),
        "dispatch_id": str(obj.dispatch_id),
        "so_no": d.sales_order.so_no if d and d.sales_order_id else "",
        "vehicle_number": d.vehicle.number if d and d.vehicle_id else "",
        "driver_name": _emp_name(d.driver) if d and d.driver_id else "",
        "route_name": d.route.name if d and d.route_id else "",
        "received_by": obj.received_by or "",
        "delivered_at": _iso(obj.delivered_at) or "",
        "has_signature": bool(obj.signature),
        "has_photo": bool(obj.photo),
        "dispatch_status": d.status if d else "",
    }


def serialize_dispatch(obj: Dispatch) -> dict:
    try:
        pod = obj.pod
    except ObjectDoesNotExist:
        pod = None
    return {
        "id": str(obj.id),
        "sales_order_id": str(obj.sales_order_id) if obj.sales_order_id else None,
        "so_no": obj.sales_order.so_no if obj.sales_order_id else "",
        "party_name": obj.sales_order.party.name if obj.sales_order_id and obj.sales_order.party_id else "",
        "vehicle_id": str(obj.vehicle_id) if obj.vehicle_id else None,
        "vehicle_number": obj.vehicle.number if obj.vehicle_id else "",
        "driver_id": str(obj.driver_id) if obj.driver_id else None,
        "driver_name": _emp_name(obj.driver) if obj.driver_id else "",
        "route_id": str(obj.route_id) if obj.route_id else None,
        "route_name": obj.route.name if obj.route_id else "",
        "status": obj.status,
        "dispatched_at": _iso(obj.dispatched_at) or "",
        "delivered_at": _iso(obj.delivered_at) or "",
        "pod_id": str(pod.id) if pod else None,
        "pod_received_by": (pod.received_by or "") if pod else "",
        "pod_delivered_at": (_iso(pod.delivered_at) or "") if pod else "",
        "has_pod": bool(pod),
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class LogisticsOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "active_vehicles": 0,
            "routes_count": 0,
            "deliveries_today": 0,
            "deliveries_week": 0,
            "pods_pending": 0,
            "pods_received": 0,
            "dispatches_planned": 0,
            "dispatches_loaded": 0,
            "dispatches_dispatched": 0,
            "dispatches_delivered": 0,
            "dispatches_cancelled": 0,
            "by_status": [],
            "recent_dispatches": [],
        }
        if not org:
            return Response(empty)

        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())

        vehicles_qs = Vehicle.objects.filter(organization=org)
        routes_qs = Route.objects.filter(organization=org)
        dispatch_qs = Dispatch.objects.filter(organization=org)
        pod_qs = POD.objects.filter(dispatch__organization=org)

        status_counts = {
            row["status"]: row["c"]
            for row in dispatch_qs.values("status").annotate(c=Count("id"))
        }

        def sc(code):
            return status_counts.get(code, 0)

        planned = sc(Dispatch.Status.PLANNED)
        loaded = sc(Dispatch.Status.LOADED)
        dispatched = sc(Dispatch.Status.DISPATCHED)
        delivered = sc(Dispatch.Status.DELIVERED)
        cancelled = sc(Dispatch.Status.CANCELLED)

        deliveries_today = dispatch_qs.filter(
            status=Dispatch.Status.DELIVERED,
            delivered_at__date=today,
        ).count()
        deliveries_week = dispatch_qs.filter(
            status=Dispatch.Status.DELIVERED,
            delivered_at__date__gte=week_start,
            delivered_at__date__lte=today,
        ).count()

        pods_received = pod_qs.count()
        pods_pending = (
            dispatch_qs.filter(status=Dispatch.Status.DISPATCHED)
            .filter(pod__isnull=True)
            .count()
        )

        recent = (
            dispatch_qs.select_related(
                "vehicle", "driver", "route", "sales_order", "sales_order__party", "pod"
            )
            .order_by("-dispatched_at", "-id")[:10]
        )

        return Response(
            {
                "active_vehicles": vehicles_qs.count(),
                "routes_count": routes_qs.count(),
                "deliveries_today": deliveries_today,
                "deliveries_week": deliveries_week,
                "pods_pending": pods_pending,
                "pods_received": pods_received,
                "dispatches_planned": planned,
                "dispatches_loaded": loaded,
                "dispatches_dispatched": dispatched,
                "dispatches_delivered": delivered,
                "dispatches_cancelled": cancelled,
                "by_status": [
                    {"name": "Planned", "code": "planned", "value": planned},
                    {"name": "Loaded", "code": "loaded", "value": loaded},
                    {"name": "Dispatched", "code": "dispatched", "value": dispatched},
                    {"name": "Delivered", "code": "delivered", "value": delivered},
                    {"name": "Cancelled", "code": "cancelled", "value": cancelled},
                ],
                "recent_dispatches": [serialize_dispatch(d) for d in recent],
            }
        )


class LogisticsOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "vehicles": [],
            "routes": [],
            "drivers": [],
            "sales_orders": [],
            "warehouses": [],
            "territories": [],
            "dispatch_statuses": [
                {"value": c[0], "label": c[1]} for c in Dispatch.Status.choices
            ],
        }
        if not org:
            return Response(empty)

        return Response(
            {
                "vehicles": [
                    {
                        "id": str(v.id),
                        "number": v.number,
                        "capacity": _dec(v.capacity),
                    }
                    for v in Vehicle.objects.filter(organization=org).order_by("number")[:200]
                ],
                "routes": [
                    {"id": str(r.id), "name": r.name}
                    for r in Route.objects.filter(organization=org).order_by("name")[:200]
                ],
                "drivers": [
                    {"id": str(e.id), "code": e.employee_code, "name": e.full_name}
                    for e in Employee.objects.filter(
                        organization=org, status=Employee.Status.ACTIVE
                    ).order_by("full_name")[:200]
                ],
                "sales_orders": [
                    {
                        "id": str(so.id),
                        "so_no": so.so_no,
                        "party_name": so.party.name if so.party_id else "",
                        "status": so.status,
                        "total": _dec(so.total),
                    }
                    for so in SalesOrder.objects.filter(
                        organization=org,
                        status__in=[DocStatus.APPROVED, DocStatus.POSTED],
                    )
                    .select_related("party")
                    .order_by("-date")[:100]
                ],
                "warehouses": [
                    {"id": str(w.id), "code": w.code, "name": w.name}
                    for w in Warehouse.objects.filter(organization=org).order_by("code")[:100]
                ],
                "territories": [
                    {"id": str(t.id), "name": t.name}
                    for t in Territory.objects.filter(organization=org).order_by("name")[:100]
                ],
                "dispatch_statuses": [
                    {"value": c[0], "label": c[1]} for c in Dispatch.Status.choices
                ],
            }
        )


# ── Vehicles ─────────────────────────────────────────────────────────────────


class LogisticsVehiclesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Vehicle.objects.all(), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(number__icontains=search))
        sort = request.query_params.get("sort") or "number"
        if sort.lstrip("-") in ("number", "capacity", "insurance_expiry", "fitness_expiry"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("number")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_vehicle(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        number = (data.get("number") or "").strip().upper()
        if not number:
            return Response({"detail": "number is required."}, status=400)
        if Vehicle.objects.filter(organization=org, number=number).exists():
            return Response({"detail": "Vehicle number already exists."}, status=400)
        obj = Vehicle.objects.create(
            organization=org,
            number=number,
            capacity=_decimal(data.get("capacity")),
            insurance_expiry=_parse_date(data.get("insurance_expiry")),
            fitness_expiry=_parse_date(data.get("fitness_expiry")),
            tax_expiry=_parse_date(data.get("tax_expiry")),
        )
        return Response(serialize_vehicle(obj), status=201)


class LogisticsVehicleDetailView(DomainAuthMixin, APIView):
    def get(self, request, vehicle_id):
        org = resolve_org(request.user)
        obj = org_filter(Vehicle.objects.all(), org).filter(pk=vehicle_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_vehicle(obj))

    def patch(self, request, vehicle_id):
        org = resolve_org(request.user)
        obj = org_filter(Vehicle.objects.all(), org).filter(pk=vehicle_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "number" in data and data.get("number"):
            number = str(data["number"]).strip().upper()
            if Vehicle.objects.filter(organization=org, number=number).exclude(pk=obj.pk).exists():
                return Response({"detail": "Vehicle number already exists."}, status=400)
            obj.number = number
        if "capacity" in data:
            obj.capacity = _decimal(data.get("capacity"))
        if "insurance_expiry" in data:
            obj.insurance_expiry = _parse_date(data.get("insurance_expiry"))
        if "fitness_expiry" in data:
            obj.fitness_expiry = _parse_date(data.get("fitness_expiry"))
        if "tax_expiry" in data:
            obj.tax_expiry = _parse_date(data.get("tax_expiry"))
        obj.save()
        return Response(serialize_vehicle(obj))

    def delete(self, request, vehicle_id):
        org = resolve_org(request.user)
        obj = org_filter(Vehicle.objects.all(), org).filter(pk=vehicle_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        if Dispatch.objects.filter(vehicle=obj).exclude(status=Dispatch.Status.CANCELLED).exists():
            return Response(
                {"detail": "Cannot delete vehicle with active dispatches."},
                status=400,
            )
        obj.delete()
        return Response({"ok": True})


# ── Routes ───────────────────────────────────────────────────────────────────


class LogisticsRoutesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Route.objects.all(), org).select_related("territory")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(territory__name__icontains=search)
            )
        sort = request.query_params.get("sort") or "name"
        if sort.lstrip("-") in ("name",):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_route(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        territory = _get_fk(Territory, org, data.get("territory_id"))
        seq = data.get("sequence_json")
        if not isinstance(seq, list):
            seq = []
        obj = Route.objects.create(
            organization=org,
            name=name,
            territory=territory,
            sequence_json=seq,
        )
        return Response(
            serialize_route(Route.objects.select_related("territory").get(pk=obj.pk)),
            status=201,
        )


class LogisticsRouteDetailView(DomainAuthMixin, APIView):
    def get(self, request, route_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(Route.objects.all(), org)
            .select_related("territory")
            .filter(pk=route_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_route(obj))

    def patch(self, request, route_id):
        org = resolve_org(request.user)
        obj = org_filter(Route.objects.all(), org).filter(pk=route_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data.get("name"):
            obj.name = str(data["name"]).strip()
        if "territory_id" in data:
            obj.territory = _get_fk(Territory, org, data.get("territory_id"))
        if "sequence_json" in data:
            seq = data.get("sequence_json")
            obj.sequence_json = seq if isinstance(seq, list) else []
        obj.save()
        return Response(
            serialize_route(Route.objects.select_related("territory").get(pk=obj.pk))
        )

    def delete(self, request, route_id):
        org = resolve_org(request.user)
        obj = org_filter(Route.objects.all(), org).filter(pk=route_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Dispatches ───────────────────────────────────────────────────────────────


class LogisticsDispatchesView(DomainAuthMixin, APIView):
    """GET list (+ optional POST create via dispatch_service). Path: /logistics/dispatches/list/"""

    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Dispatch.objects.all(), org).select_related(
            "vehicle",
            "driver",
            "route",
            "sales_order",
            "sales_order__party",
            "pod",
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(vehicle__number__icontains=search)
                | Q(driver__full_name__icontains=search)
                | Q(driver__employee_code__icontains=search)
                | Q(route__name__icontains=search)
                | Q(sales_order__so_no__icontains=search)
                | Q(sales_order__party__name__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-dispatched_at"
        allowed = ("dispatched_at", "delivered_at", "status")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort, "-id")
        else:
            qs = qs.order_by("-dispatched_at", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_dispatch(i) for i in items], **meta})

    def post(self, request):
        """Create dispatch via dispatch_service (supports route_id)."""
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        so = _get_fk(SalesOrder, org, data.get("sales_order_id"))
        vehicle = _get_fk(Vehicle, org, data.get("vehicle_id"))
        driver = _get_fk(Employee, org, data.get("driver_id"))
        warehouse = _get_fk(Warehouse, org, data.get("warehouse_id"))
        if not warehouse:
            warehouse = Warehouse.objects.filter(organization=org).order_by("id").first()
        route = _get_fk(Route, org, data.get("route_id"))
        if not so or not vehicle or not driver:
            return Response(
                {"detail": "sales_order_id, vehicle_id and driver_id are required."},
                status=400,
            )
        if not warehouse:
            return Response({"detail": "warehouse_id is required (no warehouse found)."}, status=400)
        try:
            dispatch = create_dispatch(
                sales_order=so,
                vehicle=vehicle,
                driver=driver,
                warehouse=warehouse,
                route=route,
                actor=request.user,
            )
        except DomainError as exc:
            return _domain_error(exc)
        obj = Dispatch.objects.select_related(
            "vehicle", "driver", "route", "sales_order", "sales_order__party", "pod"
        ).get(pk=dispatch.pk)
        return Response(serialize_dispatch(obj), status=201)


def _dispatch_qs(org):
    return org_filter(Dispatch.objects.all(), org).select_related(
        "vehicle", "driver", "route", "sales_order", "sales_order__party", "pod"
    )


class LogisticsDispatchDetailView(DomainAuthMixin, APIView):
    """GET/PATCH/DELETE at /logistics/dispatches/<uuid>/detail/ (non-colliding with FBV actions)."""

    def get(self, request, dispatch_id):
        org = resolve_org(request.user)
        obj = _dispatch_qs(org).filter(pk=dispatch_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_dispatch(obj))

    def patch(self, request, dispatch_id):
        org = resolve_org(request.user)
        obj = org_filter(Dispatch.objects.all(), org).filter(pk=dispatch_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        if action:
            return self._run_action(request, obj, action, data)

        if obj.status not in (Dispatch.Status.PLANNED, Dispatch.Status.LOADED):
            return Response(
                {"detail": "Only planned/loaded dispatches can be edited."},
                status=400,
            )
        if "vehicle_id" in data:
            vehicle = _get_fk(Vehicle, org, data.get("vehicle_id"))
            if vehicle:
                obj.vehicle = vehicle
        if "driver_id" in data:
            driver = _get_fk(Employee, org, data.get("driver_id"))
            if driver:
                obj.driver = driver
        if "route_id" in data:
            obj.route = _get_fk(Route, org, data.get("route_id"))
        obj.save()
        return Response(serialize_dispatch(_dispatch_qs(org).get(pk=obj.pk)))

    def post(self, request, dispatch_id):
        return self.patch(request, dispatch_id)

    def _run_action(self, request, dispatch, action, data):
        org = resolve_org(request.user)
        try:
            if action == "load":
                mark_dispatch_loaded(dispatch, actor=request.user)
            elif action == "dispatch":
                wh_id = data.get("warehouse_id")
                warehouse = (
                    _get_fk(Warehouse, org, wh_id)
                    if wh_id
                    else Warehouse.objects.filter(organization=org).order_by("id").first()
                )
                if not warehouse:
                    return Response({"detail": "warehouse_id required."}, status=400)
                mark_dispatched(dispatch, warehouse=warehouse, actor=request.user)
            elif action == "pod":
                create_pod(
                    dispatch,
                    signature=data.get("signature") or "signed",
                    received_by=data.get("received_by") or "",
                    actor=request.user,
                )
            elif action == "cancel":
                cancel_dispatch(dispatch, actor=request.user)
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        dispatch.refresh_from_db()
        return Response(serialize_dispatch(_dispatch_qs(org).get(pk=dispatch.pk)))

    def delete(self, request, dispatch_id):
        org = resolve_org(request.user)
        obj = org_filter(Dispatch.objects.all(), org).filter(pk=dispatch_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        if obj.status not in (Dispatch.Status.PLANNED, Dispatch.Status.CANCELLED):
            return Response(
                {"detail": "Only planned or cancelled dispatches can be deleted."},
                status=400,
            )
        obj.delete()
        return Response({"ok": True})


# ── PODs ─────────────────────────────────────────────────────────────────────


class LogisticsPodsView(DomainAuthMixin, APIView):
    """List PODs (recording goes through dispatch pod action)."""

    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            qs = POD.objects.none()
        else:
            qs = (
                POD.objects.filter(dispatch__organization=org)
                .select_related(
                    "dispatch",
                    "dispatch__vehicle",
                    "dispatch__driver",
                    "dispatch__route",
                    "dispatch__sales_order",
                )
            )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(received_by__icontains=search)
                | Q(dispatch__vehicle__number__icontains=search)
                | Q(dispatch__sales_order__so_no__icontains=search)
                | Q(dispatch__driver__full_name__icontains=search)
                | Q(dispatch__route__name__icontains=search)
            )
        sort = request.query_params.get("sort") or "-delivered_at"
        if sort.lstrip("-") in ("delivered_at", "received_by"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-delivered_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_pod(i) for i in items], **meta})


class LogisticsPodDetailView(DomainAuthMixin, APIView):
    def get(self, request, pod_id):
        org = resolve_org(request.user)
        qs = POD.objects.select_related(
            "dispatch",
            "dispatch__vehicle",
            "dispatch__driver",
            "dispatch__route",
            "dispatch__sales_order",
        )
        if org:
            qs = qs.filter(dispatch__organization=org)
        else:
            qs = qs.none()
        obj = qs.filter(pk=pod_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_pod(obj))

    def patch(self, request, pod_id):
        org = resolve_org(request.user)
        qs = POD.objects.all()
        if org:
            qs = qs.filter(dispatch__organization=org)
        else:
            qs = qs.none()
        obj = qs.filter(pk=pod_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "received_by" in data:
            obj.received_by = data.get("received_by") or ""
        if "delivered_at" in data and data.get("delivered_at"):
            dt = _parse_dt(data.get("delivered_at"))
            if dt:
                obj.delivered_at = dt
        obj.save()
        obj = POD.objects.select_related(
            "dispatch",
            "dispatch__vehicle",
            "dispatch__driver",
            "dispatch__route",
            "dispatch__sales_order",
        ).get(pk=obj.pk)
        return Response(serialize_pod(obj))

    def delete(self, request, pod_id):
        org = resolve_org(request.user)
        qs = POD.objects.all()
        if org:
            qs = qs.filter(dispatch__organization=org)
        else:
            qs = qs.none()
        obj = qs.filter(pk=pod_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
