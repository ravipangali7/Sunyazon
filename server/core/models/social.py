"""Platform channels, feed, and customer-dashboard social models."""

from __future__ import annotations

from django.db import models

from .base import TimeStampedModel, UUIDPrimaryKeyModel


class PlatformChannel(UUIDPrimaryKeyModel):
    class Category(models.TextChoices):
        SOCIAL_MEDIA = "social_media", "Social Media"
        MEDIA = "media", "Media"
        GAMING = "gaming", "Gaming"
        OFFICIAL = "official", "Official"
        EDITING = "editing", "Editing"
        BUSINESS = "business", "Business"
        LANGUAGE = "language", "Language"

    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=32, choices=Category.choices, db_index=True)
    icon = models.ImageField(upload_to="channels/icons/", blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class UserChannelSubscription(UUIDPrimaryKeyModel):
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="channel_subscriptions",
    )
    channel = models.ForeignKey(
        PlatformChannel,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    subscribed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "channel"],
                name="unique_user_channel_subscription",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user} → {self.channel}"


class FeedPost(UUIDPrimaryKeyModel, TimeStampedModel):
    class AuthorType(models.TextChoices):
        USER = "user", "User"
        ORGANIZATION = "organization", "Organization"

    class PostType(models.TextChoices):
        PRODUCT = "product", "Product"
        WEATHER = "weather", "Weather"
        CALENDAR = "calendar", "Calendar"
        VIDEO = "video", "Video"
        IMAGE = "image", "Image"
        APP = "app", "App"
        NEWS = "news", "News"
        JOB_VACANCY = "job_vacancy", "Job Vacancy"
        THOUGHT = "thought", "Thought"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        FRIENDS = "friends", "Friends"
        PRIVATE = "private", "Private"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    author_type = models.CharField(max_length=16, choices=AuthorType.choices, db_index=True)
    author_user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="authored_feed_posts",
    )
    author_organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="authored_feed_posts",
    )
    post_type = models.CharField(max_length=32, choices=PostType.choices, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    content_json = models.JSONField(default=dict, blank=True)
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.PUBLIC,
    )
    location_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    location_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    weather_data_json = models.JSONField(null=True, blank=True)
    calendar_event_json = models.JSONField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title or f"{self.post_type} post {self.pk}"


class FeedMedia(UUIDPrimaryKeyModel):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"

    post = models.ForeignKey(
        FeedPost,
        on_delete=models.CASCADE,
        related_name="media_items",
    )
    media_type = models.CharField(max_length=16, choices=MediaType.choices)
    file = models.FileField(upload_to="feed/media/", blank=True, null=True)
    thumbnail = models.ImageField(upload_to="feed/thumbnails/", blank=True, null=True)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return f"{self.media_type} for {self.post}"


class FeedProductLink(UUIDPrimaryKeyModel):
    post = models.ForeignKey(
        FeedPost,
        on_delete=models.CASCADE,
        related_name="product_links",
    )
    product = models.ForeignKey(
        "core.Product",
        on_delete=models.CASCADE,
        related_name="feed_links",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["post", "product"],
                name="unique_feed_post_product_link",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.post} → {self.product}"


class FeedEngagement(UUIDPrimaryKeyModel):
    class EngagementType(models.TextChoices):
        LIKE = "like", "Like"
        COMMENT = "comment", "Comment"
        SHARE = "share", "Share"
        SAVE = "save", "Save"

    post = models.ForeignKey(
        FeedPost,
        on_delete=models.CASCADE,
        related_name="engagements",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="feed_engagements",
    )
    type = models.CharField(max_length=16, choices=EngagementType.choices, db_index=True)
    comment_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.type} by {self.user} on {self.post}"


class WeatherWidgetCache(UUIDPrimaryKeyModel):
    location_key = models.CharField(max_length=128, db_index=True)
    data_json = models.JSONField(default=dict)
    fetched_at = models.DateTimeField()
    expires_at = models.DateTimeField()

    def __str__(self) -> str:
        return f"Weather cache: {self.location_key}"


class Friendship(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        BLOCKED = "blocked", "Blocked"

    requester = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="friendships_sent",
    )
    addressee = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="friendships_received",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["requester", "addressee"],
                name="unique_friendship_pair",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requester} → {self.addressee} ({self.status})"


class FriendSuggestion(UUIDPrimaryKeyModel):
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="friend_suggestions",
    )
    suggested_user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="suggested_to_users",
    )
    score = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    reason = models.CharField(max_length=255, blank=True)
    dismissed = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "suggested_user"],
                name="unique_friend_suggestion",
            ),
        ]

    def __str__(self) -> str:
        return f"Suggest {self.suggested_user} to {self.user}"


class OnlinePresence(models.Model):
    user = models.OneToOneField(
        "core.User",
        on_delete=models.CASCADE,
        related_name="online_presence",
        primary_key=True,
    )
    is_online = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(auto_now=True)
    device_type = models.CharField(max_length=64, blank=True)

    def __str__(self) -> str:
        status = "online" if self.is_online else "offline"
        return f"{self.user} ({status})"


class ThoughtPortal(UUIDPrimaryKeyModel):
    class ContentType(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Video"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="thought_portals",
    )
    content_type = models.CharField(max_length=16, choices=ContentType.choices)
    image = models.ImageField(upload_to="thoughts/images/", blank=True, null=True)
    media_file = models.FileField(upload_to="thoughts/videos/", blank=True, null=True)
    caption = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Thought by {self.user}"


class LiveMarketSession(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"

    seller_org = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="live_market_sessions",
    )
    title = models.CharField(max_length=255)
    live_stream = models.ForeignKey(
        "core.LiveStream",
        on_delete=models.CASCADE,
        related_name="market_sessions",
    )
    product_ids = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.SCHEDULED,
        db_index=True,
    )

    def __str__(self) -> str:
        return self.title


class Story(UUIDPrimaryKeyModel):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="stories",
    )
    media_type = models.CharField(max_length=16, choices=MediaType.choices)
    image = models.ImageField(upload_to="stories/images/", blank=True, null=True)
    media_file = models.FileField(upload_to="stories/videos/", blank=True, null=True)
    expires_at = models.DateTimeField()
    view_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "stories"

    def __str__(self) -> str:
        return f"Story by {self.user}"
