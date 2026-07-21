"""Commerce (Seller Centre) module APIs — overview, products, orders, categories."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Category, Order, OrderItem, Product, Review
from core.services.checkout_service import cancel_order
from core.services.common import DomainError
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


def _buyer_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and getattr(profile, "full_name", None):
        return profile.full_name
    return user.get_full_name() or getattr(user, "username", "") or ""


def _unique_product_slug(org, name: str, *, exclude_pk=None) -> str:
    base = slugify(name)[:200] or "product"
    slug = base
    n = 1
    while True:
        qs = Product.objects.filter(seller_org=org, slug=slug)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return slug
        n += 1
        slug = f"{base}-{n}"


def _unique_category_slug(name: str, *, exclude_pk=None) -> str:
    base = slugify(name)[:200] or "category"
    slug = base
    n = 1
    while True:
        qs = Category.objects.filter(slug=slug)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return slug
        n += 1
        slug = f"{base}-{n}"


def _choices(model_choices) -> list[dict]:
    return [{"value": v, "label": str(lbl)} for v, lbl in model_choices]


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_category(obj: Category) -> dict:
    return {
        "id": str(obj.id),
        "name": obj.name,
        "slug": obj.slug,
        "parent_id": str(obj.parent_id) if obj.parent_id else None,
        "parent_name": obj.parent.name if obj.parent_id else "",
        "sort_order": obj.sort_order,
        "is_active": obj.is_active,
        "product_count": getattr(obj, "_product_count", None)
        if getattr(obj, "_product_count", None) is not None
        else obj.products.count(),
    }


def serialize_product(obj: Product) -> dict:
    avg_rating = getattr(obj, "_avg_rating", None)
    if avg_rating is None and hasattr(obj, "reviews"):
        avg_rating = obj.reviews.aggregate(a=Avg("rating"))["a"]
    return {
        "id": str(obj.id),
        "name": obj.name,
        "slug": obj.slug,
        "sku": obj.sku or "",
        "brand_name": obj.brand_name or "",
        "description": obj.description or "",
        "price": _dec(obj.price),
        "currency": obj.currency or "NPR",
        "stock_qty": _dec(obj.stock_qty),
        "status": obj.status,
        "category_id": str(obj.category_id) if obj.category_id else None,
        "category_name": obj.category.name if obj.category_id else "",
        "condition": obj.condition,
        "plan_type": obj.plan_type,
        "rating": round(float(avg_rating or 0), 2),
        "created_at": _iso(obj.created_at) or "",
        "updated_at": _iso(obj.updated_at) or "",
    }


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


def serialize_order(obj: Order, *, include_items: bool = True) -> dict:
    items = []
    if include_items:
        related = obj.items.select_related("product").all() if hasattr(obj, "items") else []
        items = [serialize_order_item(i) for i in related]
    return {
        "id": str(obj.id),
        "order_no": obj.order_no,
        "buyer_user_id": str(obj.buyer_user_id) if obj.buyer_user_id else None,
        "buyer_name": _buyer_name(obj.buyer_user) if obj.buyer_user_id else "",
        "subtotal": _dec(obj.subtotal),
        "discount": _dec(obj.discount),
        "delivery_fee": _dec(obj.delivery_fee),
        "tax": _dec(obj.tax),
        "total": _dec(obj.total),
        "payment_status": obj.payment_status,
        "order_status": obj.order_status,
        "item_count": len(items) if include_items else obj.items.count(),
        "items": items,
        "created_at": _iso(obj.created_at) or "",
        "updated_at": _iso(obj.updated_at) or "",
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class CommerceOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        empty = {
            "gmv_30d": 0,
            "orders_30d": 0,
            "aov": 0,
            "avg_rating": 0,
            "low_stock_count": 0,
            "products_by_status": [],
            "orders_by_status": [],
            "revenue_trend": [],
        }
        org = resolve_org(request.user)
        if not org:
            return Response(empty)

        now = timezone.now()
        since_30 = now - timedelta(days=30)
        since_7 = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

        products_qs = Product.objects.filter(seller_org=org)
        orders_qs = Order.objects.filter(seller_org=org)
        orders_30 = orders_qs.filter(created_at__gte=since_30)

        gmv = _dec(orders_30.aggregate(t=Sum("total"))["t"])
        orders_30d = orders_30.count()
        aov = round(gmv / orders_30d, 2) if orders_30d else 0.0

        avg_rating = _dec(
            Review.objects.filter(product__seller_org=org).aggregate(a=Avg("rating"))["a"]
        )

        products_by_status = [
            {
                "name": label,
                "code": value,
                "value": products_qs.filter(status=value).count(),
            }
            for value, label in Product.Status.choices
        ]

        orders_by_status = [
            {
                "name": label,
                "code": value,
                "value": orders_qs.filter(order_status=value).count(),
            }
            for value, label in Order.OrderStatus.choices
        ]

        low_stock_count = products_qs.filter(
            status=Product.Status.PUBLISHED,
            stock_qty__lte=50,
        ).count()

        trend_rows = (
            orders_qs.filter(created_at__gte=since_7)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(revenue=Sum("total"), orders=Count("id"))
            .order_by("day")
        )
        by_day = {
            (row["day"].isoformat() if row["day"] else ""): {
                "date": row["day"].isoformat() if row["day"] else "",
                "revenue": _dec(row["revenue"]),
                "orders": row["orders"] or 0,
            }
            for row in trend_rows
        }
        revenue_trend = []
        for i in range(7):
            d = (since_7 + timedelta(days=i)).date()
            key = d.isoformat()
            revenue_trend.append(
                by_day.get(key, {"date": key, "revenue": 0.0, "orders": 0})
            )

        return Response(
            {
                "gmv_30d": gmv,
                "orders_30d": orders_30d,
                "aov": aov,
                "avg_rating": round(float(avg_rating or 0), 2),
                "low_stock_count": low_stock_count,
                "products_by_status": products_by_status,
                "orders_by_status": orders_by_status,
                "revenue_trend": revenue_trend,
            }
        )


class CommerceOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        categories = [
            {"id": str(c.id), "name": c.name}
            for c in Category.objects.filter(is_active=True).order_by("sort_order", "name")[:300]
        ]
        brands: list[str] = []
        if org:
            brands = list(
                Product.objects.filter(seller_org=org)
                .exclude(brand_name="")
                .values_list("brand_name", flat=True)
                .distinct()
                .order_by("brand_name")[:200]
            )
        return Response(
            {
                "categories": categories,
                "product_statuses": _choices(Product.Status.choices),
                "order_statuses": _choices(Order.OrderStatus.choices),
                "payment_statuses": _choices(Order.PaymentStatus.choices),
                "brands": brands,
            }
        )


# ── Products ─────────────────────────────────────────────────────────────────


class CommerceProductsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {"results": [], "count": 0, "page": 1, "page_size": 50, "total_pages": 1}
            )
        qs = (
            Product.objects.filter(seller_org=org)
            .select_related("category")
            .annotate(_avg_rating=Avg("reviews__rating"))
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(brand_name__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        category = (request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category_id=category)
        sort = request.query_params.get("sort") or "-created_at"
        allowed = ("name", "sku", "price", "stock_qty", "status", "created_at", "brand_name")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_product(p) for p in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        status = data.get("status") or Product.Status.DRAFT
        if status not in Product.Status.values:
            status = Product.Status.DRAFT
        category = None
        if data.get("category_id") or data.get("category"):
            category = Category.objects.filter(
                pk=data.get("category_id") or data.get("category")
            ).first()
        slug = (data.get("slug") or "").strip() or _unique_product_slug(org, name)
        if Product.objects.filter(seller_org=org, slug=slug).exists():
            slug = _unique_product_slug(org, name)
        obj = Product.objects.create(
            seller_org=org,
            category=category,
            name=name,
            slug=slug,
            description=data.get("description") or "",
            brand_name=(data.get("brand_name") or data.get("brand") or "").strip(),
            price=_decimal(data.get("price")),
            stock_qty=_decimal(data.get("stock_qty") or data.get("stock")),
            sku=(data.get("sku") or "").strip(),
            status=status,
            condition=data.get("condition")
            if data.get("condition") in Product.Condition.values
            else Product.Condition.NEW,
            plan_type=data.get("plan_type")
            if data.get("plan_type") in Product.PlanType.values
            else Product.PlanType.BASIC,
            currency=(data.get("currency") or "NPR").strip() or "NPR",
        )
        obj = (
            Product.objects.select_related("category")
            .annotate(_avg_rating=Avg("reviews__rating"))
            .get(pk=obj.pk)
        )
        return Response(serialize_product(obj), status=201)


class CommerceProductDetailView(DomainAuthMixin, APIView):
    def _get(self, request, product_id):
        org = resolve_org(request.user)
        if not org:
            return None
        return (
            Product.objects.filter(seller_org=org, pk=product_id)
            .select_related("category")
            .annotate(_avg_rating=Avg("reviews__rating"))
            .first()
        )

    def get(self, request, product_id):
        obj = self._get(request, product_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_product(obj))

    def patch(self, request, product_id):
        obj = self._get(request, product_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        org = obj.seller_org
        data = request.data
        if "name" in data and (data.get("name") or "").strip():
            obj.name = str(data["name"]).strip()
        if "slug" in data and (data.get("slug") or "").strip():
            candidate = slugify(str(data["slug"]).strip())[:255]
            if candidate and not Product.objects.filter(
                seller_org=org, slug=candidate
            ).exclude(pk=obj.pk).exists():
                obj.slug = candidate
        elif "name" in data and data.get("name"):
            obj.slug = _unique_product_slug(org, obj.name, exclude_pk=obj.pk)
        if "description" in data:
            obj.description = data.get("description") or ""
        if "brand_name" in data or "brand" in data:
            obj.brand_name = (data.get("brand_name") or data.get("brand") or "").strip()
        if "sku" in data:
            obj.sku = (data.get("sku") or "").strip()
        if "price" in data:
            obj.price = _decimal(data.get("price"))
        if "stock_qty" in data or "stock" in data:
            obj.stock_qty = _decimal(data.get("stock_qty") if "stock_qty" in data else data.get("stock"))
        if "status" in data and data["status"] in Product.Status.values:
            obj.status = data["status"]
        if "category_id" in data or "category" in data:
            cat_id = data.get("category_id") if "category_id" in data else data.get("category")
            obj.category = Category.objects.filter(pk=cat_id).first() if cat_id else None
        if "condition" in data and data["condition"] in Product.Condition.values:
            obj.condition = data["condition"]
        if "plan_type" in data and data["plan_type"] in Product.PlanType.values:
            obj.plan_type = data["plan_type"]
        if "currency" in data and data.get("currency"):
            obj.currency = str(data["currency"]).strip()
        obj.save()
        obj = (
            Product.objects.select_related("category")
            .annotate(_avg_rating=Avg("reviews__rating"))
            .get(pk=obj.pk)
        )
        return Response(serialize_product(obj))

    def delete(self, request, product_id):
        obj = self._get(request, product_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Orders ───────────────────────────────────────────────────────────────────


_ORDER_TRANSITIONS = {
    "confirm": (Order.OrderStatus.PLACED, Order.OrderStatus.CONFIRMED),
    "pack": (Order.OrderStatus.CONFIRMED, Order.OrderStatus.PACKED),
    "ship": (Order.OrderStatus.PACKED, Order.OrderStatus.SHIPPED),
    "deliver": (Order.OrderStatus.SHIPPED, Order.OrderStatus.DELIVERED),
}


class CommerceOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {"results": [], "count": 0, "page": 1, "page_size": 50, "total_pages": 1}
            )
        qs = Order.objects.filter(seller_org=org).select_related("buyer_user").prefetch_related(
            "items__product"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(order_no__icontains=search)
                | Q(buyer_user__username__icontains=search)
                | Q(buyer_user__first_name__icontains=search)
                | Q(buyer_user__last_name__icontains=search)
                | Q(buyer_user__email__icontains=search)
            )
        order_status = (request.query_params.get("order_status") or "").strip()
        if order_status:
            qs = qs.filter(order_status=order_status)
        payment_status = (request.query_params.get("payment_status") or "").strip()
        if payment_status:
            qs = qs.filter(payment_status=payment_status)
        sort = request.query_params.get("sort") or "-created_at"
        allowed = ("order_no", "total", "order_status", "payment_status", "created_at")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_order(o) for o in items], **meta})


class CommerceOrderDetailView(DomainAuthMixin, APIView):
    def _get(self, request, order_id):
        org = resolve_org(request.user)
        if not org:
            return None
        return (
            Order.objects.filter(seller_org=org, pk=order_id)
            .select_related("buyer_user")
            .prefetch_related("items__product")
            .first()
        )

    def get(self, request, order_id):
        obj = self._get(request, order_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_order(obj))

    def post(self, request, order_id):
        obj = self._get(request, order_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if not action:
            return Response({"detail": "action is required."}, status=400)

        if action == "cancel":
            if obj.order_status in (
                Order.OrderStatus.DELIVERED,
                Order.OrderStatus.CANCELLED,
                Order.OrderStatus.RETURNED,
            ):
                return Response(
                    {"detail": f"Cannot cancel order in status '{obj.order_status}'."},
                    status=400,
                )
            try:
                cancel_order(obj, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
            obj = self._get(request, order_id)
            return Response(serialize_order(obj))

        if action not in _ORDER_TRANSITIONS:
            return Response(
                {
                    "detail": "Invalid action. Use confirm, pack, ship, deliver, or cancel.",
                },
                status=400,
            )
        expected, target = _ORDER_TRANSITIONS[action]
        if obj.order_status != expected:
            return Response(
                {
                    "detail": (
                        f"Cannot {action}: order must be '{expected}' "
                        f"(currently '{obj.order_status}')."
                    ),
                },
                status=400,
            )
        obj.order_status = target
        obj.save(update_fields=["order_status", "updated_at"])
        obj = self._get(request, order_id)
        return Response(serialize_order(obj))


# ── Categories (global catalog — not org-scoped) ─────────────────────────────


class CommerceCategoriesView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = Category.objects.all().select_related("parent").annotate(
            _product_count=Count("products")
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        active = (request.query_params.get("is_active") or "").strip().lower()
        if active in ("1", "true", "yes"):
            qs = qs.filter(is_active=True)
        elif active in ("0", "false", "no"):
            qs = qs.filter(is_active=False)
        sort = request.query_params.get("sort") or "sort_order"
        allowed = ("name", "slug", "sort_order", "is_active")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("sort_order", "name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_category(c) for c in items], **meta})

    def post(self, request):
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        parent = None
        if data.get("parent_id"):
            parent = Category.objects.filter(pk=data.get("parent_id")).first()
        slug = (data.get("slug") or "").strip() or _unique_category_slug(name)
        if Category.objects.filter(slug=slug).exists():
            slug = _unique_category_slug(name)
        try:
            sort_order = int(data.get("sort_order") or 0)
        except (TypeError, ValueError):
            sort_order = 0
        is_active = data.get("is_active")
        if is_active is None:
            is_active = True
        obj = Category.objects.create(
            name=name,
            slug=slug,
            parent=parent,
            sort_order=sort_order,
            is_active=bool(is_active),
        )
        obj = (
            Category.objects.select_related("parent")
            .annotate(_product_count=Count("products"))
            .get(pk=obj.pk)
        )
        return Response(serialize_category(obj), status=201)


class CommerceCategoryDetailView(DomainAuthMixin, APIView):
    def _get(self, category_id):
        return (
            Category.objects.filter(pk=category_id)
            .select_related("parent")
            .annotate(_product_count=Count("products"))
            .first()
        )

    def get(self, request, category_id):
        obj = self._get(category_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_category(obj))

    def patch(self, request, category_id):
        obj = self._get(category_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and (data.get("name") or "").strip():
            obj.name = str(data["name"]).strip()
        if "slug" in data and (data.get("slug") or "").strip():
            candidate = slugify(str(data["slug"]).strip())[:255]
            if candidate and not Category.objects.filter(slug=candidate).exclude(pk=obj.pk).exists():
                obj.slug = candidate
        elif "name" in data and data.get("name"):
            obj.slug = _unique_category_slug(obj.name, exclude_pk=obj.pk)
        if "parent_id" in data:
            obj.parent = (
                Category.objects.filter(pk=data.get("parent_id")).first()
                if data.get("parent_id")
                else None
            )
        if "sort_order" in data:
            try:
                obj.sort_order = int(data.get("sort_order") or 0)
            except (TypeError, ValueError):
                pass
        if "is_active" in data:
            obj.is_active = bool(data.get("is_active"))
        obj.save()
        obj = self._get(category_id)
        return Response(serialize_category(obj))

    def delete(self, request, category_id):
        obj = Category.objects.filter(pk=category_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
