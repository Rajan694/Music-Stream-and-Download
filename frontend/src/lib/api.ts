import { z } from "zod";
import {
  AudioFormat,
  AudioQuality,
  Playlist,
  PlaylistSchema,
  SearchResult,
  Video,
  VideoSchema,
  VideoSummarySchema,
} from "@music/shared";
import { useAuthStore } from "../stores/auth.store";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export type SearchApiResponse =
  | { intent: "video"; id: string }
  | { intent: "playlist"; id: string }
  | { intent: "search"; data: SearchResult };

export interface RecentSongRecord {
  id: string;
  videoId: string;
  title: string;
  uploaderName: string;
  thumbnailUrl: string | null;
  duration: number;
  playedAt: string;
}

export interface PinnedPlaylistRecord {
  id: string;
  playlistId: string;
  title: string;
  thumbnailUrl: string | null;
  videoCount: number;
  pinnedAt: string;
}

export interface UserSettings {
  defaultFormat: AudioFormat;
  defaultQuality: AudioQuality;
  streamQuality: AudioQuality;
  theme: "light" | "dark" | "system";
}

export interface DownloadEstimate {
  videoId: string;
  title: string;
  uploaderName: string;
  duration: number;
  estimatedSize: number | null;
  exact: boolean;
  sizeRange?: { min: number; max: number };
}

export interface PlaylistDownloadEstimate {
  playlistId: string;
  title: string;
  uploaderName: string;
  totalCount: number;
  itemCount: number;
  skippedCount: number;
  overCapCount: number;
  maxItems: number;
  totalDuration: number;
  estimatedSize: number | null;
  exact: boolean;
  sizeRange?: { min: number; max: number };
}

export interface DownloadItemRecord {
  id: string;
  videoId: string;
  title: string;
  state: string;
  progress: number;
  errorCode: string | null;
  position: number;
}

export interface DownloadJobRecord {
  id: string;
  kind: "video" | "playlist";
  videoId: string | null;
  playlistId: string | null;
  title: string;
  format: string;
  quality: string;
  state: string;
  progress: number;
  errorCode: string | null;
  fileSize: number | null;
  createdAt: string;
  items: DownloadItemRecord[];
}

interface FetchOptions<T> {
  schema?: z.ZodType<T>;
  method?: string;
  body?: unknown;
  authed?: boolean;
  credentials?: boolean;
  retryOnUnauthorized?: boolean;
}

let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    try {
      const { accessToken } = await fetchApi<{ accessToken: string }>(
        "/auth/refresh",
        { method: "POST", credentials: true, retryOnUnauthorized: false },
      );
      useAuthStore
        .getState()
        .setAuth(useAuthStore.getState().user, accessToken);
      return accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function fetchApi<T>(
  endpoint: string,
  opts: FetchOptions<T> = {},
): Promise<T> {
  const {
    schema,
    method = "GET",
    body,
    authed = false,
    credentials = false,
    retryOnUnauthorized = true,
  } = opts;

  const headers = new Headers({ "Content-Type": "application/json" });
  if (authed) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: credentials ? "include" : "same-origin",
  });

  if (response.status === 401 && authed && retryOnUnauthorized) {
    try {
      await refreshAccessToken();
    } catch {
      useAuthStore.getState().logout();
      throw new Error("Your session has expired. Please sign in again.");
    }
    return fetchApi<T>(endpoint, { ...opts, retryOnUnauthorized: false });
  }

  if (!response.ok) {
    let errorDesc = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.message) errorDesc = errorJson.message;
    } catch {
      // Non-JSON error body; the status line above is the best we have.
    }
    throw new Error(errorDesc);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json();
  if (schema) return schema.parse(data);
  return data as T;
}

export const apiClient = {
  search: (query: string) =>
    fetchApi<SearchApiResponse>(`/media/search?q=${encodeURIComponent(query)}`),
  getVideo: (id: string): Promise<Video> =>
    fetchApi(`/media/videos/${id}`, { schema: VideoSchema }),
  getPlaylist: (id: string): Promise<Playlist> =>
    fetchApi(`/media/playlists/${id}`, { schema: PlaylistSchema }),
  getSuggestions: (id: string) =>
    fetchApi(`/media/videos/${id}/suggestions`, {
      schema: z.array(VideoSummarySchema),
    }),
  getSearchSuggestions: (q: string) =>
    fetchApi<string[]>(`/media/suggestions?q=${encodeURIComponent(q)}`),

  refresh: async () => ({ accessToken: await refreshAccessToken() }),
  me: () =>
    fetchApi<{ id: string; email: string }>("/auth/me", { authed: true }),
  logout: () =>
    fetchApi<{ success: boolean }>("/auth/logout", {
      method: "POST",
      credentials: true,
    }),

  getHistory: () =>
    fetchApi<RecentSongRecord[]>("/me/history", { authed: true }),
  addHistory: (song: {
    videoId: string;
    title: string;
    uploaderName: string;
    thumbnailUrl?: string;
    duration: number;
    playedAt: string;
  }) =>
    fetchApi<RecentSongRecord>("/me/history", {
      method: "POST",
      authed: true,
      body: song,
    }),
  syncHistory: (items: unknown[]) =>
    fetchApi<RecentSongRecord[]>("/me/history/sync", {
      method: "POST",
      authed: true,
      body: { items },
    }),

  getPinnedPlaylists: () =>
    fetchApi<PinnedPlaylistRecord[]>("/me/playlists", { authed: true }),
  pinPlaylist: (playlist: {
    playlistId: string;
    title: string;
    thumbnailUrl?: string;
    videoCount?: number;
  }) =>
    fetchApi<PinnedPlaylistRecord>("/me/playlists", {
      method: "POST",
      authed: true,
      body: playlist,
    }),
  unpinPlaylist: (playlistId: string) =>
    fetchApi<{ count: number }>(`/me/playlists/${playlistId}`, {
      method: "DELETE",
      authed: true,
    }),

  getSettings: () => fetchApi<UserSettings>("/me/settings", { authed: true }),
  updateSettings: (patch: Partial<UserSettings>) =>
    fetchApi<UserSettings>("/me/settings", {
      method: "PATCH",
      authed: true,
      body: patch,
    }),

  estimateDownload: (videoId: string, format: string, quality: string) =>
    fetchApi<DownloadEstimate>("/downloads/estimate", {
      method: "POST",
      authed: true,
      body: { videoId, format, quality },
    }),
  createDownload: (videoId: string, format: string, quality: string) =>
    fetchApi<{
      id: string;
      videoId: string;
      title: string;
      state: string;
      progress: number;
    }>("/downloads", {
      method: "POST",
      authed: true,
      body: { videoId, format, quality },
    }),
  getDownload: (id: string) =>
    fetchApi<DownloadJobRecord>(`/downloads/${id}`, { authed: true }),
  listDownloads: () =>
    fetchApi<DownloadJobRecord[]>("/downloads", { authed: true }),
  estimatePlaylistDownload: (
    playlistId: string,
    format: string,
    quality: string,
  ) =>
    fetchApi<PlaylistDownloadEstimate>("/downloads/playlist/estimate", {
      method: "POST",
      authed: true,
      body: { playlistId, format, quality },
    }),
  createPlaylistDownload: (
    playlistId: string,
    format: string,
    quality: string,
  ) =>
    fetchApi<DownloadJobRecord>("/downloads/playlist", {
      method: "POST",
      authed: true,
      body: { playlistId, format, quality },
    }),

  downloadFileUrl: (id: string) => {
    const token = useAuthStore.getState().accessToken;
    return `${API_BASE_URL}/downloads/${id}/file?token=${encodeURIComponent(token ?? "")}`;
  },
  playlistArchiveUrl: (id: string) => {
    const token = useAuthStore.getState().accessToken;
    return `${API_BASE_URL}/downloads/${id}/archive?token=${encodeURIComponent(token ?? "")}`;
  },
};