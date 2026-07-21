"""Inventory module APIs — warehouses, items, stock, ledger, GRN, adjustments, issues."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Batch,
    GRN,
    GRNLine,
    ItemMaster,
    MaterialIssue,
    MaterialIssueLine,
    PurchaseOrder,
    StockAdjustment,
    StockLedger,
    Vendor,
    Warehouse,
    WorkOrder,
)
from core.services.common import DomainError, get_closing_qty
from core.services.grn_service import issue_material, post_grn, receive_grn
from core.services.procurement_service import create_reorder_pr
from core.services.stock_service import approve_stock_adjustment, post_ledger
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org, serialize_requisition


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


def _dec(v) -> float:
    return float(v or 0)


CAT_LABEL = {
    "raw": "Raw Material",
    "packaging": "Packaging",
    "finished": "Finished Goods",
    "spare": "Spare Part",
}

WH_TYPE_LABEL = {
    "raw": "Raw",
    "finished": "Finished",
    "spare": "Spare",
    "packaging": "Packaging",
}


def _user_name(user) -> str | None:
    if not user:
        return None
    name = (getattr(user, "get_full_name", None) or (lambda: ""))()
    if name and str(name).strip():
        return str(name).strip()
    return getattr(user, "email", None) or getattr(user, "username", None) or str(user.pk)


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_warehouse(w: Warehouse, *, item_count: int | None = None) -> dict:
    return {
        "id": str(w.id),
        "name": w.name,
        "code": w.code,
        "address": w.address or "",
        "type": w.type,
        "type_label": WH_TYPE_LABEL.get(w.type, w.type),
        "item_count": item_count if item_count is not None else (
            StockLedger.objects.filter(warehouse=w).values("item_id").distinct().count()
        ),
    }


def serialize_item(item: ItemMaster, *, on_hand: float | None = None) -> dict:
    if on_hand is None:
        # Sum closing qty across warehouses (latest per warehouse)
        warehouses = Warehouse.objects.filter(organization_id=item.organization_id)
        total = Decimal("0")
        for wh in warehouses:
            total += get_closing_qty(item, wh)
        on_hand = _dec(total)
    return {
        "id": str(item.id),
        "item_code": item.item_code,
        "sku": item.item_code,
        "name": item.name,
        "category": item.category,
        "category_label": CAT_LABEL.get(item.category, item.category),
        "uom": item.uom,
        "min_stock": _dec(item.min_stock),
        "max_stock": _dec(item.max_stock),
        "reorder_level": _dec(item.reorder_level),
        "bin_location": item.bin_location or "",
        "supplier_id": str(item.supplier_id) if item.supplier_id else None,
        "supplier_name": item.supplier.vendor_name if item.supplier_id else None,
        "on_hand": on_hand,
    }


def _batch_for_item(item: ItemMaster):
    return (
        Batch.objects.filter(organization_id=item.organization_id, output_item=item)
        .order_by("-manufacture_date", "-start_date", "-id")
        .first()
    )


def serialize_stock_balance(item: ItemMaster, warehouse: Warehouse, on_hand: Decimal) -> dict:
    batch = _batch_for_item(item)
    reserved = (
        MaterialIssueLine.objects.filter(
            issue__organization_id=item.organization_id,
            issue__warehouse=warehouse,
            material=item,
            issue__status__in=[MaterialIssue.Status.DRAFT, MaterialIssue.Status.APPROVED],
        ).aggregate(s=Sum("required_qty"))["s"]
        or 0
    )
    return {
        "id": f"{item.id}:{warehouse.id}",
        "item_id": str(item.id),
        "sku": item.item_code,
        "name": item.name,
        "category": CAT_LABEL.get(item.category, item.category),
        "category_code": item.category,
        "uom": item.uom,
        "on_hand": _dec(on_hand),
        "reserved": _dec(reserved),
        "available": _dec(on_hand) - _dec(reserved),
        "reorder_level": _dec(item.reorder_level),
        "min_stock": _dec(item.min_stock),
        "max_stock": _dec(item.max_stock),
        "warehouse_id": str(warehouse.id),
        "warehouse": warehouse.code,
        "warehouse_name": warehouse.name,
        "batch_no": batch.batch_no if batch else "—",
        "expiry_date": _iso(batch.expire_date) if batch and batch.expire_date else None,
        "bin_location": item.bin_location or "",
        "below_reorder": _dec(on_hand) <= _dec(item.reorder_level),
    }


def serialize_ledger(entry: StockLedger) -> dict:
    type_map = {"in": "GRN", "out": "Issue", "adjust": "Adjustment"}
    qty = _dec(entry.in_qty) if entry.transaction_type == "in" else -_dec(entry.out_qty)
    if entry.transaction_type == "adjust":
        qty = _dec(entry.in_qty) - _dec(entry.out_qty)
    ref = entry.reference_type or ""
    if entry.work_order_id:
        ref = entry.work_order.wo_no
    return {
        "id": str(entry.id),
        "doc_no": f"{entry.reference_type or 'MOV'}-{str(entry.id)[:6].upper()}",
        "type": type_map.get(entry.transaction_type, entry.transaction_type),
        "transaction_type": entry.transaction_type,
        "sku": entry.item.item_code if entry.item_id else "",
        "item": entry.item.name if entry.item_id else "",
        "item_id": str(entry.item_id) if entry.item_id else None,
        "qty": qty,
        "uom": entry.item.uom if entry.item_id else "pcs",
        "warehouse": entry.warehouse.code if entry.warehouse_id else "",
        "warehouse_id": str(entry.warehouse_id) if entry.warehouse_id else None,
        "date": _iso(entry.date) or "",
        "ref": ref,
        "reference_type": entry.reference_type or "",
        "reference_id": str(entry.reference_id) if entry.reference_id else None,
        "opening_qty": _dec(entry.opening_qty),
        "in_qty": _dec(entry.in_qty),
        "out_qty": _dec(entry.out_qty),
        "closing_qty": _dec(entry.closing_qty),
        "work_order_id": str(entry.work_order_id) if entry.work_order_id else None,
    }


def serialize_grn_line(line: GRNLine) -> dict:
    return {
        "id": str(line.id),
        "item_id": str(line.item_id) if line.item_id else None,
        "item_code": line.item.item_code if line.item_id else "",
        "item_name": line.item.name if line.item_id else "",
        "uom": line.item.uom if line.item_id else "pcs",
        "ordered_qty": _dec(line.ordered_qty),
        "received_qty": _dec(line.received_qty),
        "accepted_qty": _dec(line.accepted_qty),
        "rejected_qty": _dec(line.rejected_qty),
    }


def serialize_grn_full(g: GRN) -> dict:
    lines = list(g.lines.select_related("item").all())
    first = lines[0] if lines else None
    return {
        "id": str(g.id),
        "grn_no": g.grn_no,
        "po_id": str(g.po_id) if g.po_id else None,
        "po_no": g.po.po_no if g.po_id else "",
        "supplier_id": str(g.supplier_id) if g.supplier_id else None,
        "vendor": g.supplier.vendor_name if g.supplier_id else "—",
        "date": _iso(g.date) or "",
        "qc_status": g.qc_status,
        "status": g.status,
        "received_by_id": str(g.received_by_id) if g.received_by_id else None,
        "received_by_name": _user_name(g.received_by) if g.received_by_id else None,
        "item": first.item.name if first and first.item_id else "—",
        "qty": _dec(first.received_qty) if first else 0,
        "uom": first.item.uom if first and first.item_id else "pcs",
        "received_date": _iso(g.date) or "",
        "line_count": len(lines),
        "lines": [serialize_grn_line(l) for l in lines],
    }


def serialize_adjustment(a: StockAdjustment) -> dict:
    return {
        "id": str(a.id),
        "item_id": str(a.item_id),
        "item_code": a.item.item_code if a.item_id else "",
        "item_name": a.item.name if a.item_id else "",
        "uom": a.item.uom if a.item_id else "pcs",
        "warehouse_id": str(a.warehouse_id),
        "warehouse_code": a.warehouse.code if a.warehouse_id else "",
        "warehouse_name": a.warehouse.name if a.warehouse_id else "",
        "system_qty": _dec(a.system_qty),
        "physical_qty": _dec(a.physical_qty),
        "variance": _dec(a.variance),
        "reason": a.reason or "",
        "date": _iso(a.date) or "",
        "approved_by_id": str(a.approved_by_id) if a.approved_by_id else None,
        "approved_by_name": _user_name(a.approved_by) if a.approved_by_id else None,
        "status": "approved" if a.approved_by_id else "pending",
    }


def serialize_issue_line(line: MaterialIssueLine) -> dict:
    return {
        "id": str(line.id),
        "material_id": str(line.material_id) if line.material_id else None,
        "material_code": line.material.item_code if line.material_id else "",
        "material_name": line.material.name if line.material_id else "",
        "uom": line.material.uom if line.material_id else "pcs",
        "required_qty": _dec(line.required_qty),
        "issued_qty": _dec(line.issued_qty),
    }


def serialize_issue(issue: MaterialIssue) -> dict:
    lines = list(issue.lines.select_related("material").all())
    return {
        "id": str(issue.id),
        "issue_no": issue.issue_no,
        "date": _iso(issue.date) or "",
        "status": issue.status,
        "warehouse_id": str(issue.warehouse_id),
        "warehouse_code": issue.warehouse.code if issue.warehouse_id else "",
        "warehouse_name": issue.warehouse.name if issue.warehouse_id else "",
        "work_order_id": str(issue.work_order_id) if issue.work_order_id else None,
        "work_order_no": issue.work_order.wo_no if issue.work_order_id else None,
        "process_run_id": str(issue.process_run_id) if issue.process_run_id else None,
        "issued_by_id": str(issue.issued_by_id) if issue.issued_by_id else None,
        "issued_by_name": _user_name(issue.issued_by) if issue.issued_by_id else None,
        "line_count": len(lines),
        "total_issued": sum(_dec(l.issued_qty) for l in lines),
        "lines": [serialize_issue_line(l) for l in lines],
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class InventoryOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "sku_count": 0,
            "below_reorder": 0,
            "warehouse_count": 0,
            "category_count": 0,
            "pending_grns": 0,
            "pending_adjustments": 0,
            "open_issues": 0,
            "movements_today": 0,
            "by_category": [],
            "by_warehouse_type": [],
            "low_stock": [],
        }
        if not org:
            return Response(empty)

        items = list(ItemMaster.objects.filter(organization=org))
        warehouses = list(Warehouse.objects.filter(organization=org))
        below = 0
        low_stock = []
        for item in items:
            total = Decimal("0")
            for wh in warehouses:
                total += get_closing_qty(item, wh)
            if total <= (item.reorder_level or 0):
                below += 1
                if len(low_stock) < 10:
                    low_stock.append(
                        {
                            "id": str(item.id),
                            "sku": item.item_code,
                            "name": item.name,
                            "on_hand": _dec(total),
                            "reorder_level": _dec(item.reorder_level),
                            "uom": item.uom,
                            "category": CAT_LABEL.get(item.category, item.category),
                        }
                    )

        by_cat = (
            ItemMaster.objects.filter(organization=org)
            .values("category")
            .annotate(value=Count("id"))
            .order_by("-value")
        )
        by_wh = (
            Warehouse.objects.filter(organization=org)
            .values("type")
            .annotate(value=Count("id"))
            .order_by("-value")
        )
        today = timezone.localdate()
        return Response(
            {
                "sku_count": len(items),
                "below_reorder": below,
                "warehouse_count": len(warehouses),
                "category_count": ItemMaster.objects.filter(organization=org)
                .values("category")
                .distinct()
                .count(),
                "pending_grns": GRN.objects.filter(
                    organization=org, status__in=[GRN.Status.DRAFT, GRN.Status.RECEIVED]
                ).count(),
                "pending_adjustments": StockAdjustment.objects.filter(
                    organization=org, approved_by__isnull=True
                ).count(),
                "open_issues": MaterialIssue.objects.filter(
                    organization=org,
                    status__in=[MaterialIssue.Status.DRAFT, MaterialIssue.Status.APPROVED],
                ).count(),
                "movements_today": StockLedger.objects.filter(
                    organization=org, date=today
                ).count(),
                "by_category": [
                    {
                        "name": CAT_LABEL.get(r["category"], r["category"]),
                        "code": r["category"],
                        "value": r["value"],
                    }
                    for r in by_cat
                ],
                "by_warehouse_type": [
                    {
                        "name": WH_TYPE_LABEL.get(r["type"], r["type"]),
                        "code": r["type"],
                        "value": r["value"],
                    }
                    for r in by_wh
                ],
                "low_stock": low_stock,
            }
        )


# ── Options (lookups for forms) ──────────────────────────────────────────────


class InventoryOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {"warehouses": [], "items": [], "vendors": [], "purchase_orders": [], "work_orders": []}
            )
        return Response(
            {
                "warehouses": [
                    {"id": str(w.id), "code": w.code, "name": w.name, "type": w.type}
                    for w in Warehouse.objects.filter(organization=org).order_by("code")[:200]
                ],
                "items": [
                    {
                        "id": str(i.id),
                        "item_code": i.item_code,
                        "name": i.name,
                        "uom": i.uom,
                        "category": i.category,
                        "reorder_level": _dec(i.reorder_level),
                    }
                    for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:500]
                ],
                "vendors": [
                    {"id": str(v.id), "name": v.vendor_name, "status": v.status}
                    for v in Vendor.objects.filter(organization=org).order_by("vendor_name")[:200]
                ],
                "purchase_orders": [
                    {
                        "id": str(po.id),
                        "po_no": po.po_no,
                        "supplier_id": str(po.supplier_id),
                        "supplier_name": po.supplier.vendor_name if po.supplier_id else "",
                        "status": po.status,
                        "date": _iso(po.date),
                    }
                    for po in PurchaseOrder.objects.filter(organization=org)
                    .exclude(status=PurchaseOrder.Status.CANCELLED)
                    .select_related("supplier")
                    .order_by("-date")[:100]
                ],
                "work_orders": [
                    {"id": str(wo.id), "wo_no": wo.wo_no, "title": wo.title, "status": wo.status}
                    for wo in WorkOrder.objects.filter(organization=org)
                    .exclude(status=WorkOrder.Status.CANCELLED)
                    .order_by("-id")[:100]
                ],
            }
        )


# ── Warehouses ───────────────────────────────────────────────────────────────


class InventoryWarehousesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Warehouse.objects.all(), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(code__icontains=search) | Q(address__icontains=search)
            )
        wh_type = request.query_params.get("type")
        if wh_type:
            qs = qs.filter(type=wh_type)
        sort = request.query_params.get("sort") or "code"
        if sort.lstrip("-") in ("code", "name", "type"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("code")
        items, meta = _paginate(qs, request)
        # annotate distinct item counts via ledger
        results = []
        for w in items:
            count = (
                StockLedger.objects.filter(warehouse=w).values("item_id").distinct().count()
            )
            results.append(serialize_warehouse(w, item_count=count))
        return Response({"results": results, **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        code = (data.get("code") or "").strip().upper()
        name = (data.get("name") or "").strip()
        if not code or not name:
            return Response({"detail": "code and name are required."}, status=400)
        if Warehouse.objects.filter(organization=org, code=code).exists():
            return Response({"detail": "Warehouse code already exists."}, status=400)
        wh_type = data.get("type") or Warehouse.Type.RAW
        if wh_type not in Warehouse.Type.values:
            return Response({"detail": "Invalid warehouse type."}, status=400)
        w = Warehouse.objects.create(
            organization=org,
            code=code,
            name=name,
            address=data.get("address") or "",
            type=wh_type,
        )
        return Response(serialize_warehouse(w, item_count=0), status=201)


class InventoryWarehouseDetailView(DomainAuthMixin, APIView):
    def get(self, request, warehouse_id):
        org = resolve_org(request.user)
        w = org_filter(Warehouse.objects.all(), org).filter(pk=warehouse_id).first()
        if not w:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_warehouse(w))

    def patch(self, request, warehouse_id):
        org = resolve_org(request.user)
        w = org_filter(Warehouse.objects.all(), org).filter(pk=warehouse_id).first()
        if not w:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            w.name = str(data["name"]).strip()
        if "address" in data:
            w.address = data.get("address") or ""
        if "type" in data:
            if data["type"] not in Warehouse.Type.values:
                return Response({"detail": "Invalid warehouse type."}, status=400)
            w.type = data["type"]
        if "code" in data and data["code"]:
            code = str(data["code"]).strip().upper()
            if Warehouse.objects.filter(organization=org, code=code).exclude(pk=w.pk).exists():
                return Response({"detail": "Warehouse code already exists."}, status=400)
            w.code = code
        w.save()
        return Response(serialize_warehouse(w))

    def delete(self, request, warehouse_id):
        org = resolve_org(request.user)
        w = org_filter(Warehouse.objects.all(), org).filter(pk=warehouse_id).first()
        if not w:
            return Response({"detail": "Not found."}, status=404)
        if StockLedger.objects.filter(warehouse=w).exists():
            return Response(
                {"detail": "Cannot delete warehouse with stock ledger entries."}, status=400
            )
        w.delete()
        return Response(status=204)


# ── Item Master ──────────────────────────────────────────────────────────────


class InventoryItemsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(ItemMaster.objects.select_related("supplier"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(item_code__icontains=search)
                | Q(name__icontains=search)
                | Q(bin_location__icontains=search)
            )
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        sort = request.query_params.get("sort") or "item_code"
        allowed = {"item_code", "name", "category", "reorder_level"}
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("item_code")
        items, meta = _paginate(qs, request)
        warehouses = list(Warehouse.objects.filter(organization=org)) if org else []
        results = []
        for item in items:
            total = Decimal("0")
            for wh in warehouses:
                total += get_closing_qty(item, wh)
            results.append(serialize_item(item, on_hand=_dec(total)))
        return Response({"results": results, **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        code = (data.get("item_code") or data.get("sku") or "").strip().upper()
        name = (data.get("name") or "").strip()
        category = data.get("category") or ItemMaster.Category.RAW
        if not code or not name:
            return Response({"detail": "item_code and name are required."}, status=400)
        if category not in ItemMaster.Category.values:
            return Response({"detail": "Invalid category."}, status=400)
        if ItemMaster.objects.filter(organization=org, item_code=code).exists():
            return Response({"detail": "Item code already exists."}, status=400)
        supplier = None
        sid = data.get("supplier_id")
        if sid:
            supplier = Vendor.objects.filter(pk=sid, organization=org).first()
            if not supplier:
                return Response({"detail": "Supplier not found."}, status=404)
        item = ItemMaster.objects.create(
            organization=org,
            item_code=code,
            name=name,
            category=category,
            uom=(data.get("uom") or "pcs").strip(),
            min_stock=_decimal(data.get("min_stock")),
            max_stock=_decimal(data.get("max_stock")),
            reorder_level=_decimal(data.get("reorder_level")),
            bin_location=data.get("bin_location") or "",
            supplier=supplier,
        )
        return Response(serialize_item(item, on_hand=0), status=201)


class InventoryItemDetailView(DomainAuthMixin, APIView):
    def get(self, request, item_id):
        org = resolve_org(request.user)
        item = org_filter(ItemMaster.objects.select_related("supplier"), org).filter(pk=item_id).first()
        if not item:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_item(item))

    def patch(self, request, item_id):
        org = resolve_org(request.user)
        item = org_filter(ItemMaster.objects.all(), org).filter(pk=item_id).first()
        if not item:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data["name"]:
            item.name = str(data["name"]).strip()
        if "uom" in data and data["uom"]:
            item.uom = str(data["uom"]).strip()
        if "bin_location" in data:
            item.bin_location = data.get("bin_location") or ""
        if "category" in data:
            if data["category"] not in ItemMaster.Category.values:
                return Response({"detail": "Invalid category."}, status=400)
            item.category = data["category"]
        for field in ("min_stock", "max_stock", "reorder_level"):
            if field in data:
                setattr(item, field, _decimal(data.get(field)))
        if "item_code" in data and data["item_code"]:
            code = str(data["item_code"]).strip().upper()
            if ItemMaster.objects.filter(organization=org, item_code=code).exclude(pk=item.pk).exists():
                return Response({"detail": "Item code already exists."}, status=400)
            item.item_code = code
        if "supplier_id" in data:
            sid = data.get("supplier_id")
            item.supplier = Vendor.objects.filter(pk=sid, organization=org).first() if sid else None
        item.save()
        return Response(serialize_item(item))

    def delete(self, request, item_id):
        org = resolve_org(request.user)
        item = org_filter(ItemMaster.objects.all(), org).filter(pk=item_id).first()
        if not item:
            return Response({"detail": "Not found."}, status=404)
        if StockLedger.objects.filter(item=item).exists():
            return Response({"detail": "Cannot delete item with stock ledger entries."}, status=400)
        item.delete()
        return Response(status=204)


# ── Stock balances ───────────────────────────────────────────────────────────


class InventoryStockView(DomainAuthMixin, APIView):
    """On-hand balances by (item, warehouse), derived from StockLedger."""

    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"results": [], "count": 0, "page": 1, "page_size": 50, "total_pages": 1})

        items_qs = ItemMaster.objects.filter(organization=org).select_related("supplier")
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            items_qs = items_qs.filter(
                Q(item_code__icontains=search) | Q(name__icontains=search)
            )
        category = request.query_params.get("category")
        if category:
            items_qs = items_qs.filter(category=category)
        warehouse_id = request.query_params.get("warehouse_id")
        warehouses = Warehouse.objects.filter(organization=org)
        if warehouse_id:
            warehouses = warehouses.filter(pk=warehouse_id)
        warehouses = list(warehouses)
        below_only = (request.query_params.get("below_reorder") or "").lower() in ("1", "true", "yes")

        balances = []
        for item in items_qs.order_by("item_code"):
            if below_only:
                # One aggregated row per item for reorder alerts
                total = Decimal("0")
                best_wh = warehouses[0] if warehouses else None
                best_qty = Decimal("-1")
                for wh in warehouses:
                    qty = get_closing_qty(item, wh)
                    total += qty
                    if qty > best_qty:
                        best_qty = qty
                        best_wh = wh
                if not best_wh:
                    continue
                if total > (item.reorder_level or 0):
                    continue
                balances.append(serialize_stock_balance(item, best_wh, total))
                continue

            for wh in warehouses:
                on_hand = get_closing_qty(item, wh)
                # Skip zero rows unless specifically filtered to one warehouse
                if on_hand == 0 and not warehouse_id:
                    has_any = StockLedger.objects.filter(item=item, organization=org).exists()
                    if has_any:
                        continue
                    if wh != warehouses[0]:
                        continue
                balances.append(serialize_stock_balance(item, wh, on_hand))

        # Pagination over computed list
        try:
            page = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(200, max(1, int(request.query_params.get("page_size") or 50)))
        except (TypeError, ValueError):
            page_size = 50
        total = len(balances)
        start = (page - 1) * page_size
        page_rows = balances[start : start + page_size]
        return Response(
            {
                "results": page_rows,
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, (total + page_size - 1) // page_size),
            }
        )


# ── Stock Ledger ─────────────────────────────────────────────────────────────


class InventoryLedgerView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            StockLedger.objects.select_related("item", "warehouse", "work_order"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(item__item_code__icontains=search)
                | Q(item__name__icontains=search)
                | Q(reference_type__icontains=search)
                | Q(warehouse__code__icontains=search)
            )
        tx = request.query_params.get("transaction_type") or request.query_params.get("type")
        if tx:
            # Accept UI labels
            alias = {"grn": "in", "issue": "out", "adjustment": "adjust", "in": "in", "out": "out", "adjust": "adjust"}
            qs = qs.filter(transaction_type=alias.get(tx.lower(), tx.lower()))
        warehouse_id = request.query_params.get("warehouse_id")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        item_id = request.query_params.get("item_id")
        if item_id:
            qs = qs.filter(item_id=item_id)
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_ledger(e) for e in items], **meta})

    def post(self, request):
        """Manual ledger post via stock_service."""
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        item = ItemMaster.objects.filter(pk=request.data.get("item_id"), organization=org).first()
        warehouse = Warehouse.objects.filter(
            pk=request.data.get("warehouse_id"), organization=org
        ).first()
        if not item or not warehouse:
            return Response({"detail": "item_id and warehouse_id required."}, status=400)
        try:
            entry = post_ledger(
                organization=org,
                item=item,
                warehouse=warehouse,
                transaction_type=request.data.get("transaction_type") or "adjust",
                qty=_decimal(request.data.get("qty")),
                reference_type=request.data.get("reference_type") or "manual",
                reference_id=request.data.get("reference_id"),
                date=_parse_date(request.data.get("date")),
                actor=request.user,
            )
            return Response(serialize_ledger(entry), status=201)
        except DomainError as exc:
            return _domain_error(exc)


# ── GRN ──────────────────────────────────────────────────────────────────────


class InventoryGRNsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            GRN.objects.select_related("po", "supplier", "received_by").prefetch_related("lines__item"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(grn_no__icontains=search)
                | Q(po__po_no__icontains=search)
                | Q(supplier__vendor_name__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        qc = request.query_params.get("qc_status")
        if qc:
            qs = qs.filter(qc_status=qc)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_grn_full(g) for g in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        po = PurchaseOrder.objects.filter(pk=data.get("po_id"), organization=org).first()
        if not po:
            return Response({"detail": "Purchase order not found."}, status=404)
        supplier = po.supplier
        if data.get("supplier_id"):
            supplier = Vendor.objects.filter(pk=data["supplier_id"], organization=org).first() or supplier
        grn_no = (data.get("grn_no") or "").strip()
        if not grn_no:
            n = GRN.objects.filter(organization=org).count() + 1
            grn_no = f"GRN-{timezone.now():%Y%m%d}-{n:04d}"
        if GRN.objects.filter(organization=org, grn_no=grn_no).exists():
            return Response({"detail": "GRN number already exists."}, status=400)
        grn = GRN.objects.create(
            organization=org,
            grn_no=grn_no,
            po=po,
            supplier=supplier,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            status=GRN.Status.DRAFT,
            qc_status=GRN.QCStatus.PENDING,
            received_by=request.user,
        )
        lines_data = data.get("lines") or []
        if not lines_data:
            # Default lines from PO
            for pol in po.lines.select_related("item").all():
                GRNLine.objects.create(
                    grn=grn,
                    item=pol.item,
                    ordered_qty=pol.qty,
                    received_qty=pol.qty,
                    accepted_qty=pol.qty,
                    rejected_qty=0,
                )
        else:
            for row in lines_data:
                item = ItemMaster.objects.filter(pk=row.get("item_id"), organization=org).first()
                if not item:
                    continue
                GRNLine.objects.create(
                    grn=grn,
                    item=item,
                    ordered_qty=_decimal(row.get("ordered_qty")),
                    received_qty=_decimal(row.get("received_qty") or row.get("ordered_qty")),
                    accepted_qty=_decimal(row.get("accepted_qty") or row.get("received_qty") or row.get("ordered_qty")),
                    rejected_qty=_decimal(row.get("rejected_qty")),
                )
        return Response(serialize_grn_full(grn), status=201)


class InventoryGRNDetailView(DomainAuthMixin, APIView):
    def get(self, request, grn_id):
        org = resolve_org(request.user)
        grn = (
            org_filter(
                GRN.objects.select_related("po", "supplier", "received_by").prefetch_related("lines__item"),
                org,
            )
            .filter(pk=grn_id)
            .first()
        )
        if not grn:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_grn_full(grn))

    def patch(self, request, grn_id):
        org = resolve_org(request.user)
        grn = org_filter(GRN.objects.prefetch_related("lines"), org).filter(pk=grn_id).first()
        if not grn:
            return Response({"detail": "Not found."}, status=404)
        if grn.status not in (GRN.Status.DRAFT, GRN.Status.RECEIVED):
            return Response({"detail": "Only draft/received GRNs can be edited."}, status=400)
        data = request.data
        if "date" in data:
            grn.date = _parse_date(data.get("date")) or grn.date
        if "qc_status" in data and data["qc_status"] in GRN.QCStatus.values:
            grn.qc_status = data["qc_status"]
        grn.save()
        # Update lines if provided
        for row in data.get("lines") or []:
            line = grn.lines.filter(pk=row.get("id")).first()
            if not line:
                continue
            for field in ("ordered_qty", "received_qty", "accepted_qty", "rejected_qty"):
                if field in row:
                    setattr(line, field, _decimal(row.get(field)))
            line.save()
        return Response(serialize_grn_full(grn))

    def post(self, request, grn_id):
        """Actions: receive | post | cancel."""
        org = resolve_org(request.user)
        grn = org_filter(GRN.objects.all(), org).filter(pk=grn_id).first()
        if not grn:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "receive":
                receive_grn(grn, received_by=request.user, actor=request.user)
            elif action == "post":
                wh_id = request.data.get("warehouse_id")
                warehouse = (
                    Warehouse.objects.filter(pk=wh_id, organization=org).first()
                    if wh_id
                    else Warehouse.objects.filter(organization=org).order_by("id").first()
                )
                if not warehouse:
                    return Response({"detail": "warehouse_id required."}, status=400)
                # Allow setting QC to pass before post if still pending and accepted qty present
                if grn.qc_status == GRN.QCStatus.PENDING and request.data.get("qc_status") in (
                    GRN.QCStatus.PASS,
                    GRN.QCStatus.PARTIAL,
                ):
                    grn.qc_status = request.data["qc_status"]
                    grn.save(update_fields=["qc_status"])
                post_grn(grn, warehouse=warehouse, actor=request.user)
            elif action == "cancel":
                if grn.status == GRN.Status.POSTED:
                    return Response({"detail": "Cannot cancel posted GRN."}, status=400)
                grn.status = GRN.Status.CANCELLED
                grn.save(update_fields=["status"])
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            grn.refresh_from_db()
            return Response(serialize_grn_full(grn))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, grn_id):
        org = resolve_org(request.user)
        grn = org_filter(GRN.objects.all(), org).filter(pk=grn_id).first()
        if not grn:
            return Response({"detail": "Not found."}, status=404)
        if grn.status != GRN.Status.DRAFT:
            return Response({"detail": "Only draft GRNs can be deleted."}, status=400)
        grn.delete()
        return Response(status=204)


# ── Stock Adjustments ────────────────────────────────────────────────────────


class InventoryAdjustmentsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            StockAdjustment.objects.select_related("item", "warehouse", "approved_by"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(item__item_code__icontains=search)
                | Q(item__name__icontains=search)
                | Q(reason__icontains=search)
                | Q(warehouse__code__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f == "pending":
            qs = qs.filter(approved_by__isnull=True)
        elif status_f == "approved":
            qs = qs.filter(approved_by__isnull=False)
        warehouse_id = request.query_params.get("warehouse_id")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_adjustment(a) for a in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        item = ItemMaster.objects.filter(pk=data.get("item_id"), organization=org).first()
        warehouse = Warehouse.objects.filter(pk=data.get("warehouse_id"), organization=org).first()
        if not item or not warehouse:
            return Response({"detail": "item_id and warehouse_id required."}, status=400)
        system_qty = get_closing_qty(item, warehouse)
        if "system_qty" in data and data["system_qty"] is not None:
            system_qty = _decimal(data.get("system_qty"))
        physical = _decimal(data.get("physical_qty"))
        variance = physical - system_qty
        adj = StockAdjustment.objects.create(
            organization=org,
            item=item,
            warehouse=warehouse,
            system_qty=system_qty,
            physical_qty=physical,
            variance=variance,
            reason=data.get("reason") or "",
            date=_parse_date(data.get("date")) or timezone.localdate(),
        )
        return Response(serialize_adjustment(adj), status=201)


class InventoryAdjustmentDetailView(DomainAuthMixin, APIView):
    def get(self, request, adjustment_id):
        org = resolve_org(request.user)
        adj = (
            org_filter(
                StockAdjustment.objects.select_related("item", "warehouse", "approved_by"),
                org,
            )
            .filter(pk=adjustment_id)
            .first()
        )
        if not adj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_adjustment(adj))

    def patch(self, request, adjustment_id):
        org = resolve_org(request.user)
        adj = org_filter(StockAdjustment.objects.all(), org).filter(pk=adjustment_id).first()
        if not adj:
            return Response({"detail": "Not found."}, status=404)
        if adj.approved_by_id:
            return Response({"detail": "Approved adjustments cannot be edited."}, status=400)
        data = request.data
        if "physical_qty" in data:
            adj.physical_qty = _decimal(data.get("physical_qty"))
            adj.variance = adj.physical_qty - adj.system_qty
        if "reason" in data:
            adj.reason = data.get("reason") or ""
        if "date" in data:
            adj.date = _parse_date(data.get("date")) or adj.date
        adj.save()
        return Response(serialize_adjustment(adj))

    def post(self, request, adjustment_id):
        org = resolve_org(request.user)
        adj = org_filter(StockAdjustment.objects.all(), org).filter(pk=adjustment_id).first()
        if not adj:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "approve").strip()
        if action != "approve":
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        try:
            approve_stock_adjustment(adj, approved_by=request.user, actor=request.user)
            adj.refresh_from_db()
            return Response(serialize_adjustment(adj))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, adjustment_id):
        org = resolve_org(request.user)
        adj = org_filter(StockAdjustment.objects.all(), org).filter(pk=adjustment_id).first()
        if not adj:
            return Response({"detail": "Not found."}, status=404)
        if adj.approved_by_id:
            return Response({"detail": "Cannot delete approved adjustment."}, status=400)
        adj.delete()
        return Response(status=204)


# ── Material Issues ──────────────────────────────────────────────────────────


class InventoryMaterialIssuesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            MaterialIssue.objects.select_related(
                "warehouse", "work_order", "issued_by", "process_run"
            ).prefetch_related("lines__material"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(issue_no__icontains=search)
                | Q(work_order__wo_no__icontains=search)
                | Q(warehouse__code__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        warehouse_id = request.query_params.get("warehouse_id")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        qs = qs.order_by("-date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_issue(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        warehouse = Warehouse.objects.filter(pk=data.get("warehouse_id"), organization=org).first()
        if not warehouse:
            return Response({"detail": "warehouse_id required."}, status=400)
        issue_no = (data.get("issue_no") or "").strip()
        if not issue_no:
            n = MaterialIssue.objects.filter(organization=org).count() + 1
            issue_no = f"MI-{timezone.now():%Y%m%d}-{n:04d}"
        if MaterialIssue.objects.filter(organization=org, issue_no=issue_no).exists():
            return Response({"detail": "Issue number already exists."}, status=400)
        wo = None
        if data.get("work_order_id"):
            wo = WorkOrder.objects.filter(pk=data["work_order_id"], organization=org).first()
        issue = MaterialIssue.objects.create(
            organization=org,
            issue_no=issue_no,
            warehouse=warehouse,
            work_order=wo,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            issued_by=request.user,
            status=MaterialIssue.Status.DRAFT,
        )
        for row in data.get("lines") or []:
            material = ItemMaster.objects.filter(pk=row.get("material_id") or row.get("item_id"), organization=org).first()
            if not material:
                continue
            MaterialIssueLine.objects.create(
                issue=issue,
                material=material,
                required_qty=_decimal(row.get("required_qty") or row.get("qty")),
                issued_qty=_decimal(row.get("issued_qty") or row.get("required_qty") or row.get("qty")),
            )
        return Response(serialize_issue(issue), status=201)


class InventoryMaterialIssueDetailView(DomainAuthMixin, APIView):
    def get(self, request, issue_id):
        org = resolve_org(request.user)
        issue = (
            org_filter(
                MaterialIssue.objects.select_related(
                    "warehouse", "work_order", "issued_by"
                ).prefetch_related("lines__material"),
                org,
            )
            .filter(pk=issue_id)
            .first()
        )
        if not issue:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_issue(issue))

    def patch(self, request, issue_id):
        org = resolve_org(request.user)
        issue = (
            org_filter(MaterialIssue.objects.prefetch_related("lines"), org)
            .filter(pk=issue_id)
            .first()
        )
        if not issue:
            return Response({"detail": "Not found."}, status=404)
        if issue.status not in (MaterialIssue.Status.DRAFT, MaterialIssue.Status.APPROVED):
            return Response({"detail": "Only draft/approved issues can be edited."}, status=400)
        data = request.data
        if "date" in data:
            issue.date = _parse_date(data.get("date")) or issue.date
        if "warehouse_id" in data:
            wh = Warehouse.objects.filter(pk=data["warehouse_id"], organization=org).first()
            if wh:
                issue.warehouse = wh
        if "work_order_id" in data:
            wo_id = data.get("work_order_id")
            issue.work_order = (
                WorkOrder.objects.filter(pk=wo_id, organization=org).first() if wo_id else None
            )
        issue.save()
        for row in data.get("lines") or []:
            line = issue.lines.filter(pk=row.get("id")).first()
            if not line:
                continue
            if "required_qty" in row:
                line.required_qty = _decimal(row.get("required_qty"))
            if "issued_qty" in row:
                line.issued_qty = _decimal(row.get("issued_qty"))
            line.save()
        return Response(serialize_issue(issue))

    def post(self, request, issue_id):
        org = resolve_org(request.user)
        issue = org_filter(MaterialIssue.objects.all(), org).filter(pk=issue_id).first()
        if not issue:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "approve":
                if issue.status != MaterialIssue.Status.DRAFT:
                    return Response({"detail": "Only draft issues can be approved."}, status=400)
                issue.status = MaterialIssue.Status.APPROVED
                issue.save(update_fields=["status"])
            elif action == "issue":
                issue_material(issue, actor=request.user)
            elif action == "cancel":
                if issue.status == MaterialIssue.Status.ISSUED:
                    return Response({"detail": "Cannot cancel issued document."}, status=400)
                issue.status = MaterialIssue.Status.CANCELLED
                issue.save(update_fields=["status"])
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            issue.refresh_from_db()
            return Response(serialize_issue(issue))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, issue_id):
        org = resolve_org(request.user)
        issue = org_filter(MaterialIssue.objects.all(), org).filter(pk=issue_id).first()
        if not issue:
            return Response({"detail": "Not found."}, status=404)
        if issue.status != MaterialIssue.Status.DRAFT:
            return Response({"detail": "Only draft issues can be deleted."}, status=400)
        issue.delete()
        return Response(status=204)


# ── Reorder PR ───────────────────────────────────────────────────────────────


class InventoryReorderPRView(DomainAuthMixin, APIView):
    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        item = ItemMaster.objects.filter(pk=request.data.get("item_id"), organization=org).first()
        if not item:
            return Response({"detail": "Item not found."}, status=404)
        try:
            pr = create_reorder_pr(
                organization=org,
                item=item,
                qty=request.data.get("qty"),
                actor=request.user,
                requested_by=request.user,
            )
            return Response(serialize_requisition(pr), status=201)
        except DomainError as exc:
            return _domain_error(exc)
