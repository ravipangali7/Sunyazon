"""CRM module APIs — overview, pipeline deals, complaints, customer activities."""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Complaint,
    CustomerActivity,
    Employee,
    OrgUser,
    Party,
    PipelineDeal,
    Product,
    User,
    WorkOrder,
)
from core.services.common import DomainError
from core.services.crm_service import (
    advance_complaint,
    mark_deal_lost,
    mark_deal_won,
    register_complaint,
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
    if isinstance(value, datetime):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    dt = parse_datetime(str(value))
    if dt is None:
        d = parse_date(str(value))
        if not d:
            return None
        dt = datetime.combine(d, time.min)
    if timezone.is_naive(dt):
        return timezone.make_aware(dt)
    return dt


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


def _user_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.phone or user.username or str(user.pk)


def _get_fk(model, org, pk, *, org_field="organization"):
    if not pk:
        return None
    qs = model.objects.filter(pk=pk)
    if org and hasattr(model, org_field):
        qs = qs.filter(**{org_field: org})
    return qs.first()


def _choices(choices_cls):
    return [{"value": c.value, "label": c.label} for c in choices_cls]


COMPLAINT_NEXT = {
    Complaint.Status.REGISTERED: Complaint.Status.INVESTIGATING,
    Complaint.Status.INVESTIGATING: Complaint.Status.CAPA,
    Complaint.Status.CAPA: Complaint.Status.CLOSED,
}


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_deal(obj: PipelineDeal) -> dict:
    return {
        "id": str(obj.id),
        "title": obj.title,
        "stage": obj.stage,
        "value": _dec(obj.value),
        "party_id": str(obj.party_id) if obj.party_id else None,
        "party_name": obj.party.name if obj.party_id else "",
        "owner_id": str(obj.owner_id) if obj.owner_id else None,
        "owner_name": _emp_name(obj.owner) if obj.owner_id else "",
        "expected_close": _iso(obj.expected_close) or "",
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
    }


def serialize_complaint(obj: Complaint) -> dict:
    return {
        "id": str(obj.id),
        "customer_id": str(obj.customer_id) if obj.customer_id else None,
        "customer_name": _user_name(obj.customer) if obj.customer_id else "",
        "product_id": str(obj.product_id) if obj.product_id else None,
        "product_name": obj.product.name if obj.product_id else "",
        "description": obj.description or "",
        "status": obj.status,
        "registered_at": _iso(obj.registered_at) or "",
        "closed_at": _iso(obj.closed_at) or "",
        "sla_hours": obj.sla_hours or 48,
    }


def serialize_activity(obj: CustomerActivity) -> dict:
    return {
        "id": str(obj.id),
        "party_id": str(obj.party_id) if obj.party_id else None,
        "party_name": obj.party.name if obj.party_id else "",
        "activity_type": obj.activity_type,
        "notes": obj.notes or "",
        "performed_by_id": str(obj.performed_by_id) if obj.performed_by_id else None,
        "performed_by_name": _emp_name(obj.performed_by) if obj.performed_by_id else "",
        "performed_at": _iso(obj.performed_at) or "",
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class CrmOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "open_deals": 0,
            "pipeline_value": 0.0,
            "won_value": 0.0,
            "conversion_pct": 0.0,
            "deals_by_stage": [],
            "open_complaints": 0,
            "complaints_by_status": [],
            "recent_activities": [],
        }
        if not org:
            return Response(empty)

        deals = PipelineDeal.objects.filter(organization=org)
        complaints = Complaint.objects.filter(organization=org)
        activities = CustomerActivity.objects.filter(organization=org)

        open_qs = deals.exclude(
            stage__in=[PipelineDeal.Stage.WON, PipelineDeal.Stage.LOST]
        )
        open_deals = open_qs.count()
        pipeline_value = _dec(open_qs.aggregate(t=Sum("value"))["t"])
        won_value = _dec(
            deals.filter(stage=PipelineDeal.Stage.WON).aggregate(t=Sum("value"))["t"]
        )
        total = deals.count()
        won_count = deals.filter(stage=PipelineDeal.Stage.WON).count()
        conversion_pct = round((won_count / total) * 100, 1) if total else 0.0

        stage_counts = {
            row["stage"]: row
            for row in deals.values("stage").annotate(count=Count("id"), value=Sum("value"))
        }
        deals_by_stage = []
        for value, label in PipelineDeal.Stage.choices:
            row = stage_counts.get(value) or {}
            deals_by_stage.append(
                {
                    "name": label,
                    "code": value,
                    "count": row.get("count") or 0,
                    "value": _dec(row.get("value")),
                }
            )

        status_counts = {
            row["status"]: row["c"]
            for row in complaints.values("status").annotate(c=Count("id"))
        }
        complaints_by_status = [
            {"name": label, "code": value, "value": status_counts.get(value) or 0}
            for value, label in Complaint.Status.choices
        ]

        return Response(
            {
                "open_deals": open_deals,
                "pipeline_value": pipeline_value,
                "won_value": won_value,
                "conversion_pct": conversion_pct,
                "deals_by_stage": deals_by_stage,
                "open_complaints": complaints.exclude(
                    status=Complaint.Status.CLOSED
                ).count(),
                "complaints_by_status": complaints_by_status,
                "recent_activities": [
                    serialize_activity(a)
                    for a in activities.select_related("party", "performed_by").order_by(
                        "-performed_at"
                    )[:10]
                ],
            }
        )


class CrmOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "parties": [],
                    "employees": [],
                    "products": [],
                    "customers": [],
                    "work_orders": [],
                    "deal_stages": _choices(PipelineDeal.Stage),
                    "complaint_statuses": _choices(Complaint.Status),
                    "activity_types": _choices(CustomerActivity.ActivityType),
                }
            )

        member_user_ids = list(
            OrgUser.objects.filter(organization=org, status=OrgUser.Status.ACTIVE).values_list(
                "user_id", flat=True
            )[:300]
        )
        customers = []
        for u in (
            User.objects.filter(pk__in=member_user_ids)
            .select_related("profile")
            .order_by("username")[:200]
        ):
            customers.append({"id": str(u.id), "name": _user_name(u)})

        return Response(
            {
                "parties": [
                    {"id": str(p.id), "name": p.name}
                    for p in Party.objects.filter(organization=org).order_by("name")[:200]
                ],
                "employees": [
                    {"id": str(e.id), "code": e.employee_code, "name": e.full_name}
                    for e in Employee.objects.filter(
                        organization=org, status=Employee.Status.ACTIVE
                    ).order_by("full_name")[:200]
                ],
                "products": [
                    {"id": str(p.id), "name": p.name}
                    for p in Product.objects.filter(seller_org=org).order_by("name")[:200]
                ],
                "customers": customers,
                "work_orders": [
                    {"id": str(wo.id), "wo_no": wo.wo_no}
                    for wo in WorkOrder.objects.filter(organization=org)
                    .exclude(status=WorkOrder.Status.CANCELLED)
                    .order_by("-id")[:100]
                ],
                "deal_stages": _choices(PipelineDeal.Stage),
                "complaint_statuses": _choices(Complaint.Status),
                "activity_types": _choices(CustomerActivity.ActivityType),
            }
        )


# ── Pipeline deals ───────────────────────────────────────────────────────────


class CrmDealsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(PipelineDeal.objects.all(), org).select_related(
            "party", "owner", "work_order"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(party__name__icontains=search)
                | Q(owner__full_name__icontains=search)
            )
        stage = (request.query_params.get("stage") or "").strip()
        if stage:
            qs = qs.filter(stage=stage)
        sort = request.query_params.get("sort") or "-expected_close"
        if sort.lstrip("-") in ("title", "value", "stage", "expected_close"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-expected_close")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_deal(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        party = _get_fk(Party, org, data.get("party_id"))
        owner = _get_fk(Employee, org, data.get("owner_id"))
        title = (data.get("title") or "").strip()
        if not party or not owner or not title:
            return Response(
                {"detail": "party_id, owner_id and title are required."},
                status=400,
            )
        stage = data.get("stage") or PipelineDeal.Stage.LEAD
        if stage not in PipelineDeal.Stage.values:
            stage = PipelineDeal.Stage.LEAD
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        obj = PipelineDeal.objects.create(
            organization=org,
            party=party,
            owner=owner,
            title=title,
            stage=stage,
            value=_decimal(data.get("value")),
            expected_close=_parse_date(data.get("expected_close")),
            work_order=work_order,
        )
        return Response(
            serialize_deal(
                PipelineDeal.objects.select_related("party", "owner", "work_order").get(pk=obj.pk)
            ),
            status=201,
        )


class CrmDealDetailView(DomainAuthMixin, APIView):
    def get(self, request, deal_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(PipelineDeal.objects.all(), org)
            .select_related("party", "owner", "work_order")
            .filter(pk=deal_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_deal(obj))

    def patch(self, request, deal_id):
        org = resolve_org(request.user)
        obj = org_filter(PipelineDeal.objects.all(), org).filter(pk=deal_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        stage = data.get("stage")

        if action == "won" or stage == PipelineDeal.Stage.WON:
            try:
                mark_deal_won(obj, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        elif action == "lost" or stage == PipelineDeal.Stage.LOST:
            try:
                mark_deal_lost(obj, actor=request.user, notes=data.get("notes") or "")
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        elif stage and stage in PipelineDeal.Stage.values:
            obj.stage = stage

        if "title" in data and data.get("title"):
            obj.title = str(data["title"]).strip()
        if "value" in data:
            obj.value = _decimal(data.get("value"))
        if "expected_close" in data:
            obj.expected_close = _parse_date(data.get("expected_close"))
        if "party_id" in data:
            party = _get_fk(Party, org, data.get("party_id"))
            if party:
                obj.party = party
        if "owner_id" in data:
            owner = _get_fk(Employee, org, data.get("owner_id"))
            if owner:
                obj.owner = owner
        if "work_order_id" in data:
            obj.work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        obj.save()
        return Response(
            serialize_deal(
                PipelineDeal.objects.select_related("party", "owner", "work_order").get(pk=obj.pk)
            )
        )

    def delete(self, request, deal_id):
        org = resolve_org(request.user)
        obj = org_filter(PipelineDeal.objects.all(), org).filter(pk=deal_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Complaints ───────────────────────────────────────────────────────────────


class CrmComplaintsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Complaint.objects.all(), org).select_related("customer", "customer__profile", "product")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(description__icontains=search)
                | Q(customer__username__icontains=search)
                | Q(customer__phone__icontains=search)
                | Q(customer__profile__full_name__icontains=search)
                | Q(product__name__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-registered_at"
        if sort.lstrip("-") in ("registered_at", "status", "sla_hours"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-registered_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_complaint(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        action = (data.get("action") or "").strip()
        # Preserve legacy create semantics (action=register or no complaint id)
        if action and action not in ("register", ""):
            return Response({"detail": f"Unknown action: {action}"}, status=400)

        customer_id = data.get("customer_id")
        customer = User.objects.filter(pk=customer_id).first() if customer_id else request.user
        if not customer:
            return Response({"detail": "customer_id is required."}, status=400)
        description = (
            data.get("description") or data.get("issue") or data.get("subject") or ""
        ).strip()
        if not description:
            return Response({"detail": "description is required."}, status=400)

        product = None
        if data.get("product_id"):
            product = Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()

        try:
            sla = int(data.get("sla_hours") or 48)
        except (TypeError, ValueError):
            sla = 48

        try:
            complaint = Complaint.objects.create(
                organization=org,
                customer=customer,
                product=product,
                description=description,
                status=Complaint.Status.REGISTERED,
                sla_hours=max(1, sla),
            )
            register_complaint(complaint, actor=request.user)
        except DomainError as exc:
            return _domain_error(exc)

        return Response(
            serialize_complaint(
                Complaint.objects.select_related("customer", "customer__profile", "product").get(
                    pk=complaint.pk
                )
            ),
            status=201,
        )


class CrmComplaintDetailView(DomainAuthMixin, APIView):
    def get(self, request, complaint_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(Complaint.objects.all(), org)
            .select_related("customer", "customer__profile", "product")
            .filter(pk=complaint_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_complaint(obj))

    def post(self, request, complaint_id):
        """Advance status (legacy action endpoint semantics)."""
        org = resolve_org(request.user)
        obj = org_filter(Complaint.objects.all(), org).filter(pk=complaint_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        if action not in ("advance", "register", ""):
            if action in Complaint.Status.values:
                # allow POST {action: "investigating"} style
                pass
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)

        if action == "register":
            return Response({"detail": "Use POST /crm/complaints/ to register."}, status=400)

        target = data.get("status") or action
        if target in ("advance", ""):
            target = COMPLAINT_NEXT.get(obj.status)
        if not target or target not in Complaint.Status.values:
            return Response({"detail": "Cannot advance further or invalid status."}, status=400)
        try:
            advance_complaint(
                obj,
                status=target,
                actor=request.user,
                create_ncr=bool(data.get("create_ncr")),
            )
            obj.refresh_from_db()
        except DomainError as exc:
            return _domain_error(exc)
        return Response(
            serialize_complaint(
                Complaint.objects.select_related("customer", "customer__profile", "product").get(
                    pk=obj.pk
                )
            )
        )

    def patch(self, request, complaint_id):
        org = resolve_org(request.user)
        obj = org_filter(Complaint.objects.all(), org).filter(pk=complaint_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()

        if action == "advance" or (
            data.get("status") and data.get("status") != obj.status
        ):
            target = data.get("status")
            if action == "advance" or not target:
                target = COMPLAINT_NEXT.get(obj.status) or data.get("status")
            if target and target in Complaint.Status.values:
                try:
                    advance_complaint(
                        obj,
                        status=target,
                        actor=request.user,
                        create_ncr=bool(data.get("create_ncr")),
                    )
                    obj.refresh_from_db()
                except DomainError as exc:
                    return _domain_error(exc)

        if "description" in data:
            obj.description = data.get("description") or ""
        if "sla_hours" in data:
            try:
                obj.sla_hours = max(1, int(data.get("sla_hours") or 48))
            except (TypeError, ValueError):
                pass
        if "customer_id" in data and data.get("customer_id"):
            customer = User.objects.filter(pk=data.get("customer_id")).first()
            if customer:
                obj.customer = customer
        if "product_id" in data:
            obj.product = (
                Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()
                if data.get("product_id")
                else None
            )
        obj.save()
        return Response(
            serialize_complaint(
                Complaint.objects.select_related("customer", "customer__profile", "product").get(
                    pk=obj.pk
                )
            )
        )

    def delete(self, request, complaint_id):
        org = resolve_org(request.user)
        obj = org_filter(Complaint.objects.all(), org).filter(pk=complaint_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Customer activities ──────────────────────────────────────────────────────


class CrmActivitiesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(CustomerActivity.objects.all(), org).select_related(
            "party", "performed_by"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(notes__icontains=search)
                | Q(party__name__icontains=search)
                | Q(performed_by__full_name__icontains=search)
            )
        activity_type = (
            request.query_params.get("activity_type")
            or request.query_params.get("type")
            or ""
        ).strip()
        if activity_type:
            qs = qs.filter(activity_type=activity_type)
        sort = request.query_params.get("sort") or "-performed_at"
        if sort.lstrip("-") in ("performed_at", "activity_type"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-performed_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_activity(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        party = _get_fk(Party, org, data.get("party_id"))
        performed_by = _get_fk(Employee, org, data.get("performed_by_id"))
        activity_type = (data.get("activity_type") or "").strip()
        if not party or not performed_by or not activity_type:
            return Response(
                {"detail": "party_id, performed_by_id and activity_type are required."},
                status=400,
            )
        if activity_type not in CustomerActivity.ActivityType.values:
            return Response({"detail": "Invalid activity_type."}, status=400)
        performed_at = _parse_dt(data.get("performed_at")) or timezone.now()
        obj = CustomerActivity.objects.create(
            organization=org,
            party=party,
            performed_by=performed_by,
            activity_type=activity_type,
            notes=data.get("notes") or "",
            performed_at=performed_at,
        )
        return Response(
            serialize_activity(
                CustomerActivity.objects.select_related("party", "performed_by").get(pk=obj.pk)
            ),
            status=201,
        )


class CrmActivityDetailView(DomainAuthMixin, APIView):
    def get(self, request, activity_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(CustomerActivity.objects.all(), org)
            .select_related("party", "performed_by")
            .filter(pk=activity_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_activity(obj))

    def patch(self, request, activity_id):
        org = resolve_org(request.user)
        obj = org_filter(CustomerActivity.objects.all(), org).filter(pk=activity_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "notes" in data:
            obj.notes = data.get("notes") or ""
        if "activity_type" in data and data["activity_type"] in CustomerActivity.ActivityType.values:
            obj.activity_type = data["activity_type"]
        if "performed_at" in data and data.get("performed_at"):
            dt = _parse_dt(data.get("performed_at"))
            if dt:
                obj.performed_at = dt
        if "party_id" in data:
            party = _get_fk(Party, org, data.get("party_id"))
            if party:
                obj.party = party
        if "performed_by_id" in data:
            emp = _get_fk(Employee, org, data.get("performed_by_id"))
            if emp:
                obj.performed_by = emp
        obj.save()
        return Response(
            serialize_activity(
                CustomerActivity.objects.select_related("party", "performed_by").get(pk=obj.pk)
            )
        )

    def delete(self, request, activity_id):
        org = resolve_org(request.user)
        obj = org_filter(CustomerActivity.objects.all(), org).filter(pk=activity_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
