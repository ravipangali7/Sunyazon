"""Enterprise ERP extensions — menus, dynamic statuses, task detail, settings, RBAC actions."""

from __future__ import annotations

from django.db import models

from .base import TimeStampedModel, UUIDPrimaryKeyModel


class PermissionAction(models.TextChoices):
    VIEW = "view", "View"
    CREATE = "create", "Create"
    EDIT = "edit", "Edit"
    DELETE = "delete", "Delete"
    APPROVE = "approve", "Approve"
    EXPORT = "export", "Export"
    IMPORT = "import", "Import"
    PRINT = "print", "Print"


DEFAULT_PERMISSION_ACTIONS = [c.value for c in PermissionAction]


class MenuItem(UUIDPrimaryKeyModel, TimeStampedModel):
    """Database-driven sidebar / navigation item."""

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="menu_items",
        help_text="Null = global/system menu available to all orgs.",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    module = models.ForeignKey(
        "core.Module",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="menu_items",
    )
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=64, db_index=True)
    icon = models.CharField(max_length=64, blank=True, help_text="Lucide icon name")
    route = models.CharField(max_length=255, blank=True)
    display_order = models.PositiveIntegerField(default=100)
    is_visible = models.BooleanField(default=True, db_index=True)
    permission_code = models.CharField(
        max_length=128,
        blank=True,
        help_text="Required permission resource code, e.g. tasks.view",
    )
    required_action = models.CharField(
        max_length=16,
        choices=PermissionAction.choices,
        default=PermissionAction.VIEW,
        blank=True,
    )

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = [("organization", "code")]
        indexes = [
            models.Index(fields=["is_visible", "display_order"]),
        ]

    def __str__(self) -> str:
        return self.name


class Project(UUIDPrimaryKeyModel, TimeStampedModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, db_index=True)
    description = models.TextField(blank=True)
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    manager = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_projects",
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["organization", "code"]
        unique_together = [("organization", "code")]

    def __str__(self) -> str:
        return f"{self.code} — {self.name}"


class TaskCategory(UUIDPrimaryKeyModel, TimeStampedModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="task_categories",
    )
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=64, db_index=True)
    color = models.CharField(max_length=16, blank=True, default="#F25C05")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["organization", "name"]
        unique_together = [("organization", "code")]
        verbose_name_plural = "task categories"

    def __str__(self) -> str:
        return self.name


class TaskStatus(UUIDPrimaryKeyModel, TimeStampedModel):
    """Admin-managed dynamic task statuses (never hardcoded in UI)."""

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="task_statuses",
        help_text="Null = global default status template.",
    )
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=64, db_index=True)
    color = models.CharField(max_length=16, blank=True, default="#6B7280")
    display_order = models.PositiveIntegerField(default=100)
    is_terminal = models.BooleanField(
        default=False,
        help_text="Completed / cancelled / rejected style end states.",
    )
    is_default = models.BooleanField(default=False)
    show_in_filter = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = [("organization", "code")]
        verbose_name_plural = "task statuses"

    def __str__(self) -> str:
        return self.name


class TaskLabel(UUIDPrimaryKeyModel, TimeStampedModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="task_labels",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, blank=True, default="#3B82F6")

    class Meta:
        ordering = ["name"]
        unique_together = [("organization", "name")]

    def __str__(self) -> str:
        return self.name


class TaskComment(UUIDPrimaryKeyModel, TimeStampedModel):
    task = models.ForeignKey(
        "core.Task",
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_comments",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    body = models.TextField()
    mentions = models.ManyToManyField(
        "core.User",
        blank=True,
        related_name="task_mentions",
    )
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Comment on {self.task_id}"


class TaskAttachment(UUIDPrimaryKeyModel, TimeStampedModel):
    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        PDF = "pdf", "PDF"
        WORD = "word", "Word"
        EXCEL = "excel", "Excel"
        ZIP = "zip", "ZIP"
        VIDEO = "video", "Video"
        OTHER = "other", "Other"

    task = models.ForeignKey(
        "core.Task",
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    comment = models.ForeignKey(
        TaskComment,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    uploaded_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_attachments",
    )
    file = models.FileField(upload_to="tasks/attachments/%Y/%m/")
    original_name = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=128, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    kind = models.CharField(
        max_length=16,
        choices=Kind.choices,
        default=Kind.OTHER,
        db_index=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.original_name or str(self.file)


class TaskHistory(UUIDPrimaryKeyModel):
    """Per-task audit trail (created, assigned, approved, etc.)."""

    task = models.ForeignKey(
        "core.Task",
        on_delete=models.CASCADE,
        related_name="history",
    )
    actor = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="task_history_actions",
    )
    action = models.CharField(max_length=64, db_index=True)
    message = models.TextField(blank=True)
    before_json = models.JSONField(default=dict, blank=True)
    after_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "task histories"

    def __str__(self) -> str:
        return f"{self.action} @ {self.task_id}"


class AppSetting(UUIDPrimaryKeyModel, TimeStampedModel):
    """Key/value org or global settings (theme, SMTP, branding, …)."""

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="settings",
    )
    key = models.CharField(max_length=128, db_index=True)
    value_json = models.JSONField(default=dict, blank=True)
    category = models.CharField(max_length=64, blank=True, db_index=True)
    is_secret = models.BooleanField(default=False)

    class Meta:
        ordering = ["category", "key"]
        unique_together = [("organization", "key")]

    def __str__(self) -> str:
        scope = self.organization_id or "global"
        return f"{scope}:{self.key}"


class ActivityLog(UUIDPrimaryKeyModel):
    """System-wide activity log with browser/device metadata."""

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_logs",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_logs",
    )
    action = models.CharField(max_length=128, db_index=True)
    entity_type = models.CharField(max_length=64, blank=True, db_index=True)
    entity_id = models.CharField(max_length=64, blank=True, db_index=True)
    detail = models.TextField(blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    browser = models.CharField(max_length=255, blank=True)
    device = models.CharField(max_length=255, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} by {self.user_id}"


class Holiday(UUIDPrimaryKeyModel, TimeStampedModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="holidays",
    )
    name = models.CharField(max_length=128)
    date = models.DateField(db_index=True)
    is_recurring = models.BooleanField(default=False)

    class Meta:
        ordering = ["date"]
        unique_together = [("organization", "date", "name")]

    def __str__(self) -> str:
        return f"{self.name} ({self.date})"
