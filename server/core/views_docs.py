"""Documents portal APIs — overview, library documents, templates."""

from __future__ import annotations

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Document, DocumentTemplate
from core.views_domain import DomainAuthMixin, _iso, resolve_org


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


def _choices(choices_cls):
    return [{"value": v, "label": str(l)} for v, l in choices_cls.choices]


def _user_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and getattr(profile, "full_name", None):
        return profile.full_name
    return user.get_full_name() or user.username or ""


def _is_super_admin(user) -> bool:
    return bool(user and (user.is_superuser or getattr(user, "account_type", "") == "super_admin"))


def _document_qs(org, user):
    if not org:
        return Document.objects.none()
    if _is_super_admin(user):
        return Document.objects.filter(Q(organization=org) | Q(organization__isnull=True))
    return Document.objects.filter(organization=org)


def _template_qs(org):
    if not org:
        return DocumentTemplate.objects.filter(
            Q(organization__isnull=True) | Q(is_system_template=True)
        )
    return DocumentTemplate.objects.filter(
        Q(organization=org) | Q(organization__isnull=True) | Q(is_system_template=True)
    )


def serialize_document(obj: Document) -> dict:
    return {
        "id": str(obj.id),
        "organization_id": str(obj.organization_id) if obj.organization_id else None,
        "owner_id": str(obj.owner_id) if obj.owner_id else None,
        "owner_name": _user_name(obj.owner) if obj.owner_id else "",
        "doc_type": obj.doc_type,
        "title": obj.title,
        "content_html": obj.content_html or "",
        "file": obj.file.url if obj.file else None,
        "template_id": str(obj.template_id) if obj.template_id else None,
        "template_name": obj.template.name if obj.template_id else "",
        "version": obj.version,
        "status": obj.status,
        "entity_type": obj.entity_type or "",
        "entity_id": str(obj.entity_id) if obj.entity_id else None,
        "created_by_id": str(obj.created_by_id) if obj.created_by_id else None,
        "created_by_name": _user_name(obj.created_by) if obj.created_by_id else "",
        "published_at": _iso(obj.published_at) or "",
        "created_at": _iso(obj.created_at) or "",
    }


def serialize_template(obj: DocumentTemplate) -> dict:
    return {
        "id": str(obj.id),
        "organization_id": str(obj.organization_id) if obj.organization_id else None,
        "name": obj.name,
        "doc_type": obj.doc_type,
        "template_content": obj.template_content or "",
        "is_system_template": bool(obj.is_system_template),
    }


def serialize_template_option(obj: DocumentTemplate) -> dict:
    return {
        "id": str(obj.id),
        "name": obj.name,
        "doc_type": obj.doc_type,
    }


# ── Overview ─────────────────────────────────────────────────────────────────


class DocsOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "total_documents": 0,
            "draft_count": 0,
            "published_count": 0,
            "archived_count": 0,
            "templates_count": 0,
            "system_templates_count": 0,
            "org_templates_count": 0,
            "published_this_month": 0,
            "by_status": [],
            "by_doc_type": [],
            "recent_documents": [],
        }
        if not org:
            return Response(empty)

        docs = _document_qs(org, request.user)
        templates = _template_qs(org)

        by_status_raw = {
            row["status"]: row["c"]
            for row in docs.values("status").annotate(c=Count("id"))
        }
        by_status = [
            {
                "name": label,
                "code": value,
                "value": by_status_raw.get(value, 0),
            }
            for value, label in Document.Status.choices
        ]

        by_type_raw = {
            row["doc_type"]: row["c"]
            for row in docs.values("doc_type").annotate(c=Count("id"))
        }
        by_doc_type = [
            {
                "name": label,
                "code": value,
                "value": by_type_raw.get(value, 0),
            }
            for value, label in Document.DocType.choices
            if by_type_raw.get(value, 0)
        ]

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        system_templates = templates.filter(
            Q(is_system_template=True) | Q(organization__isnull=True)
        ).distinct()
        org_templates = templates.filter(organization=org)

        recent = list(
            docs.select_related("owner", "created_by", "template")
            .order_by("-created_at")[:5]
        )

        return Response(
            {
                "total_documents": docs.count(),
                "draft_count": by_status_raw.get(Document.Status.DRAFT, 0),
                "published_count": by_status_raw.get(Document.Status.PUBLISHED, 0),
                "archived_count": by_status_raw.get(Document.Status.ARCHIVED, 0),
                "templates_count": templates.distinct().count(),
                "system_templates_count": system_templates.count(),
                "org_templates_count": org_templates.count(),
                "published_this_month": docs.filter(
                    status=Document.Status.PUBLISHED,
                    published_at__gte=month_start,
                ).count(),
                "by_status": by_status,
                "by_doc_type": by_doc_type,
                "recent_documents": [serialize_document(d) for d in recent],
            }
        )


class DocsOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        templates = _template_qs(org).order_by("name")[:200]
        return Response(
            {
                "doc_types": _choices(Document.DocType),
                "statuses": _choices(Document.Status),
                "template_doc_types": _choices(DocumentTemplate.DocType),
                "templates": [serialize_template_option(t) for t in templates],
            }
        )


# ── Documents ────────────────────────────────────────────────────────────────


class DocsDocumentsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _document_qs(org, request.user).select_related(
            "owner", "created_by", "template"
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(content_html__icontains=search)
            )
        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)
        doc_type = (request.query_params.get("doc_type") or "").strip()
        if doc_type:
            qs = qs.filter(doc_type=doc_type)
        sort = request.query_params.get("sort") or "-created_at"
        if sort.lstrip("-") in ("created_at", "title", "status", "doc_type", "published_at", "version"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_document(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)
        doc_type = (data.get("doc_type") or Document.DocType.CUSTOM).strip()
        if doc_type not in Document.DocType.values:
            return Response({"detail": "Invalid doc_type."}, status=400)

        template = None
        template_id = data.get("template_id")
        if template_id:
            template = _template_qs(org).filter(pk=template_id).first()
            if not template:
                return Response({"detail": "Template not found."}, status=400)

        content_html = data.get("content_html")
        if content_html is None or content_html == "":
            content_html = (template.template_content if template else "") or ""
        else:
            content_html = str(content_html)

        obj = Document.objects.create(
            organization=org,
            owner=request.user,
            created_by=request.user,
            doc_type=doc_type,
            title=title,
            content_html=content_html,
            template=template,
            status=Document.Status.DRAFT,
            version=1,
            entity_type=(data.get("entity_type") or "") or "",
            entity_id=data.get("entity_id") or None,
        )
        obj = Document.objects.select_related("owner", "created_by", "template").get(pk=obj.pk)
        return Response(serialize_document(obj), status=201)


class DocsDocumentDetailView(DomainAuthMixin, APIView):
    def _get(self, request, doc_id):
        org = resolve_org(request.user)
        return (
            _document_qs(org, request.user)
            .select_related("owner", "created_by", "template")
            .filter(pk=doc_id)
            .first()
        )

    def get(self, request, doc_id):
        obj = self._get(request, doc_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_document(obj))

    def post(self, request, doc_id):
        obj = self._get(request, doc_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip().lower()
        if action == "publish":
            obj.status = Document.Status.PUBLISHED
            obj.published_at = timezone.now()
            obj.save(update_fields=["status", "published_at"])
        elif action == "archive":
            obj.status = Document.Status.ARCHIVED
            obj.save(update_fields=["status"])
        elif action == "draft":
            obj.status = Document.Status.DRAFT
            obj.save(update_fields=["status"])
        else:
            return Response(
                {"detail": 'action must be "publish", "archive", or "draft".'},
                status=400,
            )
        obj = (
            Document.objects.select_related("owner", "created_by", "template")
            .get(pk=obj.pk)
        )
        return Response(serialize_document(obj))

    def patch(self, request, doc_id):
        obj = self._get(request, doc_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "title" in data and data.get("title") is not None:
            title = str(data.get("title") or "").strip()
            if not title:
                return Response({"detail": "title cannot be empty."}, status=400)
            obj.title = title
        if "content_html" in data:
            obj.content_html = data.get("content_html") or ""
        if "doc_type" in data and data.get("doc_type"):
            doc_type = str(data["doc_type"]).strip()
            if doc_type not in Document.DocType.values:
                return Response({"detail": "Invalid doc_type."}, status=400)
            obj.doc_type = doc_type
        if "template_id" in data:
            tid = data.get("template_id")
            if not tid:
                obj.template = None
            else:
                org = resolve_org(request.user)
                template = _template_qs(org).filter(pk=tid).first()
                if not template:
                    return Response({"detail": "Template not found."}, status=400)
                obj.template = template
        if "version" in data:
            try:
                obj.version = max(1, int(data.get("version")))
            except (TypeError, ValueError):
                pass
        if "status" in data and data["status"] in Document.Status.values:
            obj.status = data["status"]
            if obj.status == Document.Status.PUBLISHED and not obj.published_at:
                obj.published_at = timezone.now()
        if "entity_type" in data:
            obj.entity_type = data.get("entity_type") or ""
        if "entity_id" in data:
            obj.entity_id = data.get("entity_id") or None
        obj.save()
        obj = (
            Document.objects.select_related("owner", "created_by", "template")
            .get(pk=obj.pk)
        )
        return Response(serialize_document(obj))

    def delete(self, request, doc_id):
        obj = self._get(request, doc_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Templates ────────────────────────────────────────────────────────────────


class DocsTemplatesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _template_qs(org)
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        doc_type = (request.query_params.get("doc_type") or "").strip()
        if doc_type:
            qs = qs.filter(doc_type=doc_type)
        sort = request.query_params.get("sort") or "name"
        if sort.lstrip("-") in ("name", "doc_type"):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("name")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_template(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=400)
        doc_type = (data.get("doc_type") or DocumentTemplate.DocType.CUSTOM).strip()
        if doc_type not in DocumentTemplate.DocType.values:
            return Response({"detail": "Invalid doc_type."}, status=400)
        obj = DocumentTemplate.objects.create(
            organization=org,
            name=name,
            doc_type=doc_type,
            template_content=data.get("template_content") or "",
            is_system_template=False,
        )
        return Response(serialize_template(obj), status=201)


class DocsTemplateDetailView(DomainAuthMixin, APIView):
    def _get(self, request, template_id):
        org = resolve_org(request.user)
        return _template_qs(org).filter(pk=template_id).first()

    def get(self, request, template_id):
        obj = self._get(request, template_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_template(obj))

    def patch(self, request, template_id):
        obj = self._get(request, template_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        if obj.is_system_template or obj.organization_id is None:
            return Response({"detail": "System templates cannot be edited."}, status=403)
        org = resolve_org(request.user)
        if org and obj.organization_id != org.id:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "name" in data and data.get("name") is not None:
            name = str(data.get("name") or "").strip()
            if not name:
                return Response({"detail": "name cannot be empty."}, status=400)
            obj.name = name
        if "doc_type" in data and data.get("doc_type"):
            doc_type = str(data["doc_type"]).strip()
            if doc_type not in DocumentTemplate.DocType.values:
                return Response({"detail": "Invalid doc_type."}, status=400)
            obj.doc_type = doc_type
        if "template_content" in data:
            obj.template_content = data.get("template_content") or ""
        obj.save()
        return Response(serialize_template(obj))

    def delete(self, request, template_id):
        obj = self._get(request, template_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        if obj.is_system_template:
            return Response({"detail": "System templates cannot be deleted."}, status=403)
        if obj.organization_id is None:
            return Response({"detail": "System templates cannot be deleted."}, status=403)
        org = resolve_org(request.user)
        if org and obj.organization_id != org.id:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
