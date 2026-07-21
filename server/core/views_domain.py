"""Domain list APIs — live data for BEOS module pages."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Avg, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.authentication import SessionTokenAuthentication
from core.models import (
    AdCampaign,
    Attendance,
    AuditLog,
    BoardDeclaration,
    CAPA,
    ChatMessage,
    ChatThread,
    Dispatch,
    Document,
    DocumentTemplate,
    Employee,
    Equipment,
    FeedPost,
    FinalQARelease,
    HelpTicket,
    IncomingInspection,
    InProcessQC,
    ItemMaster,
    JournalLine,
    KYCDocument,
    KPISnapshot,
    LabReport,
    LiveStream,
    MediaAsset,
    Meeting,
    MetadataForm,
    Module,
    NCR,
    Notification,
    Order,
    Organization,
    PaymentTransaction,
    PipelineDeal,
    ProcessDefinition,
    Product,
    Purchase,
    PurchaseOrder,
    PurchaseRequisition,
    QualityMaster,
    Role,
    RoleModulePermission,
    Sales,
    SalesOrder,
    Session,
    StockLedger,
    Task,
    WorkflowDefinition,
    WorkOrder,
    GRN,
    MaintenanceWorkOrder,
)
from core.services.portal_service import _pick_membership


def _user_display(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username


def _dec(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _iso(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def _actor_name(actor) -> str:
    if not actor:
        return "Unassigned"
    if actor.user_id:
        profile = getattr(actor.user, "profile", None)
        if profile and profile.full_name:
            return profile.full_name
        return actor.user.get_full_name() or actor.user.username
    return actor.get_actor_type_display()


def resolve_org(user) -> Organization | None:
    membership = _pick_membership(user)
    if membership:
        return membership.organization
    if user.is_superuser or getattr(user, "account_type", "") == "super_admin":
        return Organization.objects.filter(is_active=True).order_by("created_at").first()
    return None


def org_filter(qs, org, field="organization"):
    if org is None:
        return qs.none()
    return qs.filter(**{field: org})


class DomainAuthMixin:
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_task(t: Task) -> dict:
    module = ""
    if t.workflow_instance_id and t.workflow_instance.definition_id:
        module = t.workflow_instance.definition.name
    return {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id) if t.tenant_id else "",
        "org_id": str(t.organization_id) if t.organization_id else "",
        "assignee_id": str(t.assignee_id) if t.assignee_id else "",
        "assignee_name": _actor_name(t.assignee),
        "workflow_instance_id": str(t.workflow_instance_id) if t.workflow_instance_id else None,
        "title": t.title,
        "priority": t.priority,
        "due_at": _iso(t.due_at) or "",
        "status": t.status,
        "checklist_json": t.checklist_json or [],
        "evidence_urls": t.evidence_urls or [],
        "created_at": _iso(t.created_at) or "",
        "module": module or "General",
    }


def serialize_employee(e: Employee) -> dict:
    employment = e.classification
    if employment == "temporary":
        employment = "contract"
    status = e.status
    if status == "exited":
        status = "resigned"
    elif status == "suspended":
        status = "terminated"
    return {
        "id": str(e.id),
        "employee_code": e.employee_code,
        "full_name": e.full_name,
        "designation": e.position.designation if e.position_id else (e.department.name if e.department_id else ""),
        "department_id": str(e.department_id) if e.department_id else "",
        "department_name": e.department.name if e.department_id else "",
        "branch_name": e.organization.company_name if e.organization_id else "",
        "employment_type": employment,
        "join_date": _iso(e.join_date) or "",
        "status": status,
        "email": (e.user.email if e.user_id else "") or "",
        "phone": (e.user.phone if e.user_id else "") or "",
        "reporting_to": e.reporting_to.full_name if e.reporting_to_id else None,
    }


def serialize_attendance(a: Attendance) -> dict:
    status = a.status
    if status == "leave":
        status = "on_leave"
    check_in = a.check_in.strftime("%H:%M") if a.check_in else None
    check_out = a.check_out.strftime("%H:%M") if a.check_out else None
    work_hours = 0.0
    if a.check_in:
        end = a.check_out or timezone.now()
        work_hours = round((end - a.check_in).total_seconds() / 3600, 1)
    if a.check_in and a.check_in.time() > time(9, 0) and status == "present":
        status = "late"
    return {
        "id": str(a.id),
        "employee_id": str(a.employee_id),
        "employee_name": a.employee.full_name,
        "date": _iso(a.date),
        "check_in": check_in,
        "check_out": check_out,
        "status": status,
        "work_hours": work_hours,
    }


def serialize_work_order(wo: WorkOrder) -> dict:
    status_map = {"draft": "planned", "cancelled": "on_hold"}
    status = status_map.get(wo.status, wo.status)
    product_name = wo.title
    if wo.product_id:
        product_name = wo.product.name
    elif wo.output_item_id:
        product_name = wo.output_item.name
    brand = (wo.custom_data_json or {}).get("brand") or (wo.product.brand_name if wo.product_id else "") or ""
    batch_no = wo.batch.batch_no if wo.batch_id else (wo.custom_data_json or {}).get("batch_no", "")
    line = (wo.custom_data_json or {}).get("line") or (wo.department.name if wo.department_id else "")
    qa = (wo.custom_data_json or {}).get("qa_status", "pending")
    return {
        "id": str(wo.id),
        "wo_code": wo.wo_no,
        "product_name": product_name,
        "brand": brand or "—",
        "batch_no": batch_no or "—",
        "planned_qty": _dec(wo.target_qty),
        "produced_qty": _dec(wo.actual_qty),
        "uom": wo.uom or "pcs",
        "line": line or "—",
        "scheduled_start": _iso(wo.planned_start) or _iso(wo.date) or "",
        "status": status,
        "qa_status": qa,
    }


def serialize_stock_item(item: ItemMaster, on_hand: float, warehouse: str, batch_no: str, expiry) -> dict:
    cat_map = {
        "raw": "Raw Material",
        "packaging": "Packaging",
        "finished": "Finished Goods",
        "spare": "Spare Part",
    }
    return {
        "id": str(item.id),
        "sku": item.item_code,
        "name": item.name,
        "category": cat_map.get(item.category, item.category),
        "uom": item.uom,
        "on_hand": on_hand,
        "reserved": 0,
        "reorder_level": _dec(item.reorder_level),
        "warehouse": warehouse,
        "batch_no": batch_no or "—",
        "expiry_date": _iso(expiry),
    }


def serialize_sales_order(so: SalesOrder) -> dict:
    lines = list(so.lines.all()[:1])
    line = lines[0] if lines else None
    product = line.product.name if line and line.product_id else "—"
    brand = (line.product.brand_name if line and line.product_id else "") or "Laija"
    qty = _dec(line.qty) if line else 0
    unit_price = _dec(line.price) if line else 0
    status_map = {
        "draft": "open",
        "submitted": "open",
        "approved": "confirmed",
        "posted": "shipped",
        "cancelled": "cancelled",
    }
    return {
        "id": str(so.id),
        "order_no": so.so_no,
        "customer_name": so.party.name if so.party_id else "—",
        "dealer_code": so.party.area if so.party_id else "",
        "brand": brand,
        "product": product,
        "qty": qty,
        "uom": "pcs",
        "unit_price": unit_price,
        "total": _dec(so.total),
        "order_date": _iso(so.date) or "",
        "delivery_date": _iso(so.date) or "",
        "status": status_map.get(so.status, so.status),
        "route": so.party.area if so.party_id else "",
        "sales_rep": so.party.asm.full_name if so.party_id and so.party.asm_id else "",
        "payment_terms": "",
    }


def serialize_gl_entry(line: JournalLine) -> dict:
    return {
        "id": str(line.id),
        "voucher_no": line.voucher.voucher_no,
        "date": _iso(line.voucher.date) or "",
        "account": line.account.name if line.account_id else "",
        "debit": _dec(line.debit),
        "credit": _dec(line.credit),
        "narrative": line.reference or line.voucher.narration or "",
        "module": line.voucher.voucher_type,
    }


def serialize_bill(p: Purchase) -> dict:
    today = date.today()
    status = "open"
    if p.payment_status == "paid":
        status = "paid"
    elif p.payment_status == "unpaid" and p.date < today - timedelta(days=30):
        status = "overdue"
    return {
        "id": str(p.id),
        "bill_no": p.purchase_no,
        "vendor": p.supplier.vendor_name if p.supplier_id else "—",
        "amount": _dec(p.total),
        "due_date": _iso(p.date + timedelta(days=15)) or "",
        "status": status,
    }


def serialize_requisition(pr: PurchaseRequisition) -> dict:
    lines = list(pr.lines.all()[:1])
    line = lines[0] if lines else None
    item = line.material.name if line and line.material_id else "—"
    qty = _dec(line.qty) if line else 0
    uom = line.material.uom if line and line.material_id else "pcs"
    need_by = line.required_date if line else pr.date
    return {
        "id": str(pr.id),
        "pr_no": pr.pr_no,
        "requested_by": _user_display(pr.requested_by) if pr.requested_by_id else "",
        "department": pr.department.name if pr.department_id else "",
        "item": item,
        "qty": qty,
        "uom": uom,
        "need_by": _iso(need_by),
        "status": pr.status,
    }


def serialize_po(po: PurchaseOrder) -> dict:
    lines = list(po.lines.all()[:1])
    line = lines[0] if lines else None
    return {
        "id": str(po.id),
        "po_no": po.po_no,
        "vendor": po.supplier.vendor_name if po.supplier_id else "—",
        "item": line.item.name if line and line.item_id else "—",
        "qty": _dec(line.qty) if line else 0,
        "uom": line.item.uom if line and line.item_id else "pcs",
        "unit_price": _dec(line.rate) if line else 0,
        "total": _dec(po.total),
        "order_date": _iso(po.date) or "",
        "delivery_date": _iso(po.delivery_date) or "",
        "status": po.status,
    }


def serialize_grn(g: GRN) -> dict:
    lines = list(g.lines.all()[:1])
    line = lines[0] if lines else None
    return {
        "id": str(g.id),
        "grn_no": g.grn_no,
        "po_no": g.po.po_no if g.po_id else "",
        "vendor": g.supplier.vendor_name if g.supplier_id else "—",
        "item": line.item.name if line and line.item_id else "—",
        "qty": _dec(line.received_qty) if line else 0,
        "uom": line.item.uom if line and line.item_id else "pcs",
        "received_date": _iso(g.date) or "",
        "qc_status": getattr(g, "qc_status", "pending") or "pending",
    }


def serialize_qc(q: InProcessQC) -> dict:
    brand = q.product.brand_name if q.product_id else "Laija"
    return {
        "id": str(q.id),
        "batch_no": q.batch_no or (q.batch.batch_no if q.batch_id else "—"),
        "product": q.product.name if q.product_id else (q.process_step or "—"),
        "brand": brand or "Laija",
        "test": q.parameter or q.process_step or "QC",
        "parameter": q.parameter or "",
        "result": q.actual or "pending",
        "spec_min": "",
        "spec_max": q.standard or "",
        "status": q.status if q.status in ("pass", "fail", "pending", "hold") else ("pending" if q.status == "hold" else q.status),
        "tested_by": q.inspector.full_name if q.inspector_id else "",
        "tested_at": _iso(q.date) or "",
    }


def serialize_batch_release(r: FinalQARelease) -> dict:
    status_map = {"held": "hold", "released": "released", "rejected": "rejected"}
    return {
        "id": str(r.id),
        "batch_no": r.batch_no or (r.batch.batch_no if r.batch_id else "—"),
        "product": r.product.name if r.product_id else "—",
        "brand": (r.product.brand_name if r.product_id else "") or "Laija",
        "status": status_map.get(r.release_status, r.release_status),
        "qa_manager": r.approved_by.full_name if r.approved_by_id else "",
        "release_date": _iso(r.inspection_date) if r.release_status == "released" else None,
        "coa_no": None,
    }


def serialize_lead(d: PipelineDeal) -> dict:
    stage_map = {
        "lead": "new",
        "qualified": "qualified",
        "proposal": "proposal",
        "negotiation": "proposal",
        "won": "won",
        "lost": "lost",
    }
    return {
        "id": str(d.id),
        "lead_code": f"LD-{str(d.id)[:8].upper()}",
        "company": d.party.name if d.party_id else d.title,
        "contact": d.party.name if d.party_id else "",
        "phone": getattr(d.party, "phone", "") if d.party_id else "",
        "email": getattr(d.party, "email", "") if d.party_id else "",
        "source": "CRM",
        "status": stage_map.get(d.stage, d.stage),
        "value": _dec(d.value),
        "assigned_to": d.owner.full_name if d.owner_id else "",
        "last_activity": _iso(d.expected_close) or "",
    }


def serialize_asset(e: Equipment) -> dict:
    health_map = {"green": "running", "yellow": "idle", "red": "broken"}
    status = health_map.get(e.health_index, "running")
    pm = e.pm_schedules.order_by("next_due").first() if hasattr(e, "pm_schedules") else None
    return {
        "id": str(e.id),
        "asset_code": e.asset_code,
        "name": e.name,
        "location": e.location or "—",
        "status": status,
        "last_service": _iso(e.purchase_date) or "",
        "next_service": _iso(pm.next_due) if pm else "",
    }


def serialize_work_request(w: MaintenanceWorkOrder) -> dict:
    status_map = {
        "requested": "open",
        "approved": "assigned",
        "in_progress": "in_progress",
        "closed": "completed",
    }
    return {
        "id": str(w.id),
        "wr_no": f"WR-{str(w.id)[:8].upper()}",
        "asset_code": w.equipment.asset_code if w.equipment_id else "",
        "title": w.description or f"{w.type} — {w.equipment.name if w.equipment_id else ''}",
        "priority": "high" if w.type == "breakdown" else "medium",
        "status": status_map.get(w.status, w.status),
        "requested_by": w.technician.full_name if w.technician_id else "",
        "created_at": _iso(w.requested_at) or "",
    }


def serialize_trip(d: Dispatch) -> dict:
    status_map = {
        "planned": "planned",
        "loaded": "loading",
        "dispatched": "in_transit",
        "delivered": "delivered",
        "cancelled": "returned",
    }
    return {
        "id": str(d.id),
        "trip_no": f"TR-{str(d.id)[:8].upper()}",
        "vehicle_no": d.vehicle.number if d.vehicle_id else "—",
        "driver": d.driver.full_name if d.driver_id else "—",
        "route": d.route.name if d.route_id else "—",
        "status": status_map.get(d.status, d.status),
        "stops": 1,
        "delivered": 1 if d.status == "delivered" else 0,
        "eta": _iso(d.delivered_at) or _iso(d.dispatched_at) or "",
    }


def serialize_movement(entry: StockLedger) -> dict:
    type_map = {
        "in": "GRN",
        "out": "Issue",
        "adjust": "Adjustment",
    }
    qty = _dec(entry.in_qty) if entry.transaction_type == "in" else -_dec(entry.out_qty)
    if entry.transaction_type == "adjust":
        qty = _dec(entry.in_qty) - _dec(entry.out_qty)
    ref = entry.reference_type or ""
    if entry.work_order_id:
        ref = entry.work_order.wo_no
    return {
        "id": str(entry.id),
        "doc_no": f"{entry.reference_type or 'MOV'}-{str(entry.id)[:6].upper()}",
        "type": type_map.get(entry.transaction_type, "Transfer"),
        "sku": entry.item.item_code if entry.item_id else "",
        "item": entry.item.name if entry.item_id else "",
        "qty": qty,
        "uom": entry.item.uom if entry.item_id else "pcs",
        "warehouse": entry.warehouse.code if entry.warehouse_id else "",
        "date": _iso(entry.date) or "",
        "ref": ref,
    }


def serialize_notification(n: Notification) -> dict:
    sev = "info"
    if n.type in ("escalation", "emergency"):
        sev = "critical"
    elif n.type in ("warning", "approval"):
        sev = "warning"
    return {
        "id": str(n.id),
        "severity": sev,
        "title": n.title,
        "meta": n.body[:120] if n.body else n.type,
        "is_read": n.is_read,
        "created_at": _iso(n.created_at),
        "type": n.type,
        "channel": n.channel,
    }


def serialize_product(p: Product) -> dict:
    status = "active" if p.status == "published" else p.status
    if _dec(p.stock_qty) <= 50 and status == "active":
        status = "low_stock"
    return {
        "id": str(p.id),
        "sku": p.sku or p.slug,
        "name": p.name,
        "brand": p.brand_name or "—",
        "price": _dec(p.price),
        "stock": _dec(p.stock_qty),
        "rating": 0,
        "sold_30d": 0,
        "status": status,
    }


def serialize_commerce_order(o: Order) -> dict:
    status_map = {"placed": "new"}
    items = o.items.count() if hasattr(o, "items") else 0
    buyer = ""
    if o.buyer_user_id:
        profile = getattr(o.buyer_user, "profile", None)
        buyer = (profile.full_name if profile else "") or o.buyer_user.get_full_name() or o.buyer_user.username
    created = o.created_at
    delta = timezone.now() - created if created else timedelta()
    if delta.total_seconds() < 3600:
        time_ago = f"{int(delta.total_seconds() // 60)}m ago"
    elif delta.total_seconds() < 86400:
        time_ago = f"{int(delta.total_seconds() // 3600)}h ago"
    else:
        time_ago = f"{delta.days}d ago"
    return {
        "id": o.order_no,
        "customer": buyer,
        "items": items,
        "total": _dec(o.total),
        "channel": "App",
        "status": status_map.get(o.order_status, o.order_status),
        "time": time_ago,
    }


# ── Views ────────────────────────────────────────────────────────────────────


class TasksView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(Task.objects.select_related("assignee__user__profile", "workflow_instance__definition", "organization"), org)
            .order_by("-created_at")[:100]
        )
        return Response({"results": [serialize_task(t) for t in qs]})


class EmployeesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(
                Employee.objects.select_related("department", "position", "user", "reporting_to", "organization"),
                org,
            ).order_by("employee_code")[:200]
        )
        return Response({"results": [serialize_employee(e) for e in qs]})


class AttendanceView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        day = request.query_params.get("date")
        target = date.fromisoformat(day) if day else date.today()
        qs = (
            Attendance.objects.select_related("employee")
            .filter(employee__organization=org, date=target)
            .order_by("employee__full_name")
            if org
            else Attendance.objects.none()
        )
        return Response({"results": [serialize_attendance(a) for a in qs], "date": target.isoformat()})


class WorkOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(
                WorkOrder.objects.select_related("product", "output_item", "batch", "department"),
                org,
            ).order_by("-date")[:100]
        )
        return Response({"results": [serialize_work_order(wo) for wo in qs]})


class StockView(DomainAuthMixin, APIView):
    def get(self, request):
        from core.models import Batch, MaterialIssueLine, Warehouse
        from core.services.common import get_closing_qty

        org = resolve_org(request.user)
        if not org:
            return Response({"results": []})
        items = ItemMaster.objects.filter(organization=org).order_by("item_code")[:200]
        warehouses = list(Warehouse.objects.filter(organization=org))
        results = []
        for item in items:
            warehouse_code = "—"
            best_qty = -1.0
            on_hand = 0.0
            for wh in warehouses:
                qty = float(get_closing_qty(item, wh) or 0)
                on_hand += qty
                if qty > best_qty:
                    best_qty = qty
                    warehouse_code = wh.code
            if not warehouses:
                warehouse_code = "—"
            batch = (
                Batch.objects.filter(organization=org, output_item=item)
                .order_by("-manufacture_date", "-id")
                .first()
            )
            reserved = float(
                MaterialIssueLine.objects.filter(
                    issue__organization=org,
                    material=item,
                    issue__status__in=["draft", "approved"],
                ).aggregate(s=Sum("required_qty"))["s"]
                or 0
            )
            row = serialize_stock_item(
                item,
                on_hand,
                warehouse_code,
                batch.batch_no if batch else "",
                batch.expire_date if batch else None,
            )
            row["reserved"] = reserved
            results.append(row)
        return Response({"results": results})


class StockMovementsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(
                StockLedger.objects.select_related("item", "warehouse", "work_order"),
                org,
            ).order_by("-date", "-id")[:100]
        )
        return Response({"results": [serialize_movement(e) for e in qs]})


class SalesOrdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = (
            org_filter(
                SalesOrder.objects.select_related("party", "party__asm").prefetch_related("lines__product"),
                org,
            ).order_by("-date")[:100]
        )
        return Response({"results": [serialize_sales_order(so) for so in qs]})


class SalesByRegionView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"results": []})
        rows = (
            SalesOrder.objects.filter(organization=org)
            .values("party__name")
            .annotate(value=Sum("total"))
            .order_by("-value")[:10]
        )
        results = [{"region": r["party__name"] or "Unknown", "value": _dec(r["value"])} for r in rows]
        return Response({"results": results})


class FinanceView(DomainAuthMixin, APIView):
    """Legacy finance summary — prefer /finance/overview/ for full KPIs."""

    def get(self, request):
        org = resolve_org(request.user)
        gl = []
        if org:
            lines = (
                JournalLine.objects.filter(voucher__organization=org)
                .select_related("voucher", "account")
                .order_by("-voucher__date")[:50]
            )
            gl = [serialize_gl_entry(l) for l in lines]
        bills = []
        if org:
            bills = [
                serialize_bill(p)
                for p in Purchase.objects.filter(organization=org)
                .select_related("supplier")
                .order_by("-date")[:50]
            ]
        vat_in = (
            Purchase.objects.filter(organization=org).aggregate(t=Sum("tax"))["t"] if org else 0
        )
        vat_out = Sales.objects.filter(organization=org).aggregate(t=Sum("tax"))["t"] if org else 0
        vat_in_f = _dec(vat_in)
        vat_out_f = _dec(vat_out)
        return Response(
            {
                "gl_entries": gl,
                "bills": bills,
                "vat_summary": {
                    "vat_in": vat_in_f,
                    "vat_out": vat_out_f,
                    "payable": round(vat_out_f - vat_in_f, 2),
                    "tax_year": f"{date.today().year}/{str(date.today().year + 1)[-2:]}",
                },
            }
        )


class ProcurementView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        reqs = []
        pos = []
        grns = []
        vendors = []
        rfqs = []
        if org:
            from core.models import RFQ, Vendor
            from core.views_procurement import serialize_rfq, serialize_vendor

            reqs = [
                serialize_requisition(pr)
                for pr in PurchaseRequisition.objects.filter(organization=org)
                .select_related("requested_by", "department")
                .prefetch_related("lines__material")
                .order_by("-id")[:50]
            ]
            pos = [
                serialize_po(po)
                for po in PurchaseOrder.objects.filter(organization=org)
                .select_related("supplier")
                .prefetch_related("lines__item")
                .order_by("-date")[:50]
            ]
            grns = [
                serialize_grn(g)
                for g in GRN.objects.filter(organization=org)
                .select_related("po", "supplier")
                .prefetch_related("lines__item")
                .order_by("-date")[:50]
            ]
            vendors = [
                serialize_vendor(v)
                for v in Vendor.objects.filter(organization=org).order_by("vendor_name")[:50]
            ]
            rfqs = [
                serialize_rfq(r)
                for r in RFQ.objects.filter(organization=org)
                .select_related("supplier", "item")
                .order_by("-id")[:50]
            ]
        return Response(
            {
                "requisitions": reqs,
                "purchase_orders": pos,
                "grns": grns,
                "vendors": vendors,
                "rfqs": rfqs,
            }
        )


class QualityView(DomainAuthMixin, APIView):
    """Legacy aggregate endpoint — prefer /quality/overview/ and resource routes."""

    def get(self, request):
        org = resolve_org(request.user)
        tests = []
        releases = []
        incoming = []
        lab = []
        ncrs = []
        capas = []
        masters = []
        if org:
            from core.views_quality import (
                serialize_capa,
                serialize_incoming,
                serialize_lab,
                serialize_master,
                serialize_ncr,
                serialize_release,
            )

            tests = [
                serialize_qc(q)
                for q in InProcessQC.objects.filter(organization=org)
                .select_related("product", "batch", "inspector")
                .order_by("-date")[:50]
            ]
            releases = [
                serialize_release(r)
                for r in FinalQARelease.objects.filter(organization=org)
                .select_related("product", "batch", "approved_by", "work_order")
                .order_by("-inspection_date")[:50]
            ]
            incoming = [
                serialize_incoming(i)
                for i in IncomingInspection.objects.filter(organization=org)
                .select_related("supplier", "material", "batch", "inspector")
                .order_by("-date")[:50]
            ]
            lab = [
                serialize_lab(r)
                for r in LabReport.objects.filter(organization=org)
                .select_related("work_order", "batch")
                .order_by("-test_no")[:50]
            ]
            ncrs = [
                serialize_ncr(n)
                for n in NCR.objects.filter(organization=org)
                .select_related("department", "work_order")
                .prefetch_related("capas")
                .order_by("-date")[:50]
            ]
            capas = [
                serialize_capa(c)
                for c in CAPA.objects.filter(organization=org)
                .select_related("owner", "ncr", "work_order")
                .order_by("-due_date")[:50]
            ]
            masters = [
                serialize_master(m)
                for m in QualityMaster.objects.filter(organization=org)
                .select_related("product", "process_definition", "process_stage")
                .order_by("quality_parameter")[:50]
            ]
        return Response(
            {
                "qc_tests": tests,
                "batch_releases": releases,
                "incoming": incoming,
                "lab_reports": lab,
                "ncrs": ncrs,
                "capas": capas,
                "masters": masters,
            }
        )


class CrmView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        leads = []
        if org:
            leads = [
                serialize_lead(d)
                for d in PipelineDeal.objects.filter(organization=org)
                .select_related("party", "owner")
                .order_by("-expected_close")[:100]
            ]
        return Response(
            {
                "leads": leads,
                "pipeline_stages": ["new", "contacted", "qualified", "proposal", "won", "lost"],
            }
        )


class MaintenanceView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        assets = []
        requests = []
        if org:
            assets = [
                serialize_asset(e)
                for e in Equipment.objects.filter(organization=org).prefetch_related("pm_schedules").order_by("asset_code")[:100]
            ]
            requests = [
                serialize_work_request(w)
                for w in MaintenanceWorkOrder.objects.filter(organization=org)
                .select_related("equipment", "technician")
                .order_by("-requested_at")[:50]
            ]
        return Response({"assets": assets, "work_requests": requests})


class LogisticsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        trips = []
        if org:
            trips = [
                serialize_trip(d)
                for d in Dispatch.objects.filter(organization=org)
                .select_related("vehicle", "driver", "route", "sales_order")
                .order_by("-dispatched_at")[:50]
            ]
        return Response({"trips": trips})


class NotificationsView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = Notification.objects.filter(user=request.user).order_by("-created_at")[:50]
        return Response({"results": [serialize_notification(n) for n in qs]})


class DashboardView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        today = date.today()
        yesterday = today - timedelta(days=1)

        revenue_today = 0.0
        revenue_yesterday = 0.0
        orders_open = 0
        units = 0.0
        attendance_pct = 0.0
        pending_approvals = 0
        active_workflows = 0
        ap_overdue = 0.0

        if org:
            revenue_today = _dec(
                SalesOrder.objects.filter(organization=org, date=today).aggregate(t=Sum("total"))["t"]
            )
            revenue_yesterday = _dec(
                SalesOrder.objects.filter(organization=org, date=yesterday).aggregate(t=Sum("total"))["t"]
            )
            orders_open = SalesOrder.objects.filter(organization=org, status__in=["draft", "submitted", "approved"]).count()
            units = _dec(
                WorkOrder.objects.filter(organization=org, date=today).aggregate(t=Sum("actual_qty"))["t"]
            )
            emp_count = Employee.objects.filter(organization=org, status="active").count()
            present = Attendance.objects.filter(employee__organization=org, date=today, status="present").count()
            attendance_pct = round((present / emp_count) * 100, 1) if emp_count else 0
            pending_approvals = Task.objects.filter(organization=org, status="pending_approval").count()
            active_workflows = Task.objects.filter(
                organization=org, status__in=["assigned", "accepted", "in_progress", "pending_approval"]
            ).count()
            ap_overdue = _dec(
                Purchase.objects.filter(
                    organization=org, payment_status="unpaid", date__lt=today - timedelta(days=30)
                ).aggregate(t=Sum("total"))["t"]
            )

        # Revenue trend last 7 days
        trend = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            val = 0.0
            if org:
                val = _dec(SalesOrder.objects.filter(organization=org, date=d).aggregate(t=Sum("total"))["t"]) / 1_000_000
            trend.append({"day": d.strftime("%a"), "value": round(val, 2)})

        production_by_line = []
        brand_mix = []
        if org:
            for wo in WorkOrder.objects.filter(organization=org, date__gte=today - timedelta(days=7)).select_related("department"):
                line = (wo.custom_data_json or {}).get("line") or (wo.department.name if wo.department_id else "Line")
                found = next((x for x in production_by_line if x["line"] == line), None)
                if found:
                    found["planned"] += _dec(wo.target_qty)
                    found["actual"] += _dec(wo.actual_qty)
                else:
                    production_by_line.append(
                        {"line": line, "planned": _dec(wo.target_qty), "actual": _dec(wo.actual_qty)}
                    )
            brands: dict[str, float] = {}
            for p in Product.objects.filter(seller_org=org):
                b = p.brand_name or "Other"
                brands[b] = brands.get(b, 0) + _dec(p.stock_qty)
            total_b = sum(brands.values()) or 1
            brand_mix = [{"name": k, "value": round(v / total_b * 100)} for k, v in brands.items()]

        alerts = []
        if org:
            for item in ItemMaster.objects.filter(organization=org)[:20]:
                latest = StockLedger.objects.filter(item=item).order_by("-date", "-id").first()
                on_hand = _dec(latest.closing_qty) if latest else 0
                if on_hand < _dec(item.reorder_level):
                    alerts.append(
                        {
                            "id": str(item.id),
                            "severity": "critical",
                            "title": f"{item.name} stock below reorder",
                            "meta": f"{item.item_code} · {(latest.warehouse.code if latest else 'WH')}",
                        }
                    )
            for n in Notification.objects.filter(user=request.user, is_read=False).order_by("-created_at")[:5]:
                alerts.append(serialize_notification(n))

        # Mission from highest-priority open task
        mission = None
        if org:
            t = (
                Task.objects.filter(organization=org)
                .exclude(status__in=["completed", "verified", "closed"])
                .order_by("-priority", "due_at")
                .first()
            )
            if t:
                open_checks = sum(1 for c in (t.checklist_json or []) if not c.get("done"))
                mission = {
                    "title": t.title,
                    "subtitle": f"{open_checks} checks pending · due {_iso(t.due_at) or 'soon'}",
                    "task_id": str(t.id),
                }

        snapshots = []
        if org:
            snapshots = list(
                KPISnapshot.objects.filter(organization=org).order_by("-period_date")[:10].values(
                    "kpi_code", "target", "actual", "period_date"
                )
            )

        return Response(
            {
                "kpi": {
                    "revenue_today": revenue_today,
                    "revenue_yesterday": revenue_yesterday or revenue_today,
                    "orders_open": orders_open,
                    "units_produced_today": units,
                    "otif_pct": 0,
                    "qa_reject_pct": 0,
                    "attendance_pct": attendance_pct,
                    "ap_overdue": ap_overdue,
                    "active_workflows": active_workflows,
                    "pending_approvals": pending_approvals,
                },
                "revenue_trend": trend,
                "production_by_line": production_by_line,
                "brand_mix": brand_mix,
                "alerts": alerts[:10],
                "mission": mission,
                "kpi_snapshots": [
                    {
                        "kpi_code": s["kpi_code"],
                        "target": _dec(s["target"]),
                        "actual": _dec(s["actual"]),
                        "period_date": _iso(s["period_date"]),
                    }
                    for s in snapshots
                ],
            }
        )


class CommerceView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        products = []
        orders = []
        gmv = 0.0
        order_count = 0
        aov = 0.0
        rating = 0.0
        if org:
            products = [serialize_product(p) for p in Product.objects.filter(seller_org=org).order_by("-created_at")[:50]]
            since = timezone.now() - timedelta(days=30)
            oqs = Order.objects.filter(seller_org=org, created_at__gte=since)
            order_count = oqs.count()
            gmv = _dec(oqs.aggregate(t=Sum("total"))["t"])
            aov = round(gmv / order_count, 0) if order_count else 0
            rating = _dec(
                Product.objects.filter(seller_org=org)
                .annotate(avg=Avg("reviews__rating"))
                .aggregate(t=Avg("avg"))["t"]
            ) if hasattr(Product, "reviews") else 0
            orders = [
                serialize_commerce_order(o)
                for o in Order.objects.filter(seller_org=org)
                .select_related("buyer_user__profile")
                .prefetch_related("items")
                .order_by("-created_at")[:30]
            ]
        return Response(
            {
                "products": products,
                "orders": orders,
                "kpi": {
                    "gmv_30d": gmv,
                    "orders_30d": order_count,
                    "aov": aov,
                    "rating": round(rating, 1) if rating else 0,
                },
            }
        )


class FeedView(DomainAuthMixin, APIView):
    def get(self, request):
        posts = FeedPost.objects.select_related("author_user__profile").filter(status="published").order_by("-created_at")[:50]
        results = []
        for p in posts:
            author = _user_display(p.author_user) if p.author_user_id else (
                p.author_organization.company_name if p.author_organization_id else "Sunyazon"
            )
            likes = p.engagements.filter(type="like").count()
            comments = p.engagements.filter(type="comment").count()
            results.append(
                {
                    "id": str(p.id),
                    "author": author,
                    "body": p.body or p.title or "",
                    "likes": likes,
                    "comments": comments,
                    "created_at": _iso(p.created_at),
                }
            )
        return Response({"results": results})


class ChatView(DomainAuthMixin, APIView):
    def get(self, request):
        threads = (
            ChatThread.objects.filter(participants__user=request.user)
            .distinct()
            .order_by("-last_message_at", "-created_at")[:50]
        )
        results = []
        for t in threads:
            last = ChatMessage.objects.filter(thread=t).order_by("-created_at").first()
            results.append(
                {
                    "id": str(t.id),
                    "title": t.title or t.get_thread_type_display(),
                    "preview": (last.body if last else "")[:80],
                    "unread": ChatMessage.objects.filter(thread=t, is_read=False).exclude(sender=request.user).count(),
                }
            )
        return Response({"threads": results})


class ChatMessagesView(DomainAuthMixin, APIView):
    def get(self, request, thread_id):
        msgs = ChatMessage.objects.filter(thread_id=thread_id).select_related("sender__profile").order_by("created_at")[:200]
        results = []
        for m in msgs:
            results.append(
                {
                    "id": str(m.id),
                    "sender": _user_display(m.sender),
                    "body": m.body,
                    "mine": m.sender_id == request.user.id,
                    "created_at": _iso(m.created_at),
                }
            )
        return Response({"results": results})


class AdminView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        roles = []
        matrix = []
        if org:
            roles = [
                {"id": str(r.id), "name": r.name, "kind": r.kind, "is_system": r.is_system}
                for r in Role.objects.filter(organization=org).order_by("name")
            ]
            for rp in RoleModulePermission.objects.filter(role__organization=org).select_related("role", "module"):
                full = rp.access_level == "F"
                read = rp.access_level in ("F", "R")
                matrix.append(
                    {
                        "role": rp.role.name,
                        "module": rp.module.code,
                        "can_view": read,
                        "can_create": full,
                        "can_edit": full,
                        "can_delete": full,
                        "access_level": rp.access_level,
                    }
                )
        modules = [
            {"code": m.code, "name": m.name, "category": m.category, "route_path": m.route_path}
            for m in Module.objects.filter(is_active=True).order_by("sort_order")
        ]
        forms = [
            {"id": str(f.id), "name": f"{f.object_code} v{f.version}", "object_code": f.object_code}
            for f in MetadataForm.objects.all()[:50]
        ]
        workflows = [
            {"id": str(w.id), "name": w.name, "version": w.version}
            for w in WorkflowDefinition.objects.all()[:50]
        ]
        return Response(
            {
                "roles": roles,
                "modules": modules,
                "matrix": matrix,
                "forms": forms,
                "workflows": workflows,
            }
        )


class ProcessView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        templates = []
        stages = []
        if org:
            for pd in ProcessDefinition.objects.filter(organization=org).prefetch_related("stages").order_by("name"):
                templates.append(
                    {
                        "id": str(pd.id),
                        "name": pd.name,
                        "code": pd.code,
                        "status": pd.status,
                    }
                )
                for s in pd.stages.all().order_by("sort_order"):
                    stages.append(
                        {
                            "id": str(s.id),
                            "process_id": str(pd.id),
                            "name": s.name,
                            "sequence": s.sort_order,
                        }
                    )
        return Response({"templates": templates, "stages": stages})


class MediaView(DomainAuthMixin, APIView):
    def get(self, request):
        live = [
            {
                "id": str(s.id),
                "title": s.title,
                "status": s.status,
                "viewers": s.viewer_count_peak or s.viewers.count(),
            }
            for s in LiveStream.objects.all().order_by("-id")[:20]
        ]
        videos = [
            {
                "id": str(a.id),
                "title": a.title,
                "duration": a.duration_sec or 0,
                "type": a.media_type,
            }
            for a in MediaAsset.objects.all().order_by("-created_at")[:50]
        ]
        return Response({"live": live, "videos": videos})


class PaymentsView(DomainAuthMixin, APIView):
    def get(self, request):
        txns = [
            {
                "id": str(t.id),
                "ref": t.external_txn_id or str(t.id)[:8],
                "amount": _dec(t.amount),
                "status": t.status,
                "gateway": t.gateway.code if t.gateway_id else "",
                "created_at": _iso(t.created_at),
            }
            for t in PaymentTransaction.objects.select_related("gateway").order_by("-created_at")[:50]
        ]
        campaigns = [
            {
                "id": str(c.id),
                "name": c.title,
                "budget": _dec(c.budget),
                "status": c.status,
            }
            for c in AdCampaign.objects.all().order_by("-id")[:30]
        ]
        settled = sum(t["amount"] for t in txns if t["status"] in ("success", "paid", "completed"))
        return Response(
            {
                "transactions": txns,
                "campaigns": campaigns,
                "kpi": {
                    "settled": settled,
                    "pending": sum(t["amount"] for t in txns if t["status"] in ("pending", "processing")),
                    "count": len(txns),
                },
            }
        )


class GovernanceView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        board = []
        meetings = []
        leadership = []
        gov_docs = []
        shareholders = []
        if org:
            board = [
                {
                    "id": str(b.id),
                    "title": b.get_declaration_type_display(),
                    "status": b.status,
                    "signed_at": _iso(b.signed_at),
                }
                for b in BoardDeclaration.objects.filter(organization=org).order_by("-id")[:20]
            ]
            meetings = [
                {
                    "id": str(m.id),
                    "title": m.title,
                    "scheduled_at": _iso(m.scheduled_at),
                    "status": m.status,
                }
                for m in Meeting.objects.filter(organization=org).order_by("-scheduled_at")[:30]
            ]
            from core.services.company_registration_service import (
                serialize_leadership_seat,
                serialize_shareholder,
            )

            leadership = [
                serialize_leadership_seat(s)
                for s in org.leadership_seats.select_related("role_definition").all()
            ]
            shareholders = [serialize_shareholder(s) for s in org.shareholders.all()]
            gov_docs = [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "doc_type": d.doc_type,
                    "status": d.status,
                    "print_url": f"/governance/documents/{d.id}/print/",
                }
                for d in Document.objects.filter(
                    organization=org,
                    doc_type__in=["niyamawali", "prabandhapatra"],
                ).order_by("-created_at")[:20]
            ]
        return Response(
            {
                "board": board,
                "meetings": meetings,
                "resolutions": board,
                "leadership": leadership,
                "shareholders": shareholders,
                "documents": gov_docs,
            }
        )


class AuditView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = AuditLog.objects.select_related("actor").order_by("-created_at")[:100]
        if org and org.tenant_id:
            qs = qs.filter(tenant_id=org.tenant_id)
        results = [
            {
                "id": str(a.id),
                "action": a.action,
                "actor": _actor_name(a.actor),
                "object": f"{a.entity_type}:{a.entity_id}",
                "created_at": _iso(a.created_at),
                "meta": a.after_json or {},
            }
            for a in qs
        ]
        return Response({"results": results})


class AuthKycView(DomainAuthMixin, APIView):
    def get(self, request):
        kycs = [
            {
                "id": str(k.id),
                "user": _user_display(k.user) if k.user_id else str(k.user_id),
                "doc_type": "citizenship",
                "status": k.verification_status,
                "created_at": _iso(k.created_at),
            }
            for k in KYCDocument.objects.select_related("user__profile").order_by("-created_at")[:50]
        ]
        sessions = [
            {
                "id": str(s.id),
                "device": s.device_info or "",
                "ip": str(s.ip or ""),
                "expires_at": _iso(s.expires_at),
            }
            for s in Session.objects.filter(user=request.user).order_by("-expires_at")[:20]
        ]
        return Response({"kycs": kycs, "sessions": sessions})


class ItView(DomainAuthMixin, APIView):
    def get(self, request):
        tickets = [
            {
                "id": str(t.id),
                "subject": t.subject,
                "status": t.status,
                "priority": "medium",
                "created_at": _iso(t.created_at),
            }
            for t in HelpTicket.objects.all().order_by("-created_at")[:50]
        ]
        return Response({"tickets": tickets, "initiatives": [], "services": []})


class DocsView(DomainAuthMixin, APIView):
    def get(self, request):
        docs = [
            {
                "id": str(d.id),
                "title": getattr(d, "title", None) or str(d),
                "type": getattr(d, "doc_type", "") or "document",
                "updated_at": _iso(getattr(d, "updated_at", None) or getattr(d, "created_at", None)),
            }
            for d in Document.objects.all().order_by("-id")[:50]
        ]
        templates = [
            {"id": str(t.id), "name": t.name}
            for t in DocumentTemplate.objects.all()[:30]
        ]
        return Response({"documents": docs, "templates": templates})


class CustomerView(DomainAuthMixin, APIView):
    def get(self, request):
        orders = [
            serialize_commerce_order(o)
            for o in Order.objects.filter(buyer_user=request.user)
            .prefetch_related("items")
            .order_by("-created_at")[:30]
        ]
        addresses = [
            {
                "id": str(a.id),
                "label": a.get_type_display(),
                "line": a.street or a.municipality or "",
                "city": a.district or a.municipality or "",
            }
            for a in request.user.addresses.all()[:10]
        ]
        total = sum(o["total"] for o in orders)
        return Response(
            {
                "orders": orders,
                "addresses": addresses,
                "loyalty": {"tier": "Member", "spend": total},
            }
        )


class RndView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        projects = []
        if org:
            for pd in ProcessDefinition.objects.filter(organization=org).order_by("name")[:30]:
                projects.append(
                    {
                        "id": str(pd.id),
                        "name": pd.name,
                        "status": pd.status,
                        "stage": "development",
                    }
                )
        return Response({"projects": projects})
