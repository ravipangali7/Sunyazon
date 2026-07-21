"""Payments & Ads module APIs — gateways, transactions, ad campaigns."""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AdCampaign, AdPlan, PaymentGateway, PaymentTransaction
from core.services.common import DomainError
from core.services.payment_service import (
    mark_payment_failed,
    mark_payment_refunded,
    mark_payment_success,
)
from core.views_domain import DomainAuthMixin, _dec, _iso, resolve_org


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


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


def _is_super_admin(user) -> bool:
    return bool(user and (user.is_superuser or getattr(user, "account_type", "") == "super_admin"))


def _txn_qs(org, user):
    qs = PaymentTransaction.objects.select_related(
        "gateway", "order", "ad_campaign", "ad_campaign__advertiser_org"
    )
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(
        Q(order__seller_org=org) | Q(ad_campaign__advertiser_org=org)
    ).distinct()


def _campaign_qs(org, user):
    qs = AdCampaign.objects.select_related(
        "plan", "advertiser_org", "payment_transaction", "payment_transaction__gateway"
    )
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(advertiser_org=org)


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    raw = str(value).strip()
    dt = parse_datetime(raw)
    if dt is not None:
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    d = parse_date(raw)
    if d:
        return timezone.make_aware(
            datetime.combine(d, time.min),
            timezone.get_current_timezone(),
        )
    return None


def serialize_txn(obj: PaymentTransaction) -> dict:
    return {
        "id": str(obj.id),
        "ref": obj.external_txn_id or str(obj.id)[:8],
        "external_txn_id": obj.external_txn_id or "",
        "order_id": str(obj.order_id) if obj.order_id else None,
        "ad_campaign_id": str(obj.ad_campaign_id) if obj.ad_campaign_id else None,
        "ad_campaign_title": obj.ad_campaign.title if obj.ad_campaign_id else "",
        "gateway_id": str(obj.gateway_id) if obj.gateway_id else None,
        "gateway_code": obj.gateway.code if obj.gateway_id else "",
        "gateway_name": obj.gateway.name if obj.gateway_id else "",
        "amount": _dec(obj.amount),
        "currency": obj.currency or "NPR",
        "status": obj.status,
        "payment_method": obj.payment_method or "",
        "metadata_json": obj.metadata_json or {},
        "created_at": _iso(obj.created_at) or "",
    }


def serialize_campaign(obj: AdCampaign) -> dict:
    return {
        "id": str(obj.id),
        "title": obj.title,
        "name": obj.title,
        "advertiser_org_id": str(obj.advertiser_org_id) if obj.advertiser_org_id else None,
        "advertiser_org_name": obj.advertiser_org.company_name if obj.advertiser_org_id else "",
        "plan_id": str(obj.plan_id) if obj.plan_id else None,
        "plan_code": obj.plan.code if obj.plan_id else "",
        "plan_name": obj.plan.name if obj.plan_id else "",
        "content_json": obj.content_json or {},
        "target_audience_json": obj.target_audience_json or {},
        "budget": _dec(obj.budget),
        "spent": _dec(obj.spent),
        "payment_transaction_id": str(obj.payment_transaction_id) if obj.payment_transaction_id else None,
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "process_run_id": str(obj.process_run_id) if obj.process_run_id else None,
        "status": obj.status,
        "start_at": _iso(obj.start_at) or "",
        "end_at": _iso(obj.end_at) or "",
    }


def serialize_gateway(obj: PaymentGateway) -> dict:
    return {
        "id": str(obj.id),
        "code": obj.code,
        "name": obj.name,
        "is_active": obj.is_active,
    }


def serialize_plan(obj: AdPlan) -> dict:
    return {
        "id": str(obj.id),
        "code": obj.code,
        "name": obj.name,
        "price": _dec(obj.price),
        "duration_days": obj.duration_days,
        "impressions_limit": obj.impressions_limit,
        "is_active": obj.is_active,
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class PaymentsOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "settled_amount": 0.0,
            "pending_amount": 0.0,
            "refunded_amount": 0.0,
            "txn_count": 0,
            "by_status": [],
            "active_campaigns": 0,
            "campaign_budget": 0.0,
            "campaign_spent": 0.0,
            "recent_txns": [],
        }
        if not org and not _is_super_admin(request.user):
            return Response(empty)

        txn_qs = _txn_qs(org, request.user)
        campaign_qs = _campaign_qs(org, request.user)

        settled = txn_qs.filter(status=PaymentTransaction.Status.SUCCESS).aggregate(
            t=Sum("amount")
        )["t"]
        pending = txn_qs.filter(status=PaymentTransaction.Status.PENDING).aggregate(
            t=Sum("amount")
        )["t"]
        refunded = txn_qs.filter(status=PaymentTransaction.Status.REFUNDED).aggregate(
            t=Sum("amount")
        )["t"]

        status_counts = {
            row["status"]: row["c"]
            for row in txn_qs.values("status").annotate(c=Count("id"))
        }
        by_status = [
            {
                "name": label,
                "code": code,
                "value": status_counts.get(code, 0),
            }
            for code, label in PaymentTransaction.Status.choices
        ]

        active_campaigns = campaign_qs.filter(status=AdCampaign.Status.ACTIVE)
        budget_agg = active_campaigns.aggregate(b=Sum("budget"), s=Sum("spent"))

        recent = (
            txn_qs.select_related("gateway", "ad_campaign")
            .order_by("-created_at")[:5]
        )

        return Response(
            {
                "settled_amount": _dec(settled),
                "pending_amount": _dec(pending),
                "refunded_amount": _dec(refunded),
                "txn_count": txn_qs.count(),
                "by_status": by_status,
                "active_campaigns": active_campaigns.count(),
                "campaign_budget": _dec(budget_agg["b"]),
                "campaign_spent": _dec(budget_agg["s"]),
                "recent_txns": [serialize_txn(t) for t in recent],
            }
        )


# ── Options ──────────────────────────────────────────────────────────────────


class PaymentsOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        gateways = [
            serialize_gateway(g)
            for g in PaymentGateway.objects.filter(is_active=True).order_by("name")
        ]
        plans = [
            serialize_plan(p)
            for p in AdPlan.objects.filter(is_active=True).order_by("price")
        ]
        return Response(
            {
                "gateways": gateways,
                "ad_plans": plans,
                "txn_statuses": [
                    {"value": c, "label": l} for c, l in PaymentTransaction.Status.choices
                ],
                "campaign_statuses": [
                    {"value": c, "label": l} for c, l in AdCampaign.Status.choices
                ],
                "currencies": ["NPR", "USD", "INR"],
            }
        )


# ── Gateways (read-only) ─────────────────────────────────────────────────────


class PaymentsGatewaysView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = PaymentGateway.objects.all().order_by("name")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_gateway(g) for g in items], **meta})


# ── Transactions ─────────────────────────────────────────────────────────────


class PaymentsTransactionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _txn_qs(org, request.user)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(external_txn_id__icontains=search) | Q(gateway__code__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        gateway = (request.query_params.get("gateway") or "").strip()
        if gateway:
            qs = qs.filter(Q(gateway_id=gateway) | Q(gateway__code=gateway))
        sort = request.query_params.get("sort") or "-created_at"
        allowed = {"created_at", "amount", "status", "external_txn_id"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_txn(t) for t in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org and not _is_super_admin(request.user):
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        gateway_id = data.get("gateway_id")
        gateway = PaymentGateway.objects.filter(pk=gateway_id).first() if gateway_id else None
        if not gateway:
            code = (data.get("gateway_code") or "").strip()
            if code:
                gateway = PaymentGateway.objects.filter(code=code).first()
        if not gateway:
            return Response({"detail": "gateway_id is required."}, status=400)
        amount = _decimal(data.get("amount"))
        if amount <= 0:
            return Response({"detail": "amount must be positive."}, status=400)
        currency = (data.get("currency") or "NPR").strip() or "NPR"
        status = data.get("status") or PaymentTransaction.Status.PENDING
        if status not in dict(PaymentTransaction.Status.choices):
            status = PaymentTransaction.Status.PENDING

        campaign = None
        campaign_id = data.get("ad_campaign_id") or data.get("campaign_id")
        if campaign_id:
            campaign = _campaign_qs(org, request.user).filter(pk=campaign_id).first()
            if not campaign:
                return Response({"detail": "Campaign not found."}, status=404)

        txn = PaymentTransaction.objects.create(
            gateway=gateway,
            ad_campaign=campaign,
            external_txn_id=(data.get("external_txn_id") or "").strip(),
            amount=amount,
            currency=currency,
            status=status,
            payment_method=(data.get("payment_method") or "").strip(),
            metadata_json=data.get("metadata_json") or {},
        )
        txn = (
            PaymentTransaction.objects.select_related("gateway", "ad_campaign")
            .get(pk=txn.pk)
        )
        return Response(serialize_txn(txn), status=201)


class PaymentsTransactionDetailView(DomainAuthMixin, APIView):
    def _get(self, request, txn_id):
        org = resolve_org(request.user)
        return _txn_qs(org, request.user).filter(pk=txn_id).first()

    def get(self, request, txn_id):
        obj = self._get(request, txn_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_txn(obj))

    def post(self, request, txn_id):
        return self.patch(request, txn_id)

    def patch(self, request, txn_id):
        obj = self._get(request, txn_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()

        if action in ("mark_success", "mark_failed", "refund"):
            try:
                if action == "mark_success":
                    if obj.status != PaymentTransaction.Status.PENDING:
                        return Response(
                            {"detail": "Only pending transactions can be marked success."},
                            status=400,
                        )
                    mark_payment_success(
                        obj,
                        actor=request.user,
                        external_txn_id=(data.get("external_txn_id") or ""),
                    )
                elif action == "mark_failed":
                    if obj.status != PaymentTransaction.Status.PENDING:
                        return Response(
                            {"detail": "Only pending transactions can be marked failed."},
                            status=400,
                        )
                    mark_payment_failed(obj, actor=request.user)
                elif action == "refund":
                    if obj.status != PaymentTransaction.Status.SUCCESS:
                        return Response(
                            {"detail": "Only successful transactions can be refunded."},
                            status=400,
                        )
                    mark_payment_refunded(obj, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
            obj = self._get(request, txn_id)
            return Response(serialize_txn(obj))

        if "external_txn_id" in data:
            obj.external_txn_id = (data.get("external_txn_id") or "").strip()
        if "payment_method" in data:
            obj.payment_method = (data.get("payment_method") or "").strip()
        if "metadata_json" in data and isinstance(data.get("metadata_json"), dict):
            obj.metadata_json = data["metadata_json"]
        if "amount" in data and data.get("amount") not in (None, ""):
            amt = _decimal(data.get("amount"))
            if amt > 0:
                obj.amount = amt
        if "currency" in data and data.get("currency"):
            obj.currency = str(data.get("currency")).strip()
        obj.save()
        obj = self._get(request, txn_id)
        return Response(serialize_txn(obj))


# ── Campaigns ────────────────────────────────────────────────────────────────


class PaymentsCampaignsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _campaign_qs(org, request.user)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search))
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-start_at"
        allowed = {"start_at", "end_at", "title", "status", "budget", "spent"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-start_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_campaign(c) for c in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        plan_id = data.get("plan_id")
        plan = AdPlan.objects.filter(pk=plan_id, is_active=True).first() if plan_id else None
        if not plan:
            return Response({"detail": "plan_id is required."}, status=400)
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)
        budget = _decimal(data.get("budget"))
        if budget <= 0:
            return Response({"detail": "budget must be positive."}, status=400)
        start_at = _parse_dt(data.get("start_at"))
        end_at = _parse_dt(data.get("end_at"))
        if not start_at or not end_at:
            return Response({"detail": "start_at and end_at are required."}, status=400)
        if end_at < start_at:
            return Response({"detail": "end_at must be after start_at."}, status=400)

        obj = AdCampaign.objects.create(
            advertiser_org=org,
            plan=plan,
            title=title,
            content_json=data.get("content_json") or {},
            target_audience_json=data.get("target_audience_json") or {},
            budget=budget,
            spent=Decimal("0"),
            status=AdCampaign.Status.DRAFT,
            start_at=start_at,
            end_at=end_at,
        )
        obj = AdCampaign.objects.select_related("plan", "advertiser_org").get(pk=obj.pk)
        return Response(serialize_campaign(obj), status=201)


class PaymentsCampaignDetailView(DomainAuthMixin, APIView):
    def _get(self, request, campaign_id):
        org = resolve_org(request.user)
        return _campaign_qs(org, request.user).filter(pk=campaign_id).first()

    def get(self, request, campaign_id):
        obj = self._get(request, campaign_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_campaign(obj))

    def post(self, request, campaign_id):
        return self.patch(request, campaign_id)

    def patch(self, request, campaign_id):
        obj = self._get(request, campaign_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()

        if action in ("activate", "pause", "complete"):
            transitions = {
                "activate": (AdCampaign.Status.ACTIVE, {AdCampaign.Status.DRAFT, AdCampaign.Status.PAUSED}),
                "pause": (AdCampaign.Status.PAUSED, {AdCampaign.Status.ACTIVE}),
                "complete": (
                    AdCampaign.Status.COMPLETED,
                    {AdCampaign.Status.ACTIVE, AdCampaign.Status.PAUSED, AdCampaign.Status.DRAFT},
                ),
            }
            new_status, allowed_from = transitions[action]
            if obj.status not in allowed_from:
                return Response(
                    {
                        "detail": f"Cannot {action} campaign in status '{obj.status}'.",
                    },
                    status=400,
                )
            obj.status = new_status
            obj.save(update_fields=["status"])
            obj = self._get(request, campaign_id)
            return Response(serialize_campaign(obj))

        if "title" in data and data.get("title"):
            obj.title = str(data.get("title")).strip()
        if "budget" in data and data.get("budget") not in (None, ""):
            budget = _decimal(data.get("budget"))
            if budget > 0:
                obj.budget = budget
        if "plan_id" in data and data.get("plan_id"):
            plan = AdPlan.objects.filter(pk=data.get("plan_id")).first()
            if plan:
                obj.plan = plan
        if "content_json" in data and isinstance(data.get("content_json"), dict):
            obj.content_json = data["content_json"]
        if "target_audience_json" in data and isinstance(data.get("target_audience_json"), dict):
            obj.target_audience_json = data["target_audience_json"]
        if "start_at" in data and data.get("start_at"):
            dt = _parse_dt(data.get("start_at"))
            if dt:
                obj.start_at = dt
        if "end_at" in data and data.get("end_at"):
            dt = _parse_dt(data.get("end_at"))
            if dt:
                obj.end_at = dt
        if "status" in data and data.get("status") in dict(AdCampaign.Status.choices):
            obj.status = data["status"]
        obj.save()
        obj = self._get(request, campaign_id)
        return Response(serialize_campaign(obj))

    def delete(self, request, campaign_id):
        obj = self._get(request, campaign_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
