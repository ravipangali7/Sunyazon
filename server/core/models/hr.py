"""HR & administration — positions, employees, recruitment, attendance, payroll."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, UUIDPrimaryKeyModel


class PositionMaster(UUIDPrimaryKeyModel):
    class LeadershipTier(models.TextChoices):
        NONE = "none", "None"
        TOP = "top", "CEO / MD"
        EXECUTIVE = "executive", "Executive Team"
        HR = "hr", "HR Department"

    code = models.CharField(max_length=64, blank=True, db_index=True)
    designation = models.CharField(max_length=128)
    department = models.CharField(max_length=128, blank=True)
    min_edu = models.CharField(max_length=128, blank=True)
    experience = models.CharField(max_length=128, blank=True)
    leadership_tier = models.CharField(
        max_length=16,
        choices=LeadershipTier.choices,
        default=LeadershipTier.NONE,
        db_index=True,
    )
    sort_order = models.PositiveIntegerField(default=100)
    is_system = models.BooleanField(default=False)
    reports_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subordinate_positions",
    )

    class Meta:
        ordering = ["sort_order", "designation"]

    def __str__(self):
        return self.designation


class Employee(UUIDPrimaryKeyModel):
    class Classification(models.TextChoices):
        PERMANENT = "permanent", "Permanent"
        CONTRACT = "contract", "Contract"
        TEMPORARY = "temporary", "Temporary"
        DAILY = "daily", "Daily"
        INTERN = "intern", "Intern"

    class Grade(models.TextChoices):
        G1 = "G1", "G1"
        G2 = "G2", "G2"
        G3 = "G3", "G3"
        G4 = "G4", "G4"
        G5 = "G5", "G5"
        G6 = "G6", "G6"
        G7 = "G7", "G7"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ON_LEAVE = "on_leave", "On Leave"
        SUSPENDED = "suspended", "Suspended"
        EXITED = "exited", "Exited"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="employees",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_records",
    )
    employee_code = models.CharField(max_length=32, db_index=True)
    full_name = models.CharField(max_length=255)
    citizenship_no = models.CharField(max_length=64, blank=True)
    pan_no = models.CharField(max_length=64, blank=True)
    photo = models.ImageField(upload_to="hr/employees/", blank=True, null=True)
    classification = models.CharField(
        max_length=16,
        choices=Classification.choices,
        default=Classification.PERMANENT,
        db_index=True,
    )
    grade = models.CharField(max_length=4, choices=Grade.choices, default=Grade.G1)
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    position = models.ForeignKey(
        PositionMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    reporting_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports",
    )
    join_date = models.DateField(null=True, blank=True)
    probation_end = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["organization", "employee_code"]
        unique_together = [("organization", "employee_code")]

    def __str__(self):
        return f"{self.employee_code} — {self.full_name}"


class JobVacancy(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"
        FULFILLED = "fulfilled", "Fulfilled"

    vacancy_code = models.CharField(max_length=32, unique=True)
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="job_vacancies",
    )
    target_position = models.ForeignKey(
        PositionMaster,
        on_delete=models.PROTECT,
        related_name="vacancies",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    open_date = models.DateField(null=True, blank=True)
    close_date = models.DateField(null=True, blank=True)
    hiring_manager = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_vacancies",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    feed_post = models.ForeignKey(
        "core.FeedPost",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="job_vacancies",
    )

    class Meta:
        verbose_name_plural = "job vacancies"
        ordering = ["-open_date"]

    def __str__(self):
        return f"{self.vacancy_code} — {self.title}"


class JobApplicant(UUIDPrimaryKeyModel):
    class Stage(models.TextChoices):
        APPLIED = "applied", "Applied"
        SHORTLISTED = "shortlisted", "Shortlisted"
        INTERVIEWED = "interviewed", "Interviewed"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        HIRED = "hired", "Hired"

    vacancy = models.ForeignKey(
        JobVacancy,
        on_delete=models.CASCADE,
        related_name="applicants",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="job_applications",
        help_text="Default-account applicant (HR Form Applicant).",
    )
    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    edu_doc = models.FileField(upload_to="hr/applicants/docs/", blank=True, null=True)
    exp_years = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    cv_link = models.URLField(blank=True)
    cover_letter = models.TextField(blank=True)
    current_stage = models.CharField(
        max_length=16,
        choices=Stage.choices,
        default=Stage.APPLIED,
        db_index=True,
    )
    reviewed_by = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_applications",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    applied_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    class Meta:
        ordering = ["vacancy", "full_name"]
        unique_together = [("vacancy", "user")]

    def __str__(self):
        return f"{self.full_name} → {self.vacancy}"


class SelectionScoring(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        HIRED = "hired", "Hired"
        WAITLIST = "waitlist", "Waitlist"
        REJECTED = "rejected", "Rejected"

    applicant = models.ForeignKey(
        JobApplicant,
        on_delete=models.CASCADE,
        related_name="scorings",
    )
    interviewer = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="interview_scorings",
    )
    score = models.PositiveSmallIntegerField(default=0, help_text="1–100")
    remarks = models.CharField(max_length=512, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.WAITLIST,
        db_index=True,
    )

    class Meta:
        ordering = ["-score"]

    def __str__(self):
        return f"{self.applicant} — {self.score}/100"


class OnboardingProcess(UUIDPrimaryKeyModel):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="onboarding_processes",
    )
    offer_letter = models.FileField(upload_to="hr/offer_letters/", blank=True, null=True)
    joined_date = models.DateField(null=True, blank=True)
    probation_period_months = models.PositiveSmallIntegerField(default=3)
    gurukul_status = models.CharField(max_length=128, blank=True)

    class Meta:
        verbose_name_plural = "onboarding processes"

    def __str__(self):
        return f"Onboarding {self.employee}"


class EmployeeOnboardingTask(UUIDPrimaryKeyModel):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="onboarding_tasks",
    )
    task_name = models.CharField(max_length=255)
    due_date = models.DateField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    manager_remark = models.CharField(max_length=512, blank=True)

    class Meta:
        ordering = ["due_date"]

    def __str__(self):
        return f"{self.task_name} ({self.employee})"


class TrainingLog(UUIDPrimaryKeyModel):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="training_logs",
    )
    module_name = models.CharField(max_length=255)
    watch_time = models.DurationField(null=True, blank=True)
    exam_score = models.PositiveSmallIntegerField(default=0, help_text="Min pass: 80")
    completion_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-completion_date"]

    def __str__(self):
        return f"{self.module_name} — {self.employee}"


class Attendance(UUIDPrimaryKeyModel):
    class Shift(models.TextChoices):
        A = "A", "Shift A"
        B = "B", "Shift B"
        C = "C", "Shift C"

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        HALF_DAY = "half_day", "Half Day"
        LEAVE = "leave", "Leave"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    date = models.DateField(db_index=True)
    shift = models.CharField(max_length=2, choices=Shift.choices, default=Shift.A)
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    ot_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PRESENT,
        db_index=True,
    )

    class Meta:
        ordering = ["-date"]
        unique_together = [("employee", "date")]
        verbose_name_plural = "attendances"

    def __str__(self):
        return f"{self.employee} @ {self.date} ({self.status})"


class LeaveRequest(UUIDPrimaryKeyModel):
    class LeaveType(models.TextChoices):
        CASUAL = "casual", "Casual"
        SICK = "sick", "Sick"
        FESTIVAL = "festival", "Festival"
        MATERNITY = "maternity", "Maternity"
        PATERNITY = "paternity", "Paternity"

    class ApprovalStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    leave_type = models.CharField(max_length=16, choices=LeaveType.choices, db_index=True)
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField(blank=True)
    approval_status = models.CharField(
        max_length=16,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING,
        db_index=True,
    )
    approved_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_leaves",
    )

    class Meta:
        ordering = ["-from_date"]

    def __str__(self):
        return f"{self.employee} {self.leave_type} {self.from_date}→{self.to_date}"


class PayrollRun(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PROCESSED = "processed", "Processed"
        APPROVED = "approved", "Approved"
        PAID = "paid", "Paid"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="payroll_runs",
    )
    period_month = models.CharField(max_length=7, help_text="YYYY-MM", db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_payroll_runs",
    )

    class Meta:
        ordering = ["-period_month"]
        unique_together = [("organization", "period_month")]

    def __str__(self):
        return f"Payroll {self.period_month} ({self.organization})"


class PayrollLine(UUIDPrimaryKeyModel):
    payroll_run = models.ForeignKey(
        PayrollRun,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="payroll_lines",
    )
    basic = CurrencyField()
    allowances = CurrencyField()
    deductions = CurrencyField()
    ot_amount = CurrencyField()
    net_pay = CurrencyField()

    class Meta:
        unique_together = [("payroll_run", "employee")]

    def __str__(self):
        return f"{self.employee} — {self.net_pay}"
