"""Quality QA/QC — rules 54–61."""

from __future__ import annotations

from django.db import transaction

from core.services.common import DomainError, notify, status_snapshot, write_audit
from core.services.process_service import quarantine_batch


@transaction.atomic
def record_incoming_inspection(inspection, *, status: str, actor=None, open_ncr: bool = True):
    """
    IncomingInspection pass → update GRN line / GRN qc_status; enable post.
    fail → GRN qc fail|partial; open NCR; block stock IN.
    """
    from core.models import GRN, IncomingInspection

    before = status_snapshot(inspection, ["status"])
    inspection.status = status
    inspection.save(update_fields=["status"])

    grn_line = inspection.grn_line
    if grn_line:
        grn = grn_line.grn
        lines = list(grn.lines.all())
        # Aggregate QC from inspections linked to lines
        statuses = []
        for line in lines:
            insp = IncomingInspection.objects.filter(grn_line=line).order_by("-id").first()
            statuses.append(insp.status if insp else "hold")

        if all(s == "pass" for s in statuses):
            grn.qc_status = GRN.QCStatus.PASS
        elif all(s == "fail" for s in statuses):
            grn.qc_status = GRN.QCStatus.FAIL
        elif any(s == "pass" for s in statuses) and any(s == "fail" for s in statuses):
            grn.qc_status = GRN.QCStatus.PARTIAL
        else:
            grn.qc_status = GRN.QCStatus.PENDING
        grn.save(update_fields=["qc_status"])

        if status == "fail" and open_ncr:
            open_ncr_record(
                organization=grn.organization,
                issue=f"Incoming QC fail for {inspection.material}",
                actor=actor,
            )

    write_audit(actor=actor, entity=inspection, action=f"iqc.{status}", before=before)
    return inspection


@transaction.atomic
def record_inprocess_qc(qc, *, status: str, actor=None, open_ncr: bool = True):
    """InProcessQC fail → hold/fail stage; optional Batch quarantined; NCR."""
    from core.models import InProcessQC, NCR, ProcessRunStage

    before = status_snapshot(qc, ["status"])
    qc.status = status
    qc.save(update_fields=["status"])

    if status == "fail":
        if qc.process_run_stage_id:
            stage = qc.process_run_stage
            stage.status = ProcessRunStage.Status.FAILED
            stage.save(update_fields=["status"])
        if qc.batch_id:
            quarantine_batch(qc.batch, actor=actor)
        if open_ncr:
            org = getattr(qc, "organization", None) or (
                qc.work_order.organization if qc.work_order_id else None
            )
            if org:
                open_ncr_record(
                    organization=org,
                    issue=f"In-process QC fail on stage {qc.process_run_stage_id}",
                    work_order=qc.work_order,
                    process_run_stage=qc.process_run_stage,
                    actor=actor,
                )

    write_audit(actor=actor, entity=qc, action=f"ipqc.{status}", before=before)
    return qc


@transaction.atomic
def final_qa_release(release, *, release_status: str, quality_status: str | None = None, actor=None):
    """
    released → allow FG stock / Dispatch / ecommerce sync.
    held/rejected → block Dispatch; Batch quarantined.
    """
    from core.models import FinalQARelease, LabReport
    from core.services.checkout_service import sync_product_stock_from_fg

    # Gate on lab report fail
    if release.batch_id:
        lab_fail = LabReport.objects.filter(batch=release.batch, status="fail").exists()
        if lab_fail and release_status == FinalQARelease.ReleaseStatus.RELEASED:
            raise DomainError("Lab report failed — cannot release", code="lab_fail")

    before = status_snapshot(release, ["release_status", "quality_status"])
    release.release_status = release_status
    if quality_status:
        release.quality_status = quality_status
    release.save(update_fields=["release_status", "quality_status"] if quality_status else ["release_status"])

    if release_status in {FinalQARelease.ReleaseStatus.HELD, FinalQARelease.ReleaseStatus.REJECTED}:
        if release.batch_id:
            quarantine_batch(release.batch, actor=actor)
    elif release_status == FinalQARelease.ReleaseStatus.RELEASED:
        if release.product_id and release.quantity is not None:
            sync_product_stock_from_fg(product=release.product, fg_qty=release.quantity, actor=actor)
        if release.batch_id and release.batch.status == "quarantined":
            from core.services.process_service import close_batch

            # leave closed after release complete per rule 53
            close_batch(release.batch, actor=actor)

    write_audit(actor=actor, entity=release, action=f"final_qa.{release_status}", before=before)
    return release


@transaction.atomic
def open_ncr_record(
    *,
    organization,
    issue: str,
    department=None,
    work_order=None,
    process_run_stage=None,
    create_capa: bool = False,
    capa_owner=None,
    actor=None,
):
    from core.models import CAPA, NCR
    from django.utils import timezone as tz

    n = NCR.objects.filter(organization=organization).count() + 1
    ncr = NCR.objects.create(
        organization=organization,
        ncr_no=f"NCR-{tz.now():%Y%m%d}-{n:04d}",
        date=tz.localdate(),
        issue=issue,
        department=department,
        work_order=work_order,
        process_run_stage=process_run_stage,
        status=NCR.Status.OPEN,
    )
    capa = None
    if create_capa:
        if capa_owner is None:
            raise DomainError("CAPA owner (Employee) required", code="capa_owner_required")
        c = CAPA.objects.filter(organization=organization).count() + 1
        capa = CAPA.objects.create(
            organization=organization,
            capa_no=f"CAPA-{tz.now():%Y%m%d}-{c:04d}",
            ncr=ncr,
            work_order=work_order,
            owner=capa_owner,
            problem=issue,
            status=CAPA.Status.OPEN,
        )
    write_audit(actor=actor, entity=ncr, action="ncr.opened")
    return ncr, capa


# Backwards-compatible alias
open_ncr = open_ncr_record


@transaction.atomic
def close_capa(capa, *, actor=None, close_ncr: bool = True):
    from core.models import CAPA, NCR

    before = status_snapshot(capa, ["status"])
    capa.status = CAPA.Status.CLOSED
    capa.save(update_fields=["status"])
    if close_ncr and capa.ncr_id:
        ncr = capa.ncr
        ncr.status = NCR.Status.CLOSED
        ncr.save(update_fields=["status"])
    if capa.owner_id and getattr(capa.owner, "user_id", None):
        notify(capa.owner.user, title="CAPA closed", body=capa.problem or "", type="compliance")
    write_audit(actor=actor, entity=capa, action="capa.closed", before=before)
    return capa
