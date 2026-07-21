"""Admin for auth & identity — User (AbstractUser) with profile/KYC/address inlines."""

from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html

from core.models import (
    Address,
    Country,
    District,
    KYCDocument,
    Municipality,
    Province,
    Session,
    User,
    UserProfile,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, image_thumb


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    extra = 0
    fk_name = "user"
    autocomplete_fields = ["country", "province", "district", "municipality"]
    fieldsets = (
        ("Identity", {"fields": ("full_name", "gender", "date_of_birth", "bio")}),
        ("Location", {"fields": (("country", "province"), ("district", "municipality"), "ward")}),
        ("Media", {"fields": (("profile_picture", "cover_picture"), "language_preference")}),
    )


class KYCDocumentInline(admin.StackedInline):
    model = KYCDocument
    fk_name = "user"
    extra = 0
    fields = (
        "citizenship_no",
        ("citizenship_front", "citizenship_back"),
        ("verification_status", "verified_by", "verified_at"),
        "rejection_reason",
    )
    autocomplete_fields = ["verified_by"]


class AddressInline(admin.TabularInline):
    model = Address
    fk_name = "user"
    extra = 0
    fields = ("type", "country", "district", "municipality", "ward", "street", "is_default")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    inlines = [UserProfileInline, KYCDocumentInline, AddressInline]
    save_on_top = True
    list_per_page = 25

    list_display = (
        "avatar",
        "username",
        "full_name_col",
        "email",
        "phone",
        "account_type_badge",
        "role_badge",
        "kyc_col",
        "mfa_col",
        "is_active",
        "is_staff",
        "last_login",
        "date_joined",
    )
    list_display_links = ("avatar", "username")
    list_filter = ("account_type", "platform_role", "is_kyc_verified", "is_active", "is_staff", "is_superuser", "mfa_enabled")
    search_fields = ("username", "email", "phone", "first_name", "last_name", "profile__full_name")
    ordering = ("-date_joined",)
    date_hierarchy = "date_joined"
    readonly_fields = ("last_login", "date_joined", "created_at", "updated_at")
    autocomplete_fields = ["tenant"]

    fieldsets = (
        ("Credentials", {"fields": ("username", "password")}),
        ("Personal Info", {"fields": (("first_name", "last_name"), ("email", "phone"))}),
        ("Platform", {
            "fields": (
                ("tenant", "account_type", "platform_role"),
                ("is_kyc_verified", "mfa_enabled"),
                ("email_verified_at", "phone_verified_at"),
            ),
        }),
        ("Permissions", {
            "classes": ("collapse",),
            "fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions"),
        }),
        ("Important Dates", {
            "classes": ("collapse",),
            "fields": ("last_login", "date_joined", "created_at", "updated_at"),
        }),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "phone", "email", "account_type", "platform_role", "password1", "password2"),
        }),
    )

    @admin.display(description="")
    def avatar(self, obj):
        profile = getattr(obj, "profile", None)
        return image_thumb(profile.profile_picture if profile else None, size=34, rounded=True)

    @admin.display(description="Full name", ordering="profile__full_name")
    def full_name_col(self, obj):
        profile = getattr(obj, "profile", None)
        return (profile.full_name if profile else "") or obj.get_full_name() or "—"

    @admin.display(description="Account type", ordering="account_type")
    def account_type_badge(self, obj):
        return choice_badge(obj, "account_type")

    @admin.display(description="Role", ordering="platform_role")
    def role_badge(self, obj):
        return choice_badge(obj, "platform_role")

    @admin.display(description="KYC", ordering="is_kyc_verified")
    def kyc_col(self, obj):
        return bool_badge(obj.is_kyc_verified, "Verified", "Unverified")

    @admin.display(description="MFA", ordering="mfa_enabled")
    def mfa_col(self, obj):
        return bool_badge(obj.mfa_enabled, "On", "Off")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("profile")


@admin.register(KYCDocument)
class KYCDocumentAdmin(BaseAdmin):
    list_display = (
        "front_thumb",
        "back_thumb",
        "user",
        "citizenship_no",
        "status_badge",
        "verified_by",
        "verified_at",
        "created_at",
    )
    list_display_links = ("front_thumb", "user")
    list_filter = ("verification_status",)
    search_fields = ("user__username", "user__email", "citizenship_no")
    autocomplete_fields = ["user", "verified_by"]
    date_hierarchy = "created_at"
    list_select_related = ("user", "verified_by")

    @admin.display(description="Front")
    def front_thumb(self, obj):
        return image_thumb(obj.citizenship_front, size=44)

    @admin.display(description="Back")
    def back_thumb(self, obj):
        return image_thumb(obj.citizenship_back, size=44)

    @admin.display(description="Status", ordering="verification_status")
    def status_badge(self, obj):
        return choice_badge(obj, "verification_status")


@admin.register(UserProfile)
class UserProfileAdmin(BaseAdmin):
    list_display = ("avatar", "user", "full_name", "gender", "country", "district", "language_preference", "updated_at")
    list_display_links = ("avatar", "user")
    list_filter = ("gender", "country")
    search_fields = ("user__username", "full_name")
    autocomplete_fields = ["user", "country", "province", "district", "municipality"]
    list_select_related = ("user", "country", "district")

    @admin.display(description="")
    def avatar(self, obj):
        return image_thumb(obj.profile_picture, size=34, rounded=True)


@admin.register(Address)
class AddressAdmin(BaseAdmin):
    list_display = ("user", "type_badge", "country", "district", "municipality", "ward", "street", "default_col")
    list_filter = ("type", "is_default")
    search_fields = ("user__username", "street", "municipality", "district")
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")

    @admin.display(description="Default", ordering="is_default")
    def default_col(self, obj):
        return bool_badge(obj.is_default, "Default", "—")


@admin.register(Session)
class SessionAdmin(BaseAdmin):
    list_display = ("user", "device_info", "ip", "created_at", "expires_at", "state_col")
    search_fields = ("user__username", "ip", "device_info")
    date_hierarchy = "created_at"
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="State")
    def state_col(self, obj):
        from django.utils import timezone
        expired = obj.expires_at and obj.expires_at < timezone.now()
        return badge("Expired", "#dc3545") if expired else badge("Active", "#198754")


class ProvinceInline(admin.TabularInline):
    model = Province
    extra = 0


@admin.register(Country)
class CountryAdmin(BaseAdmin):
    inlines = [ProvinceInline]
    list_display = ("name", "code", "phone_code", "province_count")
    search_fields = ("name", "code")

    @admin.display(description="Provinces")
    def province_count(self, obj):
        return obj.provinces.count()


class DistrictInline(admin.TabularInline):
    model = District
    extra = 0


@admin.register(Province)
class ProvinceAdmin(BaseAdmin):
    inlines = [DistrictInline]
    list_display = ("name", "country", "district_count")
    list_filter = ("country",)
    search_fields = ("name",)
    autocomplete_fields = ["country"]
    list_select_related = ("country",)

    @admin.display(description="Districts")
    def district_count(self, obj):
        return obj.districts.count()


class MunicipalityInline(admin.TabularInline):
    model = Municipality
    extra = 0


@admin.register(District)
class DistrictAdmin(BaseAdmin):
    inlines = [MunicipalityInline]
    list_display = ("name", "province", "municipality_count")
    list_filter = ("province__country",)
    search_fields = ("name",)
    autocomplete_fields = ["province"]
    list_select_related = ("province",)

    @admin.display(description="Municipalities")
    def municipality_count(self, obj):
        return obj.municipalities.count()


@admin.register(Municipality)
class MunicipalityAdmin(BaseAdmin):
    list_display = ("name", "type_badge", "district")
    list_filter = ("type", "district__province")
    search_fields = ("name",)
    autocomplete_fields = ["district"]
    list_select_related = ("district",)

    @admin.display(description="Type", ordering="type")
    def type_badge(self, obj):
        return choice_badge(obj, "type")
