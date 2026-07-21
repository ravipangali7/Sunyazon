import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useChatThreads, useChatMessages, useDomainMutations } from "@/hooks/use-domain";
import { Send, Paperclip, Smile } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat Centre — Sunyazon BEOS" },
      {
        name: "description",
        content: "Unified chat for internal teams, dealers, customers and suppliers.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { data: threads = [], isLoading, isError, error } = useChatThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { chatSend } = useDomainMutations();

  useEffect(() => {
    if (!activeId && threads.length) setActiveId(threads[0].id);
  }, [threads, activeId]);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const { data: msgs = [], isLoading: msgsLoading } = useChatMessages(activeId);

  const send = () => {
    if (!text.trim() || !activeId || chatSend.isPending) return;
    const body = text.trim();
    setText("");
    chatSend.mutate({ threadId: activeId, body });
  };

  return (
    <AppShell title="Chat Centre" subtitle="chat.thread · chat.message · unified inbox">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!threads.length}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-9rem)]">
          <div className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border font-semibold text-sm">Conversations</div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left p-3 ${active?.id === t.id ? "bg-secondary/60" : "hover:bg-secondary/40"}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-9 w-9 rounded-full grid place-items-center font-bold text-xs"
                      style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}
                    >
                      {t.title.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{t.title}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{t.preview}</div>
                    </div>
                    {t.unread > 0 && (
                      <span
                        className="h-5 min-w-5 px-1 rounded-full text-[10px] font-bold grid place-items-center"
                        style={{
                          backgroundColor: "var(--color-primary)",
                          color: "var(--color-primary-foreground)",
                        }}
                      >
                        {t.unread}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl bg-card border border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="font-semibold text-sm">{active?.title ?? "Select a conversation"}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-widest">thread</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgsLoading ? (
                <div className="text-sm text-muted-foreground text-center py-8">Loading messages…</div>
              ) : msgs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">No messages yet</div>
              ) : (
                msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
                      style={
                        m.mine
                          ? {
                              backgroundColor: "var(--color-primary)",
                              color: "var(--color-primary-foreground)",
                            }
                          : { backgroundColor: "var(--color-secondary)" }
                      }
                    >
                      {!m.mine && (
                        <div className="text-[10px] font-semibold opacity-70 mb-0.5">{m.sender}</div>
                      )}
                      <div>{m.body}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${m.mine ? "opacity-70" : "text-muted-foreground"}`}
                      >
                        {m.created_at}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-border flex items-center gap-2">
              <button type="button" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a message…"
                disabled={!activeId || chatSend.isPending}
                className="flex-1 h-9 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
              />
              <button type="button" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary">
                <Smile className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!activeId || chatSend.isPending || !text.trim()}
                className="h-9 w-9 grid place-items-center rounded-lg disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-primary-foreground)",
                }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}
