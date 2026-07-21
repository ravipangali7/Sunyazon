"""Procurement APIs — vendors, PR, RFQ, PO, GRN with search/filter/pagination."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Department,
    GRN,
    GRNLine,
    ItemMaster,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    RFQ,
    Vendor,
    Warehouse,
)
from core.services.common import DomainError
from core.services.grn_service import post_grn, receive_grn
from core.services.procurement_service import (
    approve_po,
    approve_pr,
    cancel_po,
    reject_pr,
    send_po,
    submit_pr,
)
from core.views_domain import (
    DomainAuthMixin,
    _dec,
    _iso,
    _user_display,
    org_filter,
    resolve_org,
    serialize_grn,
    serialize_po,
    serialize_requisition,
)


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


def _score_grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    return "D"


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_vendor(v: Vendor) -> dict:
    return {
        "id": str(v.id),
        "vendor_name": v.vendor_name,
        "contact": v.contact or "",
        "category": v.category or "",
        "quality_rating": v.quality_rating,
        "delivery_rating": v.delivery_rating,
        "overall_score": v.overall_score,
        "grade": _score_grade(v.overall_score or 0),
        "pan_vat": v.pan_vat or "",
        "status": v.status,
        "po_count": getattr(v, "_po_count", None)
        if hasattr(v, "_po_count")
        else v.purchase_orders.count(),
        "rfq_count": getattr(v, "_rfq_count", None) if hasattr(v, "_rfq_count") else v.rfqs.count(),
    }


def serialize_pr_line(line: PurchaseRequisitionLine) -> dict:
    return {
        "id": str(line.id),
        "item_code": line.item_code or (line.material.item_code if line.material_id else ""),
        "material_id": str(line.material_id) if line.material_id else None,
        "material_name": line.material.name if line.material_id else "",
        "uom": line.material.uom if line.material_id else "pcs",
        "qty": _dec(line.qty),
        "required_date": _iso(line.required_date) or "",
    }


def serialize_pr_full(pr: PurchaseRequisition, *, include_lines: bool = True) -> dict:
    lines = list(pr.lines.select_related("material").all()) if include_lines else []
    first = lines[0] if lines else None
    base = serialize_requisition(pr)
    base.update(
        {
            "date": _iso(pr.date) or "",
            "department_id": str(pr.department_id) if pr.department_id else None,
            "requested_by_id": str(pr.requested_by_id) if pr.requested_by_id else None,
            "line_count": len(lines) if include_lines else pr.lines.count(),
            "item": first.material.name if first and first.material_id else base.get("item", "—"),
            "qty": _dec(first.qty) if first else base.get("qty", 0),
            "uom": first.material.uom if first and first.material_id else base.get("uom", "pcs"),
            "need_by": _iso(first.required_date) if first and first.required_date else base.get("need_by", ""),
            "lines": [serialize_pr_line(l) for l in lines] if include_lines else [],
        }
    )
    return base


def serialize_rfq(r: RFQ) -> dict:
    return {
        "id": str(r.id),
        "rfq_no": r.rfq_no,
        "supplier_id": str(r.supplier_id) if r.supplier_id else None,
        "vendor": r.supplier.vendor_name if r.supplier_id else "—",
        "item_id": str(r.item_id) if r.item_id else None,
        "item_code": r.item.item_code if r.item_id else "",
        "item": r.item.name if r.item_id else "—",
        "uom": r.item.uom if r.item_id else "pcs",
        "qty": _dec(r.qty),
        "unit_price": _dec(r.unit_price),
        "line_total": _dec(Decimal(r.qty or 0) * Decimal(r.unit_price or 0)),
        "delivery_days": r.delivery_days,
        "payment_terms": r.payment_terms or "",
        "remarks": r.remarks or "",
        "quality_score": r.supplier.quality_rating if r.supplier_id else 0,
        "delivery_score": r.supplier.delivery_rating if r.supplier_id else 0,
        "overall_score": r.supplier.overall_score if r.supplier_id else 0,
    }


def serialize_po_line(line: PurchaseOrderLine) -> dict:
    return {
        "id": str(line.id),
        "item_id": str(line.item_id) if line.item_id else None,
        "item_code": line.item.item_code if line.item_id else "",
        "item_name": line.item.name if line.item_id else "",
        "uom": line.item.uom if line.item_id else "pcs",
        "qty": _dec(line.qty),
        "rate": _dec(line.rate),
        "amount": _dec(line.amount),
    }


def serialize_po_full(po: PurchaseOrder, *, include_lines: bool = True) -> dict:
    lines = list(po.lines.select_related("item").all()) if include_lines else []
    first = lines[0] if lines else None
    base = serialize_po(po)
    base.update(
        {
            "supplier_id": str(po.supplier_id) if po.supplier_id else None,
            "approved_by_id": str(po.approved_by_id) if po.approved_by_id else None,
            "approved_by_name": _user_display(po.approved_by) if po.approved_by_id else "",
            "line_count": len(lines) if include_lines else po.lines.count(),
            "item": first.item.name if first and first.item_id else base.get("item", "—"),
            "qty": _dec(first.qty) if first else base.get("qty", 0),
            "uom": first.item.uom if first and first.item_id else base.get("uom", "pcs"),
            "unit_price": _dec(first.rate) if first else base.get("unit_price", 0),
            "lines": [serialize_po_line(l) for l in lines] if include_lines else [],
        }
    )
    return base


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
    base = serialize_grn(g)
    base.update(
        {
            "po_id": str(g.po_id) if g.po_id else None,
            "supplier_id": str(g.supplier_id) if g.supplier_id else None,
            "status": g.status,
            "date": _iso(g.date) or "",
            "received_by_id": str(g.received_by_id) if g.received_by_id else None,
            "received_by_name": _user_display(g.received_by) if g.received_by_id else "",
            "line_count": len(lines),
            "item": first.item.name if first and first.item_id else base.get("item", "—"),
            "qty": _dec(first.received_qty) if first else base.get("qty", 0),
            "uom": first.item.uom if first and first.item_id else base.get("uom", "pcs"),
            "lines": [serialize_grn_line(l) for l in lines],
        }
    )
    return base


# ── Overview ─────────────────────────────────────────────────────────────────


class ProcurementOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "pr_count": 0,
            "pr_pending": 0,
            "po_count": 0,
            "po_open": 0,
            "po_value": 0,
            "grn_count": 0,
            "grn_today": 0,
            "grn_qc_pending": 0,
            "vendor_count": 0,
            "vendor_active": 0,
            "rfq_count": 0,
            "avg_vendor_score": 0,
            "avg_cycle_days": 0,
            "otd_pct": 0,
            "by_pr_status": [],
            "by_po_status": [],
            "by_vendor_category": [],
            "recent_prs": [],
            "recent_pos": [],
            "recent_grns": [],
            "recent_rfqs": [],
            "top_vendors": [],
        }
        if not org:
            return Response(empty)

        today = timezone.localdate()
        prs = PurchaseRequisition.objects.filter(organization=org)
        pos = PurchaseOrder.objects.filter(organization=org)
        grns = GRN.objects.filter(organization=org)
        vendors = Vendor.objects.filter(organization=org)
        rfqs = RFQ.objects.filter(organization=org)

        pr_pending = prs.filter(
            status__in=[PurchaseRequisition.Status.DRAFT, PurchaseRequisition.Status.SUBMITTED]
        ).count()
        po_open = pos.exclude(
            status__in=[PurchaseOrder.Status.CLOSED, PurchaseOrder.Status.CANCELLED]
        ).count()
        po_value = _dec(pos.aggregate(s=Sum("total"))["s"] or 0)
        grn_today = grns.filter(date=today).count()
        grn_qc_pending = grns.filter(qc_status=GRN.QCStatus.PENDING).exclude(
            status=GRN.Status.CANCELLED
        ).count()

        by_pr_status = [
            {"name": row["status"] or "unknown", "code": row["status"] or "", "value": row["c"]}
            for row in prs.values("status").annotate(c=Count("id")).order_by()
        ]
        by_po_status = [
            {"name": row["status"] or "unknown", "code": row["status"] or "", "value": row["c"]}
            for row in pos.values("status").annotate(c=Count("id")).order_by()
        ]
        by_vendor_category = [
            {
                "name": row["category"] or "Uncategorized",
                "code": row["category"] or "",
                "value": row["c"],
            }
            for row in vendors.values("category").annotate(c=Count("id")).order_by("-c")[:8]
        ]

        # Cycle days: PR date → first related PO date (via material supplier match approx)
        cycle_samples = []
        for pr in prs.filter(status=PurchaseRequisition.Status.APPROVED).order_by("-date")[:30]:
            line = pr.lines.select_related("material__supplier").first()
            supplier = line.material.supplier if line and line.material_id else None
            if not supplier:
                continue
            po = (
                PurchaseOrder.objects.filter(organization=org, supplier=supplier, date__gte=pr.date)
                .order_by("date")
                .first()
            )
            if po:
                cycle_samples.append((po.date - pr.date).days)
        avg_cycle = round(sum(cycle_samples) / len(cycle_samples), 1) if cycle_samples else 0

        # OTD: POs with delivery_date met by a posted GRN on/before delivery_date
        sent_closed = pos.filter(
            status__in=[PurchaseOrder.Status.SENT, PurchaseOrder.Status.CLOSED]
        ).exclude(delivery_date__isnull=True)
        otd_total = sent_closed.count()
        otd_ok = 0
        for po in sent_closed.select_related().prefetch_related("grns")[:100]:
            posted = po.grns.filter(status=GRN.Status.POSTED).order_by("date").first()
            if posted and po.delivery_date and posted.date <= po.delivery_date:
                otd_ok += 1
        otd_pct = round((otd_ok / otd_total) * 100, 1) if otd_total else 0

        avg_score = vendors.aggregate(a=Avg("overall_score"))["a"] or 0

        recent_prs = [
            serialize_pr_full(pr, include_lines=False)
            for pr in prs.select_related("requested_by", "department")
            .prefetch_related("lines__material")
            .order_by("-date", "-id")[:8]
        ]
        recent_pos = [
            serialize_po_full(po, include_lines=False)
            for po in pos.select_related("supplier")
            .prefetch_related("lines__item")
            .order_by("-date", "-id")[:8]
        ]
        recent_grns = [
            serialize_grn_full(g)
            for g in grns.select_related("po", "supplier", "received_by")
            .prefetch_related("lines__item")
            .order_by("-date", "-id")[:8]
        ]
        recent_rfqs = [
            serialize_rfq(r)
            for r in rfqs.select_related("supplier", "item").order_by("-id")[:8]
        ]
        top_vendors = [
            serialize_vendor(v)
            for v in vendors.annotate(
                _po_count=Count("purchase_orders", distinct=True),
                _rfq_count=Count("rfqs", distinct=True),
            ).order_by("-overall_score", "vendor_name")[:6]
        ]

        return Response(
            {
                "pr_count": prs.count(),
                "pr_pending": pr_pending,
                "po_count": pos.count(),
                "po_open": po_open,
                "po_value": po_value,
                "grn_count": grns.count(),
                "grn_today": grn_today,
                "grn_qc_pending": grn_qc_pending,
                "vendor_count": vendors.count(),
                "vendor_active": vendors.filter(status=Vendor.Status.ACTIVE).count(),
                "rfq_count": rfqs.count(),
                "avg_vendor_score": round(float(avg_score), 1),
                "avg_cycle_days": avg_cycle,
                "otd_pct": otd_pct,
                "by_pr_status": by_pr_status,
                "by_po_status": by_po_status,
                "by_vendor_category": by_vendor_category,
                "recent_prs": recent_prs,
                "recent_pos": recent_pos,
                "recent_grns": recent_grns,
                "recent_rfqs": recent_rfqs,
                "top_vendors": top_vendors,
            }
        )


class ProcurementOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {"vendors": [], "items": [], "departments": [], "open_pos": [], "warehouses": []}
            )
        vendors = [
            {"id": str(v.id), "name": v.vendor_name, "status": v.status, "score": v.overall_score}
            for v in Vendor.objects.filter(organization=org).order_by("vendor_name")[:200]
        ]
        items = [
            {
                "id": str(i.id),
                "code": i.item_code,
                "name": i.name,
                "uom": i.uom,
                "supplier_id": str(i.supplier_id) if i.supplier_id else None,
            }
            for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:300]
        ]
        departments = [
            {"id": str(d.id), "name": d.name, "code": getattr(d, "code", "") or ""}
            for d in Department.objects.filter(organization=org).order_by("name")[:100]
        ]
        open_pos = [
            {
                "id": str(po.id),
                "po_no": po.po_no,
                "vendor": po.supplier.vendor_name if po.supplier_id else "",
                "supplier_id": str(po.supplier_id) if po.supplier_id else None,
                "status": po.status,
            }
            for po in PurchaseOrder.objects.filter(organization=org)
            .exclude(status__in=[PurchaseOrder.Status.CLOSED, PurchaseOrder.Status.CANCELLED])
            .select_related("supplier")
            .order_by("-date")[:100]
        ]
        warehouses = [
            {"id": str(w.id), "code": w.code, "name": w.name}
            for w in Warehouse.objects.filter(organization=org).order_by("code")[:50]
        ]
        return Response(
            {
                "vendors": vendors,
                "items": items,
                "departments": departments,
                "open_pos": open_pos,
                "warehouses": warehouses,
            }
        )


# ── Vendors ──────────────────────────────────────────────────────────────────


class ProcurementVendorsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Vendor.objects.all(), org).annotate(
            _po_count=Count("purchase_orders", distinct=True),
            _rfq_count=Count("rfqs", distinct=True),
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(vendor_name__icontains=search)
                | Q(contact__icontains=search)
                | Q(category__icontains=search)
                | Q(pan_vat__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category__icontains=category)
        ordering = request.query_params.get("ordering") or "vendor_name"
        allowed = {
            "vendor_name",
            "-vendor_name",
            "overall_score",
            "-overall_score",
            "status",
            "-status",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("vendor_name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_vendor(v) for v in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        name = (data.get("vendor_name") or "").strip()
        if not name:
            return Response({"detail": "vendor_name is required."}, status=400)
        vendor = Vendor.objects.create(
            organization=org,
            vendor_name=name,
            contact=(data.get("contact") or "").strip(),
            category=(data.get("category") or "").strip(),
            quality_rating=int(data.get("quality_rating") or 0),
            delivery_rating=int(data.get("delivery_rating") or 0),
            overall_score=int(
                data.get("overall_score")
                or (
                    (
                        int(data.get("quality_rating") or 0)
                        + int(data.get("delivery_rating") or 0)
                    )
                    // 2
                )
            ),
            pan_vat=(data.get("pan_vat") or "").strip(),
            status=data.get("status") or Vendor.Status.ACTIVE,
        )
        return Response(serialize_vendor(vendor), status=201)


class ProcurementVendorDetailView(DomainAuthMixin, APIView):
    def get(self, request, vendor_id):
        org = resolve_org(request.user)
        v = (
            org_filter(Vendor.objects.all(), org)
            .annotate(
                _po_count=Count("purchase_orders", distinct=True),
                _rfq_count=Count("rfqs", distinct=True),
            )
            .filter(pk=vendor_id)
            .first()
        )
        if not v:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_vendor(v))

    def patch(self, request, vendor_id):
        org = resolve_org(request.user)
        v = org_filter(Vendor.objects.all(), org).filter(pk=vendor_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("vendor_name", "contact", "category", "pan_vat"):
            if field in data:
                setattr(v, field, (data.get(field) or "").strip())
        for field in ("quality_rating", "delivery_rating", "overall_score"):
            if field in data and data[field] is not None:
                setattr(v, field, int(data[field]))
        if "status" in data and data["status"] in Vendor.Status.values:
            v.status = data["status"]
        if "overall_score" not in data and (
            "quality_rating" in data or "delivery_rating" in data
        ):
            v.overall_score = (v.quality_rating + v.delivery_rating) // 2
        v.save()
        return Response(serialize_vendor(v))

    def delete(self, request, vendor_id):
        org = resolve_org(request.user)
        v = org_filter(Vendor.objects.all(), org).filter(pk=vendor_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        if v.purchase_orders.exists() or v.rfqs.exists() or v.grns.exists():
            return Response(
                {"detail": "Vendor has linked POs/RFQs/GRNs — set inactive instead."},
                status=400,
            )
        v.delete()
        return Response(status=204)


# ── Purchase Requisitions ────────────────────────────────────────────────────


class ProcurementRequisitionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            PurchaseRequisition.objects.select_related("requested_by", "department").prefetch_related(
                "lines__material"
            ),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(pr_no__icontains=search)
                | Q(department__name__icontains=search)
                | Q(lines__material__name__icontains=search)
                | Q(lines__item_code__icontains=search)
            ).distinct()
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        dept = request.query_params.get("department_id")
        if dept:
            qs = qs.filter(department_id=dept)
        ordering = request.query_params.get("ordering") or "-date"
        allowed = {"date", "-date", "pr_no", "-pr_no", "status", "-status"}
        qs = qs.order_by(ordering if ordering in allowed else "-date", "-id")
        items, meta = _paginate(qs, request)
        return Response(
            {"results": [serialize_pr_full(pr, include_lines=False) for pr in items], **meta}
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        pr_no = (data.get("pr_no") or "").strip()
        if not pr_no:
            n = PurchaseRequisition.objects.filter(organization=org).count() + 1
            pr_no = f"PR-{timezone.now():%Y%m%d}-{n:04d}"
        if PurchaseRequisition.objects.filter(organization=org, pr_no=pr_no).exists():
            return Response({"detail": "PR number already exists."}, status=400)
        department = None
        if data.get("department_id"):
            department = Department.objects.filter(
                pk=data["department_id"], organization=org
            ).first()
        pr = PurchaseRequisition.objects.create(
            organization=org,
            pr_no=pr_no,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            department=department,
            requested_by=request.user,
            status=data.get("status") or PurchaseRequisition.Status.DRAFT,
        )
        for row in data.get("lines") or []:
            material = ItemMaster.objects.filter(pk=row.get("material_id"), organization=org).first()
            if not material:
                continue
            PurchaseRequisitionLine.objects.create(
                pr=pr,
                item_code=(row.get("item_code") or material.item_code or "").strip(),
                material=material,
                qty=_decimal(row.get("qty"), "1"),
                required_date=_parse_date(row.get("required_date")),
            )
        return Response(serialize_pr_full(pr), status=201)


class ProcurementRequisitionDetailView(DomainAuthMixin, APIView):
    def get(self, request, pr_id):
        org = resolve_org(request.user)
        pr = (
            org_filter(
                PurchaseRequisition.objects.select_related("requested_by", "department").prefetch_related(
                    "lines__material"
                ),
                org,
            )
            .filter(pk=pr_id)
            .first()
        )
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_pr_full(pr))

    def patch(self, request, pr_id):
        org = resolve_org(request.user)
        pr = org_filter(PurchaseRequisition.objects.prefetch_related("lines"), org).filter(pk=pr_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        if pr.status not in (PurchaseRequisition.Status.DRAFT, PurchaseRequisition.Status.SUBMITTED):
            return Response({"detail": "Only draft/submitted PRs can be edited."}, status=400)
        data = request.data
        if "date" in data:
            pr.date = _parse_date(data.get("date")) or pr.date
        if "department_id" in data:
            pr.department = (
                Department.objects.filter(pk=data["department_id"], organization=org).first()
                if data["department_id"]
                else None
            )
        pr.save()
        if "lines" in data:
            pr.lines.all().delete()
            for row in data.get("lines") or []:
                material = ItemMaster.objects.filter(
                    pk=row.get("material_id"), organization=org
                ).first()
                if not material:
                    continue
                PurchaseRequisitionLine.objects.create(
                    pr=pr,
                    item_code=(row.get("item_code") or material.item_code or "").strip(),
                    material=material,
                    qty=_decimal(row.get("qty"), "1"),
                    required_date=_parse_date(row.get("required_date")),
                )
        return Response(serialize_pr_full(pr))

    def post(self, request, pr_id):
        org = resolve_org(request.user)
        pr = org_filter(PurchaseRequisition.objects.all(), org).filter(pk=pr_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "submit":
                submit_pr(pr, actor=request.user)
            elif action == "approve":
                supplier = None
                if request.data.get("supplier_id"):
                    supplier = Vendor.objects.filter(
                        pk=request.data["supplier_id"], organization=org
                    ).first()
                approve_pr(
                    pr,
                    actor=request.user,
                    spawn_po=bool(request.data.get("spawn_po", True)),
                    supplier=supplier,
                )
            elif action == "reject":
                reject_pr(pr, actor=request.user, reason=request.data.get("reason") or "")
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            pr.refresh_from_db()
            return Response(serialize_pr_full(pr))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, pr_id):
        org = resolve_org(request.user)
        pr = org_filter(PurchaseRequisition.objects.all(), org).filter(pk=pr_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        if pr.status != PurchaseRequisition.Status.DRAFT:
            return Response({"detail": "Only draft PRs can be deleted."}, status=400)
        pr.delete()
        return Response(status=204)


# ── RFQ ──────────────────────────────────────────────────────────────────────


class ProcurementRFQsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(RFQ.objects.select_related("supplier", "item"), org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(rfq_no__icontains=search)
                | Q(supplier__vendor_name__icontains=search)
                | Q(item__name__icontains=search)
                | Q(item__item_code__icontains=search)
            )
        supplier_id = request.query_params.get("supplier_id")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        item_id = request.query_params.get("item_id")
        if item_id:
            qs = qs.filter(item_id=item_id)
        rfq_no = request.query_params.get("rfq_no")
        if rfq_no:
            qs = qs.filter(rfq_no=rfq_no)
        ordering = request.query_params.get("ordering") or "rfq_no"
        allowed = {
            "rfq_no",
            "-rfq_no",
            "unit_price",
            "-unit_price",
            "delivery_days",
            "-delivery_days",
        }
        qs = qs.order_by(ordering if ordering in allowed else "rfq_no")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_rfq(r) for r in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        supplier = Vendor.objects.filter(pk=data.get("supplier_id"), organization=org).first()
        item = ItemMaster.objects.filter(pk=data.get("item_id"), organization=org).first()
        if not supplier or not item:
            return Response({"detail": "supplier_id and item_id are required."}, status=400)
        rfq_no = (data.get("rfq_no") or "").strip()
        if not rfq_no:
            n = RFQ.objects.filter(organization=org).count() + 1
            rfq_no = f"RFQ-{timezone.now():%Y%m%d}-{n:04d}"
        rfq = RFQ.objects.create(
            organization=org,
            rfq_no=rfq_no,
            supplier=supplier,
            item=item,
            qty=_decimal(data.get("qty"), "1"),
            unit_price=_decimal(data.get("unit_price")),
            delivery_days=int(data.get("delivery_days") or 0),
            payment_terms=(data.get("payment_terms") or "").strip(),
            remarks=(data.get("remarks") or "").strip(),
        )
        return Response(serialize_rfq(rfq), status=201)


class ProcurementRFQDetailView(DomainAuthMixin, APIView):
    def get(self, request, rfq_id):
        org = resolve_org(request.user)
        r = org_filter(RFQ.objects.select_related("supplier", "item"), org).filter(pk=rfq_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_rfq(r))

    def patch(self, request, rfq_id):
        org = resolve_org(request.user)
        r = org_filter(RFQ.objects.all(), org).filter(pk=rfq_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "supplier_id" in data and data["supplier_id"]:
            supplier = Vendor.objects.filter(pk=data["supplier_id"], organization=org).first()
            if supplier:
                r.supplier = supplier
        if "item_id" in data and data["item_id"]:
            item = ItemMaster.objects.filter(pk=data["item_id"], organization=org).first()
            if item:
                r.item = item
        if "qty" in data:
            r.qty = _decimal(data.get("qty"))
        if "unit_price" in data:
            r.unit_price = _decimal(data.get("unit_price"))
        if "delivery_days" in data:
            r.delivery_days = int(data.get("delivery_days") or 0)
        if "payment_terms" in data:
            r.payment_terms = (data.get("payment_terms") or "").strip()
        if "remarks" in data:
            r.remarks = (data.get("remarks") or "").strip()
        if "rfq_no" in data and data["rfq_no"]:
            r.rfq_no = data["rfq_no"].strip()
        r.save()
        return Response(serialize_rfq(r))

    def delete(self, request, rfq_id):
        org = resolve_org(request.user)
        r = org_filter(RFQ.objects.all(), org).filter(pk=rfq_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        r.delete()
        return Response(status=204)


# ── Purchase Orders ──────────────────────────────────────────────────────────


class ProcurementOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            PurchaseOrder.objects.select_related("supplier", "approved_by").prefetch_related(
                "lines__item"
            ),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(po_no__icontains=search)
                | Q(supplier__vendor_name__icontains=search)
                | Q(lines__item__name__icontains=search)
            ).distinct()
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        supplier_id = request.query_params.get("supplier_id")
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        ordering = request.query_params.get("ordering") or "-date"
        allowed = {"date", "-date", "po_no", "-po_no", "total", "-total", "status", "-status"}
        qs = qs.order_by(ordering if ordering in allowed else "-date", "-id")
        items, meta = _paginate(qs, request)
        return Response(
            {"results": [serialize_po_full(po, include_lines=False) for po in items], **meta}
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        supplier = Vendor.objects.filter(pk=data.get("supplier_id"), organization=org).first()
        if not supplier:
            return Response({"detail": "supplier_id is required."}, status=400)
        po_no = (data.get("po_no") or "").strip()
        if not po_no:
            n = PurchaseOrder.objects.filter(organization=org).count() + 1
            po_no = f"PO-{timezone.now():%Y%m%d}-{n:04d}"
        if PurchaseOrder.objects.filter(organization=org, po_no=po_no).exists():
            return Response({"detail": "PO number already exists."}, status=400)
        lines_data = data.get("lines") or []
        total = _decimal(data.get("total"))
        if lines_data and not total:
            total = sum(
                (
                    _decimal(l.get("amount"), str(_decimal(l.get("qty")) * _decimal(l.get("rate"))))
                    for l in lines_data
                ),
                Decimal("0"),
            )
        po = PurchaseOrder.objects.create(
            organization=org,
            po_no=po_no,
            supplier=supplier,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            delivery_date=_parse_date(data.get("delivery_date")),
            total=total,
            status=data.get("status") or PurchaseOrder.Status.DRAFT,
        )
        for row in lines_data:
            item = ItemMaster.objects.filter(pk=row.get("item_id"), organization=org).first()
            if not item:
                continue
            qty = _decimal(row.get("qty"))
            rate = _decimal(row.get("rate"))
            PurchaseOrderLine.objects.create(
                po=po,
                item=item,
                qty=qty,
                rate=rate,
                amount=_decimal(row.get("amount"), str(qty * rate)),
            )
        return Response(serialize_po_full(po), status=201)


class ProcurementOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, po_id):
        org = resolve_org(request.user)
        po = (
            org_filter(
                PurchaseOrder.objects.select_related("supplier", "approved_by").prefetch_related(
                    "lines__item"
                ),
                org,
            )
            .filter(pk=po_id)
            .first()
        )
        if not po:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_po_full(po))

    def patch(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.prefetch_related("lines"), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        if po.status not in (PurchaseOrder.Status.DRAFT,):
            return Response({"detail": "Only draft POs can be edited."}, status=400)
        data = request.data
        if "delivery_date" in data:
            po.delivery_date = _parse_date(data.get("delivery_date"))
        if "date" in data:
            po.date = _parse_date(data.get("date")) or po.date
        if "supplier_id" in data and data["supplier_id"]:
            supplier = Vendor.objects.filter(pk=data["supplier_id"], organization=org).first()
            if supplier:
                po.supplier = supplier
        if "lines" in data:
            po.lines.all().delete()
            total = Decimal("0")
            for row in data.get("lines") or []:
                item = ItemMaster.objects.filter(pk=row.get("item_id"), organization=org).first()
                if not item:
                    continue
                qty = _decimal(row.get("qty"))
                rate = _decimal(row.get("rate"))
                amount = _decimal(row.get("amount"), str(qty * rate))
                PurchaseOrderLine.objects.create(
                    po=po, item=item, qty=qty, rate=rate, amount=amount
                )
                total += amount
            po.total = total
        elif "total" in data:
            po.total = _decimal(data.get("total"))
        po.save()
        return Response(serialize_po_full(po))

    def post(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.all(), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "approve":
                approve_po(po, approved_by=request.user, actor=request.user)
            elif action == "send":
                send_po(po, actor=request.user)
            elif action == "cancel":
                cancel_po(po, actor=request.user)
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
            po.refresh_from_db()
            return Response(serialize_po_full(po))
        except DomainError as exc:
            return _domain_error(exc)

    def delete(self, request, po_id):
        org = resolve_org(request.user)
        po = org_filter(PurchaseOrder.objects.all(), org).filter(pk=po_id).first()
        if not po:
            return Response({"detail": "Not found."}, status=404)
        if po.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.CANCELLED):
            return Response({"detail": "Only draft/cancelled POs can be deleted."}, status=400)
        po.delete()
        return Response(status=204)


# ── GRN ──────────────────────────────────────────────────────────────────────


class ProcurementGRNsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            GRN.objects.select_related("po", "supplier", "received_by").prefetch_related(
                "lines__item"
            ),
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
            supplier = (
                Vendor.objects.filter(pk=data["supplier_id"], organization=org).first() or supplier
            )
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
            qc_status=data.get("qc_status") or GRN.QCStatus.PENDING,
            received_by=request.user,
        )
        lines_data = data.get("lines") or []
        if not lines_data:
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
                    received_qty=_decimal(row.get("received_qty")),
                    accepted_qty=_decimal(row.get("accepted_qty"), str(row.get("received_qty") or 0)),
                    rejected_qty=_decimal(row.get("rejected_qty")),
                )
        return Response(serialize_grn_full(grn), status=201)


class ProcurementGRNDetailView(DomainAuthMixin, APIView):
    def get(self, request, grn_id):
        org = resolve_org(request.user)
        grn = (
            org_filter(
                GRN.objects.select_related("po", "supplier", "received_by").prefetch_related(
                    "lines__item"
                ),
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
