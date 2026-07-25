import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  UserPlus,
  Mail,
  Phone,
  Briefcase,
  Search,
  Plus,
  Check,
  X,
  Pencil,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import {
  hrApi,
  type HREmployee,
  type HRLeave,
  type HRPayrollLine,
  type HRPayrollRun,
  type HRPosition,
  type HRSalary,
} from "@/lib/hr-api";

export const Route = createFileRoute("/hr")({
  head: () => ({
    meta: [
      { title: "HR & People — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Positions, employees, vacancies, applicants, onboarding, training, attendance, leave and payroll.",
      },
    ],
  }),
  component: HR,
});

type Section =
  | "overview"
  | "positions"
  | "employees"
  | "vacancies"
  | "applicants"
  | "onboarding"
  | "training"
  | "attendance"
  | "leave"
  | "payroll";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = [
    "overview",
    "positions",
    "employees",
    "vacancies",
    "applicants",
    "onboarding",
    "training",
    "attendance",
    "leave",
    "payroll",
  ];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "People", subtitle: "hr.employee · vacancies · applicants" },
  positions: { title: "Positions", subtitle: "hr.position_master" },
  employees: { title: "Employees", subtitle: "hr.employee" },
  vacancies: { title: "Vacancies", subtitle: "hr.job_vacancy" },
  applicants: { title: "Applicants", subtitle: "hr.job_applicant" },
  onboarding: { title: "Onboarding", subtitle: "hr.onboarding_process" },
  training: { title: "Training", subtitle: "hr.training_log" },
  attendance: { title: "Attendance", subtitle: "hr.attendance" },
  leave: { title: "Leave", subtitle: "hr.leave_request" },
  payroll: { title: "Payroll", subtitle: "hr.payroll_run" },
};

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function useHROptions(enabled: boolean) {
  return useQuery({
    queryKey: ["hr", "options"],
    queryFn: hrApi.options,
    enabled,
    staleTime: 60_000,
  });
}

function OptionSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      className={className || inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {(options || []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function firstOpt(options?: { value: string }[], fallback = "") {
  return options?.[0]?.value ?? fallback;
}

function employeeLabel(e: { employee_code: string; full_name: string }) {
  return `${e.employee_code} — ${e.full_name}`;
}

function HR() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [editEmployee, setEditEmployee] = useState<HREmployee | null>(null);
  const [salaryEmployee, setSalaryEmployee] = useState<HREmployee | null>(null);
  const qc = useQueryClient();

  const invalidateHr = () => {
    void qc.invalidateQueries({ queryKey: ["hr"] });
  };

  return (
    <AppShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <button
          type="button"
          onClick={() => {
            setEditEmployee(null);
            setShowNewEmployee(true);
          }}
          className="hidden lg:inline-flex h-9 px-4 rounded-lg text-sm font-semibold items-center gap-2"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "var(--color-primary-foreground)",
          }}
        >
          <UserPlus className="h-4 w-4" /> New Employee
        </button>
      }
    >
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {flash}
        </div>
      )}
      {(showNewEmployee || editEmployee) && (
        <EmployeeFormModal
          employee={editEmployee || undefined}
          onClose={() => {
            setShowNewEmployee(false);
            setEditEmployee(null);
          }}
          onSaved={(msg) => {
            setShowNewEmployee(false);
            setEditEmployee(null);
            setFlash(msg);
            invalidateHr();
          }}
        />
      )}
      {salaryEmployee && (
        <SalaryModal
          employee={salaryEmployee}
          onClose={() => setSalaryEmployee(null)}
          onSaved={(msg) => {
            setSalaryEmployee(null);
            setFlash(msg);
            invalidateHr();
          }}
        />
      )}

      {section === "overview" && <OverviewSection onFlash={setFlash} />}
      {section === "positions" && <PositionsSection onFlash={setFlash} />}
      {section === "employees" && (
        <EmployeesSection
          onFlash={setFlash}
          onNew={() => {
            setEditEmployee(null);
            setShowNewEmployee(true);
          }}
          onEdit={(e) => {
            setShowNewEmployee(false);
            setEditEmployee(e);
          }}
          onSalary={(e) => setSalaryEmployee(e)}
        />
      )}
      {section === "vacancies" && <VacanciesSection onFlash={setFlash} />}
      {section === "applicants" && <ApplicantsSection onFlash={setFlash} />}
      {section === "onboarding" && <OnboardingSection onFlash={setFlash} />}
      {section === "training" && <TrainingSection onFlash={setFlash} />}
      {section === "attendance" && <AttendanceSection onFlash={setFlash} />}
      {section === "leave" && <LeaveSection onFlash={setFlash} />}
      {section === "payroll" && <PayrollSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const overview = useQuery({
    queryKey: ["hr", "overview"],
    queryFn: hrApi.overview,
    enabled: authed,
  });
  const employees = useQuery({
    queryKey: ["hr", "employees", "overview"],
    queryFn: () => hrApi.employees({ page_size: 20 }),
    enabled: authed,
  });
  const attendance = useQuery({
    queryKey: ["hr", "attendance", "overview"],
    queryFn: () => hrApi.attendance({ page_size: 20 }),
    enabled: authed,
  });
  const vacancies = useQuery({
    queryKey: ["hr", "vacancies", "overview"],
    queryFn: () => hrApi.vacancies("org"),
    enabled: authed,
  });
  const applications = useQuery({
    queryKey: ["hr", "applications", "overview"],
    queryFn: () => hrApi.applications(),
    enabled: authed,
  });
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positionId, setPositionId] = useState("");

  const createVacancy = useMutation({
    mutationFn: () =>
      hrApi.createVacancy({
        title,
        description,
        position_id: positionId || undefined,
        publish: true,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setPositionId("");
      onFlash("Vacancy published.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      hrApi.reviewApplication(id, { stage }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  const kpi = overview.data;
  const deptData = kpi?.by_department?.length
    ? kpi.by_department
    : Object.values(
        (employees.data?.results || []).reduce<Record<string, { name: string; value: number }>>(
          (acc, e) => {
            const name = e.department_name || "Unassigned";
            acc[name] ??= { name, value: 0 };
            acc[name].value += 1;
            return acc;
          },
          {},
        ),
      );

  const reviewStages = (options.data?.applicant_stages || []).filter(
    (s) => s.value !== "applied",
  );

  const positionOpts = (options.data?.positions || []).map((p) => ({
    value: p.id,
    label: `${p.designation}${p.department ? ` · ${p.department}` : ""}`,
  }));

  const isLoading = overview.isLoading || employees.isLoading || options.isLoading;
  const isError = overview.isError || employees.isError;
  const error = (overview.error || employees.error) as Error | undefined;

  if (!authed) {
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
        Sign in to load HR data from the database.
      </div>
    );
  }

  return (
    <QueryState isLoading={isLoading} isError={isError} error={error}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 mb-5">
        <MiniKpi label="Headcount" value={kpi?.headcount ?? 0} sub={`${kpi?.active ?? 0} active`} />
        <MiniKpi
          label="Present Today"
          value={kpi?.present_today ?? 0}
          sub={kpi ? `${kpi.present_pct}%` : "—"}
        />
        <MiniKpi label="Open vacancies" value={kpi?.open_vacancies ?? 0} sub="published" />
        <MiniKpi label="Applications" value={kpi?.applications ?? 0} sub="to review" />
        <MiniKpi label="Pending leave" value={kpi?.pending_leave ?? 0} sub="awaiting approval" />
        <MiniKpi label="Onboarding open" value={kpi?.onboarding_open ?? 0} sub="in progress" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Publish job vacancy</div>
          </div>
          <input
            className="w-full h-10 mb-2 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary"
            placeholder="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <OptionSelect
            className="w-full h-10 mb-2 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary"
            value={positionId}
            onChange={setPositionId}
            options={positionOpts}
            placeholder="Position (optional)"
          />
          <textarea
            className="w-full h-24 mb-3 rounded-xl bg-secondary text-sm p-3 outline-none border border-transparent focus:border-primary"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            disabled={!title.trim() || createVacancy.isPending}
            onClick={() => createVacancy.mutate()}
            className="h-9 px-4 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--color-primary-foreground)",
            }}
          >
            Create & publish
          </button>
          <div className="mt-4 divide-y divide-border">
            {(vacancies.data || []).slice(0, 5).map((v) => (
              <div key={v.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{v.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {v.vacancy_code} · {v.applicant_count} applicants
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-semibold text-sm mb-3">Review applications</div>
          {(applications.data || []).length === 0 && (
            <div className="text-xs text-muted-foreground">No applications yet.</div>
          )}
          {(applications.data || []).slice(0, 8).map((a) => (
            <div key={a.id} className="py-3 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-sm font-semibold">{a.full_name}</div>
                <StatusBadge status={a.current_stage} />
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">
                {a.vacancy_title} · {a.phone || a.email || "—"}
              </div>
              <div className="flex flex-wrap gap-2">
                {reviewStages.map((stage) => (
                  <button
                    key={stage.value}
                    type="button"
                    className="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border hover:border-primary"
                    onClick={() => reviewMut.mutate({ id: a.id, stage: stage.value })}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-border">
            <div className="text-sm font-semibold">Attendance — today</div>
            <div className="text-xs text-muted-foreground">
              hr.attendance · {attendance.data?.date ?? "today"}
            </div>
          </div>
          <DataTable
            headers={["Employee", "Date", "Check-in", "Hours", "Status"]}
            rows={(attendance.data?.results || []).map((a) => [
              a.employee_name,
              a.date,
              a.check_in ?? "—",
              `${a.work_hours.toFixed(1)}h`,
              <StatusBadge key="s" status={a.status} />,
            ])}
            empty="No attendance recorded today."
          />
        </div>
        <div className="rounded-2xl bg-card border border-border p-4 lg:p-5">
          <div className="text-sm font-semibold">Headcount by department</div>
          <div className="h-52 mt-2">
            {deptData.length === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {deptData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={chartSeries[i % chartSeries.length]}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Panel title="Recent applicants">
          <DataTable
            headers={["Applicant", "Vacancy", "Stage"]}
            rows={(applications.data || []).slice(0, 8).map((a) => [
              <span key="n" className="font-semibold">
                {a.full_name}
              </span>,
              a.vacancy_title,
              <StatusBadge key="s" status={a.current_stage} />,
            ])}
            empty="No applications yet."
          />
        </Panel>
        <Panel title="Employee directory">
          <DataTable
            headers={["Code", "Employee", "Dept", "Status"]}
            rows={(employees.data?.results || []).slice(0, 8).map((e) => [
              <span key="c" className="font-mono text-xs">
                {e.employee_code}
              </span>,
              <span key="n" className="font-semibold">
                {e.full_name}
              </span>,
              e.department_name || "—",
              <StatusBadge key="s" status={e.status} />,
            ])}
            empty="No employees yet."
          />
        </Panel>
      </div>

      <Panel title="All employees">
        <DataTable
          headers={["Code", "Employee", "Designation", "Department", "Type", "Contact", "Status"]}
          rows={(employees.data?.results || []).map((e) => [
            <span key="c" className="font-mono text-xs">
              {e.employee_code}
            </span>,
            <span key="n" className="font-semibold">
              {e.full_name}
            </span>,
            e.designation || "—",
            e.department_name || "—",
            <Tag key="t">{e.employment_type || e.classification}</Tag>,
            <span
              key="m"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Mail className="h-3 w-3" /> {e.email || "—"}
              <Phone className="h-3 w-3" /> {e.phone || "—"}
            </span>,
            <StatusBadge key="s" status={e.status} />,
          ])}
          empty="No employees yet."
        />
      </Panel>
    </QueryState>
  );
}

/* ── Positions ────────────────────────────────────────────────────────────── */

function PositionsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<HRPosition | null>(null);
  const [form, setForm] = useState({
    designation: "",
    department: "",
    code: "",
    min_edu: "",
    experience: "",
    leadership_tier: "",
    reports_to_id: "",
  });
  const qc = useQueryClient();

  useEffect(() => {
    if (!options.data) return;
    setForm((f) => ({
      ...f,
      leadership_tier: f.leadership_tier || firstOpt(options.data.leadership_tiers),
    }));
  }, [options.data]);

  const q = useQuery({
    queryKey: ["hr", "positions", search],
    queryFn: () => hrApi.positions({ search, page_size: 50 }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: () =>
      hrApi.createPosition({
        ...form,
        reports_to_id: form.reports_to_id || null,
      }),
    onSuccess: () => {
      setForm({
        designation: "",
        department: "",
        code: "",
        min_edu: "",
        experience: "",
        leadership_tier: firstOpt(options.data?.leadership_tiers),
        reports_to_id: "",
      });
      onFlash("Position created.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      hrApi.updatePosition(editing!.id, {
        designation: form.designation,
        department: form.department,
        code: form.code,
        min_edu: form.min_edu,
        experience: form.experience,
        leadership_tier: form.leadership_tier,
        reports_to_id: form.reports_to_id || null,
      }),
    onSuccess: () => {
      setEditing(null);
      setForm({
        designation: "",
        department: "",
        code: "",
        min_edu: "",
        experience: "",
        leadership_tier: firstOpt(options.data?.leadership_tiers),
        reports_to_id: "",
      });
      onFlash("Position updated.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deletePosition(id),
    onSuccess: () => {
      onFlash("Position deleted.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const startEdit = (p: HRPosition) => {
    setEditing(p);
    setForm({
      designation: p.designation,
      department: p.department || "",
      code: p.code || "",
      min_edu: p.min_edu || "",
      experience: p.experience || "",
      leadership_tier: p.leadership_tier || firstOpt(options.data?.leadership_tiers),
      reports_to_id: p.reports_to_id || "",
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({
      designation: "",
      department: "",
      code: "",
      min_edu: "",
      experience: "",
      leadership_tier: firstOpt(options.data?.leadership_tiers),
      reports_to_id: "",
    });
  };

  const positionOpts = (options.data?.positions || [])
    .filter((p) => !editing || p.id !== editing.id)
    .map((p) => ({ value: p.id, label: p.designation }));

  const deptOpts = (options.data?.departments || []).map((d) => ({
    value: d.name,
    label: d.name,
  }));

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search positions…"
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className={inputCls}
            placeholder="Designation *"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
          />
          <OptionSelect
            value={form.department}
            onChange={(v) => setForm({ ...form, department: v })}
            options={deptOpts}
            placeholder="Department"
          />
          <input
            className={inputCls}
            placeholder="Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Min education"
            value={form.min_edu}
            onChange={(e) => setForm({ ...form, min_edu: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Experience"
            value={form.experience}
            onChange={(e) => setForm({ ...form, experience: e.target.value })}
          />
          <OptionSelect
            value={form.leadership_tier}
            onChange={(v) => setForm({ ...form, leadership_tier: v })}
            options={options.data?.leadership_tiers}
            placeholder="Leadership tier"
          />
          <OptionSelect
            value={form.reports_to_id}
            onChange={(v) => setForm({ ...form, reports_to_id: v })}
            options={positionOpts}
            placeholder="Reports to"
          />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={!form.designation.trim() || update.isPending}
                  onClick={() => update.mutate()}
                  className={btnCls}
                >
                  <Check className="h-4 w-4" /> Save changes
                </button>
                <button type="button" onClick={cancelEdit} className={btnGhostCls}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!form.designation.trim() || create.isPending}
                onClick={() => create.mutate()}
                className={btnCls}
              >
                <Plus className="h-4 w-4" /> Add position
              </button>
            )}
          </div>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            "Code",
            "Designation",
            "Department",
            "Tier",
            "Education",
            "Experience",
            "Reports to",
            "Staff",
            "Actions",
          ]}
          rows={(q.data?.results || []).map((p) => [
            p.code || "—",
            p.designation,
            p.department || "—",
            p.leadership_tier || "—",
            p.min_edu || "—",
            p.experience || "—",
            p.reports_to_name || "—",
            String(p.employee_count),
            <div key="a" className="flex gap-2">
              <button
                type="button"
                className="text-xs text-primary inline-flex items-center gap-1"
                onClick={() => startEdit(p)}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                className="text-xs text-destructive"
                disabled={p.is_system}
                onClick={() => remove.mutate(p.id)}
              >
                Delete
              </button>
            </div>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Employees ────────────────────────────────────────────────────────────── */

function EmployeesSection({
  onFlash,
  onNew,
  onEdit,
  onSalary,
}: {
  onFlash: (m: string | null) => void;
  onNew: () => void;
  onEdit: (e: HREmployee) => void;
  onSalary: (e: HREmployee) => void;
}) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["hr", "employees", search, status],
    queryFn: () => hrApi.employees({ search, status: status || undefined, page_size: 50 }),
    enabled: authed,
  });
  const exitMut = useMutation({
    mutationFn: (id: string) => hrApi.exitEmployee(id),
    onSuccess: () => {
      onFlash("Employee marked as exited.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search employees…"
      filters={
        <OptionSelect
          value={status}
          onChange={setStatus}
          options={options.data?.employee_statuses}
          placeholder="All statuses"
        />
      }
      form={
        <button type="button" onClick={onNew} className={btnCls}>
          <UserPlus className="h-4 w-4" /> New employee
        </button>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            "Code",
            "Employee",
            "Designation",
            "Department",
            "Type",
            "Grade",
            "Salary",
            "Status",
            "Actions",
          ]}
          rows={(q.data?.results || []).map((e) => [
            <span key="c" className="font-mono text-xs">
              {e.employee_code}
            </span>,
            <div key="n">
              <div className="font-semibold">{e.full_name}</div>
              <div className="text-[11px] text-muted-foreground">{e.email || "—"}</div>
            </div>,
            e.designation || "—",
            e.department_name || "—",
            <Tag key="t">{e.classification || e.employment_type}</Tag>,
            e.grade || "—",
            e.has_salary || e.salary ? (
              <span key="sal" className="text-xs text-primary">
                Set
              </span>
            ) : (
              <span key="sal" className="text-xs text-muted-foreground">
                —
              </span>
            ),
            <StatusBadge key="s" status={e.status} />,
            <div key="a" className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs text-primary inline-flex items-center gap-1"
                onClick={() => onEdit(e)}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                className="text-xs text-primary inline-flex items-center gap-1"
                onClick={() => onSalary(e)}
              >
                <Wallet className="h-3 w-3" /> Salary
              </button>
              {e.raw_status !== "exited" && e.status !== "resigned" && e.status !== "exited" ? (
                <button
                  type="button"
                  className="text-xs text-destructive"
                  onClick={() => exitMut.mutate(e.id)}
                >
                  Exit
                </button>
              ) : null}
            </div>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Vacancies ────────────────────────────────────────────────────────────── */

function VacanciesSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positionId, setPositionId] = useState("");
  const [hiringManagerId, setHiringManagerId] = useState("");
  const [publish, setPublish] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["hr", "vacancies"],
    queryFn: () => hrApi.vacancies("org"),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: () =>
      hrApi.createVacancy({
        title,
        description,
        position_id: positionId || undefined,
        publish,
        ...(hiringManagerId ? { hiring_manager_id: hiringManagerId } : {}),
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setPositionId("");
      setHiringManagerId("");
      setPublish(true);
      onFlash(publish ? "Vacancy created & published." : "Vacancy saved as draft.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "publish" | "close" }) =>
      hrApi.vacancyAction(id, act),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "vacancies"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  const filtered = useMemo(
    () => (q.data || []).filter((v) => !statusFilter || v.status === statusFilter),
    [q.data, statusFilter],
  );

  const positionOpts = (options.data?.positions || []).map((p) => ({
    value: p.id,
    label: p.designation,
  }));
  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));

  return (
    <SectionLayout
      filters={
        <OptionSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={options.data?.vacancy_statuses}
          placeholder="All statuses"
        />
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            className={inputCls}
            placeholder="Job title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <OptionSelect
            value={positionId}
            onChange={setPositionId}
            options={positionOpts}
            placeholder="Position (optional)"
          />
          <OptionSelect
            value={hiringManagerId}
            onChange={setHiringManagerId}
            options={employeeOpts}
            placeholder="Hiring manager (optional)"
          />
          <label className="flex items-center gap-2 text-sm px-1">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Publish immediately
          </label>
          <textarea
            className={`${inputCls} md:col-span-2 h-20`}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
            className={btnCls}
          >
            <Plus className="h-4 w-4" /> {publish ? "Create & publish" : "Create draft"}
          </button>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!filtered.length}
      >
        <DataTable
          headers={["Code", "Title", "Position", "Applicants", "Status", "Actions"]}
          rows={filtered.map((v) => [
            <span key="c" className="font-mono text-xs">
              {v.vacancy_code}
            </span>,
            v.title,
            v.position || "—",
            String(v.applicant_count),
            <StatusBadge key="s" status={v.status} />,
            <div key="a" className="flex gap-2">
              {v.status === "draft" && (
                <button
                  type="button"
                  className="text-xs text-primary"
                  onClick={() => action.mutate({ id: v.id, act: "publish" })}
                >
                  Publish
                </button>
              )}
              {v.status === "active" && (
                <button
                  type="button"
                  className="text-xs text-destructive"
                  onClick={() => action.mutate({ id: v.id, act: "close" })}
                >
                  Close
                </button>
              )}
            </div>,
          ])}
        />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Applicants ───────────────────────────────────────────────────────────── */

function ApplicantsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [stage, setStage] = useState("");
  const [scoreForm, setScoreForm] = useState({
    applicant_id: "",
    interviewer_id: "",
    score: "70",
    remarks: "",
    status: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!options.data) return;
    setScoreForm((f) => ({
      ...f,
      status: f.status || firstOpt(options.data.scoring_statuses),
    }));
  }, [options.data]);

  const q = useQuery({
    queryKey: ["hr", "applications"],
    queryFn: () => hrApi.applications(),
    enabled: authed,
  });
  const scores = useQuery({
    queryKey: ["hr", "scoring"],
    queryFn: () => hrApi.scoring({ page_size: 100 }),
    enabled: authed,
  });

  const review = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) =>
      hrApi.reviewApplication(id, { stage: s }),
    onSuccess: () => {
      onFlash("Application updated.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const createScore = useMutation({
    mutationFn: () =>
      hrApi.createScoring({
        applicant_id: scoreForm.applicant_id,
        interviewer_id: scoreForm.interviewer_id,
        score: Number(scoreForm.score) || 0,
        remarks: scoreForm.remarks,
        status: scoreForm.status,
      }),
    onSuccess: () => {
      onFlash("Scoring saved.");
      setScoreForm((f) => ({
        ...f,
        applicant_id: "",
        interviewer_id: "",
        score: "70",
        remarks: "",
        status: firstOpt(options.data?.scoring_statuses),
      }));
      void qc.invalidateQueries({ queryKey: ["hr", "scoring"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const rows = (q.data || []).filter((a) => !stage || a.current_stage === stage);
  const reviewStages = (options.data?.applicant_stages || []).filter(
    (s) => s.value !== "applied",
  );
  const applicantOpts = (q.data || []).map((a) => ({
    value: a.id,
    label: `${a.full_name} · ${a.vacancy_title}`,
  }));
  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));

  return (
    <SectionLayout
      filters={
        <OptionSelect
          value={stage}
          onChange={setStage}
          options={options.data?.applicant_stages}
          placeholder="All stages"
        />
      }
      form={
        <div className="space-y-3">
          <div className="text-sm font-semibold">Interview scoring</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <OptionSelect
              value={scoreForm.applicant_id}
              onChange={(v) => setScoreForm({ ...scoreForm, applicant_id: v })}
              options={applicantOpts}
              placeholder="Applicant *"
            />
            <OptionSelect
              value={scoreForm.interviewer_id}
              onChange={(v) => setScoreForm({ ...scoreForm, interviewer_id: v })}
              options={employeeOpts}
              placeholder="Interviewer *"
            />
            <input
              className={inputCls}
              type="number"
              min={1}
              max={100}
              placeholder="Score 1–100"
              value={scoreForm.score}
              onChange={(e) => setScoreForm({ ...scoreForm, score: e.target.value })}
            />
            <OptionSelect
              value={scoreForm.status}
              onChange={(v) => setScoreForm({ ...scoreForm, status: v })}
              options={options.data?.scoring_statuses}
              placeholder="Scoring status"
            />
            <input
              className={inputCls}
              placeholder="Remarks"
              value={scoreForm.remarks}
              onChange={(e) => setScoreForm({ ...scoreForm, remarks: e.target.value })}
            />
            <button
              type="button"
              disabled={
                !scoreForm.applicant_id ||
                !scoreForm.interviewer_id ||
                createScore.isPending
              }
              onClick={() => createScore.mutate()}
              className={btnCls}
            >
              <Plus className="h-4 w-4" /> Save score
            </button>
          </div>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!rows.length}
      >
        <DataTable
          headers={["Applicant", "Vacancy", "Contact", "Exp", "Stage", "Actions"]}
          rows={rows.map((a) => [
            <button
              key="n"
              type="button"
              className="font-semibold text-left hover:text-primary"
              onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
            >
              {a.full_name}
            </button>,
            a.vacancy_title,
            a.email || a.phone || "—",
            `${a.exp_years}y`,
            <StatusBadge key="s" status={a.current_stage} />,
            <div key="a" className="flex flex-wrap gap-1">
              {reviewStages.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="h-6 px-2 rounded text-[10px] border border-border hover:border-primary"
                  onClick={() => review.mutate({ id: a.id, s: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>,
          ])}
        />
      </QueryState>

      {expandedId && (
        <Panel title="Scores for selected applicant" className="mt-4">
          <DataTable
            headers={["Interviewer", "Score", "Status", "Remarks"]}
            rows={(scores.data?.results || [])
              .filter((s) => s.applicant_id === expandedId)
              .map((s) => [
                s.interviewer_name || "—",
                String(s.score),
                <StatusBadge key="st" status={s.status} />,
                s.remarks || "—",
              ])}
            empty="No scores yet for this applicant."
          />
        </Panel>
      )}

      {!expandedId && (scores.data?.results?.length || 0) > 0 && (
        <Panel title="Recent scores" className="mt-4">
          <DataTable
            headers={["Applicant", "Vacancy", "Interviewer", "Score", "Status"]}
            rows={(scores.data?.results || []).slice(0, 10).map((s) => [
              s.applicant_name,
              s.vacancy_title,
              s.interviewer_name || "—",
              String(s.score),
              <StatusBadge key="st" status={s.status} />,
            ])}
          />
        </Panel>
      )}
    </SectionLayout>
  );
}

/* ── Onboarding ───────────────────────────────────────────────────────────── */

function OnboardingSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [customTask, setCustomTask] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["hr", "onboarding", search],
    queryFn: () => hrApi.onboarding({ search, page_size: 50 }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: () => hrApi.createOnboarding({ employee_id: employeeId }),
    onSuccess: () => {
      setEmployeeId("");
      onFlash("Onboarding started.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const toggleTask = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      hrApi.updateOnboardingTask(id, { is_completed: done }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, gurukul_status }: { id: string; gurukul_status: string }) =>
      hrApi.updateOnboarding(id, { gurukul_status }),
    onSuccess: () => {
      onFlash("Onboarding status updated.");
      void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const addTask = useMutation({
    mutationFn: ({ employee_id, task_name }: { employee_id: string; task_name: string }) =>
      hrApi.createOnboardingTask({ employee_id, task_name }),
    onSuccess: (_d, vars) => {
      setCustomTask((m) => ({ ...m, [vars.employee_id]: "" }));
      onFlash("Task added.");
      void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));
  const templateCount = options.data?.onboarding_templates?.length ?? 0;

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search onboarding…"
      form={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <OptionSelect
              value={employeeId}
              onChange={setEmployeeId}
              options={employeeOpts}
              placeholder="Select employee"
            />
            <button
              type="button"
              disabled={!employeeId || create.isPending}
              onClick={() => create.mutate()}
              className={btnCls}
            >
              <Plus className="h-4 w-4" /> Start onboarding
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Tasks are seeded from {templateCount} onboarding template
            {templateCount === 1 ? "" : "s"} — no need to pass a task list.
          </div>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <div className="space-y-4 p-4">
          {(q.data?.results || []).map((o) => (
            <div key={o.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold text-sm">{o.employee_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {o.employee_code} · joined {o.joined_date || "—"} · {o.tasks_done}/
                    {o.tasks_total} tasks
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <OptionSelect
                    value={o.gurukul_status || ""}
                    onChange={(v) =>
                      updateStatus.mutate({ id: o.id, gurukul_status: v })
                    }
                    options={options.data?.gurukul_statuses}
                    placeholder="Status"
                    className={`${inputCls} w-auto min-w-[140px]`}
                  />
                  <StatusBadge status={o.gurukul_status || "pending"} />
                </div>
              </div>
              <div className="space-y-1">
                {o.tasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      checked={t.is_completed}
                      onChange={(e) =>
                        toggleTask.mutate({ id: t.id, done: e.target.checked })
                      }
                    />
                    <span
                      className={
                        t.is_completed ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {t.task_name}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className={inputCls}
                  placeholder="Add custom task"
                  value={customTask[o.employee_id] || ""}
                  onChange={(e) =>
                    setCustomTask((m) => ({ ...m, [o.employee_id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className={btnGhostCls}
                  disabled={
                    !(customTask[o.employee_id] || "").trim() || addTask.isPending
                  }
                  onClick={() =>
                    addTask.mutate({
                      employee_id: o.employee_id,
                      task_name: (customTask[o.employee_id] || "").trim(),
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Add task
                </button>
              </div>
            </div>
          ))}
        </div>
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Training ─────────────────────────────────────────────────────────────── */

function TrainingSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    employee_id: "",
    module_id: "",
    exam_score: "0",
    watch_time: "",
    completion_date: new Date().toISOString().slice(0, 10),
  });
  const [modForm, setModForm] = useState({
    name: "",
    code: "",
    pass_score: "80",
    is_mandatory: false,
  });
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["hr", "training", search],
    queryFn: () => hrApi.training({ search, page_size: 50 }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: () => {
      const mod = (options.data?.training_modules || []).find(
        (m) => m.id === form.module_id,
      );
      return hrApi.createTraining({
        employee_id: form.employee_id,
        module_id: form.module_id || undefined,
        module_name: mod?.name,
        exam_score: Number(form.exam_score) || 0,
        watch_time: form.watch_time ? Number(form.watch_time) : undefined,
        completion_date: form.completion_date || undefined,
      });
    },
    onSuccess: () => {
      setForm({
        employee_id: "",
        module_id: "",
        exam_score: "0",
        watch_time: "",
        completion_date: new Date().toISOString().slice(0, 10),
      });
      onFlash("Training log saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "training"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const createModule = useMutation({
    mutationFn: () =>
      hrApi.createTrainingModule({
        name: modForm.name,
        code: modForm.code || undefined,
        pass_score: Number(modForm.pass_score) || 80,
        is_mandatory: modForm.is_mandatory,
      }),
    onSuccess: () => {
      setModForm({ name: "", code: "", pass_score: "80", is_mandatory: false });
      onFlash("Training module created.");
      void qc.invalidateQueries({ queryKey: ["hr", "options"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deleteTraining(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "training"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));
  const moduleOpts = (options.data?.training_modules || []).map((m) => ({
    value: m.id,
    label: `${m.name}${m.pass_score ? ` (pass ${m.pass_score})` : ""}`,
  }));

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search training…"
      form={
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <OptionSelect
              value={form.employee_id}
              onChange={(v) => setForm({ ...form, employee_id: v })}
              options={employeeOpts}
              placeholder="Employee *"
            />
            <OptionSelect
              value={form.module_id}
              onChange={(v) => setForm({ ...form, module_id: v })}
              options={moduleOpts}
              placeholder="Module *"
            />
            <input
              className={inputCls}
              type="number"
              min={0}
              max={100}
              placeholder="Exam score"
              value={form.exam_score}
              onChange={(e) => setForm({ ...form, exam_score: e.target.value })}
            />
            <input
              className={inputCls}
              type="number"
              min={0}
              placeholder="Watch time (minutes)"
              value={form.watch_time}
              onChange={(e) => setForm({ ...form, watch_time: e.target.value })}
            />
            <input
              className={inputCls}
              type="date"
              value={form.completion_date}
              onChange={(e) => setForm({ ...form, completion_date: e.target.value })}
            />
            <button
              type="button"
              disabled={!form.employee_id || !form.module_id || create.isPending}
              onClick={() => create.mutate()}
              className={btnCls}
            >
              <Plus className="h-4 w-4" /> Add log
            </button>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-sm font-semibold mb-2">New training module</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                className={inputCls}
                placeholder="Name *"
                value={modForm.name}
                onChange={(e) => setModForm({ ...modForm, name: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Code"
                value={modForm.code}
                onChange={(e) => setModForm({ ...modForm, code: e.target.value })}
              />
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                placeholder="Pass score"
                value={modForm.pass_score}
                onChange={(e) => setModForm({ ...modForm, pass_score: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm px-1">
                <input
                  type="checkbox"
                  checked={modForm.is_mandatory}
                  onChange={(e) =>
                    setModForm({ ...modForm, is_mandatory: e.target.checked })
                  }
                />
                Mandatory
              </label>
              <button
                type="button"
                disabled={!modForm.name.trim() || createModule.isPending}
                onClick={() => createModule.mutate()}
                className={btnGhostCls}
              >
                <Plus className="h-4 w-4" /> Create module
              </button>
            </div>
          </div>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={["Employee", "Module", "Score", "Pass", "Completed", "Actions"]}
          rows={(q.data?.results || []).map((t) => [
            t.employee_name,
            t.module_name,
            String(t.exam_score),
            t.passed ? (
              <Check key="p" className="h-4 w-4 text-primary" />
            ) : (
              <X key="f" className="h-4 w-4 text-destructive" />
            ),
            t.completion_date || "—",
            <button
              key="d"
              type="button"
              className="text-xs text-destructive"
              onClick={() => remove.mutate(t.id)}
            >
              Delete
            </button>,
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

function AttendanceSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    employee_id: "",
    check_in: "09:00",
    check_out: "",
    status: "",
    shift: "",
    ot_hours: "0",
  });
  const [editRow, setEditRow] = useState<{
    id: string;
    status: string;
    ot_hours: string;
  } | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!options.data) return;
    setForm((f) => ({
      ...f,
      status: f.status || firstOpt(options.data.attendance_statuses),
      shift: f.shift || firstOpt(options.data.shifts),
    }));
  }, [options.data]);

  const q = useQuery({
    queryKey: ["hr", "attendance", date, search],
    queryFn: () => hrApi.attendance({ date, search, page_size: 100 }),
    enabled: authed,
  });

  const upsert = useMutation({
    mutationFn: () =>
      hrApi.upsertAttendance({
        employee_id: form.employee_id,
        date,
        check_in: form.check_in || undefined,
        check_out: form.check_out || undefined,
        status: form.status,
        shift: form.shift,
        ot_hours: Number(form.ot_hours) || 0,
      }),
    onSuccess: () => {
      onFlash("Attendance saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      void qc.invalidateQueries({ queryKey: ["hr", "overview"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      hrApi.updateAttendance(editRow!.id, {
        status: editRow!.status,
        ot_hours: Number(editRow!.ot_hours) || 0,
      }),
    onSuccess: () => {
      setEditRow(null);
      onFlash("Attendance updated.");
      void qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deleteAttendance(id),
    onSuccess: () => {
      onFlash("Attendance deleted.");
      void qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search attendance…"
      filters={
        <input
          className={inputCls}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <OptionSelect
            value={form.employee_id}
            onChange={(v) => setForm({ ...form, employee_id: v })}
            options={employeeOpts}
            placeholder="Employee *"
          />
          <OptionSelect
            value={form.shift}
            onChange={(v) => setForm({ ...form, shift: v })}
            options={options.data?.shifts}
            placeholder="Shift"
          />
          <OptionSelect
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={options.data?.attendance_statuses}
            placeholder="Status"
          />
          <input
            className={inputCls}
            type="time"
            value={form.check_in}
            onChange={(e) => setForm({ ...form, check_in: e.target.value })}
          />
          <input
            className={inputCls}
            type="time"
            value={form.check_out}
            onChange={(e) => setForm({ ...form, check_out: e.target.value })}
          />
          <input
            className={inputCls}
            type="number"
            min={0}
            step={0.5}
            placeholder="OT hours"
            value={form.ot_hours}
            onChange={(e) => setForm({ ...form, ot_hours: e.target.value })}
          />
          <button
            type="button"
            disabled={!form.employee_id || upsert.isPending}
            onClick={() => upsert.mutate()}
            className={btnCls}
          >
            Save attendance
          </button>
        </div>
      }
    >
      <div className="mb-3 text-xs text-muted-foreground px-4 pt-3">
        Present: {q.data?.present_count ?? 0} · Date: {q.data?.date ?? date}
      </div>
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            "Employee",
            "Shift",
            "Check-in",
            "Check-out",
            "Hours",
            "OT",
            "Status",
            "Actions",
          ]}
          rows={(q.data?.results || []).map((a) => [
            a.employee_name,
            a.shift,
            a.check_in ?? "—",
            a.check_out ?? "—",
            `${a.work_hours.toFixed(1)}h`,
            editRow?.id === a.id ? (
              <input
                key="ot"
                className={`${inputCls} w-20`}
                type="number"
                min={0}
                step={0.5}
                value={editRow.ot_hours}
                onChange={(e) => setEditRow({ ...editRow, ot_hours: e.target.value })}
              />
            ) : (
              String(a.ot_hours)
            ),
            editRow?.id === a.id ? (
              <OptionSelect
                key="st"
                className={`${inputCls} w-auto min-w-[120px]`}
                value={editRow.status}
                onChange={(v) => setEditRow({ ...editRow, status: v })}
                options={options.data?.attendance_statuses}
              />
            ) : (
              <StatusBadge key="s" status={a.status} />
            ),
            <div key="a" className="flex gap-2">
              {editRow?.id === a.id ? (
                <>
                  <button
                    type="button"
                    className="text-xs text-primary"
                    onClick={() => update.mutate()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => setEditRow(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-xs text-primary"
                  onClick={() =>
                    setEditRow({
                      id: a.id,
                      status: a.raw_status || a.status,
                      ot_hours: String(a.ot_hours),
                    })
                  }
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() => remove.mutate(a.id)}
              >
                Delete
              </button>
            </div>,
          ])}
        />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Leave ────────────────────────────────────────────────────────────────── */

function LeaveSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "",
    from_date: "",
    to_date: "",
    reason: "",
  });
  const qc = useQueryClient();

  useEffect(() => {
    if (!options.data) return;
    setForm((f) => ({
      ...f,
      leave_type: f.leave_type || firstOpt(options.data.leave_types),
    }));
  }, [options.data]);

  const q = useQuery({
    queryKey: ["hr", "leave", status],
    queryFn: () => hrApi.leave({ approval_status: status || undefined, page_size: 50 }),
    enabled: authed,
  });

  const create = useMutation({
    mutationFn: () => hrApi.createLeave(form),
    onSuccess: () => {
      setForm({
        employee_id: "",
        leave_type: firstOpt(options.data?.leave_types),
        from_date: "",
        to_date: "",
        reason: "",
      });
      onFlash("Leave request submitted.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      hrApi.leaveAction(id, action),
    onSuccess: () => {
      onFlash("Leave updated.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deleteLeave(id),
    onSuccess: () => {
      onFlash("Leave deleted.");
      void qc.invalidateQueries({ queryKey: ["hr", "leave"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const employeeOpts = (options.data?.employees || []).map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));

  const matrixHint = (options.data?.leave_approval_matrix || [])
    .map((m) =>
      m.max_days == null
        ? `${m.label} (any duration)`
        : `≤${m.max_days}d → ${m.label}`,
    )
    .join(" · ");

  return (
    <SectionLayout
      filters={
        <OptionSelect
          value={status}
          onChange={setStatus}
          options={options.data?.leave_approval_statuses}
          placeholder="All"
        />
      }
      form={
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <OptionSelect
              value={form.employee_id}
              onChange={(v) => setForm({ ...form, employee_id: v })}
              options={employeeOpts}
              placeholder="Employee *"
            />
            <OptionSelect
              value={form.leave_type}
              onChange={(v) => setForm({ ...form, leave_type: v })}
              options={options.data?.leave_types}
              placeholder="Leave type"
            />
            <input
              className={inputCls}
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <input
              className={inputCls}
              type="date"
              value={form.from_date}
              onChange={(e) => setForm({ ...form, from_date: e.target.value })}
            />
            <input
              className={inputCls}
              type="date"
              value={form.to_date}
              onChange={(e) => setForm({ ...form, to_date: e.target.value })}
            />
            <button
              type="button"
              disabled={
                !form.employee_id ||
                !form.from_date ||
                !form.to_date ||
                create.isPending
              }
              onClick={() => create.mutate()}
              className={btnCls}
            >
              Submit leave
            </button>
          </div>
          {matrixHint && (
            <div className="text-[11px] text-muted-foreground">
              Approval matrix: {matrixHint}
            </div>
          )}
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={[
            "Employee",
            "Type",
            "From",
            "To",
            "Days",
            "Approver role",
            "Status",
            "Actions",
          ]}
          rows={(q.data?.results || []).map((lr: HRLeave) => [
            lr.employee_name,
            lr.leave_type,
            lr.from_date,
            lr.to_date,
            String(lr.days),
            lr.required_approver_role || "—",
            <StatusBadge key="s" status={lr.approval_status} />,
            lr.approval_status === "pending" ? (
              <div key="a" className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-primary"
                  onClick={() => act.mutate({ id: lr.id, action: "approve" })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="text-xs text-destructive"
                  onClick={() => act.mutate({ id: lr.id, action: "reject" })}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground"
                  onClick={() => remove.mutate(lr.id)}
                >
                  Delete
                </button>
              </div>
            ) : (
              lr.approved_by_name || "—"
            ),
          ])}
        />
        <Pager meta={q.data} />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Payroll ──────────────────────────────────────────────────────────────── */

function PayrollSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [lineEdits, setLineEdits] = useState<
    Record<string, { basic: string; allowances: string; deductions: string; ot_amount: string }>
  >({});
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["hr", "payroll"],
    queryFn: () => hrApi.payroll({ page_size: 50 }),
    enabled: authed,
  });
  const detail = useQuery({
    queryKey: ["hr", "payroll", selected],
    queryFn: () => hrApi.payrollDetail(selected!),
    enabled: authed && !!selected,
  });

  useEffect(() => {
    const lines = detail.data?.lines || [];
    const next: typeof lineEdits = {};
    for (const l of lines) {
      next[l.id] = {
        basic: String(l.basic),
        allowances: String(l.allowances),
        deductions: String(l.deductions),
        ot_amount: String(l.ot_amount),
      };
    }
    setLineEdits(next);
  }, [detail.data]);

  const create = useMutation({
    mutationFn: () => hrApi.createPayroll(period),
    onSuccess: (r) => {
      onFlash(`Payroll ${r.period_month} created.`);
      setSelected(r.id);
      void qc.invalidateQueries({ queryKey: ["hr", "payroll"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "process" | "approve" | "pay" }) =>
      hrApi.payrollAction(id, act),
    onSuccess: () => {
      onFlash("Payroll updated.");
      void qc.invalidateQueries({ queryKey: ["hr", "payroll"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const updateLine = useMutation({
    mutationFn: ({
      runId,
      line,
    }: {
      runId: string;
      line: HRPayrollLine;
    }) => {
      const ed = lineEdits[line.id];
      return hrApi.updatePayrollLine(runId, {
        line_id: line.id,
        basic: Number(ed?.basic ?? line.basic),
        allowances: Number(ed?.allowances ?? line.allowances),
        deductions: Number(ed?.deductions ?? line.deductions),
        ot_amount: Number(ed?.ot_amount ?? line.ot_amount),
      });
    },
    onSuccess: () => {
      onFlash("Payroll line updated.");
      void qc.invalidateQueries({ queryKey: ["hr", "payroll"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deletePayroll(id),
    onSuccess: (_d, id) => {
      if (selected === id) setSelected(null);
      onFlash("Draft payroll deleted.");
      void qc.invalidateQueries({ queryKey: ["hr", "payroll"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const canEditLines =
    detail.data?.status === "draft" || detail.data?.status === "processed";

  return (
    <SectionLayout
      form={
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className={inputCls}
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className={btnCls}
          >
            <Plus className="h-4 w-4" /> Create draft run
          </button>
        </div>
      }
    >
      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error as Error}
        empty={!q.data?.results.length}
      >
        <DataTable
          headers={["Period", "Status", "Lines", "Total net", "Actions"]}
          rows={(q.data?.results || []).map((pr: HRPayrollRun) => [
            pr.period_month,
            <StatusBadge key="s" status={pr.status} />,
            String(pr.line_count),
            pr.total_net.toLocaleString(),
            <div key="a" className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs text-primary"
                onClick={() => setSelected(pr.id)}
              >
                View
              </button>
              {pr.status === "draft" && (
                <>
                  <button
                    type="button"
                    className="text-xs"
                    onClick={() => action.mutate({ id: pr.id, act: "process" })}
                  >
                    Process
                  </button>
                  <button
                    type="button"
                    className="text-xs text-destructive"
                    onClick={() => remove.mutate(pr.id)}
                  >
                    Delete
                  </button>
                </>
              )}
              {pr.status === "processed" && (
                <button
                  type="button"
                  className="text-xs"
                  onClick={() => action.mutate({ id: pr.id, act: "approve" })}
                >
                  Approve
                </button>
              )}
              {pr.status === "approved" && (
                <button
                  type="button"
                  className="text-xs"
                  onClick={() => action.mutate({ id: pr.id, act: "pay" })}
                >
                  Pay
                </button>
              )}
            </div>,
          ])}
        />
      </QueryState>

      {selected && detail.data && (
        <Panel title={`Payroll lines — ${detail.data.period_month}`} className="mt-4">
          <DataTable
            headers={[
              "Code",
              "Employee",
              "Basic",
              "Allowances",
              "OT",
              "Deductions",
              "Net",
              ...(canEditLines ? ["Actions"] : []),
            ]}
            rows={(detail.data.lines || []).map((l) => {
              const ed = lineEdits[l.id];
              if (canEditLines) {
                return [
                  l.employee_code,
                  l.employee_name,
                  <input
                    key="b"
                    className={`${inputCls} w-24`}
                    type="number"
                    value={ed?.basic ?? String(l.basic)}
                    onChange={(e) =>
                      setLineEdits((m) => ({
                        ...m,
                        [l.id]: { ...ed!, basic: e.target.value },
                      }))
                    }
                  />,
                  <input
                    key="al"
                    className={`${inputCls} w-24`}
                    type="number"
                    value={ed?.allowances ?? String(l.allowances)}
                    onChange={(e) =>
                      setLineEdits((m) => ({
                        ...m,
                        [l.id]: { ...ed!, allowances: e.target.value },
                      }))
                    }
                  />,
                  <input
                    key="ot"
                    className={`${inputCls} w-24`}
                    type="number"
                    value={ed?.ot_amount ?? String(l.ot_amount)}
                    onChange={(e) =>
                      setLineEdits((m) => ({
                        ...m,
                        [l.id]: { ...ed!, ot_amount: e.target.value },
                      }))
                    }
                  />,
                  <input
                    key="d"
                    className={`${inputCls} w-24`}
                    type="number"
                    value={ed?.deductions ?? String(l.deductions)}
                    onChange={(e) =>
                      setLineEdits((m) => ({
                        ...m,
                        [l.id]: { ...ed!, deductions: e.target.value },
                      }))
                    }
                  />,
                  <span key="n" className="font-semibold">
                    {l.net_pay.toLocaleString()}
                  </span>,
                  <button
                    key="save"
                    type="button"
                    className="text-xs text-primary"
                    disabled={updateLine.isPending}
                    onClick={() =>
                      updateLine.mutate({ runId: detail.data!.id, line: l })
                    }
                  >
                    Save
                  </button>,
                ];
              }
              return [
                l.employee_code,
                l.employee_name,
                l.basic.toLocaleString(),
                l.allowances.toLocaleString(),
                l.ot_amount.toLocaleString(),
                l.deductions.toLocaleString(),
                <span key="n" className="font-semibold">
                  {l.net_pay.toLocaleString()}
                </span>,
              ];
            })}
            empty="Process the run to generate lines."
          />
        </Panel>
      )}
    </SectionLayout>
  );
}

/* ── Employee create / edit modal ─────────────────────────────────────────── */

function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  employee?: HREmployee;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const authed = useAuthed();
  const options = useHROptions(authed);
  const isEdit = !!employee;
  const [form, setForm] = useState({
    full_name: employee?.full_name || "",
    employee_code: employee?.employee_code || "",
    citizenship_no: employee?.citizenship_no || "",
    pan_no: employee?.pan_no || "",
    classification: employee?.classification || "",
    grade: employee?.grade || "",
    department_id: employee?.department_id || "",
    position_id: employee?.position_id || "",
    reporting_to_id: employee?.reporting_to_id || "",
    join_date: employee?.join_date || new Date().toISOString().slice(0, 10),
    probation_end: employee?.probation_end || "",
    basic: "",
    ot_rate_per_hour: "",
  });

  useEffect(() => {
    if (!options.data || isEdit) return;
    setForm((f) => ({
      ...f,
      classification: f.classification || firstOpt(options.data.classifications),
      grade: f.grade || firstOpt(options.data.grades),
    }));
  }, [options.data, isEdit]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        full_name: form.full_name,
        employee_code: form.employee_code || undefined,
        citizenship_no: form.citizenship_no || undefined,
        pan_no: form.pan_no || undefined,
        classification: form.classification || undefined,
        grade: form.grade || undefined,
        department_id: form.department_id || null,
        position_id: form.position_id || null,
        reporting_to_id: form.reporting_to_id || null,
        join_date: form.join_date || undefined,
        probation_end: form.probation_end || null,
      };
      if (!isEdit) {
        if (form.basic) payload.basic = Number(form.basic);
        if (form.ot_rate_per_hour)
          payload.ot_rate_per_hour = Number(form.ot_rate_per_hour);
      }
      return isEdit
        ? hrApi.updateEmployee(employee!.id, payload)
        : hrApi.createEmployee(payload);
    },
    onSuccess: (e) =>
      onSaved(
        isEdit
          ? `Employee ${e.employee_code} updated.`
          : `Employee ${e.employee_code} created.`,
      ),
    onError: (e: Error) => onSaved(e.message),
  });

  const deptOpts = (options.data?.departments || []).map((d) => ({
    value: d.id,
    label: d.name,
  }));
  const positionOpts = (options.data?.positions || []).map((p) => ({
    value: p.id,
    label: p.designation,
  }));
  const employeeOpts = (options.data?.employees || [])
    .filter((e) => !employee || e.id !== employee.id)
    .map((e) => ({ value: e.id, label: employeeLabel(e) }));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">
            {isEdit ? "Edit employee" : "New employee"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2">
          <input
            className={inputCls}
            placeholder="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Employee code (auto if blank)"
            value={form.employee_code}
            onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              placeholder="Citizenship no"
              value={form.citizenship_no}
              onChange={(e) => setForm({ ...form, citizenship_no: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="PAN no"
              value={form.pan_no}
              onChange={(e) => setForm({ ...form, pan_no: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OptionSelect
              value={form.classification}
              onChange={(v) => setForm({ ...form, classification: v })}
              options={options.data?.classifications}
              placeholder="Classification"
            />
            <OptionSelect
              value={form.grade}
              onChange={(v) => setForm({ ...form, grade: v })}
              options={options.data?.grades}
              placeholder="Grade"
            />
          </div>
          <OptionSelect
            value={form.department_id}
            onChange={(v) => setForm({ ...form, department_id: v })}
            options={deptOpts}
            placeholder="Department"
          />
          <OptionSelect
            value={form.position_id}
            onChange={(v) => setForm({ ...form, position_id: v })}
            options={positionOpts}
            placeholder="Position"
          />
          <OptionSelect
            value={form.reporting_to_id}
            onChange={(v) => setForm({ ...form, reporting_to_id: v })}
            options={employeeOpts}
            placeholder="Reports to"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              type="date"
              value={form.join_date}
              onChange={(e) => setForm({ ...form, join_date: e.target.value })}
            />
            <input
              className={inputCls}
              type="date"
              placeholder="Probation end"
              value={form.probation_end}
              onChange={(e) => setForm({ ...form, probation_end: e.target.value })}
            />
          </div>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="Basic salary (optional)"
                value={form.basic}
                onChange={(e) => setForm({ ...form, basic: e.target.value })}
              />
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="OT rate / hour"
                value={form.ot_rate_per_hour}
                onChange={(e) =>
                  setForm({ ...form, ot_rate_per_hour: e.target.value })
                }
              />
            </div>
          )}
          <button
            type="button"
            disabled={!form.full_name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className={btnCls}
          >
            {isEdit ? "Save changes" : "Create employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Salary modal ─────────────────────────────────────────────────────────── */

function SalaryModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: HREmployee;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const authed = useAuthed();
  const existing = useQuery({
    queryKey: ["hr", "salary", employee.id],
    queryFn: () => hrApi.getSalary(employee.id),
    enabled: authed,
  });
  const [form, setForm] = useState({
    basic: "0",
    da: "0",
    grade_allowance: "0",
    shift_allowance: "0",
    meal_allowance: "0",
    transport_allowance: "0",
    other_allowances: "0",
    deductions: "0",
    ot_rate_per_hour: "0",
    effective_from: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    const s = existing.data as HRSalary | undefined;
    if (!s || !s.id) return;
    setForm({
      basic: String(s.basic ?? 0),
      da: String(s.da ?? 0),
      grade_allowance: String(s.grade_allowance ?? 0),
      shift_allowance: String(s.shift_allowance ?? 0),
      meal_allowance: String(s.meal_allowance ?? 0),
      transport_allowance: String(s.transport_allowance ?? 0),
      other_allowances: String(s.other_allowances ?? 0),
      deductions: String(s.deductions ?? 0),
      ot_rate_per_hour: String(s.ot_rate_per_hour ?? 0),
      effective_from: s.effective_from || new Date().toISOString().slice(0, 10),
      notes: s.notes || "",
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () =>
      hrApi.upsertSalary(employee.id, {
        basic: Number(form.basic) || 0,
        da: Number(form.da) || 0,
        grade_allowance: Number(form.grade_allowance) || 0,
        shift_allowance: Number(form.shift_allowance) || 0,
        meal_allowance: Number(form.meal_allowance) || 0,
        transport_allowance: Number(form.transport_allowance) || 0,
        other_allowances: Number(form.other_allowances) || 0,
        deductions: Number(form.deductions) || 0,
        ot_rate_per_hour: Number(form.ot_rate_per_hour) || 0,
        effective_from: form.effective_from || null,
        notes: form.notes,
      }),
    onSuccess: () => onSaved(`Salary updated for ${employee.full_name}.`),
    onError: (e: Error) => onSaved(e.message),
  });

  const num = (
    key: keyof typeof form,
    label: string,
  ) => (
    <div key={key}>
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <input
        className={inputCls}
        type="number"
        min={0}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold">Salary — {employee.full_name}</div>
            <div className="text-[11px] text-muted-foreground">
              {employee.employee_code}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {existing.isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {num("basic", "Basic")}
            {num("da", "DA")}
            {num("grade_allowance", "Grade allowance")}
            {num("shift_allowance", "Shift allowance")}
            {num("meal_allowance", "Meal allowance")}
            {num("transport_allowance", "Transport")}
            {num("other_allowances", "Other allowances")}
            {num("deductions", "Deductions")}
            {num("ot_rate_per_hour", "OT rate / hour")}
            <div>
              <label className="text-[11px] text-muted-foreground">Effective from</label>
              <input
                className={inputCls}
                type="date"
                value={form.effective_from}
                onChange={(e) =>
                  setForm({ ...form, effective_from: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Notes</label>
              <input
                className={inputCls}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className={`${btnCls} col-span-2`}
            >
              <Wallet className="h-4 w-4" /> Save salary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 text-[var(--color-primary-foreground)] bg-[var(--color-primary)]";
const btnGhostCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 border border-border hover:border-primary";

function SectionLayout({
  search,
  onSearch,
  placeholder,
  filters,
  form,
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  filters?: React.ReactNode;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {(onSearch || filters) && (
        <div className="flex flex-wrap gap-2 items-center">
          {onSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className={`${inputCls} pl-9`}
                placeholder={placeholder || "Search…"}
                value={search || ""}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
          {filters}
        </div>
      )}
      {form && <div className="rounded-2xl bg-card border border-border p-4">{form}</div>}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">{children}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-card border border-border overflow-hidden ${className}`}>
      <div className="p-4 lg:p-5 border-b border-border">
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty = "No records yet.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-widest text-muted-foreground bg-secondary/50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ meta }: { meta?: { page: number; total_pages: number; count: number } | null }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="p-3 text-[11px] text-muted-foreground border-t border-border">
      Page {meta.page} of {meta.total_pages} · {meta.count} records
    </div>
  );
}

function MiniKpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
