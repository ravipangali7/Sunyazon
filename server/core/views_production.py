"""Production module APIs — BOM, batches, work orders, WIP, costing, damage, working reports.

Aligned with models.md §17 and design.md §12.6.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    BOM,
    BOMLine,
    Batch,
    DamageExpire,
    Department,
    Employee,
    ItemMaster,
    ProcessDefinition,
    ProcessRun,
    ProcessStage,
    ProductionCosting,
    RegisterBook,
    Warehouse,
    WIPTracking,
    WorkOrder,
    WorkingReport,
)
from core.services.common import DomainError
from core.services.process_service import (
    approve_damage_expire,
    close_batch,
    quarantine_batch,
    release_work_order,
)
from core.views_domain import DomainAuthMixin, _dec, _iso, org_filter, resolve_org, serialize_work_order


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
    if hasattr(value, "year") and not isinstance(value, str):
        return value
    return parse_date(str(value))


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    return parse_datetime(str(value))


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


def _ordering(qs, request, allowed: dict[str, str], default: str):
    raw = (request.query_params.get("ordering") or default).strip()
    desc = raw.startswith("-")
    key = raw.lstrip("-")
    field = allowed.get(key)
    if not field:
        return qs.order_by(default)
    return qs.order_by(f"-{field}" if desc else field)


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_bom_line(line: BOMLine) -> dict:
    return {
        "id": str(line.id),
        "bom_id": str(line.bom_id),
        "raw_material_id": str(line.raw_material_id) if line.raw_material_id else None,
        "raw_material_code": line.raw_material.item_code if line.raw_material_id else "",
        "raw_material_name": line.raw_material.name if line.raw_material_id else "",
        "qty_per_unit": _dec(line.qty_per_unit),
        "uom": line.uom or "pcs",
        "scrap_pct": _dec(line.scrap_pct) if line.scrap_pct is not None else None,
        "sort_order": line.sort_order,
        "remarks": line.remarks or "",
    }


def serialize_bom(bom: BOM, *, include_lines=True) -> dict:
    lines = []
    if include_lines:
        qs = getattr(bom, "_prefetched_objects_cache", {}).get("lines")
        if qs is None:
            qs = bom.lines.select_related("raw_material").all()
        lines = [serialize_bom_line(l) for l in qs]
    return {
        "id": str(bom.id),
        "code": bom.code,
        "name": bom.name,
        "finished_product_id": str(bom.finished_product_id) if bom.finished_product_id else None,
        "finished_product_name": bom.finished_product.name if bom.finished_product_id else "",
        "finished_item_id": str(bom.finished_item_id) if bom.finished_item_id else None,
        "finished_item_code": bom.finished_item.item_code if bom.finished_item_id else "",
        "finished_item_name": bom.finished_item.name if bom.finished_item_id else "",
        "version": bom.version,
        "status": bom.status,
        "effective_from": _iso(bom.effective_from),
        "created_at": _iso(bom.created_at),
        "line_count": len(lines) if include_lines else getattr(bom, "line_count", bom.lines.count()),
        "lines": lines,
    }


def serialize_batch(b: Batch) -> dict:
    return {
        "id": str(b.id),
        "batch_no": b.batch_no,
        "product_id": str(b.product_id) if b.product_id else None,
        "product_name": b.product.name if b.product_id else "",
        "output_item_id": str(b.output_item_id) if b.output_item_id else None,
        "output_item_code": b.output_item.item_code if b.output_item_id else "",
        "output_item_name": b.output_item.name if b.output_item_id else "",
        "work_order_id": str(b.work_order_id) if b.work_order_id else None,
        "work_order_no": b.work_order.wo_no if b.work_order_id else "",
        "batch_size": _dec(b.batch_size),
        "start_date": _iso(b.start_date),
        "end_date": _iso(b.end_date),
        "manufacture_date": _iso(b.manufacture_date),
        "expire_date": _iso(b.expire_date),
        "supervisor_id": str(b.supervisor_id) if b.supervisor_id else None,
        "supervisor_name": b.supervisor.full_name if b.supervisor_id else "",
        "status": b.status,
        "created_at": _iso(b.created_at),
    }


def serialize_work_order_full(wo: WorkOrder) -> dict:
    base = serialize_work_order(wo)
    base.update(
        {
            "wo_no": wo.wo_no,
            "title": wo.title,
            "process_definition_id": str(wo.process_definition_id) if wo.process_definition_id else None,
            "process_definition_name": wo.process_definition.name if wo.process_definition_id else "",
            "product_id": str(wo.product_id) if wo.product_id else None,
            "output_item_id": str(wo.output_item_id) if wo.output_item_id else None,
            "output_item_code": wo.output_item.item_code if wo.output_item_id else "",
            "batch_id": str(wo.batch_id) if wo.batch_id else None,
            "bom_id": str(wo.bom_id) if wo.bom_id else None,
            "bom_code": wo.bom.code if wo.bom_id else "",
            "target_qty": _dec(wo.target_qty) if wo.target_qty is not None else None,
            "actual_qty": _dec(wo.actual_qty) if wo.actual_qty is not None else None,
            "waste_qty": _dec(wo.waste_qty) if wo.waste_qty is not None else None,
            "priority": wo.priority,
            "planned_start": _iso(wo.planned_start),
            "planned_end": _iso(wo.planned_end),
            "department_id": str(wo.department_id) if wo.department_id else None,
            "department_name": wo.department.name if wo.department_id else "",
            "supervisor_id": str(wo.supervisor_id) if wo.supervisor_id else None,
            "supervisor_name": wo.supervisor.full_name if wo.supervisor_id else "",
            "customer_party_id": str(wo.customer_party_id) if wo.customer_party_id else None,
            "project_code": wo.project_code or "",
            "raw_status": wo.status,
            "date": _iso(wo.date),
            "custom_data_json": wo.custom_data_json or {},
            "created_at": _iso(wo.created_at),
            "updated_at": _iso(wo.updated_at),
        }
    )
    return base


def serialize_wip(w: WIPTracking) -> dict:
    return {
        "id": str(w.id),
        "date": _iso(w.date),
        "work_order_id": str(w.work_order_id) if w.work_order_id else None,
        "work_order_no": w.work_order.wo_no if w.work_order_id else "",
        "process_stage_id": str(w.process_stage_id),
        "process_stage_code": w.process_stage.code if w.process_stage_id else "",
        "process_stage_name": w.process_stage.name if w.process_stage_id else "",
        "opening_wip": _dec(w.opening_wip),
        "input_qty": _dec(w.input_qty),
        "output_qty": _dec(w.output_qty),
        "closing_wip": _dec(w.closing_wip),
    }


def serialize_costing(c: ProductionCosting) -> dict:
    return {
        "id": str(c.id),
        "work_order_id": str(c.work_order_id),
        "work_order_no": c.work_order.wo_no if c.work_order_id else "",
        "process_run_id": str(c.process_run_id) if c.process_run_id else None,
        "process_run_no": c.process_run.run_no if c.process_run_id else "",
        "product_id": str(c.product_id) if c.product_id else None,
        "product_name": c.product.name if c.product_id else "",
        "item_id": str(c.item_id) if c.item_id else None,
        "item_code": c.item.item_code if c.item_id else "",
        "item_name": c.item.name if c.item_id else "",
        "material_cost": _dec(c.material_cost),
        "labor_cost": _dec(c.labor_cost),
        "machine_cost": _dec(c.machine_cost),
        "overhead_cost": _dec(c.overhead_cost),
        "total_cost": _dec(c.total_cost),
        "per_unit_cost": _dec(c.per_unit_cost) if c.per_unit_cost is not None else None,
        "journal_voucher_id": str(c.journal_voucher_id) if c.journal_voucher_id else None,
        "period_date": _iso(c.period_date),
        "created_at": _iso(c.created_at),
    }


def serialize_damage(d: DamageExpire) -> dict:
    return {
        "id": str(d.id),
        "product_id": str(d.product_id) if d.product_id else None,
        "product_name": d.product.name if d.product_id else "",
        "item_id": str(d.item_id) if d.item_id else None,
        "item_code": d.item.item_code if d.item_id else "",
        "item_name": d.item.name if d.item_id else "",
        "batch_id": str(d.batch_id) if d.batch_id else None,
        "batch_no": d.batch.batch_no if d.batch_id else "",
        "work_order_id": str(d.work_order_id) if d.work_order_id else None,
        "work_order_no": d.work_order.wo_no if d.work_order_id else "",
        "process_run_line_id": str(d.process_run_line_id) if d.process_run_line_id else None,
        "qty": _dec(d.qty),
        "reason": d.reason,
        "date": _iso(d.date),
        "approved_by_id": str(d.approved_by_id) if d.approved_by_id else None,
        "approved_by_name": (
            d.approved_by.get_full_name() or d.approved_by.username if d.approved_by_id else ""
        ),
        "stock_ledger_id": str(d.stock_ledger_id) if d.stock_ledger_id else None,
        "is_posted": bool(d.stock_ledger_id),
    }


def serialize_working_report(r: WorkingReport) -> dict:
    return {
        "id": str(r.id),
        "employee_id": str(r.employee_id),
        "employee_code": r.employee.employee_code if r.employee_id else "",
        "employee_name": r.employee.full_name if r.employee_id else "",
        "work_order_id": str(r.work_order_id) if r.work_order_id else None,
        "work_order_no": r.work_order.wo_no if r.work_order_id else "",
        "process_run_stage_id": str(r.process_run_stage_id) if r.process_run_stage_id else None,
        "date": _iso(r.date),
        "activities_json": r.activities_json or [],
        "hours": _dec(r.hours),
        "remarks": r.remarks or "",
        "created_at": _iso(r.created_at),
    }


def serialize_register(r: RegisterBook) -> dict:
    return {
        "id": str(r.id),
        "entry_date": _iso(r.entry_date),
        "entry_type": r.entry_type or "",
        "reference_type": r.reference_type or "",
        "reference_id": str(r.reference_id) if r.reference_id else None,
        "reference_no": r.reference_no or "",
        "description": r.description or "",
        "qty": _dec(r.qty),
        "balance": _dec(r.balance),
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class ProductionOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "work_orders": 0,
                    "in_progress": 0,
                    "on_hold": 0,
                    "completed": 0,
                    "planned_qty": 0,
                    "produced_qty": 0,
                    "boms": 0,
                    "batches_active": 0,
                    "wip_closing": 0,
                    "damage_open": 0,
                    "costing_total": 0,
                    "report_hours_today": 0,
                }
            )

        wo_qs = WorkOrder.objects.filter(organization=org)
        agg = wo_qs.aggregate(planned=Sum("target_qty"), produced=Sum("actual_qty"))
        today = timezone.localdate()
        return Response(
            {
                "work_orders": wo_qs.count(),
                "in_progress": wo_qs.filter(status=WorkOrder.Status.IN_PROGRESS).count(),
                "on_hold": wo_qs.filter(status=WorkOrder.Status.ON_HOLD).count(),
                "completed": wo_qs.filter(status=WorkOrder.Status.COMPLETED).count(),
                "draft": wo_qs.filter(status=WorkOrder.Status.DRAFT).count(),
                "released": wo_qs.filter(status=WorkOrder.Status.RELEASED).count(),
                "planned_qty": _dec(agg["planned"]),
                "produced_qty": _dec(agg["produced"]),
                "boms": BOM.objects.filter(organization=org).exclude(status=BOM.Status.OBSOLETE).count(),
                "batches_active": Batch.objects.filter(
                    organization=org, status__in=[Batch.Status.PLANNED, Batch.Status.ACTIVE]
                ).count(),
                "wip_closing": _dec(
                    WIPTracking.objects.filter(organization=org, date=today).aggregate(t=Sum("closing_wip"))["t"]
                ),
                "damage_open": DamageExpire.objects.filter(organization=org, stock_ledger__isnull=True).count(),
                "costing_total": _dec(
                    ProductionCosting.objects.filter(organization=org).aggregate(t=Sum("total_cost"))["t"]
                ),
                "report_hours_today": _dec(
                    WorkingReport.objects.filter(organization=org, date=today).aggregate(t=Sum("hours"))["t"]
                ),
            }
        )


class ProductionOptionsView(DomainAuthMixin, APIView):
    """Lookup lists for production forms (items, definitions, employees, warehouses)."""

    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "items": [],
                    "definitions": [],
                    "employees": [],
                    "departments": [],
                    "boms": [],
                    "batches": [],
                    "work_orders": [],
                    "stages": [],
                    "warehouses": [],
                }
            )

        items = [
            {"id": str(i.id), "code": i.item_code, "name": i.name, "uom": i.uom, "category": i.category}
            for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:300]
        ]
        definitions = [
            {"id": str(d.id), "code": d.code, "name": d.name, "status": d.status}
            for d in ProcessDefinition.objects.filter(organization=org)
            .exclude(status=ProcessDefinition.Status.ARCHIVED)
            .order_by("code")[:100]
        ]
        employees = [
            {"id": str(e.id), "code": e.employee_code, "name": e.full_name}
            for e in Employee.objects.filter(organization=org, status=Employee.Status.ACTIVE).order_by(
                "employee_code"
            )[:200]
        ]
        departments = [
            {"id": str(d.id), "code": d.code or "", "name": d.name}
            for d in Department.objects.filter(organization=org).order_by("name")[:100]
        ]
        boms = [
            {
                "id": str(b.id),
                "code": b.code,
                "name": b.name,
                "version": b.version,
                "status": b.status,
                "finished_item_id": str(b.finished_item_id) if b.finished_item_id else None,
            }
            for b in BOM.objects.filter(organization=org)
            .exclude(status=BOM.Status.OBSOLETE)
            .order_by("code", "-version")[:100]
        ]
        batches = [
            {"id": str(b.id), "batch_no": b.batch_no, "status": b.status}
            for b in Batch.objects.filter(organization=org)
            .exclude(status=Batch.Status.CLOSED)
            .order_by("-start_date")[:100]
        ]
        work_orders = [
            {"id": str(w.id), "wo_no": w.wo_no, "title": w.title, "status": w.status}
            for w in WorkOrder.objects.filter(organization=org)
            .exclude(status=WorkOrder.Status.CANCELLED)
            .order_by("-date")[:100]
        ]
        stages = [
            {
                "id": str(s.id),
                "code": s.code,
                "name": s.name,
                "process_definition_id": str(s.process_definition_id),
            }
            for s in ProcessStage.objects.filter(process_definition__organization=org)
            .select_related("process_definition")
            .order_by("process_definition__code", "sort_order")[:300]
        ]
        warehouses = [
            {"id": str(w.id), "code": w.code, "name": w.name}
            for w in Warehouse.objects.filter(organization=org).order_by("code")[:50]
        ]
        return Response(
            {
                "items": items,
                "definitions": definitions,
                "employees": employees,
                "departments": departments,
                "boms": boms,
                "batches": batches,
                "work_orders": work_orders,
                "stages": stages,
                "warehouses": warehouses,
            }
        )


# ── BOM ──────────────────────────────────────────────────────────────────────


class ProductionBOMsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            BOM.objects.select_related("finished_product", "finished_item").annotate(
                line_count=Count("lines")
            ),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(code__icontains=search)
                | Q(name__icontains=search)
                | Q(finished_item__name__icontains=search)
                | Q(finished_item__item_code__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        qs = _ordering(
            qs,
            request,
            {"code": "code", "name": "name", "version": "version", "created_at": "created_at", "status": "status"},
            "-created_at",
        )
        items, meta = _paginate(qs, request)
        return Response(
            {"results": [serialize_bom(b, include_lines=False) for b in items], **meta}
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        code = (data.get("code") or "").strip()
        name = (data.get("name") or "").strip()
        finished_item_id = data.get("finished_item_id")
        if not code or not name:
            return Response({"detail": "code and name are required."}, status=400)
        if not finished_item_id:
            return Response({"detail": "finished_item_id is required."}, status=400)
        item = ItemMaster.objects.filter(pk=finished_item_id, organization=org).first()
        if not item:
            return Response({"detail": "Finished item not found."}, status=400)

        version = int(data.get("version") or 1)
        if BOM.objects.filter(organization=org, code=code, version=version).exists():
            return Response({"detail": "BOM code+version already exists."}, status=400)

        bom = BOM.objects.create(
            organization=org,
            code=code,
            name=name,
            finished_item=item,
            finished_product_id=data.get("finished_product_id") or None,
            version=version,
            status=data.get("status") or BOM.Status.DRAFT,
            effective_from=_parse_date(data.get("effective_from")),
        )
        for idx, line in enumerate(data.get("lines") or []):
            rm_id = line.get("raw_material_id")
            if not rm_id:
                continue
            rm = ItemMaster.objects.filter(pk=rm_id, organization=org).first()
            if not rm:
                continue
            BOMLine.objects.create(
                bom=bom,
                raw_material=rm,
                qty_per_unit=_decimal(line.get("qty_per_unit"), "1"),
                uom=line.get("uom") or rm.uom or "pcs",
                scrap_pct=_decimal(line["scrap_pct"]) if line.get("scrap_pct") not in (None, "") else None,
                sort_order=int(line.get("sort_order") or idx),
                remarks=line.get("remarks") or "",
            )
        bom = BOM.objects.select_related("finished_product", "finished_item").prefetch_related(
            "lines__raw_material"
        ).get(pk=bom.pk)
        return Response(serialize_bom(bom), status=201)


class ProductionBOMDetailView(DomainAuthMixin, APIView):
    def get(self, request, bom_id):
        org = resolve_org(request.user)
        bom = (
            org_filter(
                BOM.objects.select_related("finished_product", "finished_item").prefetch_related(
                    "lines__raw_material"
                ),
                org,
            )
            .filter(pk=bom_id)
            .first()
        )
        if not bom:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_bom(bom))

    def patch(self, request, bom_id):
        org = resolve_org(request.user)
        bom = org_filter(BOM.objects.all(), org).filter(pk=bom_id).first()
        if not bom:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data:
            bom.name = (data.get("name") or bom.name).strip()
        if "status" in data and data["status"] in dict(BOM.Status.choices):
            bom.status = data["status"]
        if "effective_from" in data:
            bom.effective_from = _parse_date(data.get("effective_from"))
        if data.get("finished_item_id"):
            item = ItemMaster.objects.filter(pk=data["finished_item_id"], organization=org).first()
            if item:
                bom.finished_item = item
        if "finished_product_id" in data:
            bom.finished_product_id = data.get("finished_product_id") or None
        bom.save()

        if "lines" in data and isinstance(data["lines"], list):
            bom.lines.all().delete()
            for idx, line in enumerate(data["lines"]):
                rm_id = line.get("raw_material_id")
                if not rm_id:
                    continue
                rm = ItemMaster.objects.filter(pk=rm_id, organization=org).first()
                if not rm:
                    continue
                BOMLine.objects.create(
                    bom=bom,
                    raw_material=rm,
                    qty_per_unit=_decimal(line.get("qty_per_unit"), "1"),
                    uom=line.get("uom") or rm.uom or "pcs",
                    scrap_pct=_decimal(line["scrap_pct"]) if line.get("scrap_pct") not in (None, "") else None,
                    sort_order=int(line.get("sort_order") or idx),
                    remarks=line.get("remarks") or "",
                )

        bom = BOM.objects.select_related("finished_product", "finished_item").prefetch_related(
            "lines__raw_material"
        ).get(pk=bom.pk)
        return Response(serialize_bom(bom))

    def delete(self, request, bom_id):
        org = resolve_org(request.user)
        bom = org_filter(BOM.objects.all(), org).filter(pk=bom_id).first()
        if not bom:
            return Response({"detail": "Not found."}, status=404)
        if WorkOrder.objects.filter(bom=bom).exists():
            bom.status = BOM.Status.OBSOLETE
            bom.save(update_fields=["status"])
            return Response(serialize_bom(bom, include_lines=False))
        bom.delete()
        return Response(status=204)


class ProductionBOMLineView(DomainAuthMixin, APIView):
    def post(self, request, bom_id):
        org = resolve_org(request.user)
        bom = org_filter(BOM.objects.all(), org).filter(pk=bom_id).first()
        if not bom:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        rm = ItemMaster.objects.filter(pk=data.get("raw_material_id"), organization=org).first()
        if not rm:
            return Response({"detail": "raw_material_id required."}, status=400)
        line = BOMLine.objects.create(
            bom=bom,
            raw_material=rm,
            qty_per_unit=_decimal(data.get("qty_per_unit"), "1"),
            uom=data.get("uom") or rm.uom or "pcs",
            scrap_pct=_decimal(data["scrap_pct"]) if data.get("scrap_pct") not in (None, "") else None,
            sort_order=int(data.get("sort_order") or bom.lines.count()),
            remarks=data.get("remarks") or "",
        )
        return Response(serialize_bom_line(line), status=201)

    def delete(self, request, bom_id, line_id):
        org = resolve_org(request.user)
        bom = org_filter(BOM.objects.all(), org).filter(pk=bom_id).first()
        if not bom:
            return Response({"detail": "Not found."}, status=404)
        line = bom.lines.filter(pk=line_id).first()
        if not line:
            return Response({"detail": "Line not found."}, status=404)
        line.delete()
        return Response(status=204)


# ── Batches ──────────────────────────────────────────────────────────────────


class ProductionBatchesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            Batch.objects.select_related(
                "product", "output_item", "work_order", "supervisor"
            ),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(batch_no__icontains=search)
                | Q(output_item__name__icontains=search)
                | Q(output_item__item_code__icontains=search)
                | Q(product__name__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        qs = _ordering(
            qs,
            request,
            {
                "batch_no": "batch_no",
                "start_date": "start_date",
                "expire_date": "expire_date",
                "status": "status",
                "batch_size": "batch_size",
            },
            "-start_date",
        )
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_batch(b) for b in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        batch_no = (data.get("batch_no") or "").strip()
        if not batch_no:
            n = Batch.objects.filter(organization=org).count() + 1
            year = timezone.localdate().year
            batch_no = f"SUN-{year}-{n:04d}"
        if Batch.objects.filter(organization=org, batch_no=batch_no).exists():
            return Response({"detail": "batch_no already exists."}, status=400)

        output_item = None
        if data.get("output_item_id"):
            output_item = ItemMaster.objects.filter(pk=data["output_item_id"], organization=org).first()
        work_order = None
        if data.get("work_order_id"):
            work_order = WorkOrder.objects.filter(pk=data["work_order_id"], organization=org).first()
        supervisor = None
        if data.get("supervisor_id"):
            supervisor = Employee.objects.filter(pk=data["supervisor_id"], organization=org).first()

        batch = Batch.objects.create(
            organization=org,
            batch_no=batch_no,
            product_id=data.get("product_id") or None,
            output_item=output_item,
            work_order=work_order,
            batch_size=_decimal(data.get("batch_size"), "0"),
            start_date=_parse_date(data.get("start_date")) or timezone.localdate(),
            end_date=_parse_date(data.get("end_date")),
            manufacture_date=_parse_date(data.get("manufacture_date")),
            expire_date=_parse_date(data.get("expire_date")),
            supervisor=supervisor,
            status=data.get("status") or Batch.Status.PLANNED,
        )
        return Response(serialize_batch(batch), status=201)


class ProductionBatchDetailView(DomainAuthMixin, APIView):
    def get(self, request, batch_id):
        org = resolve_org(request.user)
        b = (
            org_filter(
                Batch.objects.select_related("product", "output_item", "work_order", "supervisor"),
                org,
            )
            .filter(pk=batch_id)
            .first()
        )
        if not b:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_batch(b))

    def patch(self, request, batch_id):
        org = resolve_org(request.user)
        b = org_filter(Batch.objects.select_related("product", "output_item", "work_order", "supervisor"), org).filter(
            pk=batch_id
        ).first()
        if not b:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("batch_size",):
            if field in data:
                setattr(b, field, _decimal(data.get(field), "0"))
        for field in ("start_date", "end_date", "manufacture_date", "expire_date"):
            if field in data:
                setattr(b, field, _parse_date(data.get(field)))
        if "status" in data and data["status"] in dict(Batch.Status.choices):
            b.status = data["status"]
        if "output_item_id" in data:
            b.output_item_id = data.get("output_item_id") or None
        if "work_order_id" in data:
            b.work_order_id = data.get("work_order_id") or None
        if "supervisor_id" in data:
            b.supervisor_id = data.get("supervisor_id") or None
        if "product_id" in data:
            b.product_id = data.get("product_id") or None
        b.save()
        b.refresh_from_db()
        return Response(serialize_batch(b))

    def post(self, request, batch_id):
        """Actions: quarantine, close, activate."""
        org = resolve_org(request.user)
        b = org_filter(Batch.objects.all(), org).filter(pk=batch_id).first()
        if not b:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "quarantine":
                b = quarantine_batch(b, actor=request.user)
            elif action == "close":
                b = close_batch(b, actor=request.user)
            elif action == "activate":
                b.status = Batch.Status.ACTIVE
                b.save(update_fields=["status"])
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        return Response(serialize_batch(b))

    def delete(self, request, batch_id):
        org = resolve_org(request.user)
        b = org_filter(Batch.objects.all(), org).filter(pk=batch_id).first()
        if not b:
            return Response({"detail": "Not found."}, status=404)
        if WorkOrder.objects.filter(batch=b).exists() or b.status == Batch.Status.ACTIVE:
            return Response({"detail": "Cannot delete active or linked batch. Close it instead."}, status=400)
        b.delete()
        return Response(status=204)


# ── Work Orders ──────────────────────────────────────────────────────────────


class ProductionWorkOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            WorkOrder.objects.select_related(
                "product",
                "output_item",
                "batch",
                "bom",
                "department",
                "supervisor",
                "process_definition",
            ),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(wo_no__icontains=search)
                | Q(title__icontains=search)
                | Q(product__name__icontains=search)
                | Q(output_item__name__icontains=search)
                | Q(batch__batch_no__icontains=search)
                | Q(project_code__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            # Accept UI alias "planned" → draft
            alias = {"planned": "draft"}.get(status_f, status_f)
            qs = qs.filter(status=alias)
        priority = request.query_params.get("priority")
        if priority:
            qs = qs.filter(priority=priority)
        qs = _ordering(
            qs,
            request,
            {
                "wo_no": "wo_no",
                "date": "date",
                "status": "status",
                "priority": "priority",
                "planned_start": "planned_start",
                "target_qty": "target_qty",
            },
            "-date",
        )
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_work_order_full(w) for w in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        title = (data.get("title") or "").strip()
        definition_id = data.get("process_definition_id")
        if not title:
            return Response({"detail": "title is required."}, status=400)
        if not definition_id:
            return Response({"detail": "process_definition_id is required."}, status=400)
        definition = ProcessDefinition.objects.filter(pk=definition_id, organization=org).first()
        if not definition:
            return Response({"detail": "Process definition not found."}, status=400)

        wo_no = (data.get("wo_no") or data.get("wo_code") or "").strip()
        if not wo_no:
            n = WorkOrder.objects.filter(organization=org).count() + 1
            wo_no = f"WO-{timezone.localdate().strftime('%Y%m%d')}-{n:04d}"
        if WorkOrder.objects.filter(organization=org, wo_no=wo_no).exists():
            return Response({"detail": "wo_no already exists."}, status=400)

        custom = data.get("custom_data_json") or {}
        if data.get("brand"):
            custom["brand"] = data["brand"]
        if data.get("line"):
            custom["line"] = data["line"]
        if data.get("qa_status"):
            custom["qa_status"] = data["qa_status"]

        wo = WorkOrder.objects.create(
            organization=org,
            process_definition=definition,
            wo_no=wo_no,
            title=title,
            product_id=data.get("product_id") or None,
            output_item_id=data.get("output_item_id") or None,
            batch_id=data.get("batch_id") or None,
            bom_id=data.get("bom_id") or None,
            target_qty=_decimal(data.get("target_qty") or data.get("planned_qty")) if (
                data.get("target_qty") not in (None, "") or data.get("planned_qty") not in (None, "")
            ) else None,
            actual_qty=_decimal(data.get("actual_qty") or data.get("produced_qty")) if (
                data.get("actual_qty") not in (None, "") or data.get("produced_qty") not in (None, "")
            ) else None,
            waste_qty=_decimal(data["waste_qty"]) if data.get("waste_qty") not in (None, "") else None,
            uom=data.get("uom") or "pcs",
            priority=data.get("priority") or WorkOrder.Priority.MEDIUM,
            planned_start=_parse_dt(data.get("planned_start") or data.get("scheduled_start")),
            planned_end=_parse_dt(data.get("planned_end")),
            department_id=data.get("department_id") or None,
            supervisor_id=data.get("supervisor_id") or None,
            customer_party_id=data.get("customer_party_id") or None,
            project_code=data.get("project_code") or "",
            status=data.get("status") or WorkOrder.Status.DRAFT,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            custom_data_json=custom,
            created_by=request.user if getattr(request.user, "is_authenticated", False) else None,
        )
        wo = WorkOrder.objects.select_related(
            "product", "output_item", "batch", "bom", "department", "supervisor", "process_definition"
        ).get(pk=wo.pk)
        return Response(serialize_work_order_full(wo), status=201)


class ProductionWorkOrderDetailView(DomainAuthMixin, APIView):
    def get(self, request, wo_id):
        org = resolve_org(request.user)
        wo = (
            org_filter(
                WorkOrder.objects.select_related(
                    "product", "output_item", "batch", "bom", "department", "supervisor", "process_definition"
                ),
                org,
            )
            .filter(pk=wo_id)
            .first()
        )
        if not wo:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_work_order_full(wo))

    def patch(self, request, wo_id):
        org = resolve_org(request.user)
        wo = org_filter(
            WorkOrder.objects.select_related(
                "product", "output_item", "batch", "bom", "department", "supervisor", "process_definition"
            ),
            org,
        ).filter(pk=wo_id).first()
        if not wo:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "title" in data:
            wo.title = (data.get("title") or wo.title).strip()
        for field, key in (
            ("target_qty", "target_qty"),
            ("actual_qty", "actual_qty"),
            ("waste_qty", "waste_qty"),
        ):
            if key in data or (key == "target_qty" and "planned_qty" in data):
                val = data.get(key, data.get("planned_qty") if key == "target_qty" else data.get("produced_qty"))
                setattr(wo, field, _decimal(val) if val not in (None, "") else None)
        if "actual_qty" not in data and "produced_qty" in data:
            wo.actual_qty = _decimal(data["produced_qty"]) if data["produced_qty"] not in (None, "") else None
        for field in ("uom", "project_code", "priority"):
            if field in data:
                setattr(wo, field, data.get(field) or getattr(wo, field))
        for field in ("planned_start", "planned_end"):
            if field in data or (field == "planned_start" and "scheduled_start" in data):
                setattr(
                    wo,
                    field,
                    _parse_dt(data.get(field) or (data.get("scheduled_start") if field == "planned_start" else None)),
                )
        for fk in (
            "process_definition_id",
            "product_id",
            "output_item_id",
            "batch_id",
            "bom_id",
            "department_id",
            "supervisor_id",
            "customer_party_id",
        ):
            if fk in data:
                setattr(wo, fk, data.get(fk) or None)
        if "date" in data:
            wo.date = _parse_date(data.get("date")) or wo.date
        custom = dict(wo.custom_data_json or {})
        if "custom_data_json" in data and isinstance(data["custom_data_json"], dict):
            custom.update(data["custom_data_json"])
        for k in ("brand", "line", "qa_status", "batch_no"):
            if k in data:
                custom[k] = data[k]
        wo.custom_data_json = custom
        wo.save()
        wo.refresh_from_db()
        return Response(serialize_work_order_full(wo))

    def post(self, request, wo_id):
        org = resolve_org(request.user)
        wo = org_filter(WorkOrder.objects.all(), org).filter(pk=wo_id).first()
        if not wo:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        try:
            if action == "release":
                wo, run, _ = release_work_order(wo, actor=request.user, run_no=request.data.get("run_no"))
                return Response(
                    {
                        "ok": True,
                        "id": str(wo.id),
                        "status": wo.status,
                        "run_id": str(run.id) if run else None,
                        "work_order": serialize_work_order_full(
                            WorkOrder.objects.select_related(
                                "product",
                                "output_item",
                                "batch",
                                "bom",
                                "department",
                                "supervisor",
                                "process_definition",
                            ).get(pk=wo.pk)
                        ),
                    }
                )
            if action == "hold":
                if wo.status not in (WorkOrder.Status.RELEASED, WorkOrder.Status.IN_PROGRESS):
                    raise DomainError("Only released/in-progress WO can be held", code="invalid_status")
                wo.status = WorkOrder.Status.ON_HOLD
                wo.save(update_fields=["status"])
            elif action == "resume":
                if wo.status != WorkOrder.Status.ON_HOLD:
                    raise DomainError("Only on-hold WO can be resumed", code="invalid_status")
                wo.status = WorkOrder.Status.IN_PROGRESS
                wo.save(update_fields=["status"])
            elif action == "start":
                if wo.status not in (WorkOrder.Status.RELEASED, WorkOrder.Status.ON_HOLD):
                    raise DomainError("Only released/on-hold WO can start", code="invalid_status")
                wo.status = WorkOrder.Status.IN_PROGRESS
                wo.save(update_fields=["status"])
            elif action == "complete":
                if wo.status not in (WorkOrder.Status.IN_PROGRESS, WorkOrder.Status.RELEASED):
                    raise DomainError("WO cannot be completed from current status", code="invalid_status")
                if request.data.get("actual_qty") not in (None, ""):
                    wo.actual_qty = _decimal(request.data["actual_qty"])
                wo.status = WorkOrder.Status.COMPLETED
                wo.save(update_fields=["status", "actual_qty"] if request.data.get("actual_qty") not in (None, "") else ["status"])
            elif action == "cancel":
                if wo.status == WorkOrder.Status.COMPLETED:
                    raise DomainError("Completed WO cannot be cancelled", code="invalid_status")
                wo.status = WorkOrder.Status.CANCELLED
                wo.save(update_fields=["status"])
            else:
                return Response({"detail": f"Unknown action: {action}"}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        wo = WorkOrder.objects.select_related(
            "product", "output_item", "batch", "bom", "department", "supervisor", "process_definition"
        ).get(pk=wo.pk)
        return Response({"ok": True, "id": str(wo.id), "status": wo.status, "work_order": serialize_work_order_full(wo)})

    def delete(self, request, wo_id):
        org = resolve_org(request.user)
        wo = org_filter(WorkOrder.objects.all(), org).filter(pk=wo_id).first()
        if not wo:
            return Response({"detail": "Not found."}, status=404)
        if wo.status not in (WorkOrder.Status.DRAFT, WorkOrder.Status.CANCELLED):
            return Response({"detail": "Only draft/cancelled WO can be deleted."}, status=400)
        wo.delete()
        return Response(status=204)


# ── WIP ──────────────────────────────────────────────────────────────────────


class ProductionWIPView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            WIPTracking.objects.select_related("work_order", "process_stage"),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(work_order__wo_no__icontains=search)
                | Q(process_stage__name__icontains=search)
                | Q(process_stage__code__icontains=search)
            )
        date_f = _parse_date(request.query_params.get("date"))
        if date_f:
            qs = qs.filter(date=date_f)
        wo_id = request.query_params.get("work_order_id")
        if wo_id:
            qs = qs.filter(work_order_id=wo_id)
        qs = _ordering(
            qs,
            request,
            {"date": "date", "closing_wip": "closing_wip", "input_qty": "input_qty"},
            "-date",
        )
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_wip(w) for w in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        stage_id = data.get("process_stage_id")
        if not stage_id:
            return Response({"detail": "process_stage_id is required."}, status=400)
        stage = ProcessStage.objects.filter(
            pk=stage_id, process_definition__organization=org
        ).first()
        if not stage:
            return Response({"detail": "Process stage not found."}, status=400)
        opening = _decimal(data.get("opening_wip"), "0")
        inp = _decimal(data.get("input_qty"), "0")
        out = _decimal(data.get("output_qty"), "0")
        closing = data.get("closing_wip")
        closing_v = _decimal(closing) if closing not in (None, "") else opening + inp - out
        wip = WIPTracking.objects.create(
            organization=org,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            work_order_id=data.get("work_order_id") or None,
            process_stage=stage,
            opening_wip=opening,
            input_qty=inp,
            output_qty=out,
            closing_wip=closing_v,
        )
        wip = WIPTracking.objects.select_related("work_order", "process_stage").get(pk=wip.pk)
        return Response(serialize_wip(wip), status=201)


class ProductionWIPDetailView(DomainAuthMixin, APIView):
    def patch(self, request, wip_id):
        org = resolve_org(request.user)
        wip = org_filter(WIPTracking.objects.select_related("work_order", "process_stage"), org).filter(
            pk=wip_id
        ).first()
        if not wip:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("opening_wip", "input_qty", "output_qty", "closing_wip"):
            if field in data:
                setattr(wip, field, _decimal(data.get(field), "0"))
        if "date" in data:
            wip.date = _parse_date(data.get("date")) or wip.date
        if "work_order_id" in data:
            wip.work_order_id = data.get("work_order_id") or None
        if "process_stage_id" in data and data["process_stage_id"]:
            stage = ProcessStage.objects.filter(
                pk=data["process_stage_id"], process_definition__organization=org
            ).first()
            if stage:
                wip.process_stage = stage
        if "closing_wip" not in data and any(k in data for k in ("opening_wip", "input_qty", "output_qty")):
            wip.closing_wip = wip.opening_wip + wip.input_qty - wip.output_qty
        wip.save()
        wip.refresh_from_db()
        return Response(serialize_wip(wip))

    def delete(self, request, wip_id):
        org = resolve_org(request.user)
        wip = org_filter(WIPTracking.objects.all(), org).filter(pk=wip_id).first()
        if not wip:
            return Response({"detail": "Not found."}, status=404)
        wip.delete()
        return Response(status=204)


# ── Costing ──────────────────────────────────────────────────────────────────


class ProductionCostingView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            ProductionCosting.objects.select_related(
                "work_order", "process_run", "product", "item", "journal_voucher"
            ),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(work_order__wo_no__icontains=search)
                | Q(product__name__icontains=search)
                | Q(item__name__icontains=search)
                | Q(item__item_code__icontains=search)
            )
        wo_id = request.query_params.get("work_order_id")
        if wo_id:
            qs = qs.filter(work_order_id=wo_id)
        qs = _ordering(
            qs,
            request,
            {"period_date": "period_date", "total_cost": "total_cost", "created_at": "created_at"},
            "-period_date",
        )
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_costing(c) for c in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        wo_id = data.get("work_order_id")
        if not wo_id:
            return Response({"detail": "work_order_id is required."}, status=400)
        wo = WorkOrder.objects.filter(pk=wo_id, organization=org).first()
        if not wo:
            return Response({"detail": "Work order not found."}, status=400)

        material = _decimal(data.get("material_cost"), "0")
        labor = _decimal(data.get("labor_cost"), "0")
        machine = _decimal(data.get("machine_cost"), "0")
        overhead = _decimal(data.get("overhead_cost"), "0")
        total = data.get("total_cost")
        total_v = _decimal(total) if total not in (None, "") else material + labor + machine + overhead
        per_unit = None
        if data.get("per_unit_cost") not in (None, ""):
            per_unit = _decimal(data["per_unit_cost"])
        elif wo.target_qty and wo.target_qty > 0:
            per_unit = (total_v / wo.target_qty).quantize(Decimal("0.01"))

        costing = ProductionCosting.objects.create(
            organization=org,
            work_order=wo,
            process_run_id=data.get("process_run_id") or None,
            product_id=data.get("product_id") or wo.product_id,
            item_id=data.get("item_id") or wo.output_item_id,
            material_cost=material,
            labor_cost=labor,
            machine_cost=machine,
            overhead_cost=overhead,
            total_cost=total_v,
            per_unit_cost=per_unit,
            period_date=_parse_date(data.get("period_date")) or timezone.localdate(),
        )
        costing = ProductionCosting.objects.select_related(
            "work_order", "process_run", "product", "item"
        ).get(pk=costing.pk)
        return Response(serialize_costing(costing), status=201)


class ProductionCostingDetailView(DomainAuthMixin, APIView):
    def patch(self, request, costing_id):
        org = resolve_org(request.user)
        c = org_filter(
            ProductionCosting.objects.select_related("work_order", "process_run", "product", "item"),
            org,
        ).filter(pk=costing_id).first()
        if not c:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("material_cost", "labor_cost", "machine_cost", "overhead_cost"):
            if field in data:
                setattr(c, field, _decimal(data.get(field), "0"))
        if "total_cost" in data:
            c.total_cost = _decimal(data.get("total_cost"), "0")
        else:
            c.total_cost = c.material_cost + c.labor_cost + c.machine_cost + c.overhead_cost
        if "per_unit_cost" in data:
            c.per_unit_cost = (
                _decimal(data["per_unit_cost"]) if data.get("per_unit_cost") not in (None, "") else None
            )
        if "period_date" in data:
            c.period_date = _parse_date(data.get("period_date")) or c.period_date
        for fk in ("process_run_id", "product_id", "item_id", "journal_voucher_id"):
            if fk in data:
                setattr(c, fk, data.get(fk) or None)
        c.save()
        c.refresh_from_db()
        return Response(serialize_costing(c))

    def delete(self, request, costing_id):
        org = resolve_org(request.user)
        c = org_filter(ProductionCosting.objects.all(), org).filter(pk=costing_id).first()
        if not c:
            return Response({"detail": "Not found."}, status=404)
        c.delete()
        return Response(status=204)


# ── Damage / Expire ─────────────────────────────────────────────────────────


class ProductionDamageView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            DamageExpire.objects.select_related(
                "product", "item", "batch", "work_order", "approved_by", "stock_ledger"
            ),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(item__name__icontains=search)
                | Q(item__item_code__icontains=search)
                | Q(product__name__icontains=search)
                | Q(batch__batch_no__icontains=search)
                | Q(work_order__wo_no__icontains=search)
            )
        reason = request.query_params.get("reason")
        if reason:
            qs = qs.filter(reason=reason)
        posted = request.query_params.get("posted")
        if posted == "1":
            qs = qs.filter(stock_ledger__isnull=False)
        elif posted == "0":
            qs = qs.filter(stock_ledger__isnull=True)
        qs = _ordering(qs, request, {"date": "date", "qty": "qty", "reason": "reason"}, "-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_damage(d) for d in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        qty = _decimal(data.get("qty"), "0")
        if qty <= 0:
            return Response({"detail": "qty must be > 0."}, status=400)
        reason = data.get("reason") or DamageExpire.Reason.DAMAGE
        if reason not in dict(DamageExpire.Reason.choices):
            return Response({"detail": "Invalid reason."}, status=400)
        d = DamageExpire.objects.create(
            organization=org,
            product_id=data.get("product_id") or None,
            item_id=data.get("item_id") or None,
            batch_id=data.get("batch_id") or None,
            work_order_id=data.get("work_order_id") or None,
            process_run_line_id=data.get("process_run_line_id") or None,
            qty=qty,
            reason=reason,
            date=_parse_date(data.get("date")) or timezone.localdate(),
        )
        d = DamageExpire.objects.select_related(
            "product", "item", "batch", "work_order", "approved_by", "stock_ledger"
        ).get(pk=d.pk)
        return Response(serialize_damage(d), status=201)


class ProductionDamageDetailView(DomainAuthMixin, APIView):
    def patch(self, request, damage_id):
        org = resolve_org(request.user)
        d = org_filter(
            DamageExpire.objects.select_related(
                "product", "item", "batch", "work_order", "approved_by", "stock_ledger"
            ),
            org,
        ).filter(pk=damage_id).first()
        if not d:
            return Response({"detail": "Not found."}, status=404)
        if d.stock_ledger_id:
            return Response({"detail": "Already posted; cannot edit."}, status=400)
        data = request.data
        if "qty" in data:
            d.qty = _decimal(data.get("qty"), "0")
        if "reason" in data and data["reason"] in dict(DamageExpire.Reason.choices):
            d.reason = data["reason"]
        if "date" in data:
            d.date = _parse_date(data.get("date")) or d.date
        for fk in ("product_id", "item_id", "batch_id", "work_order_id", "process_run_line_id"):
            if fk in data:
                setattr(d, fk, data.get(fk) or None)
        d.save()
        d.refresh_from_db()
        return Response(serialize_damage(d))

    def post(self, request, damage_id):
        org = resolve_org(request.user)
        d = org_filter(DamageExpire.objects.all(), org).filter(pk=damage_id).first()
        if not d:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        if action != "approve":
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        warehouse_id = request.data.get("warehouse_id")
        warehouse = None
        if warehouse_id:
            warehouse = Warehouse.objects.filter(pk=warehouse_id, organization=org).first()
        if not warehouse:
            warehouse = Warehouse.objects.filter(organization=org).order_by("code").first()
        if not warehouse:
            return Response({"detail": "No warehouse available for stock posting."}, status=400)
        try:
            d = approve_damage_expire(d, warehouse=warehouse, approved_by=request.user, actor=request.user)
        except DomainError as exc:
            return _domain_error(exc)
        d = DamageExpire.objects.select_related(
            "product", "item", "batch", "work_order", "approved_by", "stock_ledger"
        ).get(pk=d.pk)
        return Response(serialize_damage(d))

    def delete(self, request, damage_id):
        org = resolve_org(request.user)
        d = org_filter(DamageExpire.objects.all(), org).filter(pk=damage_id).first()
        if not d:
            return Response({"detail": "Not found."}, status=404)
        if d.stock_ledger_id:
            return Response({"detail": "Already posted; cannot delete."}, status=400)
        d.delete()
        return Response(status=204)


# ── Working Reports ──────────────────────────────────────────────────────────


class ProductionWorkingReportsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            WorkingReport.objects.select_related("employee", "work_order", "process_run_stage"),
            org,
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(employee__full_name__icontains=search)
                | Q(employee__employee_code__icontains=search)
                | Q(work_order__wo_no__icontains=search)
                | Q(remarks__icontains=search)
            )
        date_f = _parse_date(request.query_params.get("date"))
        if date_f:
            qs = qs.filter(date=date_f)
        emp_id = request.query_params.get("employee_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        qs = _ordering(qs, request, {"date": "date", "hours": "hours"}, "-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_working_report(r) for r in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        emp_id = data.get("employee_id")
        if not emp_id:
            return Response({"detail": "employee_id is required."}, status=400)
        emp = Employee.objects.filter(pk=emp_id, organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=400)
        activities = data.get("activities_json")
        if isinstance(activities, str):
            activities = [a.strip() for a in activities.split(",") if a.strip()]
        if not isinstance(activities, list):
            activities = []
        report = WorkingReport.objects.create(
            organization=org,
            employee=emp,
            work_order_id=data.get("work_order_id") or None,
            process_run_stage_id=data.get("process_run_stage_id") or None,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            activities_json=activities,
            hours=_decimal(data.get("hours"), "0"),
            remarks=data.get("remarks") or "",
        )
        report = WorkingReport.objects.select_related("employee", "work_order").get(pk=report.pk)
        return Response(serialize_working_report(report), status=201)


class ProductionWorkingReportDetailView(DomainAuthMixin, APIView):
    def patch(self, request, report_id):
        org = resolve_org(request.user)
        r = org_filter(
            WorkingReport.objects.select_related("employee", "work_order"),
            org,
        ).filter(pk=report_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "hours" in data:
            r.hours = _decimal(data.get("hours"), "0")
        if "remarks" in data:
            r.remarks = data.get("remarks") or ""
        if "date" in data:
            r.date = _parse_date(data.get("date")) or r.date
        if "activities_json" in data:
            activities = data.get("activities_json")
            if isinstance(activities, str):
                activities = [a.strip() for a in activities.split(",") if a.strip()]
            r.activities_json = activities if isinstance(activities, list) else []
        if "work_order_id" in data:
            r.work_order_id = data.get("work_order_id") or None
        if "employee_id" in data and data["employee_id"]:
            emp = Employee.objects.filter(pk=data["employee_id"], organization=org).first()
            if emp:
                r.employee = emp
        r.save()
        r.refresh_from_db()
        return Response(serialize_working_report(r))

    def delete(self, request, report_id):
        org = resolve_org(request.user)
        r = org_filter(WorkingReport.objects.all(), org).filter(pk=report_id).first()
        if not r:
            return Response({"detail": "Not found."}, status=404)
        r.delete()
        return Response(status=204)


# ── Register Book ────────────────────────────────────────────────────────────


class ProductionRegisterView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(RegisterBook.objects.all(), org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(reference_no__icontains=search)
                | Q(description__icontains=search)
                | Q(entry_type__icontains=search)
            )
        qs = _ordering(qs, request, {"entry_date": "entry_date", "qty": "qty"}, "-entry_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_register(r) for r in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        entry = RegisterBook.objects.create(
            organization=org,
            entry_date=_parse_date(data.get("entry_date")) or timezone.localdate(),
            entry_type=data.get("entry_type") or "manual",
            reference_type=data.get("reference_type") or "manual",
            reference_id=data.get("reference_id") or None,
            reference_no=data.get("reference_no") or "",
            description=data.get("description") or "",
            qty=_decimal(data.get("qty"), "0"),
            balance=_decimal(data.get("balance"), "0"),
        )
        return Response(serialize_register(entry), status=201)
