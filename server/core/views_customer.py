"""Customer portal APIs — overview, orders, addresses, nearest shops.

Profile GET/PATCH is handled by enterprise ProfileView at /auth/profile/
(see core.api.views.ProfileView + enterpriseApi.profile). Do not duplicate here.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Address, NearestShop, Order, OrderItem
from core.views_domain import DomainAuthMixin, _dec, _iso


# Loyalty tiers from lifetime spend (NPR, inclusive lower bounds via else-chain):
#   Member   — spend < 10,000
#   Silver   — spend < 50,000
#   Gold     — spend < 200,000
#   Platinum — otherwise
LOYALTY_MEMBER_MAX = Decimal("10000")
LOYALTY_SILVER_MAX = Decimal("50000")
LOYALTY_GOLD_MAX = Decimal("200000")


def _loyalty_tier(spend: Decimal) -> str:
    if spend < LOYALTY_MEMBER_MAX:
        return "Member"
    if spend < LOYALTY_SILVER_MAX:
        return "Silver"
    if spend < LOYALTY_GOLD_MAX:
        return "Gold"
    return "Platinum"


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


def _decimal_or_none(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def serialize_order_item(item: OrderItem) -> dict:
    return {
        "id": str(item.id),
        "product_id": str(item.product_id) if item.product_id else None,
        "product_name": item.product.name if item.product_id else "",
        "sku": (item.product.sku if item.product_id else "") or "",
        "qty": _dec(item.qty),
        "unit_price": _dec(item.unit_price),
        "amount": _dec(item.amount),
        "discount": _dec(item.discount),
    }


def serialize_order(obj: Order, *, include_items: bool = False) -> dict:
    related = list(obj.items.select_related("product").all()) if hasattr(obj, "items") else []
    items = [serialize_order_item(i) for i in related] if include_items else []
    item_names = [
        (i.product.name if i.product_id else "Item") for i in related[:3]
    ]
    return {
        "id": str(obj.id),
        "order_no": obj.order_no,
        "subtotal": _dec(obj.subtotal),
        "discount": _dec(obj.discount),
        "delivery_fee": _dec(obj.delivery_fee),
        "tax": _dec(obj.tax),
        "total": _dec(obj.total),
        "payment_status": obj.payment_status,
        "order_status": obj.order_status,
        "item_count": len(related),
        "items_summary": ", ".join(item_names) + ("…" if len(related) > 3 else ""),
        "items": items,
        "seller_org_id": str(obj.seller_org_id) if obj.seller_org_id else None,
        "seller_org_name": obj.seller_org.company_name if obj.seller_org_id else "",
        "shipping_address_id": str(obj.shipping_address_id) if obj.shipping_address_id else None,
        "created_at": _iso(obj.created_at) or "",
        "updated_at": _iso(obj.updated_at) or "",
    }


def serialize_address(obj: Address) -> dict:
    return {
        "id": str(obj.id),
        "type": obj.type,
        "type_label": obj.get_type_display(),
        "country": obj.country or "",
        "district": obj.district or "",
        "municipality": obj.municipality or "",
        "ward": obj.ward or "",
        "street": obj.street or "",
        "lat": _dec(obj.lat) if obj.lat is not None else None,
        "lng": _dec(obj.lng) if obj.lng is not None else None,
        "is_default": bool(obj.is_default),
        "line": obj.street or obj.municipality or obj.district or "",
        "city": obj.municipality or obj.district or "",
    }


def serialize_shop(obj: NearestShop) -> dict:
    return {
        "id": str(obj.id),
        "name": obj.name,
        "org_id": str(obj.org_id) if obj.org_id else None,
        "org_name": obj.org.company_name if obj.org_id else "",
        "lat": _dec(obj.lat),
        "lng": _dec(obj.lng),
        "address": obj.address or "",
        "is_active": bool(obj.is_active),
    }


def _apply_address_fields(obj: Address, data: dict, *, create: bool = False) -> list[str]:
    """Apply request fields onto Address. Returns list of validation errors."""
    errors: list[str] = []
    if "type" in data or create:
        type_val = (data.get("type") or Address.Type.HOME).strip()
        valid = {c.value for c in Address.Type}
        if type_val not in valid:
            errors.append(f"Invalid type. Choose from: {', '.join(sorted(valid))}.")
        else:
            obj.type = type_val
    for field in ("country", "district", "municipality", "ward", "street"):
        if field in data or create:
            raw = data.get(field)
            setattr(obj, field, (str(raw).strip() if raw is not None else "") or "")
    if "lat" in data or (create and "lat" in data):
        obj.lat = _decimal_or_none(data.get("lat"))
    if "lng" in data or (create and "lng" in data):
        obj.lng = _decimal_or_none(data.get("lng"))
    if "is_default" in data or create:
        raw = data.get("is_default", False if create else obj.is_default)
        if isinstance(raw, str):
            obj.is_default = raw.strip().lower() in ("1", "true", "yes", "on")
        else:
            obj.is_default = bool(raw)
    return errors


def _clear_other_defaults(user, keep: Address):
    if keep.is_default:
        user.addresses.exclude(pk=keep.pk).filter(is_default=True).update(is_default=False)


# ── Overview ─────────────────────────────────────────────────────────────────


class CustomerOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        user = request.user
        orders_qs = Order.objects.filter(buyer_user=user)
        order_count = orders_qs.count()
        spend_raw = orders_qs.aggregate(t=Sum("total"))["t"]
        total_spend = Decimal(str(spend_raw or 0))
        tier = _loyalty_tier(total_spend)

        recent = list(
            orders_qs.select_related("seller_org")
            .prefetch_related("items__product")
            .order_by("-created_at")[:5]
        )
        address_count = user.addresses.count()
        nearest_count = NearestShop.objects.filter(is_active=True).count()

        return Response(
            {
                "order_count": order_count,
                "total_spend": _dec(total_spend),
                "loyalty": {
                    "tier": tier,
                    "spend": _dec(total_spend),
                },
                "address_count": address_count,
                "nearest_shops_count": nearest_count,
                "open_orders": orders_qs.exclude(
                    order_status__in=(
                        Order.OrderStatus.DELIVERED,
                        Order.OrderStatus.CANCELLED,
                        Order.OrderStatus.RETURNED,
                    )
                ).count(),
                "recent_orders": [serialize_order(o) for o in recent],
            }
        )


# ── Options ──────────────────────────────────────────────────────────────────


class CustomerOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        return Response(
            {
                "address_types": [
                    {"value": c.value, "label": c.label} for c in Address.Type
                ],
                "order_statuses": [
                    {"value": c.value, "label": c.label} for c in Order.OrderStatus
                ],
                "payment_statuses": [
                    {"value": c.value, "label": c.label} for c in Order.PaymentStatus
                ],
            }
        )


# ── Orders (read-only; checkout is separate) ─────────────────────────────────


class CustomerOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = (
            Order.objects.filter(buyer_user=request.user)
            .select_related("seller_org")
            .prefetch_related("items__product")
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(order_no__icontains=search))
        order_status = (request.query_params.get("order_status") or "").strip()
        if order_status:
            qs = qs.filter(order_status=order_status)
        sort = request.query_params.get("sort") or "-created_at"
        allowed = ("order_no", "total", "order_status", "payment_status", "created_at")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_order(o) for o in items], **meta})


class CustomerOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, order_id):
        obj = (
            Order.objects.filter(buyer_user=request.user, pk=order_id)
            .select_related("seller_org", "shipping_address")
            .prefetch_related("items__product")
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_order(obj, include_items=True))


# ── Addresses CRUD ───────────────────────────────────────────────────────────


class CustomerAddressesView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = request.user.addresses.all().order_by("-is_default", "type", "street")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(street__icontains=search)
                | Q(municipality__icontains=search)
                | Q(district__icontains=search)
                | Q(country__icontains=search)
                | Q(ward__icontains=search)
            )
        type_f = (request.query_params.get("type") or "").strip()
        if type_f:
            qs = qs.filter(type=type_f)
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_address(a) for a in items], **meta})

    def post(self, request):
        data = request.data if hasattr(request, "data") else {}
        obj = Address(user=request.user)
        errors = _apply_address_fields(obj, data, create=True)
        if errors:
            return Response({"detail": errors[0], "errors": errors}, status=400)
        # Address model: all geo CharFields are blank=True; type has default. Nothing else required.
        obj.save()
        _clear_other_defaults(request.user, obj)
        return Response(serialize_address(obj), status=201)


class CustomerAddressDetailView(DomainAuthMixin, APIView):
    def _get(self, request, address_id):
        return request.user.addresses.filter(pk=address_id).first()

    def get(self, request, address_id):
        obj = self._get(request, address_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_address(obj))

    def patch(self, request, address_id):
        obj = self._get(request, address_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        errors = _apply_address_fields(obj, request.data, create=False)
        if errors:
            return Response({"detail": errors[0], "errors": errors}, status=400)
        obj.save()
        _clear_other_defaults(request.user, obj)
        return Response(serialize_address(obj))

    def delete(self, request, address_id):
        obj = self._get(request, address_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Nearest shops (read-only) ────────────────────────────────────────────────


class CustomerNearestShopsView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = NearestShop.objects.filter(is_active=True).select_related("org")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            # NearestShop has no city field — search name + address text.
            qs = qs.filter(Q(name__icontains=search) | Q(address__icontains=search))
        sort = request.query_params.get("sort") or "name"
        if sort.lstrip("-") in ("name",):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_shop(s) for s in items], **meta})
