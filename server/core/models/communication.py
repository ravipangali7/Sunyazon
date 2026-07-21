"""Chat centre — threads, messages, calls, help tickets."""

from __future__ import annotations

from django.db import models

from .base import UUIDPrimaryKeyModel


class ChatThread(UUIDPrimaryKeyModel):
    class ThreadType(models.TextChoices):
        PERSONAL = "personal", "Personal"
        STORE = "store", "Store"
        PRODUCT = "product", "Product"
        STORY = "story", "Story"
        PERSONAL_BUSINESS = "personal_business", "Personal Business"
        ORGANIZATION = "organization", "Organization"
        HELP = "help", "Help"

    thread_type = models.CharField(max_length=32, choices=ThreadType.choices, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="created_chat_threads",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_threads",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_threads",
    )
    store = models.ForeignKey(
        "core.NearestShop",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_threads",
    )
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]

    def __str__(self):
        return self.title or f"{self.get_thread_type_display()} thread"


class ChatParticipant(UUIDPrimaryKeyModel):
    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        ADMIN = "admin", "Admin"

    thread = models.ForeignKey(
        ChatThread,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="chat_participations",
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("thread", "user")]

    def __str__(self):
        return f"{self.user} in {self.thread}"


class ChatMessage(UUIDPrimaryKeyModel):
    class MessageType(models.TextChoices):
        TEXT = "text", "Text"
        VOICE = "voice", "Voice"
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        FILE = "file", "File"
        CALL_LOG = "call_log", "Call Log"

    thread = models.ForeignKey(
        ChatThread,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    message_type = models.CharField(
        max_length=16,
        choices=MessageType.choices,
        default=MessageType.TEXT,
        db_index=True,
    )
    body = models.TextField(blank=True)
    media = models.FileField(upload_to="chat/media/", blank=True, null=True)
    voice_duration_sec = models.PositiveIntegerField(null=True, blank=True)
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender}: {self.body[:40] or self.message_type}"


class CallSession(UUIDPrimaryKeyModel):
    class CallType(models.TextChoices):
        AUDIO = "audio", "Audio"
        VIDEO = "video", "Video"

    class Status(models.TextChoices):
        RINGING = "ringing", "Ringing"
        ACTIVE = "active", "Active"
        ENDED = "ended", "Ended"
        MISSED = "missed", "Missed"

    thread = models.ForeignKey(
        ChatThread,
        on_delete=models.CASCADE,
        related_name="call_sessions",
    )
    caller = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="outgoing_calls",
    )
    callee = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="incoming_calls",
    )
    call_type = models.CharField(max_length=8, choices=CallType.choices, db_index=True)
    webrtc_session_id = models.CharField(max_length=128, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.RINGING,
        db_index=True,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.call_type} call {self.caller} → {self.callee}"


class HelpTicket(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="help_tickets",
    )
    category = models.CharField(max_length=128, blank=True)
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    thread = models.ForeignKey(
        ChatThread,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="help_tickets",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_help_tickets",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.subject
