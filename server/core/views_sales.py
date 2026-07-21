"""Sales module APIs — parties, territories, ASM/dealer/retail orders, returns, schemes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    ASMOrder,
    DealerSalesLine,
    DealerSalesOrder,
    DocStatus,
    Employee,
    Party,
    Product,
    PromotionScheme,
    RetailSalesLine,
    RetailSalesOrder,
    ReturnOrder,
    SalesOrder,
    Territory,
)
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _dec(v) -> float:
    return float(v or 0)


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


def _require_org(request):
    org = resolve_org(request.user)
    if not org:
        return None, Response({"detail": "No organization."}, status=400)
    return org, None


def _get_party(org, party_id):
    if not party_id:
        return None
    return Party.objects.filter(pk=party_id, organization=org).first()


def _get_employee(org, emp_id):
    if not emp_id:
        return None
    return Employee.objects.filter(pk=emp_id, organization=org).first()


def _get_product(org, product_id):
    if not product_id:
        return None
    return Product.objects.filter(pk=product_id, seller_org=org).first()


def _get_territory(org, territory_id):
    if not territory_id:
        return None
    return Territory.objects.filter(pk=territory_id, organization=org).first()


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_party(p: Party) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "party_type": p.party_type,
        "party_type_label": p.get_party_type_display() if hasattr(p, "get_party_type_display") else p.party_type,
        "area": p.area or "",
        "asm_id": str(p.asm_id) if p.asm_id else None,
        "asm_name": p.asm.full_name if p.asm_id else None,
        "credit_limit": _dec(p.credit_limit),
        "status": p.status,
        "status_label": p.get_status_display() if hasattr(p, "get_status_display") else p.status,
    }


def serialize_territory(t: Territory) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "region": t.region or "",
        "asm_id": str(t.asm_id) if t.asm_id else None,
        "asm_name": t.asm.full_name if t.asm_id else None,
        "party_count": Party.objects.filter(organization_id=t.organization_id, area__iexact=t.name).count()
        if t.organization_id
        else 0,
        "route_count": t.routes.count() if hasattr(t, "routes") else 0,
    }


def serialize_asm_order(o: ASMOrder) -> dict:
    return {
        "id": str(o.id),
        "party_id": str(o.party_id),
        "party_name": o.party.name if o.party_id else "",
        "party_type": o.party.party_type if o.party_id else "",
        "asm_id": str(o.asm_id),
        "asm_name": o.asm.full_name if o.asm_id else "",
        "date": _iso(o.date),
        "product_id": str(o.product_id),
        "product_name": o.product.name if o.product_id else "",
        "unit": o.unit or "",
        "qty": _dec(o.qty),
        "price": _dec(o.price),
        "amount": _dec(o.amount),
        "status": o.status,
    }


def serialize_dealer_line(line: DealerSalesLine) -> dict:
    return {
        "id": str(line.id),
        "product_id": str(line.product_id),
        "product_name": line.product.name if line.product_id else "",
        "barcode": line.barcode or "",
        "unit": line.unit or "",
        "qty": _dec(line.qty),
        "price": _dec(line.price),
        "amount": _dec(line.amount),
        "discount": _dec(line.discount),
    }


def serialize_dealer_order(o: DealerSalesOrder, *, include_lines=False) -> dict:
    data = {
        "id": str(o.id),
        "party_id": str(o.party_id),
        "party_name": o.party.name if o.party_id else "",
        "dsm_id": str(o.dsm_id),
        "dsm_name": o.dsm.full_name if o.dsm_id else "",
        "date": _iso(o.date),
        "discount": _dec(o.discount),
        "total": _dec(o.total),
        "status": o.status,
        "line_count": o.lines.count(),
    }
    if include_lines:
        data["lines"] = [serialize_dealer_line(l) for l in o.lines.select_related("product").all()]
    return data


def serialize_retail_line(line: RetailSalesLine) -> dict:
    return {
        "id": str(line.id),
        "product_id": str(line.product_id),
        "product_name": line.product.name if line.product_id else "",
        "barcode": line.barcode or "",
        "unit": line.unit or "",
        "qty": _dec(line.qty),
        "price": _dec(line.price),
        "amount": _dec(line.amount),
        "discount": _dec(line.discount),
    }


def serialize_retail_order(o: RetailSalesOrder, *, include_lines=False) -> dict:
    data = {
        "id": str(o.id),
        "party_id": str(o.party_id),
        "party_name": o.party.name if o.party_id else "",
        "rsm_id": str(o.rsm_id),
        "rsm_name": o.rsm.full_name if o.rsm_id else "",
        "dealer_order_id": str(o.dealer_order_id) if o.dealer_order_id else None,
        "dealer_order_label": (
            f"{o.dealer_order.party.name} @ {o.dealer_order.date}" if o.dealer_order_id else None
        ),
        "date": _iso(o.date),
        "discount": _dec(o.discount),
        "total": _dec(o.total),
        "status": o.status,
        "line_count": o.lines.count(),
    }
    if include_lines:
        data["lines"] = [serialize_retail_line(l) for l in o.lines.select_related("product").all()]
    return data


def serialize_return(r: ReturnOrder) -> dict:
    return {
        "id": str(r.id),
        "original_order_id": str(r.original_order_id) if r.original_order_id else None,
        "party_id": str(r.party_id),
        "party_name": r.party.name if r.party_id else "",
        "reason": r.reason or "",
        "total": _dec(r.total),
        "status": r.status,
    }


def serialize_scheme(s: PromotionScheme) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "code": s.code,
        "budget": _dec(s.budget),
        "start_date": _iso(s.start_date),
        "end_date": _iso(s.end_date),
        "status": s.status,
        "status_label": s.get_status_display() if hasattr(s, "get_status_display") else s.status,
    }


def _sync_dealer_lines(order: DealerSalesOrder, org, lines_data):
    if lines_data is None:
        return
    order.lines.all().delete()
    total = Decimal("0")
    for row in lines_data:
        product = _get_product(org, row.get("product_id"))
        if not product:
            continue
        qty = _decimal(row.get("qty"))
        price = _decimal(row.get("price"))
        discount = _decimal(row.get("discount"))
        amount = _decimal(row.get("amount"), default=str(qty * price - discount))
        DealerSalesLine.objects.create(
            order=order,
            product=product,
            barcode=(row.get("barcode") or "").strip(),
            unit=(row.get("unit") or "").strip(),
            qty=qty,
            price=price,
            amount=amount,
            discount=discount,
        )
        total += amount
    order_discount = order.discount or Decimal("0")
    if lines_data:
        order.total = max(Decimal("0"), total - order_discount)
        order.save(update_fields=["total"])


def _sync_retail_lines(order: RetailSalesOrder, org, lines_data):
    if lines_data is None:
        return
    order.lines.all().delete()
    total = Decimal("0")
    for row in lines_data:
        product = _get_product(org, row.get("product_id"))
        if not product:
            continue
        qty = _decimal(row.get("qty"))
        price = _decimal(row.get("price"))
        discount = _decimal(row.get("discount"))
        amount = _decimal(row.get("amount"), default=str(qty * price - discount))
        RetailSalesLine.objects.create(
            order=order,
            product=product,
            barcode=(row.get("barcode") or "").strip(),
            unit=(row.get("unit") or "").strip(),
            qty=qty,
            price=price,
            amount=amount,
            discount=discount,
        )
        total += amount
    order_discount = order.discount or Decimal("0")
    if lines_data:
        order.total = max(Decimal("0"), total - order_discount)
        order.save(update_fields=["total"])


# ── Overview ─────────────────────────────────────────────────────────────────


class SalesOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "party_count": 0,
            "active_parties": 0,
            "territory_count": 0,
            "asm_orders_today": 0,
            "dealer_orders_today": 0,
            "retail_orders_today": 0,
            "today_sales": 0,
            "open_orders": 0,
            "approved_orders": 0,
            "returns_open": 0,
            "active_schemes": 0,
            "by_region": [],
            "by_party_type": [],
            "by_status": [],
            "recent_asm": [],
            "recent_dealer": [],
            "recent_retail": [],
            "finance_so_total": 0,
            "finance_so_count": 0,
        }
        if not org:
            return Response(empty)

        today = timezone.localdate()
        parties = Party.objects.filter(organization=org)
        territories = Territory.objects.filter(organization=org)
        asm_qs = ASMOrder.objects.filter(organization=org)
        dealer_qs = DealerSalesOrder.objects.filter(organization=org)
        retail_qs = RetailSalesOrder.objects.filter(organization=org)

        asm_today = asm_qs.filter(date=today)
        dealer_today = dealer_qs.filter(date=today)
        retail_today = retail_qs.filter(date=today)

        today_sales = (
            _dec(asm_today.aggregate(t=Sum("amount"))["t"])
            + _dec(dealer_today.aggregate(t=Sum("total"))["t"])
            + _dec(retail_today.aggregate(t=Sum("total"))["t"])
        )

        open_orders = (
            asm_qs.filter(status=DocStatus.DRAFT).count()
            + dealer_qs.filter(status=DocStatus.DRAFT).count()
            + retail_qs.filter(status=DocStatus.DRAFT).count()
        )
        approved_orders = (
            asm_qs.filter(status=DocStatus.APPROVED).count()
            + dealer_qs.filter(status=DocStatus.APPROVED).count()
            + retail_qs.filter(status=DocStatus.APPROVED).count()
        )

        by_region = list(
            territories.values("region")
            .annotate(value=Count("id"))
            .order_by("-value")
        )
        # Prefer sales amount by territory region via party.area matching territory name
        region_sales = []
        for t in territories.order_by("region", "name")[:20]:
            party_ids = list(
                parties.filter(Q(area__iexact=t.name) | Q(area__iexact=t.region)).values_list("id", flat=True)
            )
            amt = Decimal("0")
            if party_ids:
                amt += asm_qs.filter(party_id__in=party_ids).aggregate(
                    t=Coalesce(Sum("amount"), Decimal("0"))
                )["t"]
                amt += dealer_qs.filter(party_id__in=party_ids).aggregate(
                    t=Coalesce(Sum("total"), Decimal("0"))
                )["t"]
                amt += retail_qs.filter(party_id__in=party_ids).aggregate(
                    t=Coalesce(Sum("total"), Decimal("0"))
                )["t"]
            region_sales.append(
                {
                    "region": t.region or t.name,
                    "territory": t.name,
                    "value": _dec(amt),
                }
            )
        if not region_sales:
            # Fallback: aggregate ASM by party.area
            rows = (
                asm_qs.values("party__area")
                .annotate(value=Sum("amount"))
                .order_by("-value")[:10]
            )
            region_sales = [
                {
                    "region": r["party__area"] or "Unassigned",
                    "territory": r["party__area"] or "Unassigned",
                    "value": _dec(r["value"]),
                }
                for r in rows
            ]

        by_party_type = [
            {
                "name": dict(Party.PartyType.choices).get(r["party_type"], r["party_type"]),
                "code": r["party_type"],
                "value": r["value"],
            }
            for r in parties.values("party_type").annotate(value=Count("id")).order_by("-value")
        ]

        status_counts: dict[str, int] = {}
        for qs, field in (
            (asm_qs, "amount"),
            (dealer_qs, "total"),
            (retail_qs, "total"),
        ):
            for row in qs.values("status").annotate(value=Count("id")):
                status_counts[row["status"]] = status_counts.get(row["status"], 0) + row["value"]
        by_status = [
            {"status": k, "count": v}
            for k, v in sorted(status_counts.items(), key=lambda x: -x[1])
        ]

        finance_agg = SalesOrder.objects.filter(organization=org).aggregate(
            t=Sum("total"), c=Count("id")
        )

        return Response(
            {
                "party_count": parties.count(),
                "active_parties": parties.filter(status=Party.Status.ACTIVE).count(),
                "territory_count": territories.count(),
                "asm_orders_today": asm_today.count(),
                "dealer_orders_today": dealer_today.count(),
                "retail_orders_today": retail_today.count(),
                "today_sales": today_sales,
                "open_orders": open_orders,
                "approved_orders": approved_orders,
                "returns_open": ReturnOrder.objects.filter(
                    organization=org, status=DocStatus.DRAFT
                ).count(),
                "active_schemes": PromotionScheme.objects.filter(
                    organization=org, status=PromotionScheme.Status.ACTIVE
                ).count(),
                "by_region": region_sales,
                "by_party_type": by_party_type,
                "by_status": by_status,
                "territory_counts": [
                    {"name": r["region"] or "Unassigned", "value": r["value"]} for r in by_region
                ],
                "recent_asm": [
                    serialize_asm_order(o)
                    for o in asm_qs.select_related("party", "asm", "product").order_by("-date")[:8]
                ],
                "recent_dealer": [
                    serialize_dealer_order(o)
                    for o in dealer_qs.select_related("party", "dsm").order_by("-date")[:8]
                ],
                "recent_retail": [
                    serialize_retail_order(o)
                    for o in retail_qs.select_related("party", "rsm").order_by("-date")[:8]
                ],
                "finance_so_total": _dec(finance_agg["t"]),
                "finance_so_count": finance_agg["c"] or 0,
            }
        )


# ── Options ──────────────────────────────────────────────────────────────────


class SalesOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "parties": [],
                    "employees": [],
                    "products": [],
                    "territories": [],
                    "dealer_orders": [],
                    "party_types": [{"value": v, "label": l} for v, l in Party.PartyType.choices],
                    "party_statuses": [{"value": v, "label": l} for v, l in Party.Status.choices],
                    "doc_statuses": [{"value": v, "label": l} for v, l in DocStatus.choices],
                    "scheme_statuses": [
                        {"value": v, "label": l} for v, l in PromotionScheme.Status.choices
                    ],
                }
            )
        return Response(
            {
                "parties": [
                    {
                        "id": str(p.id),
                        "name": p.name,
                        "party_type": p.party_type,
                        "area": p.area or "",
                        "status": p.status,
                    }
                    for p in Party.objects.filter(organization=org).order_by("name")[:500]
                ],
                "employees": [
                    {
                        "id": str(e.id),
                        "employee_code": e.employee_code,
                        "full_name": e.full_name,
                        "status": e.status,
                    }
                    for e in Employee.objects.filter(organization=org, status=Employee.Status.ACTIVE)
                    .order_by("full_name")[:500]
                ],
                "products": [
                    {
                        "id": str(p.id),
                        "name": p.name,
                        "brand_name": p.brand_name or "",
                        "status": p.status,
                    }
                    for p in Product.objects.filter(seller_org=org)
                    .exclude(status=Product.Status.ARCHIVED)
                    .order_by("name")[:500]
                ],
                "territories": [
                    {"id": str(t.id), "name": t.name, "region": t.region or ""}
                    for t in Territory.objects.filter(organization=org).order_by("name")[:200]
                ],
                "dealer_orders": [
                    {
                        "id": str(o.id),
                        "label": f"{o.party.name} · {o.date} · {o.status}",
                        "party_id": str(o.party_id),
                        "date": _iso(o.date),
                        "status": o.status,
                    }
                    for o in DealerSalesOrder.objects.filter(organization=org)
                    .select_related("party")
                    .order_by("-date")[:100]
                ],
                "party_types": [{"value": v, "label": l} for v, l in Party.PartyType.choices],
                "party_statuses": [{"value": v, "label": l} for v, l in Party.Status.choices],
                "doc_statuses": [{"value": v, "label": l} for v, l in DocStatus.choices],
                "scheme_statuses": [
                    {"value": v, "label": l} for v, l in PromotionScheme.Status.choices
                ],
            }
        )


# ── Parties ──────────────────────────────────────────────────────────────────


class SalesPartiesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Party.objects.select_related("asm"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(area__icontains=search)
                | Q(asm__full_name__icontains=search)
            )
        party_type = request.query_params.get("party_type")
        if party_type:
            qs = qs.filter(party_type=party_type)
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        asm_id = request.query_params.get("asm_id")
        if asm_id:
            qs = qs.filter(asm_id=asm_id)
        sort = request.query_params.get("sort") or "name"
        allowed = {"name", "party_type", "area", "credit_limit", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_party(p) for p in items], **meta})

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        name = (data.get("name") or "").strip()
        party_type = data.get("party_type") or Party.PartyType.DEALER
        if not name:
            return Response({"detail": "name is required."}, status=400)
        if party_type not in Party.PartyType.values:
            return Response({"detail": "Invalid party_type."}, status=400)
        status = data.get("status") or Party.Status.ACTIVE
        if status not in Party.Status.values:
            return Response({"detail": "Invalid status."}, status=400)
        asm = _get_employee(org, data.get("asm_id"))
        if data.get("asm_id") and not asm:
            return Response({"detail": "ASM not found."}, status=404)
        p = Party.objects.create(
            organization=org,
            name=name,
            party_type=party_type,
            area=(data.get("area") or "").strip(),
            asm=asm,
            credit_limit=_decimal(data.get("credit_limit")),
            status=status,
        )
        return Response(serialize_party(p), status=201)


class SalesPartyDetailView(DomainAuthMixin, APIView):
    def get(self, request, party_id):
        org = resolve_org(request.user)
        p = org_filter(Party.objects.select_related("asm"), org).filter(pk=party_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_party(p))

    def patch(self, request, party_id):
        org = resolve_org(request.user)
        p = org_filter(Party.objects.select_related("asm"), org).filter(pk=party_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            p.name = str(data["name"]).strip()
        if "party_type" in data:
            if data["party_type"] not in Party.PartyType.values:
                return Response({"detail": "Invalid party_type."}, status=400)
            p.party_type = data["party_type"]
        if "area" in data:
            p.area = (data.get("area") or "").strip()
        if "credit_limit" in data:
            p.credit_limit = _decimal(data.get("credit_limit"))
        if "status" in data:
            if data["status"] not in Party.Status.values:
                return Response({"detail": "Invalid status."}, status=400)
            p.status = data["status"]
        if "asm_id" in data:
            aid = data.get("asm_id")
            if aid:
                asm = _get_employee(org, aid)
                if not asm:
                    return Response({"detail": "ASM not found."}, status=404)
                p.asm = asm
            else:
                p.asm = None
        p.save()
        return Response(serialize_party(p))

    def delete(self, request, party_id):
        org = resolve_org(request.user)
        p = org_filter(Party.objects.all(), org).filter(pk=party_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        if (
            p.asm_orders.exists()
            or p.dealer_orders.exists()
            or p.retail_orders.exists()
            or p.return_orders.exists()
            or p.sales_orders.exists()
        ):
            return Response(
                {"detail": "Cannot delete party with linked orders."},
                status=400,
            )
        p.delete()
        return Response(status=204)


# ── Territories ──────────────────────────────────────────────────────────────


class SalesTerritoriesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Territory.objects.select_related("asm"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(region__icontains=search)
                | Q(asm__full_name__icontains=search)
            )
        region = request.query_params.get("region")
        if region:
            qs = qs.filter(region__icontains=region)
        asm_id = request.query_params.get("asm_id")
        if asm_id:
            qs = qs.filter(asm_id=asm_id)
        sort = request.query_params.get("sort") or "name"
        allowed = {"name", "region"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_territory(t) for t in items], **meta})

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        asm = _get_employee(org, data.get("asm_id"))
        if data.get("asm_id") and not asm:
            return Response({"detail": "ASM not found."}, status=404)
        t = Territory.objects.create(
            organization=org,
            name=name,
            region=(data.get("region") or "").strip(),
            asm=asm,
        )
        return Response(serialize_territory(t), status=201)


class SalesTerritoryDetailView(DomainAuthMixin, APIView):
    def get(self, request, territory_id):
        org = resolve_org(request.user)
        t = org_filter(Territory.objects.select_related("asm"), org).filter(pk=territory_id).first()
        if not t:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_territory(t))

    def patch(self, request, territory_id):
        org = resolve_org(request.user)
        t = org_filter(Territory.objects.select_related("asm"), org).filter(pk=territory_id).first()
        if not t:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            t.name = str(data["name"]).strip()
        if "region" in data:
            t.region = (data.get("region") or "").strip()
        if "asm_id" in data:
            aid = data.get("asm_id")
            if aid:
                asm = _get_employee(org, aid)
                if not asm:
                    return Response({"detail": "ASM not found."}, status=404)
                t.asm = asm
            else:
                t.asm = None
        t.save()
        return Response(serialize_territory(t))

    def delete(self, request, territory_id):
        org = resolve_org(request.user)
        t = org_filter(Territory.objects.all(), org).filter(pk=territory_id).first()
        if not t:
            return Response({"detail": "Not found."}, status=404)
        if t.routes.exists():
            return Response({"detail": "Cannot delete territory with linked routes."}, status=400)
        t.delete()
        return Response(status=204)


# ── ASM Orders ───────────────────────────────────────────────────────────────


class SalesASMOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            ASMOrder.objects.select_related("party", "asm", "product"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(party__name__icontains=search)
                | Q(product__name__icontains=search)
                | Q(asm__full_name__icontains=search)
            )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        party_id = request.query_params.get("party_id")
        if party_id:
            qs = qs.filter(party_id=party_id)
        asm_id = request.query_params.get("asm_id")
        if asm_id:
            qs = qs.filter(asm_id=asm_id)
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        sort = request.query_params.get("sort") or "-date"
        allowed = {"date", "amount", "qty", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_asm_order(o) for o in items], **meta})

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        party = _get_party(org, data.get("party_id"))
        asm = _get_employee(org, data.get("asm_id"))
        product = _get_product(org, data.get("product_id"))
        if not party:
            return Response({"detail": "party_id is required."}, status=400)
        if not asm:
            return Response({"detail": "asm_id is required."}, status=400)
        if not product:
            return Response({"detail": "product_id is required."}, status=400)
        order_date = _parse_date(data.get("date")) or date.today()
        qty = _decimal(data.get("qty"))
        price = _decimal(data.get("price"))
        amount = _decimal(data.get("amount"), default=str(qty * price))
        status = data.get("status") or DocStatus.DRAFT
        if status not in DocStatus.values:
            return Response({"detail": "Invalid status."}, status=400)
        o = ASMOrder.objects.create(
            organization=org,
            party=party,
            asm=asm,
            date=order_date,
            product=product,
            unit=(data.get("unit") or "").strip(),
            qty=qty,
            price=price,
            amount=amount,
            status=status,
        )
        return Response(serialize_asm_order(o), status=201)


class SalesASMOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(ASMOrder.objects.select_related("party", "asm", "product"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_asm_order(o))

    def patch(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(ASMOrder.objects.select_related("party", "asm", "product"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "party_id" in data:
            party = _get_party(org, data.get("party_id"))
            if not party:
                return Response({"detail": "Party not found."}, status=404)
            o.party = party
        if "asm_id" in data:
            asm = _get_employee(org, data.get("asm_id"))
            if not asm:
                return Response({"detail": "ASM not found."}, status=404)
            o.asm = asm
        if "product_id" in data:
            product = _get_product(org, data.get("product_id"))
            if not product:
                return Response({"detail": "Product not found."}, status=404)
            o.product = product
        if "date" in data:
            d = _parse_date(data.get("date"))
            if d:
                o.date = d
        if "unit" in data:
            o.unit = (data.get("unit") or "").strip()
        if "qty" in data:
            o.qty = _decimal(data.get("qty"))
        if "price" in data:
            o.price = _decimal(data.get("price"))
        if "amount" in data:
            o.amount = _decimal(data.get("amount"))
        elif "qty" in data or "price" in data:
            o.amount = (o.qty or Decimal("0")) * (o.price or Decimal("0"))
        if "status" in data:
            if data["status"] not in DocStatus.values:
                return Response({"detail": "Invalid status."}, status=400)
            o.status = data["status"]
        o.save()
        return Response(serialize_asm_order(o))

    def delete(self, request, order_id):
        org = resolve_org(request.user)
        o = org_filter(ASMOrder.objects.all(), org).filter(pk=order_id).first()
        if not o:
            return Response({"detail": "Not found."}, status=404)
        o.delete()
        return Response(status=204)

    def post(self, request, order_id):
        """Approve / cancel ASM order."""
        org = resolve_org(request.user)
        o = (
            org_filter(ASMOrder.objects.select_related("party", "asm", "product"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if action == "approve":
            o.status = DocStatus.APPROVED
        elif action == "post":
            o.status = DocStatus.POSTED
        elif action == "cancel":
            o.status = DocStatus.CANCELLED
        else:
            return Response({"detail": "action must be approve, post, or cancel."}, status=400)
        o.save(update_fields=["status"])
        return Response(serialize_asm_order(o))


# ── Dealer Orders ────────────────────────────────────────────────────────────


class SalesDealerOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(DealerSalesOrder.objects.select_related("party", "dsm"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(party__name__icontains=search) | Q(dsm__full_name__icontains=search)
            )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        party_id = request.query_params.get("party_id")
        if party_id:
            qs = qs.filter(party_id=party_id)
        sort = request.query_params.get("sort") or "-date"
        allowed = {"date", "total", "discount", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        include_lines = (request.query_params.get("include_lines") or "").lower() in (
            "1",
            "true",
            "yes",
        )
        items, meta = _paginate(qs, request)
        return Response(
            {
                "results": [
                    serialize_dealer_order(o, include_lines=include_lines) for o in items
                ],
                **meta,
            }
        )

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        party = _get_party(org, data.get("party_id"))
        dsm = _get_employee(org, data.get("dsm_id"))
        if not party:
            return Response({"detail": "party_id is required."}, status=400)
        if not dsm:
            return Response({"detail": "dsm_id is required."}, status=400)
        status = data.get("status") or DocStatus.DRAFT
        if status not in DocStatus.values:
            return Response({"detail": "Invalid status."}, status=400)
        o = DealerSalesOrder.objects.create(
            organization=org,
            party=party,
            dsm=dsm,
            date=_parse_date(data.get("date")) or date.today(),
            discount=_decimal(data.get("discount")),
            total=_decimal(data.get("total")),
            status=status,
        )
        _sync_dealer_lines(o, org, data.get("lines"))
        o.refresh_from_db()
        return Response(serialize_dealer_order(o, include_lines=True), status=201)


class SalesDealerOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(DealerSalesOrder.objects.select_related("party", "dsm"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_dealer_order(o, include_lines=True))

    def patch(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(DealerSalesOrder.objects.select_related("party", "dsm"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "party_id" in data:
            party = _get_party(org, data.get("party_id"))
            if not party:
                return Response({"detail": "Party not found."}, status=404)
            o.party = party
        if "dsm_id" in data:
            dsm = _get_employee(org, data.get("dsm_id"))
            if not dsm:
                return Response({"detail": "DSM not found."}, status=404)
            o.dsm = dsm
        if "date" in data:
            d = _parse_date(data.get("date"))
            if d:
                o.date = d
        if "discount" in data:
            o.discount = _decimal(data.get("discount"))
        if "total" in data and "lines" not in data:
            o.total = _decimal(data.get("total"))
        if "status" in data:
            if data["status"] not in DocStatus.values:
                return Response({"detail": "Invalid status."}, status=400)
            o.status = data["status"]
        o.save()
        if "lines" in data:
            _sync_dealer_lines(o, org, data.get("lines"))
            o.refresh_from_db()
        return Response(serialize_dealer_order(o, include_lines=True))

    def delete(self, request, order_id):
        org = resolve_org(request.user)
        o = org_filter(DealerSalesOrder.objects.all(), org).filter(pk=order_id).first()
        if not o:
            return Response({"detail": "Not found."}, status=404)
        if o.retail_orders.exists():
            return Response(
                {"detail": "Cannot delete dealer order linked to retail orders."},
                status=400,
            )
        o.delete()
        return Response(status=204)

    def post(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(DealerSalesOrder.objects.select_related("party", "dsm"), org)
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if action == "approve":
            o.status = DocStatus.APPROVED
        elif action == "post":
            o.status = DocStatus.POSTED
        elif action == "cancel":
            o.status = DocStatus.CANCELLED
        else:
            return Response({"detail": "action must be approve, post, or cancel."}, status=400)
        o.save(update_fields=["status"])
        return Response(serialize_dealer_order(o, include_lines=True))


# ── Retail Orders ────────────────────────────────────────────────────────────


class SalesRetailOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            RetailSalesOrder.objects.select_related("party", "rsm", "dealer_order"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(party__name__icontains=search) | Q(rsm__full_name__icontains=search)
            )
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        party_id = request.query_params.get("party_id")
        if party_id:
            qs = qs.filter(party_id=party_id)
        sort = request.query_params.get("sort") or "-date"
        allowed = {"date", "total", "discount", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        include_lines = (request.query_params.get("include_lines") or "").lower() in (
            "1",
            "true",
            "yes",
        )
        items, meta = _paginate(qs, request)
        return Response(
            {
                "results": [
                    serialize_retail_order(o, include_lines=include_lines) for o in items
                ],
                **meta,
            }
        )

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        party = _get_party(org, data.get("party_id"))
        rsm = _get_employee(org, data.get("rsm_id"))
        if not party:
            return Response({"detail": "party_id is required."}, status=400)
        if not rsm:
            return Response({"detail": "rsm_id is required."}, status=400)
        dealer_order = None
        if data.get("dealer_order_id"):
            dealer_order = DealerSalesOrder.objects.filter(
                pk=data["dealer_order_id"], organization=org
            ).first()
            if not dealer_order:
                return Response({"detail": "Dealer order not found."}, status=404)
        status = data.get("status") or DocStatus.DRAFT
        if status not in DocStatus.values:
            return Response({"detail": "Invalid status."}, status=400)
        o = RetailSalesOrder.objects.create(
            organization=org,
            party=party,
            rsm=rsm,
            dealer_order=dealer_order,
            date=_parse_date(data.get("date")) or date.today(),
            discount=_decimal(data.get("discount")),
            total=_decimal(data.get("total")),
            status=status,
        )
        _sync_retail_lines(o, org, data.get("lines"))
        o.refresh_from_db()
        return Response(serialize_retail_order(o, include_lines=True), status=201)


class SalesRetailOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(
                RetailSalesOrder.objects.select_related("party", "rsm", "dealer_order"),
                org,
            )
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_retail_order(o, include_lines=True))

    def patch(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(
                RetailSalesOrder.objects.select_related("party", "rsm", "dealer_order"),
                org,
            )
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "party_id" in data:
            party = _get_party(org, data.get("party_id"))
            if not party:
                return Response({"detail": "Party not found."}, status=404)
            o.party = party
        if "rsm_id" in data:
            rsm = _get_employee(org, data.get("rsm_id"))
            if not rsm:
                return Response({"detail": "RSM not found."}, status=404)
            o.rsm = rsm
        if "dealer_order_id" in data:
            did = data.get("dealer_order_id")
            if did:
                dealer_order = DealerSalesOrder.objects.filter(pk=did, organization=org).first()
                if not dealer_order:
                    return Response({"detail": "Dealer order not found."}, status=404)
                o.dealer_order = dealer_order
            else:
                o.dealer_order = None
        if "date" in data:
            d = _parse_date(data.get("date"))
            if d:
                o.date = d
        if "discount" in data:
            o.discount = _decimal(data.get("discount"))
        if "total" in data and "lines" not in data:
            o.total = _decimal(data.get("total"))
        if "status" in data:
            if data["status"] not in DocStatus.values:
                return Response({"detail": "Invalid status."}, status=400)
            o.status = data["status"]
        o.save()
        if "lines" in data:
            _sync_retail_lines(o, org, data.get("lines"))
            o.refresh_from_db()
        return Response(serialize_retail_order(o, include_lines=True))

    def delete(self, request, order_id):
        org = resolve_org(request.user)
        o = org_filter(RetailSalesOrder.objects.all(), org).filter(pk=order_id).first()
        if not o:
            return Response({"detail": "Not found."}, status=404)
        o.delete()
        return Response(status=204)

    def post(self, request, order_id):
        org = resolve_org(request.user)
        o = (
            org_filter(
                RetailSalesOrder.objects.select_related("party", "rsm", "dealer_order"),
                org,
            )
            .filter(pk=order_id)
            .first()
        )
        if not o:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if action == "approve":
            o.status = DocStatus.APPROVED
        elif action == "post":
            o.status = DocStatus.POSTED
        elif action == "cancel":
            o.status = DocStatus.CANCELLED
        else:
            return Response({"detail": "action must be approve, post, or cancel."}, status=400)
        o.save(update_fields=["status"])
        return Response(serialize_retail_order(o, include_lines=True))


# ── Returns ──────────────────────────────────────────────────────────────────


class SalesReturnsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(ReturnOrder.objects.select_related("party"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(party__name__icontains=search) | Q(reason__icontains=search))
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        party_id = request.query_params.get("party_id")
        if party_id:
            qs = qs.filter(party_id=party_id)
        sort = request.query_params.get("sort") or "-id"
        allowed = {"total", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_return(r) for r in items], **meta})

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        party = _get_party(org, data.get("party_id"))
        if not party:
            return Response({"detail": "party_id is required."}, status=400)
        status = data.get("status") or DocStatus.DRAFT
        if status not in DocStatus.values:
            return Response({"detail": "Invalid status."}, status=400)
        original = data.get("original_order_id") or None
        r = ReturnOrder.objects.create(
            organization=org,
            party=party,
            original_order_id=original,
            reason=(data.get("reason") or "").strip(),
            total=_decimal(data.get("total")),
            status=status,
        )
        return Response(serialize_return(r), status=201)


class SalesReturnDetailView(DomainAuthMixin, APIView):
    def get(self, request, return_id):
        org = resolve_org(request.user)
        r = org_filter(ReturnOrder.objects.select_related("party"), org).filter(pk=return_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_return(r))

    def patch(self, request, return_id):
        org = resolve_org(request.user)
        r = org_filter(ReturnOrder.objects.select_related("party"), org).filter(pk=return_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "party_id" in data:
            party = _get_party(org, data.get("party_id"))
            if not party:
                return Response({"detail": "Party not found."}, status=404)
            r.party = party
        if "original_order_id" in data:
            r.original_order_id = data.get("original_order_id") or None
        if "reason" in data:
            r.reason = (data.get("reason") or "").strip()
        if "total" in data:
            r.total = _decimal(data.get("total"))
        if "status" in data:
            if data["status"] not in DocStatus.values:
                return Response({"detail": "Invalid status."}, status=400)
            r.status = data["status"]
        r.save()
        return Response(serialize_return(r))

    def delete(self, request, return_id):
        org = resolve_org(request.user)
        r = org_filter(ReturnOrder.objects.all(), org).filter(pk=return_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        r.delete()
        return Response(status=204)

    def post(self, request, return_id):
        org = resolve_org(request.user)
        r = org_filter(ReturnOrder.objects.select_related("party"), org).filter(pk=return_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if action == "approve":
            r.status = DocStatus.APPROVED
        elif action == "post":
            r.status = DocStatus.POSTED
        elif action == "cancel":
            r.status = DocStatus.CANCELLED
        else:
            return Response({"detail": "action must be approve, post, or cancel."}, status=400)
        r.save(update_fields=["status"])
        return Response(serialize_return(r))


# ── Promotion Schemes ────────────────────────────────────────────────────────


class SalesSchemesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(PromotionScheme.objects.all(), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-start_date"
        allowed = {"name", "code", "budget", "start_date", "end_date", "status"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-start_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_scheme(s) for s in items], **meta})

    def post(self, request):
        org, err = _require_org(request)
        if err:
            return err
        data = request.data
        name = (data.get("name") or "").strip()
        code = (data.get("code") or "").strip()
        if not name or not code:
            return Response({"detail": "name and code are required."}, status=400)
        status = data.get("status") or PromotionScheme.Status.DRAFT
        if status not in PromotionScheme.Status.values:
            return Response({"detail": "Invalid status."}, status=400)
        s = PromotionScheme.objects.create(
            organization=org,
            name=name,
            code=code,
            budget=_decimal(data.get("budget")),
            start_date=_parse_date(data.get("start_date")),
            end_date=_parse_date(data.get("end_date")),
            status=status,
        )
        return Response(serialize_scheme(s), status=201)


class SalesSchemeDetailView(DomainAuthMixin, APIView):
    def get(self, request, scheme_id):
        org = resolve_org(request.user)
        s = org_filter(PromotionScheme.objects.all(), org).filter(pk=scheme_id).first()
        if not s:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_scheme(s))

    def patch(self, request, scheme_id):
        org = resolve_org(request.user)
        s = org_filter(PromotionScheme.objects.all(), org).filter(pk=scheme_id).first()
        if not s:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            s.name = str(data["name"]).strip()
        if "code" in data and data["code"]:
            s.code = str(data["code"]).strip()
        if "budget" in data:
            s.budget = _decimal(data.get("budget"))
        if "start_date" in data:
            s.start_date = _parse_date(data.get("start_date"))
        if "end_date" in data:
            s.end_date = _parse_date(data.get("end_date"))
        if "status" in data:
            if data["status"] not in PromotionScheme.Status.values:
                return Response({"detail": "Invalid status."}, status=400)
            s.status = data["status"]
        s.save()
        return Response(serialize_scheme(s))

    def delete(self, request, scheme_id):
        org = resolve_org(request.user)
        s = org_filter(PromotionScheme.objects.all(), org).filter(pk=scheme_id).first()
        if not s:
            return Response({"detail": "Not found."}, status=404)
        s.delete()
        return Response(status=204)
