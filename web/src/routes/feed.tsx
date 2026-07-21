import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { domainApi } from "@/lib/domain-api";
import { Heart, MessageCircle, Share2, Bookmark, Plus, Newspaper, Video } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Feed — Sunyazon BEOS" },
      {
        name: "description",
        content: "Consumer social feed: brand stories, recipes, product drops and dealer offers.",
      },
    ],
  }),
  component: FeedPage,
});

type Section = "overview" | "posts" | "stories";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "posts", "stories"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

function FeedPage() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const qc = useQueryClient();
  const enabled = typeof window !== "undefined" && !!getToken();
  const feed = useQuery({
    queryKey: ["feed"],
    queryFn: domainApi.feed,
    enabled,
  });
  const engage = useMutation({
    mutationFn: ({
      id,
      type,
      commentText,
    }: {
      id: string;
      type: "like" | "comment" | "share" | "save";
      commentText?: string;
    }) => domainApi.feedEngage(id, type, commentText),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feed"] }),
  });
  const publish = useMutation({
    mutationFn: ({ body, title }: { body: string; title?: string }) =>
      domainApi.feedPublish(body, title),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["feed"] });
      setDraft("");
      setTitle("");
      setShowComposer(false);
    },
  });

  const posts = feed.data ?? [];
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const meta =
    section === "posts"
      ? { title: "Posts", subtitle: "social.feed_post" }
      : section === "stories"
        ? { title: "Stories", subtitle: "social.story" }
        : { title: "Feed", subtitle: "social.feed_post · consumer layer" };

  return (
    <AppShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
        >
          <Plus className="h-4 w-4" /> Publish
        </button>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            { id: "overview", label: "Overview", icon: Newspaper },
            { id: "posts", label: "Posts", icon: Newspaper },
            { id: "stories", label: "Stories", icon: Video },
          ] as const
        ).map((t) => {
          const active = section === t.id;
          return (
            <a
              key={t.id}
              href={t.id === "overview" ? "/feed" : `/feed#${t.id}`}
              className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border border-border"
              style={
                active
                  ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }
                  : undefined
              }
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </a>
          );
        })}
      </div>

      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 space-y-3">
            <div className="text-sm font-semibold">Publish to feed</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full h-10 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
            />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="What's happening?"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none border border-transparent focus:border-primary resize-none"
            />
            {publish.isError && (
              <div className="text-xs text-danger">{(publish.error as Error)?.message || "Publish failed"}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="h-9 px-3 rounded-lg text-sm border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft.trim() || publish.isPending}
                onClick={() => publish.mutate({ body: draft.trim(), title: title.trim() || undefined })}
                className="h-9 px-3 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
              >
                {publish.isPending ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      <QueryState
        isLoading={feed.isLoading}
        isError={feed.isError}
        error={feed.error as Error}
        empty={!posts.length}
        emptyLabel="No posts yet — publish the first one."
      >
        {section === "stories" ? (
          <div className="rounded-2xl bg-card border border-border p-8 text-center text-sm text-muted-foreground">
            Stories reuse the same published feed posts until a dedicated Story API is exposed.
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {posts.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-xl border border-border p-3 text-left">
                  <div className="h-10 w-10 rounded-full grid place-items-center font-bold text-sm mb-2" style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}>
                    {p.author.charAt(0)}
                  </div>
                  <div className="text-xs font-semibold truncate">{p.author}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{p.body}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {posts.map((p) => (
                <article key={p.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                  <header className="flex items-center gap-3 p-4">
                    <div
                      className="h-10 w-10 rounded-full grid place-items-center font-bold text-sm"
                      style={{ backgroundColor: "var(--color-primary)22", color: "var(--color-primary)" }}
                    >
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
                      <button
                        type="button"
                        disabled={engage.isPending}
                        onClick={() => engage.mutate({ id: p.id, type: "like" })}
                        className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"
                      >
                        <Heart className="h-4 w-4" /> {p.likes.toLocaleString()}
                      </button>
                      <button
                        type="button"
                        disabled={engage.isPending}
                        onClick={() => engage.mutate({ id: p.id, type: "comment", commentText: "Nice!" })}
                        className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"
                      >
                        <MessageCircle className="h-4 w-4" /> {p.comments}
                      </button>
                      <button
                        type="button"
                        disabled={engage.isPending}
                        onClick={() => engage.mutate({ id: p.id, type: "share" })}
                        className="flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"
                      >
                        <Share2 className="h-4 w-4" /> Share
                      </button>
                      <button
                        type="button"
                        disabled={engage.isPending}
                        onClick={() => engage.mutate({ id: p.id, type: "save" })}
                        className="ml-auto flex items-center gap-1 text-xs hover:text-foreground disabled:opacity-50"
                      >
                        <Bookmark className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <aside className="hidden lg:block space-y-4">
              <div className="rounded-2xl bg-card border border-border p-4">
                <div className="text-sm font-semibold mb-1">Live feed</div>
                <div className="text-xs text-muted-foreground">
                  {posts.length} published post{posts.length === 1 ? "" : "s"} from the API.
                </div>
              </div>
            </aside>
          </div>
        )}
      </QueryState>
    </AppShell>
  );
}
