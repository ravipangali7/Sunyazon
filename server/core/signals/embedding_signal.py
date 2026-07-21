"""Embedding reindex on Product / Document / Knowledge save — thin only."""

from django.db.models.signals import post_save
from django.dispatch import receiver


def _reindex(instance, title_field="name", body_field="description"):
    from core.services.social_service import upsert_embedding

    title = getattr(instance, title_field, "") or getattr(instance, "title", "") or ""
    body = getattr(instance, body_field, "") or getattr(instance, "body", "") or ""
    # Vector left empty until AI pipeline fills it; row marks entity for indexing
    upsert_embedding(
        entity_type=instance.__class__.__name__,
        entity_id=instance.pk,
        vector=None,
    )
    from core.models import EmbeddingIndex

    EmbeddingIndex.objects.filter(
        entity_type=instance.__class__.__name__,
        entity_id=instance.pk,
    ).update(title=str(title)[:255], body=str(body)[:5000])


@receiver(post_save, sender="core.Product")
def reindex_product(sender, instance, **kwargs):
    _reindex(instance, title_field="name", body_field="description")


@receiver(post_save, sender="core.Document")
def reindex_document(sender, instance, **kwargs):
    _reindex(instance, title_field="title", body_field="content_html")
