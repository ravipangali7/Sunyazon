"""Search & AI models — query logs, image match, voice, embeddings."""

from __future__ import annotations

from django.db import models

from .base import UUIDPrimaryKeyModel


class SearchQueryLog(UUIDPrimaryKeyModel):
    class QueryType(models.TextChoices):
        TEXT = "text", "Text"
        VOICE = "voice", "Voice"
        IMAGE = "image", "Image"
        SCAN = "scan", "Scan"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="search_queries",
    )
    query_type = models.CharField(max_length=16, choices=QueryType.choices, db_index=True)
    query_text = models.TextField(blank=True)
    image = models.ImageField(upload_to="ai/search_images/", blank=True, null=True)
    voice_audio = models.FileField(upload_to="ai/search_voice/", blank=True, null=True)
    results_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.query_type}: {self.query_text[:40] or self.pk}"


class ImageMatchResult(UUIDPrimaryKeyModel):
    source_image = models.ImageField(upload_to="ai/image_match/", blank=True, null=True)
    matched_product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="image_matches",
    )
    matched_entity_type = models.CharField(max_length=64, blank=True)
    matched_entity_id = models.UUIDField(null=True, blank=True)
    similarity_score = models.DecimalField(max_digits=6, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-similarity_score"]

    def __str__(self):
        return f"Match {self.matched_product or self.matched_entity_type} ({self.similarity_score})"


class VoiceTranscript(UUIDPrimaryKeyModel):
    audio = models.FileField(upload_to="ai/voice/", blank=True, null=True)
    transcript_text = models.TextField(blank=True)
    language = models.CharField(max_length=16, default="ne")
    confidence = models.DecimalField(max_digits=6, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.transcript_text[:60] or f"Transcript {self.pk}"


class EmbeddingIndex(UUIDPrimaryKeyModel):
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.UUIDField(db_index=True)
    title = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    embedding_vector = models.BinaryField(null=True, blank=True)
    indexed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "embedding indexes"
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def __str__(self):
        return f"{self.entity_type}:{self.entity_id}"
