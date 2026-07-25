"""Company registration — Private Limited (PVT LTD) vs Non-Private Limited onboarding."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils.text import slugify

from core.services.common import DomainError, write_audit


BUSINESS_ACCOUNT_TYPES = frozenset({"producer", "distributor", "wholesaler", "retailer"})

DEFAULT_CAPABILITIES = {
    "producer": [
        "process",
        "production",
        "inventory",
        "quality",
        "procurement",
        "finance",
        "hr",
        "governance",
        "docs",
        "sales",
        "logistics",
    ],
    "distributor": ["inventory", "sales", "logistics", "finance", "hr", "governance", "docs", "crm"],
    "wholesaler": ["inventory", "sales", "logistics", "finance", "hr", "governance", "docs", "commerce"],
    "retailer": ["commerce", "inventory", "sales", "finance", "hr", "governance", "docs"],
}

ORG_TYPE_MAP = {
    "producer": "producer",
    "distributor": "distributor",
    "wholesaler": "wholesaler",
    "retailer": "retailer",
}


def _unique_slug(base: str) -> str:
    from core.models import Organization

    slug = slugify(base)[:100] or "company"
    candidate = slug
    n = 1
    while Organization.objects.filter(slug=candidate).exists():
        suffix = f"-{n}"
        candidate = f"{slug[: 128 - len(suffix)]}{suffix}"
        n += 1
    return candidate


def ensure_system_roles(organization, *, actor=None):
    """Create Admin, Staff, and HR Form Applicant roles (idempotent)."""
    from core.models import Role

    defs = [
        ("Primary Admin", Role.Kind.ADMIN, {"*": True}, True),
        ("Staff", Role.Kind.STAFF, {}, True),
        ("HR Form Applicant", Role.Kind.STAFF, {"hr": "R", "customer": "F"}, True),
        ("HR Manager", Role.Kind.STAFF, {"hr": "F", "governance": "R"}, True),
    ]
    roles = {}
    for name, kind, perms, is_system in defs:
        role, _ = Role.objects.update_or_create(
            organization=organization,
            name=name,
            defaults={
                "kind": kind,
                "permissions_json": perms,
                "is_system": is_system,
            },
        )
        roles[name] = role
    return roles


def ensure_leadership_role_definitions(*, actor=None):
    """Seed admin-configurable leadership hierarchy (idempotent)."""
    from core.models import LeadershipRoleDefinition

    rows = [
        ("CEO", "Chief Executive Officer", "top", "", "EXEC", "Executive Office", 10),
        ("MD", "Managing Director", "top", "", "EXEC", "Executive Office", 20),
        ("CFO", "Chief Financial Officer", "executive", "CEO", "FIN", "Finance", 30),
        ("CMO", "Chief Marketing Officer", "executive", "CEO", "MKT", "Marketing", 40),
        ("COO", "Chief Operating Officer", "executive", "CEO", "OPS", "Operations", 50),
        ("CTO", "Chief Technology Officer", "executive", "CEO", "IT", "Information Technology", 60),
        ("HR_HEAD", "Head of HR", "hr", "CEO", "HR", "HR & Recruitment", 70),
    ]
    created = []
    for code, name, tier, reports, dept_code, dept_name, sort in rows:
        obj, _ = LeadershipRoleDefinition.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "tier": tier,
                "reports_to_code": reports,
                "department_code": dept_code,
                "department_name": dept_name,
                "sort_order": sort,
                "is_active": True,
                "is_system": True,
            },
        )
        created.append(obj)
    return created


@transaction.atomic
def provision_org_structure(organization, *, actor=None):
    """Create departments, leadership seats, and system roles for a new org."""
    from core.models import CompanyLeadershipSeat, Department, LeadershipRoleDefinition

    ensure_system_roles(organization, actor=actor)
    ensure_leadership_role_definitions(actor=actor)

    for role_def in LeadershipRoleDefinition.objects.filter(is_active=True):
        if role_def.department_code:
            Department.objects.update_or_create(
                organization=organization,
                code=role_def.department_code,
                defaults={"name": role_def.department_name or role_def.name},
            )
        CompanyLeadershipSeat.objects.get_or_create(
            organization=organization,
            role_definition=role_def,
            defaults={"is_filled": False},
        )

    # Dedicated HR department (always present)
    Department.objects.update_or_create(
        organization=organization,
        code="HR",
        defaults={"name": "HR & Recruitment"},
    )

    write_audit(
        actor=actor,
        entity=organization,
        action="org.structure_provisioned",
        after={"slug": organization.slug},
        tenant=organization.tenant,
    )
    return organization


def _parse_shareholders(raw: list[dict] | None) -> list[dict]:
    if not raw:
        return []
    out = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        out.append(
            {
                "user_id": row.get("user_id") or row.get("user"),
                "full_name": (row.get("full_name") or "").strip(),
                "share_units": int(row.get("share_units") or 0),
                "percentage": Decimal(str(row.get("percentage") or 0)),
                "is_default": bool(row.get("is_default") or row.get("default")),
                "citizenship_document": row.get("citizenship_document"),
                "notes": (row.get("notes") or "").strip(),
            }
        )
    return out


@transaction.atomic
def create_shareholders(organization, shareholders: list[dict], *, actor=None):
    from core.models import Shareholder, User

    created = []
    for row in shareholders:
        user = None
        uid = row.get("user_id")
        if uid:
            user = User.objects.filter(pk=uid).first()
        sh = Shareholder.objects.create(
            organization=organization,
            user=user,
            full_name=row.get("full_name")
            or (getattr(getattr(user, "profile", None), "full_name", "") if user else ""),
            share_units=row.get("share_units") or 0,
            percentage=row.get("percentage") or 0,
            is_default=bool(row.get("is_default")),
            notes=row.get("notes") or "",
        )
        citizenship = row.get("citizenship_document")
        if citizenship:
            sh.citizenship_document = citizenship
            sh.save(update_fields=["citizenship_document"])
        created.append(sh)
    return created


@transaction.atomic
def create_governance_documents(organization, *, owner, actor=None):
    """Create draft Niyamawali + Prabandhapatra from system templates."""
    from core.models import Document, DocumentTemplate

    docs = []
    for doc_type, title in [
        (Document.DocType.NIYAMAWALI, "Niyamawali (Company Regulations)"),
        (Document.DocType.PRABANDHAPATRA, "Prabandhapatra (Memorandum/Articles)"),
    ]:
        template = (
            DocumentTemplate.objects.filter(doc_type=doc_type, is_system_template=True)
            .order_by("name")
            .first()
        )
        content = ""
        if template:
            content = (template.template_content or "").replace(
                "{{company_name}}", organization.company_name
            ).replace("{{pan}}", organization.vat_pan_no or "")
        doc = Document.objects.create(
            organization=organization,
            owner=owner,
            created_by=owner,
            doc_type=doc_type,
            title=f"{title} — {organization.company_name}",
            content_html=content,
            template=template,
            status=Document.Status.DRAFT,
            entity_type="organization",
            entity_id=organization.pk,
        )
        docs.append(doc)
    return docs


@transaction.atomic
def register_new_company(
    *,
    user,
    account_type: str,
    company_name: str,
    total_capital: Decimal | float | str | int = 0,
    address: str = "",
    official_phone: str = "",
    official_email: str = "",
    country=None,
    tenant=None,
    shareholders: list[dict] | None = None,
    actor=None,
):
    """Register a Private Limited (PVT LTD) company with shareholders."""
    from core.models import Country, OrgUser, Organization, Tenant, User

    account_type = (account_type or "").strip().lower()
    if account_type not in BUSINESS_ACCOUNT_TYPES:
        raise DomainError(
            "Account type must be Producer, Distributor, Wholesaler, or Retailer.",
            code="invalid_account_type",
        )

    name = (company_name or "").strip()
    if not name:
        raise DomainError("Company name is required.", code="company_name_required")

    if country is None:
        country = Country.objects.filter(code="NP").first()
        if country is None:
            raise DomainError("Default country (NP) is missing. Run seed_geo.", code="country_missing")

    if tenant is None:
        tenant = Tenant.objects.order_by("created_at").first()

    org = Organization.objects.create(
        tenant=tenant,
        org_type=ORG_TYPE_MAP[account_type],
        account_type=account_type,
        registration_mode=Organization.RegistrationMode.PVT_LTD,
        registration_status=Organization.RegistrationStatus.SUBMITTED,
        company_name=name,
        slug=_unique_slug(name),
        vat_pan_no=None,
        total_capital=Decimal(str(total_capital or 0)),
        address=address or "",
        official_phone=official_phone or user.phone or "",
        official_email=official_email or user.email or "",
        country=country,
        enabled_capabilities=list(DEFAULT_CAPABILITIES.get(account_type, ["hr", "governance", "docs"])),
        is_active=True,
        is_verified=False,
    )

    provision_org_structure(org, actor=actor or user)
    roles = ensure_system_roles(org)
    admin_role = roles["Primary Admin"]

    user.account_type = account_type
    user.platform_role = User.PlatformRole.ADMIN
    user.save(update_fields=["account_type", "platform_role"])

    OrgUser.objects.update_or_create(
        organization=org,
        user=user,
        defaults={
            "role": admin_role,
            "role_kind": OrgUser.RoleKind.ADMIN,
            "username": org.slug[:64],
            "designation": "CEO",
            "is_primary_admin": True,
        },
    )

    create_shareholders(org, _parse_shareholders(shareholders), actor=actor or user)
    create_governance_documents(org, owner=user, actor=actor or user)

    # Assign registering user to CEO seat when available
    from core.models import CompanyLeadershipSeat, LeadershipRoleDefinition

    ceo_def = LeadershipRoleDefinition.objects.filter(code="CEO", is_active=True).first()
    if ceo_def:
        seat, _ = CompanyLeadershipSeat.objects.get_or_create(
            organization=org, role_definition=ceo_def
        )
        seat.user = user
        seat.is_filled = True
        seat.save(update_fields=["user", "is_filled"])

    write_audit(
        actor=actor or user,
        entity=org,
        action="org.registered_pvt_ltd",
        after={"account_type": account_type, "mode": "pvt_ltd"},
        tenant=org.tenant,
    )
    return org


@transaction.atomic
def register_non_pvt_ltd_company(
    *,
    user,
    account_type: str,
    company_name: str,
    pan_number: str,
    managing_director_name: str,
    address: str = "",
    official_phone: str = "",
    official_email: str = "",
    country=None,
    tenant=None,
    actor=None,
):
    """Register a Non-Private Limited company (Name, PAN, MD — no shareholders)."""
    from core.models import (
        CompanyLeadershipSeat,
        Country,
        LeadershipRoleDefinition,
        OrgUser,
        Organization,
        Tenant,
        User,
    )

    account_type = (account_type or "").strip().lower()
    if account_type not in BUSINESS_ACCOUNT_TYPES:
        raise DomainError(
            "Account type must be Producer, Distributor, Wholesaler, or Retailer.",
            code="invalid_account_type",
        )

    name = (company_name or "").strip()
    if not name:
        raise DomainError("Company name is required.", code="company_name_required")

    pan = re.sub(r"\s+", "", (pan_number or "").strip())
    if not pan:
        raise DomainError("PAN number is required for Non-PVT LTD companies.", code="pan_required")

    md_name = (managing_director_name or "").strip()
    if not md_name:
        raise DomainError(
            "Managing Director (MD) name is required for Non-PVT LTD companies.",
            code="md_required",
        )

    existing = Organization.objects.filter(vat_pan_no__iexact=pan).first()
    if existing:
        raise DomainError(
            "A company with this PAN is already registered.",
            code="pan_exists",
        )

    if country is None:
        country = Country.objects.filter(code="NP").first()
        if country is None:
            raise DomainError("Default country (NP) is missing. Run seed_geo.", code="country_missing")

    if tenant is None:
        tenant = Tenant.objects.order_by("created_at").first()

    org = Organization.objects.create(
        tenant=tenant,
        org_type=ORG_TYPE_MAP[account_type],
        account_type=account_type,
        registration_mode=Organization.RegistrationMode.NON_PVT_LTD,
        registration_status=Organization.RegistrationStatus.SUBMITTED,
        company_name=name,
        slug=_unique_slug(name),
        vat_pan_no=pan,
        managing_director_name=md_name,
        total_capital=Decimal("0"),
        address=address or "",
        official_phone=official_phone or user.phone or "",
        official_email=official_email or user.email or "",
        country=country,
        enabled_capabilities=list(DEFAULT_CAPABILITIES.get(account_type, ["hr", "governance", "docs"])),
        is_active=True,
        is_verified=False,
    )

    provision_org_structure(org, actor=actor or user)
    roles = ensure_system_roles(org)

    user.account_type = account_type
    user.platform_role = User.PlatformRole.ADMIN
    user.save(update_fields=["account_type", "platform_role"])

    OrgUser.objects.update_or_create(
        organization=org,
        user=user,
        defaults={
            "role": roles["Primary Admin"],
            "role_kind": OrgUser.RoleKind.ADMIN,
            "username": pan[:64],
            "designation": "MD",
            "is_primary_admin": True,
        },
    )

    create_governance_documents(org, owner=user, actor=actor or user)

    md_def = LeadershipRoleDefinition.objects.filter(code="MD", is_active=True).first()
    if md_def:
        seat, _ = CompanyLeadershipSeat.objects.get_or_create(
            organization=org, role_definition=md_def
        )
        # MD is captured as a free-text name on the org; mark seat filled for the registrar.
        seat.user = user
        seat.is_filled = True
        seat.save(update_fields=["user", "is_filled"])

    write_audit(
        actor=actor or user,
        entity=org,
        action="org.registered_non_pvt_ltd",
        after={"pan": pan, "account_type": account_type, "md": md_name},
        tenant=org.tenant,
    )
    return org


@transaction.atomic
def register_existing_company(
    *,
    user,
    account_type: str,
    pan_number: str,
    company_name: str = "",
    total_capital: Decimal | float | str | int = 0,
    address: str = "",
    official_phone: str = "",
    official_email: str = "",
    country=None,
    tenant=None,
    registration_certificate=None,
    share_allocation_document=None,
    shareholders: list[dict] | None = None,
    documents: list[dict] | None = None,
    actor=None,
):
    """Onboard against an already-registered company (PAN required)."""
    from core.models import (
        CompanyDocument,
        Country,
        OrgUser,
        Organization,
        Tenant,
        User,
    )

    account_type = (account_type or "").strip().lower()
    if account_type not in BUSINESS_ACCOUNT_TYPES:
        raise DomainError(
            "Account type must be Producer, Distributor, Wholesaler, or Retailer.",
            code="invalid_account_type",
        )

    pan = re.sub(r"\s+", "", (pan_number or "").strip())
    if not pan:
        raise DomainError("PAN number is required for already-registered companies.", code="pan_required")

    existing = Organization.objects.filter(vat_pan_no__iexact=pan).first()
    if existing:
        # Join existing org as admin claimant (pending verification)
        roles = ensure_system_roles(existing)
        user.account_type = account_type
        user.platform_role = User.PlatformRole.ADMIN
        user.save(update_fields=["account_type", "platform_role"])
        OrgUser.objects.update_or_create(
            organization=existing,
            user=user,
            defaults={
                "role": roles["Primary Admin"],
                "role_kind": OrgUser.RoleKind.ADMIN,
                "username": pan[:64],
                "designation": "Admin",
                "is_primary_admin": not existing.org_users.filter(is_primary_admin=True).exists(),
            },
        )
        write_audit(
            actor=actor or user,
            entity=existing,
            action="org.joined_existing",
            after={"pan": pan},
            tenant=existing.tenant,
        )
        return existing

    if country is None:
        country = Country.objects.filter(code="NP").first()
        if country is None:
            raise DomainError("Default country (NP) is missing. Run seed_geo.", code="country_missing")
    if tenant is None:
        tenant = Tenant.objects.order_by("created_at").first()

    name = (company_name or "").strip() or f"Company {pan}"
    org = Organization.objects.create(
        tenant=tenant,
        org_type=ORG_TYPE_MAP[account_type],
        account_type=account_type,
        registration_mode=Organization.RegistrationMode.ALREADY_REGISTERED,
        registration_status=Organization.RegistrationStatus.SUBMITTED,
        company_name=name,
        slug=_unique_slug(name),
        vat_pan_no=pan,
        total_capital=Decimal(str(total_capital or 0)),
        address=address or "",
        official_phone=official_phone or user.phone or "",
        official_email=official_email or user.email or "",
        country=country,
        registration_certificate=registration_certificate,
        share_allocation_document=share_allocation_document,
        enabled_capabilities=list(DEFAULT_CAPABILITIES.get(account_type, ["hr", "governance", "docs"])),
        is_active=True,
        is_verified=False,
    )

    provision_org_structure(org, actor=actor or user)
    roles = ensure_system_roles(org)

    user.account_type = account_type
    user.platform_role = User.PlatformRole.ADMIN
    user.save(update_fields=["account_type", "platform_role"])

    OrgUser.objects.update_or_create(
        organization=org,
        user=user,
        defaults={
            "role": roles["Primary Admin"],
            "role_kind": OrgUser.RoleKind.ADMIN,
            "username": pan[:64],
            "designation": "CEO",
            "is_primary_admin": True,
        },
    )

    create_shareholders(org, _parse_shareholders(shareholders), actor=actor or user)
    create_governance_documents(org, owner=user, actor=actor or user)

    for doc in documents or []:
        if not isinstance(doc, dict) or not doc.get("file"):
            continue
        CompanyDocument.objects.create(
            organization=org,
            kind=doc.get("kind") or CompanyDocument.DocKind.OTHER,
            title=doc.get("title") or "",
            file=doc["file"],
            uploaded_by=user,
        )

    from core.models import CompanyLeadershipSeat, LeadershipRoleDefinition

    ceo_def = LeadershipRoleDefinition.objects.filter(code="CEO", is_active=True).first()
    if ceo_def:
        seat, _ = CompanyLeadershipSeat.objects.get_or_create(
            organization=org, role_definition=ceo_def
        )
        seat.user = user
        seat.is_filled = True
        seat.save(update_fields=["user", "is_filled"])

    write_audit(
        actor=actor or user,
        entity=org,
        action="org.registered_existing",
        after={"pan": pan, "account_type": account_type},
        tenant=org.tenant,
    )
    return org


def serialize_shareholder(sh) -> dict[str, Any]:
    return {
        "id": str(sh.id),
        "user_id": str(sh.user_id) if sh.user_id else None,
        "full_name": sh.full_name,
        "share_units": sh.share_units,
        "percentage": float(sh.percentage),
        "is_default": sh.is_default,
        "citizenship_document": sh.citizenship_document.url if sh.citizenship_document else None,
        "notes": sh.notes,
    }


def serialize_leadership_seat(seat) -> dict[str, Any]:
    role = seat.role_definition
    return {
        "id": str(seat.id),
        "role_code": role.code,
        "role_name": seat.title_override or role.name,
        "tier": role.tier,
        "reports_to_code": role.reports_to_code,
        "department_code": role.department_code,
        "department_name": role.department_name,
        "user_id": str(seat.user_id) if seat.user_id else None,
        "employee_id": str(seat.employee_id) if seat.employee_id else None,
        "is_filled": seat.is_filled,
        "sort_order": role.sort_order,
    }


def serialize_organization_registration(org) -> dict[str, Any]:
    return {
        "id": str(org.id),
        "company_name": org.company_name,
        "slug": org.slug,
        "account_type": org.account_type,
        "registration_mode": org.registration_mode,
        "registration_status": org.registration_status,
        "vat_pan_no": org.vat_pan_no,
        "managing_director_name": org.managing_director_name,
        "total_capital": float(org.total_capital or 0),
        "is_verified": org.is_verified,
        "address": org.address,
        "official_phone": org.official_phone,
        "official_email": org.official_email,
        "registration_certificate": (
            org.registration_certificate.url if org.registration_certificate else None
        ),
        "share_allocation_document": (
            org.share_allocation_document.url if org.share_allocation_document else None
        ),
        "shareholders": [serialize_shareholder(s) for s in org.shareholders.all()],
        "leadership": [
            serialize_leadership_seat(s)
            for s in org.leadership_seats.select_related("role_definition").all()
        ],
    }
