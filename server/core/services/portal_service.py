"""Resolve post-login portal destination from account_type, role, and modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.db.models import Q

from core.models import Module, OrgUser, RoleModulePermission, User


ACCOUNT_ADMIN_PORTALS = {
    User.AccountType.PRODUCER: "producer_admin",
    User.AccountType.DISTRIBUTOR: "distributor_admin",
    User.AccountType.WHOLESALER: "wholesaler_admin",
    User.AccountType.RETAILER: "retailer_admin",
}

ACCOUNT_ADMIN_ROUTES = {
    "producer_admin": "/portal/producer",
    "distributor_admin": "/portal/distributor",
    "wholesaler_admin": "/portal/wholesaler",
    "retailer_admin": "/portal/retailer",
}


@dataclass
class ModuleDTO:
    code: str
    name: str
    description: str
    icon: str
    color: str
    route_path: str
    category: str
    access_level: str = "F"
    actions: dict[str, bool] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        actions = self.actions or _actions_from_level(self.access_level)
        return {
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "color": self.color,
            "route_path": self.route_path,
            "category": self.category,
            "access_level": self.access_level,
            "actions": actions,
        }


def _actions_from_level(level: str) -> dict[str, bool]:
    if level == "F":
        return {k: True for k in ("view", "create", "edit", "delete", "approve", "export", "import", "print")}
    if level == "R":
        return {
            "view": True,
            "create": False,
            "edit": False,
            "delete": False,
            "approve": False,
            "export": True,
            "import": False,
            "print": True,
        }
    return {k: False for k in ("view", "create", "edit", "delete", "approve", "export", "import", "print")}


@dataclass
class PortalResolution:
    portal: str
    redirect_to: str
    show_module_launcher: bool
    role_kind: str
    account_type: str
    organization_id: str | None = None
    organization_name: str | None = None
    modules: list[ModuleDTO] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "portal": self.portal,
            "redirect_to": self.redirect_to,
            "show_module_launcher": self.show_module_launcher,
            "role_kind": self.role_kind,
            "account_type": self.account_type,
            "organization_id": self.organization_id,
            "organization_name": self.organization_name,
            "modules": [m.as_dict() for m in self.modules],
        }


def _module_dto(module: Module, access_level: str = "F", actions: dict[str, bool] | None = None) -> ModuleDTO:
    return ModuleDTO(
        code=module.code,
        name=module.name,
        description=module.description,
        icon=module.icon or "LayoutGrid",
        color=module.color or "#F25C05",
        route_path=module.route_path,
        category=module.category,
        access_level=access_level,
        actions=actions or _actions_from_level(access_level),
    )


def _all_active_modules() -> list[ModuleDTO]:
    return [_module_dto(m) for m in Module.objects.filter(is_active=True)]


def _modules_for_codes(codes: set[str], access_map: dict[str, str] | None = None) -> list[ModuleDTO]:
    access_map = access_map or {}
    qs = Module.objects.filter(is_active=True, code__in=codes).order_by("sort_order", "name")
    return [_module_dto(m, access_map.get(m.code, "F")) for m in qs]


def _modules_from_org_capabilities(org) -> list[ModuleDTO]:
    caps = set(org.enabled_capabilities or [])
    if not caps or "*" in caps:
        return _all_active_modules()
    # Match module codes against capability codes (same vocabulary)
    qs = Module.objects.filter(is_active=True).filter(
        Q(code__in=caps) | Q(category=Module.Category.SYSTEM)
    )
    return [_module_dto(m) for m in qs.order_by("sort_order", "name")]


def _modules_from_role(role, org) -> list[ModuleDTO]:
    perms = role.permissions_json or {}
    if perms.get("*") is True:
        return _modules_from_org_capabilities(org)

    # Explicit RoleModulePermission rows win
    rmp_qs = (
        RoleModulePermission.objects.filter(role=role)
        .exclude(access_level=RoleModulePermission.AccessLevel.NONE)
        .select_related("module")
        .order_by("module__sort_order", "module__name")
    )
    if rmp_qs.exists():
        out = []
        for rmp in rmp_qs:
            if not rmp.module.is_active:
                continue
            actions = rmp.actions_payload()
            if not any(actions.values()) and rmp.access_level == "F":
                actions = _actions_from_level("F")
            elif not any(actions.values()) and rmp.access_level == "R":
                actions = _actions_from_level("R")
            out.append(_module_dto(rmp.module, rmp.access_level, actions))
        return out

    # Fallback: permissions_json keys that are module codes
    codes = {k for k, v in perms.items() if v and v != "N" and k != "*"}
    if codes:
        return _modules_for_codes(codes, {k: str(v) for k, v in perms.items()})

    return []


def _pick_membership(user: User) -> OrgUser | None:
    return (
        user.org_memberships.select_related("organization", "role")
        .filter(organization__is_active=True)
        .order_by("-is_primary_admin", "created_at")
        .first()
    )


def resolve_portal(user: User, membership: OrgUser | None = None) -> PortalResolution:
    """Apply login → dashboard routing rules."""
    account_type = user.account_type

    if user.is_platform_super_admin or account_type == User.AccountType.SUPER_ADMIN:
        modules = _all_active_modules()
        return PortalResolution(
            portal="super_admin",
            redirect_to="/super-admin",
            modules=modules,
        )

    membership = membership or _pick_membership(user)
    role_kind = user.platform_role or User.PlatformRole.NONE
    org = None
    if membership:
        org = membership.organization
        role_kind = membership.role_kind or role_kind
        if membership.is_primary_admin:
            role_kind = OrgUser.RoleKind.ADMIN

    # Role None → Default / Consumer Dashboard (ecommerce + social + jobs)
    if role_kind in ("", User.PlatformRole.NONE, OrgUser.RoleKind.NONE, None):
        # Business account without completed org membership → company registration wizard
        if account_type in ACCOUNT_ADMIN_PORTALS and not membership:
            return PortalResolution(
                portal="company_registration",
                redirect_to="/register/company",
                show_module_launcher=False,
                role_kind=User.PlatformRole.NONE,
                account_type=account_type,
                modules=[],
            )

        consumer_modules = [
            m
            for m in Module.objects.filter(
                is_active=True,
                category=Module.Category.CONSUMER,
            ).order_by("sort_order")
        ]
        dtos = [_module_dto(m) for m in consumer_modules] or [
            ModuleDTO(
                code="commerce",
                name="E-commerce",
                description="Shop and orders",
                icon="Store",
                color="#F25C05",
                route_path="/commerce",
                category="consumer",
            ),
            ModuleDTO(
                code="feed",
                name="Social Media",
                description="Feed and community",
                icon="Newspaper",
                color="#FF6F1F",
                route_path="/feed",
                category="consumer",
            ),
        ]
        # Ensure jobs module for Default (HR Form Applicant) users
        if not any(m.code == "jobs" for m in dtos):
            jobs_mod = Module.objects.filter(code="jobs", is_active=True).first()
            if jobs_mod:
                dtos.append(_module_dto(jobs_mod))
            else:
                dtos.append(
                    ModuleDTO(
                        code="jobs",
                        name="Job Vacancies",
                        description="Browse and apply to open positions",
                        icon="Briefcase",
                        color="#0EA5E9",
                        route_path="/jobs",
                        category="consumer",
                    )
                )
        return PortalResolution(
            portal="consumer",
            redirect_to="/customer",
            show_module_launcher=False,
            role_kind=User.PlatformRole.NONE,
            account_type=account_type,
            organization_id=str(org.id) if org else None,
            organization_name=org.company_name if org else None,
            modules=dtos,
        )

    # Org Admin → respective admin portal (+ module launcher with all org modules)
    if role_kind == OrgUser.RoleKind.ADMIN:
        portal = ACCOUNT_ADMIN_PORTALS.get(account_type, "org_admin")
        modules = _modules_from_org_capabilities(org) if org else _all_active_modules()
        if membership and membership.role_id:
            role_modules = _modules_from_role(membership.role, org)
            if role_modules:
                modules = role_modules
        redirect = ACCOUNT_ADMIN_ROUTES.get(portal, "/apps")
        return PortalResolution(
            portal=portal,
            redirect_to=redirect,
            show_module_launcher=len(modules) > 1,
            role_kind=role_kind,
            account_type=account_type,
            organization_id=str(org.id) if org else None,
            organization_name=org.company_name if org else None,
            modules=modules,
        )

    # Staff → assigned permissions
    modules: list[ModuleDTO] = []
    if membership and membership.role_id and org:
        modules = _modules_from_role(membership.role, org)
    elif org:
        modules = _modules_from_org_capabilities(org)

    if len(modules) == 0:
        return PortalResolution(
            portal="employee",
            redirect_to="/",
            show_module_launcher=False,
            role_kind=role_kind,
            account_type=account_type,
            organization_id=str(org.id) if org else None,
            organization_name=org.company_name if org else None,
            modules=[],
        )

    if len(modules) == 1:
        return PortalResolution(
            portal="staff_module",
            redirect_to=modules[0].route_path,
            show_module_launcher=False,
            role_kind=role_kind,
            account_type=account_type,
            organization_id=str(org.id) if org else None,
            organization_name=org.company_name if org else None,
            modules=modules,
        )

    return PortalResolution(
        portal="module_launcher",
        redirect_to="/apps",
        show_module_launcher=True,
        role_kind=role_kind,
        account_type=account_type,
        organization_id=str(org.id) if org else None,
        organization_name=org.company_name if org else None,
        modules=modules,
    )
