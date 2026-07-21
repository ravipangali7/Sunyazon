"""Admin for social, media, chat, ads, platform core."""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from core.models import (
    AdCampaign,
    AdImpression,
    AdPlan,
    Actor,
    Approval,
    AuditLog,
    BlogPost,
    BusinessObject,
    CallSession,
    ChatMessage,
    ChatParticipant,
    ChatThread,
    Document,
    DocumentTemplate,
    FeedEngagement,
    FeedMedia,
    FeedPost,
    FeedProductLink,
    HelpTicket,
    LiveStream,
    LiveViewer,
    MediaAsset,
    MediaPlaylist,
    MetadataForm,
    Notification,
    PaymentGateway,
    PaymentTransaction,
    PlatformChannel,
    PlaylistItem,
    Policy,
    Rule,
    Story,
    Task,
    ThoughtPortal,
    UserChannelSubscription,
    WorkflowDefinition,
    WorkflowInstance,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, image_thumb, money


# ------------------------------------------------------------------
# Platform
# ------------------------------------------------------------------

@admin.register(Actor)
class ActorAdmin(BaseAdmin):
    list_display = ("__str__", "type_badge", "user", "organization", "authority_level", "limit_col", "created_at")
    list_filter = ("actor_type",)
    search_fields = ("user__username", "organization__company_name")
    autocomplete_fields = ["tenant", "user", "organization"]
    list_select_related = ("user", "organization")

    @admin.display(description="Type", ordering="actor_type")
    def type_badge(self, obj):
        return choice_badge(obj, "actor_type")

    @admin.display(description="Approval limit", ordering="approval_limit")
    def limit_col(self, obj):
        return money(obj.approval_limit)


class ApprovalInline(admin.TabularInline):
    model = Approval
    extra = 0
    autocomplete_fields = ["approver"]
    fields = ("approver", "level", "decision", "remarks", "decided_at")


@admin.register(Task)
class TaskAdmin(BaseAdmin):
    inlines = [ApprovalInline]
    list_display = (
        "title", "organization", "assignee", "priority_badge",
        "due_at", "status_badge", "created_at",
    )
    list_filter = ("priority", "status", "organization")
    search_fields = ("title",)
    date_hierarchy = "created_at"
    autocomplete_fields = ["tenant", "organization", "assignee", "workflow_instance"]
    list_select_related = ("organization", "assignee")

    @admin.display(description="Priority", ordering="priority")
    def priority_badge(self, obj):
        return choice_badge(obj, "priority")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(WorkflowDefinition)
class WorkflowDefinitionAdmin(BaseAdmin):
    list_display = ("code", "name", "version", "trigger_event", "status_badge", "created_at")
    list_filter = ("status",)
    search_fields = ("code", "name")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(WorkflowInstance)
class WorkflowInstanceAdmin(BaseAdmin):
    list_display = ("definition", "entity_type", "entity_id", "organization", "current_step", "status_badge", "started_at")
    list_filter = ("status",)
    search_fields = ("entity_type", "current_step")
    autocomplete_fields = ["definition", "tenant", "organization"]
    list_select_related = ("definition", "organization")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(BusinessObject)
class BusinessObjectAdmin(BaseAdmin):
    list_display = ("object_code", "name", "schema_name", "table_name", "version", "created_at")
    search_fields = ("object_code", "name")


@admin.register(MetadataForm)
class MetadataFormAdmin(BaseAdmin):
    list_display = ("object_code", "version", "status_badge", "created_at")
    list_filter = ("status",)
    search_fields = ("object_code",)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Policy)
class PolicyAdmin(BaseAdmin):
    list_display = ("rule_code", "organization", "effective_from", "effective_to", "active_col")
    list_filter = ("is_active", "organization")
    search_fields = ("rule_code",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(Rule)
class RuleAdmin(BaseAdmin):
    list_display = ("name", "organization", "active_col")
    list_filter = ("is_active", "organization")
    search_fields = ("name",)
    autocomplete_fields = ["organization"]
    list_select_related = ("organization",)

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(AuditLog)
class AuditLogAdmin(BaseAdmin):
    list_display = ("created_at", "actor", "action", "entity_type", "entity_id", "ip", "device")
    list_filter = ("action", "entity_type")
    search_fields = ("action", "entity_type", "ip")
    date_hierarchy = "created_at"
    autocomplete_fields = ["tenant", "actor"]
    list_select_related = ("actor",)
    readonly_fields = ("tenant", "actor", "entity_type", "entity_id", "action", "before_json", "after_json", "ip", "device", "created_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Notification)
class NotificationAdmin(BaseAdmin):
    list_display = ("title", "user", "channel_badge", "type_badge", "read_col", "created_at")
    list_filter = ("channel", "type", "is_read")
    search_fields = ("title", "user__username", "body")
    date_hierarchy = "created_at"
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="Channel", ordering="channel")
    def channel_badge(self, obj):
        return choice_badge(obj, "channel")

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")

    @admin.display(description="Read", ordering="is_read")
    def read_col(self, obj):
        return bool_badge(obj.is_read, "Read", "Unread")


# ------------------------------------------------------------------
# Social / Media / Chat / Docs / Ads
# ------------------------------------------------------------------

class FeedMediaInline(admin.TabularInline):
    model = FeedMedia
    extra = 0
    fields = ("preview", "media_type", "file", "thumbnail", "duration_sec", "sort_order")
    readonly_fields = ("preview",)

    @admin.display(description="Preview")
    def preview(self, obj):
        return image_thumb(obj.thumbnail or None, size=48)


class FeedProductLinkInline(admin.TabularInline):
    model = FeedProductLink
    extra = 0
    autocomplete_fields = ["product"]


class FeedEngagementInline(admin.TabularInline):
    model = FeedEngagement
    extra = 0
    autocomplete_fields = ["user"]
    fields = ("user", "type", "comment_text", "created_at")
    readonly_fields = ("created_at",)


@admin.register(FeedPost)
class FeedPostAdmin(BaseAdmin):
    inlines = [FeedMediaInline, FeedProductLinkInline, FeedEngagementInline]
    list_display = (
        "title", "post_type_badge", "author_col", "visibility_badge",
        "engagement_col", "status_badge", "published_at", "created_at",
    )
    list_filter = ("post_type", "status", "visibility", "author_type")
    search_fields = ("title", "body")
    date_hierarchy = "created_at"
    autocomplete_fields = ["author_user", "author_organization"]

    @admin.display(description="Type", ordering="post_type")
    def post_type_badge(self, obj):
        return choice_badge(obj, "post_type")

    @admin.display(description="Author")
    def author_col(self, obj):
        if obj.author_type == "organization" and obj.author_organization_id:
            return obj.author_organization
        return obj.author_user or "—"

    @admin.display(description="Visibility", ordering="visibility")
    def visibility_badge(self, obj):
        return choice_badge(obj, "visibility")

    @admin.display(description="Engagement")
    def engagement_col(self, obj):
        return badge(f"{obj.engagements.count()} interactions", "#0d6efd")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(PlatformChannel)
class PlatformChannelAdmin(BaseAdmin):
    list_display = ("icon_col", "name", "code", "category_badge", "sub_count", "active_col")
    list_display_links = ("icon_col", "name")
    list_filter = ("category", "is_active")
    search_fields = ("name", "code")

    @admin.display(description="Icon")
    def icon_col(self, obj):
        return image_thumb(obj.icon, size=32, rounded=True)

    @admin.display(description="Category", ordering="category")
    def category_badge(self, obj):
        return choice_badge(obj, "category")

    @admin.display(description="Subscribers")
    def sub_count(self, obj):
        return obj.subscriptions.count()

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(UserChannelSubscription)
class UserChannelSubscriptionAdmin(BaseAdmin):
    list_display = ("user", "channel", "subscribed_at")
    search_fields = ("user__username", "channel__name")
    autocomplete_fields = ["user", "channel"]
    list_select_related = ("user", "channel")


@admin.register(Story)
class StoryAdmin(BaseAdmin):
    list_display = ("thumb", "user", "type_badge", "view_count", "expires_at", "created_at")
    list_display_links = ("thumb", "user")
    list_filter = ("media_type",)
    search_fields = ("user__username",)
    date_hierarchy = "created_at"
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="")
    def thumb(self, obj):
        return image_thumb(obj.image, size=40, rounded=True)

    @admin.display(description="Type", ordering="media_type")
    def type_badge(self, obj):
        return choice_badge(obj, "media_type")


@admin.register(ThoughtPortal)
class ThoughtPortalAdmin(BaseAdmin):
    list_display = ("thumb", "user", "type_badge", "caption", "created_at")
    list_display_links = ("thumb", "user")
    list_filter = ("content_type",)
    search_fields = ("user__username", "caption")
    date_hierarchy = "created_at"
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="")
    def thumb(self, obj):
        return image_thumb(obj.image, size=40)

    @admin.display(description="Type", ordering="content_type")
    def type_badge(self, obj):
        return choice_badge(obj, "content_type")


class LiveViewerInline(admin.TabularInline):
    model = LiveViewer
    extra = 0
    autocomplete_fields = ["user"]
    fields = ("user", "joined_at", "left_at")
    readonly_fields = ("joined_at",)


@admin.register(LiveStream)
class LiveStreamAdmin(BaseAdmin):
    inlines = [LiveViewerInline]
    list_display = (
        "thumb", "title", "host", "status_badge", "viewer_count_peak",
        "viewer_live", "scheduled_at", "started_at", "ended_at",
    )
    list_display_links = ("thumb", "title")
    list_filter = ("status",)
    search_fields = ("title", "host__username", "stream_key")
    autocomplete_fields = ["host"]
    list_select_related = ("host",)

    @admin.display(description="")
    def thumb(self, obj):
        return image_thumb(obj.thumbnail, size=44)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    @admin.display(description="Live viewers")
    def viewer_live(self, obj):
        return obj.viewers.filter(left_at__isnull=True).count()


class PlaylistItemInline(admin.TabularInline):
    model = PlaylistItem
    extra = 0
    autocomplete_fields = ["media_asset"]
    fields = ("media_asset", "sort_order")


@admin.register(MediaAsset)
class MediaAssetAdmin(BaseAdmin):
    list_display = (
        "thumb", "title", "type_badge", "owner_col", "processing_badge",
        "view_count", "like_count", "duration_sec", "created_at",
    )
    list_display_links = ("thumb", "title")
    list_filter = ("media_type", "processing_status", "owner_type")
    search_fields = ("title", "description")
    date_hierarchy = "created_at"
    autocomplete_fields = ["owner_user", "owner_organization"]

    @admin.display(description="")
    def thumb(self, obj):
        return image_thumb(obj.thumbnail, size=44)

    @admin.display(description="Type", ordering="media_type")
    def type_badge(self, obj):
        return choice_badge(obj, "media_type")

    @admin.display(description="Owner")
    def owner_col(self, obj):
        return obj.owner_user or obj.owner_organization or "—"

    @admin.display(description="Processing", ordering="processing_status")
    def processing_badge(self, obj):
        return choice_badge(obj, "processing_status")


@admin.register(MediaPlaylist)
class MediaPlaylistAdmin(BaseAdmin):
    inlines = [PlaylistItemInline]
    list_display = ("title", "owner", "item_count", "public_col")
    search_fields = ("title", "owner__username")
    autocomplete_fields = ["owner"]
    list_select_related = ("owner",)

    @admin.display(description="Items")
    def item_count(self, obj):
        return obj.items.count()

    @admin.display(description="Public", ordering="is_public")
    def public_col(self, obj):
        return bool_badge(obj.is_public, "Public", "Private")


class ChatParticipantInline(admin.TabularInline):
    model = ChatParticipant
    extra = 0
    autocomplete_fields = ["user"]
    fields = ("user", "role", "joined_at", "left_at")
    readonly_fields = ("joined_at",)


class ChatMessageInline(admin.StackedInline):
    model = ChatMessage
    extra = 0
    fields = (("sender", "message_type", "is_read"), "body", "media", "created_at")
    readonly_fields = ("created_at",)
    autocomplete_fields = ["sender", "reply_to"]
    show_change_link = True


@admin.register(ChatThread)
class ChatThreadAdmin(BaseAdmin):
    inlines = [ChatParticipantInline, ChatMessageInline]
    list_display = (
        "title", "type_badge", "created_by", "organization",
        "participant_count", "message_count", "last_message_at", "created_at",
    )
    list_filter = ("thread_type",)
    search_fields = ("title", "created_by__username")
    date_hierarchy = "created_at"
    autocomplete_fields = ["created_by", "organization", "product", "store"]
    list_select_related = ("created_by", "organization")

    @admin.display(description="Type", ordering="thread_type")
    def type_badge(self, obj):
        return choice_badge(obj, "thread_type")

    @admin.display(description="Participants")
    def participant_count(self, obj):
        return obj.participants.count()

    @admin.display(description="Messages")
    def message_count(self, obj):
        return obj.messages.count()


@admin.register(ChatMessage)
class ChatMessageAdmin(BaseAdmin):
    list_display = ("media_col", "sender", "thread", "type_badge", "body_snip", "read_col", "created_at")
    list_filter = ("message_type", "is_read")
    search_fields = ("body", "sender__username")
    date_hierarchy = "created_at"
    autocomplete_fields = ["thread", "sender", "reply_to"]
    list_select_related = ("sender", "thread")

    @admin.display(description="")
    def media_col(self, obj):
        if obj.message_type == "image" and obj.media:
            return image_thumb(obj.media, size=36)
        return "—"

    @admin.display(description="Type", ordering="message_type")
    def type_badge(self, obj):
        return choice_badge(obj, "message_type")

    @admin.display(description="Body")
    def body_snip(self, obj):
        return (obj.body or "")[:60]

    @admin.display(description="Read", ordering="is_read")
    def read_col(self, obj):
        return bool_badge(obj.is_read, "Read", "Unread")


@admin.register(CallSession)
class CallSessionAdmin(BaseAdmin):
    list_display = ("caller", "callee", "type_badge", "status_badge", "started_at", "ended_at", "duration_sec")
    list_filter = ("call_type", "status")
    search_fields = ("caller__username", "callee__username")
    autocomplete_fields = ["thread", "caller", "callee"]
    list_select_related = ("caller", "callee")

    @admin.display(description="Type", ordering="call_type")
    def type_badge(self, obj):
        return choice_badge(obj, "call_type")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(HelpTicket)
class HelpTicketAdmin(BaseAdmin):
    list_display = ("subject", "user", "category", "status_badge", "assigned_to", "created_at")
    list_filter = ("status", "category")
    search_fields = ("subject", "user__username", "description")
    date_hierarchy = "created_at"
    autocomplete_fields = ["user", "thread", "assigned_to"]
    list_select_related = ("user", "assigned_to")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(Document)
class DocumentAdmin(BaseAdmin):
    list_display = ("title", "doc_type_badge", "organization", "owner", "version", "status_badge", "published_at", "created_at")
    list_filter = ("doc_type", "status")
    search_fields = ("title", "owner__username")
    date_hierarchy = "created_at"
    autocomplete_fields = ["organization", "owner", "template", "created_by"]
    list_select_related = ("organization", "owner")

    @admin.display(description="Type", ordering="doc_type")
    def doc_type_badge(self, obj):
        return choice_badge(obj, "doc_type")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(DocumentTemplate)
class DocumentTemplateAdmin(BaseAdmin):
    list_display = ("name", "doc_type_badge", "organization", "system_col")
    list_filter = ("doc_type", "is_system_template")
    search_fields = ("name",)
    autocomplete_fields = ["organization"]

    @admin.display(description="Type", ordering="doc_type")
    def doc_type_badge(self, obj):
        return choice_badge(obj, "doc_type")

    @admin.display(description="System", ordering="is_system_template")
    def system_col(self, obj):
        return bool_badge(obj.is_system_template, "System", "Custom")


@admin.register(BlogPost)
class BlogPostAdmin(BaseAdmin):
    list_display = ("cover_col", "title", "author", "status_badge", "published_at")
    list_display_links = ("cover_col", "title")
    list_filter = ("status",)
    search_fields = ("title", "slug", "author__username")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ["author"]
    list_select_related = ("author",)

    @admin.display(description="")
    def cover_col(self, obj):
        return image_thumb(obj.cover_image, size=44)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(PaymentGateway)
class PaymentGatewayAdmin(BaseAdmin):
    list_display = ("name", "code", "active_col")
    list_filter = ("is_active",)
    search_fields = ("name", "code")

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(BaseAdmin):
    list_display = (
        "external_txn_id", "gateway", "order", "ad_campaign",
        "amount_col", "currency", "status_badge", "payment_method", "created_at",
    )
    list_filter = ("status", "gateway", "currency")
    search_fields = ("external_txn_id", "order__order_no")
    date_hierarchy = "created_at"
    autocomplete_fields = ["order", "ad_campaign", "gateway"]
    list_select_related = ("gateway", "order", "ad_campaign")

    @admin.display(description="Amount", ordering="amount")
    def amount_col(self, obj):
        return money(obj.amount, obj.currency)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


class AdImpressionInline(admin.TabularInline):
    model = AdImpression
    extra = 0
    fields = ("user", "viewed_at", "clicked")
    autocomplete_fields = ["user"]
    readonly_fields = ("viewed_at",)


@admin.register(AdPlan)
class AdPlanAdmin(BaseAdmin):
    list_display = ("name", "code", "price_col", "duration_days", "impressions_limit", "active_col")
    list_filter = ("is_active",)
    search_fields = ("name", "code")

    @admin.display(description="Price", ordering="price")
    def price_col(self, obj):
        return money(obj.price)

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Inactive")


@admin.register(AdCampaign)
class AdCampaignAdmin(BaseAdmin):
    inlines = [AdImpressionInline]
    list_display = (
        "title", "advertiser_org", "plan", "budget_col", "spent_col",
        "spend_pct", "status_badge", "start_at", "end_at",
    )
    list_filter = ("status",)
    search_fields = ("title", "advertiser_org__company_name")
    autocomplete_fields = [
        "advertiser_org", "plan", "payment_transaction", "work_order", "process_run",
    ]
    list_select_related = ("advertiser_org", "plan")

    @admin.display(description="Budget", ordering="budget")
    def budget_col(self, obj):
        return money(obj.budget)

    @admin.display(description="Spent", ordering="spent")
    def spent_col(self, obj):
        return money(obj.spent)

    @admin.display(description="Spend %")
    def spend_pct(self, obj):
        if not obj.budget:
            return "—"
        from .base import progress_bar
        return progress_bar(float(obj.spent) / float(obj.budget) * 100)

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")
