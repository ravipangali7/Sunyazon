"""Media assets, live streams, and playlists."""

from __future__ import annotations

from django.db import models

from .base import UUIDPrimaryKeyModel


class MediaAsset(UUIDPrimaryKeyModel):
    class OwnerType(models.TextChoices):
        USER = "user", "User"
        ORGANIZATION = "organization", "Organization"

    class MediaType(models.TextChoices):
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"
        IMAGE = "image", "Image"
        LIVE_RECORDING = "live_recording", "Live Recording"

    class ProcessingStatus(models.TextChoices):
        UPLOADING = "uploading", "Uploading"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    owner_type = models.CharField(max_length=16, choices=OwnerType.choices, db_index=True)
    owner_user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="media_assets",
    )
    owner_organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="media_assets",
    )
    media_type = models.CharField(max_length=16, choices=MediaType.choices, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to="media/assets/", blank=True, null=True)
    thumbnail = models.ImageField(upload_to="media/thumbnails/", blank=True, null=True)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(default=0)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.UPLOADING,
        db_index=True,
    )
    view_count = models.PositiveIntegerField(default=0)
    like_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class LiveStream(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"

    host = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="live_streams",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    thumbnail = models.ImageField(upload_to="live/thumbnails/", blank=True, null=True)
    stream_key = models.CharField(max_length=128, unique=True)
    webrtc_room_id = models.CharField(max_length=128, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.SCHEDULED,
        db_index=True,
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    viewer_count_peak = models.PositiveIntegerField(default=0)
    recording = models.FileField(upload_to="live/recordings/", blank=True, null=True)

    class Meta:
        ordering = ["-scheduled_at", "-started_at"]

    def __str__(self) -> str:
        return self.title


class LiveViewer(UUIDPrimaryKeyModel):
    live_stream = models.ForeignKey(
        LiveStream,
        on_delete=models.CASCADE,
        related_name="viewers",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="live_viewings",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["live_stream", "user"],
                name="unique_live_stream_viewer",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.live_stream}"


class MediaPlaylist(UUIDPrimaryKeyModel):
    owner = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="media_playlists",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)

    class Meta:
        ordering = ["title"]

    def __str__(self) -> str:
        return self.title


class PlaylistItem(UUIDPrimaryKeyModel):
    playlist = models.ForeignKey(
        MediaPlaylist,
        on_delete=models.CASCADE,
        related_name="items",
    )
    media_asset = models.ForeignKey(
        MediaAsset,
        on_delete=models.CASCADE,
        related_name="playlist_items",
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["playlist", "media_asset"],
                name="unique_playlist_media_asset",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.media_asset} in {self.playlist}"
