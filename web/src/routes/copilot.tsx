import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth";
import { enterpriseApi } from "@/lib/enterprise-api";
import { Sparkles, Send } from "lucide-react";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "AI Copilot — Sunyazon BEOS" },
      {
        name: "description",
        content: "AI assistant grounded in BEOS data: tasks, batches, KPIs, forecasts.",
      },
    ],
  }),
  component: CopilotPage,
});

type Msg = { id: string; from: "me" | "bot"; body: string };

function CopilotPage() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    const mine: Msg = { id: `${Date.now()}-me`, from: "me", body: q };
    setMsgs((m) => [...m, mine]);
    setText("");
    setBusy(true);
    try {
      const res = await enterpriseApi.search(q.trim());
      const hits = res.results ?? [];
      const body =
        hits.length === 0
          ? `No indexed results for “${res.query || q}”. Try another keyword across tasks, modules, or documents.`
          : [
              `Found ${hits.length} result(s) for “${res.query || q}”:`,
              ...hits.slice(0, 8).map((h, i) => `${i + 1}. ${h.title}${h.route ? ` → ${h.route}` : ""}${h.subtitle ? ` (${h.subtitle})` : ""}`),
            ].join("\n");
      setMsgs((m) => [...m, { id: `${Date.now()}-bot`, from: "bot", body }]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Search failed";
      setMsgs((m) => [
        ...m,
        {
          id: `${Date.now()}-bot`,
          from: "bot",
          body: `Could not query BEOS search: ${detail}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="AI Copilot" subtitle="ai.copilot · grounded in BEOS search">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 rounded-2xl bg-card border border-border overflow-hidden flex flex-col h-[70vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.length === 0 ? (
              <div className="h-full grid place-items-center text-center px-6">
                <div>
                  <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
                  <div className="text-sm font-semibold">
                    {user?.full_name ? `Hi ${user.full_name.split(" ")[0]}` : "Hi"} — BEOS Copilot
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Ask about tasks, modules, or documents. Answers are grounded in live `/search/` results.
                  </div>
                </div>
              </div>
            ) : (
              msgs.map((m) => (
                <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
                    style={
                      m.from === "me"
                        ? {
                            backgroundColor: "var(--color-primary)",
                            color: "var(--color-primary-foreground)",
                          }
                        : { backgroundColor: "var(--color-secondary)" }
                    }
                  >
                    {m.from === "bot" && (
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest opacity-70 mb-1">
                        <Sparkles className="h-3 w-3" /> Copilot
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t border-border flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send(text)}
              placeholder="Ask about tasks, batches, KPIs…"
              disabled={busy}
              className="flex-1 h-10 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send(text)}
              disabled={busy || !text.trim()}
              className="h-10 w-10 grid place-items-center rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "var(--color-primary-foreground)",
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="text-sm font-semibold mb-2">Status</div>
          <div className="text-xs text-muted-foreground">
            Connected to enterprise search. Full RAG / embedding answers can layer on the same query log.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
