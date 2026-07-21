import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Briefcase, Send } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useAuth } from "@/lib/auth";
import { companyApi } from "@/lib/company-api";
import { getToken } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Job Vacancies — Sunyazon BEOS" },
      {
        name: "description",
        content: "Browse open positions and apply as a Default (HR Form Applicant) user.",
      },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cover, setCover] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const vacancies = useQuery({
    queryKey: ["hr-vacancies-public"],
    queryFn: () => companyApi.vacancies("public"),
    enabled: typeof window !== "undefined" && !!getToken(),
  });

  const mine = useQuery({
    queryKey: ["hr-applications-mine"],
    queryFn: () => companyApi.applications({ mine: true }),
    enabled: typeof window !== "undefined" && !!getToken(),
  });

  const applyMut = useMutation({
    mutationFn: (vacancyId: string) =>
      companyApi.apply({
        vacancy_id: vacancyId,
        cover_letter: cover[vacancyId] || "",
      }),
    onSuccess: () => {
      setMsg("Application submitted.");
      void qc.invalidateQueries({ queryKey: ["hr-applications-mine"] });
      void qc.invalidateQueries({ queryKey: ["hr-vacancies-public"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const appliedIds = new Set((mine.data || []).map((a) => a.vacancy_id));
  const isDefault =
    !user ||
    user.account_type === "default" ||
    user.account_type === "consumer" ||
    user.portal.role_kind === "none";

  return (
    <AppShell title="Job Vacancies" subtitle="HR Form Applicant · Default account">
      {msg && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {msg}
        </div>
      )}
      <QueryState
        isLoading={vacancies.isLoading}
        isError={vacancies.isError}
        error={vacancies.error as Error}
        empty={!vacancies.data?.length}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {(vacancies.data || []).map((v) => (
            <div key={v.id} className="rounded-2xl bg-card border border-border p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    {v.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {v.organization_name} · {v.position || "Open role"}
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                {v.description || "No description provided."}
              </p>
              <div className="text-[11px] text-muted-foreground mb-3">
                Opens {v.open_date ? fmtDate(v.open_date) : "—"}
                {v.close_date ? ` · Closes ${fmtDate(v.close_date)}` : ""}
              </div>
              {isDefault && !appliedIds.has(v.id) && (
                <>
                  <textarea
                    className="w-full h-20 mb-2 rounded-xl bg-secondary text-sm p-3 outline-none border border-transparent focus:border-primary"
                    placeholder="Cover letter (optional)"
                    value={cover[v.id] || ""}
                    onChange={(e) => setCover((c) => ({ ...c, [v.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={applyMut.isPending}
                    onClick={() => applyMut.mutate(v.id)}
                    className="h-9 px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
                    style={{
                      backgroundColor: "var(--color-primary)",
                      color: "var(--color-primary-foreground)",
                    }}
                  >
                    <Send className="h-3.5 w-3.5" /> Apply
                  </button>
                </>
              )}
              {appliedIds.has(v.id) && (
                <div className="text-xs text-emerald-600 font-medium">You have applied</div>
              )}
            </div>
          ))}
        </div>

        {(mine.data?.length || 0) > 0 && (
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="font-semibold text-sm mb-3">My applications</div>
            <div className="divide-y divide-border">
              {mine.data!.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{a.vacancy_title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {a.applied_at ? fmtDate(a.applied_at) : ""}
                    </div>
                  </div>
                  <StatusBadge status={a.current_stage} />
                </div>
              ))}
            </div>
          </div>
        )}
      </QueryState>
    </AppShell>
  );
}
