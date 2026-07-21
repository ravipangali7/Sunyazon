"""Company registration, governance docs, leadership, and HR recruitment APIs."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.authentication import SessionTokenAuthentication
from core.models import (
    Document,
    DocumentTemplate,
    JobApplicant,
    JobVacancy,
    Organization,
    PositionMaster,
    Shareholder,
)
from core.services.auth_service import user_payload
from core.services.common import DomainError
from core.services.company_registration_service import (
    ensure_leadership_role_definitions,
    register_existing_company,
    register_new_company,
    serialize_leadership_seat,
    serialize_organization_registration,
    serialize_shareholder,
)
from core.services.hr_recruitment_service import (
    apply_to_vacancy,
    publish_vacancy,
    review_applicant,
)
from core.views_domain import DomainAuthMixin, _iso, _user_display, org_filter, resolve_org


def _domain_error(exc: DomainError, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_json_list(raw):
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    return []


class CompanyRegistrationOptionsView(APIView):
    """Public options for the registration wizard (account types, modes, templates)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        ensure_leadership_role_definitions()
        from core.models import LeadershipRoleDefinition

        return Response(
            {
                "account_types": [
                    {"value": "default", "label": "Default", "requires_company": False},
                    {"value": "producer", "label": "Producer", "requires_company": True},
                    {"value": "distributor", "label": "Distributor", "requires_company": True},
                    {"value": "wholesaler", "label": "Wholesaler", "requires_company": True},
                    {"value": "retailer", "label": "Retailer", "requires_company": True},
                ],
                "registration_modes": [
                    {
                        "value": "already_registered",
                        "label": "Already Registered Company",
                        "fields": [
                            "pan_number",
                            "registration_certificate",
                            "total_capital",
                            "shareholders",
                            "niyamawali",
                            "prabandhapatra",
                            "share_allocation",
                            "documents",
                        ],
                    },
                    {
                        "value": "new_company",
                        "label": "New Company",
                        "fields": [
                            "total_capital",
                            "shareholders",
                            "niyamawali",
                            "prabandhapatra",
                        ],
                    },
                ],
                "shareholder_fields": [
                    "user",
                    "share_units",
                    "percentage",
                    "is_default",
                    "citizenship_document",
                ],
                "leadership": [
                    {
                        "code": r.code,
                        "name": r.name,
                        "tier": r.tier,
                        "reports_to_code": r.reports_to_code,
                        "department_code": r.department_code,
                        "department_name": r.department_name,
                    }
                    for r in LeadershipRoleDefinition.objects.filter(is_active=True)
                ],
                "document_templates": [
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "doc_type": t.doc_type,
                    }
                    for t in DocumentTemplate.objects.filter(
                        doc_type__in=["niyamawali", "prabandhapatra"],
                        is_system_template=True,
                    )
                ],
            }
        )


class CompanyRegistrationView(APIView):
    """Submit Already Registered / New Company registration for business accounts."""

    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"organization": None, "needs_registration": True})
        return Response(
            {
                "organization": serialize_organization_registration(org),
                "needs_registration": False,
            }
        )

    def post(self, request):
        data = request.data
        account_type = (
            data.get("account_type") or request.user.account_type or ""
        ).strip().lower()
        mode = (data.get("registration_mode") or data.get("mode") or "").strip().lower()
        shareholders = _parse_json_list(data.get("shareholders"))

        try:
            if mode in ("already_registered", Organization.RegistrationMode.ALREADY_REGISTERED):
                org = register_existing_company(
                    user=request.user,
                    account_type=account_type,
                    pan_number=data.get("pan_number") or data.get("vat_pan_no") or "",
                    company_name=data.get("company_name") or "",
                    total_capital=_decimal(data.get("total_capital")),
                    address=data.get("address") or "",
                    official_phone=data.get("official_phone") or "",
                    official_email=data.get("official_email") or "",
                    registration_certificate=data.get("registration_certificate")
                    or request.FILES.get("registration_certificate"),
                    share_allocation_document=data.get("share_allocation_document")
                    or request.FILES.get("share_allocation_document")
                    or request.FILES.get("share_allocation"),
                    shareholders=shareholders,
                    documents=[
                        {
                            "kind": "other",
                            "title": f.name,
                            "file": f,
                        }
                        for key, f in request.FILES.items()
                        if key.startswith("document")
                    ],
                    actor=request.user,
                )
            elif mode in ("new_company", Organization.RegistrationMode.NEW_COMPANY):
                org = register_new_company(
                    user=request.user,
                    account_type=account_type,
                    company_name=data.get("company_name") or "",
                    total_capital=_decimal(data.get("total_capital")),
                    address=data.get("address") or "",
                    official_phone=data.get("official_phone") or "",
                    official_email=data.get("official_email") or "",
                    shareholders=shareholders,
                    actor=request.user,
                )
            else:
                return Response(
                    {
                        "detail": "Choose Already Registered Company or New Company.",
                        "code": "mode_required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except DomainError as exc:
            return _domain_error(exc)

        # Attach citizenship docs from multipart if named shareholder_{i}_citizenship
        for key, f in request.FILES.items():
            if not key.startswith("shareholder_") or not key.endswith("_citizenship"):
                continue
            try:
                idx = int(key.split("_")[1])
            except (IndexError, ValueError):
                continue
            sh_qs = list(org.shareholders.order_by("created_at"))
            if 0 <= idx < len(sh_qs):
                sh = sh_qs[idx]
                sh.citizenship_document = f
                sh.save(update_fields=["citizenship_document"])

        return Response(
            {
                "organization": serialize_organization_registration(org),
                "user": user_payload(request.user),
            },
            status=status.HTTP_201_CREATED,
        )


class CompanyLookupView(APIView):
    """Lookup an already-registered company by PAN."""

    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pan = (request.query_params.get("pan") or "").strip()
        if not pan:
            return Response({"detail": "PAN is required.", "code": "pan_required"}, status=400)
        org = Organization.objects.filter(vat_pan_no__iexact=pan).first()
        if not org:
            return Response({"found": False, "organization": None})
        return Response(
            {
                "found": True,
                "organization": {
                    "id": str(org.id),
                    "company_name": org.company_name,
                    "vat_pan_no": org.vat_pan_no,
                    "account_type": org.account_type,
                    "is_verified": org.is_verified,
                },
            }
        )


class ShareholdersView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"results": []})
        qs = org.shareholders.select_related("user").all()
        return Response({"results": [serialize_shareholder(s) for s in qs]})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        sh = Shareholder.objects.create(
            organization=org,
            user_id=data.get("user_id") or None,
            full_name=data.get("full_name") or "",
            share_units=int(data.get("share_units") or 0),
            percentage=_decimal(data.get("percentage")),
            is_default=bool(data.get("is_default")),
            notes=data.get("notes") or "",
            citizenship_document=request.FILES.get("citizenship_document"),
        )
        return Response(serialize_shareholder(sh), status=201)


class GovernanceDocumentsView(DomainAuthMixin, APIView):
    """Niyamawali / Prabandhapatra — template select, edit, list."""

    def get(self, request):
        org = resolve_org(request.user)
        doc_type = request.query_params.get("doc_type")
        docs_qs = Document.objects.filter(
            doc_type__in=[Document.DocType.NIYAMAWALI, Document.DocType.PRABANDHAPATRA]
        )
        if org:
            docs_qs = docs_qs.filter(organization=org)
        else:
            docs_qs = docs_qs.none()
        if doc_type:
            docs_qs = docs_qs.filter(doc_type=doc_type)

        templates = DocumentTemplate.objects.filter(
            doc_type__in=[DocumentTemplate.DocType.NIYAMAWALI, DocumentTemplate.DocType.PRABANDHAPATRA]
        )
        return Response(
            {
                "documents": [
                    {
                        "id": str(d.id),
                        "title": d.title,
                        "doc_type": d.doc_type,
                        "status": d.status,
                        "content_html": d.content_html,
                        "template_id": str(d.template_id) if d.template_id else None,
                        "version": d.version,
                        "updated_at": _iso(d.created_at),
                        "print_url": f"/governance/documents/{d.id}/print/",
                    }
                    for d in docs_qs.order_by("-created_at")[:50]
                ],
                "templates": [
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "doc_type": t.doc_type,
                        "template_content": t.template_content,
                        "is_system_template": t.is_system_template,
                    }
                    for t in templates
                ],
            }
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        doc_type = data.get("doc_type")
        if doc_type not in (Document.DocType.NIYAMAWALI, Document.DocType.PRABANDHAPATRA):
            return Response({"detail": "doc_type must be niyamawali or prabandhapatra."}, status=400)

        template = None
        tid = data.get("template_id")
        if tid:
            template = DocumentTemplate.objects.filter(pk=tid).first()

        content = data.get("content_html") or ""
        if template and not content:
            content = (template.template_content or "").replace(
                "{{company_name}}", org.company_name
            ).replace("{{pan}}", org.vat_pan_no or "")

        doc = Document.objects.create(
            organization=org,
            owner=request.user,
            created_by=request.user,
            doc_type=doc_type,
            title=data.get("title")
            or f"{doc_type.title()} — {org.company_name}",
            content_html=content,
            template=template,
            status=Document.Status.DRAFT,
            entity_type="organization",
            entity_id=org.pk,
        )
        return Response(
            {
                "id": str(doc.id),
                "title": doc.title,
                "doc_type": doc.doc_type,
                "content_html": doc.content_html,
                "status": doc.status,
            },
            status=201,
        )


class GovernanceDocumentDetailView(DomainAuthMixin, APIView):
    def patch(self, request, doc_id):
        org = resolve_org(request.user)
        doc = Document.objects.filter(pk=doc_id).first()
        if not doc or (org and doc.organization_id != org.id):
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "content_html" in data:
            doc.content_html = data["content_html"]
            doc.version = (doc.version or 1) + 1
        if "title" in data:
            doc.title = data["title"]
        if "status" in data:
            doc.status = data["status"]
        if data.get("template_id"):
            tpl = DocumentTemplate.objects.filter(pk=data["template_id"]).first()
            if tpl:
                doc.template = tpl
                if data.get("apply_template"):
                    doc.content_html = (tpl.template_content or "").replace(
                        "{{company_name}}", org.company_name if org else ""
                    )
        doc.save()
        return Response(
            {
                "id": str(doc.id),
                "title": doc.title,
                "doc_type": doc.doc_type,
                "content_html": doc.content_html,
                "status": doc.status,
                "version": doc.version,
            }
        )

    def get(self, request, doc_id):
        org = resolve_org(request.user)
        doc = Document.objects.filter(pk=doc_id).first()
        if not doc or (org and doc.organization_id and doc.organization_id != org.id):
            return Response({"detail": "Not found."}, status=404)
        return Response(
            {
                "id": str(doc.id),
                "title": doc.title,
                "doc_type": doc.doc_type,
                "content_html": doc.content_html,
                "status": doc.status,
                "version": doc.version,
                "print_url": f"/governance/documents/{doc.id}/print/",
            }
        )


class GovernanceDocumentPrintView(DomainAuthMixin, APIView):
    """Return printable HTML for PDF/print of Niyamawali or Prabandhapatra."""

    def get(self, request, doc_id):
        org = resolve_org(request.user)
        doc = Document.objects.filter(pk=doc_id).first()
        if not doc or (org and doc.organization_id and doc.organization_id != org.id):
            return Response({"detail": "Not found."}, status=404)
        company = org.company_name if org else ""
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{doc.title}</title>
<style>
  body {{ font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; line-height: 1.6; color: #1a1a1a; }}
  h1 {{ font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: .5rem; }}
  .meta {{ color: #666; font-size: .85rem; margin-bottom: 2rem; }}
  @media print {{ body {{ margin: 0; }} .no-print {{ display: none; }} }}
</style></head><body>
<button class="no-print" onclick="window.print()">Print / Save PDF</button>
<h1>{doc.title}</h1>
<div class="meta">{company} · {doc.get_doc_type_display()} · v{doc.version}</div>
<div class="content">{doc.content_html or "<p><em>No content yet.</em></p>"}</div>
</body></html>"""
        from django.http import HttpResponse

        return HttpResponse(html, content_type="text/html; charset=utf-8")


class LeadershipView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        ensure_leadership_role_definitions()
        if not org:
            from core.models import LeadershipRoleDefinition

            return Response(
                {
                    "results": [],
                    "definitions": [
                        {
                            "code": r.code,
                            "name": r.name,
                            "tier": r.tier,
                            "reports_to_code": r.reports_to_code,
                        }
                        for r in LeadershipRoleDefinition.objects.filter(is_active=True)
                    ],
                }
            )
        seats = org.leadership_seats.select_related("role_definition", "user", "employee")
        return Response({"results": [serialize_leadership_seat(s) for s in seats]})

    def patch(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        seat_id = request.data.get("seat_id")
        role_code = request.data.get("role_code")
        seat = None
        if seat_id:
            seat = org.leadership_seats.filter(pk=seat_id).first()
        elif role_code:
            seat = org.leadership_seats.filter(role_definition__code=role_code).first()
        if not seat:
            return Response({"detail": "Leadership seat not found."}, status=404)

        if "user_id" in request.data:
            seat.user_id = request.data.get("user_id") or None
            seat.is_filled = bool(seat.user_id or seat.employee_id)
        if "employee_id" in request.data:
            seat.employee_id = request.data.get("employee_id") or None
            seat.is_filled = bool(seat.user_id or seat.employee_id)
        if "title_override" in request.data:
            seat.title_override = request.data.get("title_override") or ""
        seat.save()
        return Response(serialize_leadership_seat(seat))


def _serialize_vacancy(v, *, include_applicants=False):
    data = {
        "id": str(v.id),
        "vacancy_code": v.vacancy_code,
        "title": v.title,
        "description": v.description,
        "status": v.status,
        "open_date": _iso(v.open_date),
        "close_date": _iso(v.close_date),
        "organization_id": str(v.organization_id),
        "organization_name": v.organization.company_name if v.organization_id else "",
        "position": v.target_position.designation if v.target_position_id else "",
        "position_id": str(v.target_position_id) if v.target_position_id else None,
        "applicant_count": v.applicants.count(),
    }
    if include_applicants:
        data["applicants"] = [_serialize_applicant(a) for a in v.applicants.select_related("user")[:100]]
    return data


def _serialize_applicant(a):
    return {
        "id": str(a.id),
        "vacancy_id": str(a.vacancy_id),
        "vacancy_title": a.vacancy.title if a.vacancy_id else "",
        "user_id": str(a.user_id) if a.user_id else None,
        "full_name": a.full_name,
        "phone": a.phone,
        "email": a.email,
        "exp_years": float(a.exp_years or 0),
        "cv_link": a.cv_link,
        "cover_letter": a.cover_letter,
        "current_stage": a.current_stage,
        "review_notes": a.review_notes,
        "reviewed_at": _iso(a.reviewed_at),
        "applied_at": _iso(getattr(a, "applied_at", None)),
    }


class JobVacanciesView(DomainAuthMixin, APIView):
    """HR: list/create vacancies. Default users: list published vacancies."""

    def get(self, request):
        org = resolve_org(request.user)
        scope = request.query_params.get("scope", "org")
        if scope == "public" or not org:
            qs = (
                JobVacancy.objects.filter(status=JobVacancy.Status.ACTIVE)
                .select_related("organization", "target_position")
                .order_by("-open_date")[:100]
            )
            return Response({"results": [_serialize_vacancy(v) for v in qs]})

        qs = (
            org_filter(
                JobVacancy.objects.select_related("organization", "target_position"),
                org,
            ).order_by("-open_date")[:100]
        )
        return Response({"results": [_serialize_vacancy(v) for v in qs]})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "Title is required."}, status=400)

        position = None
        pid = data.get("position_id") or data.get("target_position_id")
        if pid:
            position = PositionMaster.objects.filter(pk=pid).first()
        if not position:
            designation = data.get("position") or data.get("designation") or title
            position, _ = PositionMaster.objects.get_or_create(
                designation=designation,
                defaults={"department": data.get("department") or "HR"},
            )

        n = JobVacancy.objects.filter(organization=org).count() + 1
        code = data.get("vacancy_code") or f"VAC-{timezone.now():%Y%m%d}-{n:03d}"
        vacancy = JobVacancy.objects.create(
            vacancy_code=code,
            organization=org,
            target_position=position,
            title=title,
            description=data.get("description") or "",
            open_date=data.get("open_date") or timezone.now().date(),
            close_date=data.get("close_date") or None,
            status=JobVacancy.Status.DRAFT,
        )
        if data.get("publish"):
            try:
                publish_vacancy(vacancy, actor=request.user)
            except DomainError as exc:
                return _domain_error(exc)
        return Response(_serialize_vacancy(vacancy), status=201)


class JobVacancyDetailView(DomainAuthMixin, APIView):
    def get(self, request, vacancy_id):
        v = JobVacancy.objects.select_related("organization", "target_position").filter(pk=vacancy_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        org = resolve_org(request.user)
        include = bool(org and org.id == v.organization_id)
        return Response(_serialize_vacancy(v, include_applicants=include))

    def post(self, request, vacancy_id):
        """Publish vacancy (HR action)."""
        v = JobVacancy.objects.filter(pk=vacancy_id).first()
        if not v:
            return Response({"detail": "Not found."}, status=404)
        org = resolve_org(request.user)
        if not org or org.id != v.organization_id:
            return Response({"detail": "Forbidden."}, status=403)
        action = request.data.get("action") or "publish"
        if action == "publish":
            try:
                publish_vacancy(v, actor=request.user)
            except DomainError as exc:
                return _domain_error(exc)
            return Response(_serialize_vacancy(v))
        if action == "close":
            v.status = JobVacancy.Status.CLOSED
            v.save(update_fields=["status"])
            return Response(_serialize_vacancy(v))
        return Response({"detail": "Unknown action."}, status=400)


class JobApplicationsView(DomainAuthMixin, APIView):
    """Default users apply; HR lists applications for org vacancies."""

    def get(self, request):
        org = resolve_org(request.user)
        mine = request.query_params.get("mine") == "1"
        if mine or not org:
            qs = (
                JobApplicant.objects.filter(user=request.user)
                .select_related("vacancy", "vacancy__organization")
                .order_by("-id")[:50]
            )
            return Response({"results": [_serialize_applicant(a) for a in qs]})

        vacancy_id = request.query_params.get("vacancy_id")
        qs = JobApplicant.objects.filter(vacancy__organization=org).select_related(
            "vacancy", "user"
        )
        if vacancy_id:
            qs = qs.filter(vacancy_id=vacancy_id)
        return Response({"results": [_serialize_applicant(a) for a in qs.order_by("-id")[:100]]})

    def post(self, request):
        vacancy_id = request.data.get("vacancy_id")
        vacancy = JobVacancy.objects.filter(pk=vacancy_id).first()
        if not vacancy:
            return Response({"detail": "Vacancy not found."}, status=404)
        try:
            applicant = apply_to_vacancy(
                vacancy,
                user=request.user,
                full_name=request.data.get("full_name") or "",
                phone=request.data.get("phone") or "",
                email=request.data.get("email") or "",
                cover_letter=request.data.get("cover_letter") or "",
                cv_link=request.data.get("cv_link") or "",
                edu_doc=request.FILES.get("edu_doc"),
                exp_years=_decimal(request.data.get("exp_years"), "0"),
                actor=request.user,
            )
        except DomainError as exc:
            return _domain_error(exc)
        return Response(_serialize_applicant(applicant), status=201)


class JobApplicationReviewView(DomainAuthMixin, APIView):
    def post(self, request, applicant_id):
        org = resolve_org(request.user)
        applicant = JobApplicant.objects.select_related("vacancy").filter(pk=applicant_id).first()
        if not applicant:
            return Response({"detail": "Not found."}, status=404)
        if not org or applicant.vacancy.organization_id != org.id:
            return Response({"detail": "Forbidden."}, status=403)
        stage = request.data.get("stage") or request.data.get("action")
        try:
            review_applicant(
                applicant,
                stage=stage,
                review_notes=request.data.get("review_notes") or "",
                reviewer=request.user,
                actor=request.user,
            )
        except DomainError as exc:
            return _domain_error(exc)
        return Response(_serialize_applicant(applicant))
