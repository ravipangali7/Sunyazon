import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useGovernance } from "@/hooks/use-domain";
import { companyApi } from "@/lib/company-api";
import { getToken } from "@/lib/api";
import { Landmark, FileSignature, Calendar, Network, Users, Printer, Pencil } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/governance")({
  head: () => ({
    meta: [
      { title: "Governance — Sunyazon BEOS" },
      {
        name: "description",
        content: "Board, leadership, shareholders, Niyamawali and Prabandhapatra.",
      },
    ],
  }),
  component: GovernancePage,
});

function GovernancePage() {
  const { data, isLoading, isError, error, refetch } = useGovernance();
  const qc = useQueryClient();
  const board = data?.board ?? [];
  const meetings = data?.meetings ?? [];
  const resolutions = data?.resolutions ?? [];
  const leadership = data?.leadership ?? [];
  const shareholders = data?.shareholders ?? [];
  const documents = data?.documents ?? [];

  const govDocs = useQuery({
    queryKey: ["governance-documents"],
    queryFn: () => companyApi.governanceDocs(),
    enabled: typeof window !== "undefined" && !!getToken(),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      companyApi.updateGovernanceDoc(editingId!, { content_html: editHtml }),
    onSuccess: () => {
      setEditingId(null);
      void govDocs.refetch();
      void refetch();
      void qc.invalidateQueries({ queryKey: ["governance"] });
    },
  });

  const createMut = useMutation({
    mutationFn: (doc_type: "niyamawali" | "prabandhapatra") => {
      const tpl = govDocs.data?.templates.find((t) => t.doc_type === doc_type);
      return companyApi.createGovernanceDoc({
        doc_type,
        template_id: tpl?.id,
      });
    },
    onSuccess: () => {
      void govDocs.refetch();
      void refetch();
    },
  });

  const docs = govDocs.data?.documents?.length ? govDocs.data.documents : documents;
  const templates = govDocs.data?.templates ?? [];

  return (
    <AppShell title="Governance" subtitle="board · leadership · niyamawali · prabandhapatra">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!data}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Mini label="Board items" value={board.length} sub="tracked" />
          <Mini label="Leadership seats" value={leadership.length} sub={`${leadership.filter((l) => l.is_filled).length} filled`} />
          <Mini label="Shareholders" value={shareholders.length} sub="registered" />
          <Mini label="Governance docs" value={docs.length} sub="niyamawali / prabandhapatra" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Network className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Company leadership</div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              CEO/MD → Executive Team (CFO, CMO, COO, CTO) · HR department
            </p>
            {leadership.length === 0 && (
              <div className="text-xs text-muted-foreground">No seats yet — complete company registration.</div>
            )}
            {leadership.map((seat) => (
              <div key={seat.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{seat.role_name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{seat.tier}</span>
                  <StatusBadge status={seat.is_filled ? "filled" : "open"} />
                </div>
                {seat.reports_to_code && (
                  <div className="text-[11px] text-muted-foreground">Reports to {seat.reports_to_code}</div>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Shareholders</div>
            </div>
            {shareholders.map((s) => (
              <div key={s.id} className="py-2 border-b border-border/50 last:border-0 flex justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {s.full_name || "—"}
                    {s.is_default ? <span className="ml-2 text-[10px] text-primary">Default</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s.share_units} units</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{s.percentage}%</div>
              </div>
            ))}
            {!shareholders.length && (
              <div className="text-xs text-muted-foreground">No shareholders recorded.</div>
            )}
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Board items</div>
            </div>
            {board.map((b) => (
              <div key={b.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{b.title}</span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {b.signed_at ? `Signed ${fmtDateTime(b.signed_at)}` : "Unsigned"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Niyamawali & Prabandhapatra</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-8 px-3 rounded-lg text-xs font-semibold border border-border"
                onClick={() => createMut.mutate("niyamawali")}
              >
                New Niyamawali
              </button>
              <button
                type="button"
                className="h-8 px-3 rounded-lg text-xs font-semibold border border-border"
                onClick={() => createMut.mutate("prabandhapatra")}
              >
                New Prabandhapatra
              </button>
            </div>
          </div>
          {templates.length > 0 && (
            <div className="text-[11px] text-muted-foreground mb-3">
              Templates: {templates.map((t) => t.name).join(" · ")}
            </div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="py-3 border-b border-border/50 last:border-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-semibold">{d.title}</span>
                <StatusBadge status={d.status} />
                <span className="text-[10px] text-muted-foreground uppercase">{d.doc_type}</span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-primary"
                    onClick={() => {
                      const full = govDocs.data?.documents.find((x) => x.id === d.id);
                      setEditingId(d.id);
                      setEditHtml(full?.content_html || "");
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  {d.print_url && (
                    <a
                      href={`${(typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) || "http://127.0.0.1:8000/api"}${d.print_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <Printer className="h-3 w-3" /> PDF / Print
                    </a>
                  )}
                </div>
              </div>
              {editingId === d.id && (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="w-full h-40 rounded-xl bg-secondary text-sm p-3 outline-none border border-border focus:border-primary font-mono"
                    value={editHtml}
                    onChange={(e) => setEditHtml(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-8 px-3 rounded-lg text-xs font-semibold"
                      style={{
                        backgroundColor: "var(--color-primary)",
                        color: "var(--color-primary-foreground)",
                      }}
                      onClick={() => saveMut.mutate()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="h-8 px-3 rounded-lg text-xs border border-border"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!docs.length && (
            <div className="text-xs text-muted-foreground">
              No governance documents yet. Create from a template or complete company registration.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Meetings</div>
            </div>
            {meetings.map((m) => (
              <div key={m.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{m.title}</span>
                  <StatusBadge status={m.status} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {m.scheduled_at ? fmtDateTime(m.scheduled_at) : "Unscheduled"}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileSignature className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Resolutions</div>
            </div>
            {resolutions.map((r) => (
              <div key={r.id} className="py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{r.title}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.signed_at ? fmtDateTime(r.signed_at) : "Pending signature"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}

function Mini({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
