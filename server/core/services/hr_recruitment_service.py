"""HR recruitment — rules 80–81, 89."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from core.services.common import DomainError, notify, status_snapshot, today, write_audit


@transaction.atomic
def publish_vacancy(vacancy, *, actor=None):
    """JobVacancy active → FeedPost(job_vacancy); set feed_post_id."""
    from core.models import FeedPost, JobVacancy

    before = status_snapshot(vacancy, ["status"])
    vacancy.status = JobVacancy.Status.ACTIVE
    if not vacancy.open_date:
        vacancy.open_date = today()
    post = FeedPost.objects.create(
        author_type=FeedPost.AuthorType.ORGANIZATION,
        author_organization=vacancy.organization,
        post_type=FeedPost.PostType.JOB_VACANCY,
        title=vacancy.title,
        body=vacancy.description or vacancy.title,
        status=FeedPost.Status.PUBLISHED,
        published_at=timezone.now(),
    )
    vacancy.feed_post = post
    vacancy.save(update_fields=["status", "feed_post", "open_date"])
    write_audit(actor=actor, entity=vacancy, action="vacancy.published", before=before)
    return vacancy, post


@transaction.atomic
def apply_to_vacancy(
    vacancy,
    *,
    user,
    full_name: str = "",
    phone: str = "",
    email: str = "",
    cover_letter: str = "",
    cv_link: str = "",
    edu_doc=None,
    exp_years=0,
    actor=None,
):
    """Default-account user applies to a published vacancy."""
    from core.models import JobApplicant, JobVacancy, User

    if vacancy.status != JobVacancy.Status.ACTIVE:
        raise DomainError("This vacancy is not open for applications.", code="vacancy_closed")

    if user.account_type not in (User.AccountType.DEFAULT, User.AccountType.CONSUMER):
        # Staff/admins may still apply, but primary audience is Default users
        pass

    existing = JobApplicant.objects.filter(vacancy=vacancy, user=user).first()
    if existing:
        raise DomainError("You have already applied to this vacancy.", code="already_applied")

    profile = getattr(user, "profile", None)
    applicant = JobApplicant.objects.create(
        vacancy=vacancy,
        user=user,
        full_name=full_name or (profile.full_name if profile else "") or user.get_full_name() or user.username,
        phone=phone or user.phone or "",
        email=email or user.email or "",
        cover_letter=cover_letter or "",
        cv_link=cv_link or "",
        edu_doc=edu_doc,
        exp_years=exp_years or 0,
        current_stage=JobApplicant.Stage.APPLIED,
    )
    write_audit(actor=actor or user, entity=applicant, action="applicant.applied")
    return applicant


@transaction.atomic
def review_applicant(applicant, *, stage: str, review_notes: str = "", reviewer=None, actor=None):
    """HR reviews/approves/rejects a Default-user application."""
    from core.models import JobApplicant

    allowed = {
        JobApplicant.Stage.SHORTLISTED,
        JobApplicant.Stage.INTERVIEWED,
        JobApplicant.Stage.APPROVED,
        JobApplicant.Stage.REJECTED,
        JobApplicant.Stage.HIRED,
    }
    if stage not in allowed:
        raise DomainError(f"Invalid review stage: {stage}", code="invalid_stage")

    before = status_snapshot(applicant, ["current_stage"])
    applicant.current_stage = stage
    applicant.review_notes = review_notes or applicant.review_notes
    applicant.reviewed_by = reviewer
    applicant.reviewed_at = timezone.now()
    applicant.save(
        update_fields=["current_stage", "review_notes", "reviewed_by", "reviewed_at"]
    )

    if stage == JobApplicant.Stage.HIRED:
        hire_applicant(applicant, user=applicant.user, actor=actor or reviewer)

    if applicant.user_id:
        notify(
            applicant.user,
            title=f"Application {stage}",
            body=f"Your application for {applicant.vacancy.title} is now: {stage}",
            type="reminder",
        )

    write_audit(
        actor=actor or reviewer,
        entity=applicant,
        action="applicant.reviewed",
        before=before,
        after=status_snapshot(applicant, ["current_stage"]),
    )
    return applicant


@transaction.atomic
def hire_applicant(applicant, *, scoring=None, user=None, actor=None):
    """
    Hired → Employee + OnboardingProcess + onboarding tasks;
    OrgUser/User if needed; Vacancy fulfilled when filled.
    """
    from core.models import (
        Employee,
        EmployeeOnboardingTask,
        JobApplicant,
        JobVacancy,
        OnboardingProcess,
        OrgUser,
        Role,
        SelectionScoring,
    )

    vacancy = applicant.vacancy
    before = status_snapshot(applicant, ["current_stage"])
    applicant.current_stage = JobApplicant.Stage.HIRED
    applicant.save(update_fields=["current_stage"])

    if scoring is not None:
        scoring.status = SelectionScoring.Status.HIRED
        scoring.save(update_fields=["status"])

    hire_user = user or applicant.user
    n = Employee.objects.filter(organization=vacancy.organization).count() + 1
    emp = Employee.objects.create(
        organization=vacancy.organization,
        user=hire_user,
        employee_code=f"EMP-{timezone.now():%Y%m%d}-{n:04d}",
        full_name=applicant.full_name,
        position=vacancy.target_position,
        join_date=today(),
        status=Employee.Status.ACTIVE,
    )
    OnboardingProcess.objects.create(employee=emp, joined_date=today())
    for task_name in [
        "Digital setup",
        "Dept introduction",
        "SOP reading",
        "App training",
        "Gurukul courses",
        "Factory visit",
        "Week review",
    ]:
        EmployeeOnboardingTask.objects.create(employee=emp, task_name=task_name)

    vacancy.status = JobVacancy.Status.FULFILLED
    vacancy.save(update_fields=["status"])

    if hire_user:
        staff_role = Role.objects.filter(
            organization=vacancy.organization, name="Staff"
        ).first()
        OrgUser.objects.update_or_create(
            organization=vacancy.organization,
            user=hire_user,
            defaults={
                "role": staff_role,
                "role_kind": OrgUser.RoleKind.STAFF,
                "username": hire_user.username[:64],
                "designation": vacancy.target_position.designation if vacancy.target_position_id else "",
                "is_primary_admin": False,
            },
        )
        notify(hire_user, title="Welcome aboard", body=f"Hired for {vacancy.title}", type="reminder")

    write_audit(actor=actor, entity=applicant, action="applicant.hired", before=before)
    return emp


@transaction.atomic
def evaluate_training(training_log, *, actor=None, pass_score: int = 80):
    """exam_score < 80 → flag incomplete / block role stage."""
    incomplete = training_log.exam_score is not None and training_log.exam_score < pass_score
    write_audit(
        actor=actor,
        entity=training_log,
        action="training.evaluated",
        after={"incomplete": incomplete, "score": training_log.exam_score},
    )
    return not incomplete
