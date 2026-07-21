import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useDomainMutations, useFeed } from "@/hooks/use-domain";
import { Heart, MessageCircle, Share2, Bookmark } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [
    { title: "Feed — Sunyazon BEOS" },
    { name: "description", content: "Consumer social feed: brand stories, recipes, product drops and dealer offers." },
  ]}),
  component: FeedPage,
});

function FeedPage() {
  const { data: posts = [], isLoading, isError, error } = useFeed();
  const { feedEngage } = useDomainMutations();

  return (
    <AppShell title="Feed" subtitle="social.feed_post · consumer layer">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!posts.length}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {posts.map((p) => (
              <article key={p.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                <header className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-full grid place-items-center font-bold text-sm" style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}>
                    {p.author.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.author}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDateTime(p.created_at)}</div>
                  </div>
                </header>
                <div className="p-4 pt-0">
                  <p className="text-sm">{p.body}</p>
                  <div className="mt-3 flex items-center gap-4 text-muted-foreground">
                    <button type="button" disabled={feedEngage.isPending} onClick={() => feedEngage.mutate({ id: p.id, type: "like" })} className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"><Heart className="h-4 w-4" /> {p.likes.toLocaleString()}</button>
                    <button type="button" disabled={feedEngage.isPending} onClick={() => feedEngage.mutate({ id: p.id, type: "comment", commentText: "Nice!" })} className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"><MessageCircle className="h-4 w-4" /> {p.comments}</button>
                    <button type="button" disabled={feedEngage.isPending} onClick={() => feedEngage.mutate({ id: p.id, type: "share" })} className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"><Share2 className="h-4 w-4" /> Share</button>
                    <button type="button" disabled={feedEngage.isPending} onClick={() => feedEngage.mutate({ id: p.id, type: "save" })} className="ml-auto flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"><Bookmark className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <aside className="hidden lg:block space-y-4">
            <div className="rounded-2xl bg-card border border-border p-4">
              <div className="text-sm font-semibold mb-2">Suggested</div>
              <div className="text-xs text-muted-foreground">Follow creators, dealers and retailers relevant to your channel.</div>
            </div>
          </aside>
        </div>
      </QueryState>
    </AppShell>
  );
}
