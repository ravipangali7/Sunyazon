"""Identity & KYC — rules 9–12."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, write_audit


@transaction.atomic
def verify_kyc(kyc_document, *, approved: bool, verified_by=None, rejection_reason: str = "", actor=None):
    """Approve → User.is_kyc_verified; reject → notify + allow resubmit."""
    from core.models import KYCDocument

    before = status_snapshot(kyc_document, ["verification_status"])
    user = kyc_document.user

    if approved:
        kyc_document.verification_status = KYCDocument.VerificationStatus.APPROVED
        kyc_document.verified_at = timezone.now()
        kyc_document.verified_by = verified_by
        kyc_document.rejection_reason = ""
        kyc_document.save(
            update_fields=["verification_status", "verified_at", "verified_by", "rejection_reason"]
        )
        user.is_kyc_verified = True
        if hasattr(user, "verified_at"):
            # models may only have is_kyc_verified; keep soft
            pass
        user.save(update_fields=["is_kyc_verified"])
        notify(user, title="KYC verified", body="Your identity documents were approved.", type="compliance")
    else:
        kyc_document.verification_status = KYCDocument.VerificationStatus.REJECTED
        kyc_document.verified_at = timezone.now()
        kyc_document.verified_by = verified_by
        kyc_document.rejection_reason = rejection_reason
        kyc_document.save(
            update_fields=["verification_status", "verified_at", "verified_by", "rejection_reason"]
        )
        user.is_kyc_verified = False
        user.save(update_fields=["is_kyc_verified"])
        notify(
            user,
            title="KYC rejected",
            body=rejection_reason or "Please resubmit your documents.",
            type="compliance",
        )

    write_audit(
        actor=actor,
        entity=kyc_document,
        action="kyc.approved" if approved else "kyc.rejected",
        before=before,
        after=status_snapshot(kyc_document, ["verification_status"]),
    )
    return kyc_document


@transaction.atomic
def set_default_address(address):
    """Clear other defaults for same user when is_default=True."""
    if not address.is_default:
        return address
    from core.models import Address

    Address.objects.filter(user=address.user, is_default=True).exclude(pk=address.pk).update(
        is_default=False
    )
    return address


@transaction.atomic
def setup_consumer_user(user, *, actor=None):
    """On consumer User create → optional UserProfile, empty Cart, OnlinePresence."""
    from core.models import Cart, OnlinePresence, User, UserProfile

    if user.account_type != User.AccountType.CONSUMER:
        return user

    UserProfile.objects.get_or_create(user=user)
    Cart.objects.get_or_create(user=user)
    OnlinePresence.objects.get_or_create(user=user)
    write_audit(actor=actor, entity=user, action="user.consumer_setup")
    return user
