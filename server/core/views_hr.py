"""HR module APIs — positions, employees, onboarding, training, attendance, leave, payroll.

Recruitment (vacancies / applications) remains in views_company.py.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    Attendance,
    Department,
    Employee,
    EmployeeOnboardingTask,
    LeaveRequest,
    OnboardingProcess,
    PayrollLine,
    PayrollRun,
    PositionMaster,
    TrainingLog,
)
from core.services.common import DomainError
from core.services.leave_service import approve_leave, exit_employee, reject_leave
from core.services.payroll_service import approve_payroll, pay_payroll, process_payroll
from core.views_domain import DomainAuthMixin, _iso, org_filter, resolve_org, serialize_attendance, serialize_employee


def _domain_error(exc: DomainError, http_status=400):
    return Response({"detail": str(exc), "code": getattr(exc, "code", "error")}, status=http_status)


def _decimal(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, "year"):
        return value
    return parse_date(str(value))


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    dt = parse_datetime(str(value))
    if dt:
        return dt
    # Accept "HH:MM" as today local
    try:
        parts = str(value).split(":")
        if len(parts) >= 2:
            today = timezone.localdate()
            return timezone.make_aware(
                datetime(today.year, today.month, today.day, int(parts[0]), int(parts[1]))
            )
    except (ValueError, TypeError):
        pass
    return None


def _paginate(qs, request, *, default_page_size=50):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(200, max(1, int(request.query_params.get("page_size") or default_page_size)))
    except (TypeError, ValueError):
        page_size = default_page_size
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start : start + page_size])
    return items, {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ── Serializers ──────────────────────────────────────────────────────────────


def serialize_position(p: PositionMaster) -> dict:
    return {
        "id": str(p.id),
        "code": p.code or "",
        "designation": p.designation,
        "department": p.department or "",
        "min_edu": p.min_edu or "",
        "experience": p.experience or "",
        "leadership_tier": str(p.leadership_tier or ""),
        "sort_order": p.sort_order,
        "is_system": p.is_system,
        "reports_to_id": str(p.reports_to_id) if p.reports_to_id else None,
        "reports_to_name": p.reports_to.designation if p.reports_to_id else None,
        "employee_count": getattr(p, "_employee_count", None)
        if hasattr(p, "_employee_count")
        else p.employees.count(),
    }


def serialize_employee_full(e: Employee) -> dict:
    base = serialize_employee(e)
    base.update(
        {
            "citizenship_no": e.citizenship_no,
            "pan_no": e.pan_no,
            "classification": e.classification,
            "grade": e.grade,
            "position_id": str(e.position_id) if e.position_id else None,
            "reporting_to_id": str(e.reporting_to_id) if e.reporting_to_id else None,
            "probation_end": _iso(e.probation_end),
            "organization_id": str(e.organization_id) if e.organization_id else None,
            "user_id": str(e.user_id) if e.user_id else None,
            "raw_status": e.status,
        }
    )
    return base


def serialize_attendance_full(a: Attendance) -> dict:
    data = serialize_attendance(a)
    data.update(
        {
            "shift": a.shift,
            "ot_hours": float(a.ot_hours or 0),
            "raw_status": a.status,
            "employee_code": a.employee.employee_code if a.employee_id else "",
        }
    )
    return data


def serialize_onboarding(o: OnboardingProcess) -> dict:
    tasks = list(o.employee.onboarding_tasks.all()[:50]) if o.employee_id else []
    return {
        "id": str(o.id),
        "employee_id": str(o.employee_id),
        "employee_code": o.employee.employee_code if o.employee_id else "",
        "employee_name": o.employee.full_name if o.employee_id else "",
        "joined_date": _iso(o.joined_date),
        "probation_period_months": o.probation_period_months,
        "gurukul_status": o.gurukul_status,
        "has_offer_letter": bool(o.offer_letter),
        "tasks": [serialize_onboarding_task(t) for t in tasks],
        "tasks_done": sum(1 for t in tasks if t.is_completed),
        "tasks_total": len(tasks),
    }


def serialize_onboarding_task(t: EmployeeOnboardingTask) -> dict:
    return {
        "id": str(t.id),
        "employee_id": str(t.employee_id),
        "task_name": t.task_name,
        "due_date": _iso(t.due_date),
        "is_completed": t.is_completed,
        "manager_remark": t.manager_remark,
    }


def serialize_training(t: TrainingLog) -> dict:
    return {
        "id": str(t.id),
        "employee_id": str(t.employee_id),
        "employee_code": t.employee.employee_code if t.employee_id else "",
        "employee_name": t.employee.full_name if t.employee_id else "",
        "module_name": t.module_name,
        "watch_time": str(t.watch_time) if t.watch_time else None,
        "exam_score": t.exam_score,
        "passed": (t.exam_score or 0) >= 80,
        "completion_date": _iso(t.completion_date),
    }


def serialize_leave(lr: LeaveRequest) -> dict:
    days = (lr.to_date - lr.from_date).days + 1 if lr.from_date and lr.to_date else 0
    return {
        "id": str(lr.id),
        "employee_id": str(lr.employee_id),
        "employee_code": lr.employee.employee_code if lr.employee_id else "",
        "employee_name": lr.employee.full_name if lr.employee_id else "",
        "leave_type": str(lr.leave_type),
        "from_date": _iso(lr.from_date),
        "to_date": _iso(lr.to_date),
        "days": days,
        "reason": lr.reason,
        "approval_status": str(lr.approval_status),
        "approved_by_id": str(lr.approved_by_id) if lr.approved_by_id else None,
        "approved_by_name": lr.approved_by.full_name if lr.approved_by_id else None,
    }


def serialize_payroll_run(pr: PayrollRun, *, include_lines=False) -> dict:
    data = {
        "id": str(pr.id),
        "organization_id": str(pr.organization_id),
        "period_month": pr.period_month,
        "status": pr.status,
        "processed_at": _iso(pr.processed_at),
        "approved_by_id": str(pr.approved_by_id) if pr.approved_by_id else None,
        "approved_by_name": pr.approved_by.full_name if pr.approved_by_id else None,
        "line_count": pr.lines.count(),
        "total_net": float(sum((Decimal(l.net_pay or 0) for l in pr.lines.all()), Decimal("0"))),
    }
    if include_lines:
        data["lines"] = [serialize_payroll_line(l) for l in pr.lines.select_related("employee")[:500]]
    return data


def serialize_payroll_line(pl: PayrollLine) -> dict:
    return {
        "id": str(pl.id),
        "payroll_run_id": str(pl.payroll_run_id),
        "employee_id": str(pl.employee_id),
        "employee_code": pl.employee.employee_code if pl.employee_id else "",
        "employee_name": pl.employee.full_name if pl.employee_id else "",
        "basic": float(pl.basic or 0),
        "allowances": float(pl.allowances or 0),
        "deductions": float(pl.deductions or 0),
        "ot_amount": float(pl.ot_amount or 0),
        "net_pay": float(pl.net_pay or 0),
    }


def serialize_department(d: Department) -> dict:
    return {
        "id": str(d.id),
        "name": d.name,
        "code": d.code,
        "status": d.status,
    }


# ── Positions ────────────────────────────────────────────────────────────────


class HRPositionsView(DomainAuthMixin, APIView):
    def get(self, request):
        qs = PositionMaster.objects.select_related("reports_to").annotate(
            _employee_count=Count("employees")
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(designation__icontains=search)
                | Q(code__icontains=search)
                | Q(department__icontains=search)
            )
        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(department__icontains=dept)
        tier = request.query_params.get("leadership_tier")
        if tier:
            qs = qs.filter(leadership_tier=tier)
        qs = qs.order_by("sort_order", "designation")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_position(p) for p in items], **meta})

    def post(self, request):
        data = request.data
        designation = (data.get("designation") or "").strip()
        if not designation:
            return Response({"detail": "Designation is required."}, status=400)
        reports_to = None
        if data.get("reports_to_id"):
            reports_to = PositionMaster.objects.filter(pk=data["reports_to_id"]).first()
        pos = PositionMaster.objects.create(
            code=(data.get("code") or "").strip(),
            designation=designation,
            department=(data.get("department") or "").strip(),
            min_edu=(data.get("min_edu") or "").strip(),
            experience=(data.get("experience") or "").strip(),
            leadership_tier=data.get("leadership_tier") or PositionMaster.LeadershipTier.NONE,
            sort_order=int(data.get("sort_order") or 100),
            reports_to=reports_to,
        )
        return Response(serialize_position(pos), status=201)


class HRPositionDetailView(DomainAuthMixin, APIView):
    def get(self, request, position_id):
        p = PositionMaster.objects.filter(pk=position_id).select_related("reports_to").first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_position(p))

    def patch(self, request, position_id):
        p = PositionMaster.objects.filter(pk=position_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        if p.is_system and request.data.get("designation") and request.data["designation"] != p.designation:
            return Response({"detail": "System positions cannot be renamed."}, status=400)
        data = request.data
        for field in ("code", "designation", "department", "min_edu", "experience", "leadership_tier"):
            if field in data:
                setattr(p, field, data[field] if data[field] is not None else "")
        if "sort_order" in data:
            p.sort_order = int(data.get("sort_order") or 100)
        if "reports_to_id" in data:
            rid = data.get("reports_to_id")
            p.reports_to = PositionMaster.objects.filter(pk=rid).first() if rid else None
        p.save()
        return Response(serialize_position(p))

    def delete(self, request, position_id):
        p = PositionMaster.objects.filter(pk=position_id).first()
        if not p:
            return Response({"detail": "Not found."}, status=404)
        if p.is_system:
            return Response({"detail": "System positions cannot be deleted."}, status=400)
        if p.employees.exists():
            return Response({"detail": "Position has employees assigned."}, status=400)
        if p.vacancies.exists():
            return Response({"detail": "Position has linked vacancies."}, status=400)
        p.delete()
        return Response(status=204)


# ── Employees ────────────────────────────────────────────────────────────────


class HREmployeesView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(
            Employee.objects.select_related("department", "position", "user", "reporting_to", "organization"),
            org,
        )
        search = (request.query_params.get("search") or request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(employee_code__icontains=search)
                | Q(user__email__icontains=search)
                | Q(position__designation__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            # Accept UI aliases
            alias = {"resigned": "exited", "terminated": "suspended"}.get(status_f, status_f)
            qs = qs.filter(status=alias)
        dept_id = request.query_params.get("department_id")
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        classification = request.query_params.get("classification") or request.query_params.get("employment_type")
        if classification:
            qs = qs.filter(classification=classification)
        qs = qs.order_by("employee_code")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_employee_full(e) for e in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        data = request.data
        full_name = (data.get("full_name") or "").strip()
        if not full_name:
            return Response({"detail": "Full name is required."}, status=400)
        code = (data.get("employee_code") or "").strip()
        if not code:
            n = Employee.objects.filter(organization=org).count() + 1
            code = f"EMP-{n:04d}"
        if Employee.objects.filter(organization=org, employee_code=code).exists():
            return Response({"detail": "Employee code already exists."}, status=400)

        position = None
        if data.get("position_id"):
            position = PositionMaster.objects.filter(pk=data["position_id"]).first()
        department = None
        if data.get("department_id"):
            department = Department.objects.filter(pk=data["department_id"], organization=org).first()
        reporting_to = None
        if data.get("reporting_to_id"):
            reporting_to = Employee.objects.filter(pk=data["reporting_to_id"], organization=org).first()

        emp = Employee.objects.create(
            organization=org,
            employee_code=code,
            full_name=full_name,
            citizenship_no=(data.get("citizenship_no") or "").strip(),
            pan_no=(data.get("pan_no") or "").strip(),
            classification=data.get("classification") or Employee.Classification.PERMANENT,
            grade=data.get("grade") or Employee.Grade.G1,
            department=department,
            position=position,
            reporting_to=reporting_to,
            join_date=_parse_date(data.get("join_date")) or timezone.localdate(),
            probation_end=_parse_date(data.get("probation_end")),
            status=data.get("status") or Employee.Status.ACTIVE,
            user_id=data.get("user_id") or None,
        )
        # Seed onboarding if requested
        if data.get("create_onboarding", True):
            if not OnboardingProcess.objects.filter(employee=emp).exists():
                OnboardingProcess.objects.create(
                    employee=emp,
                    joined_date=emp.join_date,
                    probation_period_months=3,
                    gurukul_status="pending",
                )
        return Response(serialize_employee_full(emp), status=201)


class HREmployeeDetailView(DomainAuthMixin, APIView):
    def get(self, request, employee_id):
        org = resolve_org(request.user)
        emp = org_filter(Employee.objects.select_related("department", "position", "user", "reporting_to"), org).filter(
            pk=employee_id
        ).first()
        if not emp:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_employee_full(emp))

    def patch(self, request, employee_id):
        org = resolve_org(request.user)
        emp = org_filter(Employee.objects.all(), org).filter(pk=employee_id).first()
        if not emp:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        for field in ("full_name", "citizenship_no", "pan_no", "classification", "grade", "status"):
            if field in data and data[field] is not None:
                setattr(emp, field, data[field])
        if "employee_code" in data and data["employee_code"]:
            code = data["employee_code"].strip()
            if Employee.objects.filter(organization=org, employee_code=code).exclude(pk=emp.pk).exists():
                return Response({"detail": "Employee code already exists."}, status=400)
            emp.employee_code = code
        if "department_id" in data:
            did = data.get("department_id")
            emp.department = Department.objects.filter(pk=did, organization=org).first() if did else None
        if "position_id" in data:
            pid = data.get("position_id")
            emp.position = PositionMaster.objects.filter(pk=pid).first() if pid else None
        if "reporting_to_id" in data:
            rid = data.get("reporting_to_id")
            emp.reporting_to = (
                Employee.objects.filter(pk=rid, organization=org).exclude(pk=emp.pk).first() if rid else None
            )
        if "join_date" in data:
            emp.join_date = _parse_date(data.get("join_date"))
        if "probation_end" in data:
            emp.probation_end = _parse_date(data.get("probation_end"))
        if "user_id" in data:
            emp.user_id = data.get("user_id") or None
        emp.save()
        return Response(serialize_employee_full(emp))

    def delete(self, request, employee_id):
        org = resolve_org(request.user)
        emp = org_filter(Employee.objects.all(), org).filter(pk=employee_id).first()
        if not emp:
            return Response({"detail": "Not found."}, status=404)
        try:
            if emp.user_id:
                exit_employee(emp, actor=request.user)
            else:
                emp.status = Employee.Status.EXITED
                emp.save(update_fields=["status"])
        except DomainError as exc:
            return _domain_error(exc)
        emp.refresh_from_db()
        return Response(serialize_employee_full(emp))


class HRDepartmentsView(DomainAuthMixin, APIView):
    """Lookup list for employee forms."""

    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(Department.objects.all(), org).order_by("name")
        return Response({"results": [serialize_department(d) for d in qs[:200]]})


# ── Onboarding ───────────────────────────────────────────────────────────────


class HROnboardingView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = OnboardingProcess.objects.select_related("employee").filter(employee__organization=org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(employee__full_name__icontains=search) | Q(employee__employee_code__icontains=search)
            )
        status_f = request.query_params.get("gurukul_status")
        if status_f:
            qs = qs.filter(gurukul_status__icontains=status_f)
        qs = qs.order_by("-joined_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_onboarding(o) for o in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        emp = Employee.objects.filter(pk=request.data.get("employee_id"), organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)
        if OnboardingProcess.objects.filter(employee=emp).exists():
            return Response({"detail": "Onboarding already exists for this employee."}, status=400)
        process = OnboardingProcess.objects.create(
            employee=emp,
            joined_date=_parse_date(request.data.get("joined_date")) or emp.join_date or timezone.localdate(),
            probation_period_months=int(request.data.get("probation_period_months") or 3),
            gurukul_status=request.data.get("gurukul_status") or "pending",
        )
        # Optional seed tasks
        for name in request.data.get("tasks") or []:
            if isinstance(name, str) and name.strip():
                EmployeeOnboardingTask.objects.create(employee=emp, task_name=name.strip())
        return Response(serialize_onboarding(process), status=201)


class HROnboardingDetailView(DomainAuthMixin, APIView):
    def patch(self, request, process_id):
        org = resolve_org(request.user)
        process = OnboardingProcess.objects.select_related("employee").filter(
            pk=process_id, employee__organization=org
        ).first()
        if not process:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "joined_date" in data:
            process.joined_date = _parse_date(data.get("joined_date"))
        if "probation_period_months" in data:
            process.probation_period_months = int(data.get("probation_period_months") or 3)
        if "gurukul_status" in data:
            process.gurukul_status = data.get("gurukul_status") or ""
        process.save()
        return Response(serialize_onboarding(process))


class HROnboardingTasksView(DomainAuthMixin, APIView):
    def post(self, request):
        org = resolve_org(request.user)
        emp = Employee.objects.filter(pk=request.data.get("employee_id"), organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)
        name = (request.data.get("task_name") or "").strip()
        if not name:
            return Response({"detail": "task_name is required."}, status=400)
        task = EmployeeOnboardingTask.objects.create(
            employee=emp,
            task_name=name,
            due_date=_parse_date(request.data.get("due_date")),
            manager_remark=request.data.get("manager_remark") or "",
        )
        return Response(serialize_onboarding_task(task), status=201)


class HROnboardingTaskDetailView(DomainAuthMixin, APIView):
    def patch(self, request, task_id):
        org = resolve_org(request.user)
        task = EmployeeOnboardingTask.objects.select_related("employee").filter(
            pk=task_id, employee__organization=org
        ).first()
        if not task:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "task_name" in data:
            task.task_name = data["task_name"]
        if "due_date" in data:
            task.due_date = _parse_date(data.get("due_date"))
        if "is_completed" in data:
            task.is_completed = bool(data.get("is_completed"))
        if "manager_remark" in data:
            task.manager_remark = data.get("manager_remark") or ""
        task.save()
        return Response(serialize_onboarding_task(task))

    def delete(self, request, task_id):
        org = resolve_org(request.user)
        task = EmployeeOnboardingTask.objects.filter(pk=task_id, employee__organization=org).first()
        if not task:
            return Response({"detail": "Not found."}, status=404)
        task.delete()
        return Response(status=204)


# ── Training ─────────────────────────────────────────────────────────────────


class HRTrainingView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = TrainingLog.objects.select_related("employee").filter(employee__organization=org)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(module_name__icontains=search)
                | Q(employee__full_name__icontains=search)
                | Q(employee__employee_code__icontains=search)
            )
        emp_id = request.query_params.get("employee_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        qs = qs.order_by("-completion_date", "-id")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_training(t) for t in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        emp = Employee.objects.filter(pk=request.data.get("employee_id"), organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)
        module_name = (request.data.get("module_name") or "").strip()
        if not module_name:
            return Response({"detail": "module_name is required."}, status=400)
        log = TrainingLog.objects.create(
            employee=emp,
            module_name=module_name,
            exam_score=int(request.data.get("exam_score") or 0),
            completion_date=_parse_date(request.data.get("completion_date")) or timezone.localdate(),
        )
        return Response(serialize_training(log), status=201)


class HRTrainingDetailView(DomainAuthMixin, APIView):
    def patch(self, request, training_id):
        org = resolve_org(request.user)
        log = TrainingLog.objects.filter(pk=training_id, employee__organization=org).first()
        if not log:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "module_name" in data:
            log.module_name = data["module_name"]
        if "exam_score" in data:
            log.exam_score = int(data.get("exam_score") or 0)
        if "completion_date" in data:
            log.completion_date = _parse_date(data.get("completion_date"))
        log.save()
        return Response(serialize_training(log))

    def delete(self, request, training_id):
        org = resolve_org(request.user)
        log = TrainingLog.objects.filter(pk=training_id, employee__organization=org).first()
        if not log:
            return Response({"detail": "Not found."}, status=404)
        log.delete()
        return Response(status=204)


# ── Attendance ───────────────────────────────────────────────────────────────


class HRAttendanceView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        target = _parse_date(request.query_params.get("date")) or timezone.localdate()
        qs = Attendance.objects.select_related("employee").filter(
            employee__organization=org, date=target
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(employee__full_name__icontains=search) | Q(employee__employee_code__icontains=search)
            )
        status_f = request.query_params.get("status")
        if status_f:
            alias = {"on_leave": "leave", "late": "present"}.get(status_f, status_f)
            qs = qs.filter(status=alias)
        qs = qs.order_by("employee__full_name")
        items, meta = _paginate(qs, request, default_page_size=200)
        present = sum(1 for a in items if a.status == Attendance.Status.PRESENT)
        return Response(
            {
                "results": [serialize_attendance_full(a) for a in items],
                "date": target.isoformat(),
                "present_count": present,
                **meta,
            }
        )

    def post(self, request):
        org = resolve_org(request.user)
        emp = Employee.objects.filter(pk=request.data.get("employee_id"), organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)
        day = _parse_date(request.data.get("date")) or timezone.localdate()
        att, _created = Attendance.objects.update_or_create(
            employee=emp,
            date=day,
            defaults={
                "shift": request.data.get("shift") or Attendance.Shift.A,
                "check_in": _parse_dt(request.data.get("check_in")),
                "check_out": _parse_dt(request.data.get("check_out")),
                "ot_hours": _decimal(request.data.get("ot_hours")),
                "status": request.data.get("status") or Attendance.Status.PRESENT,
            },
        )
        return Response(serialize_attendance_full(att), status=201)


class HRAttendanceDetailView(DomainAuthMixin, APIView):
    def patch(self, request, attendance_id):
        org = resolve_org(request.user)
        att = Attendance.objects.select_related("employee").filter(
            pk=attendance_id, employee__organization=org
        ).first()
        if not att:
            return Response({"detail": "Not found."}, status=404)
        data = request.data
        if "shift" in data:
            att.shift = data["shift"]
        if "check_in" in data:
            att.check_in = _parse_dt(data.get("check_in"))
        if "check_out" in data:
            att.check_out = _parse_dt(data.get("check_out"))
        if "ot_hours" in data:
            att.ot_hours = _decimal(data.get("ot_hours"))
        if "status" in data:
            att.status = data["status"]
        att.save()
        return Response(serialize_attendance_full(att))

    def delete(self, request, attendance_id):
        org = resolve_org(request.user)
        att = Attendance.objects.filter(pk=attendance_id, employee__organization=org).first()
        if not att:
            return Response({"detail": "Not found."}, status=404)
        att.delete()
        return Response(status=204)


# ── Leave ────────────────────────────────────────────────────────────────────


class HRLeaveView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = LeaveRequest.objects.select_related("employee", "approved_by").filter(
            employee__organization=org
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(employee__full_name__icontains=search) | Q(employee__employee_code__icontains=search)
            )
        status_f = request.query_params.get("approval_status") or request.query_params.get("status")
        if status_f:
            qs = qs.filter(approval_status=status_f)
        leave_type = request.query_params.get("leave_type")
        if leave_type:
            qs = qs.filter(leave_type=leave_type)
        qs = qs.order_by("-from_date")
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_leave(lr) for lr in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        emp = Employee.objects.filter(pk=request.data.get("employee_id"), organization=org).first()
        if not emp:
            return Response({"detail": "Employee not found."}, status=404)
        leave_type = request.data.get("leave_type")
        if leave_type not in {c.value for c in LeaveRequest.LeaveType}:
            return Response({"detail": "Invalid leave_type."}, status=400)
        from_date = _parse_date(request.data.get("from_date"))
        to_date = _parse_date(request.data.get("to_date"))
        if not from_date or not to_date:
            return Response({"detail": "from_date and to_date are required."}, status=400)
        if to_date < from_date:
            return Response({"detail": "to_date must be on or after from_date."}, status=400)
        lr = LeaveRequest.objects.create(
            employee=emp,
            leave_type=leave_type,
            from_date=from_date,
            to_date=to_date,
            reason=request.data.get("reason") or "",
            approval_status=LeaveRequest.ApprovalStatus.PENDING,
        )
        return Response(serialize_leave(lr), status=201)


class HRLeaveDetailView(DomainAuthMixin, APIView):
    def post(self, request, leave_id):
        """Approve / reject leave via action."""
        org = resolve_org(request.user)
        lr = LeaveRequest.objects.select_related("employee").filter(
            pk=leave_id, employee__organization=org
        ).first()
        if not lr:
            return Response({"detail": "Not found."}, status=404)
        action = request.data.get("action") or request.data.get("stage")
        approver = Employee.objects.filter(user=request.user, organization=org).first()
        try:
            if action == "approve":
                approve_leave(lr, approved_by=approver, actor=request.user)
            elif action == "reject":
                reject_leave(
                    lr,
                    approved_by=approver,
                    actor=request.user,
                    reason=request.data.get("reason") or "",
                )
            else:
                return Response({"detail": "Unknown action. Use approve or reject."}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        lr.refresh_from_db()
        return Response(serialize_leave(lr))

    def patch(self, request, leave_id):
        org = resolve_org(request.user)
        lr = LeaveRequest.objects.filter(pk=leave_id, employee__organization=org).first()
        if not lr:
            return Response({"detail": "Not found."}, status=404)
        if lr.approval_status != LeaveRequest.ApprovalStatus.PENDING:
            return Response({"detail": "Only pending leave can be edited."}, status=400)
        data = request.data
        if "leave_type" in data:
            lr.leave_type = data["leave_type"]
        if "from_date" in data:
            lr.from_date = _parse_date(data.get("from_date")) or lr.from_date
        if "to_date" in data:
            lr.to_date = _parse_date(data.get("to_date")) or lr.to_date
        if "reason" in data:
            lr.reason = data.get("reason") or ""
        lr.save()
        return Response(serialize_leave(lr))

    def delete(self, request, leave_id):
        org = resolve_org(request.user)
        lr = LeaveRequest.objects.filter(pk=leave_id, employee__organization=org).first()
        if not lr:
            return Response({"detail": "Not found."}, status=404)
        if lr.approval_status != LeaveRequest.ApprovalStatus.PENDING:
            return Response({"detail": "Only pending leave can be deleted."}, status=400)
        lr.delete()
        return Response(status=204)


# ── Payroll ──────────────────────────────────────────────────────────────────


class HRPayrollView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        qs = org_filter(PayrollRun.objects.select_related("approved_by"), org).order_by("-period_month")
        status_f = request.query_params.get("status")
        if status_f:
            qs = qs.filter(status=status_f)
        items, meta = _paginate(qs, request)
        return Response({"results": [serialize_payroll_run(pr) for pr in items], **meta})

    def post(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response({"detail": "No organization."}, status=400)
        period = (request.data.get("period_month") or "").strip()
        if not period or len(period) != 7:
            # Default to current month
            period = timezone.localdate().strftime("%Y-%m")
        if PayrollRun.objects.filter(organization=org, period_month=period).exists():
            return Response({"detail": f"Payroll for {period} already exists."}, status=400)
        pr = PayrollRun.objects.create(
            organization=org,
            period_month=period,
            status=PayrollRun.Status.DRAFT,
        )
        return Response(serialize_payroll_run(pr), status=201)


class HRPayrollDetailView(DomainAuthMixin, APIView):
    def get(self, request, payroll_id):
        org = resolve_org(request.user)
        pr = org_filter(PayrollRun.objects.select_related("approved_by"), org).filter(pk=payroll_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        return Response(serialize_payroll_run(pr, include_lines=True))

    def post(self, request, payroll_id):
        org = resolve_org(request.user)
        pr = org_filter(PayrollRun.objects.all(), org).filter(pk=payroll_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        action = request.data.get("action")
        approver = Employee.objects.filter(user=request.user, organization=org).first()
        try:
            if action == "process":
                process_payroll(pr, actor=request.user)
                pr.processed_at = timezone.now()
                pr.save(update_fields=["processed_at"])
            elif action == "approve":
                approve_payroll(pr, approved_by=approver, actor=request.user)
            elif action == "pay":
                pay_payroll(pr, created_by=request.user, actor=request.user)
            else:
                return Response({"detail": "Unknown action. Use process, approve, or pay."}, status=400)
        except DomainError as exc:
            return _domain_error(exc)
        pr.refresh_from_db()
        return Response(serialize_payroll_run(pr, include_lines=True))

    def patch(self, request, payroll_id):
        """Update a payroll line amounts while draft/processed."""
        org = resolve_org(request.user)
        pr = org_filter(PayrollRun.objects.all(), org).filter(pk=payroll_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        if pr.status in (PayrollRun.Status.APPROVED, PayrollRun.Status.PAID):
            return Response({"detail": "Cannot edit approved/paid payroll."}, status=400)
        line_id = request.data.get("line_id")
        line = pr.lines.filter(pk=line_id).first() if line_id else None
        if not line:
            return Response({"detail": "Payroll line not found."}, status=404)
        for field in ("basic", "allowances", "deductions", "ot_amount"):
            if field in request.data:
                setattr(line, field, _decimal(request.data.get(field)))
        line.net_pay = (
            Decimal(line.basic or 0)
            + Decimal(line.allowances or 0)
            + Decimal(line.ot_amount or 0)
            - Decimal(line.deductions or 0)
        )
        line.save()
        return Response(serialize_payroll_run(pr, include_lines=True))

    def delete(self, request, payroll_id):
        org = resolve_org(request.user)
        pr = org_filter(PayrollRun.objects.all(), org).filter(pk=payroll_id).first()
        if not pr:
            return Response({"detail": "Not found."}, status=404)
        if pr.status != PayrollRun.Status.DRAFT:
            return Response({"detail": "Only draft payroll can be deleted."}, status=400)
        pr.delete()
        return Response(status=204)


# ── Overview KPIs ────────────────────────────────────────────────────────────


class HROverviewView(DomainAuthMixin, APIView):
    def get(self, request):
        org = resolve_org(request.user)
        if not org:
            return Response(
                {
                    "headcount": 0,
                    "active": 0,
                    "present_today": 0,
                    "open_vacancies": 0,
                    "applications": 0,
                    "pending_leave": 0,
                    "onboarding_open": 0,
                    "by_department": [],
                }
            )
        from core.models import JobApplicant, JobVacancy

        today = timezone.localdate()
        employees = Employee.objects.filter(organization=org)
        active = employees.filter(status=Employee.Status.ACTIVE).count()
        present = Attendance.objects.filter(
            employee__organization=org, date=today, status=Attendance.Status.PRESENT
        ).count()
        open_vacancies = JobVacancy.objects.filter(
            organization=org, status=JobVacancy.Status.ACTIVE
        ).count()
        applications = JobApplicant.objects.filter(
            vacancy__organization=org,
            current_stage__in=[
                JobApplicant.Stage.APPLIED,
                JobApplicant.Stage.SHORTLISTED,
                JobApplicant.Stage.INTERVIEWED,
            ],
        ).count()
        pending_leave = LeaveRequest.objects.filter(
            employee__organization=org, approval_status=LeaveRequest.ApprovalStatus.PENDING
        ).count()
        onboarding_open = OnboardingProcess.objects.filter(
            employee__organization=org
        ).exclude(gurukul_status__iexact="completed").count()

        by_dept = (
            employees.filter(department__isnull=False)
            .values("department__name")
            .annotate(value=Count("id"))
            .order_by("-value")
        )
        return Response(
            {
                "headcount": employees.count(),
                "active": active,
                "present_today": present,
                "present_pct": round((present / active) * 100, 1) if active else 0,
                "open_vacancies": open_vacancies,
                "applications": applications,
                "pending_leave": pending_leave,
                "onboarding_open": onboarding_open,
                "by_department": [
                    {"name": row["department__name"] or "Unassigned", "value": row["value"]}
                    for row in by_dept
                ],
            }
        )
