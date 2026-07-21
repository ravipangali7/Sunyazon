"""Auth, identity, and geo masters. User uses AbstractUser."""

from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from .base import TimeStampedModel, UUIDPrimaryKeyModel


class Country(UUIDPrimaryKeyModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=8, unique=True)
    phone_code = models.CharField(max_length=8, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "countries"

    def __str__(self) -> str:
        return self.name


class Province(UUIDPrimaryKeyModel):
    country = models.ForeignKey(
        Country,
        on_delete=models.CASCADE,
        related_name="provinces",
    )
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.country.code})"


class District(UUIDPrimaryKeyModel):
    province = models.ForeignKey(
        Province,
        on_delete=models.CASCADE,
        related_name="districts",
    )
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Municipality(UUIDPrimaryKeyModel):
    class Type(models.TextChoices):
        MUNICIPALITY = "municipality", "Municipality"
        RURAL = "rural_municipality", "Rural Municipality"
        METRO = "metro", "Metro"
        SUB_METRO = "sub_metro", "Sub Metro"

    district = models.ForeignKey(
        District,
        on_delete=models.CASCADE,
        related_name="municipalities",
    )
    name = models.CharField(max_length=120)
    type = models.CharField(
        max_length=32,
        choices=Type.choices,
        default=Type.MUNICIPALITY,
    )

    class Meta:
        verbose_name_plural = "municipalities"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class User(AbstractUser):
    """Platform user — login with phone + password; AbstractUser for admin auth."""

    class AccountType(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        PRODUCER = "producer", "Producer"
        DISTRIBUTOR = "distributor", "Distributor"
        WHOLESALER = "wholesaler", "Wholesaler"
        RETAILER = "retailer", "Retailer"
        DEFAULT = "default", "Default"
        CONSUMER = "consumer", "Consumer"  # legacy alias of Default

    class PlatformRole(models.TextChoices):
        NONE = "none", "None"
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "core.Tenant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=32, unique=True, null=True, blank=True)
    account_type = models.CharField(
        max_length=32,
        choices=AccountType.choices,
        default=AccountType.CONSUMER,
        db_index=True,
    )
    # Used when user has no OrgUser membership (or as fallback).
    # Org-scoped Admin/Staff is also mirrored on OrgUser.role_kind.
    platform_role = models.CharField(
        max_length=16,
        choices=PlatformRole.choices,
        default=PlatformRole.NONE,
        db_index=True,
        blank=True,
    )
    is_kyc_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    mfa_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.phone or self.username

    @property
    def is_platform_super_admin(self) -> bool:
        return self.is_superuser or self.account_type == self.AccountType.SUPER_ADMIN


class UserProfile(TimeStampedModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"
        PREFER_NOT = "prefer_not_to_say", "Prefer not to say"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
        primary_key=True,
    )
    full_name = models.CharField(max_length=255, blank=True)
    gender = models.CharField(max_length=32, choices=Gender.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    country = models.ForeignKey(
        Country,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    province = models.ForeignKey(
        Province,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    district = models.ForeignKey(
        District,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    municipality = models.ForeignKey(
        Municipality,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    ward = models.CharField(max_length=32, blank=True)
    profile_picture = models.ImageField(
        upload_to="profiles/avatars/",
        blank=True,
        null=True,
    )
    cover_picture = models.ImageField(
        upload_to="profiles/covers/",
        blank=True,
        null=True,
    )
    bio = models.TextField(blank=True)
    language_preference = models.CharField(max_length=16, default="en")

    def __str__(self) -> str:
        return self.full_name or str(self.user)


class KYCDocument(UUIDPrimaryKeyModel, TimeStampedModel):
    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="kyc_documents",
    )
    citizenship_no = models.CharField(max_length=64, blank=True)
    citizenship_front = models.ImageField(
        upload_to="kyc/front/",
        blank=True,
        null=True,
    )
    citizenship_back = models.ImageField(
        upload_to="kyc/back/",
        blank=True,
        null=True,
    )
    verification_status = models.CharField(
        max_length=16,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
        db_index=True,
    )
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kyc_verifications",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"KYC {self.user} — {self.verification_status}"


class Address(UUIDPrimaryKeyModel):
    class Type(models.TextChoices):
        HOME = "home", "Home"
        BILLING = "billing", "Billing"
        SHIPPING = "shipping", "Shipping"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    type = models.CharField(max_length=16, choices=Type.choices, default=Type.HOME)
    country = models.CharField(max_length=120, blank=True)
    district = models.CharField(max_length=120, blank=True)
    municipality = models.CharField(max_length=120, blank=True)
    ward = models.CharField(max_length=32, blank=True)
    street = models.CharField(max_length=255, blank=True)
    lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "addresses"

    def __str__(self) -> str:
        return f"{self.type}: {self.street or self.municipality or self.user}"


class Session(UUIDPrimaryKeyModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    token_hash = models.CharField(max_length=255, db_index=True)
    refresh_token_hash = models.CharField(max_length=255, blank=True, db_index=True)
    remember = models.BooleanField(default=False)
    device_info = models.CharField(max_length=255, blank=True)
    browser = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    expires_at = models.DateTimeField()
    refresh_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Session {self.user} @ {self.created_at:%Y-%m-%d}"
