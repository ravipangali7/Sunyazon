import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { hrApi, type HREmployee, type HRLeave, type HRPayrollRun } from "@/lib/hr-api";

export const Route = createFileRoute("/hr")({
  head: () => ({
    meta: [
      { title: "HR & People — Sunyazon BEOS" },
      {
        name: "description",
        content: "Positions, employees, vacancies, applicants, onboarding, training, attendance, leave and payroll.",
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

function HR() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);
  const [showNewEmployee, setShowNewEmployee] = useState(false);
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
          onClick={() => setShowNewEmployee(true)}
          className="hidden lg:inline-flex h-9 px-4 rounded-lg text-sm font-semibold items-center gap-2"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
        >
          <UserPlus className="h-4 w-4" /> New Employee
        </button>
      }
    >
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{flash}</div>
      )}
      {showNewEmployee && (
        <EmployeeFormModal
          onClose={() => setShowNewEmployee(false)}
          onSaved={(msg) => {
            setShowNewEmployee(false);
            setFlash(msg);
            invalidateHr();
          }}
        />
      )}

      {section === "overview" && <OverviewSection onFlash={setFlash} />}
      {section === "positions" && <PositionsSection onFlash={setFlash} />}
      {section === "employees" && (
        <EmployeesSection onFlash={setFlash} onNew={() => setShowNewEmployee(true)} />
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

  const createVacancy = useMutation({
    mutationFn: () => hrApi.createVacancy({ title, description, position: title, publish: true }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
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

  const isLoading = overview.isLoading || employees.isLoading;
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
    <QueryState
      isLoading={isLoading}
      isError={isError}
      error={error}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
        <MiniKpi label="Headcount" value={kpi?.headcount ?? 0} sub={`${kpi?.active ?? 0} active`} />
        <MiniKpi
          label="Present Today"
          value={kpi?.present_today ?? 0}
          sub={kpi ? `${kpi.present_pct}%` : "—"}
        />
        <MiniKpi label="Open vacancies" value={kpi?.open_vacancies ?? 0} sub="published" />
        <MiniKpi label="Applications" value={kpi?.applications ?? 0} sub="to review" />
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
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
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
                {["shortlisted", "approved", "rejected", "hired"].map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border hover:border-primary"
                    onClick={() => reviewMut.mutate({ id: a.id, stage })}
                  >
                    {stage}
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
              <div className="h-full grid place-items-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deptData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {deptData.map((_, i) => (
                      <Cell key={i} fill={chartSeries[i % chartSeries.length]} stroke="var(--color-card)" strokeWidth={2} />
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

      <Panel title="Employee directory">
        <DataTable
          headers={["Code", "Employee", "Designation", "Department", "Type", "Contact", "Status"]}
          rows={(employees.data?.results || []).map((e) => [
            <span key="c" className="font-mono text-xs">{e.employee_code}</span>,
            <span key="n" className="font-semibold">{e.full_name}</span>,
            e.designation || "—",
            e.department_name || "—",
            <Tag key="t">{e.employment_type || e.classification}</Tag>,
            <span key="m" className="inline-flex items-center gap-2 text-xs text-muted-foreground">
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ designation: "", department: "", code: "", min_edu: "", experience: "" });
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["hr", "positions", search],
    queryFn: () => hrApi.positions({ search, page_size: 50 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: () => hrApi.createPosition(form),
    onSuccess: () => {
      setForm({ designation: "", department: "", code: "", min_edu: "", experience: "" });
      onFlash("Position created.");
      void qc.invalidateQueries({ queryKey: ["hr", "positions"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deletePosition(id),
    onSuccess: () => {
      onFlash("Position deleted.");
      void qc.invalidateQueries({ queryKey: ["hr", "positions"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search positions…"
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className={inputCls} placeholder="Designation *" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <input className={inputCls} placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <input className={inputCls} placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className={inputCls} placeholder="Min education" value={form.min_edu} onChange={(e) => setForm({ ...form, min_edu: e.target.value })} />
          <input className={inputCls} placeholder="Experience" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
          <button type="button" disabled={!form.designation.trim() || create.isPending} onClick={() => create.mutate()} className={btnCls}>
            <Plus className="h-4 w-4" /> Add position
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Code", "Designation", "Department", "Education", "Experience", "Staff", "Actions"]}
          rows={(q.data?.results || []).map((p) => [
            p.code || "—",
            p.designation,
            p.department || "—",
            p.min_edu || "—",
            p.experience || "—",
            String(p.employee_count),
            <button key="d" type="button" className="text-xs text-destructive" disabled={p.is_system} onClick={() => remove.mutate(p.id)}>
              Delete
            </button>,
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
}: {
  onFlash: (m: string | null) => void;
  onNew: () => void;
}) {
  const authed = useAuthed();
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
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="suspended">Suspended</option>
          <option value="exited">Exited</option>
        </select>
      }
      form={
        <button type="button" onClick={onNew} className={btnCls}>
          <UserPlus className="h-4 w-4" /> New employee
        </button>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Code", "Employee", "Designation", "Department", "Type", "Grade", "Status", "Actions"]}
          rows={(q.data?.results || []).map((e) => [
            <span key="c" className="font-mono text-xs">{e.employee_code}</span>,
            <div key="n">
              <div className="font-semibold">{e.full_name}</div>
              <div className="text-[11px] text-muted-foreground">{e.email || "—"}</div>
            </div>,
            e.designation || "—",
            e.department_name || "—",
            <Tag key="t">{e.classification || e.employment_type}</Tag>,
            e.grade,
            <StatusBadge key="s" status={e.status} />,
            e.raw_status !== "exited" && e.status !== "resigned" ? (
              <button key="x" type="button" className="text-xs text-destructive" onClick={() => exitMut.mutate(e.id)}>
                Exit
              </button>
            ) : (
              "—"
            ),
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positionId, setPositionId] = useState("");
  const qc = useQueryClient();
  const positions = useQuery({
    queryKey: ["hr", "positions", "lookup"],
    queryFn: () => hrApi.positions({ page_size: 100 }),
    enabled: authed,
  });
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
        position: title,
        publish: true,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      onFlash("Vacancy created & published.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "publish" | "close" }) => hrApi.vacancyAction(id, act),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "vacancies"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  const filtered = useMemo(() => q.data || [], [q.data]);

  return (
    <SectionLayout
      form={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Job title *" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className={inputCls} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            <option value="">Position (optional)</option>
            {(positions.data?.results || []).map((p) => (
              <option key={p.id} value={p.id}>{p.designation}</option>
            ))}
          </select>
          <textarea className={`${inputCls} md:col-span-2 h-20`} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button type="button" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()} className={btnCls}>
            <Plus className="h-4 w-4" /> Create & publish
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!filtered.length}>
        <DataTable
          headers={["Code", "Title", "Position", "Applicants", "Status", "Actions"]}
          rows={filtered.map((v) => [
            <span key="c" className="font-mono text-xs">{v.vacancy_code}</span>,
            v.title,
            v.position || "—",
            String(v.applicant_count),
            <StatusBadge key="s" status={v.status} />,
            <div key="a" className="flex gap-2">
              {v.status === "draft" && (
                <button type="button" className="text-xs text-primary" onClick={() => action.mutate({ id: v.id, act: "publish" })}>Publish</button>
              )}
              {v.status === "active" && (
                <button type="button" className="text-xs text-destructive" onClick={() => action.mutate({ id: v.id, act: "close" })}>Close</button>
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
  const [stage, setStage] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["hr", "applications"],
    queryFn: () => hrApi.applications(),
    enabled: authed,
  });
  const review = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => hrApi.reviewApplication(id, { stage: s }),
    onSuccess: () => {
      onFlash("Application updated.");
      void qc.invalidateQueries({ queryKey: ["hr"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const rows = (q.data || []).filter((a) => !stage || a.current_stage === stage);

  return (
    <SectionLayout
      filters={
        <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {["applied", "shortlisted", "interviewed", "approved", "rejected", "hired"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!rows.length}>
        <DataTable
          headers={["Applicant", "Vacancy", "Contact", "Exp", "Stage", "Actions"]}
          rows={rows.map((a) => [
            <div key="n" className="font-semibold">{a.full_name}</div>,
            a.vacancy_title,
            a.email || a.phone || "—",
            `${a.exp_years}y`,
            <StatusBadge key="s" status={a.current_stage} />,
            <div key="a" className="flex flex-wrap gap-1">
              {["shortlisted", "interviewed", "approved", "rejected", "hired"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="h-6 px-2 rounded text-[10px] border border-border hover:border-primary"
                  onClick={() => review.mutate({ id: a.id, s })}
                >
                  {s}
                </button>
              ))}
            </div>,
          ])}
        />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Onboarding ───────────────────────────────────────────────────────────── */

function OnboardingSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ["hr", "employees", "lookup"],
    queryFn: () => hrApi.employees({ page_size: 100, status: "active" }),
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["hr", "onboarding", search],
    queryFn: () => hrApi.onboarding({ search, page_size: 50 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: () =>
      hrApi.createOnboarding({
        employee_id: employeeId,
        tasks: ["Offer letter", "ID verification", "System access", "Induction"],
      }),
    onSuccess: () => {
      setEmployeeId("");
      onFlash("Onboarding started.");
      void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      hrApi.updateOnboardingTask(id, { is_completed: done }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] }),
    onError: (e: Error) => onFlash(e.message),
  });
  const markComplete = useMutation({
    mutationFn: (id: string) => hrApi.updateOnboarding(id, { gurukul_status: "completed" }),
    onSuccess: () => {
      onFlash("Onboarding marked completed.");
      void qc.invalidateQueries({ queryKey: ["hr", "onboarding"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search onboarding…"
      form={
        <div className="flex flex-wrap gap-2">
          <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select employee</option>
            {(employees.data?.results || []).map((e) => (
              <option key={e.id} value={e.id}>{e.employee_code} — {e.full_name}</option>
            ))}
          </select>
          <button type="button" disabled={!employeeId || create.isPending} onClick={() => create.mutate()} className={btnCls}>
            <Plus className="h-4 w-4" /> Start onboarding
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <div className="space-y-4">
          {(q.data?.results || []).map((o) => (
            <div key={o.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold text-sm">{o.employee_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {o.employee_code} · joined {o.joined_date || "—"} · {o.tasks_done}/{o.tasks_total} tasks
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.gurukul_status || "pending"} />
                  {o.gurukul_status !== "completed" && (
                    <button type="button" className="text-xs text-primary" onClick={() => markComplete.mutate(o.id)}>
                      Complete
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                {o.tasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      checked={t.is_completed}
                      onChange={(e) => toggleTask.mutate({ id: t.id, done: e.target.checked })}
                    />
                    <span className={t.is_completed ? "line-through text-muted-foreground" : ""}>{t.task_name}</span>
                  </label>
                ))}
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ employee_id: "", module_name: "", exam_score: "0" });
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ["hr", "employees", "lookup"],
    queryFn: () => hrApi.employees({ page_size: 100 }),
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["hr", "training", search],
    queryFn: () => hrApi.training({ search, page_size: 50 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: () =>
      hrApi.createTraining({
        employee_id: form.employee_id,
        module_name: form.module_name,
        exam_score: Number(form.exam_score) || 0,
      }),
    onSuccess: () => {
      setForm({ employee_id: "", module_name: "", exam_score: "0" });
      onFlash("Training log saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "training"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => hrApi.deleteTraining(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hr", "training"] }),
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search training…"
      form={
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Employee *</option>
            {(employees.data?.results || []).map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="Module name *" value={form.module_name} onChange={(e) => setForm({ ...form, module_name: e.target.value })} />
          <input className={inputCls} type="number" min={0} max={100} placeholder="Exam score" value={form.exam_score} onChange={(e) => setForm({ ...form, exam_score: e.target.value })} />
          <button
            type="button"
            disabled={!form.employee_id || !form.module_name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className={btnCls}
          >
            <Plus className="h-4 w-4" /> Add log
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Employee", "Module", "Score", "Pass", "Completed", "Actions"]}
          rows={(q.data?.results || []).map((t) => [
            t.employee_name,
            t.module_name,
            String(t.exam_score),
            t.passed ? <Check key="p" className="h-4 w-4 text-primary" /> : <X key="f" className="h-4 w-4 text-destructive" />,
            t.completion_date || "—",
            <button key="d" type="button" className="text-xs text-destructive" onClick={() => remove.mutate(t.id)}>Delete</button>,
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ employee_id: "", check_in: "09:00", status: "present", shift: "A" });
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ["hr", "employees", "lookup"],
    queryFn: () => hrApi.employees({ page_size: 100, status: "active" }),
    enabled: authed,
  });
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
        check_in: form.check_in,
        status: form.status,
        shift: form.shift,
      }),
    onSuccess: () => {
      onFlash("Attendance saved.");
      void qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      void qc.invalidateQueries({ queryKey: ["hr", "overview"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  return (
    <SectionLayout
      search={search}
      onSearch={setSearch}
      placeholder="Search attendance…"
      filters={
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Employee *</option>
            {(employees.data?.results || []).map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
          <input className={inputCls} type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
          <select className={inputCls} value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="half_day">Half day</option>
            <option value="leave">Leave</option>
          </select>
          <button type="button" disabled={!form.employee_id || upsert.isPending} onClick={() => upsert.mutate()} className={btnCls}>
            Save attendance
          </button>
        </div>
      }
    >
      <div className="mb-3 text-xs text-muted-foreground">
        Present: {q.data?.present_count ?? 0} · Date: {q.data?.date ?? date}
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Employee", "Shift", "Check-in", "Check-out", "Hours", "OT", "Status"]}
          rows={(q.data?.results || []).map((a) => [
            a.employee_name,
            a.shift,
            a.check_in ?? "—",
            a.check_out ?? "—",
            `${a.work_hours.toFixed(1)}h`,
            String(a.ot_hours),
            <StatusBadge key="s" status={a.status} />,
          ])}
        />
      </QueryState>
    </SectionLayout>
  );
}

/* ── Leave ────────────────────────────────────────────────────────────────── */

function LeaveSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "casual",
    from_date: "",
    to_date: "",
    reason: "",
  });
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ["hr", "employees", "lookup"],
    queryFn: () => hrApi.employees({ page_size: 100, status: "active" }),
    enabled: authed,
  });
  const q = useQuery({
    queryKey: ["hr", "leave", status],
    queryFn: () => hrApi.leave({ approval_status: status || undefined, page_size: 50 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: () => hrApi.createLeave(form),
    onSuccess: () => {
      setForm({ employee_id: "", leave_type: "casual", from_date: "", to_date: "", reason: "" });
      onFlash("Leave request submitted.");
      void qc.invalidateQueries({ queryKey: ["hr", "leave"] });
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

  return (
    <SectionLayout
      filters={
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      }
      form={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Employee *</option>
            {(employees.data?.results || []).map((e: HREmployee) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
            {["casual", "sick", "festival", "maternity", "paternity"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input className={inputCls} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <input className={inputCls} type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
          <input className={inputCls} type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
          <button
            type="button"
            disabled={!form.employee_id || !form.from_date || !form.to_date || create.isPending}
            onClick={() => create.mutate()}
            className={btnCls}
          >
            Submit leave
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Employee", "Type", "From", "To", "Days", "Status", "Actions"]}
          rows={(q.data?.results || []).map((lr: HRLeave) => [
            lr.employee_name,
            lr.leave_type,
            lr.from_date,
            lr.to_date,
            String(lr.days),
            <StatusBadge key="s" status={lr.approval_status} />,
            lr.approval_status === "pending" ? (
              <div key="a" className="flex gap-2">
                <button type="button" className="text-xs text-primary" onClick={() => act.mutate({ id: lr.id, action: "approve" })}>Approve</button>
                <button type="button" className="text-xs text-destructive" onClick={() => act.mutate({ id: lr.id, action: "reject" })}>Reject</button>
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

  return (
    <SectionLayout
      form={
        <div className="flex flex-wrap gap-2 items-center">
          <input className={inputCls} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <button type="button" disabled={create.isPending} onClick={() => create.mutate()} className={btnCls}>
            <Plus className="h-4 w-4" /> Create draft run
          </button>
        </div>
      }
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Period", "Status", "Lines", "Total net", "Actions"]}
          rows={(q.data?.results || []).map((pr: HRPayrollRun) => [
            pr.period_month,
            <StatusBadge key="s" status={pr.status} />,
            String(pr.line_count),
            pr.total_net.toLocaleString(),
            <div key="a" className="flex flex-wrap gap-2">
              <button type="button" className="text-xs text-primary" onClick={() => setSelected(pr.id)}>View</button>
              {pr.status === "draft" && (
                <button type="button" className="text-xs" onClick={() => action.mutate({ id: pr.id, act: "process" })}>Process</button>
              )}
              {pr.status === "processed" && (
                <button type="button" className="text-xs" onClick={() => action.mutate({ id: pr.id, act: "approve" })}>Approve</button>
              )}
              {pr.status === "approved" && (
                <button type="button" className="text-xs" onClick={() => action.mutate({ id: pr.id, act: "pay" })}>Pay</button>
              )}
            </div>,
          ])}
        />
      </QueryState>

      {selected && detail.data && (
        <Panel title={`Payroll lines — ${detail.data.period_month}`} className="mt-4">
          <DataTable
            headers={["Code", "Employee", "Basic", "Allowances", "OT", "Deductions", "Net"]}
            rows={(detail.data.lines || []).map((l) => [
              l.employee_code,
              l.employee_name,
              l.basic.toLocaleString(),
              l.allowances.toLocaleString(),
              l.ot_amount.toLocaleString(),
              l.deductions.toLocaleString(),
              <span key="n" className="font-semibold">{l.net_pay.toLocaleString()}</span>,
            ])}
            empty="Process the run to generate lines."
          />
        </Panel>
      )}
    </SectionLayout>
  );
}

/* ── Employee create modal ────────────────────────────────────────────────── */

function EmployeeFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const authed = useAuthed();
  const [form, setForm] = useState({
    full_name: "",
    employee_code: "",
    classification: "permanent",
    grade: "G1",
    department_id: "",
    position_id: "",
    join_date: new Date().toISOString().slice(0, 10),
  });
  const depts = useQuery({
    queryKey: ["hr", "departments"],
    queryFn: hrApi.departments,
    enabled: authed,
  });
  const positions = useQuery({
    queryKey: ["hr", "positions", "lookup"],
    queryFn: () => hrApi.positions({ page_size: 100 }),
    enabled: authed,
  });
  const create = useMutation({
    mutationFn: () => hrApi.createEmployee(form),
    onSuccess: (e) => onSaved(`Employee ${e.employee_code} created.`),
    onError: (e: Error) => onSaved(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">New employee</div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2">
          <input className={inputCls} placeholder="Full name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className={inputCls} placeholder="Employee code (auto if blank)" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
              {["permanent", "contract", "temporary", "daily", "intern"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className={inputCls} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              {["G1", "G2", "G3", "G4", "G5", "G6", "G7"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <select className={inputCls} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">Department</option>
            {(depts.data || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select className={inputCls} value={form.position_id} onChange={(e) => setForm({ ...form, position_id: e.target.value })}>
            <option value="">Position</option>
            {(positions.data?.results || []).map((p) => (
              <option key={p.id} value={p.id}>{p.designation}</option>
            ))}
          </select>
          <input className={inputCls} type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
          <button
            type="button"
            disabled={!form.full_name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className={btnCls}
          >
            Create employee
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full h-10 rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 text-[var(--color-primary-foreground)] bg-[var(--color-primary)]";

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
              <th key={h} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-middle">{cell}</td>
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
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
