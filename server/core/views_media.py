"""Media & Live module APIs — assets, live streams, playlists."""

from __future__ import annotations

import uuid

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import LiveStream, MediaAsset, MediaPlaylist, OrgUser, PlaylistItem
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


def _is_super_admin(user) -> bool:
    return bool(user and (user.is_superuser or getattr(user, "account_type", "") == "super_admin"))


def _org_member_ids(org):
    if not org:
        return []
    return list(
        OrgUser.objects.filter(organization=org, status=OrgUser.Status.ACTIVE).values_list(
            "user_id", flat=True
        )[:2000]
    )


def _user_name(user) -> str:
    if not user:
        return ""
    profile = getattr(user, "profile", None)
    if profile and profile.full_name:
        return profile.full_name
    return user.get_full_name() or user.username or str(user.pk)


def _asset_qs(org, user):
    qs = MediaAsset.objects.select_related("owner_user", "owner_user__profile", "owner_organization")
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    member_ids = _org_member_ids(org)
    return qs.filter(
        Q(owner_organization=org) | Q(owner_user_id__in=member_ids)
    ).distinct()


def _live_qs(org, user):
    qs = LiveStream.objects.select_related("host", "host__profile")
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(host_id__in=_org_member_ids(org)).distinct()


def _playlist_qs(org, user):
    qs = MediaPlaylist.objects.select_related("owner", "owner__profile").prefetch_related(
        "items", "items__media_asset"
    )
    if _is_super_admin(user):
        return qs
    if not org:
        return qs.none()
    return qs.filter(owner_id__in=_org_member_ids(org)).distinct()


def _parse_dt(value):
    if not value:
        return None
    if hasattr(value, "year") and hasattr(value, "hour"):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    # datetime-local often omits seconds
    if len(raw) == 16 and "T" in raw:
        raw = f"{raw}:00"
    dt = parse_datetime(raw)
    if dt is None and len(raw) == 10:
        dt = parse_datetime(f"{raw}T00:00:00")
    if dt and timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _unique_stream_key() -> str:
    for _ in range(8):
        key = uuid.uuid4().hex
        if not LiveStream.objects.filter(stream_key=key).exists():
            return key
    return uuid.uuid4().hex + uuid.uuid4().hex[:8]


def serialize_asset(obj: MediaAsset) -> dict:
    return {
        "id": str(obj.id),
        "owner_type": obj.owner_type,
        "owner_user_id": str(obj.owner_user_id) if obj.owner_user_id else None,
        "owner_user_name": _user_name(obj.owner_user) if obj.owner_user_id else "",
        "owner_organization_id": str(obj.owner_organization_id) if obj.owner_organization_id else None,
        "media_type": obj.media_type,
        "title": obj.title,
        "description": obj.description or "",
        "file": obj.file.url if obj.file else "",
        "thumbnail": obj.thumbnail.url if obj.thumbnail else "",
        "duration_sec": obj.duration_sec,
        "width": obj.width,
        "height": obj.height,
        "file_size": obj.file_size or 0,
        "processing_status": obj.processing_status,
        "view_count": obj.view_count or 0,
        "like_count": obj.like_count or 0,
        "created_at": _iso(obj.created_at) or "",
    }


def serialize_live(obj: LiveStream) -> dict:
    return {
        "id": str(obj.id),
        "host_id": str(obj.host_id) if obj.host_id else None,
        "host_name": _user_name(obj.host) if obj.host_id else "",
        "title": obj.title,
        "description": obj.description or "",
        "thumbnail": obj.thumbnail.url if obj.thumbnail else "",
        "stream_key": obj.stream_key,
        "webrtc_room_id": obj.webrtc_room_id or "",
        "status": obj.status,
        "scheduled_at": _iso(obj.scheduled_at) or "",
        "started_at": _iso(obj.started_at) or "",
        "ended_at": _iso(obj.ended_at) or "",
        "viewer_count_peak": obj.viewer_count_peak or 0,
        "recording": obj.recording.url if obj.recording else "",
    }


def serialize_playlist_item(item: PlaylistItem) -> dict:
    asset = item.media_asset
    return {
        "id": str(item.id),
        "media_asset_id": str(item.media_asset_id),
        "title": asset.title if asset else "",
        "media_type": asset.media_type if asset else "",
        "sort_order": item.sort_order,
    }


def serialize_playlist(obj: MediaPlaylist, *, include_items=False) -> dict:
    items = []
    if include_items:
        items = [
            serialize_playlist_item(i)
            for i in obj.items.select_related("media_asset").order_by("sort_order", "id")
        ]
    else:
        items = []
    return {
        "id": str(obj.id),
        "owner_id": str(obj.owner_id) if obj.owner_id else None,
        "owner_name": _user_name(obj.owner) if obj.owner_id else "",
        "title": obj.title,
        "description": obj.description or "",
        "is_public": bool(obj.is_public),
        "item_count": obj.items.count() if hasattr(obj, "items") else 0,
        "items": items if include_items else None,
    }


def _set_playlist_items(playlist: MediaPlaylist, item_ids, asset_qs):
    if item_ids is None:
        return
    if not isinstance(item_ids, (list, tuple)):
        return
    seen = set()
    ordered = []
    for raw in item_ids:
        if not raw:
            continue
        sid = str(raw)
        if sid in seen:
            continue
        seen.add(sid)
        ordered.append(sid)
    assets = {
        str(a.id): a
        for a in asset_qs.filter(pk__in=ordered)
    }
    playlist.items.all().delete()
    bulk = []
    for idx, aid in enumerate(ordered):
        asset = assets.get(aid)
        if not asset:
            continue
        bulk.append(
            PlaylistItem(playlist=playlist, media_asset=asset, sort_order=idx)
        )
    if bulk:
        PlaylistItem.objects.bulk_create(bulk)


# ── Overview ─────────────────────────────────────────────────────────────────


class MediaOverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        empty = {
            "total_assets": 0,
            "total_views": 0,
            "playlists_count": 0,
            "by_media_type": [
                {"name": c.label, "code": c.value, "value": 0} for c in MediaAsset.MediaType
            ],
            "by_processing_status": [
                {"name": c.label, "code": c.value, "value": 0}
                for c in MediaAsset.ProcessingStatus
            ],
            "by_live_status": [
                {"name": c.label, "code": c.value, "value": 0} for c in LiveStream.Status
            ],
            "recent_assets": [],
        }
        if not _is_super_admin(request.user) and not org:
            return Response(empty)

        assets = _asset_qs(org, request.user)
        lives = _live_qs(org, request.user)
        playlists = _playlist_qs(org, request.user)

        type_counts = {
            row["media_type"]: row["c"]
            for row in assets.values("media_type").annotate(c=Count("id"))
        }
        proc_counts = {
            row["processing_status"]: row["c"]
            for row in assets.values("processing_status").annotate(c=Count("id"))
        }
        live_counts = {
            row["status"]: row["c"] for row in lives.values("status").annotate(c=Count("id"))
        }
        total_views = assets.aggregate(v=Sum("view_count"))["v"] or 0

        return Response(
            {
                "total_assets": assets.count(),
                "total_views": total_views,
                "playlists_count": playlists.count(),
                "by_media_type": [
                    {
                        "name": c.label,
                        "code": c.value,
                        "value": type_counts.get(c.value, 0),
                    }
                    for c in MediaAsset.MediaType
                ],
                "by_processing_status": [
                    {
                        "name": c.label,
                        "code": c.value,
                        "value": proc_counts.get(c.value, 0),
                    }
                    for c in MediaAsset.ProcessingStatus
                ],
                "by_live_status": [
                    {
                        "name": c.label,
                        "code": c.value,
                        "value": live_counts.get(c.value, 0),
                    }
                    for c in LiveStream.Status
                ],
                "recent_assets": [
                    serialize_asset(a) for a in assets.order_by("-created_at")[:5]
                ],
            }
        )


# ── Options ──────────────────────────────────────────────────────────────────


class MediaOptionsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        assets = _asset_qs(org, request.user).order_by("title")[:200]
        return Response(
            {
                "media_types": [
                    {"value": c.value, "label": c.label} for c in MediaAsset.MediaType
                ],
                "processing_statuses": [
                    {"value": c.value, "label": c.label}
                    for c in MediaAsset.ProcessingStatus
                ],
                "live_statuses": [
                    {"value": c.value, "label": c.label} for c in LiveStream.Status
                ],
                "assets": [
                    {
                        "id": str(a.id),
                        "title": a.title,
                        "media_type": a.media_type,
                    }
                    for a in assets
                ],
            }
        )


# ── Assets ───────────────────────────────────────────────────────────────────


class MediaAssetsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _asset_qs(org, request.user)

        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        media_type = (request.query_params.get("media_type") or "").strip()
        if media_type:
            qs = qs.filter(media_type=media_type)

        processing_status = (request.query_params.get("processing_status") or "").strip()
        if processing_status:
            qs = qs.filter(processing_status=processing_status)

        sort = request.query_params.get("sort") or "-created_at"
        allowed = ("created_at", "title", "media_type", "processing_status", "view_count")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-created_at")

        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_asset(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org and not _is_super_admin(request.user):
            return Response({"detail": "No organization."}, status=400)

        data = request.data
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)

        media_type = data.get("media_type") or MediaAsset.MediaType.VIDEO
        if media_type not in MediaAsset.MediaType.values:
            media_type = MediaAsset.MediaType.VIDEO

        processing_status = data.get("processing_status") or MediaAsset.ProcessingStatus.READY
        if processing_status not in MediaAsset.ProcessingStatus.values:
            processing_status = MediaAsset.ProcessingStatus.READY

        duration_sec = data.get("duration_sec")
        try:
            duration_sec = int(duration_sec) if duration_sec not in (None, "") else None
        except (TypeError, ValueError):
            duration_sec = None

        if org:
            owner_type = MediaAsset.OwnerType.ORGANIZATION
            owner_organization = org
            owner_user = request.user
        else:
            owner_type = MediaAsset.OwnerType.USER
            owner_organization = None
            owner_user = request.user

        obj = MediaAsset.objects.create(
            owner_type=owner_type,
            owner_user=owner_user,
            owner_organization=owner_organization,
            media_type=media_type,
            title=title,
            description=(data.get("description") or "").strip(),
            duration_sec=duration_sec,
            processing_status=processing_status,
        )
        return Response(
            serialize_asset(
                MediaAsset.objects.select_related(
                    "owner_user", "owner_user__profile", "owner_organization"
                ).get(pk=obj.pk)
            ),
            status=201,
        )


class MediaAssetDetailView(DomainAuthMixin, APIView):
    def _get(self, request, asset_id):
        org = resolve_org(request.user)
        return _asset_qs(org, request.user).filter(pk=asset_id).first()

    def get(self, request, asset_id):
        obj = self._get(request, asset_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_asset(obj))

    def patch(self, request, asset_id):
        obj = self._get(request, asset_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "title" in data and data.get("title"):
            obj.title = str(data["title"]).strip()
        if "description" in data:
            obj.description = (data.get("description") or "").strip()
        if "media_type" in data and data["media_type"] in MediaAsset.MediaType.values:
            obj.media_type = data["media_type"]
        if (
            "processing_status" in data
            and data["processing_status"] in MediaAsset.ProcessingStatus.values
        ):
            obj.processing_status = data["processing_status"]
        if "duration_sec" in data:
            try:
                obj.duration_sec = (
                    int(data["duration_sec"])
                    if data.get("duration_sec") not in (None, "")
                    else None
                )
            except (TypeError, ValueError):
                pass
        obj.save()
        return Response(serialize_asset(self._get(request, asset_id) or obj))

    def delete(self, request, asset_id):
        obj = self._get(request, asset_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Live streams ─────────────────────────────────────────────────────────────


class MediaLiveStreamsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _live_qs(org, request.user)

        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        status = (request.query_params.get("status") or "").strip()
        if status:
            qs = qs.filter(status=status)

        sort = request.query_params.get("sort") or "-scheduled_at"
        allowed = ("scheduled_at", "started_at", "title", "status", "viewer_count_peak")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("-scheduled_at", "-started_at")

        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_live(i) for i in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org and not _is_super_admin(request.user):
            return Response({"detail": "No organization."}, status=400)

        data = request.data
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)

        status = data.get("status") or LiveStream.Status.SCHEDULED
        if status not in LiveStream.Status.values:
            status = LiveStream.Status.SCHEDULED

        obj = LiveStream.objects.create(
            host=request.user,
            title=title,
            description=(data.get("description") or "").strip(),
            stream_key=_unique_stream_key(),
            webrtc_room_id=(data.get("webrtc_room_id") or "").strip(),
            status=status,
            scheduled_at=_parse_dt(data.get("scheduled_at")) or timezone.now(),
        )
        return Response(
            serialize_live(
                LiveStream.objects.select_related("host", "host__profile").get(pk=obj.pk)
            ),
            status=201,
        )


class MediaLiveStreamDetailView(DomainAuthMixin, APIView):
    def _get(self, request, stream_id):
        org = resolve_org(request.user)
        return _live_qs(org, request.user).filter(pk=stream_id).first()

    def get(self, request, stream_id):
        obj = self._get(request, stream_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_live(obj))

    def post(self, request, stream_id):
        """Actions: go_live | end."""
        obj = self._get(request, stream_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        action = (request.data.get("action") or "").strip()
        now = timezone.now()
        if action == "go_live":
            obj.status = LiveStream.Status.LIVE
            if not obj.started_at:
                obj.started_at = now
            obj.ended_at = None
            obj.save(update_fields=["status", "started_at", "ended_at"])
        elif action == "end":
            obj.status = LiveStream.Status.ENDED
            if not obj.ended_at:
                obj.ended_at = now
            obj.save(update_fields=["status", "ended_at"])
        else:
            return Response({"detail": "Unknown action. Use go_live or end."}, status=400)
        return Response(serialize_live(self._get(request, stream_id) or obj))

    def patch(self, request, stream_id):
        data = request.data or {}
        if data.get("action"):
            return self.post(request, stream_id)

        obj = self._get(request, stream_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)

        if "title" in data and data.get("title"):
            obj.title = str(data["title"]).strip()
        if "description" in data:
            obj.description = (data.get("description") or "").strip()
        if "webrtc_room_id" in data:
            obj.webrtc_room_id = (data.get("webrtc_room_id") or "").strip()
        if "status" in data and data["status"] in LiveStream.Status.values:
            obj.status = data["status"]
        if "scheduled_at" in data:
            obj.scheduled_at = _parse_dt(data.get("scheduled_at"))
        obj.save()
        return Response(serialize_live(self._get(request, stream_id) or obj))

    def delete(self, request, stream_id):
        obj = self._get(request, stream_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})


# ── Playlists ────────────────────────────────────────────────────────────────


class MediaPlaylistsView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = _playlist_qs(org, request.user)

        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        sort = request.query_params.get("sort") or "title"
        allowed = ("title", "is_public")
        if sort.lstrip("-") in allowed:
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by("title")

        items, meta = _paginate(qs, request)
        return Response(
            {
                "results": [serialize_playlist(i, include_items=False) for i in items],
                **meta,
            }
        )

    def post(self, request):
        org = resolve_org(request.user)
        if not org and not _is_super_admin(request.user):
            return Response({"detail": "No organization."}, status=400)

        data = request.data
        title = (data.get("title") or "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)

        obj = MediaPlaylist.objects.create(
            owner=request.user,
            title=title,
            description=(data.get("description") or "").strip(),
            is_public=bool(data.get("is_public")),
        )
        item_ids = data.get("item_ids")
        if item_ids is not None:
            _set_playlist_items(obj, item_ids, _asset_qs(org, request.user))

        return Response(
            serialize_playlist(
                MediaPlaylist.objects.select_related("owner", "owner__profile")
                .prefetch_related("items", "items__media_asset")
                .get(pk=obj.pk),
                include_items=True,
            ),
            status=201,
        )


class MediaPlaylistDetailView(DomainAuthMixin, APIView):
    def _get(self, request, playlist_id):
        org = resolve_org(request.user)
        return _playlist_qs(org, request.user).filter(pk=playlist_id).first()

    def get(self, request, playlist_id):
        obj = self._get(request, playlist_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_playlist(obj, include_items=True))

    def patch(self, request, playlist_id):
        obj = self._get(request, playlist_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "title" in data and data.get("title"):
            obj.title = str(data["title"]).strip()
        if "description" in data:
            obj.description = (data.get("description") or "").strip()
        if "is_public" in data:
            obj.is_public = bool(data.get("is_public"))
        obj.save()

        if "item_ids" in data:
            org = resolve_org(request.user)
            _set_playlist_items(obj, data.get("item_ids"), _asset_qs(org, request.user))

        return Response(
            serialize_playlist(self._get(request, playlist_id) or obj, include_items=True)
        )

    def delete(self, request, playlist_id):
        obj = self._get(request, playlist_id)
        if not obj:
            return Response({"detail": "Not found."}, status=404)
        obj.delete()
        return Response({"ok": True})
