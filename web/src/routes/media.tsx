import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, Search, Radio, Video, ListChecks, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, Tag } from "@/components/ui-bits/Badge";
import { QueryState } from "@/components/ui-bits/QueryState";
import { getToken } from "@/lib/api";
import { chartSeries } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import {
  mediaApi,
  type LiveStream,
  type MediaAsset,
  type MediaOptions,
  type MediaPlaylist,
} from "@/lib/media-api";

export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media & Live — Sunyazon BEOS" },
      {
        name: "description",
        content: "Brand video library, live streams and playlists.",
      },
    ],
  }),
  component: MediaPage,
});

type Section = "overview" | "assets" | "live" | "playlists";

function sectionFromHash(hash: string): Section {
  const h = (hash || "").replace(/^#/, "");
  const allowed: Section[] = ["overview", "assets", "live", "playlists"];
  return (allowed.includes(h as Section) ? h : "overview") as Section;
}

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Media & Live", subtitle: "media.asset · live_stream · playlist" },
  assets: { title: "Media Assets", subtitle: "media.media_asset" },
  live: { title: "Live Streams", subtitle: "media.live_stream" },
  playlists: { title: "Playlists", subtitle: "media.playlist" },
};

const inputCls =
  "h-10 w-full rounded-xl bg-secondary text-sm px-3 outline-none border border-transparent focus:border-primary";
const btnCls =
  "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50";
const btnPrimary = {
  backgroundColor: "var(--color-primary)",
  color: "var(--color-primary-foreground)",
} as const;

function useAuthed() {
  return typeof window !== "undefined" && !!getToken();
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MediaPage() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section = sectionFromHash(hash);
  const meta = SECTION_META[section];
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      {flash && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{flash}</div>
      )}
      {section === "overview" && <OverviewSection />}
      {section === "assets" && <AssetsSection onFlash={setFlash} />}
      {section === "live" && <LiveSection onFlash={setFlash} />}
      {section === "playlists" && <PlaylistsSection onFlash={setFlash} />}
    </AppShell>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewSection() {
  const authed = useAuthed();
  const overview = useQuery({
    queryKey: ["media", "overview"],
    queryFn: mediaApi.overview,
    enabled: authed,
  });
  const kpi = overview.data;
  const typeData = kpi?.by_media_type?.length ? kpi.by_media_type : [];
  const liveData = kpi?.by_live_status?.length ? kpi.by_live_status : [];

  if (!authed) return <SignInHint />;

  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} error={overview.error as Error}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Mini label="Assets" value={kpi?.total_assets ?? 0} sub="library" />
        <Mini label="Total views" value={kpi?.total_views ?? 0} sub="all assets" />
        <Mini
          label="Live now"
          value={kpi?.by_live_status?.find((s) => s.code === "live")?.value ?? 0}
          sub="streams"
          style={{ color: "var(--color-danger)" }}
        />
        <Mini label="Playlists" value={kpi?.playlists_count ?? 0} sub="collections" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">By media type</div>
          {typeData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No assets yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {typeData.map((s, i) => (
                      <Cell key={s.code} fill={chartSeries[i % chartSeries.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Live status</div>
          {liveData.every((s) => !s.value) ? (
            <div className="text-xs text-muted-foreground">No streams yet.</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={liveData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {liveData.map((s, i) => (
                      <Cell
                        key={s.code}
                        fill={
                          s.code === "live"
                            ? "var(--color-danger)"
                            : s.code === "ended"
                              ? "var(--color-muted-foreground)"
                              : chartSeries[i % chartSeries.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Video className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Processing</div>
          </div>
          <div className="space-y-2">
            {(kpi?.by_processing_status || []).map((row) => (
              <div key={row.code} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{row.name}</span>
                <span className="font-semibold tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Panel title="Recent assets">
        {(kpi?.recent_assets || []).length === 0 ? (
          <Empty>No assets yet.</Empty>
        ) : (
          <div className="divide-y divide-border">
            {(kpi?.recent_assets || []).map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Tag>{a.media_type}</Tag>
                    <StatusBadge status={a.processing_status} />
                  </div>
                  <div className="text-sm font-semibold truncate">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <span>{fmtDate(a.created_at)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-3 w-3" />
                      {a.view_count}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{formatDuration(a.duration_sec)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </QueryState>
  );
}

/* ── Assets ───────────────────────────────────────────────────────────────── */

function AssetsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [processingStatus, setProcessingStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["media", "options"], queryFn: mediaApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["media", "assets", search, mediaType, processingStatus, page],
    queryFn: () =>
      mediaApi.assets({
        search,
        media_type: mediaType || undefined,
        processing_status: processingStatus || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => mediaApi.deleteAsset(id),
    onSuccess: () => {
      onFlash("Asset deleted.");
      void qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search title or description…"
      filters={
        <>
          <select
            className={inputCls}
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {(options.data?.media_types || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={processingStatus}
            onChange={(e) => {
              setProcessingStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(options.data?.processing_statuses || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New asset
        </button>
      }
    >
      {showForm && (
        <AssetForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["media"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Title", "Type", "Duration", "Views", "Status", "Created", "Actions"]}
          rows={(q.data?.results || []).map((row: MediaAsset) => [
            <div key="t">
              <div className="font-semibold">{row.title}</div>
              {row.description ? (
                <div className="text-[11px] text-muted-foreground line-clamp-1">{row.description}</div>
              ) : null}
            </div>,
            <Tag key="mt">{row.media_type}</Tag>,
            formatDuration(row.duration_sec),
            row.view_count.toLocaleString(),
            <StatusBadge key="s" status={row.processing_status} />,
            fmtDate(row.created_at),
            <button
              key="d"
              type="button"
              className="text-xs text-danger font-semibold"
              disabled={remove.isPending}
              onClick={() => remove.mutate(row.id)}
            >
              Delete
            </button>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function AssetForm({
  options,
  onClose,
  onSaved,
}: {
  options?: MediaOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    media_type: "video",
    duration_sec: "",
  });
  const create = useMutation({
    mutationFn: () =>
      mediaApi.createAsset({
        title: form.title,
        description: form.description,
        media_type: form.media_type,
        duration_sec: form.duration_sec ? Number(form.duration_sec) : null,
      }),
    onSuccess: () => onSaved("Asset created."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New media asset" onClose={onClose}>
      <Field label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-20 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Media type">
          <select
            className={inputCls}
            value={form.media_type}
            onChange={(e) => setForm({ ...form, media_type: e.target.value })}
          >
            {(options?.media_types || [
              { value: "video", label: "Video" },
              { value: "audio", label: "Audio" },
              { value: "image", label: "Image" },
              { value: "live_recording", label: "Live Recording" },
            ]).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration (sec)">
          <input
            className={inputCls}
            type="number"
            min={0}
            value={form.duration_sec}
            onChange={(e) => setForm({ ...form, duration_sec: e.target.value })}
          />
        </Field>
      </div>
      <ModalActions
        pending={create.isPending}
        disabled={!form.title.trim()}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── Live ─────────────────────────────────────────────────────────────────── */

function LiveSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["media", "options"], queryFn: mediaApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["media", "live", search, status, page],
    queryFn: () =>
      mediaApi.live({
        search,
        status: status || undefined,
        page,
        page_size: 20,
      }),
    enabled: authed,
  });

  const action = useMutation({
    mutationFn: ({ id, act }: { id: string; act: "go_live" | "end" }) => mediaApi.liveAction(id, act),
    onSuccess: (_, vars) => {
      onFlash(vars.act === "go_live" ? "Stream is live." : "Stream ended.");
      void qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => mediaApi.deleteLive(id),
    onSuccess: () => {
      onFlash("Stream deleted.");
      void qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search streams…"
      filters={
        <select
          className={inputCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {(options.data?.live_statuses || []).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      }
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New stream
        </button>
      }
    >
      {showForm && (
        <LiveForm
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["media"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Title", "Host", "Status", "Scheduled", "Peak viewers", "Actions"]}
          rows={(q.data?.results || []).map((row: LiveStream) => [
            <div key="t">
              <div className="font-semibold flex items-center gap-1.5">
                {row.status === "live" && <Radio className="h-3.5 w-3.5 text-danger animate-pulse" />}
                {row.title}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">{row.stream_key}</div>
            </div>,
            row.host_name || "—",
            <StatusBadge key="s" status={row.status} />,
            fmtDate(row.scheduled_at || row.started_at),
            row.viewer_count_peak.toLocaleString(),
            <div key="a" className="flex flex-wrap gap-1">
              {row.status !== "live" && row.status !== "ended" && (
                <ActionBtn
                  label="Go Live"
                  onClick={() => action.mutate({ id: row.id, act: "go_live" })}
                  disabled={action.isPending}
                />
              )}
              {row.status === "live" && (
                <ActionBtn
                  label="End"
                  danger
                  onClick={() => action.mutate({ id: row.id, act: "end" })}
                  disabled={action.isPending}
                />
              )}
              <button
                type="button"
                className="text-xs text-danger font-semibold px-2"
                disabled={remove.isPending}
                onClick={() => remove.mutate(row.id)}
              >
                Delete
              </button>
            </div>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function LiveForm({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ title: "", description: "", scheduled_at: "" });
  const create = useMutation({
    mutationFn: () =>
      mediaApi.createLive({
        title: form.title,
        description: form.description,
        scheduled_at: form.scheduled_at || undefined,
      }),
    onSuccess: () => onSaved("Live stream scheduled."),
    onError: (e: Error) => onSaved(e.message),
  });
  return (
    <Modal title="New live stream" onClose={onClose}>
      <Field label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-20 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="Scheduled at">
        <input
          className={inputCls}
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
        />
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.title.trim()}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── Playlists ────────────────────────────────────────────────────────────── */

function PlaylistsSection({ onFlash }: { onFlash: (m: string | null) => void }) {
  const authed = useAuthed();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["media", "options"], queryFn: mediaApi.options, enabled: authed });
  const q = useQuery({
    queryKey: ["media", "playlists", search, page],
    queryFn: () => mediaApi.playlists({ search, page, page_size: 20 }),
    enabled: authed,
  });

  const remove = useMutation({
    mutationFn: (id: string) => mediaApi.deletePlaylist(id),
    onSuccess: () => {
      onFlash("Playlist deleted.");
      void qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e: Error) => onFlash(e.message),
  });

  if (!authed) return <SignInHint />;

  return (
    <SectionLayout
      search={search}
      onSearch={(v) => {
        setSearch(v);
        setPage(1);
      }}
      placeholder="Search playlists…"
      form={
        <button type="button" className={btnCls} style={btnPrimary} onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New playlist
        </button>
      }
    >
      {showForm && (
        <PlaylistForm
          options={options.data}
          onClose={() => setShowForm(false)}
          onSaved={(msg) => {
            setShowForm(false);
            onFlash(msg);
            void qc.invalidateQueries({ queryKey: ["media"] });
          }}
        />
      )}
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error as Error} empty={!q.data?.results.length}>
        <DataTable
          headers={["Title", "Owner", "Items", "Visibility", "Actions"]}
          rows={(q.data?.results || []).map((row: MediaPlaylist) => [
            <div key="t">
              <div className="font-semibold flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                {row.title}
              </div>
              {row.description ? (
                <div className="text-[11px] text-muted-foreground line-clamp-1">{row.description}</div>
              ) : null}
            </div>,
            row.owner_name || "—",
            row.item_count,
            row.is_public ? <Tag key="p">Public</Tag> : <Tag key="p">Private</Tag>,
            <button
              key="d"
              type="button"
              className="text-xs text-danger font-semibold"
              disabled={remove.isPending}
              onClick={() => remove.mutate(row.id)}
            >
              Delete
            </button>,
          ])}
        />
        <Pager meta={q.data} onPage={setPage} />
      </QueryState>
    </SectionLayout>
  );
}

function PlaylistForm({
  options,
  onClose,
  onSaved,
}: {
  options?: MediaOptions;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    is_public: false,
    item_ids: [] as string[],
  });
  const create = useMutation({
    mutationFn: () =>
      mediaApi.createPlaylist({
        title: form.title,
        description: form.description,
        is_public: form.is_public,
        item_ids: form.item_ids,
      }),
    onSuccess: () => onSaved("Playlist created."),
    onError: (e: Error) => onSaved(e.message),
  });

  const toggleAsset = (id: string) => {
    setForm((prev) => ({
      ...prev,
      item_ids: prev.item_ids.includes(id)
        ? prev.item_ids.filter((x) => x !== id)
        : [...prev.item_ids, id],
    }));
  };

  return (
    <Modal title="New playlist" onClose={onClose}>
      <Field label="Title *">
        <input
          className={inputCls}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputCls} h-20 py-2`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={form.is_public}
          onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
        />
        Public playlist
      </label>
      <Field label="Assets">
        <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {(options?.assets || []).length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No assets available.</div>
          ) : (
            (options?.assets || []).map((a) => (
              <label key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/40">
                <input
                  type="checkbox"
                  checked={form.item_ids.includes(a.id)}
                  onChange={() => toggleAsset(a.id)}
                />
                <span className="truncate flex-1">{a.title}</span>
                <Tag>{a.media_type}</Tag>
              </label>
            ))
          )}
        </div>
      </Field>
      <ModalActions
        pending={create.isPending}
        disabled={!form.title.trim()}
        onClose={onClose}
        onSave={() => create.mutate()}
      />
    </Modal>
  );
}

/* ── Shared UI ────────────────────────────────────────────────────────────── */

function SignInHint() {
  return (
    <div className="rounded-2xl bg-card border border-border p-10 text-center text-sm text-muted-foreground">
      Sign in to load media data from the database.
    </div>
  );
}

function Mini({
  label,
  value,
  sub,
  style,
}: {
  label: string;
  value: string | number;
  sub?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={style}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function SectionLayout({
  search,
  onSearch,
  placeholder,
  filters,
  form,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  filters?: React.ReactNode;
  form?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
          />
        </div>
        {filters}
        {form}
      </div>
      <div className="rounded-2xl bg-card border border-border overflow-hidden">{children}</div>
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

function Pager({
  meta,
  onPage,
}: {
  meta?: { page: number; total_pages: number; count: number } | null;
  onPage?: (page: number) => void;
}) {
  if (!meta || meta.total_pages <= 1) {
    return meta ? (
      <div className="p-3 text-[11px] text-muted-foreground border-t border-border">{meta.count} records</div>
    ) : null;
  }
  return (
    <div className="p-3 text-[11px] text-muted-foreground border-t border-border flex items-center justify-between gap-2">
      <span>
        Page {meta.page} of {meta.total_pages} · {meta.count} records
      </span>
      {onPage && (
        <div className="flex gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded border border-border disabled:opacity-40"
            disabled={meta.page >= meta.total_pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function ModalActions({
  pending,
  disabled,
  onClose,
  onSave,
}: {
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button type="button" className={btnCls} onClick={onClose}>
        Cancel
      </button>
      <button type="button" className={btnCls} style={btnPrimary} disabled={pending || disabled} onClick={onSave}>
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 px-2.5 rounded-lg text-xs font-semibold disabled:opacity-50"
      style={
        danger
          ? { backgroundColor: "var(--color-danger)", color: "#fff" }
          : btnPrimary
      }
    >
      {label}
    </button>
  );
}
