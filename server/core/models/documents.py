"""Documentation models — documents, templates, blogs."""

from __future__ import annotations

from django.db import models

from .base import UUIDPrimaryKeyModel


class DocumentTemplate(UUIDPrimaryKeyModel):
    class DocType(models.TextChoices):
        MOU = "mou", "MOU"
        AGREEMENT = "agreement", "Agreement"
        MINUTE = "minute", "Minute"
        NIYAMAWALI = "niyamawali", "Niyamawali (Company Regulations)"
        PRABANDHAPATRA = "prabandhapatra", "Prabandhapatra (Memorandum/Articles)"
        CUSTOM = "custom", "Custom"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_templates",
        help_text="Null = system template",
    )
    name = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=32, choices=DocType.choices, db_index=True)
    template_content = models.TextField(blank=True)
    is_system_template = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Document(UUIDPrimaryKeyModel):
    class DocType(models.TextChoices):
        WORD = "word", "Word"
        EXCEL = "excel", "Excel"
        POWERPOINT = "powerpoint", "PowerPoint"
        BLOG = "blog", "Blog"
        NEWS = "news", "News"
        MOU = "mou", "MOU"
        AGREEMENT = "agreement", "Agreement"
        MINUTE = "minute", "Minute"
        NIYAMAWALI = "niyamawali", "Niyamawali (Company Regulations)"
        PRABANDHAPATRA = "prabandhapatra", "Prabandhapatra (Memorandum/Articles)"
        COMPANY_REGISTRATION = "company_registration", "Company Registration Certificate"
        SHARE_ALLOCATION = "share_allocation", "Share Allocation"
        CUSTOM = "custom", "Custom"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    owner = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="owned_documents",
    )
    doc_type = models.CharField(max_length=32, choices=DocType.choices, db_index=True)
    title = models.CharField(max_length=255)
    content_html = models.TextField(blank=True)
    file = models.FileField(upload_to="documents/files/", blank=True, null=True)
    template = models.ForeignKey(
        DocumentTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    entity_type = models.CharField(max_length=64, blank=True)
    entity_id = models.UUIDField(null=True, blank=True)
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_documents",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def __str__(self):
        return self.title


class BlogPost(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    author = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="blog_posts",
    )
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    excerpt = models.TextField(blank=True)
    body = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to="blog/covers/", blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at"]

    def __str__(self):
        return self.title
