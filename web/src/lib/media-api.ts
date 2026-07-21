/** Media & Live module API — assets, live streams, playlists. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type MediaBucket = { name: string; code: string; value: number };

export type MediaAsset = {
  id: string;
  owner_type: string;
  owner_user_id: string | null;
  owner_user_name: string;
  owner_organization_id: string | null;
  media_type: string;
  title: string;
  description: string;
  file: string;
  thumbnail: string;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  file_size: number;
  processing_status: string;
  view_count: number;
  like_count: number;
  created_at: string;
};

export type LiveStream = {
  id: string;
  host_id: string | null;
  host_name: string;
  title: string;
  description: string;
  thumbnail: string;
  stream_key: string;
  webrtc_room_id: string;
  status: string;
  scheduled_at: string;
  started_at: string;
  ended_at: string;
  viewer_count_peak: number;
  recording: string;
};

export type PlaylistItem = {
  id: string;
  media_asset_id: string;
  title: string;
  media_type: string;
  sort_order: number;
};

export type MediaPlaylist = {
  id: string;
  owner_id: string | null;
  owner_name: string;
  title: string;
  description: string;
  is_public: boolean;
  item_count: number;
  items?: PlaylistItem[] | null;
};

export type MediaOverview = {
  total_assets: number;
  total_views: number;
  playlists_count: number;
  by_media_type: MediaBucket[];
  by_processing_status: MediaBucket[];
  by_live_status: MediaBucket[];
  recent_assets: MediaAsset[];
};

export type MediaOptions = {
  media_types: { value: string; label: string }[];
  processing_statuses: { value: string; label: string }[];
  live_statuses: { value: string; label: string }[];
  assets: { id: string; title: string; media_type: string }[];
};

type ListParams = {
  search?: string;
  media_type?: string;
  processing_status?: string;
  status?: string;
  page?: number;
  page_size?: number;
  sort?: string;
};

function qs(params: Record<string, string | number | boolean | undefined | null> = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const mediaApi = {
  overview: () => apiFetch<MediaOverview>("/media/overview/"),
  options: () => apiFetch<MediaOptions>("/media/options/"),

  assets: (params: ListParams = {}) =>
    apiFetch<Paginated<MediaAsset>>(`/media/assets/${qs(params)}`),
  createAsset: (body: Record<string, unknown>) =>
    apiFetch<MediaAsset>("/media/assets/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAsset: (id: string, body: Record<string, unknown>) =>
    apiFetch<MediaAsset>(`/media/assets/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAsset: (id: string) =>
    apiFetch<{ ok: boolean }>(`/media/assets/${id}/`, { method: "DELETE" }),

  live: (params: ListParams = {}) =>
    apiFetch<Paginated<LiveStream>>(`/media/live/${qs(params)}`),
  createLive: (body: Record<string, unknown>) =>
    apiFetch<LiveStream>("/media/live/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateLive: (id: string, body: Record<string, unknown>) =>
    apiFetch<LiveStream>(`/media/live/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  liveAction: (id: string, action: "go_live" | "end") =>
    apiFetch<LiveStream>(`/media/live/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  deleteLive: (id: string) =>
    apiFetch<{ ok: boolean }>(`/media/live/${id}/`, { method: "DELETE" }),

  playlists: (params: ListParams = {}) =>
    apiFetch<Paginated<MediaPlaylist>>(`/media/playlists/${qs(params)}`),
  getPlaylist: (id: string) => apiFetch<MediaPlaylist>(`/media/playlists/${id}/`),
  createPlaylist: (body: Record<string, unknown>) =>
    apiFetch<MediaPlaylist>("/media/playlists/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePlaylist: (id: string, body: Record<string, unknown>) =>
    apiFetch<MediaPlaylist>(`/media/playlists/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePlaylist: (id: string) =>
    apiFetch<{ ok: boolean }>(`/media/playlists/${id}/`, { method: "DELETE" }),
};
