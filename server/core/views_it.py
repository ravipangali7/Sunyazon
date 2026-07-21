"""IT & Digital Transformation module APIs — helpdesk tickets and access sessions."""

from __future__ import annotations

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api.views import notify_user
from core.models import HelpTicket, OrgUser, Session, User
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


def _user_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username or str(user.pk)


def _is_super_admin(user) -> bool:
    return bool(user and (user.is_superuser or getattr(user, "account_type", "") == "super_admin"))


def _ticket_qs(org, user):
    """HelpTicket has no organization FK — scope via OrgUser membership."""
    qs = HelpTicket.objects.select_related("user", "user__profile", "assigned_to", "assigned_to__profile")
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(user__org_memberships__organization=org).distinct()


def _session_qs(org, user):
    qs = Session.objects.select_related("user", "user__profile")
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(user__org_memberships__organization=org).distinct()


def _org_member_users(org, *, limit=200):
    if not org:
        return User.objects.none()
    member_ids = OrgUser.objects.filter(
        organization=org, status=OrgUser.Status.ACTIVE
    ).values_list("user_id", flat=True)[:500]
    return (
        User.objects.filter(pk__in=member_ids)
        .select_related("profile")
        .order_by("username")[:limit]
    )


def serialize_ticket(obj: HelpTicket) -> dict:
    return {
        "id": str(obj.id),
        "subject": obj.subject,
        "category": obj.category or "",
        "description": obj.description or "",
        "status": obj.status,
        "user_id": str(obj.user_id) if obj.user_id else None,
        "user_name": _user_name(obj.user) if obj.user_id else "",
        "assigned_to_id": str(obj.assigned_to_id) if obj.assigned_to_id else None,
        "assigned_to_name": _user_name(obj.assigned_to) if obj.assigned_to_id else "",
        "created_at": _iso(obj.created_at) or "",
    }


def serialize_session(obj: Session) -> dict:
    return {
        "id": str(obj.id),
        "user_id": str(obj.user_id) if obj.user_id else None,
        "user_name": _user_name(obj.user) if obj.user_id else "",
        "device_info": obj.device_info or obj.browser or "",
        "ip": str(obj.ip) if obj.ip else "",
        "expires_at": _iso(obj.expires_at) or "",
        "created_at": _iso(obj.created_at) or "",
    }


STATUS_LABELS = {
    HelpTicket.Status.OPEN: "Open",
    HelpTicket.Status.IN_PROGRESS: "In Progress",
    HelpTicket.Status.RESOLVED: "Resolved",
    HelpTicket.Status.CLOSED: "Closed",
}


# ── Overview ─────────────────────────────────────────────────────────────────


class ItOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "open_tickets": 0,
            "avg_open_age_days": 0,
            "active_sessions": 0,
            "by_status": [
                {"name": STATUS_LABELS[s], "code": s, "value": 0}
                for s in HelpTicket.Status.values
            ],
            "by_category": [],
            "recent_tickets": [],
        }
        tickets = _ticket_qs(org, request.user)
        if not _is_super_admin(request.user) and not org:
            return Response(empty)

        status_counts = {
            row["status"]: row["c"]
            for row in tickets.values("status").annotate(c=Count("id"))
        }
        by_status = [
            {
                "name": STATUS_LABELS.get(code, code),
                "code": code,
                "value": status_counts.get(code, 0),
            }
            for code in HelpTicket.Status.values
        ]

        open_statuses = (HelpTicket.Status.OPEN, HelpTicket.Status.IN_PROGRESS)
        open_qs = tickets.filter(status__in=open_statuses)
        open_count = open_qs.count()
        avg_age = 0.0
        if open_count:
            ages = []
            now = timezone.now()
            for created in open_qs.values_list("created_at", flat=True)[:500]:
                if created:
                    ages.append((now - created).total_seconds() / 86400.0)
            if ages:
                avg_age = round(sum(ages) / len(ages), 1)

        by_category = [
            {"name": row["category"] or "Uncategorized", "value": row["c"]}
            for row in tickets.values("category").annotate(c=Count("id")).order_by("-c")[:12]
        ]

        sessions = _session_qs(org, request.user)
        active_sessions = sessions.filter(expires_at__gt=timezone.now()).count()

        recent = [
            serialize_ticket(t)
            for t in tickets.order_by("-created_at")[:5]
        ]

        return Response(
            {
                "open_tickets": open_count,
                "avg_open_age_days": avg_age,
                "active_sessions": active_sessions,
                "by_status": by_status,
                "by_category": by_category,
                "recent_tickets": recent,
            }
        )


# ── Options ──────────────────────────────────────────────────────────────────


class ItOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        tickets = _ticket_qs(org, request.user)
        categories = list(
            tickets.exclude(category="")
            .values_list("category", flat=True)
            .distinct()
            .order_by("category")[:100]
        )
        members = list(_org_member_users(org))
        assignable = [{"id": str(u.id), "name": _user_name(u)} for u in members]
        users = list(assignable)

        return Response(
            {
                "statuses": [
                    {"value": c.value, "label": c.label} for c in HelpTicket.Status
                ],
                "categories": categories,
                "assignable_users": assignable,
                "users": users,
            }
        )


# ── Tickets ──────────────────────────────────────────────────────────────────


class ItTicketsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _ticket_qs(org, request.user)

        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(subject__icontains=search)
                | Q(description__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__profile__full_name__icontains=search)
            )

        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)

        category = (request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category=category)

        assigned_to = (request.query_params.get("assigned_to") or "").strip()
        if assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)

        sort = request.query_params.get("sort") or "-created_at"
        allowed = ("created_at", "subject", "status", "category")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")

        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_ticket(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org and not _is_super_admin(request.user):
            return Response({"detail": "No organization."}, status=400)

        data = request.data
        subject = (data.get("subject") or "").strip()
        if not subject:
            return Response({"detail": "subject is required."}, status=400)

        ticket_user = request.user
        user_id = data.get("user_id")
        if user_id:
            candidate = User.objects.filter(pk=user_id).first()
            if not candidate:
                return Response({"detail": "user_id not found."}, status=400)
            if org and not _is_super_admin(request.user):
                if not OrgUser.objects.filter(organization=org, user=candidate).exists():
                    return Response({"detail": "user_id is not an org member."}, status=400)
            ticket_user = candidate

        assigned_to = None
        assigned_to_id = data.get("assigned_to_id") or data.get("assigned_to")
        if assigned_to_id:
            assigned_to = User.objects.filter(pk=assigned_to_id).first()
            if not assigned_to:
                return Response({"detail": "assigned_to not found."}, status=400)

        status = data.get("status") or HelpTicket.Status.OPEN
        if status not in HelpTicket.Status.values:
            status = HelpTicket.Status.OPEN

        obj = HelpTicket.objects.create(
            user=ticket_user,
            subject=subject,
            category=(data.get("category") or "").strip(),
            description=(data.get("description") or "").strip(),
            status=status,
            assigned_to=assigned_to,
        )
        return Response(
            serialize_ticket(
                HelpTicket.objects.select_related(
                    "user", "user__profile", "assigned_to", "assigned_to__profile"
                ).get(pk=obj.pk)
            ),
            status=201,
        )


class ItTicketDetailView(DomainAuthMixin, APIView):
    def _get(self, request, ticket_id):
        org = resolve_org(request.user)
        return _ticket_qs(org, request.user).filter(pk=ticket_id).first()

    def get(self, request, ticket_id):
        obj = self._get(request, ticket_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_ticket(obj))

    def post(self, request, ticket_id):
        """Workflow actions: assign | start | resolve | close."""
        return self._action(request, ticket_id)

    def patch(self, request, ticket_id):
        data = request.data or {}
        if data.get("action"):
            return self._action(request, ticket_id)

        obj = self._get(request, ticket_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)

        if "subject" in data and data.get("subject"):
            obj.subject = str(data["subject"]).strip()
        if "category" in data:
            obj.category = (data.get("category") or "").strip()
        if "description" in data:
            obj.description = (data.get("description") or "").strip()
        if "status" in data and data["status"] in HelpTicket.Status.values:
            obj.status = data["status"]
        if "assigned_to_id" in data or "assigned_to" in data:
            aid = data.get("assigned_to_id") or data.get("assigned_to")
            obj.assigned_to = User.objects.filter(pk=aid).first() if aid else None
        obj.save()
        return Response(serialize_ticket(self._get(request, ticket_id) or obj))

    def delete(self, request, ticket_id):
        obj = self._get(request, ticket_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})

    def _action(self, request, ticket_id):
        org = resolve_org(request.user)
        obj = self._get(request, ticket_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)

        data = request.data or {}
        action = (data.get("action") or "").strip().lower()
        if action not in ("assign", "start", "resolve", "close"):
            return Response(
                {"detail": "action must be assign, start, resolve, or close."},
                status=400,
            )

        if action == "assign":
            aid = data.get("assigned_to_id") or data.get("assigned_to")
            if not aid:
                return Response({"detail": "assigned_to is required for assign."}, status=400)
            assignee = User.objects.filter(pk=aid).first()
            if not assignee:
                return Response({"detail": "assigned_to not found."}, status=400)
            obj.assigned_to = assignee
            if obj.status == HelpTicket.Status.OPEN:
                obj.status = HelpTicket.Status.IN_PROGRESS
            obj.save(update_fields=["assigned_to", "status"])
            try:
                notify_user(
                    assignee,
                    org=org,
                    ntype="helpdesk.assign",
                    title="Ticket assigned",
                    body=f"You were assigned: {obj.subject}",
                    link="/it#helpdesk",
                    entity_type="help_ticket",
                    entity_id=str(obj.id),
                )
            except Exception:
                pass

        elif action == "start":
            if obj.status not in (HelpTicket.Status.OPEN, HelpTicket.Status.IN_PROGRESS):
                return Response(
                    {"detail": f"Cannot start a ticket in status '{obj.status}'."},
                    status=400,
                )
            obj.status = HelpTicket.Status.IN_PROGRESS
            aid = data.get("assigned_to_id") or data.get("assigned_to")
            if aid:
                assignee = User.objects.filter(pk=aid).first()
                if assignee:
                    obj.assigned_to = assignee
            elif not obj.assigned_to_id:
                obj.assigned_to = request.user
            obj.save(update_fields=["status", "assigned_to"])

        elif action == "resolve":
            if obj.status not in (
                HelpTicket.Status.OPEN,
                HelpTicket.Status.IN_PROGRESS,
                HelpTicket.Status.RESOLVED,
            ):
                return Response(
                    {"detail": f"Cannot resolve a ticket in status '{obj.status}'."},
                    status=400,
                )
            obj.status = HelpTicket.Status.RESOLVED
            obj.save(update_fields=["status"])

        elif action == "close":
            obj.status = HelpTicket.Status.CLOSED
            obj.save(update_fields=["status"])

        obj = self._get(request, ticket_id) or obj
        return Response(serialize_ticket(obj))


# ── Sessions ─────────────────────────────────────────────────────────────────


class ItSessionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _session_qs(org, request.user).order_by("-created_at")

        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(device_info__icontains=search)
                | Q(browser__icontains=search)
                | Q(ip__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__profile__full_name__icontains=search)
            )

        sort = request.query_params.get("sort") or "-expires_at"
        allowed = ("expires_at", "created_at", "ip", "device_info")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-expires_at")

        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_session(i) for i in items], **meta})
