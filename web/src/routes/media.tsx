import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { useMedia } from "@/hooks/use-domain";
import { PlayCircle, Radio, Eye } from "lucide-react";

export const Route = createFileRoute("/media")({
  head: () => ({ meta: [
    { title: "Media & Live — Sunyazon BEOS" },
    { name: "description", content: "Brand video library and live-stream commerce sessions." },
  ]}),
  component: MediaPage,
});

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MediaPage() {
  const { data, isLoading, isError, error } = useMedia();
  const live = data?.live ?? [];
  const videos = data?.videos ?? [];

  return (
    <AppShell title="Media & Live" subtitle="media.video · media.live_stream">
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={!live.length && !videos.length}>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            <div className="font-semibold text-sm">Live now</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {live.map((l) => (
              <div key={l.id} className="rounded-2xl overflow-hidden border border-border relative aspect-video grid place-items-center" style={{ background: "linear-gradient(135deg, var(--color-primary)44, #000)" }}>
                <PlayCircle className="h-16 w-16 text-white/90" />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: "var(--color-danger)" }}>{l.status.toUpperCase()}</span>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="text-white font-semibold text-sm truncate">{l.title}</div>
                  <div className="text-[11px] text-white/80 flex items-center gap-1"><Eye className="h-3 w-3" />{l.viewers.toLocaleString()} watching</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="font-semibold text-sm mb-3">Video library</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => (
              <div key={v.id} className="rounded-2xl bg-card border border-border overflow-hidden">
                <div className="aspect-video relative grid place-items-center" style={{ background: "linear-gradient(135deg, var(--color-secondary), var(--color-primary)22)" }}>
                  <PlayCircle className="h-12 w-12 text-white/80" />
                  <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">{formatDuration(v.duration)}</span>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag>{v.type}</Tag>
                  </div>
                  <div className="text-sm font-semibold leading-tight">{v.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </AppShell>
  );
}
