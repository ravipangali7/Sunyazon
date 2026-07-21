"""Quality (QA/QC) module APIs — incoming, IPQC, final release, lab, NCR, CAPA, masters."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Batch,
    CAPA,
    Department,
    Employee,
    FinalQARelease,
    IncomingInspection,
    InProcessQC,
    ItemMaster,
    LabReport,
    NCR,
    ProcessDefinition,
    ProcessRun,
    ProcessRunStage,
    ProcessStage,
    Product,
    QualityMaster,
    Vendor,
    WorkOrder,
)
from core.services.common import DomainError
from core.services.qa_service import (
    close_capa,
    final_qa_release,
    open_ncr_record,
    record_incoming_inspection,
    record_inprocess_qc,
)
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org


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


def serialize_incoming(obj: IncomingInspection) -> dict:
    return {
        "id": str(obj.id),
        "inspection_no": obj.inspection_no,
        "date": _iso(obj.date) or "",
        "supplier_id": str(obj.supplier_id) if obj.supplier_id else None,
        "supplier_name": obj.supplier.vendor_name if obj.supplier_id else "",
        "material_id": str(obj.material_id) if obj.material_id else None,
        "material_name": obj.material.name if obj.material_id else "",
        "material_code": obj.material.item_code if obj.material_id else "",
        "batch_id": str(obj.batch_id) if obj.batch_id else None,
        "batch_no": obj.batch_no or (obj.batch.batch_no if obj.batch_id else ""),
        "grn_line_id": str(obj.grn_line_id) if obj.grn_line_id else None,
        "parameter": obj.parameter or "",
        "result": obj.result or "",
        "status": obj.status,
        "inspector_id": str(obj.inspector_id) if obj.inspector_id else None,
        "inspector_name": _emp_name(obj.inspector) if obj.inspector_id else "",
    }


def serialize_ipqc(obj: InProcessQC) -> dict:
    return {
        "id": str(obj.id),
        "date": _iso(obj.date) or "",
        "product_id": str(obj.product_id) if obj.product_id else None,
        "product_name": obj.product.name if obj.product_id else "",
        "brand": (obj.product.brand_name if obj.product_id else "") or "",
        "batch_id": str(obj.batch_id) if obj.batch_id else None,
        "batch_no": obj.batch_no or (obj.batch.batch_no if obj.batch_id else ""),
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
        "process_run_id": str(obj.process_run_id) if obj.process_run_id else None,
        "process_run_stage_id": str(obj.process_run_stage_id) if obj.process_run_stage_id else None,
        "process_stage_id": str(obj.process_stage_id) if obj.process_stage_id else None,
        "process_step": obj.process_step or (
            obj.process_run_stage.process_stage.name
            if obj.process_run_stage_id and obj.process_run_stage.process_stage_id
            else ""
        ),
        "parameter": obj.parameter or "",
        "standard": obj.standard or "",
        "actual": obj.actual or "",
        "status": obj.status,
        "inspector_id": str(obj.inspector_id) if obj.inspector_id else None,
        "inspector_name": _emp_name(obj.inspector) if obj.inspector_id else "",
    }


def serialize_release(obj: FinalQARelease) -> dict:
    return {
        "id": str(obj.id),
        "batch_id": str(obj.batch_id) if obj.batch_id else None,
        "batch_no": obj.batch_no or (obj.batch.batch_no if obj.batch_id else ""),
        "product_id": str(obj.product_id) if obj.product_id else None,
        "product_name": obj.product.name if obj.product_id else "",
        "brand": (obj.product.brand_name if obj.product_id else "") or "",
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
        "process_run_id": str(obj.process_run_id) if obj.process_run_id else None,
        "process_run_stage_id": str(obj.process_run_stage_id) if obj.process_run_stage_id else None,
        "inspection_date": _iso(obj.inspection_date) or "",
        "quantity": float(obj.quantity or 0),
        "quality_status": obj.quality_status,
        "release_status": obj.release_status,
        "approved_by_id": str(obj.approved_by_id) if obj.approved_by_id else None,
        "approved_by_name": _emp_name(obj.approved_by) if obj.approved_by_id else "",
    }


def serialize_lab(obj: LabReport) -> dict:
    return {
        "id": str(obj.id),
        "test_no": obj.test_no,
        "sample": obj.sample or "",
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
        "process_run_stage_id": str(obj.process_run_stage_id) if obj.process_run_stage_id else None,
        "batch_id": str(obj.batch_id) if obj.batch_id else None,
        "batch_no": obj.batch.batch_no if obj.batch_id else "",
        "test_parameter": obj.test_parameter or "",
        "method": obj.method or "",
        "specification": obj.specification or "",
        "result": obj.result or "",
        "unit": obj.unit or "",
        "status": obj.status,
    }


def serialize_ncr(obj: NCR) -> dict:
    return {
        "id": str(obj.id),
        "ncr_no": obj.ncr_no,
        "date": _iso(obj.date) or "",
        "issue": obj.issue or "",
        "department_id": str(obj.department_id) if obj.department_id else None,
        "department_name": obj.department.name if obj.department_id else "",
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
        "process_run_stage_id": str(obj.process_run_stage_id) if obj.process_run_stage_id else None,
        "root_cause": obj.root_cause or "",
        "correction": obj.correction or "",
        "status": obj.status,
        "capa_count": obj.capas.count() if hasattr(obj, "capas") else 0,
    }


def serialize_capa(obj: CAPA) -> dict:
    return {
        "id": str(obj.id),
        "capa_no": obj.capa_no,
        "problem": obj.problem or "",
        "root_cause": obj.root_cause or "",
        "corrective_action": obj.corrective_action or "",
        "preventive_action": obj.preventive_action or "",
        "owner_id": str(obj.owner_id) if obj.owner_id else None,
        "owner_name": _emp_name(obj.owner) if obj.owner_id else "",
        "due_date": _iso(obj.due_date) or "",
        "ncr_id": str(obj.ncr_id) if obj.ncr_id else None,
        "ncr_no": obj.ncr.ncr_no if obj.ncr_id else "",
        "work_order_id": str(obj.work_order_id) if obj.work_order_id else None,
        "work_order_no": obj.work_order.wo_no if obj.work_order_id else "",
        "status": obj.status,
    }


def serialize_master(obj: QualityMaster) -> dict:
    return {
        "id": str(obj.id),
        "product_id": str(obj.product_id) if obj.product_id else None,
        "product_name": obj.product.name if obj.product_id else "",
        "process_definition_id": str(obj.process_definition_id) if obj.process_definition_id else None,
        "process_definition_name": obj.process_definition.name if obj.process_definition_id else "",
        "process_stage_id": str(obj.process_stage_id) if obj.process_stage_id else None,
        "process_stage_name": obj.process_stage.name if obj.process_stage_id else "",
        "quality_parameter": obj.quality_parameter,
        "specification": obj.specification or "",
        "tolerance": obj.tolerance or "",
        "testing_frequency": obj.testing_frequency or "",
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class QualityOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "pending_incoming": 0,
            "pending_ipqc": 0,
            "held_releases": 0,
            "open_ncrs": 0,
            "open_capas": 0,
            "lab_fails": 0,
            "pass_count": 0,
            "fail_count": 0,
            "hold_count": 0,
            "released_count": 0,
            "by_status": [],
            "inbox": [],
            "recent_ncrs": [],
            "recent_releases": [],
        }
        if not org:
            return Response(empty)

        incoming_qs = IncomingInspection.objects.filter(organization=org)
        ipqc_qs = InProcessQC.objects.filter(organization=org)
        release_qs = FinalQARelease.objects.filter(organization=org)
        lab_qs = LabReport.objects.filter(organization=org)
        ncr_qs = NCR.objects.filter(organization=org)
        capa_qs = CAPA.objects.filter(organization=org)

        pass_count = (
            incoming_qs.filter(status="pass").count()
            + ipqc_qs.filter(status="pass").count()
            + lab_qs.filter(status="pass").count()
        )
        fail_count = (
            incoming_qs.filter(status="fail").count()
            + ipqc_qs.filter(status="fail").count()
            + lab_qs.filter(status="fail").count()
        )
        hold_count = (
            incoming_qs.filter(status="hold").count()
            + ipqc_qs.filter(status="hold").count()
            + lab_qs.filter(status="hold").count()
        )

        inbox = []
        for insp in (
            incoming_qs.filter(status="hold")
            .select_related("material", "supplier")
            .order_by("-date")[:8]
        ):
            inbox.append(
                {
                    "id": str(insp.id),
                    "type": "incoming",
                    "ref": insp.inspection_no,
                    "title": insp.material.name if insp.material_id else insp.parameter or "Incoming",
                    "status": insp.status,
                    "date": _iso(insp.date) or "",
                }
            )
        for qc in (
            ipqc_qs.filter(status="hold")
            .select_related("product")
            .order_by("-date")[:8]
        ):
            inbox.append(
                {
                    "id": str(qc.id),
                    "type": "processqc",
                    "ref": qc.batch_no or (qc.batch.batch_no if qc.batch_id else "IPQC"),
                    "title": qc.parameter or (qc.product.name if qc.product_id else "In-process QC"),
                    "status": qc.status,
                    "date": _iso(qc.date) or "",
                }
            )
        for rel in (
            release_qs.filter(release_status=FinalQARelease.ReleaseStatus.HELD)
            .select_related("product")
            .order_by("-inspection_date")[:8]
        ):
            inbox.append(
                {
                    "id": str(rel.id),
                    "type": "release",
                    "ref": rel.batch_no or "Release",
                    "title": rel.product.name if rel.product_id else "Final QA",
                    "status": rel.release_status,
                    "date": _iso(rel.inspection_date) or "",
                }
            )
        inbox = sorted(inbox, key=lambda r: r["date"] or "", reverse=True)[:12]

        return Response(
            {
                "pending_incoming": incoming_qs.filter(status="hold").count(),
                "pending_ipqc": ipqc_qs.filter(status="hold").count(),
                "held_releases": release_qs.filter(
                    release_status=FinalQARelease.ReleaseStatus.HELD
                ).count(),
                "open_ncrs": ncr_qs.exclude(status=NCR.Status.CLOSED).count(),
                "open_capas": capa_qs.filter(status=CAPA.Status.OPEN).count(),
                "lab_fails": lab_qs.filter(status="fail").count(),
                "pass_count": pass_count,
                "fail_count": fail_count,
                "hold_count": hold_count,
                "released_count": release_qs.filter(
                    release_status=FinalQARelease.ReleaseStatus.RELEASED
                ).count(),
                "by_status": [
                    {"name": "Pass", "code": "pass", "value": pass_count},
                    {"name": "Fail", "code": "fail", "value": fail_count},
                    {"name": "Hold", "code": "hold", "value": hold_count},
                ],
                "inbox": inbox,
                "recent_ncrs": [
                    serialize_ncr(n)
                    for n in ncr_qs.select_related("department", "work_order")
                    .prefetch_related("capas")
                    .order_by("-date")[:8]
                ],
                "recent_releases": [
                    serialize_release(r)
                    for r in release_qs.select_related("product", "batch", "approved_by", "work_order")
                    .order_by("-inspection_date")[:8]
                ],
            }
        )


class QualityOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "employees": [],
                    "vendors": [],
                    "materials": [],
                    "products": [],
                    "batches": [],
                    "work_orders": [],
                    "departments": [],
                    "ncrs": [],
                    "process_definitions": [],
                    "process_stages": [],
                }
            )
        defs = list(
            ProcessDefinition.objects.filter(organization=org).order_by("name")[:100]
        )
        stages = list(
            ProcessStage.objects.filter(process_definition__organization=org)
            .select_related("process_definition")
            .order_by("process_definition__name", "sort_order")[:200]
        )
        return Response(
            {
                "employees": [
                    {"id": str(e.id), "code": e.employee_code, "name": e.full_name}
                    for e in Employee.objects.filter(
                        organization=org, status=Employee.Status.ACTIVE
                    ).order_by("full_name")[:200]
                ],
                "vendors": [
                    {"id": str(v.id), "name": v.vendor_name}
                    for v in Vendor.objects.filter(organization=org).order_by("vendor_name")[:200]
                ],
                "materials": [
                    {"id": str(i.id), "code": i.item_code, "name": i.name, "uom": i.uom}
                    for i in ItemMaster.objects.filter(organization=org).order_by("item_code")[:500]
                ],
                "products": [
                    {"id": str(p.id), "name": p.name, "brand": p.brand_name or ""}
                    for p in Product.objects.filter(seller_org=org).order_by("name")[:200]
                ],
                "batches": [
                    {"id": str(b.id), "batch_no": b.batch_no, "status": b.status}
                    for b in Batch.objects.filter(organization=org).order_by("-id")[:100]
                ],
                "work_orders": [
                    {"id": str(wo.id), "wo_no": wo.wo_no, "title": wo.title, "status": wo.status}
                    for wo in WorkOrder.objects.filter(organization=org)
                    .exclude(status=WorkOrder.Status.CANCELLED)
                    .order_by("-id")[:100]
                ],
                "departments": [
                    {"id": str(d.id), "code": d.code, "name": d.name}
                    for d in Department.objects.filter(organization=org).order_by("code")[:100]
                ],
                "ncrs": [
                    {"id": str(n.id), "ncr_no": n.ncr_no, "status": n.status}
                    for n in NCR.objects.filter(organization=org)
                    .exclude(status=NCR.Status.CLOSED)
                    .order_by("-date")[:100]
                ],
                "process_definitions": [
                    {"id": str(d.id), "name": d.name, "code": getattr(d, "code", "") or ""}
                    for d in defs
                ],
                "process_stages": [
                    {
                        "id": str(s.id),
                        "name": s.name,
                        "code": s.code,
                        "process_definition_id": str(s.process_definition_id),
                    }
                    for s in stages
                ],
            }
        )


# ── Incoming Inspection ──────────────────────────────────────────────────────


class QualityIncomingView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(IncomingInspection.objects.all(), org).select_related(
            "supplier", "material", "batch", "inspector"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(inspection_no__icontains=search)
                | Q(parameter__icontains=search)
                | Q(batch_no__icontains=search)
                | Q(material__name__icontains=search)
                | Q(supplier__vendor_name__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-date"
        if sort.lstrip("-") in ("date", "inspection_no", "status"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_incoming(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        supplier = _get_fk(Vendor, org, data.get("supplier_id"))
        material = _get_fk(ItemMaster, org, data.get("material_id"))
        inspector = _get_fk(Employee, org, data.get("inspector_id"))
        if not supplier or not material or not inspector:
            return Response(
                {"detail": "supplier_id, material_id and inspector_id are required."},
                status=400,
            )
        date_val = _parse_date(data.get("date")) or timezone.localdate()
        inspection_no = (data.get("inspection_no") or "").strip()
        if not inspection_no:
            n = IncomingInspection.objects.filter(organization=org).count() + 1
            inspection_no = f"IQC-{timezone.now():%Y%m%d}-{n:04d}"
        batch = _get_fk(Batch, org, data.get("batch_id"))
        status = data.get("status") or "hold"
        if status not in ("pass", "fail", "hold"):
            status = "hold"
        obj = IncomingInspection.objects.create(
            organization=org,
            inspection_no=inspection_no,
            date=date_val,
            supplier=supplier,
            material=material,
            batch=batch,
            batch_no=(data.get("batch_no") or (batch.batch_no if batch else "") or ""),
            parameter=data.get("parameter") or "",
            result=data.get("result") or "",
            status=status,
            inspector=inspector,
        )
        return Response(serialize_incoming(obj), status=201)


class QualityIncomingDetailView(DomainAuthMixin, APIView):
    def get(self, request, inspection_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(IncomingInspection.objects.all(), org)
            .select_related("supplier", "material", "batch", "inspector")
            .filter(pk=inspection_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_incoming(obj))

    def post(self, request, inspection_id):
        return self.patch(request, inspection_id)

    def patch(self, request, inspection_id):
        org = resolve_org(request.user)
        obj = org_filter(IncomingInspection.objects.all(), org).filter(pk=inspection_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        if action in ("pass", "fail", "hold") or data.get("status") in ("pass", "fail", "hold"):
            status = action or data.get("status")
            try:
                record_incoming_inspection(obj, status=status, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        if "parameter" in data:
            obj.parameter = data.get("parameter") or ""
        if "result" in data:
            obj.result = data.get("result") or ""
        if "batch_no" in data:
            obj.batch_no = data.get("batch_no") or ""
        if "date" in data and data.get("date"):
            d = _parse_date(data.get("date"))
            if d:
                obj.date = d
        obj.save()
        obj = (
            IncomingInspection.objects.select_related("supplier", "material", "batch", "inspector")
            .get(pk=obj.pk)
        )
        return Response(serialize_incoming(obj))

    def delete(self, request, inspection_id):
        org = resolve_org(request.user)
        obj = org_filter(IncomingInspection.objects.all(), org).filter(pk=inspection_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── In-Process QC ────────────────────────────────────────────────────────────


class QualityIPQCView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(InProcessQC.objects.all(), org).select_related(
            "product",
            "batch",
            "work_order",
            "inspector",
            "process_run_stage",
            "process_run_stage__process_stage",
            "process_stage",
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(parameter__icontains=search)
                | Q(batch_no__icontains=search)
                | Q(process_step__icontains=search)
                | Q(product__name__icontains=search)
                | Q(work_order__wo_no__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-date"
        if sort.lstrip("-") in ("date", "status", "parameter"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_ipqc(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        inspector = _get_fk(Employee, org, data.get("inspector_id"))
        if not inspector:
            return Response({"detail": "inspector_id is required."}, status=400)
        product = None
        if data.get("product_id"):
            product = Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()
        batch = _get_fk(Batch, org, data.get("batch_id"))
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        process_run = _get_fk(ProcessRun, org, data.get("process_run_id"))
        process_run_stage = None
        if data.get("process_run_stage_id"):
            process_run_stage = ProcessRunStage.objects.filter(
                pk=data.get("process_run_stage_id")
            ).first()
        process_stage = None
        if data.get("process_stage_id"):
            process_stage = ProcessStage.objects.filter(
                pk=data.get("process_stage_id"),
                process_definition__organization=org,
            ).first()
        status = data.get("status") or "hold"
        if status not in ("pass", "fail", "hold"):
            status = "hold"
        obj = InProcessQC.objects.create(
            organization=org,
            date=_parse_date(data.get("date")) or timezone.localdate(),
            product=product,
            batch=batch,
            batch_no=(data.get("batch_no") or (batch.batch_no if batch else "") or ""),
            work_order=work_order,
            process_run=process_run,
            process_run_stage=process_run_stage,
            process_stage=process_stage,
            process_step=data.get("process_step") or "",
            parameter=data.get("parameter") or "",
            standard=data.get("standard") or "",
            actual=data.get("actual") or "",
            status=status,
            inspector=inspector,
        )
        return Response(
            serialize_ipqc(
                InProcessQC.objects.select_related(
                    "product", "batch", "work_order", "inspector", "process_run_stage"
                ).get(pk=obj.pk)
            ),
            status=201,
        )


class QualityIPQCDetailView(DomainAuthMixin, APIView):
    def get(self, request, qc_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(InProcessQC.objects.all(), org)
            .select_related(
                "product", "batch", "work_order", "inspector", "process_run_stage", "process_stage"
            )
            .filter(pk=qc_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_ipqc(obj))

    def post(self, request, qc_id):
        return self.patch(request, qc_id)

    def patch(self, request, qc_id):
        org = resolve_org(request.user)
        obj = org_filter(InProcessQC.objects.all(), org).filter(pk=qc_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        if action in ("pass", "fail", "hold") or data.get("status") in ("pass", "fail", "hold"):
            status = action or data.get("status")
            try:
                record_inprocess_qc(obj, status=status, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        for field in ("parameter", "standard", "actual", "process_step", "batch_no"):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "date" in data and data.get("date"):
            d = _parse_date(data.get("date"))
            if d:
                obj.date = d
        obj.save()
        return Response(
            serialize_ipqc(
                InProcessQC.objects.select_related(
                    "product", "batch", "work_order", "inspector", "process_run_stage"
                ).get(pk=obj.pk)
            )
        )

    def delete(self, request, qc_id):
        org = resolve_org(request.user)
        obj = org_filter(InProcessQC.objects.all(), org).filter(pk=qc_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Final QA Release ─────────────────────────────────────────────────────────


class QualityReleaseView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(FinalQARelease.objects.all(), org).select_related(
            "product", "batch", "work_order", "approved_by"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(batch_no__icontains=search)
                | Q(product__name__icontains=search)
                | Q(work_order__wo_no__icontains=search)
            )
        status = (request.query_params.get("release_status") or request.query_params.get("status") or "").strip()
        if status:
            alias = {"hold": "held"}
            qs = qs.filter(release_status=alias.get(status, status))
        sort = request.query_params.get("sort") or "-inspection_date"
        if sort.lstrip("-") in ("inspection_date", "release_status", "batch_no"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-inspection_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_release(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        approved_by = _get_fk(Employee, org, data.get("approved_by_id") or data.get("inspector_id"))
        if not approved_by:
            return Response({"detail": "approved_by_id is required."}, status=400)
        product = None
        if data.get("product_id"):
            product = Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()
        batch = _get_fk(Batch, org, data.get("batch_id"))
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        release_status = data.get("release_status") or FinalQARelease.ReleaseStatus.HELD
        alias = {"hold": "held", "release": "released", "reject": "rejected"}
        release_status = alias.get(release_status, release_status)
        if release_status not in FinalQARelease.ReleaseStatus.values:
            release_status = FinalQARelease.ReleaseStatus.HELD
        quality_status = data.get("quality_status") or "hold"
        if quality_status not in ("pass", "fail", "hold"):
            quality_status = "hold"
        obj = FinalQARelease.objects.create(
            organization=org,
            batch_no=(data.get("batch_no") or (batch.batch_no if batch else "") or ""),
            batch=batch,
            product=product,
            work_order=work_order,
            inspection_date=_parse_date(data.get("inspection_date") or data.get("date"))
            or timezone.localdate(),
            quantity=_decimal(data.get("quantity")),
            quality_status=quality_status,
            release_status=release_status,
            approved_by=approved_by,
        )
        return Response(
            serialize_release(
                FinalQARelease.objects.select_related(
                    "product", "batch", "work_order", "approved_by"
                ).get(pk=obj.pk)
            ),
            status=201,
        )


class QualityReleaseDetailView(DomainAuthMixin, APIView):
    def get(self, request, release_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(FinalQARelease.objects.all(), org)
            .select_related("product", "batch", "work_order", "approved_by")
            .filter(pk=release_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_release(obj))

    def post(self, request, release_id):
        return self.patch(request, release_id)

    def patch(self, request, release_id):
        org = resolve_org(request.user)
        obj = org_filter(FinalQARelease.objects.all(), org).filter(pk=release_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        release_status = data.get("release_status") or data.get("action")
        if release_status:
            alias = {"hold": "held", "release": "released", "reject": "rejected"}
            release_status = alias.get(release_status, release_status)
            if release_status in FinalQARelease.ReleaseStatus.values:
                try:
                    final_qa_release(
                        obj,
                        release_status=release_status,
                        quality_status=data.get("quality_status"),
                        actor=request.user,
                    )
                    obj.refresh_from_db()
                except DomainError as exc:
                    return _domain_error(exc)
        if "quality_status" in data and data["quality_status"] in ("pass", "fail", "hold"):
            if not release_status:
                obj.quality_status = data["quality_status"]
                obj.save(update_fields=["quality_status"])
        if "quantity" in data:
            obj.quantity = _decimal(data.get("quantity"))
            obj.save(update_fields=["quantity"])
        if "batch_no" in data:
            obj.batch_no = data.get("batch_no") or ""
            obj.save(update_fields=["batch_no"])
        return Response(
            serialize_release(
                FinalQARelease.objects.select_related(
                    "product", "batch", "work_order", "approved_by"
                ).get(pk=obj.pk)
            )
        )

    def delete(self, request, release_id):
        org = resolve_org(request.user)
        obj = org_filter(FinalQARelease.objects.all(), org).filter(pk=release_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Lab Reports ──────────────────────────────────────────────────────────────


class QualityLabView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(LabReport.objects.all(), org).select_related(
            "work_order", "batch", "process_run_stage"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(test_no__icontains=search)
                | Q(sample__icontains=search)
                | Q(test_parameter__icontains=search)
                | Q(method__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-test_no"
        if sort.lstrip("-") in ("test_no", "status", "test_parameter"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-test_no")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_lab(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        test_no = (data.get("test_no") or "").strip()
        if not test_no:
            n = LabReport.objects.filter(organization=org).count() + 1
            test_no = f"LAB-{timezone.now():%Y%m%d}-{n:04d}"
        status = data.get("status") or "hold"
        if status not in ("pass", "fail", "hold"):
            status = "hold"
        batch = _get_fk(Batch, org, data.get("batch_id"))
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        process_run_stage = None
        if data.get("process_run_stage_id"):
            process_run_stage = ProcessRunStage.objects.filter(
                pk=data.get("process_run_stage_id")
            ).first()
        obj = LabReport.objects.create(
            organization=org,
            test_no=test_no,
            sample=data.get("sample") or "",
            work_order=work_order,
            process_run_stage=process_run_stage,
            batch=batch,
            test_parameter=data.get("test_parameter") or "",
            method=data.get("method") or "",
            specification=data.get("specification") or "",
            result=data.get("result") or "",
            unit=data.get("unit") or "",
            status=status,
        )
        return Response(
            serialize_lab(
                LabReport.objects.select_related("work_order", "batch").get(pk=obj.pk)
            ),
            status=201,
        )


class QualityLabDetailView(DomainAuthMixin, APIView):
    def get(self, request, report_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(LabReport.objects.all(), org)
            .select_related("work_order", "batch")
            .filter(pk=report_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_lab(obj))

    def patch(self, request, report_id):
        org = resolve_org(request.user)
        obj = org_filter(LabReport.objects.all(), org).filter(pk=report_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in (
            "sample",
            "test_parameter",
            "method",
            "specification",
            "result",
            "unit",
        ):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "status" in data and data["status"] in ("pass", "fail", "hold"):
            obj.status = data["status"]
        if "action" in data and data["action"] in ("pass", "fail", "hold"):
            obj.status = data["action"]
        obj.save()
        return Response(
            serialize_lab(
                LabReport.objects.select_related("work_order", "batch").get(pk=obj.pk)
            )
        )

    def delete(self, request, report_id):
        org = resolve_org(request.user)
        obj = org_filter(LabReport.objects.all(), org).filter(pk=report_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── NCR ──────────────────────────────────────────────────────────────────────


class QualityNCRView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(NCR.objects.all(), org)
            .select_related("department", "work_order")
            .prefetch_related("capas")
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(ncr_no__icontains=search)
                | Q(issue__icontains=search)
                | Q(root_cause__icontains=search)
                | Q(correction__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-date"
        if sort.lstrip("-") in ("date", "ncr_no", "status"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_ncr(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        issue = (data.get("issue") or "").strip()
        if not issue:
            return Response({"detail": "issue is required."}, status=400)
        department = _get_fk(Department, org, data.get("department_id"))
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        create_capa = bool(data.get("create_capa"))
        capa_owner = _get_fk(Employee, org, data.get("owner_id") or data.get("capa_owner_id"))
        try:
            ncr, capa = open_ncr_record(
                organization=org,
                issue=issue,
                department=department,
                work_order=work_order,
                create_capa=create_capa,
                capa_owner=capa_owner,
                actor=request.user,
            )
        except DomainError as exc:
            return _domain_error(exc)
        if data.get("root_cause") or data.get("correction"):
            ncr.root_cause = data.get("root_cause") or ""
            ncr.correction = data.get("correction") or ""
            ncr.save(update_fields=["root_cause", "correction"])
        payload = serialize_ncr(
            NCR.objects.select_related("department", "work_order")
            .prefetch_related("capas")
            .get(pk=ncr.pk)
        )
        if capa:
            payload["capa_id"] = str(capa.id)
            payload["capa_no"] = capa.capa_no
        return Response(payload, status=201)


class QualityNCRDetailView(DomainAuthMixin, APIView):
    def get(self, request, ncr_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(NCR.objects.all(), org)
            .select_related("department", "work_order")
            .prefetch_related("capas")
            .filter(pk=ncr_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_ncr(obj))

    def patch(self, request, ncr_id):
        org = resolve_org(request.user)
        obj = org_filter(NCR.objects.all(), org).filter(pk=ncr_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("issue", "root_cause", "correction"):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "status" in data and data["status"] in NCR.Status.values:
            obj.status = data["status"]
        if "department_id" in data:
            obj.department = _get_fk(Department, org, data.get("department_id"))
        obj.save()
        return Response(
            serialize_ncr(
                NCR.objects.select_related("department", "work_order")
                .prefetch_related("capas")
                .get(pk=obj.pk)
            )
        )

    def delete(self, request, ncr_id):
        org = resolve_org(request.user)
        obj = org_filter(NCR.objects.all(), org).filter(pk=ncr_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── CAPA ─────────────────────────────────────────────────────────────────────


class QualityCAPAView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(CAPA.objects.all(), org).select_related(
            "owner", "ncr", "work_order"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(capa_no__icontains=search)
                | Q(problem__icontains=search)
                | Q(root_cause__icontains=search)
                | Q(corrective_action__icontains=search)
                | Q(ncr__ncr_no__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        sort = request.query_params.get("sort") or "-due_date"
        if sort.lstrip("-") in ("due_date", "capa_no", "status"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-due_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_capa(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        owner = _get_fk(Employee, org, data.get("owner_id"))
        problem = (data.get("problem") or "").strip()
        if not owner or not problem:
            return Response({"detail": "owner_id and problem are required."}, status=400)
        ncr = _get_fk(NCR, org, data.get("ncr_id"))
        work_order = _get_fk(WorkOrder, org, data.get("work_order_id"))
        capa_no = (data.get("capa_no") or "").strip()
        if not capa_no:
            c = CAPA.objects.filter(organization=org).count() + 1
            capa_no = f"CAPA-{timezone.now():%Y%m%d}-{c:04d}"
        obj = CAPA.objects.create(
            organization=org,
            capa_no=capa_no,
            problem=problem,
            root_cause=data.get("root_cause") or "",
            corrective_action=data.get("corrective_action") or "",
            preventive_action=data.get("preventive_action") or "",
            owner=owner,
            due_date=_parse_date(data.get("due_date")),
            ncr=ncr,
            work_order=work_order,
            status=data.get("status") if data.get("status") in CAPA.Status.values else CAPA.Status.OPEN,
        )
        return Response(
            serialize_capa(
                CAPA.objects.select_related("owner", "ncr", "work_order").get(pk=obj.pk)
            ),
            status=201,
        )


class QualityCAPADetailView(DomainAuthMixin, APIView):
    def get(self, request, capa_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(CAPA.objects.all(), org)
            .select_related("owner", "ncr", "work_order")
            .filter(pk=capa_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_capa(obj))

    def patch(self, request, capa_id):
        org = resolve_org(request.user)
        obj = org_filter(CAPA.objects.all(), org).filter(pk=capa_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        action = (data.get("action") or "").strip()
        if action == "close" or data.get("status") == CAPA.Status.CLOSED:
            try:
                close_capa(obj, actor=request.user)
                obj.refresh_from_db()
            except DomainError as exc:
                return _domain_error(exc)
        for field in ("problem", "root_cause", "corrective_action", "preventive_action"):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "due_date" in data:
            obj.due_date = _parse_date(data.get("due_date"))
        if "owner_id" in data:
            owner = _get_fk(Employee, org, data.get("owner_id"))
            if owner:
                obj.owner = owner
        if "ncr_id" in data:
            obj.ncr = _get_fk(NCR, org, data.get("ncr_id"))
        if data.get("status") == CAPA.Status.OPEN:
            obj.status = CAPA.Status.OPEN
        obj.save()
        return Response(
            serialize_capa(
                CAPA.objects.select_related("owner", "ncr", "work_order").get(pk=obj.pk)
            )
        )

    def delete(self, request, capa_id):
        org = resolve_org(request.user)
        obj = org_filter(CAPA.objects.all(), org).filter(pk=capa_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Quality Masters ──────────────────────────────────────────────────────────


class QualityMasterView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(QualityMaster.objects.all(), org).select_related(
            "product", "process_definition", "process_stage"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(quality_parameter__icontains=search)
                | Q(specification__icontains=search)
                | Q(tolerance__icontains=search)
                | Q(product__name__icontains=search)
            )
        sort = request.query_params.get("sort") or "quality_parameter"
        if sort.lstrip("-") in ("quality_parameter", "specification", "testing_frequency"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("quality_parameter")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_master(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        param = (data.get("quality_parameter") or "").strip()
        if not param:
            return Response({"detail": "quality_parameter is required."}, status=400)
        product = None
        if data.get("product_id"):
            product = Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()
        process_definition = _get_fk(ProcessDefinition, org, data.get("process_definition_id"))
        process_stage = None
        if data.get("process_stage_id"):
            process_stage = ProcessStage.objects.filter(
                pk=data.get("process_stage_id"),
                process_definition__organization=org,
            ).first()
        obj = QualityMaster.objects.create(
            organization=org,
            product=product,
            process_definition=process_definition,
            process_stage=process_stage,
            quality_parameter=param,
            specification=data.get("specification") or "",
            tolerance=data.get("tolerance") or "",
            testing_frequency=data.get("testing_frequency") or "",
        )
        return Response(
            serialize_master(
                QualityMaster.objects.select_related(
                    "product", "process_definition", "process_stage"
                ).get(pk=obj.pk)
            ),
            status=201,
        )


class QualityMasterDetailView(DomainAuthMixin, APIView):
    def get(self, request, master_id):
        org = resolve_org(request.user)
        obj = (
            org_filter(QualityMaster.objects.all(), org)
            .select_related("product", "process_definition", "process_stage")
            .filter(pk=master_id)
            .first()
        )
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_master(obj))

    def patch(self, request, master_id):
        org = resolve_org(request.user)
        obj = org_filter(QualityMaster.objects.all(), org).filter(pk=master_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "quality_parameter" in data and data.get("quality_parameter"):
            obj.quality_parameter = str(data["quality_parameter"]).strip()
        for field in ("specification", "tolerance", "testing_frequency"):
            if field in data:
                setattr(obj, field, data.get(field) or "")
        if "product_id" in data:
            obj.product = (
                Product.objects.filter(pk=data.get("product_id"), seller_org=org).first()
                if data.get("product_id")
                else None
            )
        if "process_definition_id" in data:
            obj.process_definition = _get_fk(
                ProcessDefinition, org, data.get("process_definition_id")
            )
        if "process_stage_id" in data:
            obj.process_stage = (
                ProcessStage.objects.filter(
                    pk=data.get("process_stage_id"),
                    process_definition__organization=org,
                ).first()
                if data.get("process_stage_id")
                else None
            )
        obj.save()
        return Response(
            serialize_master(
                QualityMaster.objects.select_related(
                    "product", "process_definition", "process_stage"
                ).get(pk=obj.pk)
            )
        )

    def delete(self, request, master_id):
        org = resolve_org(request.user)
        obj = org_filter(QualityMaster.objects.all(), org).filter(pk=master_id).first()
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
