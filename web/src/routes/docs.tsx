import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useDocs } from "@/hooks/use-domain";
import { FileText, Book, ExternalLink, Search } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [
    { title: "Documentation — Sunyazon BEOS" },
    { name: "description", content: "Knowledge base: SOPs, HACCP/GMP guides, workflow docs, API reference." },
  ]}),
  component: DocsPage,
});

function DocsPage() {
  const { data, isLoading, isError, error } = useDocs();
  const documents = data?.documents ?? [];
  const templates = data?.templates ?? [];

  return (
    <AppShell title="Documentation" subtitle="knowledge base · SOPs · governance manuals">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!documents.length && !templates.length}>
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input placeholder="Search docs, SOPs, workflows…" className="w-full h-11 pl-10 pr-3 rounded-xl bg-secondary text-sm outline-none border border-transparent focus:border-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Documents</div>
            </div>
            <ul className="space-y-1.5">
              {documents.map((d) => (
                <li key={d.id}>
                  <button className="w-full text-left flex items-center gap-2 text-sm hover:text-primary group py-1.5 border-b border-border/40 last:border-0">
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="text-[10px] text-muted-foreground">{d.type}</span>
                    <span className="text-[10px] text-muted-foreground">{d.updated_at ? fmtDateTime(d.updated_at) : ""}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Book className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm">Templates</div>
            </div>
            <ul className="space-y-1.5">
              {templates.map((t) => (
                <li key={t.id}>
                  <button className="w-full text-left flex items-center gap-2 text-sm hover:text-primary group py-1.5 border-b border-border/40 last:border-0">
                    <span className="flex-1 truncate">{t.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}
