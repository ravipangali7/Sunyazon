"""Domain APIs as function-based views — GET dashboards + service-backed mutations.

Per dynamic.md: UI calls these endpoints; business cascades live in services only.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.authentication import SessionTokenAuthentication
from core.models import (
    Calibration,
    ChatMessage,
    ChatThread,
    Dispatch,
    FeedEngagement,
    FeedPost,
    FinalQARelease,
    InProcessQC,
    ItemMaster,
    JournalVoucher,
    KYCDocument,
    MaintenanceWorkOrder,
    MaterialIssue,
    Notification,
    PipelineDeal,
    ProcessDefinition,
    ProcessRunStage,
    PurchaseOrder,
    PurchaseRequisition,
    SalesOrder,
    StockAdjustment,
    Warehouse,
    WorkOrder,
    GRN,
)
from core.services.common import DomainError
from core.services.crm_service import (
    advance_complaint,
    mark_deal_lost,
    mark_deal_won,
    register_complaint,
)
from core.services.dispatch_service import (
    approve_sales_order,
    cancel_dispatch,
    create_dispatch,
    create_pod,
    mark_dispatch_loaded,
    mark_dispatched,
)
from core.services.finance_service import (
    clear_cheque,
    post_journal_voucher,
    record_purchase_payment,
    record_sales_received,
    reverse_voucher,
)
from core.services.grn_service import issue_material, post_grn, receive_grn
from core.services.kyc_service import verify_kyc
from core.services.maintenance_service import (
    close_maintenance_wo,
    create_pm_work_orders_due,
    record_calibration,
)
from core.services.procurement_service import (
    approve_po,
    approve_pr,
    cancel_po,
    create_reorder_pr,
    reject_pr,
    send_po,
    submit_pr,
)
from core.services.process_dashboard_service import build_process_dashboard
from core.services.process_service import (
    archive_process_definition,
    create_process_definition,
    delete_process_definition,
    duplicate_process_definition,
    install_industry_for_org,
    instantiate_process,
    publish_process_definition,
    release_work_order,
    reorder_process_stages,
    save_process_version,
)
from core.services.qa_service import (
    close_capa,
    final_qa_release,
    open_ncr_record,
    record_incoming_inspection,
    record_inprocess_qc,
)
from core.services.social_service import post_chat_message, publish_feed_post
from core.services.stock_service import approve_stock_adjustment, post_ledger
from core.views_domain import (
    org_filter,
    resolve_org,
    serialize_grn,
    serialize_po,
    serialize_requisition,
)


AUTH = [SessionTokenAuthentication]
PERMS = [IsAuthenticated]


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _org_or_400(request):
    org = resolve_org(request.user)
    if not org:
        return None, Response({"detail": "No organization context."}, status=400)
    return org, None


def _user_display(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username


# ── Process ──────────────────────────────────────────────────────────────────


@api_view(["GET"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def process_dashboard(request):
    """Full Process Engine dashboard (replaces thin ProcessView GET)."""
    selected_id = request.query_params.get("definition_id") or request.query_params.get("selected_id")
    result = build_process_dashboard(request.user, request, selected_id=selected_id)
    if isinstance(result, tuple):
        payload, status = result
        return Response(payload, status=status)
    return Response(result)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def process_action(request):
    """Unified process mutations — matches web `domainApi.processAction`."""
    org, err = _org_or_400(request)
    if err:
        return err

    data = request.data if isinstance(request.data, dict) else {}
    action = (data.get("action") or "").strip()
    definition_id = data.get("definition_id") or data.get("process_definition_id")
    actor = request.user
    selected_id = definition_id

    try:
        if action == "create":
            pd = create_process_definition(org, data=data, actor=actor)
            selected_id = str(pd.id)

        elif action == "duplicate":
            source = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            pd = duplicate_process_definition(source, actor=actor, new_code=data.get("new_code"))
            selected_id = str(pd.id)

        elif action == "save_version":
            source = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            pd = save_process_version(source, actor=actor)
            selected_id = str(pd.id)

        elif action == "archive":
            pd = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            archive_process_definition(pd, actor=actor)
            selected_id = str(pd.id)

        elif action == "publish":
            pd = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            publish_process_definition(pd, actor=actor)
            selected_id = str(pd.id)

        elif action == "delete":
            pd = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            delete_process_definition(pd, actor=actor)
            selected_id = None

        elif action == "reorder_stages":
            pd = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            reorder_process_stages(pd, stage_ids=list(data.get("stage_ids") or []), actor=actor)
            selected_id = str(pd.id)

        elif action == "instantiate":
            def_id = data.get("process_definition_id") or definition_id
            pd = get_object_or_404(ProcessDefinition, pk=def_id, organization=org)
            wo, run, _ = instantiate_process(org, process_definition=pd, data=data, actor=actor)
            selected_id = str(pd.id)
            dash = build_process_dashboard(request.user, request, selected_id=selected_id)
            if isinstance(dash, tuple):
                return Response(dash[0], status=dash[1])
            return Response(
                {
                    "ok": True,
                    "action": action,
                    "definition_id": selected_id,
                    "work_order_id": str(wo.id),
                    "run_id": str(run.id) if run else None,
                    "dashboard": dash,
                }
            )

        elif action == "install_industry":
            install_industry_for_org(
                org,
                template_id=data.get("industry_template_id") or data.get("template_id"),
                template_code=data.get("template_code"),
                actor=actor,
            )

        elif action == "update":
            pd = get_object_or_404(ProcessDefinition, pk=definition_id, organization=org)
            for field in ("name", "description", "output_type", "status"):
                if field in data and data[field] is not None:
                    setattr(pd, field, data[field])
            pd.save()
            selected_id = str(pd.id)

        elif action == "release_work_order":
            wo = get_object_or_404(WorkOrder, pk=data.get("work_order_id"), organization=org)
            release_work_order(wo, actor=actor, run_no=data.get("run_no"))

        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)

    except DomainError as exc:
        return _domain_error(exc)

    dash = build_process_dashboard(request.user, request, selected_id=selected_id)
    if isinstance(dash, tuple):
        return Response(dash[0], status=dash[1])
    return Response({"ok": True, "action": action, "definition_id": selected_id, "dashboard": dash})


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def work_order_action(request, wo_id):
    org, err = _org_or_400(request)
    if err:
        return err
    wo = get_object_or_404(WorkOrder, pk=wo_id, organization=org)
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
                }
            )
        return Response({"detail": f"Unknown action: {action}"}, status=400)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def process_run_stage_action(request, stage_id):
    from core.services.process_service import complete_run_stage, start_run_stage

    org, err = _org_or_400(request)
    if err:
        return err
    stage = get_object_or_404(
        ProcessRunStage.objects.select_related("run"),
        pk=stage_id,
        run__organization=org,
    )
    action = (request.data.get("action") or "").strip()
    try:
        if action == "start":
            start_run_stage(stage, actor=request.user)
        elif action == "complete":
            complete_run_stage(stage, actor=request.user)
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        stage.refresh_from_db()
        return Response({"ok": True, "id": str(stage.id), "status": stage.status})
    except DomainError as exc:
        return _domain_error(exc)


# ── Procurement / GRN / Stock ─────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def procurement_pr_action(request, pr_id):
    org, err = _org_or_400(request)
    if err:
        return err
    pr = get_object_or_404(PurchaseRequisition, pk=pr_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "submit":
            submit_pr(pr, actor=request.user)
        elif action == "approve":
            approve_pr(pr, actor=request.user, spawn_po=bool(request.data.get("spawn_po", True)))
        elif action == "reject":
            reject_pr(pr, actor=request.user, reason=request.data.get("reason") or "")
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        pr.refresh_from_db()
        return Response(serialize_requisition(pr))
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def procurement_po_action(request, po_id):
    org, err = _org_or_400(request)
    if err:
        return err
    po = get_object_or_404(PurchaseOrder, pk=po_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "approve":
            approve_po(po, actor=request.user)
        elif action == "send":
            send_po(po, actor=request.user)
        elif action == "cancel":
            cancel_po(po, actor=request.user)
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        po.refresh_from_db()
        return Response(serialize_po(po))
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def procurement_grn_action(request, grn_id):
    org, err = _org_or_400(request)
    if err:
        return err
    grn = get_object_or_404(GRN, pk=grn_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "receive":
            receive_grn(grn, received_by=request.user, actor=request.user)
        elif action == "post":
            wh_id = request.data.get("warehouse_id")
            warehouse = None
            if wh_id:
                warehouse = get_object_or_404(Warehouse, pk=wh_id, organization=org)
            else:
                warehouse = Warehouse.objects.filter(organization=org).order_by("id").first()
            if not warehouse:
                return Response({"detail": "warehouse_id required (no warehouse found)."}, status=400)
            post_grn(grn, warehouse=warehouse, actor=request.user)
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        grn.refresh_from_db()
        return Response(serialize_grn(grn))
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def stock_reorder_pr(request):
    """Low-stock → create reorder PR via procurement_service."""
    org, err = _org_or_400(request)
    if err:
        return err
    item_id = request.data.get("item_id")
    item = get_object_or_404(ItemMaster, pk=item_id, organization=org)
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


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def stock_ledger_post(request):
    org, err = _org_or_400(request)
    if err:
        return err
    item = get_object_or_404(ItemMaster, pk=request.data.get("item_id"), organization=org)
    warehouse = get_object_or_404(Warehouse, pk=request.data.get("warehouse_id"), organization=org)
    try:
        entry = post_ledger(
            organization=org,
            item=item,
            warehouse=warehouse,
            transaction_type=request.data.get("transaction_type") or "adjust",
            qty=_decimal(request.data.get("qty")),
            reference_type=request.data.get("reference_type") or "",
            reference_id=request.data.get("reference_id"),
            actor=request.user,
        )
        return Response({"ok": True, "id": str(entry.id)}, status=201)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def stock_adjustment_approve(request, adjustment_id):
    org, err = _org_or_400(request)
    if err:
        return err
    adj = get_object_or_404(StockAdjustment, pk=adjustment_id, organization=org)
    try:
        approve_stock_adjustment(adj, approved_by=request.user, actor=request.user)
        return Response({"ok": True, "id": str(adj.id)})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def material_issue_action(request, issue_id):
    org, err = _org_or_400(request)
    if err:
        return err
    issue = get_object_or_404(MaterialIssue, pk=issue_id, organization=org)
    action = (request.data.get("action") or "issue").strip()
    try:
        if action == "issue":
            issue_material(issue, actor=request.user)
            return Response({"ok": True, "id": str(issue.id)})
        return Response({"detail": f"Unknown action: {action}"}, status=400)
    except DomainError as exc:
        return _domain_error(exc)


# ── Quality ───────────────────────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def quality_qc_action(request, qc_id):
    org, err = _org_or_400(request)
    if err:
        return err
    qc = get_object_or_404(InProcessQC, pk=qc_id, organization=org)
    status = (request.data.get("status") or request.data.get("action") or "").strip()
    if status not in ("pass", "fail", "hold", "pending"):
        return Response({"detail": "status must be pass|fail|hold|pending"}, status=400)
    try:
        record_inprocess_qc(qc, status=status, actor=request.user)
        qc.refresh_from_db()
        return Response({"ok": True, "id": str(qc.id), "status": qc.status})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def quality_release_action(request, release_id):
    org, err = _org_or_400(request)
    if err:
        return err
    release = get_object_or_404(FinalQARelease, pk=release_id, organization=org)
    release_status = (request.data.get("release_status") or request.data.get("action") or "").strip()
    # Accept UI aliases
    alias = {"release": "released", "hold": "held", "reject": "rejected"}
    release_status = alias.get(release_status, release_status)
    if release_status not in ("held", "released", "rejected"):
        return Response({"detail": "release_status must be held|released|rejected"}, status=400)
    try:
        final_qa_release(
            release,
            release_status=release_status,
            quality_status=request.data.get("quality_status"),
            actor=request.user,
        )
        release.refresh_from_db()
        return Response(
            {
                "ok": True,
                "id": str(release.id),
                "release_status": release.release_status,
            }
        )
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def quality_ncr_create(request):
    org, err = _org_or_400(request)
    if err:
        return err
    try:
        ncr, capa = open_ncr_record(
            organization=org,
            issue=request.data.get("issue") or "",
            create_capa=bool(request.data.get("create_capa")),
            capa_owner=None,
            actor=request.user,
        )
        payload = {"ok": True, "id": str(ncr.id)}
        if capa:
            payload["capa_id"] = str(capa.id)
        return Response(payload, status=201)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def quality_capa_close(request, capa_id):
    from core.models import CAPA

    org, err = _org_or_400(request)
    if err:
        return err
    capa = get_object_or_404(CAPA, pk=capa_id, organization=org)
    try:
        close_capa(capa, actor=request.user)
        return Response({"ok": True, "id": str(capa.id)})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def quality_incoming_action(request, inspection_id):
    from core.models import IncomingInspection

    org, err = _org_or_400(request)
    if err:
        return err
    insp = get_object_or_404(IncomingInspection, pk=inspection_id, organization=org)
    status = (request.data.get("status") or request.data.get("action") or "").strip()
    try:
        record_incoming_inspection(insp, status=status, actor=request.user)
        insp.refresh_from_db()
        return Response({"ok": True, "id": str(insp.id), "status": insp.status})
    except DomainError as exc:
        return _domain_error(exc)


# ── Sales / Logistics ─────────────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def sales_order_action(request, so_id):
    org, err = _org_or_400(request)
    if err:
        return err
    so = get_object_or_404(SalesOrder, pk=so_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "approve":
            approve_sales_order(so, actor=request.user)
            so.refresh_from_db()
            return Response({"ok": True, "id": str(so.id), "status": so.status})
        return Response({"detail": f"Unknown action: {action}"}, status=400)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def logistics_dispatch_action(request, dispatch_id=None):
    org, err = _org_or_400(request)
    if err:
        return err
    action = (request.data.get("action") or "").strip()
    try:
        if action == "create" or (dispatch_id is None and not action):
            from core.models import Employee, Vehicle

            so = get_object_or_404(SalesOrder, pk=request.data.get("sales_order_id"), organization=org)
            vehicle = get_object_or_404(Vehicle, pk=request.data.get("vehicle_id"), organization=org)
            warehouse = get_object_or_404(Warehouse, pk=request.data.get("warehouse_id"), organization=org)
            driver = get_object_or_404(Employee, pk=request.data.get("driver_id"), organization=org)
            dispatch = create_dispatch(
                sales_order=so,
                vehicle=vehicle,
                driver=driver,
                warehouse=warehouse,
                actor=request.user,
            )
            return Response({"ok": True, "id": str(dispatch.id), "status": dispatch.status}, status=201)

        dispatch = get_object_or_404(Dispatch, pk=dispatch_id, organization=org)
        if action == "load":
            mark_dispatch_loaded(dispatch, actor=request.user)
        elif action == "dispatch":
            wh_id = request.data.get("warehouse_id")
            warehouse = (
                get_object_or_404(Warehouse, pk=wh_id, organization=org)
                if wh_id
                else Warehouse.objects.filter(organization=org).order_by("id").first()
            )
            if not warehouse:
                return Response({"detail": "warehouse_id required."}, status=400)
            mark_dispatched(dispatch, warehouse=warehouse, actor=request.user)
        elif action == "pod":
            create_pod(
                dispatch,
                signature=request.data.get("signature") or "",
                received_by=request.data.get("received_by") or "",
                actor=request.user,
            )
        elif action == "cancel":
            cancel_dispatch(dispatch, actor=request.user)
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        dispatch.refresh_from_db()
        return Response({"ok": True, "id": str(dispatch.id), "status": dispatch.status})
    except DomainError as exc:
        return _domain_error(exc)


# ── Finance ───────────────────────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def finance_voucher_action(request, voucher_id):
    org, err = _org_or_400(request)
    if err:
        return err
    voucher = get_object_or_404(JournalVoucher, pk=voucher_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "post":
            post_journal_voucher(voucher, actor=request.user)
        elif action == "reverse":
            reverse_voucher(voucher, actor=request.user)
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        voucher.refresh_from_db()
        return Response({"ok": True, "id": str(voucher.id), "status": voucher.status})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def finance_payment_action(request):
    """Record purchase payment or sales receipt."""
    org, err = _org_or_400(request)
    if err:
        return err
    kind = (request.data.get("kind") or request.data.get("action") or "").strip()
    try:
        if kind in ("purchase_payment", "pay_ap"):
            from core.models import PurchasePayment

            payment = get_object_or_404(
                PurchasePayment, pk=request.data.get("payment_id"), purchase__organization=org
            )
            record_purchase_payment(payment, actor=request.user)
            return Response({"ok": True, "id": str(payment.id)})
        if kind in ("sales_received", "receipt"):
            from core.models import SalesReceived

            receipt = get_object_or_404(
                SalesReceived, pk=request.data.get("receipt_id"), sales__organization=org
            )
            record_sales_received(receipt, actor=request.user)
            return Response({"ok": True, "id": str(receipt.id)})
        if kind == "clear_cheque":
            from core.models import IssueCheque

            cheque = get_object_or_404(IssueCheque, pk=request.data.get("cheque_id"), organization=org)
            clear_cheque(cheque, cleared=bool(request.data.get("cleared", True)), actor=request.user)
            return Response({"ok": True, "id": str(cheque.id)})
        return Response({"detail": f"Unknown kind: {kind}"}, status=400)
    except DomainError as exc:
        return _domain_error(exc)


# ── CRM ───────────────────────────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def crm_deal_action(request, deal_id):
    org, err = _org_or_400(request)
    if err:
        return err
    deal = get_object_or_404(PipelineDeal, pk=deal_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "won":
            mark_deal_won(deal, actor=request.user)
        elif action == "lost":
            mark_deal_lost(deal, actor=request.user, notes=request.data.get("notes") or "")
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        deal.refresh_from_db()
        return Response({"ok": True, "id": str(deal.id), "stage": deal.stage})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def crm_complaint_action(request, complaint_id=None):
    from core.models import Complaint, User

    org, err = _org_or_400(request)
    if err:
        return err
    action = (request.data.get("action") or "").strip()
    try:
        if complaint_id is None or action == "register":
            customer_id = request.data.get("customer_id")
            customer = (
                User.objects.filter(pk=customer_id).first()
                if customer_id
                else request.user
            )
            description = (
                request.data.get("description")
                or request.data.get("issue")
                or request.data.get("subject")
                or ""
            ).strip()
            if not description:
                return Response({"detail": "description is required"}, status=400)
            complaint = Complaint.objects.create(
                organization=org,
                customer=customer,
                description=description,
                status=Complaint.Status.REGISTERED,
            )
            register_complaint(complaint, actor=request.user)
            return Response({"ok": True, "id": str(complaint.id)}, status=201)
        complaint = get_object_or_404(Complaint, pk=complaint_id, organization=org)
        if action == "advance":
            advance_complaint(
                complaint,
                status=request.data.get("status") or "investigating",
                actor=request.user,
            )
        else:
            return Response({"detail": f"Unknown action: {action}"}, status=400)
        complaint.refresh_from_db()
        return Response({"ok": True, "id": str(complaint.id), "status": complaint.status})
    except DomainError as exc:
        return _domain_error(exc)


# ── Maintenance ───────────────────────────────────────────────────────────────


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def maintenance_wo_action(request, wo_id):
    org, err = _org_or_400(request)
    if err:
        return err
    wo = get_object_or_404(MaintenanceWorkOrder, pk=wo_id, organization=org)
    action = (request.data.get("action") or "").strip()
    try:
        if action == "close":
            close_maintenance_wo(wo, actor=request.user)
            wo.refresh_from_db()
            return Response({"ok": True, "id": str(wo.id), "status": wo.status})
        return Response({"detail": f"Unknown action: {action}"}, status=400)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def maintenance_pm_generate(request):
    try:
        created = create_pm_work_orders_due(actor=request.user)
        count = len(created) if isinstance(created, (list, tuple)) else int(created or 0)
        return Response({"ok": True, "created": count})
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def maintenance_calibration(request, calibration_id=None):
    org, err = _org_or_400(request)
    if err:
        return err
    try:
        if calibration_id:
            cal = get_object_or_404(Calibration, pk=calibration_id, equipment__organization=org)
        else:
            cal = get_object_or_404(
                Calibration, pk=request.data.get("calibration_id"), equipment__organization=org
            )
        record_calibration(cal, actor=request.user)
        return Response({"ok": True, "id": str(cal.id)})
    except DomainError as exc:
        return _domain_error(exc)


# ── Social / Chat / Feed / KYC / Notifications ────────────────────────────────


@api_view(["GET", "POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def chat_messages(request, thread_id):
    """GET messages; POST body to persist via social_service."""
    thread = get_object_or_404(ChatThread, pk=thread_id)
    # Access: participant or creator
    is_member = (
        thread.created_by_id == request.user.id
        or thread.participants.filter(user=request.user, left_at__isnull=True).exists()
    )
    if not is_member and not request.user.is_superuser:
        return Response({"detail": "Not a participant."}, status=403)

    if request.method == "GET":
        from core.views_domain import _iso

        qs = thread.messages.select_related("sender__profile").order_by("created_at")[:200]
        results = [
            {
                "id": str(m.id),
                "sender": _user_display(m.sender),
                "body": m.body,
                "mine": m.sender_id == request.user.id,
                "created_at": _iso(m.created_at) or "",
            }
            for m in qs
        ]
        return Response({"results": results})

    body = (request.data.get("body") or "").strip()
    if not body:
        return Response({"detail": "body is required"}, status=400)
    msg = ChatMessage.objects.create(
        thread=thread,
        sender=request.user,
        message_type=ChatMessage.MessageType.TEXT,
        body=body,
    )
    post_chat_message(msg, actor=request.user)
    from core.views_domain import _iso

    return Response(
        {
            "id": str(msg.id),
            "sender": _user_display(request.user),
            "body": msg.body,
            "mine": True,
            "created_at": _iso(msg.created_at) or "",
        },
        status=201,
    )


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def feed_engage(request, post_id):
    post = get_object_or_404(FeedPost, pk=post_id)
    eng_type = (request.data.get("type") or request.data.get("action") or "like").strip()
    valid = {c.value for c in FeedEngagement.EngagementType}
    if eng_type not in valid:
        return Response({"detail": f"type must be one of {sorted(valid)}"}, status=400)

    if eng_type == "like":
        existing = FeedEngagement.objects.filter(
            post=post, user=request.user, type=FeedEngagement.EngagementType.LIKE
        ).first()
        if existing:
            existing.delete()
            liked = False
        else:
            FeedEngagement.objects.create(
                post=post, user=request.user, type=FeedEngagement.EngagementType.LIKE
            )
            liked = True
        likes = post.engagements.filter(type="like").count()
        return Response({"ok": True, "liked": liked, "likes": likes})

    FeedEngagement.objects.create(
        post=post,
        user=request.user,
        type=eng_type,
        comment_text=request.data.get("comment_text") or "",
    )
    return Response(
        {
            "ok": True,
            "type": eng_type,
            "likes": post.engagements.filter(type="like").count(),
            "comments": post.engagements.filter(type="comment").count(),
        },
        status=201,
    )


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def feed_publish(request):
    org, _ = _org_or_400(request)
    post = FeedPost.objects.create(
        author_type=FeedPost.AuthorType.USER,
        author_user=request.user,
        author_organization=org,
        post_type=request.data.get("post_type") or FeedPost.PostType.THOUGHT,
        title=request.data.get("title") or "",
        body=request.data.get("body") or "",
        status=FeedPost.Status.DRAFT,
    )
    try:
        publish_feed_post(post, actor=request.user)
        return Response({"ok": True, "id": str(post.id)}, status=201)
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def auth_kyc_verify(request, kyc_id):
    kyc = get_object_or_404(KYCDocument, pk=kyc_id)
    approved = request.data.get("approved")
    if approved is None:
        action = (request.data.get("action") or "").strip()
        approved = action in ("verify", "approve", "verified")
        if action in ("reject", "rejected"):
            approved = False
    try:
        verify_kyc(
            kyc,
            approved=bool(approved),
            verified_by=request.user,
            rejection_reason=request.data.get("rejection_reason") or "",
            actor=request.user,
        )
        kyc.refresh_from_db()
        return Response(
            {
                "ok": True,
                "id": str(kyc.id),
                "status": getattr(kyc, "verification_status", None) or getattr(kyc, "status", ""),
            }
        )
    except DomainError as exc:
        return _domain_error(exc)


@api_view(["POST"])
@authentication_classes(AUTH)
@permission_classes(PERMS)
def notification_mark_read(request, notification_id=None):
    if notification_id:
        n = get_object_or_404(Notification, pk=notification_id, user=request.user)
        n.is_read = True
        n.save(update_fields=["is_read"])
        return Response({"ok": True, "id": str(n.id)})
    # mark all
    updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({"ok": True, "updated": updated})
