"""Social / media / docs / chat / AI lighter cascades — rules 102–109."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from core.services.common import status_snapshot, write_audit


@transaction.atomic
def publish_feed_post(post, *, actor=None):
    from core.models import FeedPost

    before = status_snapshot(post, ["status", "published_at"])
    post.status = FeedPost.Status.PUBLISHED
    post.published_at = timezone.now()
    post.save(update_fields=["status", "published_at"])
    write_audit(actor=actor, entity=post, action="feed.published", before=before)
    return post


@transaction.atomic
def accept_friendship(friendship, *, actor=None):
    from core.models import Friendship

    before = status_snapshot(friendship, ["status"])
    friendship.status = Friendship.Status.ACCEPTED
    friendship.accepted_at = timezone.now()
    friendship.save(update_fields=["status", "accepted_at"])
    write_audit(actor=actor, entity=friendship, action="friendship.accepted", before=before)
    return friendship


@transaction.atomic
def archive_expired_stories(*, as_of=None, actor=None):
    from core.models import Story

    as_of = as_of or timezone.now()
    count = Story.objects.filter(expires_at__lt=as_of).count()
    return count


@transaction.atomic
def post_chat_message(message, *, actor=None):
    """ChatMessage create → update ChatThread.last_message_at."""
    thread = message.thread
    thread.last_message_at = getattr(message, "created_at", None) or timezone.now()
    thread.save(update_fields=["last_message_at"])
    return message


@transaction.atomic
def end_call_session(session, *, actor=None, create_log_message: bool = True):
    from core.models import CallSession, ChatMessage

    before = status_snapshot(session, ["status"])
    session.status = CallSession.Status.ENDED
    if session.started_at and not session.ended_at:
        session.ended_at = timezone.now()
    update_fields = ["status", "ended_at"]
    if session.started_at and session.ended_at:
        session.duration_sec = int((session.ended_at - session.started_at).total_seconds())
        update_fields.append("duration_sec")
    session.save(update_fields=update_fields)

    if create_log_message and session.thread_id:
        ChatMessage.objects.create(
            thread=session.thread,
            sender=session.caller,
            message_type=ChatMessage.MessageType.CALL_LOG,
            body=f"Call ended ({session.call_type})",
        )
    write_audit(actor=actor, entity=session, action="call.ended", before=before)
    return session


@transaction.atomic
def publish_document(doc, *, actor=None):
    from core.models import Document

    before = status_snapshot(doc, ["status"])
    doc.status = Document.Status.PUBLISHED
    if hasattr(doc, "published_at"):
        doc.published_at = timezone.now()
        doc.save(update_fields=["status", "published_at"])
    else:
        doc.save(update_fields=["status"])
    write_audit(actor=actor, entity=doc, action="document.published", before=before)
    return doc


@transaction.atomic
def upsert_embedding(*, entity_type: str, entity_id, vector, actor=None):
    from core.models import EmbeddingIndex

    obj, _ = EmbeddingIndex.objects.update_or_create(
        entity_type=entity_type,
        entity_id=entity_id,
        defaults={"embedding_vector": vector, "indexed_at": timezone.now()},
    )
    write_audit(actor=actor, entity=obj, action="embedding.upserted")
    return obj


@transaction.atomic
def write_kpi_snapshot(*, organization, kpi_code: str, target, actual, period_date, actor=None):
    from core.models import KPISnapshot
    from decimal import Decimal

    target = Decimal(target)
    actual = Decimal(actual)
    pct = (actual / target * 100) if target else Decimal("0")
    snap = KPISnapshot.objects.create(
        organization=organization,
        kpi_code=kpi_code,
        target=target,
        actual=actual,
        achievement_pct=pct,
        period_date=period_date,
    )
    write_audit(actor=actor, entity=snap, action="kpi.written")
    return snap
