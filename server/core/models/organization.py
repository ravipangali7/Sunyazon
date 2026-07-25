"""Organization structure — companies, roles, modules, departments, meetings."""

from __future__ import annotations

from django.db import models

from .base import TimeStampedModel, TenantScopedModel, UUIDPrimaryKeyModel


class Module(UUIDPrimaryKeyModel, TimeStampedModel):
    """App/module registry for Odoo-style launcher boxes."""

    class Category(models.TextChoices):
        WORKSPACE = "workspace", "Workspace"
        CONSUMER = "consumer", "Consumer"
        ADMIN = "admin", "Admin"
        SYSTEM = "system", "System"

    code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=64, blank=True, help_text="Lucide icon name, e.g. Boxes")
    color = models.CharField(max_length=16, blank=True, default="#F25C05")
    route_path = models.CharField(max_length=128, help_text="Frontend path, e.g. /inventory")
    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        default=Category.WORKSPACE,
        db_index=True,
    )
    sort_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class Organization(TenantScopedModel, TimeStampedModel):
    class OrgType(models.TextChoices):
        MANUFACTURER = "manufacturer", "Manufacturer"
        PRODUCER = "producer", "Producer"
        DISTRIBUTOR = "distributor", "Distributor"
        WHOLESALER = "wholesaler", "Wholesaler"
        RETAILER = "retailer", "Retailer"
        CONSUMER_ORG = "consumer_org", "Consumer Organization"
        SUPPLIER = "supplier", "Supplier"
        SOFTWARE = "software", "Software"
        CONSTRUCTION = "construction", "Construction"
        MARKETING = "marketing", "Marketing"
        SERVICES = "services", "Services"
        OTHER = "other", "Other"

    class AccountType(models.TextChoices):
        PRODUCER = "producer", "Producer"
        MANUFACTURE = "manufacture", "Manufacture"  # legacy alias
        DISTRIBUTOR = "distributor", "Distributor"
        WHOLESALER = "wholesaler", "Wholesaler"
        WHOLESELLER_SOLE = "wholeseller_sole", "Wholeseller (Sole)"  # legacy
        RETAILER = "retailer", "Retailer"
        SOFTWARE = "software", "Software"
        CONSTRUCTION = "construction", "Construction"
        MARKETING = "marketing", "Marketing"
        SERVICES = "services", "Services"
        CUSTOM = "custom", "Custom"

    class RegistrationMode(models.TextChoices):
        PVT_LTD = "pvt_ltd", "Private Limited (PVT LTD)"
        NON_PVT_LTD = "non_pvt_ltd", "Non-Private Limited (Non-PVT LTD)"
        # Legacy values kept for existing rows
        ALREADY_REGISTERED = "already_registered", "Already Registered Company"
        NEW_COMPANY = "new_company", "New Company"

    class RegistrationStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    parent_org = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subsidiaries",
    )
    org_type = models.CharField(
        max_length=32,
        choices=OrgType.choices,
        default=OrgType.OTHER,
        db_index=True,
    )
    account_type = models.CharField(
        max_length=32,
        choices=AccountType.choices,
        default=AccountType.CUSTOM,
        db_index=True,
    )
    registration_mode = models.CharField(
        max_length=32,
        choices=RegistrationMode.choices,
        blank=True,
        db_index=True,
    )
    registration_status = models.CharField(
        max_length=32,
        choices=RegistrationStatus.choices,
        default=RegistrationStatus.DRAFT,
        db_index=True,
    )
    industry_template_code = models.CharField(max_length=64, blank=True, null=True)
    enabled_capabilities = models.JSONField(default=list, blank=True)
    company_name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=128, unique=True)
    vat_pan_no = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        null=True,
        blank=True,
        help_text="Required for already-registered companies.",
    )
    total_capital = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Authorized / total capital in NPR.",
    )
    managing_director_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Managing Director name (used for Non-PVT LTD registration).",
    )
    registration_certificate = models.FileField(
        upload_to="organizations/registration_certificates/",
        blank=True,
        null=True,
    )
    share_allocation_document = models.FileField(
        upload_to="organizations/share_allocation/",
        blank=True,
        null=True,
    )
    official_phone = models.CharField(max_length=32, blank=True)
    official_email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    country = models.ForeignKey(
        "core.Country",
        on_delete=models.PROTECT,
        related_name="organizations",
    )
    logo = models.ImageField(upload_to="organizations/logos/", blank=True, null=True)
    cover_photo = models.ImageField(upload_to="organizations/covers/", blank=True, null=True)
    witness_id_for_buyer = models.ImageField(
        upload_to="organizations/witness_ids/",
        blank=True,
        null=True,
    )
    nat_pan_document = models.ImageField(
        upload_to="organizations/vat_pan/",
        blank=True,
        null=True,
    )
    bank_name = models.CharField(max_length=128, blank=True)
    bank_account_no = models.CharField(max_length=64, blank=True)
    bank_branch = models.CharField(max_length=128, blank=True)
    website = models.URLField(blank=True)
    currency = models.CharField(max_length=8, default="NPR", blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Kathmandu", blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_verified = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["company_name"]

    def __str__(self):
        return self.company_name


class Role(UUIDPrimaryKeyModel):
    class Kind(models.TextChoices):
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="roles",
    )
    name = models.CharField(max_length=128)
    kind = models.CharField(
        max_length=16,
        choices=Kind.choices,
        default=Kind.STAFF,
        db_index=True,
    )
    permissions_json = models.JSONField(
        default=dict,
        blank=True,
        help_text='Module access map, e.g. {"inventory": "F", "finance": "R"} or {"*": true}',
    )
    modules = models.ManyToManyField(
        Module,
        through="RoleModulePermission",
        related_name="roles",
        blank=True,
    )
    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ["organization", "name"]
        unique_together = [("organization", "name")]

    def __str__(self):
        return f"{self.name} ({self.organization})"


class RoleModulePermission(UUIDPrimaryKeyModel):
    """Explicit module access for a role (staff assigned modules)."""

    class AccessLevel(models.TextChoices):
        FULL = "F", "Full"
        READ = "R", "Read"
        NONE = "N", "None"

    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name="module_permissions",
    )
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )
    access_level = models.CharField(
        max_length=1,
        choices=AccessLevel.choices,
        default=AccessLevel.FULL,
    )
    # Granular RBAC actions (View/Create/Edit/Delete/Approve/Export/Import/Print)
    can_view = models.BooleanField(default=True)
    can_create = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_approve = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)
    can_import = models.BooleanField(default=False)
    can_print = models.BooleanField(default=False)

    class Meta:
        ordering = ["role", "module"]
        unique_together = [("role", "module")]
        verbose_name = "role module permission"

    def __str__(self) -> str:
        return f"{self.role.name} → {self.module.code} ({self.access_level})"

    def sync_from_access_level(self) -> None:
        """Derive action flags from legacy F/R/N when flags unset."""
        if self.access_level == self.AccessLevel.FULL:
            self.can_view = True
            self.can_create = True
            self.can_edit = True
            self.can_delete = True
            self.can_approve = True
            self.can_export = True
            self.can_import = True
            self.can_print = True
        elif self.access_level == self.AccessLevel.READ:
            self.can_view = True
            self.can_create = False
            self.can_edit = False
            self.can_delete = False
            self.can_approve = False
            self.can_export = True
            self.can_import = False
            self.can_print = True
        else:
            self.can_view = False
            self.can_create = False
            self.can_edit = False
            self.can_delete = False
            self.can_approve = False
            self.can_export = False
            self.can_import = False
            self.can_print = False

    def actions_payload(self) -> dict:
        return {
            "view": self.can_view,
            "create": self.can_create,
            "edit": self.can_edit,
            "delete": self.can_delete,
            "approve": self.can_approve,
            "export": self.can_export,
            "import": self.can_import,
            "print": self.can_print,
        }


class OrgUser(UUIDPrimaryKeyModel):
    class RoleKind(models.TextChoices):
        NONE = "none", "None"
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="org_users",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="org_memberships",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="org_users",
        null=True,
        blank=True,
    )
    role_kind = models.CharField(
        max_length=16,
        choices=RoleKind.choices,
        default=RoleKind.NONE,
        db_index=True,
        help_text="None → consumer portal; Admin → org admin dashboard; Staff → module permissions",
    )
    username = models.CharField(max_length=64, db_index=True)
    designation = models.CharField(max_length=128, blank=True)
    employee_id = models.CharField(max_length=64, blank=True, db_index=True)
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="org_users",
    )
    team = models.ForeignKey(
        "core.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="org_users",
    )
    manager = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports_org",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    is_primary_admin = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["organization", "username"]
        unique_together = [("organization", "user")]

    def __str__(self):
        return f"{self.username} @ {self.organization}"

    def save(self, *args, **kwargs):
        if self.is_primary_admin and self.role_kind == self.RoleKind.NONE:
            self.role_kind = self.RoleKind.ADMIN
        if self.role_id and self.role_kind == self.RoleKind.NONE:
            # Prefer Role.kind when membership has a role but no explicit kind
            self.role_kind = self.role.kind
        super().save(*args, **kwargs)


class Department(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="departments",
    )
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=32, db_index=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    head_employee = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_departments",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    class Meta:
        ordering = ["organization", "code"]
        unique_together = [("organization", "code")]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Branch(UUIDPrimaryKeyModel):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="branches",
    )
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=32, db_index=True)
    address = models.TextField(blank=True)
    lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["organization", "code"]
        unique_together = [("organization", "code")]
        verbose_name_plural = "branches"

    def __str__(self):
        return f"{self.code} — {self.name}"


class Team(UUIDPrimaryKeyModel):
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="teams",
    )
    name = models.CharField(max_length=128)
    leader = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_teams",
    )

    class Meta:
        ordering = ["department", "name"]

    def __str__(self):
        return f"{self.name} ({self.department})"


class BoardDeclaration(UUIDPrimaryKeyModel):
    class DeclarationType(models.TextChoices):
        BOARD = "board", "Board"
        CEO_MD = "ceo_md", "CEO / MD"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SIGNED = "signed", "Signed"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="board_declarations",
    )
    declaration_type = models.CharField(
        max_length=16,
        choices=DeclarationType.choices,
        db_index=True,
    )
    document = models.FileField(upload_to="organizations/board_declarations/", blank=True, null=True)
    signed_by = models.CharField(max_length=255, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-signed_at", "-id"]

    def __str__(self):
        return f"{self.get_declaration_type_display()} — {self.organization}"


class Meeting(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="meetings",
    )
    title = models.CharField(max_length=255)
    agenda = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(db_index=True)
    location = models.CharField(max_length=255, blank=True)
    organizer = models.ForeignKey(
        "core.Employee",
        on_delete=models.PROTECT,
        related_name="organized_meetings",
    )
    minutes_doc = models.ForeignKey(
        "core.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meeting_minutes",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.SCHEDULED,
        db_index=True,
    )

    class Meta:
        ordering = ["-scheduled_at"]

    def __str__(self):
        return f"{self.title} — {self.scheduled_at:%Y-%m-%d}"


class MeetingAttendee(UUIDPrimaryKeyModel):
    class AttendanceStatus(models.TextChoices):
        INVITED = "invited", "Invited"
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        EXCUSED = "excused", "Excused"

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="attendees",
    )
    employee = models.ForeignKey(
        "core.Employee",
        on_delete=models.CASCADE,
        related_name="meeting_attendances",
    )
    attendance_status = models.CharField(
        max_length=16,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.INVITED,
        db_index=True,
    )

    class Meta:
        ordering = ["meeting", "employee"]
        unique_together = [("meeting", "employee")]

    def __str__(self):
        return f"{self.employee} @ {self.meeting} ({self.attendance_status})"


class Shareholder(UUIDPrimaryKeyModel, TimeStampedModel):
    """Company shareholder with share units, percentage, and citizenship KYC."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="shareholders",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shareholdings",
    )
    full_name = models.CharField(max_length=255, blank=True)
    share_units = models.PositiveIntegerField(default=0)
    percentage = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    is_default = models.BooleanField(
        default=False,
        help_text="Mark as the primary / default shareholder for the company.",
    )
    citizenship_document = models.FileField(
        upload_to="organizations/shareholders/citizenship/",
        blank=True,
        null=True,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_default", "-percentage", "full_name"]

    def __str__(self):
        name = self.full_name or (str(self.user) if self.user_id else "Shareholder")
        return f"{name} ({self.percentage}%) — {self.organization}"


class CompanyDocument(UUIDPrimaryKeyModel, TimeStampedModel):
    """Supporting documents uploaded during company registration."""

    class DocKind(models.TextChoices):
        REGISTRATION_CERTIFICATE = "registration_certificate", "Company Registration Certificate"
        SHARE_ALLOCATION = "share_allocation", "Share Allocation"
        PAN = "pan", "PAN Document"
        OTHER = "other", "Other"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="company_documents",
    )
    kind = models.CharField(max_length=64, choices=DocKind.choices, db_index=True)
    title = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to="organizations/company_documents/")
    uploaded_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_company_documents",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"{self.get_kind_display()} — {self.organization}"


class LeadershipRoleDefinition(UUIDPrimaryKeyModel, TimeStampedModel):
    """Admin-configurable leadership hierarchy roles (CEO/MD, CFO, HR, …)."""

    class Tier(models.TextChoices):
        TOP = "top", "CEO / MD"
        EXECUTIVE = "executive", "Executive Team"
        HR = "hr", "HR Department"

    code = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=128)
    tier = models.CharField(max_length=16, choices=Tier.choices, db_index=True)
    reports_to_code = models.CharField(
        max_length=64,
        blank=True,
        help_text="Code of the parent leadership role (empty for top).",
    )
    department_code = models.CharField(max_length=32, blank=True)
    department_name = models.CharField(max_length=128, blank=True)
    sort_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True, db_index=True)
    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class CompanyLeadershipSeat(UUIDPrimaryKeyModel, TimeStampedModel):
    """Per-organization assignment of a user/employee to a leadership role."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="leadership_seats",
    )
    role_definition = models.ForeignKey(
        LeadershipRoleDefinition,
        on_delete=models.PROTECT,
        related_name="seats",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leadership_seats",
    )
    employee = models.ForeignKey(
        "core.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leadership_seats",
    )
    title_override = models.CharField(max_length=128, blank=True)
    is_filled = models.BooleanField(default=False)

    class Meta:
        ordering = ["role_definition__sort_order"]
        unique_together = [("organization", "role_definition")]

    def __str__(self):
        return f"{self.role_definition.code} @ {self.organization}"
