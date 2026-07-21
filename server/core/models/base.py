"""Shared abstract bases and helpers for Sunyazon / BEOS models."""

from __future__ import annotations

import uuid

from django.db import models


class UUIDPrimaryKeyModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantScopedModel(UUIDPrimaryKeyModel):
    tenant = models.ForeignKey(
        "core.Tenant",
        on_delete=models.CASCADE,
        related_name="%(class)ss",
        null=True,
        blank=True,
    )

    class Meta:
        abstract = True


class OrgScopedModel(UUIDPrimaryKeyModel):
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="%(class)ss",
        null=True,
        blank=True,
    )

    class Meta:
        abstract = True


class CurrencyField(models.DecimalField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("max_digits", 18)
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("default", 0)
        super().__init__(*args, **kwargs)
