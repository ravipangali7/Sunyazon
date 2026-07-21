"""Core platform models — tenant, workflow, tasks, approvals, audit, notifications."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, TimeStampedModel, TenantScopedModel, UUIDPrimaryKeyModel


class Tenant(UUIDPrimaryKeyModel, TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=128, unique=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    settings_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Actor(TenantScopedModel):
    class ActorType(models.TextChoices):
        HUMAN = "human", "Human"
        AI = "ai", "AI Agent"
        SYSTEM = "system", "System"
        MACHINE = "machine", "Machine / IoT"

    actor_type = models.CharField(
        max_length=16,
        choices=ActorType.choices,
        default=ActorType.HUMAN,
        db_index=True,
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actors",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actors",
    )
    authority_level = models.PositiveIntegerField(default=0)
    approval_limit = CurrencyField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        label = self.user.username if self.user_id else self.get_actor_type_display()
        return f"{label} ({self.get_actor_type_display()})"


class BusinessObject(UUIDPrimaryKeyModel):
    object_code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    schema_name = models.CharField(max_length=64, blank=True)
    table_name = models.CharField(max_length=128, blank=True)
    lifecycle_states = models.JSONField(default=list, blank=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["object_code"]

    def __str__(self):
        return f"{self.object_code} — {self.name}"


class MetadataForm(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    object_code = models.CharField(max_length=64, db_index=True)
    version = models.PositiveIntegerField(default=1)
    layout_json = models.JSONField(default=dict, blank=True)
    fields_json = models.JSONField(default=list, blank=True)
    validation_rules = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["object_code", "-version"]
        unique_together = [("object_code", "version")]

    def __str__(self):
        return f"{self.object_code} v{self.version}"


class WorkflowDefinition(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    code = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    version = models.PositiveIntegerField(default=1)
    trigger_event = models.CharField(max_length=128, blank=True)
    steps_json = models.JSONField(default=list, blank=True)
    sla_config = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["code", "-version"]
        unique_together = [("code", "version")]

    def __str__(self):
        return f"{self.code} — {self.name} v{self.version}"


class WorkflowInstance(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        FAILED = "failed", "Failed"

    definition = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.PROTECT,
        related_name="instances",
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="workflow_instances",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="workflow_instances",
    )
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.UUIDField(db_index=True)
    current_step = models.CharField(max_length=128, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.RUNNING,
        db_index=True,
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
        ]

    def __str__(self):
        return f"{self.definition.code} — {self.entity_type}:{self.entity_id}"


class Task(TenantScopedModel):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    # Legacy enum kept for migration compatibility; prefer status_ref (TaskStatus).
    class Status(models.TextChoices):
        NEW = "new", "New"
        ASSIGNED = "assigned", "Assigned"
        ACCEPTED = "accepted", "Accepted"
        IN_PROGRESS = "in_progress", "In Progress"
        PENDING_APPROVAL = "pending_approval", "Pending Approval"
        ON_HOLD = "on_hold", "On Hold"
        REVIEW = "review", "Review"
        COMPLETED = "completed", "Completed"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        VERIFIED = "verified", "Verified"
        CLOSED = "closed", "Closed"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    task_number = models.CharField(max_length=64, blank=True, db_index=True)
    assignee = models.ForeignKey(
        Actor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    assigned_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks_assigned",
    )
    assigned_to_user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks_user",
    )
    workflow_instance = models.ForeignKey(
        WorkflowInstance,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    project = models.ForeignKey(
        "core.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    category = models.ForeignKey(
        "core.TaskCategory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    team = models.ForeignKey(
        "core.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    status_ref = models.ForeignKey(
        "core.TaskStatus",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority = models.CharField(
        max_length=16,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )
    start_date = models.DateField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    actual_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    progress_pct = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
    )
    checklist_json = models.JSONField(default=list, blank=True)
    evidence_urls = models.JSONField(default=list, blank=True)
    labels = models.ManyToManyField(
        "core.TaskLabel",
        blank=True,
        related_name="tasks",
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "is_archived"]),
            models.Index(fields=["task_number"]),
        ]

    def __str__(self):
        return self.title

    @property
    def status_code(self) -> str:
        if self.status_ref_id:
            return self.status_ref.code
        return self.status


class Approval(UUIDPrimaryKeyModel):
    class Decision(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        RETURNED = "returned", "Returned"
        ESCALATED = "escalated", "Escalated"

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="approvals",
    )
    workflow_instance = models.ForeignKey(
        WorkflowInstance,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approvals",
    )
    approver = models.ForeignKey(
        Actor,
        on_delete=models.PROTECT,
        related_name="approvals",
    )
    approver_user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approvals",
    )
    level = models.PositiveIntegerField(default=1)
    decision = models.CharField(
        max_length=16,
        choices=Decision.choices,
        default=Decision.PENDING,
        db_index=True,
    )
    remarks = models.TextField(blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, null=True)

    class Meta:
        ordering = ["task", "level"]

    def __str__(self):
        return f"Approval L{self.level} — {self.task} ({self.decision})"


class Policy(UUIDPrimaryKeyModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="policies",
    )
    rule_code = models.CharField(max_length=64, db_index=True)
    condition_json = models.JSONField(default=dict, blank=True)
    action_json = models.JSONField(default=dict, blank=True)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["organization", "rule_code"]
        verbose_name_plural = "policies"

    def __str__(self):
        return f"{self.rule_code} ({self.organization})"


class Rule(UUIDPrimaryKeyModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="rules",
    )
    name = models.CharField(max_length=255)
    condition_json = models.JSONField(default=dict, blank=True)
    action_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["organization", "name"]

    def __str__(self):
        return f"{self.name} ({self.organization})"


class AuditLog(TenantScopedModel):
    actor = models.ForeignKey(
        Actor,
        on_delete=models.PROTECT,
        related_name="audit_logs",
    )
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.UUIDField(db_index=True)
    action = models.CharField(max_length=64, db_index=True)
    before_json = models.JSONField(default=dict, blank=True)
    after_json = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    device = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.entity_type}:{self.entity_id}"


class Notification(UUIDPrimaryKeyModel):
    class Channel(models.TextChoices):
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"
        PUSH = "push", "Push"
        IN_APP = "in_app", "In App"

    class Type(models.TextChoices):
        TASK = "task", "Task"
        TASK_ASSIGNED = "task_assigned", "Task Assigned"
        TASK_UPDATED = "task_updated", "Task Updated"
        APPROVAL = "approval", "Approval"
        MENTION = "mention", "Mention"
        REMINDER = "reminder", "Reminder"
        DEADLINE = "deadline", "Deadline"
        ANNOUNCEMENT = "announcement", "Announcement"
        ESCALATION = "escalation", "Escalation"
        WARNING = "warning", "Warning"
        EMERGENCY = "emergency", "Emergency"
        AI = "ai", "AI"
        COMPLIANCE = "compliance", "Compliance"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    channel = models.CharField(
        max_length=16,
        choices=Channel.choices,
        default=Channel.IN_APP,
        db_index=True,
    )
    type = models.CharField(max_length=32, choices=Type.choices, db_index=True)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    entity_type = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} → {self.user}"
